# Contributing

## Product Rules

- Keep the engine global: no app-specific patches such as `if Chrome`, `if Spotify`, or `if Discord`.
- Use Windows audio sessions as the primary abstraction.
- Keep processing local; do not add telemetry, tracking, or account requirements.
- Keep streamer UX understandable for non-technical testers.
- Show non-controllable or unknown sessions honestly.

## Development Rules

- Use .NET SDK 8.
- Run protocol, extension, and desktop tests before claiming behavior is correct.
- Run the full solution build before opening a PR.
- Update docs and `CHANGELOG.md` when behavior or user-facing wording changes.

## Commands

```powershell
node "packages/protocol/tests/protocol.test.js"
node "apps/browser-extension/tests/unit.test.js"
node --check "apps/browser-extension/audio/browser-gain-calibration.js"
node --check "apps/browser-extension/audio/normalizer.js"
node --check "apps/browser-extension/bridge/client.js"
node --check "apps/browser-extension/background.js"
node --check "apps/browser-extension/content.js"
dotnet run --project "apps/desktop/tests/StreamVolumeGuard.Tests/StreamVolumeGuard.Tests.csproj"
dotnet build "apps/desktop/StreamVolumeGuard.Desktop.sln" -nr:false
powershell -ExecutionPolicy Bypass -File "tools\package-tester.ps1"
```

## Pull Requests

A PR should include:

- the problem being solved;
- the implementation summary;
- test/build evidence;
- docs or changelog updates when relevant;
- known limits or follow-up work.


