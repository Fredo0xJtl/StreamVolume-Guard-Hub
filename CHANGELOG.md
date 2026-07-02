# Changelog

All notable changes to StreamVolume Guard Hub are tracked here.

## [Unreleased]

### Added

- Created clean hybrid monorepo folder.
- Added `apps/desktop` from the Windows desktop prototype.
- Added `apps/browser-extension` from the existing browser extension project.
- Added `packages/protocol` shared contract foundation for desktop, browser extension, and local bridge.
- Added desktop launcher for testers.
- Added browser sub-source protocol foundation with validation tests.
- Added desktop browser sub-source model, simulation button, UI panel, and local logs.
- Added desktop local bridge on 127.0.0.1:47841 with /health and /browser-source.
- Added `browser_source_observed` parsing in desktop Core with validation and sanitization.
- Added extension bridge client that posts browser source observations to localhost only.
- Added extension-to-background forwarding for browser source status events.
- Added minimal anti-conflict policy so recent `BrowserGain` browser sources prevent double-adjusting the matching Windows browser session.
- Added browser process detection in the extension bridge client to help desktop match browser sessions.
- Added explicit `isControllable` to protocol normalization and extension bridge messages.
- Added strict desktop bridge validation for missing or inconsistent `isControllable`.
- Added local JSON config persistence for `Auto actif` and excluded sessions.
- Added UI columns that show whether Windows and browser sources are controllable.
- Hardened the desktop local bridge with byte-based HTTP body parsing, request size limits, Origin allowlist, and optional local token validation.
- Added local config persistence for the optional bridge token without logging the token value.
- Added extension forwarding of `tab-capture` status to the local bridge so dynamic browser sources such as TikTok can appear in the desktop as `BrowserGain` when signal is usable or `ObserveOnly` when not.
- Added `extension_log` protocol and desktop bridge endpoint `POST /extension-log` so selected extension events join the same local desktop log timeline.
- Added extension-side unified log forwarding for desktop target sync and useful `tabCapture` states, with URL redaction and localhost-only transport.

### Changed

- Renamed the public project presentation to StreamVolume Guard Hub while keeping the local working folder path stable for tester commands.
- Changed desktop `Auto actif` to apply one automatic Windows-volume calibration per active source, then lock further changes until sustained silence or session disappearance. Locked decisions are logged as `volume.auto_locked`.
- Changed desktop global target updates to rearm one-shot Windows calibration before the immediate refresh, so a new target can trigger one fresh correction.
- Changed extension live source forwarding to sync changed desktop `/global-target` values and refresh already open protected tabs.
- Changed extension browser source messages to include the applied target metadata (`targetRmsDb`, `targetProfile`) when available.
- Changed optional bridge token handling so `/global-target` is protected when `BridgeToken` is configured, while `/health` remains open for local diagnostics.
- Changed optional bridge token handling so `/extension-log` is also protected when `BridgeToken` is configured.
- Changed browser anti-conflict handling to keep a short recent `BrowserGain` history through transient `ObserveOnly` flaps before allowing Windows session correction again.
- Reused the browser extension Guard Signal icon as the desktop window and executable icon.

### Fixed

- Fixed incomplete desktop global target wiring so the local bridge target endpoint and target controls build cleanly.
- Fixed desktop target changes appearing saved but not affecting already active Windows/browser sources until a manual refresh or restart.
- Fixed Chromium-family anti-conflict matching so a `BrowserGain` source can block double-adjusting a matching Brave/Chrome/Edge Windows session.
- Fixed duplicate `target.changed` log entries when a target preset also moved the target slider programmatically.

### Documentation

- Reworked `docs/tester-checklist.md` around the current hybrid test state and bridge-local limits.
- Added root `AGENTS.md` for hybrid project workflow and guardrails.
- Added `docs/product-next-plan.md` as the current implementation roadmap.
- Added `docs/review-2026-07-01.md` with the documentation review decisions.
- Marked `docs/superpowers/plans/` as historical plans, not current source of truth.
- Updated desktop and extension docs to reflect the hybrid architecture and bridge-local testable state.
- Updated CI, PR, and contributor commands for the current `apps/desktop`, extension, and protocol layout.
- Added GitHub issue templates for bug reports, feature requests, and real audio test reports.
- Removed the placeholder GitHub security contact link until the final repository URL exists.
- Reworked `docs/implementation-prompts.md` into a current living execution map with package statuses and next priorities.
- Documented the rule that prompts, roadmap, checklists, GitHub files and `CHANGELOG.md` must be recalibrated after each implementation when relevant.
- Updated bridge docs and tester steps for the hardened local bridge and optional `X-StreamVolume-Guard-Token` header.
- Updated real-source test docs to distinguish `media-html` browser sources from `tab-capture` browser sources.
- Updated tester and maintainer docs for one-shot desktop auto calibration and `volume.auto_locked`.
- Expanded `.gitignore` and PR hygiene checks for all generated folders used by the hybrid repo.
- Added `.cmd` line-ending normalization for Windows launcher scripts.
- Split the active browser-extension README from the legacy public-extension README so GitHub presents the current hybrid direction first.
- Documented the unified local log flow and its privacy boundaries across README, architecture, protocol, maintainer and tester docs.
- Added `docs/github-repo-setup.md` with the recommended GitHub repository name, French description, topics, and publication hygiene.

### Notes

- Generated folders were intentionally excluded from the clean hybrid copy.
- Desktop and browser extension remain separate applications inside one repository.




