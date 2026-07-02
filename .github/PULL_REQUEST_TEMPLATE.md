## Summary

Describe what changed and why.

## Product Guardrails

- [ ] No app-specific audio patch was added.
- [ ] The change keeps the local-first/no-telemetry promise.
- [ ] Unknown or non-controllable sessions remain honest in the UI.
- [ ] BrowserGain and WindowsSessionVolume do not fight over the same source.
- [ ] No generated folders (`bin/`, `obj/`, `dist/`, `build/`, `out/`, `release-assets/`, `release/`, `releases/`, `graphify-out/`, `.graphify/`, `node_modules/`) are included.

## Verification

Paste command output or summarize exact results.

```powershell
node "packages/protocol/tests/protocol.test.js"
node "apps/browser-extension/tests/unit.test.js"
node --check "apps/browser-extension/bridge/client.js"
node --check "apps/browser-extension/background.js"
node --check "apps/browser-extension/content.js"
dotnet run --project "apps/desktop/tests/StreamVolumeGuard.Tests/StreamVolumeGuard.Tests.csproj"
dotnet build "apps/desktop/StreamVolumeGuard.Desktop.sln" -nr:false
```

## Documentation

- [ ] `CHANGELOG.md` updated for user-facing behavior, tests, docs, packaging, or GitHub workflow changes.
- [ ] README/docs updated if behavior, setup, or limitations changed.

## Notes

Known limitations, follow-up work, or manual test notes.
