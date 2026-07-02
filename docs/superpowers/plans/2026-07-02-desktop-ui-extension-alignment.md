# Desktop UI Extension Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Subagents are not allowed in this side conversation.

**Goal:** Rework the WPF desktop UI so it visually matches the browser extension, with a light default theme and an in-app dark-mode button.

**Architecture:** Keep existing WPF bindings and audio behavior. Add a small theme layer in `MainWindow.xaml`, expose UI summary/theme properties from `MainWindow.xaml.cs`, restyle the existing tables and action areas, then update tester docs.

**Tech Stack:** C# .NET 8, WPF XAML, existing `StreamVolumeGuard.Core`, no new UI dependency.

---

### Task 1: Add Theme State And Summary Properties

**Files:**
- Modify: `D:\Codex\StreamVolume Guard Hybride\apps\desktop\src\StreamVolumeGuard.App\MainWindow.xaml.cs`

- [ ] Add `INotifyPropertyChanged` support to `MainWindow`.
- [ ] Add `IsDarkTheme`, `ThemeButtonText`, `ThemeStatusText`, `WindowSourceCountText`, `BrowserSourceCountText`, `WatchCountText`, and `ModeSummaryText`.
- [ ] Add `Theme_Click` and `ApplyTheme` methods.
- [ ] Persist `DarkThemeEnabled` in local `AppConfig`.
- [ ] Update summary values in `RenderRows`, `RenderBrowserRows`, and `AutoEnabled_Changed`.

### Task 2: Restyle Desktop XAML To Match Extension

**Files:**
- Modify: `D:\Codex\StreamVolume Guard Hybride\apps\desktop\src\StreamVolumeGuard.App\MainWindow.xaml`

- [ ] Replace the dark-only shell with extension-like resources.
- [ ] Add light/dark brushes as WPF resources.
- [ ] Add header with brand, trust badges, Auto toggle, theme button, and Panic.
- [ ] Add compact summary cards.
- [ ] Restyle `DataGrid` panels for `Applications Windows` and `Sources navigateur`.
- [ ] Move debug/log actions to a quieter bottom panel.

### Task 3: Make Rows Display Control Metadata Cleanly

**Files:**
- Modify: `D:\Codex\StreamVolume Guard Hybride\apps\desktop\src\StreamVolumeGuard.App\MainWindow.xaml.cs`

- [ ] Add `Origin`, `ControlSurface`, and `IsControllable` properties to `SessionRow`.
- [ ] Add `IsControllable` to `BrowserSourceRow`.
- [ ] Add `StatusBadgeClass`-style fields only if WPF bindings need them; otherwise keep text badges simple.

### Task 4: Update Tester Checklist

**Files:**
- Modify: `D:\Codex\StreamVolume Guard Hybride\docs\tester-checklist.md`

- [ ] Add a UI design validation section.
- [ ] Add checks for light default, dark toggle, extension visual consistency, and readable source tables.

### Task 5: Verify

**Commands from project root:**

```powershell
cd "D:\Codex\StreamVolume Guard Hybride"
dotnet run --project "apps/desktop/tests/StreamVolumeGuard.Tests/StreamVolumeGuard.Tests.csproj"
dotnet build "apps/desktop/StreamVolumeGuard.Desktop.sln" -nr:false
```

**Manual checks:**
- Launch desktop.
- Confirm light theme by default.
- Toggle dark mode and back.
- Restart the app and confirm the selected theme persists.
- Confirm `Sons système Windows` remains grouped.
- Confirm source rows still show volume, exclusion, status, origin, control surface, and controllable state.
