> **Archive historique :** ce plan documente une etape de construction. Pour la source actuelle, utiliser `docs/product-next-plan.md` et `docs/hybrid-architecture.md`.

# Local Test Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add local, copyable desktop logs so a tester can mark each manual audio source test and share recent app observations.

**Architecture:** Add a small platform-neutral `LocalActivityLog` in `StreamVolumeGuard.Core` with injectable directory and clock for tests. Wire it from WPF `MainWindow` to log app lifecycle, session detection/disappearance, auto volume changes, manual slider changes, exclusions, panic, and explicit tester marks. Keep logs local under `%LocalAppData%\StreamVolumeGuard\logs` and expose UI buttons to mark, copy recent logs, and open the log folder.

**Tech Stack:** C# .NET 8, WPF, Windows Clipboard, Explorer folder launch, existing console-style test runner.

---

### Task 1: Add test-first local logger

**Files:**
- Modify: `desktop/tests/StreamVolumeGuard.Tests/Program.cs`
- Create: `desktop/src/StreamVolumeGuard.Core/Logging/LocalActivityLog.cs`

- [x] Add tests proving the logger writes a readable single-line event, sanitizes multiline values, and reads only recent lines.
- [x] Run tests and confirm they fail because `LocalActivityLog` does not exist.
- [x] Implement `LocalActivityLog` with injected directory and clock.
- [x] Run tests and confirm they pass.

### Task 2: Wire logs into desktop runtime

**Files:**
- Modify: `desktop/src/StreamVolumeGuard.App/MainWindow.xaml`
- Modify: `desktop/src/StreamVolumeGuard.App/MainWindow.xaml.cs`

- [x] Add three UI buttons: `Marquer étape`, `Copier logs récents`, `Ouvrir logs`.
- [x] Log app start, refresh errors, session detected, session disappeared, auto volume applied, manual slider, exclusion changes, and panic decisions.
- [x] Track previous session ids in memory to avoid noisy repeated detection logs.
- [x] Copy recent log text to clipboard with a short status line in the window title.
- [x] Open the log directory with Explorer.

### Task 3: Update tester docs

**Files:**
- Modify: `docs/tester-checklist.md`
- Modify: `CHANGELOG.md`

- [x] Explain when to click `Marquer étape` during YouTube, TikTok, Spotify Web and OBS tests.
- [x] Explain where local logs live and that they are not sent automatically.
- [x] Add the changelog entry for local test logs.

### Task 4: Verify

**Commands:**

```powershell
dotnet run --project "D:\Codex\App StreamVolume Guard\desktop\tests\StreamVolumeGuard.Tests\StreamVolumeGuard.Tests.csproj"
dotnet build "D:\Codex\App StreamVolume Guard\desktop\StreamVolumeGuard.Desktop.sln" -nr:false
```

Expected result: all tests pass and build reports 0 errors.


