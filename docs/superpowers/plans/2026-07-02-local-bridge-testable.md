# Local Bridge Testable Version Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the hybrid app testable end-to-end by receiving real browser-source events from the extension through a local 127.0.0.1 bridge.

**Architecture:** Desktop Core validates protocol JSON and maps it to `BrowserSubSourceSnapshot`. The WPF app hosts a minimal loopback HTTP server backed by `TcpListener` on `127.0.0.1:47841` and writes valid events into the existing browser-source store. The extension sends generic `browser_source_observed` events to the local bridge without site-specific patches and without full URLs or raw audio.

**Tech Stack:** C# .NET 8/WPF, `HttpListener`, `System.Text.Json`, JavaScript MV3 service worker/content script, existing no-dependency test runners.

---

### Task 1: Desktop bridge parser in Core

**Files:**
- Modify: `apps/desktop/tests/StreamVolumeGuard.Tests/Program.cs`
- Created: `apps/desktop/src/StreamVolumeGuard.Core/Bridge/BrowserBridgeMessageParser.cs`

- [x] Add failing tests for valid `browser_source_observed`, invalid type, missing source id, and invalid control surface.
- [x] Run desktop tests and verify compile/test failure because `BrowserBridgeMessageParser` does not exist.
- [x] Implement `BrowserBridgeMessageParser` with JSON validation, scalar clamping, string sanitization, enum parsing, and default fallback values.
- [x] Run desktop tests and verify parser tests pass.

### Task 2: Desktop local HTTP bridge host

**Files:**
- Created: `apps/desktop/src/StreamVolumeGuard.App/Bridge/LocalBrowserBridgeServer.cs`
- Modify: `apps/desktop/src/StreamVolumeGuard.App/MainWindow.xaml.cs`
- Modify: `apps/desktop/src/StreamVolumeGuard.App/MainWindow.xaml`

- [x] Add bridge status in the UI footer.
- [x] Start `LocalBrowserBridgeServer` on `http://127.0.0.1:47841/` at app startup.
- [x] Accept `GET /health` and `POST /browser-source`.
- [x] On valid POST, dispatch to UI thread, upsert the browser source, log `browser.source.received`, and refresh the browser-source panel.
- [x] On invalid POST, return 400 and log `bridge.message.invalid`.
- [x] Stop the bridge on window close.
- [x] Build desktop solution.

### Task 3: Extension local bridge sender

**Files:**
- Created: `apps/browser-extension/bridge/client.js`
- Modify: `apps/browser-extension/manifest.json`
- Modify: `apps/browser-extension/background.js`
- Modify: `apps/browser-extension/content.js`
- Modify: `apps/browser-extension/tests/unit.test.js`

- [x] Add failing source tests proving the extension has a localhost-only bridge client, sends `browser_source_observed`, uses `BrowserExtension` and `BrowserGain`/`ObserveOnly`, and does not send full URLs.
- [x] Run extension unit tests and verify they fail before implementation.
- [x] Add `bridge/client.js` with `buildBrowserSourceObserved`, `sendBrowserSourceObserved`, localhost endpoint, sanitization and throttling.
- [x] Add bridge script to manifest content scripts or service worker loading path as appropriate.
- [x] Send generic status events from content/background when audio status changes; failures must be ignored locally.
- [x] Run extension tests and syntax checks.

### Task 4: Docs and tester checklist

**Files:**
- Modify: `docs/tester-checklist.md`
- Modify: `docs/product-next-plan.md`
- Modify: `docs/hybrid-architecture.md`
- Modify: `CHANGELOG.md`
- Modify: `apps/desktop/README.md`
- Modify: `apps/browser-extension/README.md`

- [x] Update docs so bridge local is now testable.
- [x] Add concrete bridge test commands and expected logs.
- [x] Keep limitations honest: no OBS meter read, no driver, no guaranteed separation without extension event.

### Task 5: Verification

**Commands:**

```powershell
node "D:\Codex\StreamVolume Guard Hybride\packages\protocol\tests\protocol.test.js"
dotnet run --project "D:\Codex\StreamVolume Guard Hybride\apps\desktop\tests\StreamVolumeGuard.Tests\StreamVolumeGuard.Tests.csproj"
dotnet build "D:\Codex\StreamVolume Guard Hybride\apps\desktop\StreamVolumeGuard.Desktop.sln" -nr:false
node "D:\Codex\StreamVolume Guard Hybride\apps\browser-extension\tests\unit.test.js"
node --check "D:\Codex\StreamVolume Guard Hybride\apps\browser-extension\bridge\client.js"
node --check "D:\Codex\StreamVolume Guard Hybride\apps\browser-extension\background.js"
node --check "D:\Codex\StreamVolume Guard Hybride\apps\browser-extension\content.js"
```
