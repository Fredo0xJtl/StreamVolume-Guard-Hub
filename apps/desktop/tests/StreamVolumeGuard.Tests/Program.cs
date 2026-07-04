using System.Text;
using StreamVolumeGuard.Core.Audio;
using StreamVolumeGuard.Core.Browser;
using StreamVolumeGuard.Core.Bridge;
using StreamVolumeGuard.Core.Config;
using StreamVolumeGuard.Core.Control;
using StreamVolumeGuard.Core.Logging;
using StreamVolumeGuard.Core.Normalization;

var tests = new List<(string Name, Action Test)>
{
    ("risky session is reduced without process name", RiskySessionIsReducedWithoutProcessName),
    ("low session is raised gently without process name", LowSessionIsRaisedGentlyWithoutProcessName),
    ("system session low level is not boosted", SystemSessionLowLevelIsNotBoosted),
    ("excluded session is never changed", ExcludedSessionIsNeverChanged),
    ("muted session is reported but not unmuted", MutedSessionIsReportedButNotUnmuted),
    ("manual cooldown prevents immediate correction", ManualCooldownPreventsImmediateCorrection),
    ("manual tracker stores latest change per session", ManualTrackerStoresLatestChange),
    ("panic lowers controllable non-excluded sessions only", PanicLowersControllableNonExcludedSessionsOnly),
    ("observation mode logs would apply without setting volume", ObservationModeLogsWouldApplyWithoutSettingVolume),
    ("active auto applies volume without would apply log", ActiveAutoAppliesVolumeWithoutWouldApplyLog),
    ("auto calibration gate allows one correction per active source", AutoCalibrationGateAllowsOneCorrectionPerActiveSource),
    ("auto calibration gate allows safety correction on sudden risky spike", AutoCalibrationGateAllowsSafetyCorrectionOnSuddenRiskySpike),
    ("auto calibration gate resets after sustained silence", AutoCalibrationGateResetsAfterSustainedSilence),
    ("auto calibration gate clears disappeared sessions", AutoCalibrationGateClearsDisappearedSessions),
    ("auto calibration gate preserves non applying decisions", AutoCalibrationGatePreservesNonApplyingDecisions),
    ("session reference volume store keeps first seen and manual reference", SessionReferenceVolumeStoreKeepsFirstSeenAndManualReference),
    ("windows manual volume override detector detects jump to high volume", WindowsManualVolumeOverrideDetectorDetectsJumpToHighVolume),
    ("windows manual volume override detector ignores first seen high volume", WindowsManualVolumeOverrideDetectorIgnoresFirstSeenHighVolume),
    ("target profile policy uses absolute Windows mixer percentages", TargetProfilePolicyUsesAbsoluteWindowsMixerPercentages),
    ("target profile policy allows custom fifteen percent floor", TargetProfilePolicyAllowsCustomFifteenPercentFloor),
    ("target profile policy keeps safety spike above custom floor", TargetProfilePolicyKeepsSafetySpikeAboveCustomFloor),
    ("target profile policy keeps safety spike above active profile target", TargetProfilePolicyKeepsSafetySpikeAboveActiveProfileTarget),
    ("target profile policy respects manual cooldown", TargetProfilePolicyRespectsManualCooldown),
    ("target profile policy never boosts system sounds", TargetProfilePolicyNeverBoostsSystemSounds),
    ("browser source snapshot keeps capability data", BrowserSourceSnapshotKeepsCapabilityData),
    ("browser source store removes stale sources", BrowserSourceStoreRemovesStaleSources),
    ("browser source store preserves recent browser gain during observe-only flap", BrowserSourceStorePreservesRecentBrowserGainDuringObserveOnlyFlap),
    ("browser gain priority is default and blocks browser session auto correction", BrowserGainPriorityIsDefaultAndBlocksBrowserSessionAutoCorrection),
    ("browser global control allows browser session auto correction", BrowserGlobalControlAllowsBrowserSessionAutoCorrection),
    ("browser gain priority can still block browser session auto correction", BrowserGainPriorityCanStillBlockBrowserSessionAutoCorrection),
    ("browser gain priority allows measuring browser gain fallback", BrowserGainPriorityAllowsMeasuringBrowserGainFallback),
    ("browser gain priority allows profile target fast fallback", BrowserGainPriorityAllowsProfileTargetFastFallback),
    ("browser gain priority blocks chromium alias browser sessions", BrowserGainPriorityBlocksChromiumAliasBrowserSessions),
    ("browser global control allows recent observe-only browser history", BrowserGlobalControlAllowsRecentObserveOnlyBrowserHistory),
    ("browser gain priority allows recent observe-only browser history fallback", BrowserGainPriorityAllowsRecentObserveOnlyBrowserHistoryFallback),
    ("stable observe-only browser source allows session correction", StableObserveOnlyBrowserSourceAllowsSessionCorrection),
    ("observe-only browser source does not block session correction", ObserveOnlyBrowserSourceDoesNotBlockSessionCorrection),
    ("stale browser gain source does not block session correction", StaleBrowserGainSourceDoesNotBlockSessionCorrection),
    ("bridge parser accepts valid browser source message", BridgeParserAcceptsValidBrowserSourceMessage),
    ("bridge parser rejects invalid message type", BridgeParserRejectsInvalidMessageType),
    ("bridge parser rejects missing source id", BridgeParserRejectsMissingSourceId),
    ("bridge parser rejects invalid control surface", BridgeParserRejectsInvalidControlSurface),
    ("bridge parser rejects missing is controllable", BridgeParserRejectsMissingIsControllable),
    ("bridge parser rejects inconsistent control capability", BridgeParserRejectsInconsistentControlCapability),
    ("bridge parser accepts privacy safe extension log", BridgeParserAcceptsPrivacySafeExtensionLog),
    ("bridge http parser keeps utf8 body by byte length", BridgeHttpParserKeepsUtf8BodyByByteLength),
    ("bridge http parser rejects oversized body", BridgeHttpParserRejectsOversizedBody),
    ("bridge access policy allows extension and local origins only", BridgeAccessPolicyAllowsExtensionAndLocalOriginsOnly),
    ("bridge access policy validates optional token", BridgeAccessPolicyValidatesOptionalToken),
    ("bridge access policy requires token for target state", BridgeAccessPolicyRequiresTokenForTargetState),
    ("local bridge server exposes extension log endpoint", LocalBridgeServerExposesExtensionLogEndpoint),
    ("desktop shows extension link as connected or standalone", DesktopShowsExtensionLinkAsConnectedOrStandalone),
    ("desktop extension link avoids cramped summary card", DesktopExtensionLinkAvoidsCrampedSummaryCard),
    ("desktop debug actions avoid horizontal overflow", DesktopDebugActionsAvoidHorizontalOverflow),
    ("desktop browser sources show calibration state", DesktopBrowserSourcesShowCalibrationState),
    ("desktop exposes manual test sessions", DesktopExposesManualTestSessions),
    ("desktop new test captures mixer snapshot without rearming calibration", DesktopNewTestCapturesMixerSnapshotWithoutRearmingCalibration),
    ("desktop manual windows volume override switches target to loud", DesktopManualWindowsVolumeOverrideSwitchesTargetToLoud),
    ("desktop startup aligns target to Windows volume without setting volume", DesktopStartupAlignsTargetToWindowsVolumeWithoutSettingVolume),
    ("desktop launcher avoids stale WPF build cache", DesktopLauncherAvoidsStaleWpfBuildCache),
    ("tester package has reproducible Windows launcher", TesterPackageHasReproducibleWindowsLauncher),
    ("activity log writes sanitized event line", ActivityLogWritesSanitizedEventLine),
    ("activity log reads recent lines", ActivityLogReadsRecentLines),
    ("activity log adds run and test session ids", ActivityLogAddsRunAndTestSessionIds),
    ("activity log filters recent lines by test session", ActivityLogFiltersRecentLinesByTestSession),
    ("activity log formats readable test report", ActivityLogFormatsReadableTestReport),
    ("app config store returns default when missing", AppConfigStoreReturnsDefaultWhenMissing),
    ("app config store persists auto theme and exclusions", AppConfigStorePersistsAutoAndExclusions),
    ("app config store persists target profile", AppConfigStorePersistsTargetProfile),
    ("normalizer settings adapt to target decibels", NormalizerSettingsAdaptToTargetDecibels),
    ("desktop target change rearms one shot calibration", DesktopTargetChangeRearmsOneShotCalibration),
    ("desktop same target does not rearm one shot calibration", DesktopSameTargetDoesNotRearmOneShotCalibration),
    ("desktop target presets suppress duplicate slider logs", DesktopTargetPresetsSuppressDuplicateSliderLogs),
    ("desktop target slider debounces save and refresh", DesktopTargetSliderDebouncesSaveAndRefresh),
    ("app config store normalizes excluded sessions", AppConfigStoreNormalizesExcludedSessions),
    ("app config store persists bridge token", AppConfigStorePersistsBridgeToken),
    ("desktop exclusion checkbox updates on first click", DesktopExclusionCheckboxUpdatesOnFirstClick),
    ("desktop target controls are simple and generic", DesktopTargetControlsAreSimpleAndGeneric),
    ("system audio service sessions are grouped for display", SystemAudioServiceSessionsAreGroupedForDisplay),
    ("system session group decision keeps highest risk status", SystemSessionGroupDecisionKeepsHighestRiskStatus)
};

var failed = 0;
foreach (var (name, test) in tests)
{
    try
    {
        test();
        Console.WriteLine($"PASS {name}");
    }
    catch (Exception ex)
    {
        failed++;
        Console.WriteLine($"FAIL {name}: {ex.Message}");
    }
}

if (failed > 0)
{
    Environment.Exit(1);
}

static void RiskySessionIsReducedWithoutProcessName()
{
    var normalizer = new VolumeNormalizer(NormalizerSettings.StreamDefault);
    var snapshot = TestSession(peak: 0.92f, volume: 0.80f, processName: null);

    var decision = normalizer.Evaluate(snapshot, DateTimeOffset.UtcNow);

    AssertEqual(AudioSessionStatus.Risky, decision.Status, "status");
    AssertTrue(decision.ShouldApplyVolume, "volume should change");
    AssertTrue(decision.TargetVolumeScalar < snapshot.VolumeScalar, "target should go down");
    AssertEqual("peak-above-target", decision.Reason, "reason");
}

static void LowSessionIsRaisedGentlyWithoutProcessName()
{
    var normalizer = new VolumeNormalizer(NormalizerSettings.StreamDefault);
    var snapshot = TestSession(peak: 0.05f, volume: 0.40f, processName: null);

    var decision = normalizer.Evaluate(snapshot, DateTimeOffset.UtcNow);

    AssertEqual(AudioSessionStatus.Low, decision.Status, "status");
    AssertTrue(decision.ShouldApplyVolume, "volume should change");
    AssertTrue(decision.TargetVolumeScalar > snapshot.VolumeScalar, "target should go up");
    AssertTrue(decision.TargetVolumeScalar - snapshot.VolumeScalar <= NormalizerSettings.StreamDefault.MaxStepUp + 0.0001f, "raise should be gentle");
}

static void SystemSessionLowLevelIsNotBoosted()
{
    var normalizer = new VolumeNormalizer(NormalizerSettings.StreamDefault);
    var snapshot = TestSession(peak: 0.02f, volume: 0.40f, isSystemSession: true, displayName: WindowsSystemSessionClassifier.DisplayName);

    var decision = normalizer.Evaluate(snapshot, DateTimeOffset.UtcNow);

    AssertEqual(AudioSessionStatus.Safe, decision.Status, "status");
    AssertFalse(decision.ShouldApplyVolume, "system sounds should not be boosted automatically");
    AssertEqual(0.40f, decision.TargetVolumeScalar, "target should stay current");
    AssertEqual(WindowsSystemSessionClassifier.ProtectOnlyReason, decision.Reason, "reason");
}

static void ExcludedSessionIsNeverChanged()
{
    var normalizer = new VolumeNormalizer(NormalizerSettings.StreamDefault);
    var snapshot = TestSession(peak: 1.0f, volume: 0.9f, isExcluded: true);

    var decision = normalizer.Evaluate(snapshot, DateTimeOffset.UtcNow);

    AssertEqual(AudioSessionStatus.Excluded, decision.Status, "status");
    AssertFalse(decision.ShouldApplyVolume, "excluded should not change");
    AssertEqual(snapshot.VolumeScalar, decision.TargetVolumeScalar, "volume");
}

static void MutedSessionIsReportedButNotUnmuted()
{
    var normalizer = new VolumeNormalizer(NormalizerSettings.StreamDefault);
    var snapshot = TestSession(peak: 0.01f, volume: 0.0f, isMuted: true);

    var decision = normalizer.Evaluate(snapshot, DateTimeOffset.UtcNow);

    AssertEqual(AudioSessionStatus.Muted, decision.Status, "status");
    AssertFalse(decision.ShouldApplyVolume, "muted source should not be unmuted");
    AssertEqual(0.0f, decision.TargetVolumeScalar, "volume");
}

static void ManualCooldownPreventsImmediateCorrection()
{
    var now = DateTimeOffset.UtcNow;
    var normalizer = new VolumeNormalizer(NormalizerSettings.StreamDefault);
    var snapshot = TestSession(peak: 1.0f, volume: 0.9f, lastManualChangeUtc: now.AddSeconds(-2));

    var decision = normalizer.Evaluate(snapshot, now);

    AssertEqual(AudioSessionStatus.Safe, decision.Status, "status during manual cooldown");
    AssertFalse(decision.ShouldApplyVolume, "manual cooldown should block auto correction");
}

static void ManualTrackerStoresLatestChange()
{
    var tracker = new ManualOverrideTracker();
    var when = DateTimeOffset.UtcNow;

    tracker.RecordManualChange("session-a", when);

    AssertEqual(when, tracker.GetLastManualChangeUtc("session-a"), "manual timestamp");
    AssertEqual<DateTimeOffset?>(null, tracker.GetLastManualChangeUtc("session-b"), "missing session");
}

static void PanicLowersControllableNonExcludedSessionsOnly()
{
    var panic = new PanicService(panicTargetVolume: 0.15f);
    var sessions = new[]
    {
        TestSession(peak: 0.5f, volume: 0.8f),
        TestSession(peak: 0.5f, volume: 0.8f, isExcluded: true),
        TestSession(peak: 0.5f, volume: 0.0f, isMuted: true),
        TestSession(peak: 0.5f, volume: 0.8f, isControllable: false)
    };

    var decisions = panic.Apply(sessions).ToList();

    AssertTrue(decisions[0].ShouldApplyVolume, "first session should be lowered");
    AssertEqual(0.15f, decisions[0].TargetVolumeScalar, "panic target");
    AssertFalse(decisions[1].ShouldApplyVolume, "excluded session should not change");
    AssertFalse(decisions[2].ShouldApplyVolume, "muted session should not change");
    AssertFalse(decisions[3].ShouldApplyVolume, "uncontrollable session should not change");
}



static void ObservationModeLogsWouldApplyWithoutSettingVolume()
{
    var policy = new AutoApplyPolicy();
    var decision = new VolumeDecision(AudioSessionStatus.Risky, ShouldApplyVolume: true, TargetVolumeScalar: 0.42f, Reason: "peak-above-target");

    var plan = policy.Evaluate(decision, autoEnabled: false);

    AssertFalse(plan.ShouldSetVolume, "observation mode must not set volume");
    AssertTrue(plan.ShouldLogWouldApply, "observation mode should log would-apply");
    AssertEqual(0.42f, plan.TargetVolumeScalar, "target volume");
}

static void ActiveAutoAppliesVolumeWithoutWouldApplyLog()
{
    var policy = new AutoApplyPolicy();
    var decision = new VolumeDecision(AudioSessionStatus.Low, ShouldApplyVolume: true, TargetVolumeScalar: 0.68f, Reason: "peak-below-target");

    var plan = policy.Evaluate(decision, autoEnabled: true);

    AssertTrue(plan.ShouldSetVolume, "active auto should set volume");
    AssertFalse(plan.ShouldLogWouldApply, "active auto should not log would-apply");
    AssertEqual(0.68f, plan.TargetVolumeScalar, "target volume");
}

static void AutoCalibrationGateAllowsOneCorrectionPerActiveSource()
{
    var now = new DateTimeOffset(2026, 7, 2, 14, 0, 0, TimeSpan.Zero);
    var gate = new AutoCalibrationGate(new AutoCalibrationGateSettings(TimeSpan.FromSeconds(5), 0.02f));
    var firstSession = TestSession(peak: 0.90f, volume: 1.00f, sessionId: "session-a");
    var firstDecision = new VolumeDecision(AudioSessionStatus.Risky, ShouldApplyVolume: true, TargetVolumeScalar: 0.92f, Reason: "peak-above-target");

    var first = gate.Evaluate(firstSession, firstDecision, now);
    gate.RecordApplied(firstSession, now);

    var nextSession = TestSession(peak: 0.88f, volume: 0.92f, sessionId: "session-a");
    var nextDecision = new VolumeDecision(AudioSessionStatus.Risky, ShouldApplyVolume: true, TargetVolumeScalar: 0.84f, Reason: "peak-above-target");
    var second = gate.Evaluate(nextSession, nextDecision, now.AddSeconds(1));

    AssertTrue(first.ShouldApplyVolume, "first active correction should pass");
    AssertFalse(second.ShouldApplyVolume, "second correction should be locked");
    AssertEqual(AudioSessionStatus.Risky, second.Status, "status should stay honest while locked");
    AssertEqual("auto-calibration-locked", second.Reason, "locked reason");
    AssertEqual(0.92f, second.TargetVolumeScalar, "locked target should keep current volume");
}

static void AutoCalibrationGateAllowsSafetyCorrectionOnSuddenRiskySpike()
{
    var now = new DateTimeOffset(2026, 7, 2, 14, 0, 0, TimeSpan.Zero);
    var gate = new AutoCalibrationGate(new AutoCalibrationGateSettings(TimeSpan.FromSeconds(5), 0.02f));
    var firstSession = TestSession(peak: 0.13f, volume: 0.08f, sessionId: "browser-session");

    gate.RecordApplied(firstSession, now);

    var spikeSession = TestSession(peak: 0.93f, volume: 0.11f, sessionId: "browser-session");
    var spikeDecision = new VolumeDecision(AudioSessionStatus.Risky, ShouldApplyVolume: true, TargetVolumeScalar: 0.08f, Reason: "peak-above-target");
    var result = gate.Evaluate(spikeSession, spikeDecision, now.AddSeconds(10));

    AssertTrue(result.ShouldApplyVolume, "sudden risky spike should bypass the one-shot lock");
    AssertEqual(AudioSessionStatus.Risky, result.Status, "status");
    AssertEqual("safety-spike", result.Reason, "reason");
    AssertEqual(0.08f, result.TargetVolumeScalar, "target");
}

static void AutoCalibrationGateResetsAfterSustainedSilence()
{
    var now = new DateTimeOffset(2026, 7, 2, 14, 0, 0, TimeSpan.Zero);
    var gate = new AutoCalibrationGate(new AutoCalibrationGateSettings(TimeSpan.FromSeconds(5), 0.02f));
    var activeSession = TestSession(peak: 0.90f, volume: 1.00f, sessionId: "session-a");

    gate.RecordApplied(activeSession, now);

    var quietSession = TestSession(peak: 0.00f, volume: 0.92f, sessionId: "session-a");
    var lowDecision = new VolumeDecision(AudioSessionStatus.Low, ShouldApplyVolume: true, TargetVolumeScalar: 0.95f, Reason: "peak-below-target");
    var firstQuiet = gate.Evaluate(quietSession, lowDecision, now.AddSeconds(1));
    var afterSilence = gate.Evaluate(quietSession, lowDecision, now.AddSeconds(7));

    var restartedSession = TestSession(peak: 0.82f, volume: 0.92f, sessionId: "session-a");
    var restartedDecision = new VolumeDecision(AudioSessionStatus.Risky, ShouldApplyVolume: true, TargetVolumeScalar: 0.84f, Reason: "peak-above-target");
    var restarted = gate.Evaluate(restartedSession, restartedDecision, now.AddSeconds(8));

    AssertFalse(firstQuiet.ShouldApplyVolume, "locked source should not be raised during a quiet gap");
    AssertEqual("auto-calibration-locked", firstQuiet.Reason, "first quiet reason");
    AssertFalse(afterSilence.ShouldApplyVolume, "silence itself should not trigger a low-volume raise");
    AssertEqual("source-silent", afterSilence.Reason, "silence reason");
    AssertTrue(restarted.ShouldApplyVolume, "new signal after sustained silence should be calibratable again");
}

static void AutoCalibrationGateClearsDisappearedSessions()
{
    var now = new DateTimeOffset(2026, 7, 2, 14, 0, 0, TimeSpan.Zero);
    var gate = new AutoCalibrationGate(new AutoCalibrationGateSettings(TimeSpan.FromSeconds(5), 0.02f));
    var session = TestSession(peak: 0.90f, volume: 1.00f, sessionId: "session-a");
    var decision = new VolumeDecision(AudioSessionStatus.Risky, ShouldApplyVolume: true, TargetVolumeScalar: 0.92f, Reason: "peak-above-target");

    gate.RecordApplied(session, now);
    gate.RemoveMissing(Array.Empty<string>());

    var afterDisappearance = gate.Evaluate(session, decision, now.AddSeconds(1));

    AssertTrue(afterDisappearance.ShouldApplyVolume, "disappeared session should be rearmed when it comes back");
}

static void AutoCalibrationGatePreservesNonApplyingDecisions()
{
    var now = new DateTimeOffset(2026, 7, 2, 14, 0, 0, TimeSpan.Zero);
    var gate = new AutoCalibrationGate(new AutoCalibrationGateSettings(TimeSpan.FromSeconds(5), 0.02f));
    var mutedSession = TestSession(peak: 0.00f, volume: 0.00f, isMuted: true, sessionId: "session-a");
    var mutedDecision = new VolumeDecision(AudioSessionStatus.Muted, ShouldApplyVolume: false, TargetVolumeScalar: 0.00f, Reason: "muted");

    var result = gate.Evaluate(mutedSession, mutedDecision, now);

    AssertEqual(AudioSessionStatus.Muted, result.Status, "muted status should not be hidden by source-silent");
    AssertFalse(result.ShouldApplyVolume, "muted source should stay non-applying");
    AssertEqual("muted", result.Reason, "muted reason should be preserved");
}

static void SessionReferenceVolumeStoreKeepsFirstSeenAndManualReference()
{
    var store = new SessionReferenceVolumeStore();
    var first = TestSession(peak: 0.20f, volume: 0.90f, sessionId: "firefox-session");
    var later = first with { VolumeScalar = 0.50f };

    AssertEqual(0.90f, store.GetOrAdd(first), "first seen reference");
    AssertEqual(0.90f, store.GetOrAdd(later), "auto changes should not rewrite reference");

    store.Update(first.SessionId, 0.72f);
    AssertEqual(0.72f, store.GetOrAdd(later), "manual slider should become reference");

    store.RemoveMissing(Array.Empty<string>());
    AssertEqual(0.50f, store.GetOrAdd(later), "newly seen session should capture current volume after disappearance");
}

static void WindowsManualVolumeOverrideDetectorDetectsJumpToHighVolume()
{
    var detector = new WindowsManualVolumeOverrideDetector();
    var quiet = TestSession(peak: 0.20f, volume: 0.60f, sessionId: "firefox-session", displayName: "Firefox");
    var loud = quiet with { VolumeScalar = 1.00f };

    AssertTrue(detector.Detect(new[] { quiet }) is null, "first observation should only seed the detector");
    var detected = detector.Detect(new[] { loud });

    AssertTrue(detected is not null, "manual jump to high volume should be detected");
    AssertEqual("firefox-session", detected!.SessionId, "session id");
    AssertEqual(0.60f, detected.PreviousVolumeScalar, "previous volume");
    AssertEqual(1.00f, detected.CurrentVolumeScalar, "current volume");
}

static void WindowsManualVolumeOverrideDetectorIgnoresFirstSeenHighVolume()
{
    var detector = new WindowsManualVolumeOverrideDetector();
    var firstSeenHigh = TestSession(peak: 0.20f, volume: 1.00f, sessionId: "new-session", displayName: "New app");

    var detected = detector.Detect(new[] { firstSeenHigh });

    AssertTrue(detected is null, "first seen high volume should not be treated as a manual override");
}

static void TargetProfilePolicyUsesAbsoluteWindowsMixerPercentages()
{
    var policy = new TargetVolumeProfilePolicy();
    var baseDecision = new VolumeDecision(AudioSessionStatus.Safe, ShouldApplyVolume: false, TargetVolumeScalar: 1.00f, Reason: "inside-target-band");
    var loudSession = TestSession(peak: 0.30f, volume: 1.00f, sessionId: "firefox-session");

    var quiet = policy.Apply(loudSession, baseDecision, new GlobalTargetSettings(GlobalTargetSettings.QuietProfile, GlobalTargetSettings.QuietDecibels));
    AssertTrue(quiet.ShouldApplyVolume, "quiet profile should lower the source to forty percent of the Windows mixer");
    AssertEqual(0.40f, quiet.TargetVolumeScalar, "quiet target");
    AssertEqual("profile-target", quiet.Reason, "quiet reason");

    var quietedSession = loudSession with { VolumeScalar = quiet.TargetVolumeScalar };
    var standard = policy.Apply(quietedSession, baseDecision with { TargetVolumeScalar = quietedSession.VolumeScalar }, new GlobalTargetSettings(GlobalTargetSettings.StandardProfile, GlobalTargetSettings.StandardDecibels));
    AssertTrue(standard.ShouldApplyVolume, "standard profile should restore toward seventy percent of the Windows mixer");
    AssertEqual(0.70f, standard.TargetVolumeScalar, "standard target");
    AssertEqual(AudioSessionStatus.Low, standard.Status, "standard restore status");

    var lowBrowserSession = loudSession with { VolumeScalar = 0.40f, SessionId = "brave-session", DisplayName = "Brave" };
    var loud = policy.Apply(lowBrowserSession, baseDecision with { TargetVolumeScalar = lowBrowserSession.VolumeScalar }, new GlobalTargetSettings(GlobalTargetSettings.LoudProfile, GlobalTargetSettings.LoudDecibels));
    AssertTrue(loud.ShouldApplyVolume, "loud profile should raise a browser from forty percent to full Windows mixer volume");
    AssertEqual(1.00f, loud.TargetVolumeScalar, "loud target");
    AssertEqual(AudioSessionStatus.Low, loud.Status, "loud restore status");
}

static void TargetProfilePolicyAllowsCustomFifteenPercentFloor()
{
    var policy = new TargetVolumeProfilePolicy();
    var baseDecision = new VolumeDecision(AudioSessionStatus.Safe, ShouldApplyVolume: false, TargetVolumeScalar: 1.00f, Reason: "inside-target-band");
    var session = TestSession(peak: 0.30f, volume: 1.00f, sessionId: "firefox-session");

    var custom = policy.Apply(session, baseDecision, new GlobalTargetSettings(GlobalTargetSettings.CustomProfile, GlobalTargetSettings.MinDecibels));

    AssertTrue(custom.ShouldApplyVolume, "custom minimum should lower the source");
    AssertEqual(0.15f, custom.TargetVolumeScalar, "custom minimum target");
    AssertEqual("profile-target", custom.Reason, "custom minimum reason");
}

static void TargetProfilePolicyKeepsSafetySpikeAboveCustomFloor()
{
    var policy = new TargetVolumeProfilePolicy();
    var floorSession = TestSession(peak: 1.00f, volume: 0.15f, sessionId: "brave-session");
    var spikeDecision = new VolumeDecision(AudioSessionStatus.Risky, ShouldApplyVolume: true, TargetVolumeScalar: 0.08f, Reason: "peak-above-target");

    var result = policy.Apply(floorSession, spikeDecision, new GlobalTargetSettings(GlobalTargetSettings.CustomProfile, GlobalTargetSettings.MinDecibels));

    AssertFalse(result.ShouldApplyVolume, "safety spike should not push below the custom minimum floor");
    AssertEqual(0.15f, result.TargetVolumeScalar, "custom minimum floor target");
}

static void TargetProfilePolicyKeepsSafetySpikeAboveActiveProfileTarget()
{
    var policy = new TargetVolumeProfilePolicy();
    var standardSession = TestSession(peak: 1.00f, volume: 0.70f, sessionId: "brave-session");
    var spikeDecision = new VolumeDecision(AudioSessionStatus.Risky, ShouldApplyVolume: true, TargetVolumeScalar: 0.62f, Reason: AutoCalibrationGate.SafetySpikeReason);

    var result = policy.Apply(standardSession, spikeDecision, new GlobalTargetSettings(GlobalTargetSettings.StandardProfile, GlobalTargetSettings.StandardDecibels));

    AssertFalse(result.ShouldApplyVolume, "safety spike should not push below the selected Standard profile target");
    AssertEqual(0.70f, result.TargetVolumeScalar, "standard profile floor target");
}

static void TargetProfilePolicyRespectsManualCooldown()
{
    var policy = new TargetVolumeProfilePolicy();
    var manualSession = TestSession(peak: 0.30f, volume: 1.00f, sessionId: "firefox-session");
    var manualCooldown = new VolumeDecision(AudioSessionStatus.Safe, ShouldApplyVolume: false, TargetVolumeScalar: 1.00f, Reason: VolumeNormalizer.ManualCooldownReason);

    var result = policy.Apply(manualSession, manualCooldown, new GlobalTargetSettings(GlobalTargetSettings.QuietProfile, GlobalTargetSettings.QuietDecibels));

    AssertFalse(result.ShouldApplyVolume, "manual cooldown should block profile auto movement");
    AssertEqual(1.00f, result.TargetVolumeScalar, "manual target should stay current");
    AssertEqual(VolumeNormalizer.ManualCooldownReason, result.Reason, "manual reason");
}

static void TargetProfilePolicyNeverBoostsSystemSounds()
{
    var policy = new TargetVolumeProfilePolicy();
    var baseDecision = new VolumeDecision(AudioSessionStatus.Safe, ShouldApplyVolume: false, TargetVolumeScalar: 0.40f, Reason: WindowsSystemSessionClassifier.ProtectOnlyReason);
    var systemSession = TestSession(peak: 0.05f, volume: 0.40f, isSystemSession: true, displayName: WindowsSystemSessionClassifier.DisplayName);

    var loud = policy.Apply(systemSession, baseDecision, new GlobalTargetSettings(GlobalTargetSettings.LoudProfile, GlobalTargetSettings.LoudDecibels));

    AssertFalse(loud.ShouldApplyVolume, "loud profile should not raise system sounds");
    AssertEqual(0.40f, loud.TargetVolumeScalar, "system sounds should keep current volume");
    AssertEqual(WindowsSystemSessionClassifier.ProtectOnlyReason, loud.Reason, "loud reason");

    var highSystemSession = systemSession with { VolumeScalar = 1.00f, PeakLevel = 0.95f };
    var riskyDecision = new VolumeDecision(AudioSessionStatus.Risky, ShouldApplyVolume: true, TargetVolumeScalar: 0.92f, Reason: "peak-above-target");
    var quiet = policy.Apply(highSystemSession, riskyDecision, new GlobalTargetSettings(GlobalTargetSettings.QuietProfile, GlobalTargetSettings.QuietDecibels));

    AssertTrue(quiet.ShouldApplyVolume, "quiet profile can lower system sounds");
    AssertEqual(0.40f, quiet.TargetVolumeScalar, "quiet target");
}

static void BrowserSourceSnapshotKeepsCapabilityData()
{
    var seenAt = new DateTimeOffset(2026, 7, 1, 18, 0, 0, TimeSpan.Zero);
    var source = new BrowserSubSourceSnapshot(
        SourceId: "tab-42:media-1",
        BrowserProcess: "Chrome",
        TabId: 42,
        SiteName: "YouTube",
        Title: "Music stream",
        CurrentLevel: 0.72f,
        AppliedGain: 0.83f,
        Status: AudioSessionStatus.Risky,
        Origin: AudioSourceOrigin.BrowserExtension,
        ControlSurface: AudioControlSurface.BrowserGain,
        LastSeenUtc: seenAt,
        TargetRmsDb: -18.0f,
        TargetProfile: "Standard");

    AssertEqual("tab-42:media-1", source.SourceId, "source id");
    AssertEqual(AudioSourceOrigin.BrowserExtension, source.Origin, "origin");
    AssertEqual(AudioControlSurface.BrowserGain, source.ControlSurface, "control surface");
    AssertTrue(source.IsControllable, "browser gain source should be controllable");
    AssertEqual(0.72f, source.CurrentLevel, "level");
    AssertEqual(0.83f, source.AppliedGain, "gain");
    AssertEqual(-18.0f, source.TargetRmsDb, "target rms");
    AssertEqual("Standard", source.TargetProfile, "target profile");
}

static void BrowserSourceStoreRemovesStaleSources()
{
    var store = new BrowserSubSourceStore();
    var now = new DateTimeOffset(2026, 7, 1, 18, 0, 0, TimeSpan.Zero);

    store.Upsert(TestBrowserSource("fresh", now));
    store.Upsert(TestBrowserSource("stale", now.AddSeconds(-30)));

    var removed = store.RemoveStale(now.AddSeconds(-10));
    var current = store.GetAll().ToList();

    AssertEqual(1, removed, "removed count");
    AssertEqual(1, current.Count, "remaining count");
    AssertEqual("fresh", current[0].SourceId, "remaining source");
}

static void BrowserSourceStorePreservesRecentBrowserGainDuringObserveOnlyFlap()
{
    var store = new BrowserSubSourceStore();
    var now = new DateTimeOffset(2026, 7, 2, 12, 0, 0, TimeSpan.Zero);

    store.Upsert(TestBrowserSource("tab-1:media", now.AddSeconds(-1), controlSurface: AudioControlSurface.BrowserGain));
    store.Upsert(TestBrowserSource("tab-1:media", now, controlSurface: AudioControlSurface.ObserveOnly));

    var source = store.GetAll().Single();

    AssertEqual(AudioControlSurface.ObserveOnly, source.ControlSurface, "current control surface should stay honest");
    AssertEqual<DateTimeOffset?>(now.AddSeconds(-1), source.LastBrowserGainSeenUtc, "last BrowserGain timestamp should survive observe-only flap");
}

static void BrowserGainPriorityIsDefaultAndBlocksBrowserSessionAutoCorrection()
{
    var now = new DateTimeOffset(2026, 7, 3, 18, 0, 0, TimeSpan.Zero);
    var normalizer = new VolumeNormalizer(NormalizerSettings.StreamDefault);
    var policy = new BrowserSessionConflictPolicy(TimeSpan.FromSeconds(15));
    var session = TestSession(peak: 0.95f, volume: 0.80f, processName: "chrome");
    var decision = normalizer.Evaluate(session, now);
    var browserSource = TestBrowserSource(
        "tab-1:media",
        now,
        browserProcess: "Chrome",
        controlSurface: AudioControlSurface.BrowserGain,
        status: AudioSessionStatus.Risky,
        calibrationState: "locked");

    var resolved = policy.Apply(session, decision, new[] { browserSource }, now);

    AssertFalse(resolved.ShouldApplyVolume, "default mode should let BrowserGain own controllable browser sources");
    AssertEqual(session.VolumeScalar, resolved.TargetVolumeScalar, "target should stay at current Windows volume");
    AssertEqual("browser-gain-conflict", resolved.Reason, "reason");
}

static void BrowserGlobalControlAllowsBrowserSessionAutoCorrection()
{
    var now = new DateTimeOffset(2026, 7, 2, 12, 0, 0, TimeSpan.Zero);
    var normalizer = new VolumeNormalizer(NormalizerSettings.StreamDefault);
    var policy = new BrowserSessionConflictPolicy(TimeSpan.FromSeconds(15), controlMode: BrowserSessionControlMode.GlobalWindowsSession);
    var session = TestSession(peak: 0.95f, volume: 0.80f, processName: "chrome");
    var decision = normalizer.Evaluate(session, now);
    var browserSource = TestBrowserSource("tab-1:media", now, browserProcess: "Chrome", controlSurface: AudioControlSurface.BrowserGain, status: AudioSessionStatus.Risky);

    var resolved = policy.Apply(session, decision, new[] { browserSource }, now);

    AssertEqual(AudioSessionStatus.Risky, resolved.Status, "status should stay honest");
    AssertTrue(resolved.ShouldApplyVolume, "global browser mode should let Windows session correction control the browser");
    AssertTrue(resolved.TargetVolumeScalar < session.VolumeScalar, "target should lower the browser Windows volume");
    AssertEqual("peak-above-target", resolved.Reason, "reason");
}

static void BrowserGainPriorityCanStillBlockBrowserSessionAutoCorrection()
{
    var now = new DateTimeOffset(2026, 7, 2, 12, 0, 0, TimeSpan.Zero);
    var normalizer = new VolumeNormalizer(NormalizerSettings.StreamDefault);
    var policy = new BrowserSessionConflictPolicy(TimeSpan.FromSeconds(15), controlMode: BrowserSessionControlMode.BrowserGainPriority);
    var session = TestSession(peak: 0.95f, volume: 0.80f, processName: "chrome");
    var decision = normalizer.Evaluate(session, now);
    var browserSource = TestBrowserSource(
        "tab-1:media",
        now,
        browserProcess: "Chrome",
        controlSurface: AudioControlSurface.BrowserGain,
        status: AudioSessionStatus.Risky,
        calibrationState: "locked");

    var resolved = policy.Apply(session, decision, new[] { browserSource }, now);

    AssertFalse(resolved.ShouldApplyVolume, "browser gain priority mode should block Windows session correction");
    AssertEqual(session.VolumeScalar, resolved.TargetVolumeScalar, "target should stay at current Windows volume");
    AssertEqual("browser-gain-conflict", resolved.Reason, "reason");
}

static void BrowserGainPriorityAllowsMeasuringBrowserGainFallback()
{
    var now = new DateTimeOffset(2026, 7, 3, 18, 0, 0, TimeSpan.Zero);
    var normalizer = new VolumeNormalizer(NormalizerSettings.StreamDefault);
    var policy = new BrowserSessionConflictPolicy(TimeSpan.FromSeconds(15), controlMode: BrowserSessionControlMode.BrowserGainPriority);
    var session = TestSession(peak: 0.95f, volume: 0.80f, processName: "chrome");
    var decision = normalizer.Evaluate(session, now);
    var browserSource = TestBrowserSource(
        "tab-1:media",
        now,
        browserProcess: "Chrome",
        controlSurface: AudioControlSurface.BrowserGain,
        status: AudioSessionStatus.Safe,
        calibrationState: "measuring");

    var resolved = policy.Apply(session, decision, new[] { browserSource }, now);

    AssertTrue(resolved.ShouldApplyVolume, "measuring BrowserGain should not block the independent Windows fallback");
    AssertTrue(resolved.TargetVolumeScalar < session.VolumeScalar, "fallback should lower the browser Windows volume immediately");
    AssertEqual("peak-above-target", resolved.Reason, "normalizer reason should stay intact while BrowserGain is pending");
}

static void BrowserGainPriorityAllowsProfileTargetFastFallback()
{
    var now = new DateTimeOffset(2026, 7, 3, 18, 0, 0, TimeSpan.Zero);
    var normalizer = new VolumeNormalizer(NormalizerSettings.StreamDefault);
    var targetPolicy = new TargetVolumeProfilePolicy();
    var policy = new BrowserSessionConflictPolicy(TimeSpan.FromSeconds(15), controlMode: BrowserSessionControlMode.BrowserGainPriority);
    var session = TestSession(peak: 0.30f, volume: 1.00f, processName: "brave", displayName: "brave");
    var decision = targetPolicy.Apply(
        session,
        normalizer.Evaluate(session, now),
        new GlobalTargetSettings(GlobalTargetSettings.QuietProfile, GlobalTargetSettings.QuietDecibels));
    var browserSource = TestBrowserSource(
        "tab-1:media",
        now,
        browserProcess: "Chrome",
        controlSurface: AudioControlSurface.BrowserGain,
        status: AudioSessionStatus.Safe,
        calibrationState: "locked");

    var resolved = policy.Apply(session, decision, new[] { browserSource }, now);

    AssertTrue(resolved.ShouldApplyVolume, "voluntary target changes should move Windows immediately even when BrowserGain is locked");
    AssertEqual(0.40f, resolved.TargetVolumeScalar, "quiet profile should be visible in the Windows mixer");
    AssertEqual(BrowserSessionConflictPolicy.FastTargetFallbackReason, resolved.Reason, "reason should expose the independent fast fallback");
}

static void BrowserGainPriorityBlocksChromiumAliasBrowserSessions()
{
    var now = new DateTimeOffset(2026, 7, 2, 12, 0, 0, TimeSpan.Zero);
    var normalizer = new VolumeNormalizer(NormalizerSettings.StreamDefault);
    var policy = new BrowserSessionConflictPolicy(TimeSpan.FromSeconds(15), controlMode: BrowserSessionControlMode.BrowserGainPriority);
    var session = TestSession(peak: 0.95f, volume: 0.80f, processName: "brave", displayName: "brave");
    var decision = normalizer.Evaluate(session, now);
    var browserSource = TestBrowserSource(
        "tab-1:media",
        now,
        browserProcess: "chrome",
        controlSurface: AudioControlSurface.BrowserGain,
        status: AudioSessionStatus.Risky,
        calibrationState: "locked");

    var resolved = policy.Apply(session, decision, new[] { browserSource }, now);

    AssertFalse(resolved.ShouldApplyVolume, "chromium-family BrowserGain source should block Brave Windows correction");
    AssertEqual(session.VolumeScalar, resolved.TargetVolumeScalar, "target should stay at current Windows volume");
    AssertEqual("browser-gain-conflict", resolved.Reason, "reason");
}

static void BrowserGlobalControlAllowsRecentObserveOnlyBrowserHistory()
{
    var now = new DateTimeOffset(2026, 7, 2, 12, 0, 0, TimeSpan.Zero);
    var normalizer = new VolumeNormalizer(NormalizerSettings.StreamDefault);
    var policy = new BrowserSessionConflictPolicy(TimeSpan.FromSeconds(15), TimeSpan.FromSeconds(5), BrowserSessionControlMode.GlobalWindowsSession);
    var session = TestSession(peak: 0.95f, volume: 0.80f, processName: "brave", displayName: "brave");
    var decision = normalizer.Evaluate(session, now);
    var browserSource = TestBrowserSource(
        "tab-1:media",
        now,
        browserProcess: "brave",
        controlSurface: AudioControlSurface.ObserveOnly,
        lastBrowserGainSeenUtc: now.AddSeconds(-1));

    var resolved = policy.Apply(session, decision, new[] { browserSource }, now);

    AssertTrue(resolved.ShouldApplyVolume, "global browser mode should ignore recent per-tab BrowserGain history");
    AssertEqual("peak-above-target", resolved.Reason, "reason should remain normalizer reason");
}

static void BrowserGainPriorityAllowsRecentObserveOnlyBrowserHistoryFallback()
{
    var now = new DateTimeOffset(2026, 7, 2, 12, 0, 0, TimeSpan.Zero);
    var normalizer = new VolumeNormalizer(NormalizerSettings.StreamDefault);
    var policy = new BrowserSessionConflictPolicy(TimeSpan.FromSeconds(15), TimeSpan.FromSeconds(5), BrowserSessionControlMode.BrowserGainPriority);
    var session = TestSession(peak: 0.95f, volume: 0.80f, processName: "brave", displayName: "brave");
    var decision = normalizer.Evaluate(session, now);
    var browserSource = TestBrowserSource(
        "tab-1:media",
        now,
        browserProcess: "brave",
        controlSurface: AudioControlSurface.ObserveOnly,
        lastBrowserGainSeenUtc: now.AddSeconds(-1));

    var resolved = policy.Apply(session, decision, new[] { browserSource }, now);

    AssertTrue(resolved.ShouldApplyVolume, "observe-only BrowserGain history should let Windows fallback stay independent");
    AssertTrue(resolved.TargetVolumeScalar < session.VolumeScalar, "fallback should lower the browser Windows volume");
    AssertEqual("peak-above-target", resolved.Reason, "reason should remain normalizer reason");
}

static void StableObserveOnlyBrowserSourceAllowsSessionCorrection()
{
    var now = new DateTimeOffset(2026, 7, 2, 12, 0, 0, TimeSpan.Zero);
    var normalizer = new VolumeNormalizer(NormalizerSettings.StreamDefault);
    var policy = new BrowserSessionConflictPolicy(TimeSpan.FromSeconds(15), TimeSpan.FromSeconds(5));
    var session = TestSession(peak: 0.95f, volume: 0.80f, processName: "brave", displayName: "brave");
    var decision = normalizer.Evaluate(session, now);
    var browserSource = TestBrowserSource(
        "tab-1:media",
        now,
        browserProcess: "brave",
        controlSurface: AudioControlSurface.ObserveOnly,
        lastBrowserGainSeenUtc: now.AddSeconds(-10));

    var resolved = policy.Apply(session, decision, new[] { browserSource }, now);

    AssertTrue(resolved.ShouldApplyVolume, "stable observe-only source should let Windows correction resume");
    AssertEqual("peak-above-target", resolved.Reason, "reason should remain normalizer reason");
}

static void ObserveOnlyBrowserSourceDoesNotBlockSessionCorrection()
{
    var now = new DateTimeOffset(2026, 7, 2, 12, 0, 0, TimeSpan.Zero);
    var normalizer = new VolumeNormalizer(NormalizerSettings.StreamDefault);
    var policy = new BrowserSessionConflictPolicy(TimeSpan.FromSeconds(15));
    var session = TestSession(peak: 0.95f, volume: 0.80f, processName: "chrome");
    var decision = normalizer.Evaluate(session, now);
    var browserSource = TestBrowserSource("tab-1:media", now, browserProcess: "Chrome", controlSurface: AudioControlSurface.ObserveOnly);

    var resolved = policy.Apply(session, decision, new[] { browserSource }, now);

    AssertTrue(resolved.ShouldApplyVolume, "observe-only source should not block Windows correction");
    AssertEqual("peak-above-target", resolved.Reason, "reason should remain normalizer reason");
}

static void StaleBrowserGainSourceDoesNotBlockSessionCorrection()
{
    var now = new DateTimeOffset(2026, 7, 2, 12, 0, 0, TimeSpan.Zero);
    var normalizer = new VolumeNormalizer(NormalizerSettings.StreamDefault);
    var policy = new BrowserSessionConflictPolicy(TimeSpan.FromSeconds(15));
    var session = TestSession(peak: 0.95f, volume: 0.80f, processName: "chrome");
    var decision = normalizer.Evaluate(session, now);
    var browserSource = TestBrowserSource("tab-1:media", now.AddSeconds(-60), browserProcess: "Chrome", controlSurface: AudioControlSurface.BrowserGain);

    var resolved = policy.Apply(session, decision, new[] { browserSource }, now);

    AssertTrue(resolved.ShouldApplyVolume, "stale browser source should not block Windows correction");
    AssertEqual("peak-above-target", resolved.Reason, "reason should remain normalizer reason");
}
static void SystemAudioServiceSessionsAreGroupedForDisplay()
{
    var first = TestSession(
        peak: 0.25f,
        volume: 0.40f,
        displayName: "@%SystemRoot%\\System32\\AudioSrv.Dll,-202",
        sessionId: "device-a/system-1");
    var second = TestSession(
        peak: 0.70f,
        volume: 0.60f,
        displayName: "@%SystemRoot%\\System32\\AudioSrv.Dll,-202",
        sessionId: "device-a/system-2");

    AssertTrue(WindowsSystemSessionClassifier.IsSystemSounds(first), "audio service resource should be treated as system sounds");
    AssertTrue(WindowsSystemSessionClassifier.IsSystemSounds(TestSession(peak: 0.10f, volume: 0.20f, isSystemSession: true)), "native system session should be treated as system sounds");

    var group = WindowsSystemSessionClassifier.BuildGroupSnapshot(new[] { first, second });

    AssertEqual(WindowsSystemSessionClassifier.GroupSessionId, group.SessionId, "group session id");
    AssertEqual(WindowsSystemSessionClassifier.DisplayName, group.DisplayName, "group display name");
    AssertEqual(0.70f, group.PeakLevel, "group peak");
    AssertEqual(0.50f, group.VolumeScalar, "group average volume");
    AssertTrue(group.IsSystemSession, "group should be marked system");
    AssertTrue(group.IsControllable, "group should stay controllable when any child is controllable");
}

static void SystemSessionGroupDecisionKeepsHighestRiskStatus()
{
    var decision = WindowsSystemSessionClassifier.BuildGroupDecision(new[]
    {
        new VolumeDecision(AudioSessionStatus.Safe, false, 0.60f, "inside-target-band"),
        new VolumeDecision(AudioSessionStatus.Risky, true, 0.30f, "peak-above-target")
    });

    AssertEqual(AudioSessionStatus.Risky, decision.Status, "group status");
    AssertTrue(decision.ShouldApplyVolume, "group should apply when a child would apply");
    AssertTrue(Math.Abs(decision.TargetVolumeScalar - 0.45f) < 0.0001f, "group average target");
    AssertTrue(decision.Reason.Contains("2 sessions système regroupées"), "group reason should mention grouped system sessions");
}
static void ActivityLogWritesSanitizedEventLine()
{
    var directory = CreateTempDirectory();
    try
    {
        var now = new DateTimeOffset(2026, 7, 1, 12, 34, 56, TimeSpan.Zero);
        var log = new LocalActivityLog(directory, () => now);

        log.Write("session.detected", "Browser detected", new Dictionary<string, string?>
        {
            ["display"] = "Chrome\r\nInjected",
            ["volume"] = "80%"
        });

        var lines = File.ReadAllLines(log.CurrentLogFilePath);
        AssertEqual(1, lines.Length, "line count");
        AssertTrue(lines[0].Contains("2026-07-01T12:34:56.000+00:00"), "timestamp");
        AssertTrue(lines[0].Contains("event=session.detected"), "event name");
        AssertTrue(lines[0].Contains("message=Browser detected"), "message");
        AssertTrue(lines[0].Contains("display=Chrome Injected"), "sanitized display");
        AssertFalse(lines[0].Contains("\r"), "carriage return should be removed");
        AssertFalse(lines[0].Contains("\n"), "line feed should be removed");
    }
    finally
    {
        Directory.Delete(directory, recursive: true);
    }
}

static void ActivityLogReadsRecentLines()
{
    var directory = CreateTempDirectory();
    try
    {
        var now = new DateTimeOffset(2026, 7, 1, 12, 0, 0, TimeSpan.Zero);
        var log = new LocalActivityLog(directory, () => now);

        log.Write("mark", "first");
        log.Write("mark", "second");
        log.Write("mark", "third");

        var recent = log.ReadRecentText(maxLines: 2);

        AssertFalse(recent.Contains("message=first"), "oldest line should be omitted");
        AssertTrue(recent.Contains("message=second"), "second line should be present");
        AssertTrue(recent.Contains("message=third"), "third line should be present");
    }
    finally
    {
        Directory.Delete(directory, recursive: true);
    }
}

static void ActivityLogAddsRunAndTestSessionIds()
{
    var directory = CreateTempDirectory();
    try
    {
        var now = new DateTimeOffset(2026, 7, 1, 12, 0, 0, TimeSpan.Zero);
        var log = new LocalActivityLog(directory, () => now, runId: "run-fixed", testSessionId: "test-initial");

        log.Write("app.start", "started");
        var nextSessionId = log.StartNewTestSession();
        log.Write("tester.mark", "mark");

        var lines = File.ReadAllLines(log.CurrentLogFilePath);
        AssertEqual(2, lines.Length, "line count");
        AssertTrue(lines[0].Contains("runId=run-fixed"), "initial line should include run id");
        AssertTrue(lines[0].Contains("testSessionId=test-initial"), "initial line should include initial test session id");
        AssertTrue(lines[1].Contains("runId=run-fixed"), "next line should keep run id");
        AssertTrue(lines[1].Contains($"testSessionId={nextSessionId}"), "next line should include new test session id");
        AssertFalse(string.Equals(nextSessionId, "test-initial", StringComparison.Ordinal), "new test session id should change");
    }
    finally
    {
        Directory.Delete(directory, recursive: true);
    }
}

static void ActivityLogFiltersRecentLinesByTestSession()
{
    var directory = CreateTempDirectory();
    try
    {
        var now = new DateTimeOffset(2026, 7, 1, 12, 0, 0, TimeSpan.Zero);
        var log = new LocalActivityLog(directory, () => now, runId: "run-fixed", testSessionId: "test-first");

        log.Write("tester.mark", "first session");
        var secondSessionId = log.StartNewTestSession();
        log.Write("tester.mark", "second session");

        var recent = log.ReadRecentText(maxLines: 20, testSessionId: secondSessionId);

        AssertFalse(recent.Contains("message=first session"), "first session should be omitted");
        AssertTrue(recent.Contains("message=second session"), "second session should be present");
        AssertTrue(recent.Contains($"testSessionId={secondSessionId}"), "filtered output should include the requested session id");
    }
    finally
    {
        Directory.Delete(directory, recursive: true);
    }
}

static void ActivityLogFormatsReadableTestReport()
{
    var directory = CreateTempDirectory();
    try
    {
        var now = new DateTimeOffset(2026, 7, 1, 12, 0, 0, TimeSpan.Zero);
        var log = new LocalActivityLog(directory, () => now, runId: "run-fixed", testSessionId: "test-report");

        log.Write("tester.session.start", "Manual test session started", new Dictionary<string, string?>
        {
            ["autoEnabled"] = "True",
            ["targetProfile"] = "Fort",
            ["visibleBrowserSources"] = "0",
            ["visibleWindowsSessions"] = "3"
        });
        log.Write("volume.auto", "Automatic volume correction applied", new Dictionary<string, string?>
        {
            ["display"] = "brave",
            ["origin"] = "WindowsSession",
            ["controlSurface"] = "WindowsSessionVolume",
            ["controllable"] = "True",
            ["status"] = "Risky",
            ["reason"] = "profile-target",
            ["peak"] = "24%",
            ["volume"] = "100%",
            ["target"] = "70%"
        });
        log.Write("volume.auto_locked", "Automatic correction skipped by one-shot calibration gate", new Dictionary<string, string?>
        {
            ["autoEnabled"] = "True",
            ["display"] = "brave",
            ["reason"] = "auto-calibration-locked",
            ["volume"] = "70%",
            ["target"] = "70%"
        });
        log.Write("browser.source.received", "Browser sub-source received from local bridge", new Dictionary<string, string?>
        {
            ["origin"] = "BrowserExtension",
            ["controlSurface"] = "ObserveOnly",
            ["controllable"] = "False",
            ["siteName"] = "youtube.com",
            ["status"] = "Unknown",
            ["targetProfile"] = "stream"
        });

        var report = log.ReadRecentReport(maxLines: 20, testSessionId: "test-report");

        AssertTrue(report.Contains("# Rapport StreamVolume Guard Hub", StringComparison.Ordinal), "report title");
        AssertTrue(report.Contains("Session", StringComparison.Ordinal), "session section");
        AssertTrue(report.Contains("Auto actif: oui", StringComparison.Ordinal), "auto status");
        AssertTrue(report.Contains("Profil: Fort", StringComparison.Ordinal), "target profile");
        AssertTrue(report.Contains("Sources navigateur visibles: 0", StringComparison.Ordinal), "browser source count");
        AssertTrue(report.Contains("Sessions Windows visibles: 3", StringComparison.Ordinal), "windows session count");
        AssertTrue(report.Contains("Extension navigateur: detectee", StringComparison.Ordinal), "extension status");
        AssertTrue(report.Contains("brave | 100% -> 70% | profile-target", StringComparison.Ordinal), "formatted correction");
        AssertTrue(report.Contains("WindowsSessionVolume", StringComparison.Ordinal), "control surface");
        AssertTrue(report.Contains("Logs bruts", StringComparison.Ordinal), "raw logs section");
        AssertTrue(report.Contains("event=volume.auto", StringComparison.Ordinal), "raw event");
    }
    finally
    {
        Directory.Delete(directory, recursive: true);
    }
}

static void BridgeParserAcceptsValidBrowserSourceMessage()
{
    const string json = """
    {
      "type": "browser_source_observed",
      "browserProcess": "Chrome",
      "sourceId": "tab-42:media-1",
      "tabId": 42,
      "siteName": "YouTube\r\nInjected",
      "title": "Music stream",
      "currentLevel": 1.5,
      "appliedGain": 0.83,
      "status": "Risky",
      "targetRmsDb": -18,
      "targetProfile": "Standard",
      "calibrationState": "locked",
      "measuredRmsDb": -27.25,
      "appliedGainDb": 6.25,
      "calibrationReason": "window-complete",
      "lastSeen": "2026-07-02T12:00:00.000Z",
      "origin": "BrowserExtension",
      "controlSurface": "BrowserGain",
      "isControllable": true
    }
    """;

    var source = BrowserBridgeMessageParser.ParseBrowserSource(json);

    AssertEqual("tab-42:media-1", source.SourceId, "source id");
    AssertEqual("Chrome", source.BrowserProcess, "browser process");
    AssertEqual(42, source.TabId, "tab id");
    AssertEqual("YouTube Injected", source.SiteName, "sanitized site name");
    AssertEqual(1.0f, source.CurrentLevel, "clamped level");
    AssertEqual(0.83f, source.AppliedGain, "gain");
    AssertEqual(AudioSessionStatus.Risky, source.Status, "status");
    AssertEqual(AudioSourceOrigin.BrowserExtension, source.Origin, "origin");
    AssertEqual(AudioControlSurface.BrowserGain, source.ControlSurface, "control surface");
    AssertEqual(-18.0f, source.TargetRmsDb, "target rms");
    AssertEqual("Standard", source.TargetProfile, "target profile");
    AssertEqual("locked", source.CalibrationState, "calibration state");
    AssertEqual(-27.25f, source.MeasuredRmsDb, "measured rms");
    AssertEqual(6.25f, source.AppliedGainDb, "applied gain db");
    AssertEqual("window-complete", source.CalibrationReason, "calibration reason");
    AssertTrue(source.IsControllable, "browser gain source should be controllable");
}

static void BridgeParserAcceptsPrivacySafeExtensionLog()
{
    const string json = """
    {
      "type": "extension_log",
      "eventName": "tabcapture.no_signal",
      "message": "No signal on https://www.tiktok.com/@secret/video/123",
      "severity": "warn",
      "browserProcess": "Brave",
      "sourceId": "tab-capture:42",
      "tabId": 42,
      "siteName": "TikTok\r\nInjected",
      "status": "Unknown",
      "controlSurface": "ObserveOnly",
      "captureSignalState": "no-signal",
      "targetRmsDb": -18,
      "targetProfile": "Standard",
      "lastSeen": "2026-07-02T18:00:00.000Z",
      "origin": "BrowserExtension"
    }
    """;

    var entry = BrowserBridgeMessageParser.ParseExtensionLog(json);

    AssertEqual("tabcapture.no_signal", entry.EventName, "event name");
    AssertEqual("No signal on [redacted-url]", entry.Message, "message should redact urls");
    AssertEqual("warn", entry.Severity, "severity");
    AssertEqual("Brave", entry.BrowserProcess, "browser process");
    AssertEqual("tab-capture:42", entry.SourceId, "source id");
    AssertEqual(42, entry.TabId, "tab id");
    AssertEqual("TikTok Injected", entry.SiteName, "site name");
    AssertEqual(AudioSessionStatus.Unknown, entry.Status, "status");
    AssertEqual(AudioControlSurface.ObserveOnly, entry.ControlSurface, "control surface");
    AssertEqual("no-signal", entry.CaptureSignalState, "capture signal state");
    AssertEqual(-18.0f, entry.TargetRmsDb, "target rms");
    AssertEqual("Standard", entry.TargetProfile, "target profile");
    AssertEqual(AudioSourceOrigin.BrowserExtension, entry.Origin, "origin");
}

static void BridgeParserRejectsInvalidMessageType()
{
    AssertThrows(() => BrowserBridgeMessageParser.ParseBrowserSource("{\"type\":\"other\",\"sourceId\":\"x\",\"origin\":\"BrowserExtension\",\"controlSurface\":\"BrowserGain\"}"), "type");
}

static void BridgeParserRejectsMissingSourceId()
{
    AssertThrows(() => BrowserBridgeMessageParser.ParseBrowserSource("{\"type\":\"browser_source_observed\",\"origin\":\"BrowserExtension\",\"controlSurface\":\"BrowserGain\"}"), "sourceId");
}

static void AppConfigStoreReturnsDefaultWhenMissing()
{
    var directory = CreateTempDirectory();
    try
    {
        var store = new JsonAppConfigStore(Path.Combine(directory, "config.json"));

        var config = store.Load();

        AssertFalse(config.AutoEnabled, "auto should be disabled by default");
        AssertFalse(config.DarkThemeEnabled, "dark theme should be disabled by default");
        AssertEqual(0, config.ExcludedSessionIds.Count, "default exclusions");
    }
    finally
    {
        Directory.Delete(directory, recursive: true);
    }
}

static void AppConfigStorePersistsAutoAndExclusions()
{
    var directory = CreateTempDirectory();
    try
    {
        var path = Path.Combine(directory, "config.json");
        var store = new JsonAppConfigStore(path);

        store.Save(new AppConfig
        {
            AutoEnabled = true,
            DarkThemeEnabled = true,
            ExcludedSessionIds = new List<string> { "session-a", "session-b" }
        });

        var loaded = store.Load();

        AssertTrue(loaded.AutoEnabled, "auto should persist");
        AssertTrue(loaded.DarkThemeEnabled, "dark theme should persist");
        AssertEqual(2, loaded.ExcludedSessionIds.Count, "excluded count");
        AssertEqual("session-a", loaded.ExcludedSessionIds[0], "first exclusion");
        AssertEqual("session-b", loaded.ExcludedSessionIds[1], "second exclusion");
    }
    finally
    {
        Directory.Delete(directory, recursive: true);
    }
}

static void AppConfigStorePersistsTargetProfile()
{
    var directory = CreateTempDirectory();
    try
    {
        var path = Path.Combine(directory, "config.json");
        var store = new JsonAppConfigStore(path);

        store.Save(new AppConfig
        {
            TargetProfile = "Fort",
            TargetDecibels = -15.0f
        });

        var loaded = store.Load();

        AssertEqual("Fort", loaded.TargetProfile, "target profile");
        AssertEqual(-15.0f, loaded.TargetDecibels, "target decibels");
    }
    finally
    {
        Directory.Delete(directory, recursive: true);
    }
}

static void NormalizerSettingsAdaptToTargetDecibels()
{
    var quiet = NormalizerSettings.FromTargetDecibels(-22.0f);
    var standard = NormalizerSettings.FromTargetDecibels(-18.0f);
    var loud = NormalizerSettings.FromTargetDecibels(-15.0f);

    AssertTrue(quiet.RiskyPeakLevel < standard.RiskyPeakLevel, "quiet risky threshold should be lower than standard");
    AssertTrue(loud.RiskyPeakLevel > standard.RiskyPeakLevel, "loud risky threshold should be higher than standard");
    AssertEqual(NormalizerSettings.StreamDefault.MaxStepDown, standard.MaxStepDown, "step down should stay stable");
    AssertEqual(NormalizerSettings.StreamDefault.ManualCooldown, standard.ManualCooldown, "manual cooldown should stay stable");
}

static void AppConfigStoreNormalizesExcludedSessions()
{
    var directory = CreateTempDirectory();
    try
    {
        var store = new JsonAppConfigStore(Path.Combine(directory, "config.json"));

        store.Save(new AppConfig
        {
            DarkThemeEnabled = true,
            ExcludedSessionIds = new List<string> { "", " session-a ", "SESSION-A", "session-b" }
        });

        var loaded = store.Load();

        AssertTrue(loaded.DarkThemeEnabled, "dark theme should survive normalization");
        AssertEqual(2, loaded.ExcludedSessionIds.Count, "deduped exclusions");
        AssertEqual("session-a", loaded.ExcludedSessionIds[0], "trimmed first exclusion");
        AssertEqual("session-b", loaded.ExcludedSessionIds[1], "second exclusion");
    }
    finally
    {
        Directory.Delete(directory, recursive: true);
    }
}

static void AppConfigStorePersistsBridgeToken()
{
    var directory = CreateTempDirectory();
    try
    {
        var store = new JsonAppConfigStore(Path.Combine(directory, "config.json"));

        store.Save(new AppConfig
        {
            BridgeToken = " local-secret "
        });

        var loaded = store.Load();

        AssertEqual("local-secret", loaded.BridgeToken, "bridge token");
    }
    finally
    {
        Directory.Delete(directory, recursive: true);
    }
}

static void DesktopExclusionCheckboxUpdatesOnFirstClick()
{
    var xaml = File.ReadAllText(FindDesktopMainWindowXamlPath());

    AssertFalse(xaml.Contains("DataGridCheckBoxColumn Header=\"Exclu\"", StringComparison.Ordinal), "exclusion checkbox should not use DataGridCheckBoxColumn edit mode");
    AssertTrue(xaml.Contains("IsChecked=\"{Binding IsExcluded, Mode=TwoWay, UpdateSourceTrigger=PropertyChanged}\"", StringComparison.Ordinal), "exclusion checkbox should update IsExcluded immediately");
    AssertTrue(xaml.Contains("Focusable=\"False\"", StringComparison.Ordinal), "exclusion checkbox should not require cell focus before toggling");
}

static void DesktopTargetControlsAreSimpleAndGeneric()
{
    var xaml = File.ReadAllText(FindDesktopMainWindowXamlPath());
    var codeBehind = File.ReadAllText(FindDesktopMainWindowCodeBehindPath());

    AssertTrue(xaml.Contains("Cible volume", StringComparison.Ordinal), "target volume label should be visible");
    AssertTrue(xaml.Contains("Calme", StringComparison.Ordinal), "quiet target mode should be visible");
    AssertTrue(xaml.Contains("Standard", StringComparison.Ordinal), "standard target mode should be visible");
    AssertTrue(xaml.Contains("Fort", StringComparison.Ordinal), "loud target mode should be visible");
    AssertTrue(xaml.Contains("TargetPresetButtonStyle", StringComparison.Ordinal), "target presets should have a dedicated active style");
    AssertTrue(xaml.Contains("TargetQuietButton", StringComparison.Ordinal), "quiet target button should be named for active styling");
    AssertTrue(xaml.Contains("TargetStandardButton", StringComparison.Ordinal), "standard target button should be named for active styling");
    AssertTrue(xaml.Contains("TargetLoudButton", StringComparison.Ordinal), "loud target button should be named for active styling");
    AssertTrue(xaml.Contains("<Trigger Property=\"Tag\" Value=\"Active\">", StringComparison.Ordinal), "active target button should be styled by tag");
    AssertTrue(xaml.Contains("15%", StringComparison.Ordinal), "target slider should expose the 15 percent floor");
    AssertTrue(xaml.Contains("100%", StringComparison.Ordinal), "target slider should expose the 100 percent mixer target");
    AssertTrue(codeBehind.Contains("UpdateTargetPresetButtons", StringComparison.Ordinal), "code-behind should update active target button state");
    AssertTrue(codeBehind.Contains("TargetLoudButton.Tag", StringComparison.Ordinal), "loud button should be activated from the current target");
    AssertFalse(xaml.Contains("Standard stream", StringComparison.OrdinalIgnoreCase), "target mode should not be stream-specific");
    AssertFalse(xaml.Contains("pour streamers", StringComparison.OrdinalIgnoreCase), "subtitle should address everyone, not only streamers");
}

static void DesktopShowsExtensionLinkAsConnectedOrStandalone()
{
    var xaml = File.ReadAllText(FindDesktopMainWindowXamlPath());
    var codeBehind = File.ReadAllText(FindDesktopMainWindowCodeBehindPath());

    AssertTrue(xaml.Contains("{Binding ExtensionLinkText}", StringComparison.Ordinal), "desktop should bind a readable extension link status");
    AssertTrue(codeBehind.Contains("private DateTimeOffset? extensionLastSeenUtc", StringComparison.Ordinal), "desktop should remember when the extension was last seen");
    AssertTrue(codeBehind.Contains("public string ExtensionLinkText", StringComparison.Ordinal), "desktop should expose extension link text to the UI");
    AssertTrue(codeBehind.Contains("MarkExtensionSeen(DateTimeOffset.UtcNow)", StringComparison.Ordinal), "bridge handlers should mark the extension as seen");
    AssertTrue(codeBehind.Contains("UpdateExtensionLinkText(DateTimeOffset.UtcNow)", StringComparison.Ordinal), "refresh should expire the extension connection status");
    AssertTrue(codeBehind.Contains("App seule", StringComparison.Ordinal), "desktop should make standalone mode clear");
    AssertTrue(codeBehind.Contains("Extension connectee", StringComparison.Ordinal), "desktop should make the connected extension state clear");
}

static void DesktopExtensionLinkAvoidsCrampedSummaryCard()
{
    var xaml = File.ReadAllText(FindDesktopMainWindowXamlPath());

    AssertFalse(xaml.Contains("<TextBlock Text=\"{Binding ExtensionLinkText}\"", StringComparison.Ordinal), "extension link status should not be a long TextBlock inside the narrow summary cards");
    AssertTrue(xaml.Contains("x:Name=\"ExtensionLinkStatusText\"", StringComparison.Ordinal), "extension link status should have a dedicated status line");
}

static void DesktopDebugActionsAvoidHorizontalOverflow()
{
    var xaml = File.ReadAllText(FindDesktopMainWindowXamlPath());

    AssertTrue(xaml.Contains("x:Key=\"DebugButtonStyle\"", StringComparison.Ordinal), "debug actions should use a compact button style");
    AssertTrue(xaml.Contains("<WrapPanel Grid.Column=\"1\"", StringComparison.Ordinal), "debug actions should stay in a compact toolbar area instead of forcing another tall row");
    AssertTrue(xaml.Contains("TextTrimming=\"CharacterEllipsis\"", StringComparison.Ordinal), "debug status lines should trim instead of growing the bottom panel");
    AssertFalse(xaml.Contains("<StackPanel Grid.Column=\"1\" Orientation=\"Horizontal\"", StringComparison.Ordinal), "debug actions should not force a single horizontal auto-width column");
    AssertFalse(xaml.Contains("TextWrapping=\"Wrap\" Margin=\"0,4,0,0\"", StringComparison.Ordinal), "debug status text should not wrap into tall rows");
}

static void DesktopBrowserSourcesShowCalibrationState()
{
    var xaml = File.ReadAllText(FindDesktopMainWindowXamlPath());
    var codeBehind = File.ReadAllText(FindDesktopMainWindowCodeBehindPath());

    AssertTrue(xaml.Contains("Header=\"Calibration\"", StringComparison.Ordinal), "browser source table should show BrowserGain calibration state");
    AssertTrue(xaml.Contains("Binding=\"{Binding Calibration}\"", StringComparison.Ordinal), "browser source calibration column should bind to row state");
    AssertTrue(codeBehind.Contains("public string Calibration", StringComparison.Ordinal), "browser source row should expose calibration text");
    AssertTrue(codeBehind.Contains("source.CalibrationState", StringComparison.Ordinal), "browser source row should use the source calibration state");
}

static void DesktopExposesManualTestSessions()
{
    var xaml = File.ReadAllText(FindDesktopMainWindowXamlPath());
    var codeBehind = File.ReadAllText(FindDesktopMainWindowCodeBehindPath());

    AssertTrue(xaml.Contains("Nouveau test", StringComparison.Ordinal), "desktop should expose a clear new-test action");
    AssertTrue(codeBehind.Contains("NewTestSession_Click", StringComparison.Ordinal), "desktop should handle new manual test sessions");
    AssertTrue(codeBehind.Contains("StartNewTestSession", StringComparison.Ordinal), "desktop should rotate the current log test session");
    AssertTrue(codeBehind.Contains("tester.session.start", StringComparison.Ordinal), "desktop should log when a new manual test session starts");
    AssertTrue(codeBehind.Contains("ReadRecentReport(maxLines: 300, testSessionId: activityLog.TestSessionId)", StringComparison.Ordinal), "copy logs should focus on the current test session");
    AssertTrue(codeBehind.Contains("Clipboard.SetText(report);", StringComparison.Ordinal), "copy logs should copy the readable report to clipboard");
    AssertTrue(codeBehind.Contains("format\"] = \"readable-report\"", StringComparison.Ordinal), "copy logs should mark the copied format");
}

static void DesktopNewTestCapturesMixerSnapshotWithoutRearmingCalibration()
{
    var codeBehind = File.ReadAllText(FindDesktopMainWindowCodeBehindPath());
    var methodStart = codeBehind.IndexOf("private void NewTestSession_Click(", StringComparison.Ordinal);
    var methodEnd = codeBehind.IndexOf("private void MarkStep_Click(", StringComparison.Ordinal);
    var captureStart = codeBehind.IndexOf("private ReferenceCaptureResult CaptureCurrentReferenceVolumes(", StringComparison.Ordinal);

    AssertTrue(methodStart >= 0 && methodEnd > methodStart, "NewTestSession_Click method should be readable");
    AssertTrue(captureStart >= 0 && captureStart < methodEnd, "new test should have a mixer snapshot helper before MarkStep_Click");

    var method = codeBehind[methodStart..methodEnd];
    var captureMethod = codeBehind[captureStart..methodEnd];

    AssertFalse(method.Contains("autoCalibrationGate.Clear();", StringComparison.Ordinal), "new test should not rearm auto calibration");
    AssertTrue(method.Contains("observedDecisionFingerprints.Clear();", StringComparison.Ordinal), "new test should keep logs readable");
    AssertTrue(method.Contains("CaptureCurrentReferenceVolumes(promoteHighVolumeToLoud: true);", StringComparison.Ordinal), "new test should capture current Windows mixer volumes for diagnostics and promote high-volume manual changes");
    AssertTrue(captureMethod.Contains("ReadWindowsSessions();", StringComparison.Ordinal), "mixer snapshot should read real current Windows volumes");
    AssertTrue(captureMethod.Contains("referenceVolumes.Update", StringComparison.Ordinal), "mixer snapshot should update stored diagnostic volumes");
    AssertFalse(captureMethod.Contains(".SetVolume(", StringComparison.Ordinal), "mixer snapshot must not change system volume");
}

static void DesktopManualWindowsVolumeOverrideSwitchesTargetToLoud()
{
    var codeBehind = File.ReadAllText(FindDesktopMainWindowCodeBehindPath());

    AssertTrue(codeBehind.Contains("private readonly WindowsManualVolumeOverrideDetector manualVolumeOverrideDetector", StringComparison.Ordinal), "desktop should track external Windows volume changes");
    AssertTrue(codeBehind.Contains("manualVolumeOverrideDetector.Detect", StringComparison.Ordinal), "refresh should detect external Windows volume overrides");
    AssertTrue(codeBehind.Contains("PromoteTargetToLoudForManualWindowsVolume", StringComparison.Ordinal), "desktop should promote the global target after a manual high-volume override");
    AssertTrue(codeBehind.Contains("GlobalTargetSettings.LoudProfile", StringComparison.Ordinal), "manual high-volume override should switch to Fort");
    AssertTrue(codeBehind.Contains("Global target changed from Windows manual volume", StringComparison.Ordinal), "manual high-volume override should be logged clearly");
    AssertTrue(codeBehind.Contains("manualVolumeOverrideDetector.RecordVolume(windowsSessions[i].Snapshot.SessionId, plan.TargetVolumeScalar)", StringComparison.Ordinal), "desktop should remember volumes it applied itself");
}

static void DesktopStartupAlignsTargetToWindowsVolumeWithoutSettingVolume()
{
    var codeBehind = File.ReadAllText(FindDesktopMainWindowCodeBehindPath());
    var constructorStart = codeBehind.IndexOf("public MainWindow()", StringComparison.Ordinal);
    var startBridge = codeBehind.IndexOf("private void StartBrowserBridge()", StringComparison.Ordinal);
    var startupStart = codeBehind.IndexOf("private void SynchronizeStartupTargetWithWindows()", StringComparison.Ordinal);
    var captureStart = codeBehind.IndexOf("private ReferenceCaptureResult CaptureCurrentReferenceVolumes(", StringComparison.Ordinal);
    var markStepStart = codeBehind.IndexOf("private void MarkStep_Click(", StringComparison.Ordinal);

    AssertTrue(constructorStart >= 0 && startBridge > constructorStart, "constructor should be readable");
    AssertTrue(startupStart >= 0 && captureStart > startupStart, "startup sync method should exist before mixer snapshot capture");
    AssertTrue(captureStart >= 0 && markStepStart > captureStart, "mixer snapshot method should be readable");

    var constructor = codeBehind[constructorStart..startBridge];
    var startupMethod = codeBehind[startupStart..captureStart];
    var captureMethod = codeBehind[captureStart..markStepStart];

    AssertTrue(constructor.Contains("SynchronizeStartupTargetWithWindows();", StringComparison.Ordinal), "constructor should align startup state with Windows mixer");
    AssertTrue(startupMethod.Contains("CaptureCurrentReferenceVolumes(promoteHighVolumeToLoud: false);", StringComparison.Ordinal), "startup sync should observe current Windows mixer volumes without using the manual override trigger");
    AssertTrue(startupMethod.Contains("GlobalTargetSettings.LoudProfile", StringComparison.Ordinal), "startup sync should promote visible controllable sources to Fort");
    AssertTrue(startupMethod.Contains("trigger\"] = \"startup-windows-volume\"", StringComparison.Ordinal), "startup sync should log the startup trigger");
    AssertFalse(startupMethod.Contains(".SetVolume(", StringComparison.Ordinal), "startup sync must not set system volume");
    AssertFalse(captureMethod.Contains(".SetVolume(", StringComparison.Ordinal), "mixer snapshot must not set system volume");
    AssertTrue(codeBehind.Contains("public sealed record ReferenceCaptureResult", StringComparison.Ordinal), "startup sync should track captured and controlled mixer snapshot counts");
}

static void DesktopLauncherAvoidsStaleWpfBuildCache()
{
    var launcher = File.ReadAllText(FindRepositoryFilePath("Lancer StreamVolume Guard Hub Desktop.cmd"));

    AssertTrue(launcher.Contains("dotnet build-server shutdown", StringComparison.OrdinalIgnoreCase), "launcher should clear stale MSBuild/Roslyn servers before WPF build");
    AssertTrue(launcher.Contains("-nr:false", StringComparison.OrdinalIgnoreCase), "launcher build should disable MSBuild node reuse");
    AssertTrue(launcher.Contains("StreamVolumeGuard.App.exe", StringComparison.OrdinalIgnoreCase), "launcher should start the built executable after a successful build");
    AssertFalse(launcher.Contains("dotnet run --project", StringComparison.OrdinalIgnoreCase), "launcher should not depend on dotnet run for WPF cache-heavy launches");
}

static void TesterPackageHasReproducibleWindowsLauncher()
{
    var script = File.ReadAllText(FindRepositoryFilePath(Path.Combine("tools", "package-tester.ps1")));
    var readme = File.ReadAllText(FindRepositoryFilePath(Path.Combine("docs", "tester-package", "README.md")));
    var checklist = File.ReadAllText(FindRepositoryFilePath(Path.Combine("docs", "tester-package", "CHECKLIST.md")));
    var launcher = File.ReadAllText(FindRepositoryFilePath(Path.Combine("tools", "tester-package", "Lancer StreamVolume Guard Hub Desktop.cmd")));

    AssertTrue(script.Contains("dotnet publish", StringComparison.OrdinalIgnoreCase), "tester package script should publish the desktop app");
    AssertTrue(script.Contains("artifacts\\tester", StringComparison.OrdinalIgnoreCase), "tester package script should write under artifacts/tester");
    AssertTrue(script.Contains("apps\\browser-extension", StringComparison.OrdinalIgnoreCase), "tester package script should copy the loadable browser extension");
    AssertTrue(script.Contains("release-assets", StringComparison.OrdinalIgnoreCase), "tester package script should exclude generated release assets");
    AssertTrue(script.Contains("Compress-Archive", StringComparison.OrdinalIgnoreCase), "tester package script should create a shareable zip");
    AssertTrue(script.Contains("0.1.0-alpha.1", StringComparison.OrdinalIgnoreCase), "tester package script should default to the first alpha tester version");
    AssertFalse(script.Contains("git tag", StringComparison.OrdinalIgnoreCase), "tester package script must not create git tags");
    AssertFalse(script.Contains("gh release", StringComparison.OrdinalIgnoreCase), "tester package script must not create GitHub releases");

    AssertTrue(launcher.Contains("desktop\\StreamVolumeGuard.App.exe", StringComparison.OrdinalIgnoreCase), "package launcher should start the published desktop executable");
    AssertFalse(launcher.Contains(".sln", StringComparison.OrdinalIgnoreCase), "package launcher must not ask testers to open a solution file");

    AssertTrue(readme.Contains("ObserveOnly", StringComparison.Ordinal), "tester README should explain ObserveOnly limits");
    AssertTrue(readme.Contains("plusieurs sons dans le meme navigateur bougent ensemble", StringComparison.OrdinalIgnoreCase), "tester README should explain the V1 browser-global limit");
    AssertTrue(readme.Contains("%LOCALAPPDATA%\\StreamVolumeGuard\\logs", StringComparison.OrdinalIgnoreCase), "tester README should point to local logs");
    AssertTrue(readme.Contains("chrome://extensions", StringComparison.OrdinalIgnoreCase), "tester README should explain Chrome extension loading");
    AssertTrue(readme.Contains("brave://extensions", StringComparison.OrdinalIgnoreCase), "tester README should explain Brave extension loading");
    AssertTrue(readme.Contains("edge://extensions", StringComparison.OrdinalIgnoreCase), "tester README should explain Edge extension loading");
    AssertTrue(readme.Contains("about:debugging#/runtime/this-firefox", StringComparison.OrdinalIgnoreCase), "tester README should document Firefox temporary loading limits");
    AssertTrue(readme.Contains("Safari et Firefox Android ne sont pas fournis", StringComparison.OrdinalIgnoreCase), "tester README should avoid promising Safari or Firefox Android support in the alpha package");

    AssertTrue(checklist.Contains("YouTube", StringComparison.OrdinalIgnoreCase), "tester checklist should include YouTube");
    AssertTrue(checklist.Contains("TikTok", StringComparison.OrdinalIgnoreCase), "tester checklist should include TikTok");
    AssertTrue(checklist.Contains("OBS", StringComparison.OrdinalIgnoreCase), "tester checklist should include OBS manual checks");
}

static void DesktopTargetChangeRearmsOneShotCalibration()
{
    var codeBehind = File.ReadAllText(FindDesktopMainWindowCodeBehindPath());
    var methodStart = codeBehind.IndexOf("private void ApplyGlobalTarget(", StringComparison.Ordinal);
    var methodEnd = codeBehind.IndexOf("private GlobalTargetState BuildGlobalTargetState()", StringComparison.Ordinal);

    AssertTrue(methodStart >= 0, "ApplyGlobalTarget method should exist");
    AssertTrue(methodEnd > methodStart, "ApplyGlobalTarget method should end before BuildGlobalTargetState");

    var method = codeBehind[methodStart..methodEnd];

    AssertTrue(method.Contains("autoCalibrationGate.Clear();", StringComparison.Ordinal), "target changes should rearm one-shot auto calibration");
    AssertTrue(method.Contains("manualChanges.Clear();", StringComparison.Ordinal), "target changes should rearm profile volume changes after manual adjustments");
    AssertTrue(
        method.IndexOf("autoCalibrationGate.Clear();", StringComparison.Ordinal) < method.IndexOf("SafeRefreshSessions(applyAuto: true);", StringComparison.Ordinal),
        "auto calibration gate should clear before the immediate refresh");
    AssertTrue(
        method.IndexOf("manualChanges.Clear();", StringComparison.Ordinal) < method.IndexOf("SafeRefreshSessions(applyAuto: true);", StringComparison.Ordinal),
        "manual cooldown should clear before the immediate refresh");
}

static void DesktopSameTargetDoesNotRearmOneShotCalibration()
{
    var codeBehind = File.ReadAllText(FindDesktopMainWindowCodeBehindPath());
    var presetStart = codeBehind.IndexOf("private void SetTargetPreset(", StringComparison.Ordinal);
    var presetEnd = codeBehind.IndexOf("private void ScheduleTargetSliderCommit(", StringComparison.Ordinal);
    var commitStart = codeBehind.IndexOf("private void CommitPendingTargetSliderChange(", StringComparison.Ordinal);
    var helperStart = codeBehind.IndexOf("private bool IsCurrentTarget(", StringComparison.Ordinal);
    var applyStart = codeBehind.IndexOf("private void ApplyGlobalTarget(", StringComparison.Ordinal);

    AssertTrue(presetStart >= 0 && presetEnd > presetStart, "SetTargetPreset method should be readable");
    AssertTrue(commitStart >= 0 && helperStart > commitStart, "CommitPendingTargetSliderChange method should end before IsCurrentTarget");
    AssertTrue(helperStart >= 0 && applyStart > helperStart, "IsCurrentTarget helper should exist before ApplyGlobalTarget");

    var presetMethod = codeBehind[presetStart..presetEnd];
    var commitMethod = codeBehind[commitStart..helperStart];

    AssertTrue(presetMethod.Contains("IsCurrentTarget(nextTarget)", StringComparison.Ordinal), "preset clicks should detect already active targets");
    AssertTrue(
        presetMethod.IndexOf("IsCurrentTarget(nextTarget)", StringComparison.Ordinal) < presetMethod.IndexOf("ApplyGlobalTarget(", StringComparison.Ordinal),
        "preset clicks should skip before ApplyGlobalTarget can rearm calibration");
    AssertTrue(
        presetMethod.IndexOf("IsCurrentTarget(nextTarget)", StringComparison.Ordinal) < presetMethod.IndexOf("activityLog.Write(\"target.changed\"", StringComparison.Ordinal),
        "preset clicks should skip before logging a target change");

    AssertTrue(commitMethod.Contains("IsCurrentTarget(pending)", StringComparison.Ordinal), "slider commits should detect already active targets");
    AssertTrue(
        commitMethod.IndexOf("IsCurrentTarget(pending)", StringComparison.Ordinal) < commitMethod.IndexOf("ApplyGlobalTarget(", StringComparison.Ordinal),
        "slider commits should skip before ApplyGlobalTarget can rearm calibration");
    AssertTrue(
        commitMethod.IndexOf("IsCurrentTarget(pending)", StringComparison.Ordinal) < commitMethod.IndexOf("activityLog.Write(\"target.changed\"", StringComparison.Ordinal),
        "slider commits should skip before logging a target change");
}

static void DesktopTargetPresetsSuppressDuplicateSliderLogs()
{
    var codeBehind = File.ReadAllText(FindDesktopMainWindowCodeBehindPath());
    var sliderStart = codeBehind.IndexOf("private void TargetSlider_ValueChanged(", StringComparison.Ordinal);
    var sliderEnd = codeBehind.IndexOf("private void SetTargetPreset(", StringComparison.Ordinal);
    var applyStart = codeBehind.IndexOf("private void ApplyGlobalTarget(", StringComparison.Ordinal);
    var applyEnd = codeBehind.IndexOf("private GlobalTargetState BuildGlobalTargetState()", StringComparison.Ordinal);

    AssertTrue(codeBehind.Contains("suppressTargetSliderChange", StringComparison.Ordinal), "target slider programmatic changes should have a suppression guard");
    AssertTrue(sliderStart >= 0 && sliderEnd > sliderStart, "TargetSlider_ValueChanged method should be readable");
    AssertTrue(applyStart >= 0 && applyEnd > applyStart, "ApplyGlobalTarget method should be readable");

    var sliderMethod = codeBehind[sliderStart..sliderEnd];
    var applyMethod = codeBehind[applyStart..applyEnd];

    AssertTrue(sliderMethod.Contains("suppressTargetSliderChange", StringComparison.Ordinal), "slider handler should skip programmatic preset changes");
    AssertTrue(applyMethod.Contains("suppressTargetSliderChange = true", StringComparison.Ordinal), "ApplyGlobalTarget should enable the guard before changing the slider");
    AssertTrue(applyMethod.Contains("suppressTargetSliderChange = false", StringComparison.Ordinal), "ApplyGlobalTarget should always clear the guard");
}

static void DesktopTargetSliderDebouncesSaveAndRefresh()
{
    var codeBehind = File.ReadAllText(FindDesktopMainWindowCodeBehindPath());
    var sliderStart = codeBehind.IndexOf("private void TargetSlider_ValueChanged(", StringComparison.Ordinal);
    var sliderEnd = codeBehind.IndexOf("private void SetTargetPreset(", StringComparison.Ordinal);
    var scheduleStart = codeBehind.IndexOf("private void ScheduleTargetSliderCommit(", StringComparison.Ordinal);
    var commitStart = codeBehind.IndexOf("private void CommitPendingTargetSliderChange(", StringComparison.Ordinal);
    var applyStart = codeBehind.IndexOf("private void ApplyGlobalTarget(", StringComparison.Ordinal);

    AssertTrue(codeBehind.Contains("targetSliderDebounceTimer", StringComparison.Ordinal), "target slider should have a debounce timer");
    AssertTrue(codeBehind.Contains("TimeSpan.FromMilliseconds(150)", StringComparison.Ordinal), "target slider should react quickly enough for manual testing");
    AssertTrue(codeBehind.Contains("pendingTargetSettings", StringComparison.Ordinal), "target slider should keep one pending target");
    AssertTrue(sliderStart >= 0 && sliderEnd > sliderStart, "TargetSlider_ValueChanged method should be readable");
    AssertTrue(scheduleStart >= 0 && commitStart > scheduleStart, "ScheduleTargetSliderCommit method should be readable");
    AssertTrue(commitStart >= 0 && applyStart > commitStart, "CommitPendingTargetSliderChange method should be readable");

    var sliderMethod = codeBehind[sliderStart..sliderEnd];
    var scheduleMethod = codeBehind[scheduleStart..commitStart];
    var commitMethod = codeBehind[commitStart..applyStart];

    AssertTrue(sliderMethod.Contains("ScheduleTargetSliderCommit", StringComparison.Ordinal), "slider handler should schedule a debounced commit");
    AssertFalse(sliderMethod.Contains("ApplyGlobalTarget(", StringComparison.Ordinal), "slider handler should not save or refresh immediately");
    AssertFalse(sliderMethod.Contains("activityLog.Write(\"target.changed\"", StringComparison.Ordinal), "slider handler should not log every intermediate value");
    AssertTrue(scheduleMethod.Contains("targetSliderDebounceTimer.Stop();", StringComparison.Ordinal), "debounce scheduling should reset the timer");
    AssertTrue(scheduleMethod.Contains("targetSliderDebounceTimer.Start();", StringComparison.Ordinal), "debounce scheduling should restart the timer");
    AssertTrue(commitMethod.Contains("ApplyGlobalTarget(pending, save: true, refresh: true);", StringComparison.Ordinal), "debounced commit should apply once with save and refresh");
    AssertTrue(commitMethod.Contains("activityLog.Write(\"target.changed\"", StringComparison.Ordinal), "debounced commit should write a single target change log");
}

static void BridgeHttpParserKeepsUtf8BodyByByteLength()
{
    const string body = "{\"type\":\"browser_source_observed\",\"title\":\"électricité\"}";
    var bodyBytes = Encoding.UTF8.GetBytes(body);
    var headerBytes = Encoding.ASCII.GetBytes($"POST /browser-source HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: {bodyBytes.Length}\r\n\r\n");
    var raw = headerBytes.Concat(bodyBytes).ToArray();

    var request = BridgeHttpRequestParser.Parse(raw, maxBodyBytes: 1024);

    AssertEqual("POST", request.Method, "method");
    AssertEqual("/browser-source", request.Path, "path");
    AssertEqual(body, Encoding.UTF8.GetString(request.Body), "utf8 body");
}

static void BridgeHttpParserRejectsOversizedBody()
{
    const string body = "{\"type\":\"browser_source_observed\"}";
    var bodyBytes = Encoding.UTF8.GetBytes(body);
    var headerBytes = Encoding.ASCII.GetBytes($"POST /browser-source HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: {bodyBytes.Length}\r\n\r\n");
    var raw = headerBytes.Concat(bodyBytes).ToArray();

    AssertThrows(() => BridgeHttpRequestParser.Parse(raw, maxBodyBytes: bodyBytes.Length - 1), "content length");
}

static void BridgeAccessPolicyAllowsExtensionAndLocalOriginsOnly()
{
    AssertTrue(BridgeHttpAccessPolicy.IsOriginAllowed(null), "missing origin should be allowed for local tools");
    AssertTrue(BridgeHttpAccessPolicy.IsOriginAllowed("chrome-extension://abcdef"), "chrome extension origin should be allowed");
    AssertTrue(BridgeHttpAccessPolicy.IsOriginAllowed("moz-extension://abcdef"), "firefox extension origin should be allowed");
    AssertTrue(BridgeHttpAccessPolicy.IsOriginAllowed("http://127.0.0.1:61612"), "loopback test origin should be allowed");
    AssertTrue(BridgeHttpAccessPolicy.IsOriginAllowed("http://localhost:61612"), "localhost test origin should be allowed");
    AssertFalse(BridgeHttpAccessPolicy.IsOriginAllowed("https://example.com"), "remote web origin should be blocked");
}

static void BridgeAccessPolicyValidatesOptionalToken()
{
    var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        ["X-StreamVolume-Guard-Token"] = "secret"
    };

    AssertTrue(BridgeHttpAccessPolicy.HasValidToken(headers, null), "empty required token should allow local dev");
    AssertTrue(BridgeHttpAccessPolicy.HasValidToken(headers, "secret"), "matching token should be accepted");
    AssertFalse(BridgeHttpAccessPolicy.HasValidToken(headers, "other"), "wrong token should be rejected");
    AssertFalse(BridgeHttpAccessPolicy.HasValidToken(new Dictionary<string, string>(), "secret"), "missing token should be rejected when required");
}

static void BridgeAccessPolicyRequiresTokenForTargetState()
{
    AssertFalse(BridgeHttpAccessPolicy.RequiresTokenForRequest("GET", "/health"), "health checks should stay open for local diagnostics");
    AssertFalse(BridgeHttpAccessPolicy.RequiresTokenForRequest("OPTIONS", "/global-target"), "preflight should stay open");
    AssertTrue(BridgeHttpAccessPolicy.RequiresTokenForRequest("POST", "/browser-source"), "browser source writes should require token when configured");
    AssertTrue(BridgeHttpAccessPolicy.RequiresTokenForRequest("GET", "/global-target"), "global target reads should require token when configured");
    AssertTrue(BridgeHttpAccessPolicy.RequiresTokenForRequest("POST", "/extension-log"), "extension logs should require token when configured");
}

static void LocalBridgeServerExposesExtensionLogEndpoint()
{
    var source = File.ReadAllText(FindLocalBrowserBridgeServerPath());

    AssertTrue(source.Contains("ExtensionLogPath = \"/extension-log\"", StringComparison.Ordinal), "server should expose an extension log path constant");
    AssertTrue(source.Contains("ExtensionLogReceived", StringComparison.Ordinal), "server should emit extension log events");
    AssertTrue(source.Contains("ParseExtensionLog", StringComparison.Ordinal), "server should parse extension log messages");
}

static void BridgeParserRejectsInvalidControlSurface()
{
    AssertThrows(() => BrowserBridgeMessageParser.ParseBrowserSource("{\"type\":\"browser_source_observed\",\"sourceId\":\"x\",\"origin\":\"BrowserExtension\",\"controlSurface\":\"Magic\"}"), "controlSurface");
}

static void BridgeParserRejectsMissingIsControllable()
{
    AssertThrows(() => BrowserBridgeMessageParser.ParseBrowserSource("{\"type\":\"browser_source_observed\",\"sourceId\":\"x\",\"origin\":\"BrowserExtension\",\"controlSurface\":\"BrowserGain\"}"), "isControllable");
}

static void BridgeParserRejectsInconsistentControlCapability()
{
    AssertThrows(() => BrowserBridgeMessageParser.ParseBrowserSource("{\"type\":\"browser_source_observed\",\"sourceId\":\"x\",\"origin\":\"BrowserExtension\",\"controlSurface\":\"BrowserGain\",\"isControllable\":false}"), "isControllable");
}
static BrowserSubSourceSnapshot TestBrowserSource(
    string sourceId,
    DateTimeOffset lastSeen,
    string browserProcess = "Chrome",
    AudioControlSurface controlSurface = AudioControlSurface.BrowserGain,
    AudioSessionStatus status = AudioSessionStatus.Safe,
    DateTimeOffset? lastBrowserGainSeenUtc = null,
    string calibrationState = "")
{
    return new BrowserSubSourceSnapshot(
        SourceId: sourceId,
        BrowserProcess: browserProcess,
        TabId: 42,
        SiteName: "YouTube",
        Title: "Music stream",
        CurrentLevel: 0.5f,
        AppliedGain: 0.9f,
        Status: status,
        Origin: AudioSourceOrigin.BrowserExtension,
        ControlSurface: controlSurface,
        LastSeenUtc: lastSeen,
        LastBrowserGainSeenUtc: lastBrowserGainSeenUtc,
        CalibrationState: calibrationState);
}
static AudioSessionSnapshot TestSession(
    float peak,
    float volume,
    string? processName = "not-used",
    bool isExcluded = false,
    bool isMuted = false,
    DateTimeOffset? lastManualChangeUtc = null,
    bool isControllable = true,
    string displayName = "Test source",
    string sessionId = "device-a/session",
    bool isSystemSession = false)
{
    return new AudioSessionSnapshot(
        SessionId: sessionId,
        DeviceId: "device-a",
        DisplayName: displayName,
        ProcessName: processName,
        ProcessId: 1234,
        PeakLevel: peak,
        VolumeScalar: volume,
        IsMuted: isMuted,
        IsSystemSession: isSystemSession,
        IsControllable: isControllable,
        LastManualChangeUtc: lastManualChangeUtc,
        IsExcluded: isExcluded,
        SeenAtUtc: DateTimeOffset.UtcNow);
}


static string CreateTempDirectory()
{
    var directory = Path.Combine(Path.GetTempPath(), "StreamVolumeGuard.Tests", Guid.NewGuid().ToString("N"));
    Directory.CreateDirectory(directory);
    return directory;
}

static string FindDesktopMainWindowXamlPath()
{
    var directory = new DirectoryInfo(Directory.GetCurrentDirectory());
    while (directory is not null)
    {
        var candidate = Path.Combine(directory.FullName, "apps", "desktop", "src", "StreamVolumeGuard.App", "MainWindow.xaml");
        if (File.Exists(candidate))
        {
            return candidate;
        }

        directory = directory.Parent;
    }

    throw new FileNotFoundException("MainWindow.xaml was not found from the current test directory.");
}

static string FindDesktopMainWindowCodeBehindPath()
{
    var current = new DirectoryInfo(AppContext.BaseDirectory);
    while (current is not null)
    {
        var candidate = Path.Combine(current.FullName, "src", "StreamVolumeGuard.App", "MainWindow.xaml.cs");
        if (File.Exists(candidate))
        {
            return candidate;
        }

        candidate = Path.Combine(current.FullName, "apps", "desktop", "src", "StreamVolumeGuard.App", "MainWindow.xaml.cs");
        if (File.Exists(candidate))
        {
            return candidate;
        }

        current = current.Parent;
    }

    throw new FileNotFoundException("MainWindow.xaml.cs was not found from the test base directory.");
}

static string FindLocalBrowserBridgeServerPath()
{
    var current = new DirectoryInfo(AppContext.BaseDirectory);
    while (current is not null)
    {
        var candidate = Path.Combine(current.FullName, "src", "StreamVolumeGuard.App", "Bridge", "LocalBrowserBridgeServer.cs");
        if (File.Exists(candidate))
        {
            return candidate;
        }

        candidate = Path.Combine(current.FullName, "apps", "desktop", "src", "StreamVolumeGuard.App", "Bridge", "LocalBrowserBridgeServer.cs");
        if (File.Exists(candidate))
        {
            return candidate;
        }

        current = current.Parent;
    }

    throw new FileNotFoundException("LocalBrowserBridgeServer.cs was not found from the test base directory.");
}

static string FindRepositoryFilePath(string relativePath)
{
    var current = new DirectoryInfo(Directory.GetCurrentDirectory());
    while (current is not null)
    {
        var candidate = Path.Combine(current.FullName, relativePath);
        if (File.Exists(candidate))
        {
            return candidate;
        }

        current = current.Parent;
    }

    throw new FileNotFoundException($"{relativePath} was not found from the current test directory.");
}

static void AssertThrows(Action action, string expectedMessagePart)
{
    try
    {
        action();
    }
    catch (Exception ex)
    {
        if (!ex.Message.Contains(expectedMessagePart, StringComparison.OrdinalIgnoreCase))
        {
            throw new Exception($"expected error containing {expectedMessagePart}, got {ex.Message}");
        }
        return;
    }

    throw new Exception($"expected exception containing {expectedMessagePart}");
}
static void AssertTrue(bool value, string label)
{
    if (!value) throw new Exception(label);
}

static void AssertFalse(bool value, string label)
{
    if (value) throw new Exception(label);
}

static void AssertEqual<T>(T expected, T actual, string label)
{
    if (!EqualityComparer<T>.Default.Equals(expected, actual))
    {
        throw new Exception($"{label}: expected {expected}, got {actual}");
    }
}








