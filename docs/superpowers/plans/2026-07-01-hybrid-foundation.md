> **Archive historique :** ce plan documente une etape de construction. Pour la source actuelle, utiliser `docs/product-next-plan.md` et `docs/hybrid-architecture.md`.

# Hybrid Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Establish the hybrid foundation so StreamVolume Guard can reason about all available sources from Windows sessions and browser sub-sources without hiding what is or is not controllable.

**Architecture:** Keep desktop and extension separate under `apps/`, define the shared contract in `packages/protocol`, and mirror the browser-source model in the desktop Core for display/logging. The first implementation does not add a real bridge server yet; it adds tested protocol models plus a desktop simulation path so the UI/logs can already show browser sub-sources and their control capability.

**Tech Stack:** C# .NET 8/WPF, no-dependency JavaScript protocol helper, local JSON-style messages, existing local activity logs.

---

### Task 1: Protocol package foundation

**Files:**
- Create: `packages/protocol/index.js`
- Create: `packages/protocol/tests/protocol.test.js`
- Create: `packages/protocol/examples/browser-source-observed.json`
- Modify: `packages/protocol/README.md`

- [x] Add tests for accepted browser source messages with `origin=BrowserExtension` and `controlSurface=BrowserGain`.
- [x] Add tests rejecting invalid origins/control surfaces and missing source ids.
- [x] Implement `normalizeBrowserSourceMessage` and exported constants.
- [x] Document that protocol messages never contain raw audio and must classify controllability up front.

### Task 2: Desktop Core browser-source model

**Files:**
- Modify: `apps/desktop/tests/StreamVolumeGuard.Tests/Program.cs`
- Create: `apps/desktop/src/StreamVolumeGuard.Core/Browser/BrowserSubSourceSnapshot.cs`
- Create: `apps/desktop/src/StreamVolumeGuard.Core/Browser/BrowserSubSourceStore.cs`
- Create: `apps/desktop/src/StreamVolumeGuard.Core/Browser/AudioSourceOrigin.cs`
- Create: `apps/desktop/src/StreamVolumeGuard.Core/Browser/AudioControlSurface.cs`

- [x] Add tests that a browser sub-source preserves site, tab/source id, level, gain, status, origin and control surface.
- [x] Add tests that stale browser sub-sources can be removed by cutoff time.
- [x] Implement records/enums/store.

### Task 3: Desktop UI simulation path

**Files:**
- Modify: `apps/desktop/src/StreamVolumeGuard.App/MainWindow.xaml`
- Modify: `apps/desktop/src/StreamVolumeGuard.App/MainWindow.xaml.cs`

- [x] Add a simple browser sub-source panel below the Windows session mixer.
- [x] Add button `Simuler source navigateur`.
- [x] On click, add/update a fake YouTube/TikTok browser source with `origin=BrowserExtension` and `controlSurface=BrowserGain`.
- [x] Log `browser.source.simulated` and show the source as separate from Windows sessions.
- [x] Keep observation mode and Windows sessions untouched.

### Task 4: Docs and cleanup

**Files:**
- Create: `docs/hybrid-architecture.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/tester-checklist.md`
- Modify: `apps/desktop/README.md`

- [x] Document the hybrid coverage rule: Windows sessions for apps, extension browser gain for tabs/sites, unknown/non-controllable shown honestly.
- [x] Document the staged order: protocol -> simulation -> bridge -> extension sender -> anti-conflict.
- [x] Fix stale desktop commands that still point to `D:\Codex\App StreamVolume Guard`.

### Task 5: Verification

**Commands:**

```powershell
node "D:\Codex\StreamVolume Guard Hybride\packages\protocol\tests\protocol.test.js"
dotnet run --project "D:\Codex\StreamVolume Guard Hybride\apps\desktop\tests\StreamVolumeGuard.Tests\StreamVolumeGuard.Tests.csproj"
dotnet build "D:\Codex\StreamVolume Guard Hybride\apps\desktop\StreamVolumeGuard.Desktop.sln" -nr:false
```

Expected result: all commands exit 0.


