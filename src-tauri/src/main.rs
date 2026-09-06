#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

mod telemetry;
mod network_owners;
mod gpu;
mod actions;
mod windows_tools;
use serde::{Deserialize, Serialize};
use std::{collections::{HashMap, VecDeque}, fs, path::PathBuf, sync::{Arc, Mutex}, thread, time::{Duration, Instant, SystemTime, UNIX_EPOCH}};
use sysinfo::{Disks, Users, Networks, Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
use tauri::{Emitter, Manager, State, WebviewWindow, WebviewWindowBuilder, WebviewUrl};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Settings { interval: u64, pinned: bool, mini: bool, wallpaper: String, wallpaper_interval: u64, glass_opacity: u8, image_opacity: u8 }
impl Default for Settings { fn default() -> Self { Self { interval: 2, pinned: true, mini: false, wallpaper: "random".into(), wallpaper_interval: 30, glass_opacity: 70, image_opacity: 24 } } }
impl Settings {
    fn valid(&self) -> bool {
        [1,2,5].contains(&self.interval) && [15,30,60,300].contains(&self.wallpaper_interval)
            && ["random","none","aurora","glass","nebula"].contains(&self.wallpaper.as_str())
            && (35..=90).contains(&self.glass_opacity) && self.image_opacity<=60
    }
}
#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct Sample { time: u64, cpu: f32, memory: f64, download: f64, upload: f64 }
#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct ProcessRow { pid: u32, name: String, cpu: f32, memory: u64, start_time: u64, path: Option<String>, protected: bool, parent: Option<u32>, user: Option<String>, status: String, read: f64, write: f64, cpu_time: u64, command: Vec<String> }
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
    sample: Sample, history: Vec<Sample>, processes: Vec<ProcessRow>, total_memory: u64, used_memory: u64,
    cpu_name: String, cores: usize, uptime: u64, host: String, os: String, paused: bool, ready: bool,
    settings: Settings, error: Option<String>, performance: telemetry::Performance,
}
impl Default for Snapshot {
    fn default() -> Self { Self { sample: Sample::default(), history: vec![], processes: vec![], total_memory: 0, used_memory: 0,
        cpu_name: String::new(), cores: 0, uptime: 0, host: System::host_name().unwrap_or_default(), os: System::long_os_version().unwrap_or_else(|| std::env::consts::OS.into()),
        paused: false, ready: false, settings: Settings::default(), error: None, performance: telemetry::Performance::default() } }
}
struct Shared { snapshot: Snapshot, settings: Settings, paused: bool, force: bool, gpu_requested: bool, settings_path: PathBuf }
type SharedState = Arc<Mutex<Shared>>;

fn protected(pid: u32, name: &str) -> bool {
    pid <= 4 || pid == std::process::id() || matches!(name.to_ascii_lowercase().as_str(),
        "system" | "registry" | "secure system" | "memory compression" | "smss.exe" | "csrss.exe" | "wininit.exe" | "winlogon.exe" | "services.exe" | "lsass.exe" | "svchost.exe" | "fontdrvhost.exe" | "dwm.exe"
        | "launchd" | "kernel_task" | "windowserver" | "loginwindow" | "init" | "systemd" | "kthreadd" | "xorg" | "xwayland" | "gnome-shell" | "kwin_wayland" | "kwin_x11")
}
fn loopback(name: &str) -> bool { let name=name.to_ascii_lowercase(); name=="lo" || name=="lo0" || name.contains("loopback") }
fn timestamp() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64 }
struct Monitor { system: System, networks: Networks, disks: Disks, users: Users, last: Instant, history: VecDeque<Sample>, primed: bool, gpu: gpu::Monitor, gpu_active: bool }
impl Monitor {
    fn new() -> Self {
        let mut system = System::new();
        system.refresh_cpu_all();
        system.refresh_memory();
        system.refresh_processes_specifics(ProcessesToUpdate::All, true, process_refresh());
        Self { system, networks: Networks::new_with_refreshed_list(), disks: Disks::new_with_refreshed_list(), users: Users::new_with_refreshed_list(), last: Instant::now(), history: VecDeque::new(), primed: false, gpu: gpu::Monitor::default(), gpu_active: false }
    }
    fn sample(&mut self, settings: Settings) -> Snapshot {
        self.system.refresh_cpu_all();
        self.disks.refresh(true);
        self.system.refresh_memory();
        self.system.refresh_processes_specifics(ProcessesToUpdate::All, true, process_refresh());
        self.networks.refresh(true);
        let elapsed = self.last.elapsed().as_secs_f64().max(0.001);
        self.last = Instant::now();
        let mut download = 0.; let mut upload = 0.;
        for (name, network) in &self.networks {
            if !loopback(name) { download += network.received() as f64 / elapsed; upload += network.transmitted() as f64 / elapsed; }
        }
        let cores = self.system.cpus().len().max(1);
        let total = self.system.total_memory();
        let used = self.system.used_memory();
        let sample = Sample { time: timestamp(), cpu: self.system.global_cpu_usage().clamp(0.,100.), memory: if total>0 { used as f64 / total as f64 * 100. } else { 0. }, download, upload };
        self.history.push_back(sample.clone());
        while self.history.front().is_some_and(|s| s.time < sample.time.saturating_sub(60000)) { self.history.pop_front(); }
        let mut processes: Vec<ProcessRow> = self.system.processes().iter().filter(|(pid,_)| pid.as_u32()!=0).map(|(pid,p)| {
            let name = p.name().to_string_lossy().to_string();
            ProcessRow { pid: pid.as_u32(), cpu: (p.cpu_usage() / cores as f32).clamp(0.,100.), memory: p.memory(), start_time: p.start_time(), path: p.exe().map(|x| x.to_string_lossy().into_owned()), protected: protected(pid.as_u32(), &name), parent: p.parent().map(|x|x.as_u32()), user: p.user_id().and_then(|id|self.users.get_user_by_id(id)).map(|u|u.name().into()), status: p.status().to_string(), read: p.disk_usage().read_bytes as f64/elapsed, write: p.disk_usage().written_bytes as f64/elapsed, cpu_time: p.accumulated_cpu_time(), command: p.cmd().iter().map(|s|s.to_string_lossy().into_owned()).collect(), name }
        }).collect();
        processes.sort_by(|a,b| b.cpu.total_cmp(&a.cpu).then(b.memory.cmp(&a.memory)));
        self.primed = true;
        let mut performance=telemetry::sample(&self.system,&self.disks,&self.networks,elapsed);
        performance.gpu=if self.gpu_active{Some(self.gpu.sample())}else{self.gpu.reset();None};
        Snapshot { sample, history: self.history.iter().cloned().collect(), processes, total_memory: total, used_memory: used,
            cpu_name: self.system.cpus().first().map(|x| x.brand().trim().to_string()).unwrap_or_default(), cores, uptime: System::uptime(),
            host: System::host_name().unwrap_or_default(), os: System::long_os_version().unwrap_or_default(), paused: false, ready: true, settings, error: None, performance }
    }
}
fn process_refresh() -> ProcessRefreshKind { ProcessRefreshKind::nothing().with_cpu().with_memory().with_disk_usage().with_user(UpdateKind::OnlyIfNotSet).with_cmd(UpdateKind::OnlyIfNotSet).with_exe(UpdateKind::OnlyIfNotSet) }

#[tauri::command]
fn set_gpu_active(window: WebviewWindow,state:State<SharedState>,active:bool)->Result<(),String>{if window.label()!="main"{return Err("メイン画面専用です".into());}let mut s=state.lock().map_err(|e|e.to_string())?;s.gpu_requested=active;s.force=true;Ok(())}
#[tauri::command]
fn get_snapshot(state: State<SharedState>) -> Result<Snapshot, String> {
    let s=state.lock().map_err(|e|e.to_string())?;
    let mut result=s.snapshot.clone(); result.settings=s.settings.clone(); result.paused=s.paused; Ok(result)
}
fn broadcast(app: &tauri::AppHandle, state: &SharedState) {
    if let Ok(s)=state.lock() {
        let mut snap=s.snapshot.clone(); snap.settings=s.settings.clone(); snap.paused=s.paused;
        for window in app.webview_windows().values() { if window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false) { let _=window.emit("snapshot", &snap); } }
    }
}
#[tauri::command]
fn set_paused(app: tauri::AppHandle, state: State<SharedState>, paused: bool) -> Result<(),String> {
    { let mut s=state.lock().map_err(|e|e.to_string())?; s.paused=paused; if !paused { s.force=true; } }
    broadcast(&app, &state); Ok(())
}
#[tauri::command]
fn refresh_now(state: State<SharedState>) -> Result<(),String> { state.lock().map_err(|e|e.to_string())?.force=true; Ok(()) }
#[tauri::command]
fn save_settings(app: tauri::AppHandle, state: State<SharedState>, settings: Settings) -> Result<(),String> {
    if !settings.valid() { return Err("設定値が範囲外です".into()); }
    let (mini_changed,pin_changed)={ let mut s=state.lock().map_err(|e|e.to_string())?;
      let json=serde_json::to_vec_pretty(&settings).map_err(|e|e.to_string())?;
      fs::write(&s.settings_path, json).map_err(|e| format!("設定を保存できません: {e}"))?;
      let changed=(s.settings.mini!=settings.mini,s.settings.pinned!=settings.pinned);
      s.settings=settings.clone();
      changed
    };
    if let Some(w)=app.get_webview_window("gadget") {
        if pin_changed { w.set_always_on_top(settings.pinned).map_err(|e|e.to_string())?; }
        if mini_changed {
        let old_position=w.outer_position().map_err(|e|e.to_string())?;
        let old_outer=w.outer_size().map_err(|e|e.to_string())?;
        let old_inner=w.inner_size().map_err(|e|e.to_string())?;
        let scale=w.scale_factor().unwrap_or(1.);
        let width=if settings.mini {560.} else {340.}; let height=if settings.mini {76.} else {740.};
        w.set_min_size(None::<tauri::LogicalSize<f64>>).map_err(|e|e.to_string())?;
        w.set_max_size(None::<tauri::LogicalSize<f64>>).map_err(|e|e.to_string())?;
        w.set_size(tauri::LogicalSize::new(width,height)).map_err(|e|e.to_string())?;
        w.set_min_size(Some(tauri::LogicalSize::new(width,height))).map_err(|e|e.to_string())?;
        w.set_max_size(Some(tauri::LogicalSize::new(width,height))).map_err(|e|e.to_string())?;
        // Keep the right edge anchored when expanding near a screen edge.
        // Account for the native frame and physical monitor coordinates at any DPI.
        let outer_width=(width*scale).round() as i32 + old_outer.width.saturating_sub(old_inner.width) as i32;
        let outer_height=(height*scale).round() as i32 + old_outer.height.saturating_sub(old_inner.height) as i32;
        if let Ok(Some(monitor))=w.current_monitor() {
            let origin=monitor.position(); let size=monitor.size();
            let x=(old_position.x+old_outer.width as i32-outer_width).clamp(origin.x,(origin.x+size.width as i32-outer_width).max(origin.x));
            let y=old_position.y.clamp(origin.y,(origin.y+size.height as i32-outer_height-48).max(origin.y));
            w.set_position(tauri::PhysicalPosition::new(x,y)).map_err(|e|e.to_string())?;
        }
        }
    }
    broadcast(&app,&state); Ok(())
}
#[tauri::command]
async fn show_gadget(app: tauri::AppHandle, state: State<'_, SharedState>) -> Result<(), String> {
    if let Some(w)=app.get_webview_window("gadget") { w.show().map_err(|e|e.to_string())?; w.set_focus().map_err(|e|e.to_string())?; return Ok(()); }
    let settings=state.lock().map_err(|e|e.to_string())?.settings.clone();
    let w=WebviewWindowBuilder::new(&app, "gadget", WebviewUrl::App("index.html?view=gadget".into()))
        .title("AERIS — ガジェット").inner_size(if settings.mini {560.} else {340.}, if settings.mini {76.} else {740.})
        // Fixed min/max retains the modern frame while avoiding tao's Windows
        // white-border bug with resizable(false) + decorations(false).
        .resizable(true).maximizable(false)
        .min_inner_size(if settings.mini {560.} else {340.}, if settings.mini {76.} else {740.})
        .max_inner_size(if settings.mini {560.} else {340.}, if settings.mini {76.} else {740.})
        .decorations(false).transparent(true).theme(Some(tauri::Theme::Dark)).skip_taskbar(true).always_on_top(settings.pinned)
        .background_color(tauri::window::Color(0,0,0,0)).build().map_err(|e|e.to_string())?;
    if let Ok(Some(m))=w.current_monitor() {
        let scale=m.scale_factor(); let size=m.size(); let pos=m.position();
        let width=if settings.mini {560.} else {340.};
        let height=if settings.mini {76.} else {740.};
        let top=60_f64.min((size.height as f64/scale-height-48.).max(0.));
        let _=w.set_position(tauri::LogicalPosition::new((pos.x as f64 + size.width as f64)/scale-width-28., pos.y as f64/scale+top));
    }
    Ok(())
}
fn reveal_main(app: &tauri::AppHandle) { if let Some(w)=app.get_webview_window("main") { let _=w.show(); let _=w.unminimize(); let _=w.set_focus(); } }
#[tauri::command]
fn show_main(app: tauri::AppHandle, settings: Option<bool>) { reveal_main(&app); if settings.unwrap_or(false) { let _=app.emit_to("main","navigate","settings"); } }
#[tauri::command]
fn hide_gadget(window: WebviewWindow) -> Result<(),String> { if window.label()=="gadget" { window.hide().map_err(|e|e.to_string()) } else { Err("ガジェット専用の操作です".into()) } }
#[tauri::command]
fn quit_app(app: tauri::AppHandle) { app.exit(0); }

// Reduce hidden renderer memory without suspending JavaScript or IPC delivery.
// This is a best-effort WebView2 hint; older runtimes simply keep normal behavior.
#[cfg(target_os = "windows")]
fn set_webview_memory(window: &WebviewWindow, active: bool) {
    let _=window.with_webview(move |webview| {
        use windows::core::Interface;
        use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL};
        unsafe {
            if let Ok(core)=webview.controller().CoreWebView2() {
                if let Ok(memory)=core.cast::<ICoreWebView2_19>() {
                    let _=memory.SetMemoryUsageTargetLevel(if active { COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL } else { COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW });
                }
            }
        }
    });
}
#[cfg(not(target_os = "windows"))]
fn set_webview_memory(_window: &WebviewWindow, _active: bool) {}

fn terminate(pid: u32, start_time: u64) -> Result<(), String> {
    if pid<=4 || pid==std::process::id() { return Err("このプロセスは保護されています".into()); }
    let mut system=System::new();
    system.refresh_processes_specifics(ProcessesToUpdate::Some(&[Pid::from_u32(pid)]),true,process_refresh());
    let p=system.process(Pid::from_u32(pid)).ok_or("プロセスはすでに終了しています")?;
    if p.start_time()!=start_time { return Err("プロセスが入れ替わりました。一覧から選び直してください".into()); }
    if protected(pid,&p.name().to_string_lossy()) { return Err("OSの重要なプロセスは終了できません".into()); }
    if !p.kill() { return Err("終了できませんでした。権限が不足しているか、保護されたプロセスです".into()); }
    Ok(())
}
#[tauri::command]
async fn end_process(state: State<'_, SharedState>, pid: u32, start_time: u64) -> Result<(),String> {
    let result=tauri::async_runtime::spawn_blocking(move || terminate(pid,start_time)).await.map_err(|e|e.to_string())?;
    state.lock().map_err(|e|e.to_string())?.force=true; result
}

fn main() {
    let args: Vec<String>=std::env::args().collect();
    if let Some(i)=args.iter().position(|x|x=="--test-arguments") {
        fs::write(args.get(i+1).expect("argument fixture output"),serde_json::to_vec(&args[i+2..]).unwrap()).unwrap();return;
    }
    if args.iter().any(|x| x=="--test-parent") { let _child=std::process::Command::new(std::env::current_exe().unwrap()).arg("--test-child").spawn().unwrap();loop {thread::sleep(Duration::from_millis(100));} }
    if args.iter().any(|x| x=="--test-child") { loop { std::hint::black_box((0..10000u64).sum::<u64>()); thread::sleep(Duration::from_millis(10)); } }
    if let Some(i)=args.iter().position(|x| x=="--self-test") {
        let output=args.get(i+1).expect("self-test requires an output path");
        let mut monitor=Monitor::new(); thread::sleep(Duration::from_millis(1200));
        monitor.gpu_active=args.iter().any(|a|a=="--gpu");let first=monitor.sample(Settings::default()); thread::sleep(Duration::from_millis(1200)); let snapshot=monitor.sample(Settings::default());
        assert!(first.total_memory>0 && snapshot.processes.len()>0 && snapshot.sample.cpu>=0. && snapshot.sample.cpu<=100.);
        assert!(snapshot.processes.iter().any(|p|p.pid==std::process::id()));
        assert_eq!(snapshot.performance.cpus.len(),snapshot.cores);
        assert!(snapshot.performance.cpus.iter().all(|c| c.usage.is_finite() && (0.0..=100.0).contains(&c.usage)));
        assert!(terminate(std::process::id(),0).is_err());
        let argument_output=std::env::temp_dir().join(format!("aeris-arguments-{}-{}.json",std::process::id(),snapshot.sample.time));
        let expected_args=vec!["space inside".to_string(),"日本語".into(),"\"quoted\"".into(),"$(must-stay-literal); & |".into(),String::new()];
        let mut launch_args=vec!["--test-arguments".into(),argument_output.to_string_lossy().into_owned()];launch_args.extend(expected_args.clone());
        actions::spawn(&std::env::current_exe().unwrap().to_string_lossy(),&launch_args).expect("new task launches fixture");
        let deadline=Instant::now();
        let actual_args=loop {
            if let Ok(bytes)=fs::read(&argument_output){if let Ok(value)=serde_json::from_slice::<Vec<String>>(&bytes){break value;}}
            assert!(deadline.elapsed()<Duration::from_secs(10),"new-task fixture did not return");thread::sleep(Duration::from_millis(50));
        };
        let _=fs::remove_file(&argument_output);assert_eq!(actual_args,expected_args,"arguments must reach the executable literally");
        let mut child=std::process::Command::new(std::env::current_exe().unwrap()).arg("--test-child").spawn().unwrap();
        thread::sleep(Duration::from_millis(500)); let probe=monitor.sample(Settings::default());
        let row=probe.processes.iter().find(|p|p.pid==child.id()).expect("test child detected");
        assert!(terminate(row.pid,row.start_time+1).is_err());
        terminate(row.pid,row.start_time).expect("terminate owned disposable child");
        child.wait().unwrap();
        let mut parent=std::process::Command::new(std::env::current_exe().unwrap()).arg("--test-parent").spawn().unwrap();
        thread::sleep(Duration::from_millis(800));let tree=monitor.sample(Settings::default());
        let root=tree.processes.iter().find(|p|p.pid==parent.id()).unwrap();
        let descendants=actions::descendants(root.pid,&tree.processes);
        if descendants.len()<2 {let _=parent.kill();let _=parent.wait();panic!("test descendant not detected");}
        let ended=actions::terminate_tree(root.pid,root.start_time);
        // Ensure all owned fixtures are cleaned even when the operation fails.
        for (pid,start) in &descendants {let _=terminate(*pid,*start);}let _=parent.wait();
        ended.expect("terminate owned process tree");
        let remaining=monitor.sample(Settings::default());
        assert!(descendants.iter().all(|(pid,start)|!remaining.processes.iter().any(|p|p.pid==*pid&&p.start_time==*start)));
        fs::write(output,serde_json::to_vec_pretty(&snapshot).unwrap()).unwrap(); return;
    }
    tauri::Builder::default()
        .setup(|app| {
            let folder=app.path().app_config_dir()?; fs::create_dir_all(&folder)?;
            let settings_path=folder.join("settings.json");
            // Import preferences from the local prototype once, keeping the
            // original file intact. New AERIS installs use their own identity.
            if !settings_path.exists() {
                if let Some(parent)=folder.parent() {
                    let legacy=parent.join("dev.local.pulse-task-manager").join("settings.json");
                    if let Some(settings)=fs::read(legacy).ok().and_then(|bytes|serde_json::from_slice::<Settings>(&bytes).ok()).filter(Settings::valid) {
                        fs::write(&settings_path,serde_json::to_vec_pretty(&settings)?)?;
                    }
                }
            }
            let settings: Settings=fs::read(&settings_path).ok().and_then(|b|serde_json::from_slice(&b).ok()).filter(Settings::valid).unwrap_or_default();
            let state: SharedState=Arc::new(Mutex::new(Shared { snapshot: Snapshot::default(), settings, paused: false, force: true, gpu_requested: false, settings_path }));
            app.manage(state.clone());
            use tauri::menu::{Menu, MenuItem};
            let menu=Menu::with_items(app,&[
                &MenuItem::with_id(app,"open","メイン画面を開く",true,None::<&str>)?,
                &MenuItem::with_id(app,"gadget","ガジェットを表示",true,None::<&str>)?,
                &MenuItem::with_id(app,"pause","計測を一時停止 / 再開",true,None::<&str>)?,
                &MenuItem::with_id(app,"quit","AERISを終了",true,None::<&str>)?,
            ])?;
            let icon=tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;
            tauri::tray::TrayIconBuilder::new().icon(icon).tooltip("AERIS — システムモニター").menu(&menu).show_menu_on_left_click(false)
                .on_tray_icon_event(|tray,event| { if matches!(event,tauri::tray::TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, button_state: tauri::tray::MouseButtonState::Up, .. }) { reveal_main(tray.app_handle()); } })
                .on_menu_event(|app,event| match event.id.as_ref() {
                    "open" => reveal_main(app),
                    "quit" => app.exit(0),
                    "pause" => { let state=app.state::<SharedState>(); if let Ok(mut s)=state.lock() { s.paused=!s.paused; s.force=!s.paused; } broadcast(app,&state); },
                    "gadget" => { let app=app.clone(); tauri::async_runtime::spawn(async move { let state=app.state::<SharedState>(); let _=show_gadget(app.clone(),state).await; }); },
                    _=>()
                }).build(app)?;
            let handle=app.handle().clone();
            thread::spawn(move || {
                let mut monitor=Monitor::new(); let mut last=Instant::now();
                let mut window_activity: HashMap<String,bool>=HashMap::new();
                thread::sleep(Duration::from_millis(1000));
                loop {
                    thread::sleep(Duration::from_millis(250));
                    let windows=handle.webview_windows();
                    let mut visible=false;
                    for (label,window) in &windows {
                        let active=window.is_visible().unwrap_or(false)&&!window.is_minimized().unwrap_or(false);
                        visible |= active;
                        if window_activity.get(label)!=Some(&active) { set_webview_memory(window,active); let _=window.emit("window-activity",active); window_activity.insert(label.clone(),active); }
                    }
                    let (settings,gpu_active)={ let mut s=match state.lock(){Ok(s)=>s,Err(_)=>break};
                        if !s.force && (s.paused || !visible || last.elapsed()<Duration::from_secs(s.settings.interval)) { continue; }
                        s.force=false; (s.settings.clone(),s.gpu_requested && windows.get("main").is_some_and(|w|w.is_visible().unwrap_or(false)&&!w.is_minimized().unwrap_or(false)))
                    };
                    monitor.gpu_active=gpu_active;let snapshot=monitor.sample(settings); last=Instant::now();
                    if let Ok(mut s)=state.lock(){s.snapshot=snapshot;} broadcast(&handle,&state);
                }
            });
            Ok(())
        })
        .on_window_event(|window,event| { if let tauri::WindowEvent::CloseRequested { api, .. }=event {
            api.prevent_close();
            // Some Linux desktops have no tray extension. Keep the main window
            // reachable in the task switcher instead of hiding it completely.
            #[cfg(target_os = "linux")]
            if window.label()=="main" { let _=window.minimize(); return; }
            let _=window.hide();
        } })
        .invoke_handler(tauri::generate_handler![set_gpu_active,actions::restart_explorer,windows_tools::system_tool,actions::run_task,actions::reveal_process,actions::end_process_tree,get_snapshot,set_paused,refresh_now,save_settings,show_gadget,show_main,hide_gadget,quit_app,end_process])
        .build(tauri::generate_context!()).expect("AERIS could not start")
        .run(|_app,_event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. }=_event { reveal_main(_app); }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn blocks_critical_and_self() { assert!(protected(4,"System")); assert!(protected(99,"LSASS.EXE")); assert!(protected(std::process::id(),"anything")); assert!(!protected(100000,"chrome.exe")); }
    #[test] fn rejects_invalid_settings() {
        for i in [0,3,10,u64::MAX] { assert!(!Settings{interval:i,..Settings::default()}.valid()); }
        assert!(!Settings{wallpaper:"unknown".into(),..Settings::default()}.valid());
        assert!(!Settings{wallpaper_interval:0,..Settings::default()}.valid());
        assert!(!Settings{glass_opacity:0,..Settings::default()}.valid());
        assert!(!Settings{image_opacity:61,..Settings::default()}.valid());
    }
    #[test] fn old_settings_keep_preferences_and_gain_background_defaults() {
        let migrated:Settings=serde_json::from_str(r#"{"interval":5,"pinned":false,"mini":true}"#).unwrap();
        assert_eq!(migrated.interval,5); assert!(!migrated.pinned); assert!(migrated.mini);
        assert_eq!(migrated.wallpaper,"random"); assert_eq!(migrated.wallpaper_interval,30); assert!(migrated.valid());
        let loaded:Settings=serde_json::from_slice(&serde_json::to_vec(&migrated).unwrap()).unwrap();
        assert_eq!(loaded.glass_opacity,70); assert_eq!(loaded.image_opacity,24);
    }
    #[test] fn cannot_kill_self() { assert!(terminate(std::process::id(),0).is_err()); }
    #[test] fn protects_desktop_sessions_on_supported_platforms() {
        for name in ["launchd","WindowServer","loginwindow","systemd","gnome-shell","kwin_wayland"] { assert!(protected(99999,name)); }
        assert!(!protected(99999,"aeris-test-child"));
    }
    #[test] fn recognizes_loopback_interface_names_across_platforms() {
        for name in ["lo","lo0","Loopback Pseudo-Interface 1"] { assert!(loopback(name)); }
        for name in ["en0","eth0","wlan0"] { assert!(!loopback(name)); }
    }
}
