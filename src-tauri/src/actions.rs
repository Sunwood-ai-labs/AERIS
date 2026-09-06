use std::{path::PathBuf, process::Command};
use sysinfo::{Pid, System, ProcessesToUpdate};

pub fn target(pid:u32,start_time:u64) -> Result<PathBuf,String> {
    let mut system=System::new();
    system.refresh_processes_specifics(ProcessesToUpdate::Some(&[Pid::from_u32(pid)]),true,super::process_refresh());
    let p=system.process(Pid::from_u32(pid)).ok_or("プロセスはすでに終了しています")?;
    if p.start_time()!=start_time { return Err("プロセスが入れ替わりました。選び直してください".into()); }
    p.exe().map(|p|p.to_path_buf()).ok_or("実行ファイルの場所を取得できません".into())
}

pub fn spawn(program:&str,args:&[String]) -> Result<u32,String> {
    let program=program.trim();
    if program.is_empty() || program.contains('\0') || args.iter().any(|a|a.contains('\0')) { return Err("実行ファイルと引数を確認してください".into()); }
    if args.len()>256 || args.iter().map(|x|x.len()).sum::<usize>()>32768 {return Err("引数が長すぎます".into());}
    Command::new(program).args(args).spawn().map(|mut c| {let pid=c.id();std::thread::spawn(move||{let _=c.wait();});pid}).map_err(|e|format!("起動できません: {e}"))
}

#[tauri::command]
pub async fn run_task(program:String,args:Vec<String>) -> Result<u32,String> {
    tauri::async_runtime::spawn_blocking(move||spawn(&program,&args)).await.map_err(|e|e.to_string())?
}

#[tauri::command]
pub async fn reveal_process(pid:u32,start_time:u64) -> Result<(),String> {
    tauri::async_runtime::spawn_blocking(move|| {
        let path=target(pid,start_time)?;
        #[cfg(target_os="windows")]
        let mut command={let mut c=Command::new("explorer.exe");c.arg(format!("/select,{}",path.display()));c};
        #[cfg(target_os="macos")]
        let mut command={let mut c=Command::new("open");c.arg("-R").arg(path);c};
        #[cfg(not(any(target_os="macos",target_os="windows")))]
        let mut command={let mut c=Command::new("xdg-open");c.arg(path.parent().ok_or("親フォルダーがありません")?);c};
        command.spawn().map(|mut child|{std::thread::spawn(move||{let _=child.wait();});}).map_err(|e|e.to_string())
    }).await.map_err(|e|e.to_string())?
}

#[tauri::command]
pub async fn restart_explorer(pid:u32,start_time:u64) -> Result<(),String> {
    #[cfg(not(target_os="windows"))]
    {let _=(pid,start_time);Err("Windows専用の操作です".into())}
    #[cfg(target_os="windows")]
    tauri::async_runtime::spawn_blocking(move||{
        let path=target(pid,start_time)?;
        let expected=PathBuf::from(std::env::var_os("SystemRoot").ok_or("Windowsの場所が取得できません")?).join("explorer.exe");
        validate_explorer(&path,&expected)?;
        super::terminate(pid,start_time)?;
        spawn(&expected.to_string_lossy(),&[]).map(|_|()).map_err(|e|format!("Explorerを終了しましたが再起動に失敗しました。「新しいタスク」で explorer.exe を起動してください: {e}"))
    }).await.map_err(|e|e.to_string())?
}

#[cfg(any(target_os="windows",test))]
fn validate_explorer(path:&std::path::Path,expected:&std::path::Path)->Result<(),String>{
    if path.to_string_lossy().eq_ignore_ascii_case(&expected.to_string_lossy()){Ok(())}else{Err("Windows Explorerではありません".into())}
}

/// Children first, with a visited set to tolerate corrupt/stale parent cycles.
pub fn descendants(root:u32,rows:&[super::ProcessRow]) -> Vec<(u32,u64)> {
    fn visit(pid:u32,rows:&[super::ProcessRow],seen:&mut std::collections::HashSet<u32>,out:&mut Vec<(u32,u64)>) {
        if !seen.insert(pid) {return;}
        for p in rows.iter().filter(|p|p.parent==Some(pid)) {visit(p.pid,rows,seen,out);}
        if let Some(p)=rows.iter().find(|p|p.pid==pid) {out.push((p.pid,p.start_time));}
    }
    let mut out=vec![];visit(root,rows,&mut std::collections::HashSet::new(),&mut out);out
}

#[tauri::command]
pub async fn end_process_tree(pid:u32,start_time:u64) -> Result<(),String> {
    tauri::async_runtime::spawn_blocking(move||terminate_tree(pid,start_time)).await.map_err(|e|e.to_string())?
}
pub fn terminate_tree(pid:u32,start_time:u64) -> Result<(),String> {
        let mut monitor=super::Monitor::new();
        let snap=monitor.sample(super::Settings::default());
        let root=snap.processes.iter().find(|p|p.pid==pid).ok_or("プロセスはすでに終了しています")?;
        if root.start_time!=start_time {return Err("プロセスが入れ替わりました".into());}
        let targets=descendants(pid,&snap.processes);
        if snap.processes.iter().any(|p|p.protected&&targets.iter().any(|(id,_)|*id==p.pid)) {return Err("ツリー内に保護されたプロセスが含まれています".into());}
        let mut errors=vec![];
        for (id,start) in targets {if let Err(e)=super::terminate(id,start){errors.push(format!("PID {id}: {e}"));}}
        if errors.is_empty(){Ok(())}else{Err(errors.join("\n"))}
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn descendant_order_handles_cycles_and_excludes_unrelated_processes() {
        let row=|pid,parent| super::super::ProcessRow{pid,parent:Some(parent),start_time:pid as u64,..Default::default()};
        let rows=vec![row(10,12),row(11,10),row(12,11),row(20,99)];
        assert_eq!(descendants(10,&rows),vec![(12,12),(11,11),(10,10)]);
    }
    #[test] fn invalid_launch_does_not_spawn() {assert!(spawn("",&[]).is_err());assert!(spawn("app",&["bad\0arg".into()]).is_err());}
    #[test] fn stale_process_identity_cannot_reveal_path() {assert!(target(std::process::id(),u64::MAX).is_err());}
    #[test] fn explorer_restart_requires_the_windows_executable() {
        let expected=std::path::Path::new("C:\\Windows\\explorer.exe");
        assert!(validate_explorer(std::path::Path::new("c:\\WINDOWS\\Explorer.exe"),expected).is_ok());
        assert!(validate_explorer(std::path::Path::new("C:\\Apps\\explorer.exe"),expected).is_err());
        assert!(validate_explorer(std::path::Path::new("C:\\Windows\\notepad.exe"),expected).is_err());
    }
}
