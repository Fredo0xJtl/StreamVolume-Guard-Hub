# Maintainer Checklist

Use this before pushing, opening a PR, or sharing a build.

## Required

- [ ] No app-specific audio patches were introduced.
- [ ] Protocol tests pass.
- [ ] Browser extension tests pass.
- [ ] Browser extension syntax checks pass for bridge, background, and content scripts.
- [ ] Desktop tests pass.
- [ ] Full desktop solution build passes.
- [ ] README or docs updated if behavior changed.
- [ ] `CHANGELOG.md` updated if behavior, UX, setup, or limitations changed.
- [ ] Active docs do not point to stale prototype-folder commands.
- [ ] `.github/project/` is updated if roadmap, labels, known limits, test status, release readiness, or project-board priorities changed.
- [ ] GitHub-facing docs still point to the direct Project board: `https://github.com/users/Fredo0xJtl/projects/1`.
- [ ] Bridge status is clear: testable on `127.0.0.1:47841`, simulated fallback, or unavailable with a clear error.
- [ ] Bridge hardening is preserved: loopback bind, request size limits, Origin allowlist, optional token on `/browser-source`, `/extension-log`, and `/global-target`, open `/health`, and no token value in logs.
- [ ] Unified logs remain privacy-safe: no full URL, raw audio, browser history, token, Discord message, or OBS scene is written.
- [ ] Anti-conflict behavior is covered: recent `BrowserGain` source skips matching `WindowsSessionVolume` auto correction.
- [ ] Chromium-family browser alias behavior is covered: Brave/Chrome/Edge style process names do not cause double correction when `BrowserGain` is already active.
- [ ] Desktop Auto one-shot behavior is covered: one correction per active source, `volume.auto_locked` for skipped follow-up corrections, reset after sustained silence or disappearance.
- [ ] Global target changes are covered: desktop target changes rearm one-shot calibration, and live browser sources sync changed `/global-target` values.
- [ ] No generated `bin/` or `obj/` files are intended for source control.
- [ ] No generated `dist/`, `release-assets/`, `graphify-out/`, `build/`, `out/`, `release/`, or `releases/` files are intended for source control.
- [ ] No local logs, diagnostics, or private machine paths are committed unless explicitly intended.

## Commands

```powershell
node "packages/protocol/tests/protocol.test.js"
node "apps/browser-extension/tests/unit.test.js"
node --check "apps/browser-extension/bridge/client.js"
node --check "apps/browser-extension/background.js"
node --check "apps/browser-extension/content.js"
dotnet run --project "apps/desktop/tests/StreamVolumeGuard.Tests/StreamVolumeGuard.Tests.csproj"
dotnet build "apps/desktop/StreamVolumeGuard.Desktop.sln" -nr:false
powershell -ExecutionPolicy Bypass -File "tools\package-tester.ps1"
```
