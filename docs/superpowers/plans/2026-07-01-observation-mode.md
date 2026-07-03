> **Archive historique :** ce plan documente une etape de construction. Pour la source actuelle, utiliser `docs/product-next-plan.md` et `docs/hybrid-architecture.md`.

# Observation Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Start StreamVolume Guard in observation mode by default so manual tests can collect logs without changing Windows app volumes until the user explicitly enables automatic correction.

**Architecture:** Add a small Core `AutoApplyPolicy` that converts a `VolumeDecision` plus `autoEnabled` into either an apply action or a would-apply observation. Wire WPF to a visible `Auto actif` checkbox, default unchecked, and log `volume.would_apply` when the normalizer wants to change volume while observation mode is active.

**Tech Stack:** C# .NET 8, WPF, existing console-style tests, existing local activity logger.

---

### Task 1: Core policy in TDD

**Files:**
- Modify: `desktop/tests/StreamVolumeGuard.Tests/Program.cs`
- Create: `desktop/src/StreamVolumeGuard.Core/Control/AutoApplyPolicy.cs`

- [x] Add tests proving observation mode blocks volume application and requests a would-apply log.
- [x] Add tests proving active auto mode applies the correction and does not request would-apply logging.
- [x] Run tests and confirm they fail because `AutoApplyPolicy` is missing.
- [x] Implement `AutoApplyPolicy` and `AutoApplyPlan` in Core.
- [x] Run tests and confirm they pass.

### Task 2: WPF observation mode

**Files:**
- Modify: `desktop/src/StreamVolumeGuard.App/MainWindow.xaml`
- Modify: `desktop/src/StreamVolumeGuard.App/MainWindow.xaml.cs`

- [x] Add an `Auto actif` checkbox in the top toolbar, default unchecked.
- [x] Change refresh behavior so automatic volume changes only apply when `Auto actif` is checked.
- [x] Log `volume.would_apply` when the policy sees a correction while observation mode is active.
- [x] Log `auto.enabled` and `auto.disabled` when the checkbox changes.
- [x] Keep manual sliders, exclusions and Panic functional regardless of observation mode.

### Task 3: Tester docs

**Files:**
- Modify: `docs/tester-checklist.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [x] Explain that the app starts in observation mode.
- [x] Explain that `Auto actif` must be enabled only after logs are reviewed.
- [x] Add changelog entry for observation mode.

### Task 4: Verify

**Commands:**

```powershell
dotnet run --project "D:\Codex\App StreamVolume Guard\desktop\tests\StreamVolumeGuard.Tests\StreamVolumeGuard.Tests.csproj"
dotnet build "D:\Codex\App StreamVolume Guard\desktop\StreamVolumeGuard.Desktop.sln" -nr:false
```

Expected result: all tests pass and build reports 0 errors.


