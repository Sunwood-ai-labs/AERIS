param([Parameter(Mandatory)][string]$NativeExe,[switch]$AllowNonAdmin)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot
$nativePath=(Resolve-Path -LiteralPath $NativeExe).Path
$fixtureId=[Guid]::NewGuid().ToString('N')
$fixtureName="AERIS_Verification_$fixtureId"
$fixtureDir=Join-Path $repo "artifacts\windows-fixture-$fixtureId"
New-Item -ItemType Directory -Path $fixtureDir -Force|Out-Null
$scriptText=Get-Content -LiteralPath (Join-Path $repo 'src-tauri\src\windows_tools.ps1') -Raw
$gpuText=Get-Content -LiteralPath (Join-Path $repo 'src-tauri\src\gpu.cs') -Raw
function Invoke-Tool([string]$Operation,[object]$Request) {
    $start=[Diagnostics.ProcessStartInfo]::new()
    $start.FileName=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $start.Arguments='-NoLogo -NoProfile -NonInteractive -EncodedCommand '+[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($scriptText))
    $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
    $start.StandardOutputEncoding=[Text.UTF8Encoding]::new($false);$start.StandardErrorEncoding=[Text.UTF8Encoding]::new($false)
    $start.EnvironmentVariables['AERIS_REQUEST']=@{operation=$Operation;request=$Request}|ConvertTo-Json -Depth 6 -Compress
    $start.EnvironmentVariables['AERIS_GPU_SOURCE']=$gpuText
    $process=[Diagnostics.Process]::Start($start)
    try {$stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync();if(!$process.WaitForExit(25000)){$process.Kill();throw 'Management test timed out'}
        if($process.ExitCode){throw $stderr.Result};$parsed=$stdout.Result|ConvertFrom-Json;foreach($item in @($parsed)){Write-Output $item}
    }finally{$process.Dispose()}
}
function Assert-True([bool]$Value,[string]$Message){if(!$Value){throw $Message}}
$child=$null;$serviceCreated=$false;$runKey=$null
try {
    $childExe=Join-Path $fixtureDir 'aeris-verification-child.exe'
    Copy-Item -LiteralPath $nativePath -Destination $childExe
    foreach($dll in Get-ChildItem -LiteralPath (Split-Path $nativePath) -Filter '*.dll'){Copy-Item -LiteralPath $dll.FullName -Destination $fixtureDir}
    $child=Start-Process -FilePath $childExe -ArgumentList '--test-child' -WindowStyle Hidden -PassThru
    $startTime=[DateTimeOffset]::new($child.StartTime.ToUniversalTime()).ToUnixTimeSeconds()
    $null=Invoke-Tool 'priority' @{pid=$child.Id;startTime=$startTime;level='BelowNormal'}
    $child.Refresh();Assert-True ($child.PriorityClass -eq 'BelowNormal') 'Fixture priority was not changed'
    $rejected=$false;try{$null=Invoke-Tool 'priority' @{pid=$child.Id;startTime=$startTime+1;level='Normal'}}catch{$rejected=$true}
    Assert-True $rejected 'Stale process identity was accepted'
    $null=Invoke-Tool 'priority' @{pid=$child.Id;startTime=$startTime;level='Normal'}
    Write-Output 'Disposable process priority and stale identity checks passed'

    $runKey=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Software\Microsoft\Windows\CurrentVersion\Run')
    Assert-True ($null -eq $runKey.GetValue($fixtureName)) 'Fixture registry value already exists'
    $command='"'+(Join-Path $env:SystemRoot 'System32\cmd.exe')+'" /c exit 0'
    $runKey.SetValue($fixtureName,$command,[Microsoft.Win32.RegistryValueKind]::String)
    foreach($enabled in @($false,$true)) {
        $null=Invoke-Tool 'startup_action' @{id='user-run';name=$fixtureName;command=$command;enabled=$enabled}
        $entry=Invoke-Tool 'startup' @{} | Where-Object name -CEQ $fixtureName
        Assert-True ($entry.enabled -eq $enabled) 'Fixture startup state did not round-trip'
        Assert-True ($runKey.GetValue($fixtureName) -ceq $command) 'Startup command was changed'
    }
    Write-Output 'Disposable startup entry disable/enable round-trip passed'
    $rejected=$false;try{$null=Invoke-Tool 'service_action' @{name='RpcSs';action='stop'}}catch{$rejected=$true}
    Assert-True $rejected 'Critical service protection failed'
    Write-Output 'Critical service operation rejected without changing the service'

    $admin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if(!$admin){if(!$AllowNonAdmin){throw 'Service fixture test requires an administrator runner'};Write-Output 'Service lifecycle fixture skipped locally: runner is not elevated'}else{
        $serviceExe=Join-Path $fixtureDir 'aeris-verification-service.exe'
        Add-Type -TypeDefinition @'
using System.ServiceProcess;
public class AerisFixtureService:ServiceBase {
    public AerisFixtureService(string name){ServiceName=name;CanStop=true;AutoLog=false;}
    protected override void OnStart(string[] args){}
    protected override void OnStop(){}
    public static void Main(string[] args){ServiceBase.Run(new AerisFixtureService(args[0]));}
}
'@ -ReferencedAssemblies System.ServiceProcess -OutputAssembly $serviceExe -OutputType ConsoleApplication
        $null=New-Service -Name $fixtureName -BinaryPathName ('"'+$serviceExe+'" '+$fixtureName) -StartupType Manual
        $serviceCreated=$true
        foreach($action in @('start','restart','stop')){
            $null=Invoke-Tool 'service_action' @{name=$fixtureName;action=$action}
            $service=Get-Service -Name $fixtureName
            $expected=if($action -eq 'stop'){'Stopped'}else{'Running'}
            $service.WaitForStatus([Enum]::Parse([ServiceProcess.ServiceControllerStatus],$expected),[TimeSpan]::FromSeconds(10))
            $service.Dispose()
        }
        Write-Output 'Disposable service start/restart/stop lifecycle passed'
    }
} finally {
    if($serviceCreated){$service=Get-Service -Name $fixtureName -ErrorAction SilentlyContinue;if($service -and $service.Status -ne 'Stopped'){Stop-Service -InputObject $service};$null=& sc.exe delete $fixtureName}
    if($child){if(!$child.HasExited){$child.Kill();$null=$child.WaitForExit(10000)};$child.Dispose()}
    if($runKey){$runKey.DeleteValue($fixtureName,$false);$runKey.Dispose()}
    foreach($path in @('Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run','Software\AERIS\StartupStateBackup')){
        $key=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($path,$true)
        if($key){try{$name=if($path -like '*Backup'){'user-run:'+$fixtureName}else{$fixtureName};$key.DeleteValue($name,$false)}finally{$key.Dispose()}}
    }
}
