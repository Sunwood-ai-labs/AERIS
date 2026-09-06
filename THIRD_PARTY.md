# Third-party components

AERIS uses these open-source components. Exact resolved versions are in `package-lock.json` and `src-tauri/Cargo.lock`.

- Tauri and the Tauri JavaScript API — MIT / Apache-2.0 — https://github.com/tauri-apps/tauri
- sysinfo — MIT — https://github.com/GuillaumeGomez/sysinfo
- Lucide icons — ISC — https://github.com/lucide-icons/lucide
- Serde / serde_json — MIT / Apache-2.0 — https://github.com/serde-rs/serde
- Vite, TypeScript and tsx are build-time tools.

The Windows build uses Microsoft Edge WebView2. `WebView2Loader.dll` is supplied by the WebView2 SDK through `webview2-com-sys`.
The separately installed WebView2 Runtime is provided and updated by Microsoft.
See https://www.nuget.org/packages/Microsoft.Web.WebView2 for the SDK license and notices.

The Rust toolchain and compiler dependencies are development tools, not bundled browser engines.
Application icons used for familiar process names are only identification aids; AERIS is not affiliated with those applications.
