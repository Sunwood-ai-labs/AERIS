param([Parameter(Mandatory)][int]$RootProcessId, [string]$ModeLabel='main', [int]$Seconds=20)
$ErrorActionPreference='Stop'
function Get-AERISTree {
    $allProcesses=Get-CimInstance Win32_Process
    $processIds=[System.Collections.Generic.HashSet[int]]::new()
    [void]$processIds.Add($RootProcessId)
    do {
        $previousCount=$processIds.Count
        foreach($item in $allProcesses){if($processIds.Contains([int]$item.ParentProcessId)){[void]$processIds.Add([int]$item.ProcessId)}}
    } while($processIds.Count -gt $previousCount)
    @(Get-Process -Id @($processIds) -ErrorAction SilentlyContinue)
}
$before=@{}
Get-AERISTree | ForEach-Object {$before[$_.Id]=$_.CPU}
$watch=[Diagnostics.Stopwatch]::StartNew()
Start-Sleep -Seconds $Seconds
$after=Get-AERISTree
$duration=$watch.Elapsed.TotalSeconds
$cpuDelta=0.0
foreach($item in $after){if($before.ContainsKey($item.Id)){$cpuDelta += [math]::Max(0,$item.CPU-$before[$item.Id])}}
$result=[pscustomobject]@{
    Mode=$ModeLabel;Timestamp=(Get-Date).ToString('o');Seconds=[math]::Round($duration,1)
    LogicalProcessors=[Environment]::ProcessorCount;ProcessCount=$after.Count
    TotalCpuPercent=[math]::Round($cpuDelta/$duration/[Environment]::ProcessorCount*100,3)
    TotalPrivateCommitMB=[math]::Round(($after | Measure-Object PrivateMemorySize64 -Sum).Sum/1MB,1)
    TotalWorkingSetMB=[math]::Round(($after | Measure-Object WorkingSet64 -Sum).Sum/1MB,1)
    HostWorkingSetMB=[math]::Round(($after | Where-Object Id -eq $RootProcessId).WorkingSet64/1MB,1)
    Note='Includes AERIS and every descendant WebView2 process. Working-set sum counts shared pages more than once. PrivateCommit is committed private virtual memory, not resident RAM.'
}
$artifactDirectory=Join-Path (Split-Path $PSScriptRoot) 'artifacts'
$result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $artifactDirectory ('performance-'+$ModeLabel+'.json')) -Encoding utf8
$result
