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
    ("excluded session is never changed", ExcludedSessionIsNeverChanged),
    ("muted session is reported but not unmuted", MutedSessionIsReportedButNotUnmuted),
    ("manual cooldown prevents immediate correction", ManualCooldownPreventsImmediateCorrection),
    ("manual tracker stores latest change per session", ManualTrackerStoresLatestChange),
    ("panic lowers controllable non-excluded sessions only", PanicLowersControllableNonExcludedSessionsOnly),
    ("observation mode logs would apply without setting volume", ObservationModeLogsWouldApplyWithoutSettingVolume),
    ("active auto applies volume without would apply log", ActiveAutoAppliesVolumeWithoutWouldApplyLog),
    ("auto calibration gate allows one correction per active source", AutoCalibrationGateAllowsOneCorrectionPerActiveSource),
    ("auto calibration gate resets after sustained silence", AutoCalibrationGateResetsAfterSustainedSilence),
    ("auto calibration gate clears disappeared sessions", AutoCalibrationGateClearsDisappearedSessions),
    ("auto calibration gate preserves non applying decisions", AutoCalibrationGatePreservesNonApplyingDecisions),
    ("browser source snapshot keeps capability data", BrowserSourceSnapshotKeepsCapabilityData),
    ("browser source store removes stale sources", BrowserSourceStoreRemovesStaleSources),
    ("browser source store preserves recent browser gain during observe-only flap", BrowserSourceStorePreservesRecentBrowserGainDuringObserveOnlyFlap),
    ("browser gain conflict blocks browser session auto correction", BrowserGainConflictBlocksBrowserSessionAutoCorrection),
    ("browser gain conflict blocks chromium alias browser sessions", BrowserGainConflictBlocksChromiumAliasBrowserSessions),
    ("recent observe-only browser source still blocks session correction", RecentObserveOnlyBrowserSourceStillBlocksSessionCorrection),
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
    ("activity log writes sanitized event line", ActivityLogWritesSanitizedEventLine),
    ("activity log reads recent lines", ActivityLogReadsRecentLines),
    ("app config store returns default when missing", AppConfigStoreReturnsDefaultWhenMissing),
    ("app config store persists auto theme and exclusions", AppConfigStorePersistsAutoAndExclusions),
    ("app config store persists target profile", AppConfigStorePersistsTargetProfile),
    ("normalizer settings adapt to target decibels", NormalizerSettingsAdaptToTargetDecibels),
    ("desktop target change rearms one shot calibration", DesktopTargetChangeRearmsOneShotCalibration),
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

static void BrowserGainConflictBlocksBrowserSessionAutoCorrection()
{
    var now = new DateTimeOffset(2026, 7, 2, 12, 0, 0, TimeSpan.Zero);
    var normalizer = new VolumeNormalizer(NormalizerSettings.StreamDefault);
    var policy = new BrowserSessionConflictPolicy(TimeSpan.FromSeconds(15));
    var session = TestSession(peak: 0.95f, volume: 0.80f, processName: "chrome");
    var decision = normalizer.Evaluate(session, now);
    var browserSource = TestBrowserSource("tab-1:media", now, browserProcess: "Chrome", controlSurface: AudioControlSurface.BrowserGain, status: AudioSessionStatus.Risky);

    var resolved = policy.Apply(session, decision, new[] { browserSource }, now);

    AssertEqual(AudioSessionStatus.Risky, resolved.Status, "status should stay honest");
    AssertFalse(resolved.ShouldApplyVolume, "browser gain should block Windows session correction");
    AssertEqual(session.VolumeScalar, resolved.TargetVolumeScalar, "target should stay at current Windows volume");
    AssertEqual("browser-gain-conflict", resolved.Reason, "reason");
}

static void BrowserGainConflictBlocksChromiumAliasBrowserSessions()
{
    var now = new DateTimeOffset(2026, 7, 2, 12, 0, 0, TimeSpan.Zero);
    var normalizer = new VolumeNormalizer(NormalizerSettings.StreamDefault);
    var policy = new BrowserSessionConflictPolicy(TimeSpan.FromSeconds(15));
    var session = TestSession(peak: 0.95f, volume: 0.80f, processName: "brave", displayName: "brave");
    var decision = normalizer.Evaluate(session, now);
    var browserSource = TestBrowserSource("tab-1:media", now, browserProcess: "chrome", controlSurface: AudioControlSurface.BrowserGain, status: AudioSessionStatus.Risky);

    var resolved = policy.Apply(session, decision, new[] { browserSource }, now);

    AssertFalse(resolved.ShouldApplyVolume, "chromium-family BrowserGain source should block Brave Windows correction");
    AssertEqual(session.VolumeScalar, resolved.TargetVolumeScalar, "target should stay at current Windows volume");
    AssertEqual("browser-gain-conflict", resolved.Reason, "reason");
}

static void RecentObserveOnlyBrowserSourceStillBlocksSessionCorrection()
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
        lastBrowserGainSeenUtc: now.AddSeconds(-1));

    var resolved = policy.Apply(session, decision, new[] { browserSource }, now);

    AssertFalse(resolved.ShouldApplyVolume, "recent BrowserGain history should block Windows correction during observe-only flap");
    AssertEqual(session.VolumeScalar, resolved.TargetVolumeScalar, "target should stay at current Windows volume");
    AssertEqual("browser-gain-conflict", resolved.Reason, "reason");
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

    AssertTrue(xaml.Contains("Cible volume", StringComparison.Ordinal), "target volume label should be visible");
    AssertTrue(xaml.Contains("Calme", StringComparison.Ordinal), "quiet target mode should be visible");
    AssertTrue(xaml.Contains("Standard", StringComparison.Ordinal), "standard target mode should be visible");
    AssertTrue(xaml.Contains("Fort", StringComparison.Ordinal), "loud target mode should be visible");
    AssertFalse(xaml.Contains("Standard stream", StringComparison.OrdinalIgnoreCase), "target mode should not be stream-specific");
    AssertFalse(xaml.Contains("pour streamers", StringComparison.OrdinalIgnoreCase), "subtitle should address everyone, not only streamers");
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
    AssertTrue(
        method.IndexOf("autoCalibrationGate.Clear();", StringComparison.Ordinal) < method.IndexOf("SafeRefreshSessions(applyAuto: true);", StringComparison.Ordinal),
        "auto calibration gate should clear before the immediate refresh");
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
    DateTimeOffset? lastBrowserGainSeenUtc = null)
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
        LastBrowserGainSeenUtc: lastBrowserGainSeenUtc);
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








