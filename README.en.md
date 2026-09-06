<div align="center">
  <img src="docs/assets/aeris-banner.svg" alt="AERIS — A lighter view of your desktop" width="900">
  <p>A translucent Windows system monitor with a desktop gadget and compact mini-bar.</p>
  <p><a href="https://github.com/Sunwood-ai-labs/AERIS/actions/workflows/ci.yml"><img src="https://github.com/Sunwood-ai-labs/AERIS/actions/workflows/ci.yml/badge.svg" alt="CI"></a> <img src="https://img.shields.io/badge/Windows-x64-0078D4" alt="Windows x64"> <img src="https://img.shields.io/badge/Tauri-2-24C8DB" alt="Tauri 2"> <img src="https://img.shields.io/badge/license-MIT-39CFF5" alt="MIT"></p>
  <p><a href="README.md">日本語</a> · <strong>English</strong></p>
  <p><a href="https://github.com/Sunwood-ai-labs/AERIS/releases/latest"><strong>Download for Windows</strong></a></p>
</div>

## 🫧 Meet AERIS

Midnight blue, cyan accents, and a view through your desktop. Monitor CPU, memory, network traffic, uptime, and running processes through a main window, a 340 × 520 gadget, or a 560 × 76 mini-bar. The application interface is currently Japanese.

- Transparent native windows with adjustable surface opacity and fully opaque text and graphs.
- Three generated backgrounds: Aurora, Glass Waves, and Nebula. A shuffled loop changes images every 30 seconds by default, without consecutive repeats.
- Search by name or PID, sort processes, inspect details, and confirm before terminating a process.
- Shared Rust sampling at 1, 2, or 5 seconds. Periodic sampling stops when all windows are hidden or minimized.
- Runs locally without an account or external service. AERIS does not collect or send usage telemetry.

## 📦 Run

Download `AERIS-Windows-x64.zip` from [Releases](https://github.com/Sunwood-ai-labs/AERIS/releases/latest), extract the entire folder, then run `AERIS/AERIS.exe`. Keep `WebView2Loader.dll` beside the executable.

Requires Windows x64 and [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/). Verified on Windows 11 x64.

## 🎛️ Controls

| Control | Action |
|---|---|
| 概要 / プロセス | Overview / process list |
| ガジェット表示 | Open the gadget; pin for always-on-top, minus for mini-bar |
| 設定 → 透ける背景 | Random loop, fixed image, image off, timing, panel/image opacity |
| Close | Hide to tray; closing the gadget hides only the gadget |
| Tray left-click | Restore the main window |
| AERISを終了 | Quit from settings or the tray context menu |

Keyboard shortcuts: `Ctrl+F` search, `F5` refresh, `Esc` close a dialog or clear search.

Preferences persist in the user's application settings directory. Defaults: 70% panel opacity, 24% image opacity. Background intervals: 15 seconds, 30 seconds, 1 minute, or 5 minutes. Appearance preferences are shared, while each window shuffles independently. Automatic Windows startup is not registered.

## ⚡ Resource use

AERIS uses Tauri 2, Rust, a small TypeScript frontend, and the system WebView2 runtime. It does not bundle a separate Chromium distribution or install a background service. One sampler serves all windows; the process table renders around the visible rows.

Hidden/minimized windows receive a WebView2 memory-saving hint and stop background rotation timers. Wallpapers are still images, with a 1.2-second fade only on changes. Resource use depends on WebView2, open windows, backgrounds, and the machine. Executable size is not runtime memory use.

## 🛠️ Develop and build

Install Node.js 22+, Rust, MinGW-w64 (GCC and binutils), and WebView2 Runtime. Ensure `gcc`, `windres`, and `dlltool` are on PATH. The repository defaults to `stable-x86_64-pc-windows-gnu`.

```powershell
git clone https://github.com/Sunwood-ai-labs/AERIS.git
cd AERIS
npm ci
npm run desktop
```

```powershell
npm test
npm run build
cargo test --release --manifest-path src-tauri/Cargo.toml
.\build.ps1
```

The packaging script builds, tests, and produces `release/AERIS-Windows-x64.zip`. Fully quit AERIS before replacing an existing executable. For MSVC, install Microsoft C++ Build Tools, set `$env:RUSTUP_TOOLCHAIN='stable-x86_64-pc-windows-msvc'`, and use `npm run release`; the packaging script targets GNU.

`npm run dev` provides a clearly labeled browser sample preview. Native connection errors never silently switch to sample data.

## 🔬 Measurement notes

CPU is execution time normalized across logical processors; it may differ from Windows Task Manager's frequency-adjusted readings. Process memory is working set, including shared pages. Network totals exclude loopback but may double-count VPN/virtual interfaces.

AERIS protects itself and critical Windows processes, checks PID and start time before termination, and requires confirmation. Some process information/actions remain unavailable without sufficient access.

`--self-test <output.json>` checks live sampling, protection, and termination of an exclusively test-created child. Its output includes machine process names/paths and is excluded from version control.

## 🎨 Design and license

The custom AERIS symbol combines an **A** with a sweep of air. Edit the [vector master](brand/aeris-mark.svg), then run `npm run icons` to regenerate application/tray icons, multi-resolution Windows ICO, and the README banner. The interface renders SVG directly. See the [identity guide](brand/README.md).

Three generated RGBA backgrounds are included. See [generation notes](docs/backgrounds.md). Source code is under the [MIT License](LICENSE); dependency and WebView2 information is in [THIRD_PARTY.md](THIRD_PARTY.md).
