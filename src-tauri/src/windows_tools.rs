#[tauri::command]
pub async fn system_tool(operation:String,request:serde_json::Value) -> Result<serde_json::Value,String> {
    const OPS:&[&str]=&["services","service_action","startup","startup_action","priority","sessions"];
    if !OPS.contains(&operation.as_str()){return Err("未対応の操作です".into());}
    #[cfg(not(target_os="windows"))]
    {let _=request;Err("この管理機能はWindows専用です".into())}
    #[cfg(target_os="windows")]
    tauri::async_runtime::spawn_blocking(move||run(&operation,request)).await.map_err(|e|e.to_string())?
}

#[cfg(target_os="windows")]
fn run(operation:&str,request:serde_json::Value) -> Result<serde_json::Value,String> {
    use std::{io::Read,os::windows::process::CommandExt,process::{Command,Stdio},thread,time::{Instant,Duration}};
    let shell=std::path::PathBuf::from(std::env::var_os("SystemRoot").unwrap_or_else(||"C:\\Windows".into())).join("System32/WindowsPowerShell/v1.0/powershell.exe");
    let payload=serde_json::to_string(&serde_json::json!({"operation":operation,"request":request})).map_err(|e|e.to_string())?;
    let mut child=Command::new(shell).args(["-NoLogo","-NoProfile","-NonInteractive","-Command",include_str!("windows_tools.ps1")])
        .env("AERIS_REQUEST",payload).creation_flags(0x08000000).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e|e.to_string())?;
    let stdout=child.stdout.take().unwrap();let stderr=child.stderr.take().unwrap();
    let read=|stream:Box<dyn Read+Send>|thread::spawn(move||{let mut bytes=vec![];stream.take(4*1024*1024).read_to_end(&mut bytes).map(|_|bytes)});
    let out=read(Box::new(stdout));let err=read(Box::new(stderr));let started=Instant::now();
    let status=loop {if let Some(status)=child.try_wait().map_err(|e|e.to_string())?{break status;}if started.elapsed()>Duration::from_secs(20){let _=child.kill();let _=child.wait();return Err("Windowsからの応答がタイムアウトしました。再試行してください".into());}thread::sleep(Duration::from_millis(50));};
    let output=out.join().map_err(|_|"出力の読み込みに失敗")?.map_err(|e|e.to_string())?;
    let error=err.join().map_err(|_|"エラーの読み込みに失敗")?.map_err(|e|e.to_string())?;
    if !status.success(){return Err(String::from_utf8_lossy(&error).trim().chars().take(1500).collect());}
    serde_json::from_slice(&output).map_err(|e|format!("Windowsの応答を読み取れません: {e}"))
}

#[cfg(all(test,target_os="windows"))]
mod tests {
    #[test]
    fn native_bridge_reads_windows_inventories() {
        for (operation,field) in [("services","name"),("startup","name"),("sessions","user")] {
            let result=super::run(operation,serde_json::json!({})).expect("native Windows bridge must return JSON");
            let rows=match result {serde_json::Value::Array(rows)=>rows,serde_json::Value::Null=>vec![],row=>vec![row]};
            if operation=="services" {assert!(!rows.is_empty(),"Windows must expose services");}
            assert!(rows.iter().all(|row|row.get(field).is_some_and(|v|v.is_string())),"invalid {operation} response");
        }
    }
}
