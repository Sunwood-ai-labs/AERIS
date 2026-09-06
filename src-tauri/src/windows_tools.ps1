$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$inputData = $env:AERIS_REQUEST | ConvertFrom-Json
Remove-Item Env:AERIS_REQUEST
$request = $inputData.request
$criticalServices = @('RpcSs','DcomLaunch','RpcEptMapper','PlugPlay','Power','EventLog','SamSs','LSM','WinDefend','BFE','MpsSvc','SecurityHealthService','WdNisSvc','Dhcp','Dnscache','nsi','Winmgmt')

function Get-StartupEntries {
    $sources = @(
        @{id='user-run'; root=[Microsoft.Win32.Registry]::CurrentUser; run='Software\Microsoft\Windows\CurrentVersion\Run'; approved='Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'; scope='Current user'},
        @{id='machine-run'; root=[Microsoft.Win32.Registry]::LocalMachine; run='Software\Microsoft\Windows\CurrentVersion\Run'; approved='Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'; scope='All users'},
        @{id='machine-run32'; root=[Microsoft.Win32.Registry]::LocalMachine; run='Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run'; approved='Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run32'; scope='All users (32-bit)'}
    )
    foreach ($source in $sources) {
        $key=$source.root.OpenSubKey($source.run); if ($null -eq $key) { continue }
        $approved=$source.root.OpenSubKey($source.approved)
        try {
            foreach ($name in $key.GetValueNames()) {
                $state=$null;if($approved){$state=$approved.GetValue($name)}
                $enabled=if($null -eq $state){$true}elseif($state -is [byte[]] -and $state.Length -ge 4){if($state[0] -in @(2,6)){$true}elseif($state[0] -in @(3,7)){$false}else{$null}}else{$null}
                [pscustomobject]@{id=$source.id;name=$name;command=[string]$key.GetValue($name);scope=$source.scope;enabled=$enabled;kind='Registry'}
            }
        } finally {$key.Dispose();if($approved){$approved.Dispose()}}
    }
    foreach ($folder in @(@{id='user-folder';path=[Environment]::GetFolderPath('Startup');scope='Current user'},@{id='machine-folder';path=[Environment]::GetFolderPath('CommonStartup');scope='All users'})) {
        if (!(Test-Path -LiteralPath $folder.path)) {continue}
        $root=if($folder.id -eq 'user-folder'){[Microsoft.Win32.Registry]::CurrentUser}else{[Microsoft.Win32.Registry]::LocalMachine}
        $approved=$root.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder')
        try {foreach($file in Get-ChildItem -LiteralPath $folder.path -File | Where-Object Name -ne 'desktop.ini') {
            $state=$null;if($approved){$state=$approved.GetValue($file.Name)}
            $enabled=if($null -eq $state){$true}elseif($state -is [byte[]] -and $state.Length -ge 4){if($state[0] -in @(2,6)){$true}elseif($state[0] -in @(3,7)){$false}else{$null}}else{$null}
            [pscustomobject]@{id=$folder.id;name=$file.Name;command=$file.FullName;scope=$folder.scope;enabled=$enabled;kind='Startup folder'}
        }} finally {if($approved){$approved.Dispose()}}
    }
}

try {
    $result = switch ($inputData.operation) {
        'sessions' {
            Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class AerisSessions {
    [StructLayout(LayoutKind.Sequential)] struct Session { public int Id; public IntPtr Station; public int State; }
    [DllImport("wtsapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool WTSEnumerateSessions(IntPtr server,int reserved,int version,out IntPtr entries,out int count);
    [DllImport("wtsapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool WTSQuerySessionInformation(IntPtr server,int id,int info,out IntPtr value,out int size);
    [DllImport("wtsapi32.dll")] static extern void WTSFreeMemory(IntPtr memory);
    static string Read(int id,int info) { IntPtr value;int size;if(!WTSQuerySessionInformation(IntPtr.Zero,id,info,out value,out size))return "";try{return Marshal.PtrToStringUni(value)??"";}finally{WTSFreeMemory(value);} }
    public static object[] List() { IntPtr entries;int count;if(!WTSEnumerateSessions(IntPtr.Zero,0,1,out entries,out count))throw new System.ComponentModel.Win32Exception();
        var rows=new List<object>();try{int size=Marshal.SizeOf(typeof(Session));for(int i=0;i<count;i++){var s=(Session)Marshal.PtrToStructure(IntPtr.Add(entries,i*size),typeof(Session));string user=Read(s.Id,5);if(user.Length>0)rows.Add(new {id=s.Id,user=user,domain=Read(s.Id,7),station=Marshal.PtrToStringUni(s.Station),state=s.State});}}finally{WTSFreeMemory(entries);}return rows.ToArray();
    }
}
'@
            @([AerisSessions]::List())
        }
        'services' {
            @(Get-CimInstance Win32_Service -OperationTimeoutSec 10 | ForEach-Object { [pscustomobject]@{name=$_.Name;displayName=$_.DisplayName;state=$_.State;pid=$_.ProcessId;startMode=$_.StartMode;protected=($_.Name -in $criticalServices)} })
        }
        'service_action' {
            if($request.name -in $criticalServices){throw 'This system service is protected.'}
            if($request.action -notin @('start','stop','restart')){throw 'Unsupported service action.'}
            $service=Get-Service | Where-Object Name -CEQ $request.name
            if($null -eq $service){throw 'The service no longer exists.'}
            switch($request.action){
                'start' {Start-Service -InputObject $service}
                'stop' {Stop-Service -InputObject $service}
                'restart' {Restart-Service -InputObject $service}
            }
            @{ok=$true}
        }
        'startup' { @(Get-StartupEntries) }
        'startup_action' {
            $entry=Get-StartupEntries | Where-Object { $_.id -ceq $request.id -and $_.name -ceq $request.name }
            if($null -eq $entry -or $null -eq $entry.enabled){throw 'The startup entry is missing or its state is unsupported.'}
            if($entry.command -cne $request.command){throw 'The startup entry changed. Refresh and select it again.'}
            if($request.enabled -isnot [bool]){throw 'Invalid startup state.'}
            $root=if($request.id -in @('user-run','user-folder')){[Microsoft.Win32.Registry]::CurrentUser}else{[Microsoft.Win32.Registry]::LocalMachine}
            $suffix=switch($request.id){'user-run'{'Run'}'machine-run'{'Run'}'machine-run32'{'Run32'}'user-folder'{'StartupFolder'}'machine-folder'{'StartupFolder'}default{throw 'Unsupported startup source.'}}
            $key=$root.CreateSubKey("Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\$suffix")
            try {
                # StartupApproved's known states are 2/6 enabled and 3/7 disabled.
                # Keep the original launch entry intact; save the previous state for recovery.
                $previous=$key.GetValue($request.name)
                $backup=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Software\AERIS\StartupStateBackup')
                try {$backup.SetValue("$($request.id):$($request.name)",(@{exists=($null -ne $previous);data=if($previous){[Convert]::ToBase64String($previous)}else{''}}|ConvertTo-Json -Compress))}finally{$backup.Dispose()}
                $bytes=New-Object byte[] 12
                if($request.enabled){$bytes[0]=2}else{$bytes[0]=3;[BitConverter]::GetBytes([DateTime]::UtcNow.ToFileTimeUtc()).CopyTo($bytes,4)}
                $key.SetValue($request.name,$bytes,[Microsoft.Win32.RegistryValueKind]::Binary)
            } finally {$key.Dispose()}
            @{ok=$true}
        }
        'gpus' {
            $devices=@(Get-CimInstance Win32_VideoController -OperationTimeoutSec 10 | Select-Object Name,DriverVersion,AdapterRAM)
            $engines=@();$memory=@();$counterError=$null
            try {Add-Type -TypeDefinition $env:AERIS_GPU_SOURCE; $counters=[AerisGpu]::Sample();$engines=$counters.engines;$memory=$counters.memory}catch{$counterError=$_.Exception.Message}
            @{devices=$devices;engines=$engines;memory=$memory;error=$counterError}
        }
        'priority' {
            if($request.level -notin @('Idle','BelowNormal','Normal','AboveNormal','High')){throw 'Unsupported priority.'}
            $process=[Diagnostics.Process]::GetProcessById([int]$request.pid)
            try {
                $null=$process.Handle
                $epoch=[DateTimeOffset]::new($process.StartTime.ToUniversalTime()).ToUnixTimeSeconds()
                if($epoch -ne [long]$request.startTime){throw 'The process changed. Select it again.'}
                if($process.Id -le 4 -or $process.ProcessName -match '^(aeris|system|registry|smss|csrss|wininit|winlogon|services|lsass|svchost|dwm|MsMpEng)$'){throw 'This process is protected.'}
                $process.PriorityClass=[Enum]::Parse([Diagnostics.ProcessPriorityClass],[string]$request.level)
            } finally {$process.Dispose()}
            @{ok=$true}
        }
        default {throw 'Unsupported operation.'}
    }
    ConvertTo-Json -InputObject $result -Depth 8 -Compress
} catch { [Console]::Error.WriteLine($_.Exception.Message);exit 1 }
