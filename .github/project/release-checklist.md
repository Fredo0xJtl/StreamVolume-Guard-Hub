# Release Checklist

Use this before publishing a GitHub pre-release or stable release.

## Pre-Release: Alpha Tester

Recommended first tag:

```text
v0.1.0-alpha.1
```

Required:

- [ ] `CHANGELOG.md` describes what changed.
- [ ] `README.md` explains current behavior and limits.
- [ ] `docs/tester-checklist.md` matches the package and app UI.
- [ ] `.github/project/backlog.csv` reflects the current known blockers.
- [ ] Protocol tests pass.
- [ ] Browser extension tests pass.
- [ ] Browser extension syntax checks pass.
- [ ] Desktop tests pass.
- [ ] Desktop build passes.
- [ ] `tools/package-tester.ps1` regenerates the tester package.
- [ ] The tester package launches without opening the `.sln`.
- [ ] Real logs show whether each browser source is `BrowserGain`, `ObserveOnly`, or `Unknown`.
- [ ] Release notes say clearly that YouTube/TikTok can fall back to global browser volume when direct BrowserGain is unavailable.

## Stable Release: V1

Do not mark a release stable until:

- [ ] YouTube, TikTok, Spotify Web, Discord, VLC, and OBS manual checks have current logs.
- [ ] Browser control limits are documented in the release notes.
- [ ] No source is presented as controllable unless `isControllable=true` and the correct `controlSurface` is visible.
- [ ] The package has been tested from a clean tester folder.
- [ ] Known non-controllable cases have a clear fallback story.

## Command Block

Run from the repository root:

```powershell
cd "D:\Codex\StreamVolume Guard Hybride"
$ErrorActionPreference = "Stop"

function Run-Step($cmd, $argsList) {
  & $cmd @argsList
  if ($LASTEXITCODE -ne 0) { throw "$cmd failed with exit code $LASTEXITCODE" }
}

Run-Step node @("packages/protocol/tests/protocol.test.js")
Run-Step node @("apps/browser-extension/tests/unit.test.js")

Run-Step node @("--check", "apps/browser-extension/audio/browser-gain-calibration.js")
Run-Step node @("--check", "apps/browser-extension/audio/normalizer.js")
Run-Step node @("--check", "apps/browser-extension/bridge/client.js")
Run-Step node @("--check", "apps/browser-extension/background.js")
Run-Step node @("--check", "apps/browser-extension/content.js")

Run-Step dotnet @("run", "--project", "apps/desktop/tests/StreamVolumeGuard.Tests/StreamVolumeGuard.Tests.csproj")
Run-Step dotnet @("build", "apps/desktop/StreamVolumeGuard.Desktop.sln", "-nr:false")

powershell -ExecutionPolicy Bypass -File "tools\package-tester.ps1"
if ($LASTEXITCODE -ne 0) { throw "package-tester failed" }
```

Do not create a GitHub release or tag unless that is the explicit action for
the current turn.
