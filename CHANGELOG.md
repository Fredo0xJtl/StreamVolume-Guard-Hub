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
- Added browser session control modes so the V1 can arbitrate between `BrowserGain` priority and `WindowsSessionVolume` fallback.
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
- Added generic browser fallback logic that upgrades an audible but silent `media-html` source to `tab-capture`, with cooldown protection to avoid loops when tab capture still has no usable signal.
- Added visible app-extension link status: the desktop now shows `App seule` or `Extension connectee`, and the extension popup shows `Mode autonome` or `App connectee`.
- Added desktop log grouping with automatic `runId`, per-test `testSessionId`, and a `Nouveau test` action for cleaner manual test captures.
- Added per-session Windows mixer snapshots for diagnostics and manual-test context.
- Added a reproducible Windows tester package script at `tools/package-tester.ps1`, with a package launcher, short README, short checklist, copied browser extension, and local logs shortcut.
- Added one-shot `BrowserGain` calibration in the extension: measure, apply once, lock, skip honestly when no signal is usable, and rearm on silence/source/target changes.
- Added browser calibration protocol fields: `calibrationState`, `measuredRmsDb`, `appliedGainDb`, and `calibrationReason`.
- Added browser calibration logs: `browser.calibration.started`, `browser.calibration.measured`, `browser.gain.applied`, `browser.gain.locked`, `browser.gain.skipped`, and `browser.gain.rearmed`.
- Added desktop UI display for browser-source calibration state.
- Added `.github/project/` files for the GitHub Projects tab: board setup, importable backlog, labels, and release checklist.
- Added `docs/release-notes/v0.1.0-alpha.1.md` as honest alpha tester pre-release notes.

### Changed

- Renamed the public project presentation to StreamVolume Guard Hub while keeping the local working folder path stable for tester commands.
- Changed desktop `Auto actif` to apply one automatic Windows-volume calibration per active source, then lock further changes until sustained silence or session disappearance. Locked decisions are logged as `volume.auto_locked`.
- Changed desktop global target updates to rearm one-shot Windows calibration before the immediate refresh, so a new target can trigger one fresh correction.
- Changed extension live source forwarding to sync changed desktop `/global-target` values and refresh already open protected tabs.
- Changed extension browser source messages to include the applied target metadata (`targetRmsDb`, `targetProfile`) when available.
- Changed optional bridge token handling so `/global-target` is protected when `BridgeToken` is configured, while `/health` remains open for local diagnostics.
- Changed optional bridge token handling so `/extension-log` is also protected when `BridgeToken` is configured.
- Changed the default browser strategy to `BrowserGainPriority`: when the extension controls a real browser source, the desktop no longer moves the matching browser Windows session at the same time.
- Changed browser fallback handling so `ObserveOnly`, `Unknown`, `skipped`, stale or disappeared browser sources can still use `WindowsSessionVolume` when appropriate.
- Changed desktop/browser arbitration so target changes apply a fast visible Windows fallback even for browser sessions, while `BrowserGain` only blocks Windows after the browser source is locked and stable.
- Changed BrowserGain calibration to use a robust 12-second analysis window, require about 5 seconds of useful non-silent signal, use a median-style global tone measurement, avoid boosting before the window is reliable, and apply temporary safety attenuation only for dangerously loud starts.
- Changed BrowserGain target changes so an already locked source recalculates its gain immediately from the reliable measured level instead of waiting for a full new 12-second window.
- Changed BrowserGain rearming so a locked source can remeasure after a durable level shift of about 8-10 seconds, instead of chasing short transitions.
- Changed browser source routing so real sites that expose media elements without usable Web Audio levels can be retried through tab-level capture without adding site-specific engine patches.
- Changed the extension popup to ping the desktop `/health` endpoint without requiring the desktop to be running.
- Changed the desktop one-shot Auto lock to allow one delayed safety correction when a locked source suddenly becomes very loud again, logged with `reason=safety-spike`.
- Changed the desktop layout so the extension link status and debug actions do not crowd narrow summary/debug rows.
- Changed desktop `Copier logs` to copy a readable current manual-test report with session, sources, corrections, alerts, and raw logs instead of mixing the whole daily log file.
- Changed the Windows desktop launcher to stop stale .NET build servers, compile with `-nr:false`, and start the built executable to avoid WPF `MarkupCompile.cache` access-denied failures.
- Changed desktop target profiles to use direct Windows mixer percentages: `Calme` targets about 40%, `Standard` about 70%, and `Fort` about 100%.
- Changed desktop target preset handling so clicking the already active profile does not save, log, rearm one-shot calibration, or move volumes again.
- Changed desktop `Nouveau test` so it captures a Windows mixer snapshot for diagnostics without rearming auto calibration or moving system volume.
- Changed desktop Auto so a manual Windows mixer jump toward 100% promotes the global target to `Fort` instead of immediately reapplying `Calme`.
- Changed target preset buttons to show the active profile in green, and changed the custom slider floor to 15% of the Windows mixer.
- Changed desktop `safety-spike` Auto corrections so they respect the custom slider floor of 15% of the Windows mixer; Panic remains the separate emergency action.
- Changed desktop `safety-spike` handling so it no longer pushes a source below the active `Calme`/`Standard`/`Fort` mixer target after the profile has been applied.
- Reduced the desktop target slider debounce from 500ms to 150ms so manual target changes affect the Windows mixer faster during tests.
- Changed desktop startup so visible controllable Windows sessions are observed and the target aligns to `Fort` without moving volume.
- Changed `Sons systeme Windows` handling to protect against loud system peaks without automatically boosting notifications or short alerts.
- Reused the browser extension Guard Signal icon as the desktop window and executable icon.
- Reworked the social sharing preview image for StreamVolume Guard Hub with a clearer hybrid mixer presentation.
- Replaced the legacy social preview generator with a compatibility alias to the current Hub generator, so there is only one visual source of truth.
- Compact desktop `Bridge, logs et debug` into a one-line debug toolbar with trimmed status text and shorter action labels.
- Linked GitHub-facing docs, issue templates, and PR checklist directly to the active Project board.
- Changed tester packaging to create both the package folder and `StreamVolumeGuardHub-Tester-v0.1.0-alpha.1.zip`.

### Fixed

- Fixed incomplete desktop global target wiring so the local bridge target endpoint and target controls build cleanly.
- Fixed desktop target changes appearing saved but not affecting already active Windows/browser sources until a manual refresh or restart.
- Fixed the readable desktop test report header so global profile, browser-source count, and Windows-session count are preserved even when later browser or one-shot Auto events contain only partial state.
- Fixed Chromium-family matching in `BrowserGainPriority` so per-browser-source control can block matching Brave/Chrome/Edge Windows sessions when BrowserGain is active.
- Fixed duplicate `target.changed` log entries when a target preset also moved the target slider programmatically.
- Fixed BrowserGain calibration state after extension disable/enable so `browser.gain.skipped` is not spammed and calibration rearms when protection is enabled again.
- Fixed extension tab protection activation so media-html tabs retry the injected content script before failing, and show an explicit activation error instead of silently flipping back to inactive.

### Documentation

- Reworked `docs/tester-checklist.md` around the current hybrid test state and bridge-local limits.
- Added internal hybrid project workflow and guardrails.
- Added internal implementation roadmap and documentation review notes.
- Archived internal implementation plans outside the public documentation tree.
- Updated desktop and extension docs to reflect the hybrid architecture and bridge-local testable state.
- Updated CI, PR, and contributor commands for the current `apps/desktop`, extension, and protocol layout.
- Added GitHub issue templates for bug reports, feature requests, and real audio test reports.
- Removed the placeholder GitHub security contact link until the final repository URL exists.
- Reworked internal implementation prompts into a living execution map with package statuses and next priorities.
- Reordered internal prompts so active/future packages appear first and completed packages remain as history.
- Inserted a `Diagnostic local premium-ready` package before roles/profiles so support-ready local export comes before larger feature expansion.
- Added a future package for OBS plugin/VST feasibility, with product-plan notes that VST processing does not automatically replace Windows per-application control.
- Documented the rule that prompts, roadmap, checklists, GitHub files and `CHANGELOG.md` must be recalibrated after each implementation when relevant.
- Updated bridge docs and tester steps for the hardened local bridge and optional `X-StreamVolume-Guard-Token` header.
- Updated real-source test docs to distinguish `media-html` browser sources from `tab-capture` browser sources.
- Updated tester and maintainer docs for one-shot desktop auto calibration and `volume.auto_locked`.
- Expanded `.gitignore` and PR hygiene checks for all generated folders used by the hybrid repo.
- Added `.cmd` line-ending normalization for Windows launcher scripts.
- Split the active browser-extension README from the legacy public-extension README so GitHub presents the current hybrid direction first.
- Documented the unified local log flow and its privacy boundaries across README, architecture, protocol, maintainer and tester docs.
- Added internal GitHub setup and maintainer onboarding notes.
- Added maintainer hygiene rules to README, AGENTS, product plan, and maintainer checklist.
- Documented that GitHub Project files must be kept in sync with product direction, real test results, and release readiness.
- Restored public `AGENTS.md` files for the hub root and browser-extension scope, with current hybrid guardrails.
- Updated README, architecture, roadmap, prompts and tester checklist for the app-alone, extension-alone and connected bridge modes.
- Updated tester guidance for the `safety-spike` Auto exception and the safer desktop debug/status layout.
- Updated README, architecture, protocol, app READMEs, tester docs, package docs and prompts for the delivered `BrowserGain` priority behavior and its Windows fallback.
- Updated README, architecture, protocol, package tester docs and private prompts for the faster `windows-fast-target` browser fallback rule.
- Marked `Calibration BrowserGain prioritaire` as done in the internal planning docs; the next work is real-source validation and stabilization.
- Moved private planning, prompt, review and maintainer notes into ignored `.docs/` so they are not pushed publicly.
- Corrected active/private documentation links after the `.docs/` migration and updated the tester checklist to point to the generated tester package.

### Notes

- Generated folders were intentionally excluded from the clean hybrid copy.
- Desktop and browser extension remain separate applications inside one repository.




