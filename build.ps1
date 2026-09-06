param([switch]$SkipTests)
$ErrorActionPreference = 'Stop'
$projectDirectory = $PSScriptRoot
$cargoDirectory = Join-Path $env:USERPROFILE '.cargo\bin'
$env:PATH = "$cargoDirectory;$env:PATH"
$previousToolchain = $env:RUSTUP_TOOLCHAIN
$env:RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-gnu'
Push-Location $projectDirectory
try {
    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { throw 'Rust is required. Install rustup from https://rustup.rs/' }
    if (-not (Get-Command gcc -ErrorAction SilentlyContinue)) { throw 'MinGW-w64 is required for this GNU toolchain. Install WinLibs or use an MSVC Rust toolchain with C++ Build Tools.' }
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { throw 'pnpm is required. See README.md for the pinned version and setup.' }
    pnpm install --frozen-lockfile
    if ($LASTEXITCODE) { throw 'pnpm install failed' }
    if (-not $SkipTests) { pnpm test; if ($LASTEXITCODE) { throw 'Frontend tests failed' } }
    pnpm run release
    if ($LASTEXITCODE) { throw 'Native build failed' }
    $releaseDirectory = Join-Path $projectDirectory 'release\AERIS'
    New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
    Copy-Item -LiteralPath 'src-tauri\target\release\aeris.exe' -Destination (Join-Path $releaseDirectory 'AERIS.exe') -Force
    $loader = 'src-tauri\target\release\WebView2Loader.dll'
    if (Test-Path $loader) { Copy-Item -LiteralPath $loader -Destination $releaseDirectory -Force }
    # Copy MinGW runtime DLLs only if the executable actually imports them.
    if (Get-Command objdump -ErrorAction SilentlyContinue) {
        $imports = & objdump -p (Join-Path $releaseDirectory 'AERIS.exe')
        $gccDirectory = Split-Path (Get-Command gcc).Source
        foreach ($dll in @('libgcc_s_seh-1.dll', 'libstdc++-6.dll', 'libwinpthread-1.dll')) {
            if ($imports -match [regex]::Escape($dll)) { Copy-Item -LiteralPath (Join-Path $gccDirectory $dll) -Destination $releaseDirectory -Force }
        }
    }
    Copy-Item -LiteralPath 'README.md','README.ja.md','LICENSE','THIRD_PARTY.md' -Destination $releaseDirectory -Force
    Copy-Item -LiteralPath 'docs' -Destination $releaseDirectory -Recurse -Force
    Copy-Item -LiteralPath 'brand' -Destination $releaseDirectory -Recurse -Force
    if (-not $SkipTests) {
        $selfTestOutput = Join-Path $projectDirectory 'artifacts\native-self-test.json'
        New-Item -ItemType Directory -Path (Split-Path $selfTestOutput) -Force | Out-Null
        $testProcess = Start-Process -FilePath (Join-Path $releaseDirectory 'AERIS.exe') -ArgumentList '--self-test',$selfTestOutput -WindowStyle Hidden -PassThru -Wait
        if ($testProcess.ExitCode -ne 0) { throw "Native self-test failed: $($testProcess.ExitCode)" }
    }
    $zipPath = Join-Path $projectDirectory 'release\AERIS-Windows-x64.zip'
    Compress-Archive -Path $releaseDirectory -DestinationPath $zipPath -Force
    Get-Item (Join-Path $releaseDirectory 'AERIS.exe'), $zipPath | Select-Object FullName,Length
} finally { $env:RUSTUP_TOOLCHAIN=$previousToolchain; Pop-Location }
