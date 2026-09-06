# Task Manager feature coverage

Target: the everyday functions of Windows Task Manager, while retaining AERIS's transparent main window, gadget, low-frequency shared sampler and multi-OS builds.

Reference: [Microsoft Task Manager guide](https://learn.microsoft.com/en-us/troubleshoot/windows-server/support-tools/support-tools-task-manager) and [startup application management](https://support.microsoft.com/en-us/windows/experience/startup-boot/configure-startup-applications-in-windows).

This is an implementation/verification checklist. An unchecked item is not a completed capability.

- [ ] Processes: search, sort CPU/memory/I/O, real status, parent PID, owner, command line, CPU time, file location.
- [ ] Process actions: single-process termination, process-tree termination, priority, new task, restart Explorer; PID/start-time checks and confirmations.
- [ ] Performance: logical CPU loads, frequency, physical memory/swap, disks and transfer rates, individual network interfaces, Windows GPU metrics.
- [ ] App history: explicitly scoped resource history, distinct from Windows's OS-wide historical database.
- [ ] Startup: enumerate common Windows startup sources; enable/disable with a reversible operation and accurate status.
- [ ] Users: active user/session resource usage and process drill-down.
- [ ] Services: Windows service state/PID, search, start/stop/restart with errors surfaced.
- [ ] UI: native Windows interaction, transparent main/gadget/mini preserved; sample screenshots updated.
- [ ] Distribution: English main README/Japanese guide, platform support notes, four native CI targets, release packages and checksums.

Windows-specific management must be labeled on macOS/Linux. Unsupported/unavailable counters must not be shown as fabricated zeros. Expensive inventories should refresh on demand or only while their page is visible. Verification must use disposable child processes and fixtures; do not change real startup entries or stop real services for tests.
