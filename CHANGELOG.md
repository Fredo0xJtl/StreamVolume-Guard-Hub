# Changelog

All notable changes to StreamVolume Guard Hub are tracked here.

## [Unreleased]

### Added

- Added a desktop Coverage Dashboard that classifies visible sources as `Direct`, `Fallback Windows`, `Action requise`, `Limite`, or `Inconnu`, adds per-source `Couverture` / `Action couverture` columns, logs `coverage.*`, and includes a `Couverture` section in copied readable reports.
- Added a read-only desktop Global Output Monitor that observes the default Windows output device with NAudio loopback, shows global RMS/peak, recent peak, device and Safe/Risky/Silent/Unknown state, and logs `global_output.*` metrics without raw audio or master-volume control.
- Added `global_output.unknown_active` detection so the desktop warns when the Windows mix is active but no known Windows or browser source explains it.
- Added a compact guided test mode in the desktop with `guided_test.started`, `guided_test.step`, and `guided_test.completed` logs for YouTube, TikTok, Spotify Web/Deezer Web, Discord, VLC/local player, game/app, and OBS checks.
- Added a persistent `Stream Safe` desktop toggle that enables Auto and returns to the stable Standard target without adding continuous volume pumping.
- Added an in-app `Guide OBS` action that opens the OBS Stream Safety setup guidance and logs `obs.guide.opened`.

### Changed

- Changed the desktop WPF UI to use the shared `DesktopTextCatalog`: French is selected only when the Windows UI culture starts with `fr`, otherwise the app falls back to English.
- Changed BrowserGain calibration to run only when the desktop bridge is connected. Standalone extension mode now uses the older direct RMS target-gain path again, so the target dB applies as soon as a controllable HTML media source exposes signal.
- Changed browser source diagnostics so `browser_source_observed` carries `captureSignalState`, `browserState`, `reason` and `recommendedAction`; the desktop now shows the extension's exact `Raison` / `Action` guidance for `ObserveOnly`, `Unknown`, `skipped` or `no-signal` sources.
- Changed browser protection back to `media-html` first, matching the older stable extension behavior, then upgrading generically to Chromium `tabCapture` when an audible tab keeps reporting silent or unavailable media HTML evidence. With the desktop bridge connected, Windows fallback remains visible; in standalone mode, `tabCapture` is the last direct-control attempt before an honest `ObserveOnly`.
- Changed standalone extension diagnostics so media HTML limits stay in `mediaHtmlFallbackReason`, while `fallbackRecommended` / `fallbackReason` are reserved for the desktop Windows fallback when the bridge is connected.

### Documentation

- Restructured the root README for GitHub with status, capabilities, non-goals, prerequisites, quick installation paths, browser-extension install tutorials, first-launch checks, troubleshooting, manual tests, logs/privacy, known limits, roadmap, issue-reporting guidance, and license.
- Reordered the future package plan so Microsoft Store readiness comes after real-source tests, clean-folder zip validation, V1 stabilization, and OBS Stream Safety Setup.
- Documented Windows SmartScreen warnings and local tester bypass steps in the root and tester-package READMEs.
- Updated package/project planning docs with current real-source status: YouTube direct `BrowserGain` validated, TikTok Windows fallback validated, and Spotify Web fallback retest promoted to P0.

### Fixed

- Fixed tab-capture diagnostics so an audible live capture that remains silent in Web Audio is rechecked by an offscreen watchdog, reported with `captureFallbackRecommended` / `tab-capture-no-signal`, and keeps the desktop Windows-volume fallback available.
- Fixed cross-site `tab-capture` oscillation by adding a generic in-memory source lock (tab + domain) after `tab-capture-no-signal`; protection now skips immediate retry loops and reuses domain source memory to prefer `media-html` faster on repeat failures.
- Fixed standalone browser behavior so an audible `media-html` source with no controllable HTML media can attempt the generic Chromium `tabCapture` path without requiring the desktop bridge, restoring a possible direct-control path for Spotify Web-like pages before falling back to `ObserveOnly`.
- Fixed standalone target-dB behavior so the extension no longer waits for the hybrid BrowserGain calibration window before changing gain on directly controllable browser media.
- Fixed the browser extension popup state after a failed media fallback: the protection button now stays active for the `tab-capture-no-signal` observe-only fallback instead of turning grey as if protection had stopped.
- Fixed stale browser media markers: when a web player is detected but no active normalizer owns it anymore, the extension clears the orphan `processed` marker and retries the generic media HTML pipeline; popup diagnostics now expose `skippedAlreadyProcessed`.
- Fixed the dynamic-browser fallback path when media HTML reports `mediaDetected > 0` but `mediaProcessed = 0`: the extension now keeps an active desktop-fallback observation instead of treating the unusable HTML fallback as a valid protected state.
- Fixed the dynamic-browser fallback path when media HTML reports no detected media after a `tabCapture` no-signal path: the extension now keeps the explicit desktop fallback active instead of greying the protection button.
- Fixed the browser popup fallback detection so it also accepts normalized `fallbackRecommended` / `fallbackReason` diagnostic fields, not only the internal `captureFallbackRecommended` / `captureFallbackReason` names.
- Fixed the browser popup fallback detection for active `media-html` 0/0 states on tab-capture-first domains, so a temporary missing fallback reason no longer greys the protection button.
- Fixed enabled `media-html` sources with no controllable media, such as Spotify Web in some browser setups, so they report `ObserveOnly` with a clear fallback reason instead of looking like a silent `BrowserGain` source.
- Fixed the extension popup wording for `ObserveOnly` browser sources with a desktop fallback: it now shows `Controle via Windows` / `Windows control` as the main state, keeps no-signal as a diagnostic detail, and reserves `Source incompatible` for sources without an exploitable fallback.
- Fixed standalone extension fallback reporting: the popup now refreshes desktop `/health` on open, protect and diagnostic copy, while the Options diagnostic exports `desktopBridge` and reports `standalone-media-html-unavailable` instead of a fake desktop fallback when the desktop is closed.
- Fixed standalone popup diagnostics so `mediaHtmlFallbackReason=no-media-element-detected` is shown as an HTML media limit instead of looking like an empty or pending diagnostic.
- Fixed standalone extension stability so a `tab-capture-no-signal` source remains visually active in observation/fallback mode when the desktop app is closed, instead of looking like the user toggle switched itself off.
- Fixed Spotify cooldown behavior in the browser extension: a tab in `tab-capture-no-signal` now keeps a persistent `tab-capture` active observation status (`enabled: true`) during backoff, so the popup control no longer flips OFF while probing for Web Audio signal.
- Fixed enabled `media-html` sources that attach to a web player but never expose usable RMS signal: after a short signal watch they now report `fallbackReason=media-html-no-usable-signal` / `ObserveOnly` instead of looking like an active `BrowserGain` source that ignores the target dB.
- Fixed desktop shutdown lifecycle so closing the main window stops timers, detaches bridge handlers, disposes the local bridge, shuts down the WPF app, and prevents duplicate desktop instances from keeping `127.0.0.1:47841` alive.
- Fixed readable desktop reports so the `Couverture` section falls back to visible source observations instead of saying no coverage was calculated when browser or Windows sources are present but no `coverage.*` event was logged yet.
- Fixed the extension popup fallback guard so an explicit desktop fallback with no controllable media stays active instead of looking like a tab that still needs direct protection.
- Fixed the standalone browser fallback state when a protected tab reports `sourceType=media-html`, `mediaDetected=0`, and `mediaProcessed=0`: the popup/diagnostic now keeps `enabled=true` and `mediaHtmlFallbackReason=no-media-element-detected`, then can try generic `tabCapture` if the tab is audible without claiming Windows fallback unless the desktop bridge is connected.
- Fixed Options target application so changing the dB target refreshes every reachable open tab and ignores tabs that cannot receive extension settings, instead of showing `Non appliqué` because one browser/internal tab failed.
- Fixed popup diagnostics on Brave/Chromium so the background falls back from `currentWindow` to the last focused browser tab, preventing Spotify/YouTube diagnostics from returning an empty `site` with `sourceType=unknown`.
- Fixed popup diagnostics again so the popup passes its real active `tabId` to the background and disables the diagnostic button while the clipboard export is running.
- Fixed popup diagnostic copy responsiveness: `Copier diagnostic` now writes the already displayed local state immediately, without waiting for a forced tab refresh or desktop bridge health check that can expire clipboard permission.
- Fixed local bridge calls so `/health`, `/global-target`, `/browser-source`, and `/extension-log` use a short timeout when the desktop app is closed.
- Fixed Options diagnostics so an export launched from the Options page can select an observed media tab instead of reporting the Options page as `site=""` / `sourceType=unknown`.
- Fixed browser tab classification when Chromium does not expose `tab.url`: the background can now recover the site from the injected content script before choosing `BrowserGain`, `tabCapture`, or fallback status.
- Fixed popup active-tab diagnostics so a provided `tabId` no longer returns an empty unknown status before trying content-script site recovery.
- Fixed `tab-capture-no-signal` fallback reporting so the extension stops the unusable tab capture before publishing a `media-html` / desktop fallback, preventing stale `tab-capture live` diagnostics and reducing capture-path crackle on unsupported browser sources.
- Fixed over-eager browser fallback classification: protected tabs no longer jump straight to `Controle via Windows` / `diagnosticDesktopFallbackRequired` just because `media-html` has not detected a media element yet.
- Fixed `media-html` no-media diagnostics so the content script republishes a fallback status when the short detection window expires, allowing an audible tab to trigger the generic `tabCapture` upgrade instead of only showing the reason when a diagnostic is copied.
- Fixed browser diagnostics so `media-html` statuses keep `tabAudible` and `tabActive` from the Chromium tab, making Spotify/YouTube fallback decisions easier to read.
- Fixed protected tab state persistence so settings refreshes and target dB changes no longer turn an active `media-html` tab back into `enabled=false`; explicit user stop or exclusion still disables it.
- Fixed the generic `media-html` to `tabCapture` upgrade so the extension no longer disables the HTML fallback before tab capture has actually started, preventing Spotify Web-like tabs from ending in `tabAudible=true` but `enabled=false`.
- Fixed browser source classification with a shared state machine: `media-html-starting`, `media-html-signal`, `media-html-no-signal`, `tab-capture-starting`, `tab-capture-signal`, `tab-capture-no-signal`, `observe-only`, and `desktop-fallback-available` now map consistently to `BrowserGain`, `ObserveOnly` or fallback guidance without fake control.
- Fixed standalone Spotify-like diagnostics after a failed `tabCapture`: `tab-capture-no-signal` now stays in `captureFallbackReason` / `browserState`, while `mediaHtmlFallbackReason` stays reserved for the HTML media limit such as `no-controllable-media-detected`.
- Fixed popup toggle rendering so it reflects protection on the current tab instead of briefly showing the global extension setting as active.
- Fixed the popup activation switch so it stays visually active when the extension is globally enabled but the current tab is still `unknown` / `active-tab-empty`.
- Added popup diagnostic routing fields (`globalEnabled`, `visualEnabled`, `popupTabIdKnown`, `statusRoute`, `diagnosticReason`, `statusError`) so `site=""` reports expose the failing layer without leaking page URL or title.
- Fixed the browser-extension background runtime listener so it no longer uses an `async` `onMessage` callback. Chromium now keeps `sendResponse` alive, preventing empty responses that made popup diagnostics look successful without a site and made Options report `Non appliqué`.
- Fixed popup runtime handling so an empty background response is exported as `runtime-empty-response` instead of a false `statusOk=true`.

## [0.1.0-alpha.1] - 2026-07-04

### Added

- Created clean hybrid monorepo folder.
- Added root MIT `LICENSE`.
- Added shared .NET assembly metadata through `Directory.Build.props`.
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
- Added CI tester-package artifact upload with the generated zip and SHA256 file.

### Changed

- Renamed the public project presentation to StreamVolume Guard Hub while keeping the local working folder path stable for tester commands.
- Bumped the Chromium extension manifest version to `0.1.5` so Brave/Chromium can replace earlier `0.1.4` installs during tester reloads.
- Aligned the legacy browser-extension release packager default version to `0.1.5`.
- Changed desktop `Auto actif` to apply one automatic Windows-volume calibration per active source, then lock further changes until sustained silence or session disappearance. Locked decisions are logged as `volume.auto_locked`.
- Changed desktop global target updates to rearm one-shot Windows calibration before the immediate refresh, so a new target can trigger one fresh correction.
- Changed extension live source forwarding to sync changed desktop `/global-target` values and refresh already open protected tabs.
- Changed extension browser source messages to include the applied target metadata (`targetRmsDb`, `targetProfile`) when available.
- Changed optional bridge token handling so `/global-target` is protected when `BridgeToken` is configured, while `/health` remains open for local diagnostics.
- Changed optional bridge token handling so `/extension-log` is also protected when `BridgeToken` is configured.
- Changed the default browser strategy to `BrowserGainPriority`: when the extension controls a real browser source, the desktop no longer moves the matching browser Windows session at the same time.
- Changed browser fallback handling so `ObserveOnly`, `Unknown`, `skipped`, stale or disappeared browser sources can still use `WindowsSessionVolume` when appropriate.
- Changed desktop/browser arbitration so target changes apply a fast visible Windows fallback even for browser sessions, while `BrowserGain` only blocks Windows after the browser source is locked and stable.
- Changed BrowserGain calibration to use a robust 18-second analysis window, require about 8 seconds of useful non-silent signal, use a median-style global tone measurement, avoid boosting before the window is reliable, and apply temporary safety attenuation only for dangerously loud starts.
- Changed BrowserGain target changes so an already locked source recalculates its gain immediately from the reliable measured level instead of waiting for a full new 18-second window.
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
- Changed tester packaging to create a self-contained `win-x64` desktop package, copy the root license, and generate both `StreamVolumeGuardHub-Tester-v0.1.0-alpha.1.zip` and its SHA256 checksum.
- Documented browser-specific extension loading steps for Chrome, Brave, Edge, temporary Firefox desktop testing, and unsupported Safari/Firefox Android alpha paths.

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
- Reworked the privacy policy around the full Hub architecture: desktop, extension, bridge local, logs, permissions, no telemetry, and no audio upload.
- Updated release, tester, maintainer, contributor, README, and GitHub Project docs for self-contained packaging, checksum, license, CI artifact upload, and unsigned Windows alpha limits.

### Notes

- Generated folders were intentionally excluded from the clean hybrid copy.
- Desktop and browser extension remain separate applications inside one repository.
