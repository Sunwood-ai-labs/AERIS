# Task Manager feature coverage

Target: the everyday functions of Windows Task Manager, while retaining AERIS's transparent main window, gadget, low-frequency shared sampler and multi-OS builds.

Reference: [Microsoft Task Manager guide](https://learn.microsoft.com/en-us/troubleshoot/windows-server/support-tools/support-tools-task-manager) and [startup application management](https://support.microsoft.com/en-us/windows/experience/startup-boot/configure-startup-applications-in-windows).

## Implemented in 1.2

| Requirement | Implementation and evidence |
|---|---|
| Processes | Search and numeric CPU/memory/I/O sorting; status, parent PID, owner, command line, CPU time and file location. Live native samples and frontend sorting/escaping tests; process details and I/O columns inspected in the preview. |
| Process actions | Single-process and tree termination, new task, Windows priority and Explorer restart. Native self-test launches fixtures with spaces, Unicode, quotes and shell metacharacters passed literally, rejects stale identity, and terminates only its own children/tree. Windows fixture tests change and restore priority. Explorer's exact system path and stale identity guards are tested; restarting the user's desktop and opening their file manager are not automated GUI tests. |
| Performance | Logical CPU loads/frequency, memory/swap, disk capacity/I/O and network adapters come from sysinfo. Native integration tests check live CPU/memory/process data. Windows live GPU counters use PDH and DXGI; a local Windows 11 GPU-enabled self-test returned measured utilization and memory without an error. Hosted CI may lack GPU hardware. |
| App history | In-window CPU time since observation and peak memory, retaining exited processes. Tests cover exit, reset, PID reuse and owner grouping. History/reset controls were exercised in the preview. This is not Windows's historical UWP database. |
| Startup | Run and Startup-folder inventories; enable/disable through known StartupApproved states, preserving the launch command and backing up the prior state. A disposable HKCU entry is disabled and enabled with read-back checks locally and in Windows CI. Unknown representations are read-only. |
| Users | Resource totals grouped by available process owner, process drill-down, and on-demand Windows signed-in sessions. Owner aggregation tests, native session inventory and preview drill-down checks cover these paths. |
| Services | State/PID/start mode, search, start/stop/restart and protected services. Windows CI creates a dedicated service, exercises its full lifecycle and removes it. Critical-service rejection is tested without changing the protected service. |
| UI | Transparent main window, gadget and mini-bar retained. Windows native overview rendering and live data were observed; prior native gadget/mini transparency and settings checks remain applicable to their unchanged paths. Preview checks cover navigation, history, owner filtering, GPU/performance and management confirmation dialogs. README images are sample-data preview captures. |
| Distribution | English main README, Japanese guide, SVG-derived icons, Windows x64/macOS arm64/macOS x64/Linux x64 build matrix, six packages and individual SHA-256 files. The release job verifies every package/hash and publishes only after all four native jobs pass. |

## Reproduce the checks

```sh
npm ci
npm test
npm run build
cargo test --release --locked --manifest-path src-tauri/Cargo.toml
```

Run the built executable with `--self-test <private-output.json>`; add `--gpu` on a Windows machine with supported GPU counters. The Windows GNU build requires the corresponding Rust toolchain; see the main README. On an elevated disposable Windows runner, run `tools/test-windows.ps1 -NativeExe <built-executable>` to verify management actions. `-AllowNonAdmin` skips the service fixture locally and must not be used to claim service lifecycle coverage.

See [Desktop builds](https://github.com/Sunwood-ai-labs/AERIS/actions/workflows/desktop.yml) for the exact commit/tag and per-platform results, and [Releases](https://github.com/Sunwood-ai-labs/AERIS/releases) for published artifacts. A successful earlier commit is not evidence that a later release build passed.

## Scope and limits

Windows-specific management is labeled on macOS/Linux. Unavailable GPU counters show an error or an unknown value. Startup/service/session inventories run on demand; GPU polling is requested only for the visible performance page. The shared sampler pauses when all windows are hidden or minimized.

macOS/Linux build and native integration coverage does not establish GUI/transparency behavior on every compositor. Interactive GUI validation has been performed on Windows and in the browser preview; destructive Explorer restart has guard coverage rather than a live desktop restart test.

Scheduled tasks, packaged-app startup tasks, startup impact scoring, process network attribution, efficiency mode, affinity, dumps and user logoff are outside this release. This is everyday task-management coverage, not full Windows Task Manager parity. Permissions and OS counter availability can restrict individual fields or actions; AERIS reports errors without automatic elevation.

Tests use dedicated processes, registry values and services. Private native samples include host/process information and must remain outside Git and public artifacts.
