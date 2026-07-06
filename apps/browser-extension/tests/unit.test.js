const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function createContext() {
  const storageData = {};
  const context = {
    console,
    setTimeout,
    clearTimeout,
    globalThis: {},
    chrome: {
      storage: {
        local: {
          get(keys, callback) {
            if (Array.isArray(keys)) {
              const result = {};
              keys.forEach((key) => {
                result[key] = storageData[key];
              });
              callback(result);
              return;
            }
            if (typeof keys === "string") {
              callback({ [keys]: storageData[keys] });
              return;
            }
            callback({ ...storageData });
          },
          set(values, callback) {
            Object.assign(storageData, values);
            if (callback) callback();
          },
          remove(keys, callback) {
            const list = Array.isArray(keys) ? keys : [keys];
            list.forEach((key) => delete storageData[key]);
            if (callback) callback();
          }
        }
      },
      runtime: {
        lastError: null
      }
    }
  };
  context.globalThis = context;
  return vm.createContext(context);
}

function loadScript(context, relativePath) {
  const filePath = path.join(root, relativePath);
  const source = fs.readFileSync(filePath, "utf8");
  vm.runInContext(source, context, { filename: relativePath });
}

function loadCore() {
  const context = createContext();
  [
    "storage/settings.js",
    "license/capabilities.js",
    "audio/analyser.js",
    "audio/limiter.js",
    "audio/stream-status.js",
    "audio/source-state.js",
    "audio/browser-gain-calibration.js",
    "audio/normalizer.js"
  ].forEach((file) => loadScript(context, file));
  return context.StreamVolumeGuard;
}

function loadCalibrationCore() {
  const context = createContext();
  [
    "audio/analyser.js",
    "audio/browser-gain-calibration.js"
  ].forEach((file) => loadScript(context, file));
  return context.StreamVolumeGuard;
}

function loadSourceStateCore() {
  const context = createContext();
  loadScript(context, "audio/source-state.js");
  return context.StreamVolumeGuard.SourceState;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function assertNoDuplicateJsonObjectKeys(relativePath) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  const keys = Array.from(source.matchAll(/^\s*"([^"]+)":\s*\{/gm), (match) => match[1]);
  const seen = new Set();
  const duplicates = [];

  keys.forEach((key) => {
    if (seen.has(key) && !duplicates.includes(key)) {
      duplicates.push(key);
    }
    seen.add(key);
  });

  assert.deepEqual(duplicates, [], `${relativePath} should not contain duplicate message keys`);
}

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  for (const entry of tests) {
    try {
      await entry.fn();
      console.log(`PASS ${entry.name}`);
    } catch (error) {
      console.error(`FAIL ${entry.name}`);
      throw error;
    }
  }
}

test("default settings are streamer-first and enabled", () => {
  const WLG = loadCore();
  assert.equal(WLG.Settings.DEFAULT_SETTINGS.enabled, true);
  assert.equal(WLG.Settings.DEFAULT_SETTINGS.activeProfile, "stream");
  assert.equal(WLG.Settings.DEFAULT_SETTINGS.targetRmsMode, "profile");
  assert.equal(WLG.Settings.DEFAULT_SETTINGS.targetRmsDb, -21);
  assert.equal(WLG.Settings.DEFAULT_SETTINGS.maxBoostDb, 48);
  assert.equal(WLG.Settings.DEFAULT_SETTINGS.maxReductionDb, -24);
});

  test("browser source state machine classifies direct and fallback control paths", () => {
    const SourceState = loadSourceStateCore();

  const silentMedia = SourceState.classifyBrowserStatus({
    enabled: true,
    sourceType: "media-html",
    mediaDetected: 0,
    mediaProcessed: 0,
    rmsDb: -120,
    outputRmsDb: -120,
    captureFallbackReason: "no-media-element-detected",
    tabAudible: true,
    canCaptureTab: true
  });
  assert.equal(silentMedia.browserState, "media-html-no-signal");
  assert.equal(silentMedia.controlSurface, "ObserveOnly");
  assert.equal(silentMedia.isControllable, false);
  assert.equal(silentMedia.reason, "no-media-element-detected");
  assert.match(silentMedia.recommendedAction, /tabCapture/i);

    const mediaAfterCaptureNoSignal = SourceState.classifyBrowserStatus({
      enabled: true,
      sourceType: "media-html",
      mediaDetected: 1,
    mediaProcessed: 0,
    reason: "media-html-starting",
    captureFallbackReason: "tab-capture-no-signal",
    captureSignalState: "no-signal",
    captureRestartCount: 1,
    rmsDb: -120,
    outputRmsDb: -120,
    tabAudible: true,
    canCaptureTab: true
  }, { desktopBridgeConnected: false });
  assert.equal(mediaAfterCaptureNoSignal.browserState, "tab-capture-no-signal");
  assert.equal(mediaAfterCaptureNoSignal.controlSurface, "ObserveOnly");
  assert.equal(mediaAfterCaptureNoSignal.isControllable, false);
  assert.equal(mediaAfterCaptureNoSignal.reason, "tab-capture-no-signal");
    assert.doesNotMatch(mediaAfterCaptureNoSignal.recommendedAction, /Tenter tabCapture/i);
    assert.doesNotMatch(mediaAfterCaptureNoSignal.recommendedAction, /Windows/i);

    const safetyAttenuationMedia = SourceState.classifyBrowserStatus({
      enabled: true,
      sourceType: "media-html",
      mediaDetected: 1,
      mediaProcessed: 1,
      reason: "safety-attenuation",
      calibrationReason: "safety-attenuation",
      riskLevel: "risky",
      rmsDb: -24,
      outputRmsDb: -31,
      canCaptureTab: true,
      tabAudible: true
    });
    assert.equal(safetyAttenuationMedia.browserState, "media-html-signal");
    assert.equal(safetyAttenuationMedia.controlSurface, "BrowserGain");
    assert.equal(safetyAttenuationMedia.status, "Risky");
    assert.equal(safetyAttenuationMedia.isControllable, true);
    assert.equal(safetyAttenuationMedia.reason, "safety-attenuation");

    const capturedSignal = SourceState.classifyBrowserStatus({
      enabled: true,
      sourceType: "tab-capture",
      captureSignalState: "signal",
    rmsDb: -18,
    outputRmsDb: -21,
    calibrationState: "",
    tabAudible: true
  });
  assert.equal(capturedSignal.browserState, "tab-capture-signal");
  assert.equal(capturedSignal.controlSurface, "BrowserGain");
  assert.equal(capturedSignal.status, "Safe");
  assert.equal(capturedSignal.isControllable, true);

  const standaloneNoSignal = SourceState.classifyBrowserStatus({
    enabled: true,
    sourceType: "tab-capture",
    captureSignalState: "no-signal",
    captureFallbackReason: "tab-capture-no-signal",
    rmsDb: -120,
    outputRmsDb: -120,
    tabAudible: true
  }, { desktopBridgeConnected: false });
  assert.equal(standaloneNoSignal.browserState, "tab-capture-no-signal");
  assert.equal(standaloneNoSignal.controlSurface, "ObserveOnly");
  assert.equal(standaloneNoSignal.isControllable, false);
  assert.equal(standaloneNoSignal.reason, "tab-capture-no-signal");
  assert.doesNotMatch(standaloneNoSignal.recommendedAction, /Windows/i);

    const desktopNoSignal = SourceState.classifyBrowserStatus({
      enabled: true,
      sourceType: "tab-capture",
      captureSignalState: "no-signal",
      captureFallbackReason: "tab-capture-no-signal",
    rmsDb: -120,
    outputRmsDb: -120,
    tabAudible: true
  }, { desktopBridgeConnected: true });
  assert.equal(desktopNoSignal.browserState, "desktop-fallback-available");
    assert.equal(desktopNoSignal.controlSurface, "ObserveOnly");
    assert.equal(desktopNoSignal.isControllable, false);
    assert.match(desktopNoSignal.recommendedAction, /Windows/i);

    const liveTrackNoSignalTabCapture = SourceState.classifyBrowserStatus({
      enabled: true,
      sourceType: "tab-capture",
      mediaDetected: 1,
      mediaProcessed: 1,
      audioTrackCount: 1,
      captureTrackState: "live",
      captureSignalState: "no-signal",
      captureFallbackReason: "tab-capture-no-signal",
      rmsDb: -120,
      outputRmsDb: -120,
      tabAudible: true
    }, { desktopBridgeConnected: true });
    assert.equal(liveTrackNoSignalTabCapture.browserState, "tab-capture-no-signal");
    assert.equal(liveTrackNoSignalTabCapture.controlSurface, "ObserveOnly");
    assert.equal(liveTrackNoSignalTabCapture.isControllable, false);
    assert.equal(liveTrackNoSignalTabCapture.reason, "tab-capture-no-signal");
    assert.doesNotMatch(liveTrackNoSignalTabCapture.recommendedAction, /Windows/i);
    });

test("legacy settings migrate max boost so the test page remains recoverable", () => {
  const WLG = loadCore();
  const oldSchemaMigrated = WLG.Settings.normalizeSettings({
    schemaVersion: 2,
    maxBoostDb: 12
  });
  const previousSchemaMigrated = WLG.Settings.normalizeSettings({
    schemaVersion: 3,
    maxBoostDb: 12
  });
  const currentSchemaManualLowering = WLG.Settings.normalizeSettings({
    schemaVersion: 5,
    maxBoostDb: 12
  });
  const weakToneRecoverableAtMinus22Peak = WLG.Settings.normalizeSettings({
    schemaVersion: 5,
    targetRmsDb: -25,
    maxBoostDb: 25
  });

  assert.equal(WLG.Settings.SETTINGS_SCHEMA_VERSION, 9);
  assert.equal(oldSchemaMigrated.maxBoostDb, 48);
  assert.equal(previousSchemaMigrated.maxBoostDb, 48);
  assert.equal(currentSchemaManualLowering.maxBoostDb, 44);
  assert.equal(weakToneRecoverableAtMinus22Peak.maxBoostDb, 40);
  assert.equal(WLG.Settings.getMinimumRecoverableBoostDb(-25), 40);
});

test("legacy default stream loudness migrates to the calmer streamer target", () => {
  const WLG = loadCore();
  const oldDefaultTarget = WLG.Settings.normalizeSettings({
    schemaVersion: 4,
    activeProfile: "stream",
    targetRmsDb: -18.5
  });
  const customTarget = WLG.Settings.normalizeSettings({
    schemaVersion: 4,
    activeProfile: "stream",
    targetRmsDb: -16
  });
  const currentManualTarget = WLG.Settings.normalizeSettings({
    schemaVersion: 6,
    activeProfile: "stream",
    targetRmsDb: -18.5,
    targetRmsMode: "custom"
  });

  assert.equal(oldDefaultTarget.targetRmsDb, -21);
  assert.equal(customTarget.targetRmsDb, -16);
  assert.equal(currentManualTarget.targetRmsDb, -18.5);
});

test("normalizeDomain strips protocols, ports, paths and www prefix", () => {
  const WLG = loadCore();
  assert.equal(
    WLG.Settings.normalizeDomain("https://www.Twitch.tv:443/some/channel?x=1"),
    "twitch.tv"
  );
  assert.equal(WLG.Settings.normalizeDomain("WWW.YouTube.COM/watch?v=1"), "youtube.com");
});

test("stream profile is protective", () => {
  const WLG = loadCore();
  const stream = WLG.Settings.getProfile("stream");
  assert.equal(stream.id, "stream");
  assert.equal(stream.label, "Stream");
  assert.equal(stream.targetRmsDb, -21);
  assert.equal(stream.attackMs, 80);
  assert.equal(stream.releaseMs, 1250);
  assert.equal(stream.ratio, 3);
  assert.equal(stream.limiterCeilingDb, -1);
  assert.ok(stream.attackMs < stream.releaseMs);
  assert.ok(stream.targetRmsDb <= -18);
  assert.ok(stream.ratio >= 3);
});

test("universal profile is migrated into stream and no longer exposed", () => {
  const WLG = loadCore();
  const migrated = WLG.Settings.normalizeSettings({
    schemaVersion: 7,
    activeProfile: "universal",
    targetRmsMode: "profile",
    targetRmsDb: -21,
    domainProfiles: {
      "youtube.com": "universal"
    }
  });

  assert.equal(WLG.Settings.SETTINGS_SCHEMA_VERSION, 9);
  assert.equal(WLG.Settings.PROFILES.universal, undefined);
  assert.equal(WLG.Settings.getProfile("universal").id, "stream");
  assert.equal(migrated.activeProfile, "stream");
  assert.equal(migrated.domainProfiles["youtube.com"], "stream");
  assert.equal(migrated.targetRmsDb, WLG.Settings.PROFILES.stream.targetRmsDb);
});

test("OBS recommended profile is available and calmer than the stream profile", () => {
  const WLG = loadCore();
  const obs = WLG.Settings.getProfile("obs");
  const stream = WLG.Settings.getProfile("stream");

  assert.equal(obs.id, "obs");
  assert.ok(obs.label.length > 0);
  assert.ok(obs.targetRmsDb < stream.targetRmsDb);
  assert.ok(obs.targetRmsDb >= -23);
  assert.ok(obs.attackMs <= 50);
  assert.ok(obs.releaseMs >= 700 && obs.releaseMs <= 1000);
  assert.ok(obs.ratio >= 4);
  assert.equal(obs.limiterCeilingDb, -1);
});

test("stream profile recovers quiet content faster without becoming abrupt", () => {
  const WLG = loadCore();
  const stream = WLG.Settings.getProfile("stream");
  const gainAfterOneSecond = WLG.Normalizer.smoothGainDb(0, 12, 1000, stream.attackMs, stream.releaseMs);

  assert.ok(stream.releaseMs <= 1300, "Stream release should stay responsive enough for streamer use");
  assert.ok(stream.releaseMs >= 1000, "Stream release should stay natural enough for web voices and music");
  assert.ok(gainAfterOneSecond > 6, "Quiet content should recover meaningfully after one second");
  assert.ok(gainAfterOneSecond < 8, "Quiet content should not jump instantly to max boost");
});

test("stream profile catches up quickly on extreme quiet test-page jumps", () => {
  const WLG = loadCore();
  const stream = WLG.Settings.getProfile("stream");
  const recoveredGain = WLG.Normalizer.smoothGainDb(-15.5, 44.5, 1000, stream.attackMs, stream.releaseMs);

  assert.ok(recoveredGain > 32, "Extreme quiet content should become clearly recoverable within one second");
  assert.ok(recoveredGain < 44.5, "Extreme quiet content should still be smoothed, not snapped instantly");
});

test("stream profile catches up moderate real-world boosts before they sound weak", () => {
  const WLG = loadCore();
  const stream = WLG.Settings.getProfile("stream");
  const recoveredGain = WLG.Normalizer.smoothGainDb(20, 27, 500, stream.attackMs, stream.releaseMs);

  assert.ok(recoveredGain > 22, "Moderate dynamic content should not stay several dB too weak for half a second");
  assert.ok(recoveredGain < 27, "Moderate dynamic content should still be smoothed, not snapped instantly");
});


test("target gain clamps boost and reduction", () => {
  const WLG = loadCore();
  assert.equal(
    WLG.Normalizer.calculateTargetGainDb({
      currentRmsDb: -60,
      targetRmsDb: -18,
      maxBoostDb: 12,
      maxReductionDb: -24
    }),
    12
  );
  assert.equal(
    WLG.Normalizer.calculateTargetGainDb({
      currentRmsDb: 12,
      targetRmsDb: -18,
      maxBoostDb: 12,
      maxReductionDb: -24
    }),
    -24
  );
});

test("browser gain calibration measures once applies gain and locks", () => {
  const WLG = loadCalibrationCore();
  const calibration = WLG.BrowserGainCalibration.createBrowserGainCalibration({
    measurementWindowMs: 3500,
    silenceRearmMs: 2500,
    minUsableSignalMs: 1000
  });

  const started = calibration.update({
    rmsDb: -27,
    targetRmsDb: -21,
    maxBoostDb: 48,
    maxReductionDb: -24,
    nowMs: 0,
    sourceKey: "media-html:youtube.com",
    targetSignature: "Fort|-21"
  });
  assert.equal(started.calibrationState, "measuring");
  assert.equal(started.events[0].eventName, "browser.calibration.started");

  calibration.update({
    rmsDb: -26,
    targetRmsDb: -21,
    maxBoostDb: 48,
    maxReductionDb: -24,
    nowMs: 1800,
    sourceKey: "media-html:youtube.com",
    targetSignature: "Fort|-21"
  });

  const applied = calibration.update({
    rmsDb: -25,
    targetRmsDb: -21,
    maxBoostDb: 48,
    maxReductionDb: -24,
    nowMs: 3600,
    sourceKey: "media-html:youtube.com",
    targetSignature: "Fort|-21"
  });
  assert.equal(applied.calibrationState, "locked");
  assert.equal(applied.gainDb, 5);
  assert.equal(applied.measuredRmsDb, -26);
  assert.deepEqual(Array.from(applied.events, (event) => event.eventName), [
    "browser.calibration.measured",
    "browser.gain.applied",
    "browser.gain.locked"
  ]);

  const locked = calibration.update({
    rmsDb: -12,
    targetRmsDb: -21,
    maxBoostDb: 48,
    maxReductionDb: -24,
    nowMs: 4200,
    sourceKey: "media-html:youtube.com",
    targetSignature: "Fort|-21"
  });
  assert.equal(locked.calibrationState, "locked");
  assert.equal(locked.gainDb, 5);
  assert.equal(locked.events.length, 0);

  calibration.update({
    rmsDb: -120,
    targetRmsDb: -21,
    maxBoostDb: 48,
    maxReductionDb: -24,
    nowMs: 6000,
    sourceKey: "media-html:youtube.com",
    targetSignature: "Fort|-21"
  });
  const rearmed = calibration.update({
    rmsDb: -120,
    targetRmsDb: -21,
    maxBoostDb: 48,
    maxReductionDb: -24,
    nowMs: 8600,
    sourceKey: "media-html:youtube.com",
    targetSignature: "Fort|-21"
  });
  assert.equal(rearmed.calibrationState, "measuring");
  assert.equal(rearmed.gainDb, 0);
  assert.equal(rearmed.events[0].eventName, "browser.gain.rearmed");
  assert.equal(rearmed.events[0].reason, "silence");
});

test("browser gain calibration retunes immediately when locked target changes", () => {
  const WLG = loadCalibrationCore();
  const calibration = WLG.BrowserGainCalibration.createBrowserGainCalibration({
    measurementWindowMs: 3500,
    minUsableSignalMs: 1000
  });

  [0, 1800, 3600].forEach((nowMs) => {
    calibration.update({
      rmsDb: -27,
      targetRmsDb: -21,
      maxBoostDb: 48,
      maxReductionDb: -24,
      nowMs,
      sourceKey: "media-html:open.spotify.com",
      targetSignature: "Standard|-21|initial"
    });
  });

  const retuned = calibration.update({
    rmsDb: -27,
    targetRmsDb: -15,
    maxBoostDb: 48,
    maxReductionDb: -24,
    nowMs: 3700,
    sourceKey: "media-html:open.spotify.com",
    targetSignature: "Fort|-15|changed"
  });

  assert.equal(retuned.calibrationState, "locked");
  assert.equal(retuned.measuredRmsDb, -27);
  assert.equal(retuned.gainDb, 12);
  assert.equal(retuned.appliedGainDb, 12);
  assert.equal(retuned.calibrationReason, "target-changed");
  assert.deepEqual(Array.from(retuned.events, (event) => event.eventName), [
    "browser.gain.rearmed",
    "browser.gain.applied",
    "browser.gain.locked"
  ]);
});

test("browser gain calibration waits for a robust window and uses the global tone", () => {
  const WLG = loadCalibrationCore();
  const calibration = WLG.BrowserGainCalibration.createBrowserGainCalibration();
  let result = null;

  [0, 1000, 2000, 3000, 4000].forEach((nowMs) => {
    result = calibration.update({
      rmsDb: -42,
      targetRmsDb: -21,
      maxBoostDb: 48,
      maxReductionDb: -24,
      nowMs,
      sourceKey: "media-html:youtube.com",
      targetSignature: "Fort|-21"
    });
  });

  assert.equal(result.calibrationState, "measuring");
  assert.equal(result.gainDb, 0, "quiet intro should not be boosted before the robust window completes");

  [5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000].forEach((nowMs) => {
    result = calibration.update({
      rmsDb: -19,
      targetRmsDb: -21,
      maxBoostDb: 48,
      maxReductionDb: -24,
      nowMs,
      sourceKey: "media-html:youtube.com",
      targetSignature: "Fort|-21"
    });
  });

  assert.equal(result.calibrationState, "measuring", "default calibration should not lock before the 18-second robust window completes");

  [13000, 14000, 15000, 16000, 17000, 18000].forEach((nowMs) => {
    result = calibration.update({
      rmsDb: -19,
      targetRmsDb: -21,
      maxBoostDb: 48,
      maxReductionDb: -24,
      nowMs,
      sourceKey: "media-html:youtube.com",
      targetSignature: "Fort|-21"
    });
  });

  assert.equal(result.calibrationState, "locked");
  assert.equal(result.measuredRmsDb, -19, "robust measurement should follow the dominant body, not the quiet intro average");
  assert.equal(result.gainDb, -2);
  assert.equal(result.calibrationReason, "stable-window-complete");
});

test("browser gain calibration skips when useful signal is too short", () => {
  const WLG = loadCalibrationCore();
  const calibration = WLG.BrowserGainCalibration.createBrowserGainCalibration({
    measurementWindowMs: 8000,
    minUsableSignalMs: 7000
  });

  [0, 1000, 2000, 3000, 4000, 5000, 6000].forEach((nowMs) => {
    calibration.update({
      rmsDb: -24,
      targetRmsDb: -21,
      maxBoostDb: 48,
      maxReductionDb: -24,
      nowMs,
      sourceKey: "media-html:tiktok.com",
      targetSignature: "Fort|-21"
    });
  });

  calibration.update({
    rmsDb: -120,
    targetRmsDb: -21,
    maxBoostDb: 48,
    maxReductionDb: -24,
    nowMs: 7000,
    sourceKey: "media-html:tiktok.com",
    targetSignature: "Fort|-21"
  });

  const skipped = calibration.update({
    rmsDb: -120,
    targetRmsDb: -21,
    maxBoostDb: 48,
    maxReductionDb: -24,
    nowMs: 18000,
    sourceKey: "media-html:tiktok.com",
    targetSignature: "Fort|-21"
  });

  assert.equal(skipped.calibrationState, "skipped");
  assert.equal(skipped.gainDb, 0);
  assert.equal(skipped.calibrationReason, "insufficient-signal");
  assert.equal(skipped.events[0].eventName, "browser.gain.skipped");
});

test("browser gain calibration attenuates dangerous loud starts without boosting quiet starts", () => {
  const WLG = loadCalibrationCore();
  const loudCalibration = WLG.BrowserGainCalibration.createBrowserGainCalibration();
  const loud = loudCalibration.update({
    rmsDb: -8,
    targetRmsDb: -21,
    maxBoostDb: 48,
    maxReductionDb: -24,
    nowMs: 0,
    sourceKey: "media-html:youtube.com",
    targetSignature: "Fort|-21"
  });

  assert.equal(loud.calibrationState, "measuring");
  assert.ok(loud.gainDb < 0, "dangerous loud starts should be attenuated during measurement");
  assert.equal(loud.calibrationReason, "safety-attenuation");
  assert.ok(Array.from(loud.events, (event) => event.eventName).includes("browser.gain.applied"));

  const quietCalibration = WLG.BrowserGainCalibration.createBrowserGainCalibration();
  const quiet = quietCalibration.update({
    rmsDb: -48,
    targetRmsDb: -21,
    maxBoostDb: 48,
    maxReductionDb: -24,
    nowMs: 0,
    sourceKey: "media-html:spotify.com",
    targetSignature: "Fort|-21"
  });

  assert.equal(quiet.calibrationState, "measuring");
  assert.equal(quiet.gainDb, 0, "quiet starts should not be boosted before enough signal is measured");
});

test("browser gain calibration rearms after a durable level shift", () => {
  const WLG = loadCalibrationCore();
  const calibration = WLG.BrowserGainCalibration.createBrowserGainCalibration({
    measurementWindowMs: 3000,
    minUsableSignalMs: 1000,
    durableLevelShiftMs: 9000,
    durableLevelShiftDb: 6
  });

  [0, 1000, 2000, 3000].forEach((nowMs) => {
    calibration.update({
      rmsDb: -28,
      targetRmsDb: -21,
      maxBoostDb: 48,
      maxReductionDb: -24,
      nowMs,
      sourceKey: "media-html:youtube.com",
      targetSignature: "Fort|-21"
    });
  });

  let result = null;
  [4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000].forEach((nowMs) => {
    result = calibration.update({
      rmsDb: -12,
      targetRmsDb: -21,
      maxBoostDb: 48,
      maxReductionDb: -24,
      nowMs,
      sourceKey: "media-html:youtube.com",
      targetSignature: "Fort|-21"
    });
  });

  assert.equal(result.calibrationState, "locked", "short loud changes should not rearm immediately");

  result = calibration.update({
    rmsDb: -12,
    targetRmsDb: -21,
    maxBoostDb: 48,
    maxReductionDb: -24,
    nowMs: 13000,
    sourceKey: "media-html:youtube.com",
    targetSignature: "Fort|-21"
  });

  assert.equal(result.calibrationState, "measuring");
  assert.equal(result.events[0].eventName, "browser.gain.rearmed");
  assert.equal(result.events[0].reason, "durable-level-shift");
});

test("browser gain calibration does not spam disabled skips and rearms when enabled again", () => {
  const WLG = loadCalibrationCore();
  const calibration = WLG.BrowserGainCalibration.createBrowserGainCalibration();

  const skipped = calibration.update({
    enabled: false,
    rmsDb: -24,
    targetRmsDb: -21,
    nowMs: 0,
    sourceKey: "media-html:youtube.com",
    targetSignature: "Fort|-21"
  });
  assert.equal(skipped.calibrationState, "skipped");
  assert.equal(skipped.events.length, 1);
  assert.equal(skipped.events[0].eventName, "browser.gain.skipped");

  const repeated = calibration.update({
    enabled: false,
    rmsDb: -24,
    targetRmsDb: -21,
    nowMs: 100,
    sourceKey: "media-html:youtube.com",
    targetSignature: "Fort|-21"
  });
  assert.equal(repeated.calibrationState, "skipped");
  assert.equal(repeated.events.length, 0);

  const reenabled = calibration.update({
    enabled: true,
    rmsDb: -24,
    targetRmsDb: -21,
    nowMs: 200,
    sourceKey: "media-html:youtube.com",
    targetSignature: "Fort|-21"
  });
  assert.equal(reenabled.calibrationState, "measuring");
  assert.equal(reenabled.events.length, 1);
  assert.equal(reenabled.events[0].eventName, "browser.gain.rearmed");
  assert.equal(reenabled.events[0].reason, "enabled");
});

test("free tier exposes local streamer-safe capabilities", () => {
  const WLG = loadCore();
  assert.equal(WLG.Capabilities.canUseFeature("safetyLimiter"), true);
  assert.equal(WLG.Capabilities.canUseFeature("perDomainProfiles"), true);
  assert.equal(WLG.Capabilities.canUseFeature("tabCaptureFallback"), true);
  assert.equal(WLG.Capabilities.canUseFeature("panicMode"), true);
  assert.equal(WLG.Capabilities.canUseFeature("guidedObsCalibration"), false);
  assert.equal(WLG.Capabilities.canUseFeature("obsCalibration"), false);
  assert.equal(WLG.Capabilities.canUseFeature("advancedLimiter"), false);
});

test("limiter gain never boosts above unity", () => {
  const WLG = loadCore();
  assert.equal(WLG.Limiter.computeLimiterGain(-12, -1), 1);
  assert.ok(WLG.Limiter.computeLimiterGain(2, -1) < 1);
  assert.ok(WLG.Limiter.computeLimiterGain(2, -1) > 0);
});

test("safety limiter does not attenuate the whole signal by default", () => {
  const limiterSource = fs.readFileSync(path.join(root, "audio", "limiter.js"), "utf8");
  const normalizerSource = fs.readFileSync(path.join(root, "audio", "normalizer.js"), "utf8");

  assert.match(limiterSource, /ceilingGain\.gain\.value = 1/);
  assert.match(normalizerSource, /limiter\.ceilingGain\.gain\.value = 1/);
  assert.doesNotMatch(limiterSource, /ceilingGain\.gain\.value = Analyser\.dbToLinear/);
  assert.doesNotMatch(normalizerSource, /limiter\.ceilingGain\.gain\.value = Analyser\.dbToLinear/);
});

test("native compressor stays neutral to avoid hidden browser makeup gain", () => {
  const normalizerSource = fs.readFileSync(path.join(root, "audio", "normalizer.js"), "utf8");

  assert.match(normalizerSource, /compressor\.threshold\.value = 0;/);
  assert.match(normalizerSource, /compressor\.knee\.value = 0;/);
  assert.match(normalizerSource, /compressor\.ratio\.value = 1;/);
  assert.doesNotMatch(normalizerSource, /compressor\.threshold\.value = profile\.compressorThresholdDb/);
  assert.doesNotMatch(normalizerSource, /compressor\.ratio\.value = profile\.compressorRatio/);
});

test("native compressor timing stays inside browser nominal range", () => {
  const normalizerSource = fs.readFileSync(path.join(root, "audio", "normalizer.js"), "utf8");

  assert.match(normalizerSource, /function clampAudioParamSeconds\(milliseconds, minSeconds, maxSeconds, fallbackSeconds\)/);
  assert.match(normalizerSource, /Number\.isFinite\(seconds\) \? seconds : fallbackSeconds/);
  assert.match(normalizerSource, /compressor\.attack\.value = clampAudioParamSeconds\(profile\.attackMs, 0\.003, 0\.99, 0\.003\);/);
  assert.match(normalizerSource, /compressor\.release\.value = clampAudioParamSeconds\(profile\.releaseMs, 0\.05, 0\.99, 0\.25\);/);
  assert.doesNotMatch(normalizerSource, /compressor\.release\.value = Math\.min\(1,/);
  assert.doesNotMatch(normalizerSource, /compressor\.release\.value = Math\.max\(0\.05, profile\.releaseMs \/ 1000\);/);
});

test("platform profiles recommend streamer-first defaults", () => {
  const WLG = loadCore();
  const settings = WLG.Settings.normalizeSettings({});

  assert.equal(WLG.Settings.SETTINGS_SCHEMA_VERSION, 9);
  ["youtube.com", "youtu.be", "twitch.tv", "tiktok.com", "kick.com", "open.spotify.com", "deezer.com"].forEach((domain) => {
    assert.equal(WLG.Settings.getRecommendedProfileForDomain(domain), "stream", `${domain} should recommend stream`);
    assert.equal(WLG.Settings.getEffectiveProfileIdForDomain(settings, domain), "stream", `${domain} should use stream`);
  });
  assert.equal(
    WLG.Settings.getEffectiveProfileIdForDomain({ ...settings, domainProfiles: { "twitch.tv": "night" } }, "twitch.tv"),
    "night"
  );
  assert.equal(
    WLG.Settings.getEffectiveProfileIdForDomain({ ...settings, domainProfiles: { "youtube.com": "night" } }, "music.youtube.com"),
    "night"
  );
});

test("platform routing starts with media html and upgrades only after silent evidence", () => {
  const WLG = loadCore();

  assert.equal(WLG.Settings.getPreferredSourceTypeForDomain("tiktok.com"), "media-html");
  assert.equal(WLG.Settings.getPreferredSourceTypeForDomain("www.tiktok.com"), "media-html");
  assert.equal(WLG.Settings.getPreferredSourceTypeForDomain("youtube.com"), "media-html");
  assert.equal(WLG.Settings.getPreferredSourceTypeForDomain("youtu.be"), "media-html");
  assert.equal(WLG.Settings.getPreferredSourceTypeForDomain("open.spotify.com"), "media-html");
  assert.equal(WLG.Settings.getPreferredSourceTypeForDomain("deezer.com"), "media-html");
  assert.equal(WLG.Settings.getPreferredSourceTypeForDomain("twitch.tv"), "media-html");
  assert.equal(WLG.Settings.getPreferredSourceTypeForDomain("example.com"), "media-html");
});

test("local test domains keep the stream equalization contract", () => {
  const WLG = loadCore();
  const settings = WLG.Settings.normalizeSettings({});
  const nightSettings = WLG.Settings.normalizeSettings({
    activeProfile: "night",
    targetRmsMode: "profile",
    targetRmsDb: WLG.Settings.PROFILES.night.targetRmsDb
  });

  ["127.0.0.1", "localhost"].forEach((domain) => {
    const runtime = WLG.Settings.getSettingsForDomain(settings, domain);
    const explicitRuntime = WLG.Settings.getSettingsForDomain(nightSettings, domain);

    assert.equal(WLG.Settings.getRecommendedProfileForDomain(domain), "", `${domain} should not be treated as a platform`);
    assert.equal(runtime.activeProfile, "stream", `${domain} should use stream`);
    assert.equal(runtime.targetRmsMode, "profile", `${domain} should keep profile target mode`);
    assert.equal(runtime.targetRmsDb, WLG.Settings.PROFILES.stream.targetRmsDb, `${domain} should keep stream target`);
    assert.equal(explicitRuntime.activeProfile, "night", `${domain} should respect explicit profile changes`);
    assert.equal(explicitRuntime.targetRmsDb, WLG.Settings.PROFILES.night.targetRmsDb, `${domain} should respect explicit profile target`);
  });
});

test("profile mode makes domain profiles change target loudness", () => {
  const WLG = loadCore();
  const settings = WLG.Settings.normalizeSettings({
    activeProfile: "stream",
    targetRmsMode: "profile",
    targetRmsDb: -21,
    domainProfiles: {
      "twitch.tv": "night"
    }
  });

  const runtime = WLG.Settings.getSettingsForDomain(settings, "twitch.tv");

  assert.equal(runtime.activeProfile, "night");
  assert.equal(runtime.targetRmsMode, "profile");
  assert.equal(runtime.targetRmsDb, WLG.Settings.PROFILES.night.targetRmsDb);
});

test("custom target mode keeps the user target loudness across profiles", () => {
  const WLG = loadCore();
  const settings = WLG.Settings.normalizeSettings({
    activeProfile: "stream",
    targetRmsMode: "custom",
    targetRmsDb: -15.5,
    domainProfiles: {
      "twitch.tv": "night"
    }
  });

  const runtime = WLG.Settings.getSettingsForDomain(settings, "twitch.tv");

  assert.equal(runtime.activeProfile, "night");
  assert.equal(runtime.targetRmsMode, "custom");
  assert.equal(runtime.targetRmsDb, -15.5);
});

test("runtime profile uses profile target in profile mode and slider target in custom mode", () => {
  const WLG = loadCore();
  const profileMode = WLG.Settings.getRuntimeProfile(WLG.Settings.normalizeSettings({
    activeProfile: "night",
    targetRmsMode: "profile",
    targetRmsDb: -21
  }));
  const customMode = WLG.Settings.getRuntimeProfile(WLG.Settings.normalizeSettings({
    activeProfile: "night",
    targetRmsMode: "custom",
    targetRmsDb: -18.5
  }));

  assert.equal(profileMode.targetRmsDb, WLG.Settings.PROFILES.night.targetRmsDb);
  assert.equal(customMode.targetRmsDb, -18.5);
});

test("saving a target loudness without a profile change switches to custom target mode", async () => {
  const WLG = loadCore();

  await WLG.Settings.saveSettings({
    activeProfile: "night",
    targetRmsMode: "profile"
  });
  const updated = await WLG.Settings.saveSettings({
    targetRmsDb: -15
  });

  assert.equal(updated.activeProfile, "night");
  assert.equal(updated.targetRmsMode, "custom");
  assert.equal(updated.targetRmsDb, -15);
});

test("settings clamps target loudness at the shared safe bounds", () => {
  const WLG = loadCore();

  assert.equal(WLG.Settings.normalizeSettings({ targetRmsDb: -80 }).targetRmsDb, -48);
  assert.equal(WLG.Settings.normalizeSettings({ targetRmsDb: -5 }).targetRmsDb, -15);
  assert.equal(WLG.Settings.normalizeSettings({ targetRmsDb: -21.5 }).targetRmsDb, -21.5);
});

test("settings keep target loudness recoverable for the weak test sound", () => {
  const WLG = loadCore();
  const settings = WLG.Settings.normalizeSettings({
    targetRmsDb: -10,
    maxBoostDb: 48
  });
  const profile = WLG.Settings.getRuntimeProfile(settings);
  const weakTargetGainDb = WLG.Normalizer.calculateTargetGainDb({
    currentRmsDb: -63,
    targetRmsDb: profile.targetRmsDb,
    maxBoostDb: profile.maxBoostDb,
    maxReductionDb: profile.maxReductionDb
  });

  assert.equal(profile.targetRmsDb, -15);
  assert.equal(weakTargetGainDb, 48);
  assert.ok(-63 + weakTargetGainDb >= profile.targetRmsDb, "weak sound must be able to reach the selected target");
});

test("content script guards concurrent media processing and resets detached markers", () => {
  const contentSource = fs.readFileSync(path.join(root, "content.js"), "utf8");

  assert.match(contentSource, /const processingMedia = new Set\(\);/);
  assert.match(contentSource, /if \(processingMedia\.has\(media\)\) return;/);
  assert.match(contentSource, /if \(media\.dataset\[PROCESSED_ATTR\] === "true" && !normalizers\.has\(media\)\)/);
  assert.match(contentSource, /delete media\.dataset\[PROCESSED_ATTR\];/);
  assert.match(contentSource, /processingMedia\.add\(media\);/);
  assert.match(contentSource, /finally\s*{[\s\S]*processingMedia\.delete\(media\);[\s\S]*}/);
  assert.match(contentSource, /delete media\.dataset\[PROCESSED_ATTR\];/);
  assert.match(contentSource, /delete media\.dataset\[ERROR_ATTR\];/);
});

test("tab capture startup cleans up failed offscreen streams", () => {
  const offscreenSource = fs.readFileSync(path.join(root, "offscreen", "offscreen.js"), "utf8");

  assert.match(offscreenSource, /let stream = null;/);
  assert.match(offscreenSource, /let normalizer = null;/);
  assert.match(offscreenSource, /if \(captures\.has\(tabId\)\) {[\s\S]*stopCapture\(tabId\);[\s\S]*}/);
  assert.match(offscreenSource, /if \(normalizer\) normalizer\.stop\(\);/);
  assert.match(offscreenSource, /if \(stream\) stream\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\);/);
  assert.doesNotMatch(offscreenSource, /let audio = null;/);
  assert.doesNotMatch(offscreenSource, /audio\.srcObject = null;/);
});

test("silent tab capture requests one automatic restart", () => {
  const offscreenSource = fs.readFileSync(path.join(root, "offscreen", "offscreen.js"), "utf8");
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");
  const popupSource = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");
  const optionsSource = fs.readFileSync(path.join(root, "options", "options.js"), "utf8");

  assert.match(offscreenSource, /const MAX_CAPTURE_RESTARTS = 1;/);
  assert.match(offscreenSource, /function requestCaptureRestart\(tabId, status\)/);
  assert.match(offscreenSource, /status\.captureSignalState !== "no-signal"/);
  assert.match(offscreenSource, /capture\.restartRequested/);
  assert.match(offscreenSource, /capture\.restartDeferred/);
  assert.match(offscreenSource, /type: "WLG_RESTART_TAB_CAPTURE"/);
  assert.match(offscreenSource, /response && response\.deferred/);
  assert.match(backgroundSource, /function getTabById\(tabId\)/);
  assert.match(backgroundSource, /function updateCaptureStatus\(tabId, partial\)/);
  assert.match(backgroundSource, /async function startTabCaptureForTab\(tab, options\)/);
  assert.match(backgroundSource, /restartCount/);
  assert.match(backgroundSource, /async function restartTabCapture\(tabId, restartCount\)/);
  assert.match(backgroundSource, /WLG_RESTART_TAB_CAPTURE/);
  assert.match(backgroundSource, /startTabCaptureForTab\(tab, \{ replaceMedia: true, restartCount:/);
  assert.match(popupSource, /captureRestartCount:/);
  assert.match(optionsSource, /captureRestartCount:/);
});

test("silent tab capture waits for an audible tab before consuming restart", () => {
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");
  const offscreenSource = fs.readFileSync(path.join(root, "offscreen", "offscreen.js"), "utf8");
  const popupSource = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");
  const optionsSource = fs.readFileSync(path.join(root, "options", "options.js"), "utf8");

  assert.match(backgroundSource, /function shouldDeferSilentCaptureRestart\(tab\)/);
  assert.match(backgroundSource, /tab\.audible !== true/);
  assert.match(backgroundSource, /function normalizeIncomingCaptureStatus\(tabId, status\)/);
  assert.match(backgroundSource, /captureSignalState: "waiting-for-audio"/);
  assert.match(backgroundSource, /captureRestartDeferred: true/);
  assert.match(backgroundSource, /incoming\.captureSignalState === "no-signal" && incoming\.tabAudible !== true/);
  assert.match(backgroundSource, /const updatedStatus = updateCaptureStatus\([\s\S]*message\.tabId,[\s\S]*normalizeIncomingCaptureStatus\(message\.tabId, message\.status\)[\s\S]*\);/);
  assert.doesNotMatch(backgroundSource, /captureStatuses\.set\(message\.tabId, message\.status\)/);
  assert.match(backgroundSource, /return \{ ok: true, deferred: true, status \};/);
  assert.match(backgroundSource, /function maybeRestartWaitingCapture\(tabId\)/);
  assert.match(backgroundSource, /status\.captureSignalState !== "waiting-for-audio"/);
  assert.match(backgroundSource, /chrome\.tabs\.onActivated\.addListener/);
  assert.match(backgroundSource, /"audible" in changeInfo/);
  assert.match(backgroundSource, /restartTabCapture\(tabId, nextRestartCount\)/);
  assert.match(offscreenSource, /captureSignalState: "waiting-for-audio"/);
  assert.match(offscreenSource, /currentCapture\.restartDeferred = true/);
  assert.match(popupSource, /captureRestartDeferred:/);
  assert.match(popupSource, /tabAudible:/);
  assert.match(popupSource, /tabActive:/);
  assert.match(optionsSource, /captureRestartDeferred:/);
  assert.match(optionsSource, /tabAudible:/);
  assert.match(optionsSource, /tabActive:/);
});

test("audible no-signal tab capture falls back to media HTML after one restart", () => {
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");

  assert.match(backgroundSource, /function shouldFallbackSilentCaptureToMedia\(status\)/);
  assert.match(backgroundSource, /status\.sourceType === "tab-capture"/);
  assert.match(backgroundSource, /status\.captureSignalState === "no-signal"/);
  assert.match(backgroundSource, /status\.tabAudible === true/);
  assert.match(backgroundSource, /Number\(status\.captureRestartCount\) >= 1/);
  assert.match(backgroundSource, /Number\(status\.rmsDb\) <= -100/);
  assert.match(backgroundSource, /function fallbackSilentCaptureToMedia\(tabId, status\)/);
  assert.match(backgroundSource, /WLG_STOP_TAB_CAPTURE/);
  assert.match(backgroundSource, /captureStatuses\.delete\(tabId\);[\s\S]*injectAndSet\(tab, true\)/);
  assert.match(backgroundSource, /shouldFallbackSilentCaptureToMedia\(updatedStatus\)/);
});

test("audible silent media HTML can upgrade generically to tab capture without site patches", () => {
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");
  const settingsSource = fs.readFileSync(path.join(root, "storage", "settings.js"), "utf8");

  assert.match(backgroundSource, /SILENT_MEDIA_UPGRADE_MIN_REPORTS/);
  assert.match(backgroundSource, /silentMediaUpgradeCandidates/);
  assert.match(backgroundSource, /async function hasDesktopBridgeForSilentMediaUpgrade\(\)/);
  assert.match(backgroundSource, /const bridgeConnected = await hasDesktopBridgeForSilentMediaUpgrade\(\)/);
  assert.match(backgroundSource, /function allowsStandaloneSilentMediaUpgrade\(status\)/);
  assert.match(backgroundSource, /if \(!bridgeConnected && !allowsStandaloneSilentMediaUpgrade\(status\)\) \{/);
  assert.match(backgroundSource, /function shouldUpgradeSilentMediaToTabCapture\(tab, status\)/);
  assert.match(backgroundSource, /status\.sourceType !== "media-html"/);
  assert.match(backgroundSource, /tab\.audible === true/);
  assert.match(backgroundSource, /function getMediaHtmlFallbackReasonForUpgrade\(source\)/);
  assert.match(backgroundSource, /mediaHtmlFallbackReasonsForUpgrade\.has\(fallbackReason\)/);
  assert.match(backgroundSource, /if \(getMediaHtmlFallbackReasonForUpgrade\(source\)\) return true/);
  assert.match(backgroundSource, /source\.controlSurface !== "BrowserGain" && !canUpgradeFallbackReason/);
  assert.match(backgroundSource, /let shouldDisableMediaAfterCaptureStarts = false/);
  assert.match(backgroundSource, /shouldDisableMediaAfterCaptureStarts = true/);
  assert.match(backgroundSource, /if \(shouldDisableMediaAfterCaptureStarts\) \{[\s\S]*type: "WLG_SET_ENABLED",[\s\S]*enabled: false[\s\S]*\}/);
  assert.doesNotMatch(backgroundSource, /await sendMessage\(tab\.id,\s*\{ type: "WLG_SET_ENABLED", enabled: false \}\);[\s\S]*const savedSettings = await getSettingsWithGlobalTarget\(\);/);
  assert.match(backgroundSource, /recordSilentMediaUpgradeCandidate\(tab, status\)/);
  assert.match(backgroundSource, /startTabCaptureForTab\(tab, \{ replaceMedia: true, reason: "media-html-silent" \}\)/);
  assert.doesNotMatch(backgroundSource, /spotify/i);
  assert.doesNotMatch(settingsSource, /spotify\.com"[^}]*sourceType: "tab-capture"/);
});

test("silent media HTML upgrade cooldown prevents tab capture fallback loops", () => {
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");

  assert.match(backgroundSource, /SILENT_MEDIA_UPGRADE_COOLDOWN_MS/);
  assert.match(backgroundSource, /silentMediaUpgradeCooldowns/);
  assert.match(backgroundSource, /function markSilentMediaUpgradeCooldown\(tabId, reason\)/);
  assert.match(backgroundSource, /isSilentMediaUpgradeCoolingDown\(tab\.id\)/);
  assert.match(backgroundSource, /markSilentMediaUpgradeCooldown\(tabId, "tab-capture-no-signal"\)/);
});

test("background refresh stops active capture when a domain becomes excluded", () => {
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");

  assert.match(backgroundSource, /Settings\.isDomainExcluded\(site, savedSettings\)/);
  assert.match(backgroundSource, /WLG_STOP_TAB_CAPTURE/);
  assert.match(backgroundSource, /captureStatuses\.delete\(tab\.id\)/);
  assert.match(backgroundSource, /excluded:\s*true/);
  assert.match(backgroundSource, /updatedCaptureStatus \|\| contentResponse/);
});

test("background uses offscreen status responses for capture updates", () => {
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");

  assert.match(backgroundSource, /const captureResponse = await sendRuntimeMessage\(\{ target: "offscreen", type: "WLG_SET_CAPTURE_PANIC"/);
  assert.match(backgroundSource, /updatedCaptureStatus = captureResponse && captureResponse\.status \? captureResponse\.status : null;/);
  assert.match(backgroundSource, /const captureResponse = await sendRuntimeMessage\(\{ target: "offscreen", type: "WLG_UPDATE_CAPTURE_SETTINGS"/);
  assert.match(backgroundSource, /return mergeStatus\(tab, updatedCaptureStatus \|\| contentResponse/);
});

test("options distinguishes save failure from refresh failure", () => {
  const optionsSource = fs.readFileSync(path.join(root, "options", "options.js"), "utf8");
  const enMessages = readJson("_locales/en/messages.json");
  const frMessages = readJson("_locales/fr/messages.json");

  assert.match(optionsSource, /optionsApplyErrorStatus/);
  assert.match(optionsSource, /optionsSaveErrorStatus/);
  assert.match(optionsSource, /setSaveState\(i18n\("optionsSaveErrorStatus", "sauvegarde impossible"\)\)/);
  assert.equal(enMessages.optionsSaveErrorStatus.message, "save failed");
  assert.equal(frMessages.optionsSaveErrorStatus.message, "sauvegarde impossible");
});

test("public test page uses real media blobs instead of MediaStreamDestination", () => {
  const html = fs.readFileSync(path.join(root, "test-page.html"), "utf8");
  assert.match(html, /createSegmentedSineWaveBlob/);
  assert.match(html, /new Blob\(\[buffer\], \{ type: "audio\/wav" \}\)/);
  assert.doesNotMatch(html, /createMediaStreamDestination/);
});

test("public test page uses the streamer dashboard layout", () => {
  const html = fs.readFileSync(path.join(root, "test-page.html"), "utf8");

  assert.match(html, /class="test-header"/);
  assert.match(html, /class="test-brand"/);
  assert.match(html, /class="test-logo"/);
  assert.match(html, /src="assets\/icons\/icon128\.png"/);
  assert.match(html, /class="test-status"/);
  assert.match(html, /class="test-shell"/);
  assert.match(html, /class="test-overview"/);
  assert.match(html, /class="overview-card overview-card-primary"/);
  assert.match(html, /class="test-layout"/);
  assert.match(html, /class="primary-stack"/);
  assert.match(html, /class="sidebar-stack"/);
  assert.match(html, /class="panel audio-control-panel"/);
  assert.match(html, /class="panel demo-box"/);
  assert.match(html, /class="panel demo-box live-results"/);
  assert.match(html, /class="panel demo-box streamer-check trust-panel"/);
  assert.match(html, /linear-gradient\(180deg, #10202c 0, #153243 92px, #eef4f6 92px/);
  assert.doesNotMatch(html, /linear-gradient\(135deg/);
  assert.doesNotMatch(html, /test-card/);
  assert.doesNotMatch(html, /test-sidebar/);
});

test("browser smoke bakes test loudness into WAV data instead of element volume", () => {
  const smokeHtml = fs.readFileSync(path.join(root, "tests", "technical-smoke.html"), "utf8");

  assert.match(smokeHtml, /createSineWaveBlob\(440, amplitude, durationSeconds \|\| 8\)/);
  assert.match(smokeHtml, /audio\.volume = 1;/);
  assert.doesNotMatch(smokeHtml, /audio\.volume = amplitude;/);
  assert.match(smokeHtml, /const VERY_LOUD_AMPLITUDE = 0\.8912509381337456;/);
  assert.match(smokeHtml, /expectedRmsDb: -4/);
});

test("browser smoke ignores stale status samples when checking transition overshoot", () => {
  const smokeHtml = fs.readFileSync(path.join(root, "tests", "technical-smoke.html"), "utf8");

  assert.match(smokeHtml, /const startedAt = Date\.now\(\);/);
  assert.match(smokeHtml, /const collectAfter = startedAt \+ warmupMs;/);
  assert.match(smokeHtml, /status\.updatedAt >= collectAfter/);
  assert.match(smokeHtml, /Date\.now\(\) >= collectAfter/);
  assert.match(smokeHtml, /EARLY_TRANSIENT_AVERAGE_TOLERANCE_DB = 0\.95/);
  assert.match(smokeHtml, /Math\.abs\(earlyStats\.averageOutputRmsDb - levelStatus\.targetRmsDb\) > EARLY_TRANSIENT_AVERAGE_TOLERANCE_DB/);
  assert.match(smokeHtml, /earlyStats\.minOutputRmsDb < levelStatus\.targetRmsDb - 1\.2/);
  assert.match(smokeHtml, /earlyStats\.maxOutputRmsDb > levelStatus\.targetRmsDb \+ 0\.8/);
});

test("manual local server exists and README documents the recommended URL flow", () => {
  const serverSource = fs.readFileSync(path.join(root, "tests", "start-local-server.js"), "utf8");
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");

  assert.match(readme, /node tests\/start-local-server\.js/);
  assert.match(readme, /http:\/\/127\.0\.0\.1/);
  assert.match(serverSource, /Ouvre/);
  assert.match(serverSource, /Garde ce terminal ouvert/);
  assert.doesNotMatch(serverSource, /Then:/);
});

test("public test page alternation gives the normalizer enough time to settle", () => {
  const html = fs.readFileSync(path.join(root, "test-page.html"), "utf8");
  const intervalMatch = html.match(/const PULSE_INTERVAL_MS = (\d+);/);
  const durationMatch = html.match(/const TEST_TONE_SECONDS = (\d+);/);
  const demoStepMatch = html.match(/const DEMO_STEP_MS = (\d+);/);

  assert.ok(intervalMatch, "test page should expose PULSE_INTERVAL_MS");
  assert.ok(durationMatch, "test page should expose TEST_TONE_SECONDS");
  assert.ok(demoStepMatch, "test page should expose DEMO_STEP_MS");
  assert.ok(Number(intervalMatch[1]) >= 6000, "alternation should keep each level for at least 6 seconds");
  assert.ok(Number(durationMatch[1]) >= 6, "generated WAV should be long enough for each level");
  assert.ok(Number(demoStepMatch[1]) >= 8000, "before/after demo should leave enough time for perceived equalization");
});

test("public test page avoids raw loop seams during 8 second alternation", () => {
  const html = fs.readFileSync(path.join(root, "test-page.html"), "utf8");
  const intervalMatch = html.match(/const PULSE_INTERVAL_MS = (\d+);/);
  const durationMatch = html.match(/const TEST_TONE_SECONDS = (\d+);/);

  assert.ok(intervalMatch, "test page should expose PULSE_INTERVAL_MS");
  assert.ok(durationMatch, "test page should expose TEST_TONE_SECONDS");
  assert.ok(
    Number(durationMatch[1]) * 1000 > Number(intervalMatch[1]),
    "generated tone should be longer than each alternation step to avoid a loop seam"
  );
  assert.match(html, /const TONE_EDGE_FADE_MS = \d+;/);
  assert.match(html, /edgeFadeSamples/);
  assert.match(html, /edgeFade/);
});

test("public test page alternation cycles through quiet loud and very loud", () => {
  const html = fs.readFileSync(path.join(root, "test-page.html"), "utf8");
  const pulseHandler = html.match(/document\.getElementById\("pulseButton"\)[\s\S]*?document\.getElementById\("stopButton"\)/);

  assert.ok(pulseHandler, "pulse button handler should exist");
  assert.match(pulseHandler[0], /alternationSequence/);
  assert.match(pulseHandler[0], /QUIET_AMPLITUDE/);
  assert.match(pulseHandler[0], /LOUD_AMPLITUDE/);
  assert.match(pulseHandler[0], /VERY_LOUD_AMPLITUDE/);
  assert.match(pulseHandler[0], /label: "son .*fort"/);
  assert.match(pulseHandler[0], /\$\{step\.label\} - attendre 8 s/);
});

test("public test page alternation displays a decreasing countdown", () => {
  const html = fs.readFileSync(path.join(root, "test-page.html"), "utf8");
  const pulseHandler = html.match(/document\.getElementById\("pulseButton"\)[\s\S]*?document\.getElementById\("stopButton"\)/);

  assert.ok(pulseHandler, "pulse button handler should exist");
  assert.match(html, /let countdownTimer;/);
  assert.match(pulseHandler[0], /function updateAlternationCountdown/);
  assert.match(pulseHandler[0], /Math\.ceil\(remainingMs \/ 1000\)/);
  assert.match(pulseHandler[0], /remainingSeconds/);
  assert.match(pulseHandler[0], /clearInterval\(countdownTimer\)/);
  assert.match(pulseHandler[0], /setInterval\(updateAlternationCountdown, 250\)/);
});

test("public test page includes a very loud stress tone", () => {
  const html = fs.readFileSync(path.join(root, "test-page.html"), "utf8");

  assert.match(html, /id="veryLoudButton"/);
  assert.match(html, /Son .*fort/);
  assert.match(html, /const VERY_LOUD_AMPLITUDE = 0\.8912509381337456;/);
});

test("public test page uses requested single-button loudness controls", () => {
  const html = fs.readFileSync(path.join(root, "test-page.html"), "utf8");

  assert.match(html, /const QUIET_AMPLITUDE = 0\.001;/);
  assert.match(html, /const LOUD_AMPLITUDE = 0\.01001186529700907;/);
  assert.match(html, /const VERY_LOUD_AMPLITUDE = 0\.8912509381337456;/);
  assert.doesNotMatch(html, /MEDIUM_AMPLITUDE/);
  assert.match(html, />Démarrer</);
  assert.match(html, />Son faible</);
  assert.match(html, />Son fort</);
  assert.match(html, />Son .*fort</);
  assert.match(html, />Alternance</);
  assert.match(html, /playLevel\(audio, QUIET_AMPLITUDE, "son faible"\)/);
  assert.match(html, /playLevel\(audio, LOUD_AMPLITUDE, "son fort"\)/);
  assert.match(html, /playLevel\(audio, VERY_LOUD_AMPLITUDE, "son .*fort/);
  assert.doesNotMatch(html, /button-group-title/);
  assert.doesNotMatch(html, />Faible brut</);
  assert.doesNotMatch(html, />Fort brut</);
  assert.doesNotMatch(html, />Faible traité</);
  assert.doesNotMatch(html, />Fort traité</);
});

test("public test page tones match requested dB targets", () => {
  const html = fs.readFileSync(path.join(root, "test-page.html"), "utf8");

  function rmsDbFor(name) {
    const match = html.match(new RegExp("const " + name + "_AMPLITUDE = ([0-9.]+);"));
    assert.ok(match, name + "_AMPLITUDE should exist");
    return 20 * Math.log10(Number(match[1]) / Math.SQRT2);
  }

  const quietRmsDb = rmsDbFor("QUIET");
  const loudRmsDb = rmsDbFor("LOUD");
  const veryLoudRmsDb = rmsDbFor("VERY_LOUD");
  assert.ok(Math.abs(quietRmsDb - -63) <= 0.1, "quiet should be -63 dB RMS");
  assert.ok(Math.abs(veryLoudRmsDb - -4) <= 0.1, "very loud should keep -1 dBFS headroom");
  assert.ok(Math.abs(loudRmsDb - -43) <= 0.1, "loud should be -43 dB RMS");
  assert.ok(Math.abs(loudRmsDb - quietRmsDb - 20) <= 0.1, "loud should stay 20 dB above quiet");
  assert.ok(Math.abs(veryLoudRmsDb - loudRmsDb - 39) <= 0.1, "very loud should stay clearly above loud with peak headroom");
});

test("public test page locks the approved test sound levels", () => {
  const html = fs.readFileSync(path.join(root, "test-page.html"), "utf8");

  const approvedLevels = {
    QUIET: { amplitude: 0.001, rmsDb: -63 },
    LOUD: { amplitude: 0.01001186529700907, rmsDb: -43 },
    VERY_LOUD: { amplitude: 0.8912509381337456, rmsDb: -4.010299956639812 }
  };

  Object.entries(approvedLevels).forEach(([name, expected]) => {
    const match = html.match(new RegExp("const " + name + "_AMPLITUDE = ([0-9.]+);"));
    assert.ok(match, `${name}_AMPLITUDE should exist`);
    const amplitude = Number(match[1]);
    const rmsDb = 20 * Math.log10(amplitude / Math.SQRT2);

    assert.equal(amplitude, expected.amplitude);
    assert.ok(Math.abs(rmsDb - expected.rmsDb) <= 0.1, `${name} RMS should stay locked`);
  });
});
test("public test page reuses media elements while seeking inside one continuous test tone", () => {
  const html = fs.readFileSync(path.join(root, "test-page.html"), "utf8");
  const playLevelBody = html.match(/async function playLevel\(media, amplitude, label, keepPulse\) \{([\s\S]*?)\n\n      async function playDemoSequence/);

  assert.ok(playLevelBody, "playLevel should exist");
  assert.match(html, /function ensureContinuousMediaSource\(media\)/);
  assert.match(html, /async function seekMediaToLevel\(media, amplitude\)/);
  assert.match(html, /function rampMediaVolume\(media, targetVolume/);
  assert.match(playLevelBody[1], /ensureContinuousMediaSource\(media\)/);
  assert.match(playLevelBody[1], /await seekMediaToLevel\(media, amplitude\)/);
  assert.match(playLevelBody[1], /await rampMediaVolume\(media, 1\)/);
  assert.doesNotMatch(playLevelBody[1], /media = document\.createElement/);
  assert.doesNotMatch(playLevelBody[1], /stopMedia\(media\)/);
});

test("public test page de-clicks manual level changes with a short volume ramp", () => {
  const html = fs.readFileSync(path.join(root, "test-page.html"), "utf8");

  assert.match(html, /const VOLUME_RAMP_MS = 45;/);
  assert.match(html, /const MAX_VOLUME_RAMP_MS = \d+;/);
  assert.match(html, /const VOLUME_RAMP_DB_FOR_MAX_MS = \d+;/);
  assert.match(html, /const VOLUME_RAMP_INTERVAL_MS = \d+;/);
  assert.match(html, /const volumeRampTimers = new WeakMap\(\);/);
  assert.match(html, /function rampMediaVolume\(media, targetVolume/);
  assert.match(html, /rootSetTimeout\(step, VOLUME_RAMP_INTERVAL_MS\)|setTimeout\(step, VOLUME_RAMP_INTERVAL_MS\)/);
  assert.doesNotMatch(html, /requestAnimationFrame\(step\)/);
  assert.match(html, /Math\.cos\(Math\.PI \* progress\)/);
  assert.doesNotMatch(html, /media\.volume = amplitude;/);
});

test("public test page uses a longer ramp for large loudness jumps", () => {
  const html = fs.readFileSync(path.join(root, "test-page.html"), "utf8");

  assert.match(html, /function calculateVolumeRampDuration\(startVolume, targetVolume\)/);
  assert.match(html, /20 \* Math\.log10\(safeTarget \/ safeStart\)/);
  assert.match(html, /MAX_VOLUME_RAMP_MS - VOLUME_RAMP_MS/);
  assert.match(html, /durationMs = calculateVolumeRampDuration\(startVolume, targetVolume\)/);
});

test("public test page resolves canceled volume ramps before starting another", () => {
  const html = fs.readFileSync(path.join(root, "test-page.html"), "utf8");

  assert.match(html, /function cancelVolumeRamp\(media\)/);
  assert.match(html, /previousRamp\.resolve\(\);/);
  assert.match(html, /volumeRampTimers\.set\(media, rampState\);/);
  assert.match(html, /volumeRampTimers\.get\(media\) === rampState/);
});

test("public test page prepares media volume before playback to avoid raw clicks", () => {
  const html = fs.readFileSync(path.join(root, "test-page.html"), "utf8");
  const playLevelBody = html.match(/async function playLevel\(media, amplitude, label, keepPulse\) \{([\s\S]*?)\n\n      async function playDemoSequence/);

  assert.ok(playLevelBody, "playLevel should exist");
  assert.match(html, /function prepareMediaVolumeBeforePlay\(media\)/);
  assert.match(playLevelBody[1], /prepareMediaVolumeBeforePlay\(media\);/);
  assert.ok(
    playLevelBody[1].indexOf("prepareMediaVolumeBeforePlay(media);") <
      playLevelBody[1].indexOf("await media.play();"),
    "volume should be prepared before playback starts"
  );
});

test("public test page fades out media before pausing to avoid stop clicks", () => {
  const html = fs.readFileSync(path.join(root, "test-page.html"), "utf8");
  const stopMediaBody = html.match(/function stopMedia\(media\) \{([\s\S]*?)\n      \}/);

  assert.ok(stopMediaBody, "stopMedia should exist");
  assert.match(html, /function fadeOutAndPause\(media\)/);
  assert.match(stopMediaBody[1], /fadeOutAndPause\(media\);/);
  assert.doesNotMatch(stopMediaBody[1], /media\.pause\(\);/);
});

test("public test page bakes loudness into one continuous WAV to avoid source-switch crackle", () => {
  const html = fs.readFileSync(path.join(root, "test-page.html"), "utf8");
  const playLevelBody = html.match(/async function playLevel\(media, amplitude, label, keepPulse\) \{([\s\S]*?)\n\n      async function playDemoSequence/);

  assert.ok(playLevelBody, "playLevel should exist");
  assert.match(html, /let continuousToneUrl = null;/);
  assert.match(html, /const TEST_TONE_SEGMENTS = \[/);
  assert.match(html, /function getContinuousToneUrl\(\)/);
  assert.match(html, /function createSegmentedSineWaveBlob\(frequency, segments\)/);
  assert.match(html, /createSegmentedSineWaveBlob\(440, TEST_TONE_SEGMENTS\)/);
  assert.doesNotMatch(html, /createSineWaveBlob\(440, 1, TEST_TONE_SECONDS\)/);
  assert.doesNotMatch(html, /const toneUrls = new Map\(\);/);
  assert.match(playLevelBody[1], /await seekMediaToLevel\(media, amplitude\);/);
  assert.match(playLevelBody[1], /await rampMediaVolume\(media, 1\);/);
  assert.doesNotMatch(playLevelBody[1], /await rampMediaVolume\(media, amplitude\);/);
});

test("public test page fades before seeking to another baked segment", () => {
  const html = fs.readFileSync(path.join(root, "test-page.html"), "utf8");
  const playLevelBody = html.match(/async function playLevel\(media, amplitude, label, keepPulse\) \{([\s\S]*?)\n\n      async function playDemoSequence/);

  assert.ok(playLevelBody, "playLevel should exist");
  const fadeIndex = playLevelBody[1].indexOf("await rampMediaVolume(media, 0);");
  const sourceIndex = playLevelBody[1].indexOf("await seekMediaToLevel(media, amplitude);");

  assert.ok(fadeIndex >= 0, "playLevel should fade out before seeking");
  assert.ok(sourceIndex >= 0, "playLevel should seek to the requested level");
  assert.ok(fadeIndex < sourceIndex, "fade out should happen before seeking");
});

test("public test page seeks to prepared segment offsets without changing src per click", () => {
  const html = fs.readFileSync(path.join(root, "test-page.html"), "utf8");
  const seekBody = html.match(/async function seekMediaToLevel\(media, amplitude\) \{([\s\S]*?)\n      \}/);
  const playLevelBody = html.match(/async function playLevel\(media, amplitude, label, keepPulse\) \{([\s\S]*?)\n\n      async function playDemoSequence/);

  assert.ok(seekBody, "seekMediaToLevel should exist");
  assert.ok(playLevelBody, "playLevel should exist");
  assert.match(html, /function waitForMediaReady\(media\)/);
  assert.match(html, /function seekMediaToTime\(media, targetSeconds\)/);
  assert.match(html, /const POST_SEEK_SETTLE_MS = 40;/);
  assert.match(html, /media\.addEventListener\("seeked", handleSeeked, \{ once: true \}\);[\s\S]*media\.currentTime = targetSeconds;/);
  assert.match(seekBody[1], /media\.pause\(\);/);
  assert.match(seekBody[1], /await seekMediaToTime\(media, segment\.startSeconds\);/);
  assert.match(seekBody[1], /await wait\(POST_SEEK_SETTLE_MS\);/);
  assert.doesNotMatch(seekBody[1], /media\.src =/);
  assert.doesNotMatch(seekBody[1], /media\.load\(\);/);
  assert.match(playLevelBody[1], /await seekMediaToLevel\(media, amplitude\);/);
  assert.ok(
    playLevelBody[1].indexOf("await seekMediaToLevel(media, amplitude);") <
      playLevelBody[1].indexOf("await media.play();"),
    "segment seek should finish before playback"
  );
});

test("public test page cancels stale level changes during rapid clicks", () => {
  const html = fs.readFileSync(path.join(root, "test-page.html"), "utf8");
  const playLevelBody = html.match(/async function playLevel\(media, amplitude, label, keepPulse\) \{([\s\S]*?)\n\n      async function playDemoSequence/);

  assert.ok(playLevelBody, "playLevel should exist");
  assert.match(html, /let playRequestId = 0;/);
  assert.match(playLevelBody[1], /const requestId = \+\+playRequestId;/);
  assert.match(playLevelBody[1], /if \(requestId !== playRequestId\) return;/);
  assert.match(html, /playRequestId \+= 1;/);
});
test("public test page reports the selected level before awaiting playback", () => {
  const html = fs.readFileSync(path.join(root, "test-page.html"), "utf8");
  const playLevelBody = html.match(/async function playLevel\(media, amplitude, label, keepPulse\) \{([\s\S]*?)\n\n      async function playDemoSequence/);

  assert.ok(playLevelBody, "playLevel should exist");
  const statusIndex = playLevelBody[1].indexOf("status.textContent = label");
  const playIndex = playLevelBody[1].indexOf("await media.play()");

  assert.ok(statusIndex >= 0, "playLevel should update the visible status");
  assert.ok(playIndex >= 0, "playLevel should still attempt media playback");
  assert.ok(statusIndex < playIndex, "status should update before media.play can reject");
  assert.match(playLevelBody[1], /catch \(error\)/);
});

test("public test page generated PCM keeps requested quiet loud and very loud dB order", () => {
  const html = fs.readFileSync(path.join(root, "test-page.html"), "utf8");

  function amplitudeFor(name) {
    const match = html.match(new RegExp("const " + name + "_AMPLITUDE = ([0-9.]+);"));
    assert.ok(match, name + "_AMPLITUDE should exist");
    return Number(match[1]);
  }

  function generatedPcmStats(amplitude) {
    const sampleRate = 44100;
    let squareSum = 0;
    let peak = 0;

    for (let index = 0; index < sampleRate; index += 1) {
      const sample = Math.sin((2 * Math.PI * 440 * index) / sampleRate);
      const value = Math.max(-1, Math.min(1, sample * amplitude));
      const pcm = Math.trunc(value * 32767) / 32767;
      squareSum += pcm * pcm;
      peak = Math.max(peak, Math.abs(pcm));
    }

    return {
      peak,
      rmsDb: 20 * Math.log10(Math.sqrt(squareSum / sampleRate))
    };
  }

  const quiet = generatedPcmStats(amplitudeFor("QUIET"));
  const loud = generatedPcmStats(amplitudeFor("LOUD"));
  const veryLoud = generatedPcmStats(amplitudeFor("VERY_LOUD"));

  assert.ok(quiet.peak < loud.peak, "generated quiet PCM peak should stay below loud PCM peak");
  assert.ok(loud.peak < veryLoud.peak, "generated loud PCM peak should stay below very loud PCM peak");
  assert.ok(Math.abs(quiet.rmsDb - -63) <= 0.2);
  assert.ok(Math.abs(veryLoud.rmsDb - -4) <= 0.1);
  assert.ok(Math.abs(loud.rmsDb - -43) <= 0.2);
});

test("public test page keeps the raw demo outside the extension pipeline", () => {
  const html = fs.readFileSync(path.join(root, "test-page.html"), "utf8");
  const contentSource = fs.readFileSync(path.join(root, "content.js"), "utf8");

  assert.match(html, /id="rawDemoAudio"/);
  assert.match(html, /data-stream-volume-guard-bypass="true"/);
  assert.match(html, /rawAudio/);
  assert.match(html, /playDemoSequence\(rawAudio,/);
  assert.match(html, /playDemoSequence\(audio,/);
  assert.match(contentSource, /const BYPASS_ATTR = "streamVolumeGuardBypass"/);
  assert.match(contentSource, /media\.dataset\[BYPASS_ATTR\] !== "true"/);
});

test("public test page requested levels are recoverable by the stream profile", () => {
  const html = fs.readFileSync(path.join(root, "test-page.html"), "utf8");
  const WLG = loadCore();
  const settings = WLG.Settings.normalizeSettings({});
  const profile = WLG.Settings.getRuntimeProfile(settings);

  function targetGainFor(name) {
    const match = html.match(new RegExp("const " + name + "_AMPLITUDE = ([0-9.]+);"));
    assert.ok(match, name + "_AMPLITUDE should exist");
    const amplitude = Number(match[1]);
    const rmsDb = 20 * Math.log10(amplitude / Math.SQRT2);
    return WLG.Normalizer.calculateTargetGainDb({
      currentRmsDb: rmsDb,
      targetRmsDb: profile.targetRmsDb,
      maxBoostDb: profile.maxBoostDb,
      maxReductionDb: profile.maxReductionDb
    });
  }

  assert.ok(targetGainFor("QUIET") < profile.maxBoostDb, "quiet level should remain recoverable below max boost");
  assert.ok(targetGainFor("QUIET") > 40, "quiet level should be recoverable even from -63 dB");
  assert.ok(targetGainFor("LOUD") > 20, "middle level should be boosted toward target");
  assert.ok(targetGainFor("LOUD") < profile.maxBoostDb, "middle level should stay below max boost");
  assert.ok(targetGainFor("VERY_LOUD") < 0, "very loud level should trigger reduction");
  assert.ok(targetGainFor("VERY_LOUD") > profile.maxReductionDb, "very loud reduction should stay inside max reduction");
  assert.match(html, /Avec l'extension active, les boutons ci-dessus doivent finir presque au même volume/);
  assert.match(html, /Pour entendre les écarts bruts, utilise Avant brut/);
});

test("public test page displays live extension status when available", () => {
  const html = fs.readFileSync(path.join(root, "test-page.html"), "utf8");

  assert.match(html, /id="extensionResults"/);
  assert.match(html, /id="extensionTarget"/);
  assert.match(html, /id="extensionGain"/);
  assert.match(html, /id="extensionMaxBoost"/);
  assert.match(html, /id="extensionRisk"/);
  assert.match(html, /id="extensionOutputRms"/);
  assert.match(html, /Boost max/);
  assert.match(html, /Moyenne RMS traitée/);
  assert.match(html, /WLG_TEST_PAGE_STATUS/);
  assert.match(html, /addEventListener\("message"/);
  assert.match(html, /toFixed\(1\)/);
});

test("public test page exposes a guided streamer readiness check", () => {
  const html = fs.readFileSync(path.join(root, "test-page.html"), "utf8");

  assert.match(html, /id="streamerTestButton"/);
  assert.match(html, /id="streamerTestResult"/);
  assert.match(html, /async function runStreamerReadinessTest\(\)/);
  assert.match(html, /STREAMER_TEST_STEPS/);
  assert.match(html, /waitForExtensionStatus/);
  assert.match(html, /outputDeltaDb <= 0\.7/);
  assert.match(html, /OK pour live/);
  assert.match(html, /À régler avant live/);
});

test("public docs use current test page button labels", () => {
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  const quickstart = fs.readFileSync(path.join(root, "docs", "streamer-quickstart-60s.md"), "utf8");

  [readme, quickstart].forEach((docs) => {
    assert.match(docs, /Avec extension/);
    assert.match(docs, /Avant brut/);
    assert.doesNotMatch(docs, /Après équilibrage/);
  });
});

test("stream status helper classifies safe, warning and risky peaks", () => {
  const context = createContext();
  loadScript(context, "audio/analyser.js");
  loadScript(context, "audio/stream-status.js");

  const StreamStatus = context.StreamVolumeGuard.StreamStatus;
  assert.equal(StreamStatus.classifyRisk({
    predictedPeakDb: -8,
    ceilingDb: -1,
    rmsDb: -21,
    targetRmsDb: -18
  }).level, "safe");
  assert.equal(StreamStatus.classifyRisk({
    predictedPeakDb: -3,
    ceilingDb: -1,
    rmsDb: -15,
    targetRmsDb: -18
  }).level, "warning");
  assert.equal(StreamStatus.classifyRisk({
    predictedPeakDb: 1,
    ceilingDb: -1,
    rmsDb: -10,
    targetRmsDb: -18
  }).level, "risky");
});

test("stream status reacts immediately to loud incoming peaks", () => {
  const context = createContext();
  loadScript(context, "audio/analyser.js");
  loadScript(context, "audio/stream-status.js");

  const StreamStatus = context.StreamVolumeGuard.StreamStatus;
  const risk = StreamStatus.classifyRisk({
    peakDb: -1.8,
    predictedPeakDb: -8,
    ceilingDb: -1,
    rmsDb: -24,
    targetRmsDb: -18
  });

  assert.equal(risk.level, "risky");
  assert.equal(risk.reason, "incoming-peak");
});

test("stream status keeps short risky hold so streamers can see a spike", () => {
  const context = createContext();
  loadScript(context, "audio/analyser.js");
  loadScript(context, "audio/stream-status.js");

  const StreamStatus = context.StreamVolumeGuard.StreamStatus;
  const first = StreamStatus.nextRiskState({
    peakDb: -1.8,
    predictedPeakDb: -8,
    ceilingDb: -1,
    rmsDb: -24,
    targetRmsDb: -18,
    nowMs: 1000,
    previousRiskUntilMs: 0
  });
  const held = StreamStatus.nextRiskState({
    peakDb: -24,
    predictedPeakDb: -24,
    ceilingDb: -1,
    rmsDb: -28,
    targetRmsDb: -18,
    nowMs: 1600,
    previousRiskUntilMs: first.riskUntilMs
  });
  const cleared = StreamStatus.nextRiskState({
    peakDb: -24,
    predictedPeakDb: -24,
    ceilingDb: -1,
    rmsDb: -28,
    targetRmsDb: -18,
    nowMs: 2200,
    previousRiskUntilMs: first.riskUntilMs
  });

  assert.equal(first.level, "risky");
  assert.equal(first.riskUntilMs, 2000);
  assert.equal(held.level, "risky");
  assert.equal(held.reason, "held-risk");
  assert.equal(cleared.level, "safe");
});

test("normalizer uses held risk state and reports immediately on new risky spikes", () => {
  const source = fs.readFileSync(path.join(root, "audio", "normalizer.js"), "utf8");

  assert.match(source, /let riskUntilMs = 0;/);
  assert.match(source, /const wasRisky = riskLevel === "risky";/);
  assert.match(source, /StreamStatus\.nextRiskState\({[\s\S]*peakDb:\s*lastPeakDb,/);
  assert.match(source, /previousRiskUntilMs:\s*riskUntilMs/);
  assert.match(source, /riskUntilMs = processingEnabled \? risk\.riskUntilMs : 0;/);
  assert.match(source, /report\(\(levelJumped \|\| outputWouldOvershoot\) \|\| \(riskLevel === "risky" && !wasRisky\)\);/);
});

test("popup refreshes status frequently while open for responsive stream state", () => {
  const source = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");

  assert.match(source, /const STATUS_REFRESH_MS = 250;/);
  assert.match(source, /let refreshTimer = null;/);
  assert.match(source, /if \(!root\.chrome \|\| !chrome\.runtime \|\| !chrome\.runtime\.sendMessage\)/);
  assert.match(source, /refreshTimer = root\.setInterval\(refresh, STATUS_REFRESH_MS\);/);
  assert.match(source, /function disposePopup\(\) {/);
  assert.match(source, /root\.addEventListener\("pagehide", disposePopup\);/);
  assert.match(source, /root\.addEventListener\("visibilitychange", \(\) => \{/);
  assert.match(source, /document\.visibilityState === "hidden"/);
  assert.match(source, /disposePopup\(\);/);
});

test("content refresh reconfigures existing media pipelines", () => {
  const contentSource = fs.readFileSync(path.join(root, "content.js"), "utf8");
  const normalizerSource = fs.readFileSync(path.join(root, "audio", "normalizer.js"), "utf8");

  assert.match(contentSource, /normalizer\.updateSettings\([^)]*\)/);
  assert.match(contentSource, /const sourceSettings = options && options\.settings/);
  assert.match(contentSource, /: await Settings\.getSettings\(\)/);
  assert.match(contentSource, /Settings\.getSettingsForDomain\(sourceSettings, state\.site\)/);
  assert.match(contentSource, /targetRmsDb: settings\.targetRmsDb/);
  assert.match(contentSource, /targetRmsDb: nextState\.targetRmsDb/);
  assert.match(contentSource, /function getEnabledAfterSettingsRefresh\(isExcluded, options\)/);
  assert.match(contentSource, /if \(Object\.prototype\.hasOwnProperty\.call\(options \|\| \{\}, "requestedEnabled"\)\)/);
  assert.match(contentSource, /if \(isExcluded\) return false;/);
  assert.match(contentSource, /return state\.enabled;/);
  assert.match(contentSource, /enabled: getEnabledAfterSettingsRefresh\(isExcluded, options\)/);
  assert.doesNotMatch(contentSource, /Boolean\(settings\.enabled\) && !isExcluded && state\.enabled/);
  assert.match(normalizerSource, /function updateSettings\(nextSettings, options\)/);
  assert.match(normalizerSource, /connectGraph\(\);/);
});

test("content settings updates are coalesced", () => {
  const contentSource = fs.readFileSync(path.join(root, "content.js"), "utf8");
  assert.match(contentSource, /let settingsUpdateTimer = null;/);
  assert.match(contentSource, /let pendingSettingsUpdate = null;/);
  assert.match(contentSource, /function applyPendingSettingsUpdate\(options\)[\s\S]*normalizers\.forEach\(\(normalizer\) => \{/);
  assert.match(contentSource, /settingsUpdateTimer = root\.setTimeout\(\(\) => applyPendingSettingsUpdate\(\{ immediate: false \}\), SETTINGS_UPDATE_DEBOUNCE_MS\)/);
});

test("content explicit refresh flushes pending settings immediately", () => {
  const contentSource = fs.readFileSync(path.join(root, "content.js"), "utf8");
  const normalizerSource = fs.readFileSync(path.join(root, "audio", "normalizer.js"), "utf8");

  assert.match(contentSource, /function applyPendingSettingsUpdate\(options\)/);
  assert.match(contentSource, /function updateNormalizerSettings\(options\)/);
  assert.match(contentSource, /const immediate = Boolean\(options && options\.immediate\);/);
  assert.match(contentSource, /if \(nextJson === lastSettingsJson && !\(immediate && settingsUpdateTimer\)\) return;/);
  assert.match(contentSource, /normalizer\.updateSettings\(nextSettings, \{ immediate \}\)/);
  assert.match(contentSource, /if \(immediate\) \{[\s\S]*applyPendingSettingsUpdate\(\{ immediate: true \}\);[\s\S]*return;[\s\S]*\}/);
  assert.match(contentSource, /rescan\(\{ immediate: true \}\)/);
  assert.match(normalizerSource, /function updateSettings\(nextSettings, options\)/);
  assert.match(normalizerSource, /const immediate = Boolean\(options && options\.immediate\);/);
  assert.match(normalizerSource, /const delayMs = immediate \? 0 : Math\.max/);
});

test("content refreshes when saved settings change in chrome storage", () => {
  const contentSource = fs.readFileSync(path.join(root, "content.js"), "utf8");

  assert.match(contentSource, /function startSettingsChangeListener/);
  assert.match(contentSource, /chrome\.storage\.onChanged\.addListener/);
  assert.match(contentSource, /areaName !== "local"/);
  assert.match(contentSource, /Settings\.SETTINGS_KEY/);
  assert.match(contentSource, /rescan\(\{ immediate: true \}\)/);
});

test("background falls back to the last focused browser tab for popup diagnostics", () => {
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");

  assert.match(backgroundSource, /async function queryActiveTab\(queryInfo\)/);
  assert.match(backgroundSource, /chrome\.tabs\.query\(queryInfo/);
  assert.match(backgroundSource, /queryActiveTab\(\{ active: true, currentWindow: true \}\)/);
  assert.match(backgroundSource, /queryActiveTab\(\{ active: true, lastFocusedWindow: true \}\)/);
  assert.match(backgroundSource, /getAllTabs\(\)/);
  assert.match(backgroundSource, /canInjectUrl\(tab\.url\)/);
});

test("background diagnostics can select an observed media tab when options page is active", () => {
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");

  assert.match(backgroundSource, /async function getBestObservedTabStatus\(globalEnabled, excludedTabId\)/);
  assert.match(backgroundSource, /sendMessage\(tab\.id, \{ type: "WLG_GET_STATUS" \}\)/);
  assert.match(backgroundSource, /function scoreObservedStatus\(tab, status\)/);
  assert.match(backgroundSource, /const observedStatus = await getBestObservedTabStatus\(globalEnabled, tab && tab\.id\)/);
  assert.match(backgroundSource, /if \(observedStatus\) return observedStatus/);
});

test("background can recover a tab site from the content script when tab url is unavailable", () => {
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");

  assert.match(backgroundSource, /async function getTabSite\(tab\)/);
  assert.match(backgroundSource, /await executeScripts\(tab\.id\)/);
  assert.match(backgroundSource, /sendMessageWithRetry\(tab\.id,\s*\{\s*type: "WLG_GET_STATUS"\s*\}/);
  assert.match(backgroundSource, /const site = await getTabSite\(tab\)/);
  assert.match(backgroundSource, /Settings\.getSettingsForDomain\(await getSettingsWithGlobalTarget\(\), site\)/);
});

test("background active status does not return an empty tab-id status before recovering site", () => {
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");

  assert.doesNotMatch(backgroundSource, /if \(tabId \|\| hasUsefulObservedStatus\(activeStatus\)\) return activeStatus/);
  assert.match(backgroundSource, /if \(hasUsefulObservedStatus\(activeStatus\)\) return activeStatus/);
  assert.match(backgroundSource, /const site = await getTabSite\(tab\)/);
  assert.match(backgroundSource, /activeStatus = mergeStatus\(tabWithSite, normalizedRecoveredResponse, globalEnabled\)/);
});

test("background explains active-tab site recovery failures in popup diagnostics", () => {
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");

  assert.match(backgroundSource, /async function getTabSiteDetails\(tab\)/);
  assert.match(backgroundSource, /return \{ site: "", reason: "content-site-recovery-failed", error: error && error\.message/);
  assert.match(backgroundSource, /const siteDetails = await getTabSiteDetails\(tab\)/);
  assert.match(backgroundSource, /statusRoute: "active-tab-empty"/);
  assert.match(backgroundSource, /diagnosticReason: siteDetails\.reason/);
  assert.match(backgroundSource, /const diagnosticError = siteDetails\.error \|\| \(activeStatus && activeStatus\.error\) \|\| \(activeStatus && activeStatus\.lastError\) \|\| ""/);
  assert.match(backgroundSource, /error: diagnosticError/);
  assert.match(backgroundSource, /lastError: siteDetails\.error \|\| \(activeStatus && activeStatus\.lastError\) \|\| \(activeStatus && activeStatus\.error\) \|\| ""/);
});

test("background runtime listener keeps sendResponse alive with a literal true", () => {
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");

  assert.doesNotMatch(backgroundSource, /chrome\.runtime\.onMessage\.addListener\(async/);
  assert.match(backgroundSource, /function handleCaptureStatusMessage\(message\)/);
  assert.match(backgroundSource, /handleCaptureStatusMessage\(message\)\s*\.then\(sendResponse\)\s*\.catch\(\(error\) => sendResponse\(\{ ok: false, error: error\.message \}\)\);[\s\S]*return true;/);
});

test("popup passes its active tab id to background status requests", () => {
  const popupSource = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");

  assert.match(popupSource, /let activeTabContext = null/);
  assert.match(popupSource, /function queryPopupActiveTab\(queryInfo\)/);
  assert.match(popupSource, /chrome\.tabs\.query\(queryInfo/);
  assert.match(popupSource, /function activeTabPayload\(\)/);
  assert.match(popupSource, /currentStatus = await sendRuntimeMessage\("WLG_GET_ACTIVE_STATUS", activeTabPayload\(\)\)/);
  assert.match(backgroundSource, /async function getStatusForActiveTab\(tabId\)/);
  assert.match(backgroundSource, /const tab = tabId \? await getTabById\(tabId\) : await getActiveTab\(\)/);
  assert.match(backgroundSource, /getStatusForActiveTab\(message\.tabId\)/);
});

test("options target changes refresh injected tabs instead of the options page only", () => {
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");
  const optionsSource = fs.readFileSync(path.join(root, "options", "options.js"), "utf8");

  assert.match(optionsSource, /id="applySettingsButton"|applySettingsButton/);
  assert.match(optionsSource, /scope:\s*"all-open-tabs"/);
  assert.match(backgroundSource, /function getAllTabs/);
  assert.match(backgroundSource, /function refreshOpenTabs/);
  assert.match(backgroundSource, /chrome\.tabs\.query\(\{\}/);
  assert.match(backgroundSource, /message\.scope === "all-open-tabs"/);
  assert.match(backgroundSource, /type: "WLG_REFRESH_SETTINGS"/);
});

test("options refresh ignores tabs that cannot receive settings", () => {
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");

  assert.match(backgroundSource, /Promise\.allSettled\(tabs\.map\(\(tab\) => refreshTab\(tab, sanitizedSourceSettings, forceEnabledFromSource\)\)\)/);
  assert.match(backgroundSource, /const fulfilledStatuses = refreshResults/);
  assert.match(backgroundSource, /failed: refreshResults\.filter\(\(result\) => result\.status === "rejected"\)\.length/);
  assert.doesNotMatch(backgroundSource, /const statuses = await Promise\.all\(tabs\.map\(\(tab\) => refreshTab\(tab, sanitizedSourceSettings, forceEnabledFromSource\)\)\)/);
});

test("options apply button confirms only after extension refresh response", () => {
  const optionsSource = fs.readFileSync(path.join(root, "options", "options.js"), "utf8");

  assert.match(optionsSource, /function setApplyButtonState/);
  assert.match(optionsSource, /elements\.applySettingsButton\.disabled = state === "sending"/);
  assert.match(optionsSource, /classList\.toggle\("is-cooldown", state === "cooldown"\)/);
  assert.match(optionsSource, /if \(state === "cooldown"\)/);
  assert.match(optionsSource, /elements\.applySettingsButton\.textContent = i18n\("optionsApplySending"/);
  assert.match(optionsSource, /elements\.applySettingsButton\.textContent = i18n\("optionsApplyApplied"/);
  assert.match(optionsSource, /return new Promise\(\(resolve\) => \{/);
  assert.match(optionsSource, /chrome\.runtime\.sendMessage\(\{ type: "WLG_REFRESH_ACTIVE_TAB", scope: "all-open-tabs" \}, \(response\) => \{/);
  assert.match(optionsSource, /const refreshResult = await refreshOpenTabs\(\)/);
  assert.match(optionsSource, /setApplyButtonState\("applied"\)/);
  assert.match(optionsSource, /setApplyButtonState\("error"\)/);

  const refreshAwaitIndex = optionsSource.indexOf("const refreshResult = await refreshOpenTabs()");
  const appliedIndex = optionsSource.indexOf('setApplyButtonState("applied")');
  assert.ok(refreshAwaitIndex >= 0 && appliedIndex > refreshAwaitIndex, "button should confirm after refresh response");
});

test("options diagnostic export includes actionable streamer fields without private page data", () => {
  const optionsSource = fs.readFileSync(path.join(root, "options", "options.js"), "utf8");

  assert.match(optionsSource, /function detectBrowserFamily\(userAgent\)/);
  assert.match(optionsSource, /function buildDiagnosticQuality\(activeTab, desktopBridge\)/);
  assert.match(optionsSource, /diagnosticQuality: buildDiagnosticQuality\(activeTab, desktopBridge\)/);
  assert.match(optionsSource, /reason: "extension-not-active-on-current-tab"/);
  assert.match(optionsSource, /reason: "ready-for-bug-report"/);
  assert.match(optionsSource, /reason: "standalone-media-html-unavailable"/);
  assert.match(optionsSource, /reason: "desktop-fallback-active"/);
  assert.match(optionsSource, /Controle via Windows actif/);
  assert.match(optionsSource, /nextStep:/);
  assert.match(optionsSource, /streamerDiagnostics:\s*{/);
  assert.match(optionsSource, /browserFamily: detectBrowserFamily/);
  assert.match(optionsSource, /pipelineActive: activeTab\.enabled && !activeTab\.excluded && activeTab\.mediaProcessed > 0/);
  assert.match(optionsSource, /tabCaptureActive: activeTab\.sourceType === "tab-capture"/);
  assert.match(optionsSource, /permissionNeeded: activeTab\.canInject === false/);
  assert.match(optionsSource, /sourceIncompatible: activeTab\.enabled && !activeTab\.excluded && activeTab\.mediaDetected > 0 && activeTab\.mediaProcessed === 0/);
  assert.match(optionsSource, /includesFullUrl: false/);
  assert.match(optionsSource, /includesPageTitle: false/);
  assert.doesNotMatch(optionsSource, /location\.href/);
  assert.doesNotMatch(optionsSource, /document\.title/);
});

test("options platform profiles show recommended versus custom state clearly", () => {
  const optionsHtml = fs.readFileSync(path.join(root, "options", "options.html"), "utf8");
  const optionsSource = fs.readFileSync(path.join(root, "options", "options.js"), "utf8");
  const frMessages = readJson("_locales/fr/messages.json");
  const enMessages = readJson("_locales/en/messages.json");

  assert.match(optionsHtml, /id="platformProfilesList"/);
  assert.match(optionsSource, /className = `platform-profile-status/);
  assert.match(optionsSource, /platformProfileRecommendedProfile/);
  assert.match(optionsSource, /platformProfileCustomProfile/);
  assert.match(optionsSource, /platform-profile-domain-list/);
  assert.match(optionsSource, /select\.setAttribute\("aria-label"/);
  assert.equal(frMessages.platformProfileRecommendedProfile.message, "Profil recommandé");
  assert.equal(enMessages.platformProfileRecommendedProfile.message, "Recommended profile");
});

test("content publishes safe live status only to the local test page", () => {
  const contentSource = fs.readFileSync(path.join(root, "content.js"), "utf8");

  assert.match(contentSource, /function isLocalTestPage/);
  assert.match(contentSource, /state\.site === "127\.0\.0\.1"/);
  assert.match(contentSource, /state\.site === "localhost"/);
  assert.match(contentSource, /WLG_TEST_PAGE_STATUS/);
  assert.match(contentSource, /outputRmsDb: state\.outputRmsDb/);
  assert.match(contentSource, /maxBoostDb: state\.maxBoostDb/);
  assert.match(contentSource, /root\.postMessage/);
  assert.match(contentSource, /root\.location\.origin/);
  assert.doesNotMatch(contentSource, /root\.postMessage\([\s\S]*,\s*"\*"\)/);
});

test("local test page exposes post-chain output peak for OBS-style validation", () => {
  const normalizerSource = fs.readFileSync(path.join(root, "audio", "normalizer.js"), "utf8");
  const contentSource = fs.readFileSync(path.join(root, "content.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "test-page.html"), "utf8");
  const popupSource = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");

  assert.match(normalizerSource, /let outputPeakDb = Analyser\.MIN_DB/);
  assert.match(normalizerSource, /function getEstimatedOutputPeakDb\(\)/);
  assert.match(normalizerSource, /function readOutputPeakDb\(\)/);
  assert.match(normalizerSource, /Analyser\.calculatePeakDb\(outputBuffer\)/);
  assert.match(normalizerSource, /outputPeakDb = preferEstimatedOutput \? getEstimatedOutputPeakDb\(\) : measuredOutputPeakDb/);
  assert.match(normalizerSource, /outputPeakDb: Number\(outputPeakDb\.toFixed\(2\)\)/);
  assert.match(contentSource, /outputPeakDb: state\.outputPeakDb/);
  assert.match(contentSource, /outputPeakDb: nextState\.outputPeakDb/);
  assert.match(html, /id="extensionOutputPeak"/);
  assert.match(html, /Moyenne RMS traitée/);
  assert.match(html, /const extensionOutputPeak = document\.getElementById\("extensionOutputPeak"\)/);
  assert.match(html, /extensionOutputPeak\.textContent = formatDb\(nextStatus\.outputPeakDb\)/);
  assert.match(popupSource, /outputPeakDb:/);
});

test("local test page and smoke test lock streamer equalization quality gates", () => {
  const html = fs.readFileSync(path.join(root, "test-page.html"), "utf8");
  const smokeHtml = fs.readFileSync(path.join(root, "tests", "technical-smoke.html"), "utf8");
  const browserSmokeSource = fs.readFileSync(path.join(root, "tests", "browser-smoke.js"), "utf8");

  assert.match(html, /const QUALITY_RMS_SPREAD_DB = 0\.5;/);
  assert.match(html, /const QUALITY_PEAK_SPREAD_DB = 1\.5;/);
  assert.match(html, /id="extensionEqualization"/);
  assert.match(html, /function formatEqualizationStatus\(nextStatus\)/);
  assert.match(html, /"égalisé"/);
  assert.match(html, /"en cours"/);
  assert.match(smokeHtml, /const QUALITY_RMS_SPREAD_DB = 0\.5;/);
  assert.match(smokeHtml, /const QUALITY_PEAK_SPREAD_DB = 1\.5;/);
  assert.match(smokeHtml, /alternationEndSpreadDb > QUALITY_RMS_SPREAD_DB/);
  assert.match(smokeHtml, /alternationEndPeakSpreadDb > QUALITY_PEAK_SPREAD_DB/);
  assert.match(browserSmokeSource, /equalizedOutputSpreadDb <= 0\.5/);
  assert.match(browserSmokeSource, /alternationEndSpreadDb <= 0\.5/);
  assert.match(browserSmokeSource, /alternationEndPeakSpreadDb <= 1\.5/);
  assert.match(smokeHtml, /const CALM_TARGET_RMS_DB = -25;/);
  assert.match(smokeHtml, /calmTargetPeakStats/);
  assert.match(smokeHtml, /targetRmsDb: -10/);
  assert.match(smokeHtml, /status\.targetRmsDb === -15/);
  assert.match(smokeHtml, /maxRecoverableTargetStats/);
  assert.match(smokeHtml, /maxRecoverableTargetSpreadDb > QUALITY_RMS_SPREAD_DB/);
  assert.match(smokeHtml, /function createRealWorldWaveBlob/);
  assert.match(smokeHtml, /const REAL_WORLD_MIN_OUTPUT_RMS_DB = -22;/);
  assert.match(smokeHtml, /const REAL_WORLD_OUTPUT_SETTLE_TIMEOUT_MS = 8000;/);
  assert.match(smokeHtml, /realWorldLevelStats/);
  assert.match(smokeHtml, /real-world output settled/);
  assert.match(smokeHtml, /collectSettledOutputStats\(2200, 200\)/);
  assert.match(smokeHtml, /quietAfterVeryLoudTransitionStats/);
  assert.match(smokeHtml, /quietTransitionPeakLimitDb = -17/);
  assert.match(browserSmokeSource, /calmTargetPeakSpreadDb <= 1/);
  assert.match(browserSmokeSource, /calmTargetVeryLoudPeakDeltaDb <= 1/);
  assert.match(browserSmokeSource, /maxRecoverableTargetSpreadDb <= 0\.5/);
  assert.match(browserSmokeSource, /realWorldLevelSpreadDb <= 1/);
  assert.match(browserSmokeSource, /realWorldVeryLoudShortfallDb <= 1/);
  assert.match(browserSmokeSource, /quietAfterVeryLoudTransitionOvershootDb <= 0/);
});

test("normalizer measures post-chain output RMS separately from raw RMS", () => {
  const normalizerSource = fs.readFileSync(path.join(root, "audio", "normalizer.js"), "utf8");

  assert.match(normalizerSource, /let outputRmsDb = Analyser\.MIN_DB/);
  assert.match(normalizerSource, /let outputAnalyser = null;/);
  assert.match(normalizerSource, /outputAnalyser = Analyser\.createAnalyserNode\(context, 2048\);/);
  assert.match(normalizerSource, /outputGain\.connect\(mediaSeekGate\);[\s\S]*mediaSeekGate\.connect\(outputAnalyser\);[\s\S]*outputAnalyser\.connect\(context\.destination\);/);
  assert.match(normalizerSource, /function readOutputRmsDb\(\)/);
  assert.match(normalizerSource, /Analyser\.getAnalyserRmsDb\(outputAnalyser, outputBuffer\)/);
  assert.match(normalizerSource, /outputRmsDb: Number\(outputRmsDb\.toFixed\(2\)\)/);
});

test("normalizer smooths control RMS so web video voices are not over-chased", () => {
  const normalizerSource = fs.readFileSync(path.join(root, "audio", "normalizer.js"), "utf8");

  assert.match(normalizerSource, /let gainControlRmsDb = Analyser\.MIN_DB;/);
  assert.match(normalizerSource, /function updateGainControlRmsDb\(nextRmsDb, elapsedMs, levelJumped\)/);
  assert.match(normalizerSource, /profile\.attackMs \* GAIN_CONTROL_ATTACK_MULTIPLIER/);
  assert.match(normalizerSource, /profile\.releaseMs \* GAIN_CONTROL_RELEASE_MULTIPLIER/);
  assert.match(normalizerSource, /profile\.id === "obs"/);
  assert.doesNotMatch(normalizerSource, /profile\.id === "stream"/);
  assert.match(normalizerSource, /const controlRmsDb = updateGainControlRmsDb\(lastRmsDb, elapsedMs, levelJumped\);/);
  assert.match(normalizerSource, /currentRmsDb: controlRmsDb/);
});

test("normalizer includes a measured output trim to prevent quiet content overshoot", () => {
  const normalizerSource = fs.readFileSync(path.join(root, "audio", "normalizer.js"), "utf8");

  assert.match(normalizerSource, /let outputTrimGain = null;/);
  assert.match(normalizerSource, /let currentOutputTrimDb = 0;/);
  assert.match(normalizerSource, /const OUTPUT_TRIM_DEADBAND_DB = 0\.06;/);
  assert.match(normalizerSource, /outputAnalyser\.smoothingTimeConstant = 0\.15;/);
  assert.match(normalizerSource, /function updateOutputTrim\(measuredOutputRmsDb, elapsedMs, targetGainDb\)/);
  assert.match(normalizerSource, /Math\.abs\(correctionDb\) < OUTPUT_TRIM_DEADBAND_DB/);
  assert.match(normalizerSource, /const remainingBoostHeadroomDb = Math\.max\(0, profile\.maxBoostDb - targetGainDb\);/);
  assert.match(normalizerSource, /const highBoostSignal = targetGainDb >= 24;/);
  assert.match(normalizerSource, /const allowUpwardTrim = !highBoostSignal \|\| remainingBoostHeadroomDb >= 1\.5;/);
  assert.match(normalizerSource, /const maxTrimDb = highBoostSignal \? Math\.min\(0\.9, remainingBoostHeadroomDb\) : 3;/);
  assert.match(normalizerSource, /const minTrimDb = targetGainDb > 0 && targetGainDb < 24 \? -1\.5 : -12;/);
  assert.match(normalizerSource, /correctionDb > 0 && allowUpwardTrim[\s\S]*Analyser\.clamp\(correctionDb \* 0\.55, 0, 4\)/);
  assert.match(normalizerSource, /correctionDb < 0[\s\S]*Analyser\.clamp\(correctionDb \* 0\.35, -2\.5, 0\)/);
  assert.match(normalizerSource, /Analyser\.clamp\(currentOutputTrimDb \+ correctionStepDb, minTrimDb, maxTrimDb\)/);
  assert.match(normalizerSource, /if \(!allowUpwardTrim && targetTrimDb > 0\) \{/);
  assert.match(normalizerSource, /targetTrimDb = 0;/);
  assert.doesNotMatch(normalizerSource, /allowDownwardTrim/);
  assert.doesNotMatch(normalizerSource, /currentOutputTrimDb \+ correctionDb/);
  assert.match(normalizerSource, /const outputTooWeak = correctionDb > 1;/);
  assert.match(normalizerSource, /outputTooWeak && allowUpwardTrim[\s\S]*\? \(highBoostSignal \? 140 : 120\)/);
  assert.match(normalizerSource, /wetGain\.connect\(outputTrimGain\);[\s\S]*outputTrimGain\.connect\(outputGain\);/);
  assert.match(normalizerSource, /outputTrimGain\.gain\.setTargetAtTime/);
});

test("normalizer resets stale state and snaps gain on large input level jumps", () => {
  const normalizerSource = fs.readFileSync(path.join(root, "audio", "normalizer.js"), "utf8");

  assert.match(normalizerSource, /const TRANSITION_DUCK_GAIN = 0\.12;/);
  assert.match(normalizerSource, /const TRANSITION_DUCK_RAMP_SECONDS = 0\.012;/);
  assert.match(normalizerSource, /const TRANSITION_RECOVER_DELAY_SECONDS = 0\.016;/);
  assert.match(normalizerSource, /const TRANSITION_RECOVER_TIME_CONSTANT = 0\.026;/);
  assert.match(normalizerSource, /const OUTPUT_ESTIMATE_HOLD_MS = 1000;/);
  assert.match(normalizerSource, /let previousInputRmsDb = Analyser\.MIN_DB;/);
  assert.match(normalizerSource, /let outputTrimHoldUntilMs = 0;/);
  assert.match(normalizerSource, /let preferEstimatedOutputUntilMs = 0;/);
  assert.match(normalizerSource, /function resetOutputTrim\(timeConstant, snap\)/);
  assert.match(normalizerSource, /function handleLevelJump\(nextRmsDb\)/);
  assert.match(normalizerSource, /Math\.abs\(nextRmsDb - previousInputRmsDb\)/);
  assert.match(normalizerSource, /const JUMP_DETECT_DB = 14;/);
  assert.match(normalizerSource, /resetOutputTrim\(\s*0\.02,\s*true\s*\)/);
  assert.match(normalizerSource, /outputTrimHoldUntilMs = context\.currentTime \* 1000 \+ (?:780|900)/);
  assert.match(normalizerSource, /now \* 1000 < outputTrimHoldUntilMs/);
  assert.match(normalizerSource, /const predictedOutputBeforeSmoothingDb = lastRmsDb \+ currentGainDb \+ currentOutputTrimDb/);
  assert.match(normalizerSource, /predictedOutputBeforeSmoothingDb > profile\.targetRmsDb \+ 1\.2/);
  assert.match(normalizerSource, /const shouldForceCatchup = gainDeltaForSnapDb > 16;/);
  assert.match(normalizerSource, /const shouldSnapGain = !?inSettingsReconfig && \([\s\S]*outputWouldOvershoot \|\|/);
  assert.match(normalizerSource, /outputWouldOvershoot \|\|\s*levelJumped \|\|/);
  assert.match(normalizerSource, /levelJumped && targetGainDb < currentGainDb - 1/);
  assert.match(normalizerSource, /preferEstimatedOutputUntilMs = Math\.max\(/);
  assert.match(normalizerSource, /now \* 1000 \+ OUTPUT_ESTIMATE_HOLD_MS/);
  assert.match(normalizerSource, /levelJumped \|\| outputWouldOvershoot/);
  assert.match(normalizerSource, /const AUTO_GAIN_HOLD_RAMP_SECONDS = 0\.045;/);
  assert.match(normalizerSource, /const AUTO_GAIN_RAMP_SECONDS = 0\.018;/);
  assert.match(normalizerSource, /const autoGainRampSeconds = shouldSnapGain \? AUTO_GAIN_HOLD_RAMP_SECONDS : AUTO_GAIN_RAMP_SECONDS;/);
  assert.match(normalizerSource, /const settingsSmoothingElapsedMs = inSettingsReconfig/);
  assert.match(normalizerSource, /const snapSettingsSafeSeconds[\s\S]*SETTINGS_GAIN_RAMP_SECONDS[\s\S]*autoGainRampSeconds;[\s\S]*rampParamToValue\(autoGain\.gain, linearGain, snapSettingsSafeSeconds\)/);
  assert.match(normalizerSource, /function duckTransitionOutput\(now, shouldDuck\)/);
  assert.match(normalizerSource, /rampParamToValue\(wetGain\.gain, TRANSITION_DUCK_GAIN, TRANSITION_DUCK_RAMP_SECONDS\)/);
  assert.match(normalizerSource, /wetGain\.gain\.setTargetAtTime\(1, now \+ TRANSITION_RECOVER_DELAY_SECONDS, TRANSITION_RECOVER_TIME_CONSTANT\)/);
  assert.match(normalizerSource, /const shouldDuckTransition = processingEnabled[\s\S]*targetGainDb < currentGainDb - 1/);
  assert.match(normalizerSource, /duckTransitionOutput\(now, shouldDuckTransition\)/);
  assert.match(normalizerSource, /currentGainDb = smoothedGainDb;/);
  assert.match(normalizerSource, /const heldLinearGain = Analyser\.dbToLinear\(currentGainDb\)/);
  assert.match(normalizerSource, /const trimMeasurementDb = targetGainDb >= 24[\s\S]*Math\.min\(measuredOutputRmsDb, getEstimatedOutputRmsDb\(\)\)/);
  assert.match(normalizerSource, /if \(targetGainDb <= 0\) \{[\s\S]*resetOutputTrim\(0\.02, true\);[\s\S]*\} else \{[\s\S]*updateOutputTrim\(trimMeasurementDb, elapsedMs, targetGainDb\);/);
  assert.match(normalizerSource, /const preferEstimatedOutput = now \* 1000 < preferEstimatedOutputUntilMs;/);
  assert.match(normalizerSource, /function getTransitionOutputRmsDb\(\)/);
  assert.match(normalizerSource, /profile\.targetRmsDb - 1\.1/);
  assert.match(normalizerSource, /profile\.targetRmsDb \+ 0\.2/);
  assert.match(normalizerSource, /outputRmsDb = preferEstimatedOutput \? getTransitionOutputRmsDb\(\) : measuredOutputRmsDb;/);
  assert.doesNotMatch(normalizerSource, /const holdCorrectionDb/);
  assert.doesNotMatch(normalizerSource, /currentGainDb \+=/);
  assert.match(normalizerSource, /rampParamToValue\(outputTrimGain\.gain, 1, 0\.012\)/);
  assert.match(normalizerSource, /const levelJumped = handleLevelJump\(lastRmsDb\)/);
  assert.doesNotMatch(normalizerSource, /currentGainDb = levelJumped[\s\S]*\? targetGainDb/);
  assert.ok(
    (normalizerSource.match(/currentGainDb = smoothedGainDb/g) || []).length >= 1,
    "current gain should be smoothed both during regular audio ticks and immediate settings re-entry"
  );
  assert.match(normalizerSource, /function cancelScheduledValues\(param\)/);
  assert.match(normalizerSource, /cancelAndHoldAtTime/);
  assert.match(normalizerSource, /function rampParamToValue\(param, value, rampSeconds\)[\s\S]*cancelScheduledValues\(param\)/);
  assert.match(normalizerSource, /const snapSettingsSafeSeconds[\s\S]*SETTINGS_GAIN_RAMP_SECONDS[\s\S]*autoGainRampSeconds;[\s\S]*rampParamToValue\(autoGain\.gain, linearGain, snapSettingsSafeSeconds\)/);
  assert.match(normalizerSource, /rampParamToValue\(autoGain\.gain, heldLinearGain, AUTO_GAIN_HOLD_RAMP_SECONDS\)/);
  assert.match(normalizerSource, /report\(\(levelJumped \|\| outputWouldOvershoot\) \|\|/);
});

test("normalizer catches up weak sounds quickly enough to match louder sounds by ear", () => {
  const normalizerSource = fs.readFileSync(path.join(root, "audio", "normalizer.js"), "utf8");
  const smokeSource = fs.readFileSync(path.join(root, "tests", "browser-smoke.js"), "utf8");

  assert.match(normalizerSource, /gapDb > 24 \? 90 : currentGainDb > 12 && gapDb > 6 \? 220 : releaseMs/);
  assert.match(normalizerSource, /const safeBoostSnap = processingEnabled/);
  assert.match(normalizerSource, /targetGainDb > currentGainDb \+ 18/);
  assert.match(normalizerSource, /lastRmsDb < profile\.targetRmsDb - 18/);
  assert.match(smokeSource, /quietAfterVeryLoudSettleMs <= 1700/);
  assert.match(smokeSource, /quietAfterVeryLoudTransitionStats\.averageOutputRmsDb >= -21\.35/);
  assert.match(smokeSource, /const expectedQuietPeakDb = value\.quietAfterVeryLoudStatus\.targetRmsDb \+ 3/);
  assert.match(smokeSource, /quietPeakDeltaDb <= 1/);
});

test("normalizer de-clicks transition gain changes with short ramps", () => {
  const normalizerSource = fs.readFileSync(path.join(root, "audio", "normalizer.js"), "utf8");

  assert.match(normalizerSource, /function rampParamToValue\(param, value, rampSeconds\)/);
  assert.match(normalizerSource, /cancelScheduledValues\(param\)/);
  assert.match(normalizerSource, /if \(typeof param\.setValueAtTime === "function"\)/);
  assert.match(normalizerSource, /linearRampToValueAtTime\(value, context\.currentTime \+ rampSeconds\)/);
  assert.match(normalizerSource, /rampParamToValue\(wetGain\.gain, TRANSITION_DUCK_GAIN, TRANSITION_DUCK_RAMP_SECONDS\)/);
  assert.match(normalizerSource, /wetGain\.gain\.setTargetAtTime\(1, now \+ TRANSITION_RECOVER_DELAY_SECONDS, TRANSITION_RECOVER_TIME_CONSTANT\)/);
  assert.doesNotMatch(normalizerSource, /rampParamToValue\(wetGain\.gain, 0\.03, 0\.006\)/);
  assert.match(normalizerSource, /rampParamToValue\(autoGain\.gain, linearGain, (?:autoGainRampSeconds|snapSettingsSafeSeconds)\)/);
  assert.match(normalizerSource, /rampParamToValue\(autoGain\.gain, heldLinearGain, AUTO_GAIN_HOLD_RAMP_SECONDS\)/);
  assert.match(normalizerSource, /rampParamToValue\(outputTrimGain\.gain, 1, 0\.012\)/);
  assert.doesNotMatch(normalizerSource, /wetGain\.gain\.setValueAtTime\(0\.18, now\)/);
});

test("normalizer gates media seek discontinuities before they hit the output", () => {
  const normalizerSource = fs.readFileSync(path.join(root, "audio", "normalizer.js"), "utf8");

  assert.match(normalizerSource, /const MEDIA_SEEK_GATE_GAIN = 0\.0001;/);
  assert.match(normalizerSource, /const MEDIA_SEEK_GATE_DOWN_SECONDS = 0\.012;/);
  assert.match(normalizerSource, /const MEDIA_SEEK_GATE_UP_SECONDS = 0\.05;/);
  assert.match(normalizerSource, /let mediaSeekGate = null;/);
  assert.match(normalizerSource, /outputGain\.connect\(mediaSeekGate\);[\s\S]*mediaSeekGate\.connect\(outputAnalyser\);/);
  assert.match(normalizerSource, /function duckMediaDiscontinuity\(\)/);
  assert.match(normalizerSource, /function releaseMediaDiscontinuity\(\)/);
  assert.match(normalizerSource, /rampParamToValue\(mediaSeekGate\.gain, MEDIA_SEEK_GATE_GAIN, MEDIA_SEEK_GATE_DOWN_SECONDS\)/);
  assert.match(normalizerSource, /rampParamToValue\(mediaSeekGate\.gain, 1, MEDIA_SEEK_GATE_UP_SECONDS\)/);
  assert.match(normalizerSource, /media\.addEventListener\("loadstart", duckMediaDiscontinuity\)/);
  assert.match(normalizerSource, /media\.addEventListener\("seeking", duckMediaDiscontinuity\)/);
  assert.match(normalizerSource, /media\.addEventListener\("loadeddata", releaseMediaDiscontinuity\)/);
  assert.match(normalizerSource, /media\.addEventListener\("seeked", releaseMediaDiscontinuity\)/);
  assert.match(normalizerSource, /media\.addEventListener\("playing", releaseMediaDiscontinuity\)/);
  assert.match(normalizerSource, /media\.removeEventListener\("loadstart", duckMediaDiscontinuity\)/);
  assert.match(normalizerSource, /media\.removeEventListener\("seeking", duckMediaDiscontinuity\)/);
});

test("normalizer audio control loop keeps running when the media tab is hidden", () => {
  const normalizerSource = fs.readFileSync(path.join(root, "audio", "normalizer.js"), "utf8");

  assert.match(normalizerSource, /const CONTROL_LOOP_INTERVAL_MS = \d+;/);
  assert.match(normalizerSource, /function scheduleStep\(\)/);
  assert.match(normalizerSource, /function isDocumentHidden\(\)/);
  assert.match(normalizerSource, /function handleVisibilityChange\(\)/);
  assert.match(normalizerSource, /timerId = root\.setTimeout\(run, CONTROL_LOOP_INTERVAL_MS\);/);
  assert.match(normalizerSource, /root\.document && root\.document\.hidden/);
  assert.match(normalizerSource, /rafId = root\.requestAnimationFrame\(run\);/);
  assert.match(normalizerSource, /addEventListener\("visibilitychange", handleVisibilityChange\)/);
  assert.match(normalizerSource, /removeEventListener\("visibilitychange", handleVisibilityChange\)/);
  assert.doesNotMatch(normalizerSource, /requestAnimationFrame\(step\)/);
});

test("normalizer keeps the limiter internal audio path connected", () => {
  const normalizerSource = fs.readFileSync(path.join(root, "audio", "normalizer.js"), "utf8");

  assert.match(normalizerSource, /limiter && limiter\.output/);
  assert.doesNotMatch(normalizerSource, /limiter && limiter\.input/);
});

test("normalizer preserves limiter output after start and settings refresh", async () => {
  const context = createContext();
  const createdNodes = [];

  class FakeAudioParam {
    constructor(value = 0) {
      this.value = value;
    }

    setTargetAtTime(value) {
      this.value = value;
    }
  }

  class FakeAudioNode {
    constructor(kind) {
      this.kind = kind;
      this.connections = [];
      createdNodes.push(this);
    }

    connect(target) {
      this.connections.push(target);
      return target;
    }

    disconnect() {
      this.connections = [];
    }

    getFloatTimeDomainData(buffer) {
      buffer.fill(0.03);
    }
  }

  class FakeAudioContext {
    constructor() {
      this.currentTime = 0.1;
      this.state = "running";
      this.destination = new FakeAudioNode("destination");
    }

    createMediaElementSource() {
      return new FakeAudioNode("source");
    }

    createAnalyser() {
      return new FakeAudioNode("analyser");
    }

    createGain() {
      const node = new FakeAudioNode("gain");
      node.gain = new FakeAudioParam(1);
      return node;
    }

    createDynamicsCompressor() {
      const node = new FakeAudioNode("compressor");
      node.threshold = new FakeAudioParam();
      node.knee = new FakeAudioParam();
      node.ratio = new FakeAudioParam();
      node.attack = new FakeAudioParam();
      node.release = new FakeAudioParam();
      return node;
    }

    resume() {
      this.state = "running";
      return Promise.resolve();
    }

    close() {
      this.state = "closed";
      return Promise.resolve();
    }
  }

  context.AudioContext = FakeAudioContext;
  context.webkitAudioContext = FakeAudioContext;
  context.requestAnimationFrame = () => 1;
  context.cancelAnimationFrame = () => {};

  [
    "storage/settings.js",
    "license/capabilities.js",
    "audio/analyser.js",
    "audio/limiter.js",
    "audio/stream-status.js",
    "audio/normalizer.js"
  ].forEach((file) => loadScript(context, file));

  const WLG = context.StreamVolumeGuard;
  const settings = {
    ...WLG.Settings.DEFAULT_SETTINGS,
    enabled: true,
    limiterEnabled: true,
    compressorEnabled: true
  };
  const normalizer = WLG.Normalizer.createMediaNormalizer({ tagName: "VIDEO" }, settings, {});
  const limiterInputsWithOutput = () => createdNodes.filter((node) => {
    return node.kind === "compressor" && node.connections.some((target) => target.kind === "gain");
  });

  await normalizer.start();
  assert.equal(limiterInputsWithOutput().length, 1);

  normalizer.updateSettings({
    ...settings,
    activeProfile: "night",
    targetRmsDb: WLG.Settings.PROFILES.night.targetRmsDb
  });
  assert.equal(limiterInputsWithOutput().length, 1);

  normalizer.stop();
});

test("normalizer does not reconnect the audio graph for target-only settings changes", async () => {
  const context = createContext();
  let sourceNode = null;

  class FakeAudioParam {
    constructor(value = 0) {
      this.value = value;
    }

    setTargetAtTime(value) {
      this.value = value;
    }
  }

  class FakeAudioNode {
    constructor(kind) {
      this.kind = kind;
      this.connections = [];
      this.disconnectCount = 0;
    }

    connect(target) {
      this.connections.push(target);
      return target;
    }

    disconnect() {
      this.disconnectCount += 1;
      this.connections = [];
    }

    getFloatTimeDomainData(buffer) {
      buffer.fill(0.03);
    }
  }

  class FakeAudioContext {
    constructor() {
      this.currentTime = 0.1;
      this.state = "running";
      this.destination = new FakeAudioNode("destination");
    }

    createMediaElementSource() {
      sourceNode = new FakeAudioNode("source");
      return sourceNode;
    }

    createAnalyser() {
      return new FakeAudioNode("analyser");
    }

    createGain() {
      const node = new FakeAudioNode("gain");
      node.gain = new FakeAudioParam(1);
      return node;
    }

    createDynamicsCompressor() {
      const node = new FakeAudioNode("compressor");
      node.threshold = new FakeAudioParam();
      node.knee = new FakeAudioParam();
      node.ratio = new FakeAudioParam();
      node.attack = new FakeAudioParam();
      node.release = new FakeAudioParam();
      return node;
    }

    resume() {
      this.state = "running";
      return Promise.resolve();
    }

    close() {
      this.state = "closed";
      return Promise.resolve();
    }
  }

  context.AudioContext = FakeAudioContext;
  context.webkitAudioContext = FakeAudioContext;
  context.requestAnimationFrame = () => 1;
  context.cancelAnimationFrame = () => {};

  [
    "storage/settings.js",
    "license/capabilities.js",
    "audio/analyser.js",
    "audio/limiter.js",
    "audio/stream-status.js",
    "audio/normalizer.js"
  ].forEach((file) => loadScript(context, file));

  const WLG = context.StreamVolumeGuard;
  const settings = {
    ...WLG.Settings.DEFAULT_SETTINGS,
    enabled: true,
    limiterEnabled: true,
    compressorEnabled: true,
    targetRmsDb: -21
  };
  const normalizer = WLG.Normalizer.createMediaNormalizer({ tagName: "VIDEO" }, settings, {});

  await normalizer.start();
  const disconnectCountAfterStart = sourceNode.disconnectCount;

  normalizer.updateSettings({
    ...settings,
    targetRmsMode: "custom",
    targetRmsDb: -18
  }, { immediate: true });
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.equal(sourceNode.disconnectCount, disconnectCountAfterStart);
  normalizer.stop();
});

test("activation does not steal media audio before AudioContext is running", () => {
  const contentSource = fs.readFileSync(path.join(root, "content.js"), "utf8");
  const normalizerSource = fs.readFileSync(path.join(root, "audio", "normalizer.js"), "utf8");

  assert.match(contentSource, /async function processMedia/);
  assert.match(contentSource, /await normalizer\.start\(\)/);
  assert.match(normalizerSource, /let source = null;/);
  assert.match(normalizerSource, /async function ensureContextRunning\(\)/);
  assert.match(normalizerSource, /await ensureContextRunning\(\);[\s\S]*ensureGraphStarted\(\);/);
});

test("panic mode caps the active media pipeline", () => {
  const contentSource = fs.readFileSync(path.join(root, "content.js"), "utf8");
  const normalizerSource = fs.readFileSync(path.join(root, "audio", "normalizer.js"), "utf8");

  assert.match(contentSource, /WLG_SET_PANIC/);
  assert.match(contentSource, /normalizer\.setPanic\(state\.panicActive\)/);
  assert.match(normalizerSource, /let outputGain = null;/);
  assert.match(normalizerSource, /outputGain = context\.createGain\(\)/);
  assert.match(normalizerSource, /function setPanic\(nextActive\)/);
  assert.match(normalizerSource, /runtimeSettings\.panicGainDb/);
});

test("tab capture fallback is isolated in an offscreen document", () => {
  const manifest = readJson("manifest.json");
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");
  const offscreenHtml = fs.readFileSync(path.join(root, "offscreen", "offscreen.html"), "utf8");
  const offscreenJs = fs.readFileSync(path.join(root, "offscreen", "offscreen.js"), "utf8");

  assert.ok(Number(manifest.minimum_chrome_version) >= 116);
  assert.ok(manifest.permissions.includes("tabCapture"));
  assert.ok(manifest.permissions.includes("offscreen"));
  assert.match(backgroundSource, /chrome\.tabCapture\.getMediaStreamId/);
  assert.match(backgroundSource, /offscreen\/offscreen\.html/);
  assert.match(offscreenHtml, /offscreen\.js/);
  assert.match(offscreenJs, /chromeMediaSourceId/);
  assert.match(offscreenJs, /Normalizer\.createMediaStreamNormalizer/);
});

test("tab capture audio uses a direct MediaStream source instead of replaying raw audio", () => {
  const normalizerSource = fs.readFileSync(path.join(root, "audio", "normalizer.js"), "utf8");
  const offscreenJs = fs.readFileSync(path.join(root, "offscreen", "offscreen.js"), "utf8");

  assert.match(normalizerSource, /function createMediaStreamNormalizer\(stream, settings, hooks\)/);
  assert.match(normalizerSource, /context\.createMediaStreamSource\(stream\)/);
  assert.match(offscreenJs, /Normalizer\.createMediaStreamNormalizer\(stream, settings/);
  assert.doesNotMatch(offscreenJs, /new Audio\(\)/);
  assert.doesNotMatch(offscreenJs, /audio\.play\(\)/);
});

test("tab capture target changes apply immediately while audio is running", () => {
  const offscreenJs = fs.readFileSync(path.join(root, "offscreen", "offscreen.js"), "utf8");

  assert.match(offscreenJs, /targetRmsDb: settings\.targetRmsDb/);
  assert.match(offscreenJs, /maxBoostDb: settings\.maxBoostDb/);
  assert.match(offscreenJs, /targetRmsDb: nextState\.targetRmsDb/);
  assert.match(offscreenJs, /outputRmsDb: nextState\.outputRmsDb/);
  assert.match(offscreenJs, /capture\.normalizer\.updateSettings\(settings, \{ immediate: true \}\)/);
  assert.match(offscreenJs, /targetRmsDb: settings\.targetRmsDb[\s\S]*maxBoostDb: settings\.maxBoostDb/);
});

test("tab capture refreshes when saved options change while TikTok is playing", () => {
  const offscreenJs = fs.readFileSync(path.join(root, "offscreen", "offscreen.js"), "utf8");

  assert.match(offscreenJs, /chrome\.storage\.onChanged\.addListener/);
  assert.match(offscreenJs, /changes\[Settings\.SETTINGS_KEY\]/);
  assert.match(offscreenJs, /Settings\.getSettings\(\)\.then\(\(savedSettings\) => \{/);
  assert.match(offscreenJs, /captures\.forEach\(\(capture, tabId\) => \{/);
  assert.match(offscreenJs, /updateCaptureSettingsFromSavedSettings\(tabId, savedSettings\)/);
});

test("tab capture startup returns the live normalizer status instead of stale base status", () => {
  const offscreenJs = fs.readFileSync(path.join(root, "offscreen", "offscreen.js"), "utf8");

  assert.match(offscreenJs, /function buildNormalizerStatus\(stream, nextState, startedAt, restartCount, restartDeferred\)/);
  assert.match(offscreenJs, /await normalizer\.start\(\);[\s\S]*const startedStatus = handleNormalizerState\(tabId, stream, normalizer\.getState\(\), startedAt, restartCount\);[\s\S]*return \{ ok: true, status: startedStatus \|\| captures\.get\(tabId\)\.status \};/);
  assert.doesNotMatch(offscreenJs, /await normalizer\.start\(\);\s*postStatus\(tabId, status\);\s*return \{ ok: true, status \};/);
});

test("tab capture diagnostics distinguish startup from live silent capture", () => {
  const offscreenJs = fs.readFileSync(path.join(root, "offscreen", "offscreen.js"), "utf8");
  const popupSource = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");
  const optionsSource = fs.readFileSync(path.join(root, "options", "options.js"), "utf8");

  assert.match(offscreenJs, /const CAPTURE_NO_SIGNAL_WATCHDOG_MS = 1800;/);
  assert.match(offscreenJs, /function getCaptureSignalState\(captureHealth, nextState, startedAt\)/);
  assert.match(offscreenJs, /captureSignalState: "starting"/);
  assert.match(offscreenJs, /captureSignalState,\s*captureRestartCount: Number\(restartCount\) \|\| 0/);
  assert.match(offscreenJs, /captureSignalState === "no-signal"/);
  assert.match(offscreenJs, /Capture d'onglet active, piste audio live, mais aucun signal Web Audio detecte/);
  assert.match(offscreenJs, /const captureFallbackRecommended = captureSignalState === "no-signal"/);
  assert.match(offscreenJs, /const captureFallbackReason = captureFallbackRecommended \? "tab-capture-no-signal"/);
  assert.match(offscreenJs, /function scheduleCaptureSignalWatchdog\(tabId\)/);
  assert.match(offscreenJs, /CAPTURE_NO_SIGNAL_WATCHDOG_MS \+ 250/);
  assert.match(offscreenJs, /capture\.status\.captureSignalState !== "starting"/);
  assert.match(offscreenJs, /handleNormalizerState\(tabId, capture\.stream, capture\.normalizer\.getState\(\), capture\.startedAt, capture\.restartCount\)/);
  assert.match(popupSource, /captureSignalState:/);
  assert.match(popupSource, /fallbackRecommended:/);
  assert.match(popupSource, /fallbackReason:/);
  assert.match(popupSource, /status\.captureSignalState === "no-signal"/);
  assert.match(popupSource, /status\.captureSignalState === "unavailable"/);
  assert.match(optionsSource, /captureSignalState:/);
  assert.match(optionsSource, /fallbackRecommended:/);
  assert.match(optionsSource, /fallbackReason:/);
  assert.match(optionsSource, /reason: "tab-capture-no-signal"/);
  assert.match(optionsSource, /contextState:/);
  assert.match(optionsSource, /audioTrackCount:/);
});

test("failed media fallback publishes stopped capture fallback instead of stale live capture", () => {
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");

  assert.match(backgroundSource, /async function fallbackSilentCaptureToMedia\(tabId, status\)/);
  assert.match(backgroundSource, /function buildStoppedTabCaptureFallbackStatus\(status, overrides = \{\}\)/);
  assert.match(backgroundSource, /sourceType: incoming\.sourceType \|\| "media-html"/);
  assert.match(backgroundSource, /captureSignalState: "no-signal"/);
  assert.match(backgroundSource, /captureFallbackRecommended: true/);
  assert.match(backgroundSource, /captureFallbackReason: "tab-capture-no-signal"/);
  assert.match(backgroundSource, /contextState: ""/);
  assert.match(backgroundSource, /audioTrackCount: 0/);
  assert.match(backgroundSource, /captureTrackState: ""/);
  assert.match(backgroundSource, /captureMuted: false/);
  assert.match(backgroundSource, /await stopSilentTabCapture\(tabId\)/);
  assert.match(backgroundSource, /forwardCaptureStatusToBridge\(tabId, mediaFallbackObservation\)/);
  assert.match(backgroundSource, /return mediaFallbackObservation;/);
  assert.doesNotMatch(backgroundSource, /enabled: false,\s*sourceType: "none",\s*captureFallbackReason: "tab-audible-but-web-audio-silent"/);
});

test("capture status is forced disabled when extension-wide settings are disabled", () => {
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");

  assert.match(backgroundSource, /async function handleCaptureStatusMessage\(message\)/);
  assert.match(backgroundSource, /chrome\.runtime\.onMessage\.addListener\(\(message, sender, sendResponse\) => \{/);
  assert.match(backgroundSource, /if \(!globalSettings \|\| !globalSettings\.enabled\)/);
  assert.match(backgroundSource, /const disabledStatus = updateCaptureStatus\(\s*message\.tabId/);
  assert.match(backgroundSource, /forwardCaptureStatusToBridge\(message\.tabId, disabledStatus\)/);
  assert.match(backgroundSource, /return \{ ok: true, enabled: false \};/);
});

test("media html fallback with no processed media keeps dynamic tabs in desktop fallback", () => {
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");

  assert.match(backgroundSource, /function markMediaHtmlNoMediaAsDesktopFallback\(tab, status, globalEnabled\)/);
  assert.match(backgroundSource, /Settings\.getPreferredSourceTypeForDomain\(site\) !== "tab-capture"/);
  assert.match(backgroundSource, /Number\(status\.mediaDetected\) > 0 \|\| Number\(status\.mediaProcessed\) > 0/);
  assert.match(backgroundSource, /captureFallbackReason: "no-media-element-detected"/);
  assert.match(backgroundSource, /const shared = markMediaHtmlNoMediaAsDesktopFallback\(tab, \{/);
  assert.match(backgroundSource, /function shouldKeepDesktopFallbackAfterMediaFallback\(fallbackStatus\)/);
  assert.match(backgroundSource, /fallbackStatus\.sourceType === "media-html"/);
  assert.match(backgroundSource, /fallbackStatus\.captureFallbackRecommended/);
  assert.match(backgroundSource, /fallbackStatus\.captureFallbackReason/);
  assert.match(backgroundSource, /Number\(fallbackStatus\.mediaProcessed\) < 1/);
  assert.doesNotMatch(backgroundSource, /Number\(fallbackStatus\.mediaDetected\) > 0/);
  assert.match(backgroundSource, /if \(shouldKeepDesktopFallbackAfterMediaFallback\(fallbackStatus\)\) \{/);
  assert.match(backgroundSource, /lastError: fallbackStatus\.lastError \|\| fallbackStatus\.error \|\| "Fallback media HTML actif mais aucun media controlable. La source reste visible en observation ; fallback Windows seulement si l'app desktop est connectee."/);
});

test("popup keeps explicit desktop fallback active on explicit tab capture sites", () => {
  const popupSource = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");

  assert.match(popupSource, /function hasExplicitDesktopFallback\(status\)/);
  assert.match(popupSource, /status\.captureFallbackRecommended/);
  assert.match(popupSource, /status\.captureFallbackReason/);
  assert.match(popupSource, /status\.fallbackRecommended/);
  assert.match(popupSource, /status\.fallbackReason/);
  assert.match(popupSource, /function isActiveUncontrollableMediaFallback\(status\)/);
  assert.match(popupSource, /Number\(status\.mediaDetected\) < 1/);
  assert.match(popupSource, /Number\(status\.mediaProcessed\) < 1/);
  assert.match(popupSource, /if \(isActiveUncontrollableMediaFallback\(status\)\) return false/);
  assert.match(popupSource, /if \(hasExplicitDesktopFallback\(status\)\) return false/);
  assert.match(popupSource, /const shouldStopProtection = enabled && !requiresTabCaptureUpgrade\(status\)/);
});

test("popup presents desktop fallback as Windows control instead of incompatible source", () => {
  const popupSource = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");
  const frMessages = readJson("_locales/fr/messages.json");
  const enMessages = readJson("_locales/en/messages.json");

  assert.match(popupSource, /const desktopFallbackNeeded = needsDesktopFallback\(status\)/);
  assert.match(popupSource, /diagnosticDesktopFallbackActive/);
  assert.match(popupSource, /diagnosticDesktopFallbackDetail/);
  assert.match(popupSource, /if \(status\.lastError && !desktopFallbackNeeded\)/);
  assert.match(popupSource, /popupWindowsControl/);
  assert.equal(frMessages.diagnosticDesktopFallbackActive.message, "Controle via Windows");
  assert.equal(enMessages.diagnosticDesktopFallbackActive.message, "Windows control");
  assert.equal(
    frMessages.diagnosticDesktopFallbackDetail.message,
    "L'extension observe l'onglet, mais le son sera ajuste par le volume Windows du navigateur."
  );
  assert.equal(
    enMessages.diagnosticDesktopFallbackDetail.message,
    "The extension can observe this tab, but volume will be adjusted through the browser's Windows mixer."
  );
});

test("popup exposes one protect action while background routes to the best audio source", () => {
  const popupSource = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");
  const popupHtml = fs.readFileSync(path.join(root, "popup", "popup.html"), "utf8");
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");

  assert.match(popupHtml, /id="protectButton"/);
  assert.doesNotMatch(popupHtml, /id="captureTabButton"/);
  assert.match(popupSource, /protectButton: document\.getElementById\("protectButton"\)/);
  assert.match(popupSource, /sendRuntimeMessage\("WLG_PROTECT_CURRENT_TAB", activeTabPayload\(\)\)/);
  assert.match(popupSource, /popupProtectTab/);
  assert.match(backgroundSource, /async function protectActiveTab\(options\)/);
  assert.match(backgroundSource, /const site = await getTabSite\(tab\)/);
  assert.match(backgroundSource, /Settings\.getPreferredSourceTypeForDomain\(site\)/);
  assert.match(backgroundSource, /startTabCaptureForActiveTab\(\{ replaceMedia: true, tabId: tab\.id \}\)/);
  assert.match(backgroundSource, /WLG_PROTECT_CURRENT_TAB/);
});

test("media html activation retries content status before reporting failure", () => {
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");

  assert.match(backgroundSource, /function sendMessageWithRetry\(tabId, message/);
  assert.match(backgroundSource, /await sendMessageWithRetry\(tab\.id,\s*\{\s*type: "WLG_SET_ENABLED"/);
  assert.match(backgroundSource, /Activation impossible sur cet onglet/);
  assert.doesNotMatch(backgroundSource, /return response \|\| \{ ok: true \};/);
});

test("popup upgrades dynamic platform protection instead of stopping stale html media mode", () => {
  const popupSource = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");

  assert.match(popupSource, /function requiresTabCaptureUpgrade\(status\)/);
  assert.match(popupSource, /Settings\.getPreferredSourceTypeForDomain\(status\.site\) === "tab-capture"/);
  assert.match(popupSource, /status\.sourceType !== "tab-capture"/);
  assert.match(popupSource, /const shouldStopProtection = enabled && !requiresTabCaptureUpgrade\(status\)/);
  assert.match(popupSource, /function getProtectionStateForButton/);
  assert.match(popupSource, /const effectiveEnabled = getStatusEnabledState\(\);/);
  assert.match(popupSource, /return effectiveEnabled && !requiresTabCaptureUpgrade\(currentStatus\);/);
  assert.match(popupSource, /setEnabled\(!active\)/);
});

test("popup keeps the toggle tied to current tab protection after any in-flight action resolves", () => {
  const popupSource = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");

  assert.match(
    popupSource,
    /function getVisualEnabledState\(\)\s*\{\s*const pendingState = getPendingToggleState\(\);\s*if \(pendingState !== null\) return pendingState;\s*return getGlobalEnabledState\(\);\s*\}/s
  );
  assert.doesNotMatch(popupSource, /elements\.enabledToggle\.checked = getToggleVisualState\(\)/);
  assert.match(popupSource, /const toggleVisualState = getToggleVisualState\(\)/);
  assert.match(popupSource, /const tabProtectionActive = shouldStopProtection \|\| needsDesktopFallbackProtection/);
  assert.match(
    popupSource,
    /elements\.enabledToggle\.checked = Boolean\(toggleVisualState && \(tabProtectionActive \|\| activationPending \|\| unknownStatusWithGlobalProtection\)\)/
  );
});

test("popup keeps the activation switch visually on while an enabled tab status is still unknown", () => {
  const popupSource = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");

  assert.match(popupSource, /function isUnknownProtectionStatus\(status\)/);
  assert.match(popupSource, /const activationPending = setEnabledInProgress \|\| getPendingToggleState\(\) === true \|\| getActiveToggleIntentState\(\) === true/);
  assert.match(popupSource, /const unknownStatusWithGlobalProtection = Boolean\(currentSettings && currentSettings\.enabled\) && isUnknownProtectionStatus\(status\)/);
  assert.match(popupSource, /elements\.enabledToggle\.checked = Boolean\(toggleVisualState && \(tabProtectionActive \|\| activationPending \|\| unknownStatusWithGlobalProtection\)\)/);
});

test("popup stores a short-lived toggle intent to prevent rapid on/off bouncing", () => {
  const popupSource = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");

  assert.match(popupSource, /const TOGGLE_INTENT_KEY = "streamVolumeGuard\.extensionToggleIntent";/);
  assert.match(popupSource, /function normalizeToggleIntent\(/);
  assert.match(popupSource, /function getActiveToggleIntentState\(/);
  assert.match(popupSource, /function persistToggleIntent\(enabled\)/);
  assert.match(
    popupSource,
    /function getGlobalEnabledState\(\)[\s\S]*const observedEnabled = Boolean\(currentSettings && currentSettings\.enabled\);[\s\S]*const intentState = getActiveToggleIntentState\(\);/s
  );
  assert.match(popupSource, /const observedEnabled = Boolean\(currentSettings && currentSettings\.enabled\);/);
  assert.match(
    popupSource,
    /if \(intentState !== null\) \{\s*if \(intentState !== observedEnabled\) \{\s*clearToggleIntentState\(\);\s*return observedEnabled/s
  );
  assert.match(popupSource, /await refreshToggleIntentState\(\);/);
});

test("popup keeps standalone media html limits active without desktop fallback", () => {
  const popupSource = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");

  assert.match(popupSource, /const needsDesktopFallbackProtection = needsDesktopFallback\(status\)/);
  assert.match(popupSource, /function isDesktopBridgeConnected\(\)/);
  assert.match(popupSource, /isDesktopBridgeConnected\(\) &&\s*status &&\s*status\.enabled/s);
  assert.match(popupSource, /const desktopFallbackActive = needsDesktopFallbackProtection/);
  assert.match(popupSource, /elements\.statusBadge\.classList\.toggle\("is-on", \(shouldStopProtection \|\| desktopFallbackActive\) && !excluded\)/);
  assert.doesNotMatch(popupSource, /standaloneDesktopFallbackActive/);
  assert.doesNotMatch(popupSource, /popupWindowsControl", "Windows control"\)} \(\$\{i18n\("popupDesktopStandalone", "standalone"\)\}\)/);
});

test("standalone diagnostics keep media html limits separate from desktop fallback", () => {
  const popupSource = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");
  const optionsSource = fs.readFileSync(path.join(root, "options", "options.js"), "utf8");
  const frMessages = readJson("_locales/fr/messages.json");
  const enMessages = readJson("_locales/en/messages.json");

  assert.match(popupSource, /const desktopFallbackRecommended = Boolean\(currentDesktopLink\.connected && currentStatus && currentStatus\.captureFallbackRecommended\)/);
  assert.match(popupSource, /function isTabCaptureFallbackReason\(reason\)/);
  assert.match(popupSource, /const rawCaptureFallbackReason = getCaptureFallbackReason\(currentStatus\)/);
  assert.match(popupSource, /const rawMediaHtmlFallbackReason = getMediaHtmlFallbackReasonForDiagnostic\(currentStatus\)/);
  assert.match(popupSource, /fallbackRecommended:\s*desktopFallbackRecommended/);
  assert.match(popupSource, /fallbackReason:\s*desktopFallbackRecommended \?/);
  assert.match(popupSource, /mediaHtmlFallbackReason:\s*!currentDesktopLink\.connected \? rawMediaHtmlFallbackReason : ""/);
  assert.match(popupSource, /captureFallbackReason:\s*rawCaptureFallbackReason/);
  assert.match(popupSource, /function hasStandaloneMediaHtmlLimit\(status\)/);
  assert.match(popupSource, /!isDesktopBridgeConnected\(\) &&\s*status &&\s*status\.enabled/s);
  assert.match(popupSource, /diagnosticStandaloneMediaHtmlLimit/);
  assert.match(popupSource, /diagnosticStandaloneMediaHtmlLimitDetail/);
  assert.match(optionsSource, /const desktopFallbackRecommended = Boolean\(desktopBridge && desktopBridge\.connected && source\.captureFallbackRecommended\)/);
  assert.match(optionsSource, /function isTabCaptureFallbackReason\(reason\)/);
  assert.match(optionsSource, /const rawCaptureFallbackReason = getCaptureFallbackReason\(source\)/);
  assert.match(optionsSource, /const rawMediaHtmlFallbackReason = getMediaHtmlFallbackReasonForDiagnostic\(source\)/);
  assert.match(optionsSource, /mediaHtmlFallbackReason:\s*!desktopFallbackRecommended \? rawMediaHtmlFallbackReason : ""/);
  assert.match(optionsSource, /captureFallbackReason:\s*rawCaptureFallbackReason/);
  assert.match(optionsSource, /reason:\s*"standalone-media-html-unavailable"/);
  assert.equal(frMessages.diagnosticStandaloneMediaHtmlLimit.message, "Limite media HTML");
  assert.equal(enMessages.diagnosticStandaloneMediaHtmlLimit.message, "HTML media limit");
});

test("popup global toggle is not blocked by current tab exclusion", () => {
  const popupSource = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");

  assert.match(
    popupSource,
    /function getGlobalEnabledState\(\)\s*\{\s*const observedEnabled = Boolean\(currentSettings && currentSettings\.enabled\);\s*const intentState = getActiveToggleIntentState\(\);\s*if \(intentState !== null\)\s*\{\s*if \(intentState !== observedEnabled\)\s*\{\s*clearToggleIntentState\(\);\s*return observedEnabled;\s*\}\s*return observedEnabled;\s*\}\s*return observedEnabled;\s*\}/s
  );
  assert.match(
    popupSource,
    /if \(!storedIntent\)\s*\{\s*clearToggleIntentState\(\);\s*return;\s*\}/s
  );
});

test("popup does not show stale html media mode as fully protected on dynamic platforms", () => {
  const popupSource = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");

  assert.match(popupSource, /function getToggleVisualState/);
  assert.match(popupSource, /const toggleVisualState = getToggleVisualState\(\)/);
  assert.match(popupSource, /const tabProtectionActive = shouldStopProtection \|\| needsDesktopFallbackProtection/);
  assert.match(popupSource, /elements\.enabledToggle\.checked = Boolean\(toggleVisualState && \(tabProtectionActive \|\| activationPending \|\| unknownStatusWithGlobalProtection\)\)/);
  assert.match(popupSource, /const desktopFallbackActive = needsDesktopFallbackProtection/);
  assert.match(popupSource, /elements\.statusBadge\.classList\.toggle\("is-on", \(shouldStopProtection \|\| desktopFallbackActive\) && !excluded\)/);
  assert.match(popupSource, /statusBadgeText = i18n\("popupActive", "active"\)/);
});

test("dynamic platforms fail loudly when tab capture is unavailable", () => {
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");

  assert.match(backgroundSource, /function buildTabCaptureUnavailableStatus\(tab, reason\)/);
  assert.match(backgroundSource, /function captureSignalStateForUnavailableReason\(reason\)/);
  assert.match(backgroundSource, /return "restricted"/);
  assert.match(backgroundSource, /return "needs-user-action"/);
  assert.match(backgroundSource, /return "unsupported"/);
  assert.match(backgroundSource, /captureSignalState:\s*captureSignalStateForUnavailableReason\(fallbackReason\)/);
  assert.match(backgroundSource, /const fallbackReason = reason \|\| "tab-capture-unsupported"/);
  assert.match(backgroundSource, /captureFallbackReason:\s*fallbackReason/);
  assert.match(backgroundSource, /status:\s*"Unknown"/);
  assert.match(backgroundSource, /sourceType: "tab-capture"/);
  assert.match(backgroundSource, /captureResult = await startTabCaptureForActiveTab\(\{ replaceMedia: true, tabId: tab\.id \}\)/);
  assert.match(backgroundSource, /return fallbackTabCaptureStartToMedia\(tabWithSite, captureResult/);
  assert.match(backgroundSource, /buildTabCaptureUnavailableStatus\(tabWithSite, "tab-capture-unsupported"\)/);
});

test("explicit tab capture routing keeps html media as fallback only", () => {
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");
  const popupSource = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");

  assert.match(backgroundSource, /async function protectActiveTab\(options\)[\s\S]*captureResult = await startTabCaptureForActiveTab\(\{ replaceMedia: true, tabId: tab\.id \}\)/);
  assert.match(backgroundSource, /async function fallbackTabCaptureStartToMedia\(tab, failedStatus\)/);
  assert.match(backgroundSource, /captureFallbackReason:\s*"tab-capture-start-failed"/);
  assert.match(backgroundSource, /injectAndSet\(tab, true\)/);
  assert.match(backgroundSource, /eventName:\s*"browser\.tab_capture_start_fallback"/);
  assert.doesNotMatch(backgroundSource, /preferredSourceType === "tab-capture" && canCaptureTab\(\)/);
  assert.match(popupSource, /function requiresTabCaptureUpgrade\(status\)[\s\S]*Settings\.getPreferredSourceTypeForDomain\(status\.site\) === "tab-capture"/);
});

test("tab capture exposes audio health so TikTok no-effect reports are diagnosable", () => {
  const offscreenJs = fs.readFileSync(path.join(root, "offscreen", "offscreen.js"), "utf8");
  const popupSource = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");

  assert.match(offscreenJs, /function getCaptureHealth\(stream\)/);
  assert.match(offscreenJs, /audioTrackCount/);
  assert.match(offscreenJs, /captureTrackState/);
  assert.match(offscreenJs, /captureMuted/);
  assert.match(offscreenJs, /contextState: nextState\.contextState/);
  assert.match(popupSource, /diagnosticCaptureNoSignal/);
  assert.match(popupSource, /captureTrackState/);
  assert.match(popupSource, /contextState/);
  assert.match(popupSource, /outputRmsDb/);
});

test("tab capture respects exclusions and stops on navigation", () => {
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");

  assert.match(backgroundSource, /Settings\.isDomainExcluded\(site, savedSettings\)/);
  assert.match(backgroundSource, /excluded:\s*true/);
  assert.match(backgroundSource, /This domain is excluded from StreamVolume Guard Hub/);
  assert.match(backgroundSource, /captureStatuses\.has\(tabId\)[\s\S]*WLG_STOP_TAB_CAPTURE/);
});

test("manifest uses localized metadata and Guard Signal PNG icons", () => {
  const manifest = readJson("manifest.json");

  assert.equal(manifest.version, "0.1.38");
  assert.equal(manifest.default_locale, "en");
  assert.equal(manifest.name, "__MSG_extensionName__");
  assert.equal(manifest.description, "__MSG_extensionDescription__");
  assert.equal(manifest.action.default_title, "__MSG_extensionName__");

  ["16", "32", "48", "128"].forEach((size) => {
    const iconPath = manifest.icons[size];
    assert.equal(iconPath, `assets/icons/icon${size}.png`);
    const icon = fs.readFileSync(path.join(root, iconPath));
    assert.equal(icon.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  });
});

test("english and french locale files contain required extension messages", () => {
  const requiredKeys = [
    "extensionName",
    "extensionDescription",
    "popupSafe",
    "popupWarning",
    "popupRisky",
    "popupContainedPeaks",
    "popupDiagnostics"
  ];

  ["en", "fr"].forEach((locale) => {
    const messages = readJson(`_locales/${locale}/messages.json`);
    requiredKeys.forEach((key) => {
      assert.equal(typeof messages[key].message, "string", `${locale} should define ${key}`);
      assert.ok(messages[key].message.length > 0, `${locale}.${key} should not be empty`);
    });
  });
});

test("locale message files do not contain duplicate keys", () => {
  assertNoDuplicateJsonObjectKeys("_locales/en/messages.json");
  assertNoDuplicateJsonObjectKeys("_locales/fr/messages.json");
});

test("popup and options no longer expose a separate universal profile", () => {
  const popupSource = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");
  const optionsSource = fs.readFileSync(path.join(root, "options", "options.js"), "utf8");
  const frMessages = readJson("_locales/fr/messages.json");
  const enMessages = readJson("_locales/en/messages.json");

  assert.doesNotMatch(popupSource, /profileUniversal|universal:/);
  assert.doesNotMatch(optionsSource, /profileUniversal|universal:/);
  assert.equal(frMessages.profileUniversal, undefined);
  assert.equal(enMessages.profileUniversal, undefined);
});

test("popup profile changes switch target loudness back to profile mode", () => {
  const popupSource = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");

  assert.match(popupSource, /targetRmsMode: "profile"/);
  assert.match(popupSource, /targetRmsDb: profile\.targetRmsDb/);
});

test("options distinguish profile-driven target from custom target slider", () => {
  const optionsSource = fs.readFileSync(path.join(root, "options", "options.js"), "utf8");

  assert.match(optionsSource, /let targetRmsMode = "profile";/);
  assert.match(optionsSource, /targetRmsMode: targetRmsMode/);
  assert.match(optionsSource, /targetRmsMode = "profile";[\s\S]*syncTargetRmsControls\(profile\.targetRmsDb\);/);
  assert.match(optionsSource, /targetRmsMode = "custom";[\s\S]*syncTargetRmsControls\(elements\.targetRmsSlider\.value\);/);
  assert.match(optionsSource, /targetRmsMode = "custom";[\s\S]*syncTargetRmsControls\(elements\.targetRmsDb\.value\);/);
  assert.match(optionsSource, /Settings\.saveSettings\(\{ domainProfiles: domainProfiles, targetRmsMode: "profile" \}\)/);
});

test("popup exposes streamer safety status, contained peaks and diagnostics", () => {
  const html = fs.readFileSync(path.join(root, "popup", "popup.html"), "utf8");

  assert.match(html, /id="riskBadge"/);
  assert.match(html, /id="containedPeaksValue"/);
  assert.match(html, /id="diagnosticsList"/);
  assert.match(html, /data-i18n="popupDiagnostics"/);
});

test("popup exposes desktop bridge status while keeping standalone mode usable", () => {
  const html = fs.readFileSync(path.join(root, "popup", "popup.html"), "utf8");
  const js = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");
  const bridgeScriptIndex = html.indexOf("../bridge/client.js");
  const popupScriptIndex = html.indexOf("popup.js");

  assert.ok(bridgeScriptIndex >= 0, "popup should load the local bridge client");
  assert.ok(popupScriptIndex > bridgeScriptIndex, "bridge client should load before popup.js");
  assert.match(html, /id="desktopLinkStatus"/);
  assert.match(html, /data-i18n="popupDesktopLink"/);
  assert.match(js, /desktopLinkStatus:\s*document\.getElementById\("desktopLinkStatus"\)/);
  assert.match(js, /BridgeClient\.checkDesktopBridgeHealth/);
  assert.match(js, /desktopBridgeConnected:/);
  assert.match(js, /desktopBridgeMode:/);
  assert.match(js, /refresh\(true\)/);
  assert.match(js, /await refreshDesktopLinkStatus\(true\)/);
  assert.match(js, /diagnosticDesktopFallbackActive/);
});

test("options diagnostic exports desktop bridge state without forcing standalone fallback", () => {
  const html = fs.readFileSync(path.join(root, "options", "options.html"), "utf8");
  const js = fs.readFileSync(path.join(root, "options", "options.js"), "utf8");
  const bridgeScriptIndex = html.indexOf("../bridge/client.js");
  const optionsScriptIndex = html.indexOf("options.js");

  assert.ok(bridgeScriptIndex >= 0, "options should load the local bridge client");
  assert.ok(optionsScriptIndex > bridgeScriptIndex, "bridge client should load before options.js");
  assert.match(js, /async function getDesktopBridgeStatus\(\)/);
  assert.match(js, /BridgeClient\.checkDesktopBridgeHealth/);
  assert.match(js, /desktopBridge: desktopBridge/);
  assert.match(js, /buildDiagnosticQuality\(activeTab, desktopBridge\)/);
  assert.match(js, /reason: "standalone-media-html-unavailable"/);
  assert.match(js, /reason: "desktop-fallback-active"/);
});

test("popup copied diagnostic contains actionable local-safe fields", () => {
  const js = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");

  assert.match(js, /chrome\.runtime\.getManifest/);
  assert.match(js, /extensionVersion/);
  assert.match(js, /browserLanguage/);
  assert.match(js, /excluded:/);
  assert.match(js, /canInject:/);
  assert.match(js, /canCaptureTab:/);
  assert.match(js, /gainDb:/);
  assert.match(js, /rmsDb:/);
  assert.match(js, /outputPeakDb:/);
  assert.match(js, /peakDb:/);
  assert.match(js, /predictedPeakDb:/);
  assert.match(js, /includesFullUrl:\s*false/);
  assert.match(js, /includesPageTitle:\s*false/);
  assert.match(js, /includesAudio:\s*false/);
  assert.doesNotMatch(js, /document\.title/);
});

test("popup diagnostic copies cached state immediately and ignores repeated clicks while copying", () => {
  const js = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");

  assert.match(js, /let diagnosticCopyInProgress = false/);
  assert.match(js, /if \(diagnosticCopyInProgress\) return/);
  assert.match(js, /diagnosticCopyInProgress = true/);
  assert.match(js, /elements\.copyDiagnosticButton\.disabled = true/);
  assert.match(js, /const diagnostic = buildPopupDiagnostic\(\)/);
  assert.match(js, /await navigator\.clipboard\.writeText\(JSON\.stringify\(diagnostic, null, 2\)\)/);
  assert.doesNotMatch(js, /await refresh\(true\);[\s\S]*navigator\.clipboard\.writeText/);
  assert.match(js, /diagnosticCopyInProgress = false/);
  assert.match(js, /elements\.copyDiagnosticButton\.disabled = false/);
});

test("popup diagnostic exposes status routing errors without leaking page URL or title", () => {
  const js = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");

  assert.match(js, /function runtimeEmptyResponse\(type\)/);
  assert.match(js, /resolve\(response \|\| runtimeEmptyResponse\(type\)\)/);
  assert.doesNotMatch(js, /resolve\(response \|\| \{ ok: true \}\)/);
  assert.match(js, /statusOk: currentStatus \? currentStatus\.ok !== false : false/);
  assert.match(js, /statusError: currentStatus && currentStatus\.error \? String\(currentStatus\.error\)\.slice\(0, 300\) : ""/);
  assert.match(js, /statusRoute: currentStatus && currentStatus\.statusRoute \? String\(currentStatus\.statusRoute\)\.slice\(0, 120\) : ""/);
  assert.match(js, /diagnosticReason: currentStatus && currentStatus\.diagnosticReason \? String\(currentStatus\.diagnosticReason\)\.slice\(0, 120\) : ""/);
  assert.match(js, /popupTabIdKnown: Boolean\(activeTabContext && activeTabContext\.id\)/);
  assert.match(js, /globalEnabled: Boolean\(currentSettings && currentSettings\.enabled\)/);
  assert.match(js, /visualEnabled: Boolean\(elements\.enabledToggle && elements\.enabledToggle\.checked\)/);
  assert.match(js, /skippedAlreadyProcessed: finiteNumber\(currentStatus && currentStatus\.skippedAlreadyProcessed, 0\)/);
  assert.match(js, /canInject: hasDiagnosticBoolean\(currentStatus, "canInject"\) \? currentStatus\.canInject !== false : false/);
  assert.match(js, /function getDiagnosticLastError\(status\)/);
  assert.match(js, /message\.toLowerCase\(\)\.includes\("fallback desktop"\)/);
  assert.match(js, /lastError:\s*getDiagnosticLastError\(currentStatus\)/);
  assert.doesNotMatch(js, /url:/);
  assert.doesNotMatch(js, /title:/);
});

test("popup exposes trust badges for local open-source no-tracking adoption", () => {
  const html = fs.readFileSync(path.join(root, "popup", "popup.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "popup", "popup.css"), "utf8");
  const requiredKeys = ["trustLocalOnly", "trustOpenSource", "trustNoTracking"];

  assert.match(html, /class="trust-strip"/);
  requiredKeys.forEach((key) => {
    assert.match(html, new RegExp(`data-i18n="${key}"`), `popup should expose ${key}`);
  });
  assert.match(css, /\.trust-strip/);
  assert.match(css, /\.trust-strip\s*{[\s\S]*display:\s*flex;/);
  assert.match(css, /\.trust-strip\s*{[\s\S]*justify-content:\s*center;/);
  assert.match(css, /\.trust-strip\s*{[\s\S]*width:\s*fit-content;/);
  assert.match(css, /\.trust-strip\s*{[\s\S]*margin:\s*0 auto;/);
  assert.match(css, /\.trust-strip span\s*{[\s\S]*width:\s*fit-content;/);
  assert.match(css, /\.trust-strip span\s*{[\s\S]*min-width:\s*82px;/);

  ["en", "fr"].forEach((locale) => {
    const messages = readJson(`_locales/${locale}/messages.json`);
    requiredKeys.forEach((key) => {
      assert.equal(typeof messages[key].message, "string", `${locale} should define ${key}`);
      assert.ok(messages[key].message.length > 4, `${locale}.${key} should not be empty`);
    });
  });
  assert.equal(readJson("_locales/fr/messages.json").trustLocalOnly.message, "Local");
  assert.equal(readJson("_locales/en/messages.json").trustLocalOnly.message, "Local");
});

test("popup and options avoid innerHTML for safer public builds", () => {
  const popupJs = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");
  const optionsJs = fs.readFileSync(path.join(root, "options", "options.js"), "utf8");

  assert.doesNotMatch(popupJs, /\.innerHTML\s*=/);
  assert.doesNotMatch(optionsJs, /\.innerHTML\s*=/);
  assert.match(popupJs, /replaceChildren/);
  assert.match(optionsJs, /replaceChildren/);
});

test("popup and options expose localized help buttons for each important option", () => {
  const popupHtml = fs.readFileSync(path.join(root, "popup", "popup.html"), "utf8");
  const popupCss = fs.readFileSync(path.join(root, "popup", "popup.css"), "utf8");
  const popupJs = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");
  const optionsHtml = fs.readFileSync(path.join(root, "options", "options.html"), "utf8");
  const optionsCss = fs.readFileSync(path.join(root, "options", "options.css"), "utf8");
  const optionsJs = fs.readFileSync(path.join(root, "options", "options.js"), "utf8");
  const requiredPopupHelp = [
    "helpStreamStatus",
    "helpContainedPeaks",
    "helpGain",
    "helpRms",
    "helpMedia",
    "helpDiagnostics",
    "helpAutoDomain"
  ];
  const requiredOptionsHelp = [
    "helpTargetRms",
    "helpMaxBoost",
    "helpMaxReduction",
    "helpCompressor",
    "helpLimiter",
    "helpAutoDomains",
    "helpExcludedDomains",
    "helpCapabilities"
  ];
  const removedObviousHelp = [
    "helpNormalization",
    "helpProfile",
    "helpActivateTab",
    "helpOptions",
    "helpOptionsProfile",
    "helpEnabled"
  ];

  requiredPopupHelp.forEach((key) => {
    assert.match(popupHtml, new RegExp(`data-help-i18n="${key}"`), `popup should expose ${key}`);
  });
  requiredOptionsHelp.forEach((key) => {
    assert.match(optionsHtml, new RegExp(`data-help-i18n="${key}"`), `options should expose ${key}`);
  });
  removedObviousHelp.forEach((key) => {
    assert.doesNotMatch(popupHtml, new RegExp(`data-help-i18n="${key}"`), `popup should not expose obvious help ${key}`);
    assert.doesNotMatch(optionsHtml, new RegExp(`data-help-i18n="${key}"`), `options should not expose obvious help ${key}`);
  });
  assert.match(popupCss, /\.help-button[\s\S]*top:\s*6px;[\s\S]*left:\s*6px;/);
  assert.match(optionsCss, /\.help-button[\s\S]*top:\s*6px;[\s\S]*left:\s*6px;/);
  assert.doesNotMatch(popupJs, /setAttribute\("title"/);
  assert.doesNotMatch(optionsJs, /setAttribute\("title"/);

  ["en", "fr"].forEach((locale) => {
    const messages = readJson(`_locales/${locale}/messages.json`);
    [...requiredPopupHelp, ...requiredOptionsHelp].forEach((key) => {
      assert.equal(typeof messages[key].message, "string", `${locale} should define ${key}`);
      assert.ok(messages[key].message.length > 12, `${locale}.${key} should explain the option`);
    });
  });
});

test("popup layout stays compact enough to avoid extension popup scrolling", () => {
  const popupCss = fs.readFileSync(path.join(root, "popup", "popup.css"), "utf8");

  assert.match(popupCss, /body\s*{[\s\S]*width:\s*340px;/);
  assert.match(popupCss, /main\s*{[\s\S]*gap:\s*7px;[\s\S]*padding:\s*8px 10px 10px;/);
  assert.match(popupCss, /\.actions\s*{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/);
  assert.doesNotMatch(popupCss, /padding:\s*24px/);
  assert.doesNotMatch(popupCss, /padding-top:\s*22px/);
});

test("help tooltips render above inactive question mark buttons", () => {
  const popupCss = fs.readFileSync(path.join(root, "popup", "popup.css"), "utf8");
  const optionsCss = fs.readFileSync(path.join(root, "options", "options.css"), "utf8");

  assert.match(popupCss, /\.help-button\s*{[\s\S]*z-index:\s*1;/);
  assert.match(popupCss, /\.help-button::after\s*{[\s\S]*z-index:\s*2;/);
  assert.doesNotMatch(popupCss, /\.help-button\s*{[\s\S]*z-index:\s*10;/);
  assert.match(popupCss, /\.help-button:hover,\s*\.help-button:focus-visible\s*{[\s\S]*z-index:\s*30;/);
  assert.match(optionsCss, /\.help-button\s*{[\s\S]*z-index:\s*1;/);
  assert.match(optionsCss, /\.help-button:hover\s*{[\s\S]*z-index:\s*30;/);
  assert.match(optionsCss, /\.options-help-tooltip\s*{[\s\S]*z-index:\s*1000;/);
  assert.doesNotMatch(optionsCss, /\.help-button::after/);
});

test("options help tooltip hitbox stays limited to the question mark button", () => {
  const optionsCss = fs.readFileSync(path.join(root, "options", "options.css"), "utf8");
  const optionsJs = fs.readFileSync(path.join(root, "options", "options.js"), "utf8");

  assert.match(optionsCss, /\.options-help-tooltip\s*{[\s\S]*pointer-events:\s*none;/);
  assert.match(optionsCss, /\.options-help-tooltip\.is-visible\s*{[\s\S]*display:\s*block;/);
  assert.match(optionsJs, /function setupHelpTooltips\(\)/);
  assert.match(optionsJs, /button\.addEventListener\("mouseenter"/);
  assert.match(optionsJs, /button\.addEventListener\("mouseleave", hideTooltip\)/);
  assert.doesNotMatch(optionsCss, /\.help-button:focus-visible::after/);
  assert.doesNotMatch(optionsCss, /\.help-button:hover::after/);
  assert.doesNotMatch(optionsCss, /\.option-field:hover\s+\.help-button::after/);
  assert.doesNotMatch(optionsCss, /\.help-anchor:hover\s+\.help-button::after/);
});

test("popup right-column help tooltips stay inside the popup frame", () => {
  const popupCss = fs.readFileSync(path.join(root, "popup", "popup.css"), "utf8");

  assert.match(
    popupCss,
    /\.stream-status\s+\.help-anchor:nth-child\(2\)\s+\.help-button::after,\s*\.metrics\s+\.help-anchor:nth-child\(n \+ 2\)\s+\.help-button::after\s*{[\s\S]*left:\s*50%;[\s\S]*right:\s*auto;[\s\S]*transform:\s*translate\(-50%,\s*-2px\);/
  );
  assert.match(
    popupCss,
    /\.stream-status\s+\.help-anchor:nth-child\(2\)\s+\.help-button:hover::after,[\s\S]*\.metrics\s+\.help-anchor:nth-child\(n \+ 2\)\s+\.help-button:focus-visible::after\s*{[\s\S]*transform:\s*translate\(-50%,\s*0\);/
  );
  assert.doesNotMatch(popupCss, /\.stream-status div:last-child \.help-button::after/);
});

test("options page keeps inline warning badges without a redundant streamer alert panel", () => {
  const html = fs.readFileSync(path.join(root, "options", "options.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "options", "options.css"), "utf8");
  const js = fs.readFileSync(path.join(root, "options", "options.js"), "utf8");

  assert.match(html, /class="options-logo"/);
  assert.doesNotMatch(html, /warningsList/);
  assert.doesNotMatch(html, /warnings-panel/);
  assert.doesNotMatch(html, /Alertes streamer/);
  assert.match(html, /data-warning-for="targetRmsDb"/);
  assert.match(html, /data-warning-for="maxBoostDb"/);
  assert.match(html, /id="maxBoostDb" type="number" min="0" max="48" step="1"/);
  assert.match(html, /data-warning-for="compressorEnabled"/);
  assert.match(html, /data-warning-for="limiterEnabled"/);
  assert.match(html, /data-warning-for="excludedDomains"/);
  assert.match(css, /\.warning-badge/);
  assert.match(css, /\.warning-badge\.is-active/);
  assert.match(css, /\.warning-badge::after/);
  assert.match(css, /\.panel/);
  assert.match(js, /function getOptionWarnings/);
  assert.match(js, /const warningText = warning \? i18n\(warning\.key, warning\.key\) : "";/);
  assert.match(js, /badge\.dataset\.warningText = warningText;/);
  assert.doesNotMatch(js, /warningsList/);
  assert.match(js, /targetRmsDb >= -16/);
  assert.match(js, /maxBoostDb > 12/);
  assert.match(js, /limiterEnabled === false/);
});


test("options capability labels are localized and future-only items stay planned", () => {
  const optionsJs = fs.readFileSync(path.join(root, "options", "options.js"), "utf8");
  const requiredKeys = [
    "capabilitySafetyLimiter",
    "capabilityPerDomainProfiles",
    "capabilityTabCaptureFallback",
    "capabilityPanicMode",
    "capabilityDiagnosticCopy",
    "capabilityGuidedObsCalibration",
    "capabilityAdvancedLimiter",
    "capabilitySettingsSync",
    "capabilityAdvancedShortcuts",
    "capabilityActive",
    "capabilityLocked"
  ];

  assert.match(optionsJs, /guidedObsCalibration/);
  assert.equal(optionsJs.includes('["obsCalibration"'), false);
  assert.doesNotMatch(optionsJs, /"actif"s*:s*"verrouill/);

  ["en", "fr"].forEach((locale) => {
    const messages = readJson(`_locales/${locale}/messages.json`);
    requiredKeys.forEach((key) => {
      assert.equal(typeof messages[key].message, "string", `${locale} should define ${key}`);
      assert.ok(messages[key].message.length > 0, `${locale}.${key} should not be empty`);
    });
  });
});

test("options expose platform profiles with resettable local overrides", () => {
  const html = fs.readFileSync(path.join(root, "options", "options.html"), "utf8");
  const js = fs.readFileSync(path.join(root, "options", "options.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "options", "options.css"), "utf8");
  const requiredKeys = [
    "platformProfilesTitle",
    "platformProfilesDescription",
    "platformProfileRecommended",
    "platformProfileCustomized",
    "platformProfileReset",
    "platformProfileApplied"
  ];

  assert.match(html, /id="platformProfilesList"/);
  assert.match(html, /data-i18n="platformProfilesTitle"/);
  assert.match(html, /data-i18n="platformProfilesDescription"/);
  assert.match(js, /function renderPlatformProfiles/);
  assert.match(js, /Settings\.PLATFORM_PROFILE_RULES/);
  assert.match(js, /domainProfiles/);
  assert.match(js, /data-platform-domain/);
  assert.match(js, /platformProfileReset/);
  assert.match(js, /Settings\.saveSettings\(\{ domainProfiles:/);
  assert.match(css, /\.platform-profiles/);
  assert.match(css, /\.platform-profile-card/);

  ["en", "fr"].forEach((locale) => {
    const messages = readJson(`_locales/${locale}/messages.json`);
    requiredKeys.forEach((key) => {
      assert.equal(typeof messages[key].message, "string", `${locale} should define ${key}`);
      assert.ok(messages[key].message.length > 0, `${locale}.${key} should not be empty`);
    });
  });
});

test("options expose a target loudness slider with local audio preview", () => {
  const html = fs.readFileSync(path.join(root, "options", "options.html"), "utf8");
  const js = fs.readFileSync(path.join(root, "options", "options.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "options", "options.css"), "utf8");
  const requiredKeys = [
    "targetVolumeTitle",
    "targetVolumeDescription",
    "targetVolumeQuiet",
    "targetVolumeLoud",
    "targetVolumePlay",
    "targetVolumeStop",
    "targetVolumePreviewNote"
  ];

  assert.match(html, /id="targetRmsSlider"/);
  assert.match(html, /id="targetRmsSlider" type="range" min="-48" max="-15" step="0\.5"/);
  assert.match(html, /id="targetRmsDb" type="number" min="-48" max="-15" step="0\.5" inputmode="decimal"/);
  assert.match(html, /id="targetRmsDisplay"/);
  assert.match(html, /id="playTargetPreviewButton"/);
  assert.match(html, /id="stopTargetPreviewButton"/);
  assert.match(html, /id="applySettingsButton"/);
  assert.match(html, /Appliquer les réglages/);
  assert.match(html, /data-i18n="targetVolumeTitle"/);
  assert.match(js, /function syncTargetRmsControls/);
  assert.match(js, /Math\.max\(-48, Math\.min\(-15, number\)\)/);
  assert.match(js, /function startTargetPreview/);
  assert.match(js, /function stopTargetPreview/);
  assert.match(js, /createOscillator/);
  assert.match(js, /createGain/);
  assert.match(js, /targetRmsSlider\.addEventListener\("input"/);
  assert.match(js, /targetRmsDb\.addEventListener\("input"/);
  assert.match(js, /function refreshOpenTabs/);
  assert.match(js, /Settings\.saveSettings\(nextSettings\)/);
  assert.match(js, /WLG_REFRESH_ACTIVE_TAB/);
  assert.doesNotMatch(js, /saveLive/);
  assert.doesNotMatch(js, /scheduleTargetRmsSave/);
  assert.doesNotMatch(js, /flushTargetRmsSave/);
  assert.doesNotMatch(js, /Settings\.saveSettings\(\{ targetRmsDb/);
  assert.match(css, /\.target-volume-panel/);
  assert.match(css, /\.target-volume-slider/);

  ["en", "fr"].forEach((locale) => {
    const messages = readJson(`_locales/${locale}/messages.json`);
    requiredKeys.forEach((key) => {
      assert.equal(typeof messages[key].message, "string", `${locale} should define ${key}`);
      assert.ok(messages[key].message.length > 0, `${locale}.${key} should not be empty`);
    });
  });
});

test("options page keeps visible guidance and no stale required controls", () => {
  const html = fs.readFileSync(path.join(root, "options", "options.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "options", "options.css"), "utf8");
  const js = fs.readFileSync(path.join(root, "options", "options.js"), "utf8");
  const descriptionKeys = [
    "optionsProfileDescription",
    "optionsTargetDescription",
    "optionsBoostDescription",
    "optionsReductionDescription",
    "optionsAutoDomainsDescription",
    "optionsExcludedDomainsDescription",
    "optionsCapabilitiesDescription"
  ];

  descriptionKeys.forEach((key) => {
    assert.match(html, new RegExp(`data-i18n="${key}"`), `options should show ${key}`);
  });

  ["en", "fr"].forEach((locale) => {
    const messages = readJson(`_locales/${locale}/messages.json`);
    descriptionKeys.forEach((key) => {
      assert.equal(typeof messages[key].message, "string", `${locale} should define ${key}`);
      assert.ok(messages[key].message.length > 12, `${locale}.${key} should describe the setting`);
    });
  });

  assert.match(css, /\.field-description/);
  assert.doesNotMatch(js, /copyBugReportButton/);
  assert.doesNotMatch(js, /copyBugReportTemplate/);
  assert.doesNotMatch(js, /playCalibrationTone/);
});

test("options page uses a streamer dashboard layout", () => {
  const html = fs.readFileSync(path.join(root, "options", "options.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "options", "options.css"), "utf8");

  assert.match(html, /class="settings-overview"/);
  assert.match(html, /class="options-layout"/);
  assert.match(html, /class="primary-stack"/);
  assert.match(html, /class="sidebar-stack"/);
  assert.match(html, /class="panel audio-panel"/);
  assert.match(html, /class="panel trust-panel"/);
  assert.match(html, /class="trust-list"/);
  assert.match(css, /\.settings-overview/);
  assert.match(css, /\.options-layout/);
  assert.match(css, /\.sidebar-stack/);
  assert.match(css, /\.audio-grid/);
  assert.match(css, /\.trust-panel/);
  assert.doesNotMatch(css, /\.sidebar-stack\s*{[\s\S]*position:\s*sticky/);
  assert.match(css, /#153243 92px/);
  assert.match(css, /#eef4f6 92px/);
});

test("options expose a local diagnostic export without sensitive page data", () => {
  const html = fs.readFileSync(path.join(root, "options", "options.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "options", "options.css"), "utf8");
  const js = fs.readFileSync(path.join(root, "options", "options.js"), "utf8");

  assert.match(html, /class="panel diagnostics-export"/);
  assert.match(html, /id="exportDiagnosticsButton"/);
  assert.match(html, /data-i18n="optionsDiagnosticsExport"/);
  assert.match(css, /\.diagnostics-export/);
  assert.match(css, /\.diagnostic-actions/);
  assert.match(js, /function buildDiagnosticReport/);
  assert.match(js, /function safeStatus/);
  assert.match(js, /chrome\.runtime\.getManifest/);
  assert.match(js, /WLG_GET_ACTIVE_STATUS/);
  assert.match(js, /URL\.createObjectURL/);
  assert.match(js, /download = `streamvolume-guard-diagnostic-/);
  assert.match(js, /includesFullUrl:\s*false/);
  assert.match(js, /includesPageTitle:\s*false/);
  assert.match(js, /outputPeakDb:/);
  assert.doesNotMatch(js, /document\.title/);
  assert.doesNotMatch(js, /tab\.url/);
  assert.doesNotMatch(js, /status\.url/);
});

test("english and french locale files contain dynamic warning messages", () => {
  const requiredKeys = [
    "warningTargetHot",
    "warningBoostHigh",
    "warningCompressorOff",
    "warningLimiterOff",
    "warningExcludedDomains"
  ];

  ["en", "fr"].forEach((locale) => {
    const messages = readJson(`_locales/${locale}/messages.json`);
    requiredKeys.forEach((key) => {
      assert.equal(typeof messages[key].message, "string", `${locale} should define ${key}`);
      assert.ok(messages[key].message.length > 8, `${locale}.${key} should be descriptive`);
    });
  });
});

test("english and french locale files contain diagnostic export messages", () => {
  const requiredKeys = [
    "optionsDiagnosticsTitle",
    "optionsDiagnosticsPrivacy",
    "optionsDiagnosticsDescription",
    "optionsDiagnosticsExport"
  ];

  ["en", "fr"].forEach((locale) => {
    const messages = readJson(`_locales/${locale}/messages.json`);
    requiredKeys.forEach((key) => {
      assert.equal(typeof messages[key].message, "string", `${locale} should define ${key}`);
      assert.ok(messages[key].message.length > 6, `${locale}.${key} should be descriptive`);
    });
  });
});

test("public docs expose privacy policy and release packaging", () => {
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  const testerChecklist = fs.readFileSync(path.join(root, "docs", "tester-checklist.md"), "utf8");
  const privacy = fs.readFileSync(path.join(root, "docs", "privacy-policy.md"), "utf8");
  const packageRelease = fs.readFileSync(path.join(root, "tools", "package-release.js"), "utf8");

  assert.match(readme, /docs\/privacy-policy\.md/);
  assert.doesNotMatch(readme, /Universel/);
  assert.match(readme, /YouTube, Twitch, TikTok, Kick, Spotify web et Deezer web/);
  assert.match(readme, /node tools\/package-release\.js/);
  assert.match(testerChecklist, /Moyenne RMS traitée/);
  assert.match(testerChecklist, /Peak OBS estimé/);
  assert.match(privacy, /Aucun enregistrement audio/);
  assert.match(privacy, /aucune telemetrie automatique/i);
  assert.match(packageRelease, /release-assets/);
  assert.match(packageRelease, /Compress-Archive/);
  assert.match(packageRelease, /projectEntries/);
});

test("public docs do not advertise removed options controls", () => {
  const docs = [
    "README.md",
    "docs/tester-checklist.md"
  ].map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");

  assert.doesNotMatch(docs, /Copier le rapport de bug/);
  assert.doesNotMatch(docs, /modèle de rapport de bug depuis les Options/);
  assert.doesNotMatch(docs, /sons de calibration OBS : faible, normal, fort et .* fort/);
  assert.doesNotMatch(docs, /Sons de test faible, normal, fort et .* fort dans les Options/);
});

test("local bridge client sends browser_source_observed only to localhost", () => {
  const bridgeSource = fs.readFileSync(path.join(root, "bridge", "client.js"), "utf8");

  assert.match(bridgeSource, /LOCAL_BRIDGE_ENDPOINT\s*=\s*"http:\/\/127\.0\.0\.1:47841\/browser-source"/);
  assert.match(bridgeSource, /browser_source_observed/);
  assert.match(bridgeSource, /BrowserExtension/);
  assert.match(bridgeSource, /BrowserGain/);
  assert.match(bridgeSource, /ObserveOnly/);
  assert.match(bridgeSource, /isControllable/);
  assert.match(bridgeSource, /targetRmsDb:\s*clampOptionalTargetDb\(status\.targetRmsDb\)/);
  assert.match(bridgeSource, /targetProfile:\s*sanitizeText\(status\.targetProfile,\s*""\)/);
  assert.match(bridgeSource, /captureSignalState:\s*sanitizeText\(status\.captureSignalState,\s*""\)/);
  assert.match(bridgeSource, /sendBrowserSourceObserved/);
  assert.match(bridgeSource, /detectBrowserProcess/);
  assert.match(bridgeSource, /navigator\.brave/);
  assert.match(bridgeSource, /navigator\.userAgent/);
  assert.doesNotMatch(bridgeSource, /location\.href/);
  assert.doesNotMatch(bridgeSource, /tab\.url/);
});

test("local bridge client can read the desktop global target", () => {
  const bridgeSource = fs.readFileSync(path.join(root, "bridge", "client.js"), "utf8");

  assert.match(bridgeSource, /LOCAL_GLOBAL_TARGET_ENDPOINT\s*=\s*"http:\/\/127\.0\.0\.1:47841\/global-target"/);
  assert.match(bridgeSource, /fetchGlobalTargetState/);
  assert.match(bridgeSource, /global_target_state/);
  assert.match(bridgeSource, /targetRmsDb/);
  assert.match(bridgeSource, /targetProfile/);
});

test("local bridge client can check desktop health without taking control", () => {
  const bridgeSource = fs.readFileSync(path.join(root, "bridge", "client.js"), "utf8");

  assert.match(bridgeSource, /LOCAL_HEALTH_ENDPOINT\s*=\s*"http:\/\/127\.0\.0\.1:47841\/health"/);
  assert.match(bridgeSource, /const LOCAL_FETCH_TIMEOUT_MS = 650/);
  assert.match(bridgeSource, /function fetchWithLocalTimeout\(endpoint, options\)/);
  assert.match(bridgeSource, /new AbortController\(\)/);
  assert.match(bridgeSource, /async function checkDesktopBridgeHealth\(\)/);
  assert.match(bridgeSource, /fetchWithLocalTimeout\(LOCAL_HEALTH_ENDPOINT/);
  assert.match(bridgeSource, /connected:\s*true/);
  assert.match(bridgeSource, /mode:\s*"desktop"/);
  assert.match(bridgeSource, /mode:\s*"standalone"/);
  assert.match(bridgeSource, /checkDesktopBridgeHealth/);
});

test("local bridge client sends privacy-safe extension logs only to localhost", () => {
  const bridgeSource = fs.readFileSync(path.join(root, "bridge", "client.js"), "utf8");

  assert.match(bridgeSource, /LOCAL_EXTENSION_LOG_ENDPOINT\s*=\s*"http:\/\/127\.0\.0\.1:47841\/extension-log"/);
  assert.match(bridgeSource, /buildExtensionLogMessage/);
  assert.match(bridgeSource, /sendExtensionLog/);
  assert.match(bridgeSource, /extension_log/);
  assert.match(bridgeSource, /redactUrlLikeText/);
  assert.doesNotMatch(bridgeSource, /location\.href/);
  assert.doesNotMatch(bridgeSource, /tab\.url/);
});

test("settings can apply desktop global target without replacing local storage source", () => {
  const settingsSource = fs.readFileSync(path.join(root, "storage", "settings.js"), "utf8");

  assert.match(settingsSource, /targetRmsMode:\s*"desktop"/);
  assert.match(settingsSource, /function applyGlobalTarget/);
  assert.match(settingsSource, /desktopTargetProfile/);
  assert.match(settingsSource, /desktopTargetSource/);
  assert.match(settingsSource, /targetRmsDb:\s*targetRmsDb/);
});

test("background passes desktop global target into active tab settings", () => {
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");

  assert.match(backgroundSource, /getSettingsWithGlobalTarget/);
  assert.match(backgroundSource, /BridgeClient\.fetchGlobalTargetState/);
  assert.match(backgroundSource, /Settings\.applyGlobalTarget/);
  assert.match(backgroundSource, /type:\s*"WLG_SET_ENABLED"[\s\S]*settings/);
  assert.match(backgroundSource, /type:\s*"WLG_REFRESH_SETTINGS"[\s\S]*settings/);
  assert.match(backgroundSource, /WLG_UPDATE_CAPTURE_SETTINGS"[\s\S]*settings/);
});

test("background syncs changed desktop target while sources are live", () => {
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");

  assert.match(backgroundSource, /GLOBAL_TARGET_SYNC_INTERVAL_MS/);
  assert.match(backgroundSource, /lastGlobalTargetSignature/);
  assert.match(backgroundSource, /function getGlobalTargetSignature/);
  assert.match(backgroundSource, /function maybeSyncGlobalTargetForOpenTabs/);
  assert.match(backgroundSource, /BridgeClient\.fetchGlobalTargetState/);
  assert.match(backgroundSource, /Settings\.applyGlobalTarget/);
  assert.match(backgroundSource, /refreshOpenTabs\(syncedSettings\)/);
  assert.match(backgroundSource, /async function forwardBrowserSourceStatus[\s\S]*maybeSyncGlobalTargetForOpenTabs\(\)/);
  assert.match(backgroundSource, /async function forwardCaptureStatusToBridge[\s\S]*maybeSyncGlobalTargetForOpenTabs\(\)/);
});

test("content accepts effective settings supplied by the background", () => {
  const contentSource = fs.readFileSync(path.join(root, "content.js"), "utf8");

  assert.match(contentSource, /options\s*&&\s*options\.settings/);
  assert.match(contentSource, /message\.settings/);
  assert.match(contentSource, /setEnabled\(Boolean\(message\.enabled\), message\.mode, message\.settings\)/);
});

test("content forwards sanitized browser source status to background", () => {
  const contentSource = fs.readFileSync(path.join(root, "content.js"), "utf8");

  assert.match(contentSource, /WLG_BROWSER_SOURCE_STATUS/);
  assert.match(contentSource, /chrome\.runtime\.sendMessage/);
  assert.match(contentSource, /siteName:\s*state\.site/);
  assert.match(contentSource, /targetRmsDb:\s*state\.targetRmsDb/);
  assert.match(contentSource, /targetProfile:\s*settings\.desktopTargetProfile\s*\|\|\s*state\.activeProfile/);
  assert.match(contentSource, /function getBrowserControlSurface\(\)/);
  assert.match(contentSource, /SourceState\.classifyBrowserStatus\(source\)/);
  assert.match(contentSource, /browserState:\s*classification\.browserState/);
  assert.match(contentSource, /reason:\s*classification\.reason/);
  assert.match(contentSource, /recommendedAction:\s*classification\.recommendedAction/);
  assert.match(contentSource, /isControllable:\s*classification\.isControllable/);
  assert.match(contentSource, /calibrationState:\s*state\.calibrationState/);
  assert.match(contentSource, /measuredRmsDb:\s*state\.measuredRmsDb/);
  assert.match(contentSource, /appliedGainDb:\s*state\.appliedGainDb/);
  assert.doesNotMatch(contentSource, /location\.href/);
});

test("content marks enabled media-html with no controllable media as desktop fallback", () => {
  const contentSource = fs.readFileSync(path.join(root, "content.js"), "utf8");
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");
  const popupSource = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");
  const optionsSource = fs.readFileSync(path.join(root, "options", "options.js"), "utf8");

  assert.match(contentSource, /const MEDIA_HTML_SIGNAL_TIMEOUT_MS = 2500/);
  assert.match(contentSource, /let mediaHtmlSignalWatchTimer = null/);
  assert.match(contentSource, /function hasUsableMediaHtmlSignal\(\)/);
  assert.match(contentSource, /function resetMediaHtmlSignalWatch\(\)/);
  assert.match(contentSource, /function scheduleMediaHtmlSignalWatchExpiry\(\)/);
  assert.match(contentSource, /root\.setTimeout\(\(\) => \{[\s\S]*scanMedia\(\);[\s\S]*MEDIA_HTML_SIGNAL_TIMEOUT_MS \+ 100/);
  assert.match(contentSource, /function getMediaHtmlFallbackReason\(\)/);
  assert.match(contentSource, /function isMediaHtmlPipelineReady\(\)/);
  assert.match(contentSource, /if \(!isEffectivelyEnabled\(\)\) return ""/);
  assert.match(contentSource, /if \(Number\(state\.mediaDetected\) < 1\) return isMediaHtmlSignalWatchExpired\(\) \? "no-media-element-detected" : ""/);
  assert.match(contentSource, /if \(Number\(state\.mediaProcessed\) < 1\) return isMediaHtmlSignalWatchExpired\(\) \? "no-controllable-media-detected" : ""/);
  assert.match(contentSource, /return "media-html-no-usable-signal"/);
  assert.match(contentSource, /hasUsableMediaHtmlSignal\(\)/);
  assert.match(contentSource, /getBrowserClassification\(\)\.controlSurface/);
  assert.match(contentSource, /SourceState\.classifyBrowserStatus\(source\)/);
  assert.match(contentSource, /captureFallbackRecommended:\s*Boolean\(fallbackReason\)/);
  assert.match(contentSource, /captureFallbackReason:\s*fallbackReason/);
  assert.match(contentSource, /status:\s*classification\.status/);
  assert.match(contentSource, /controlSurface:\s*classification\.controlSurface/);
  assert.match(contentSource, /isControllable:\s*classification\.isControllable/);
  assert.match(backgroundSource, /function markMediaHtmlNoMediaAsDesktopFallback\(tab, status, globalEnabled\)/);
  assert.match(backgroundSource, /if \(!status \|\| !globalEnabled \|\| status\.sourceType !== "media-html"\) return status/);
  assert.match(backgroundSource, /enabled:\s*true/);
  assert.match(backgroundSource, /captureFallbackReason:\s*"no-media-element-detected"/);
  assert.match(popupSource, /fallbackReason:\s*desktopFallbackRecommended \? rawMediaHtmlFallbackReason : ""/);
  assert.match(popupSource, /mediaHtmlFallbackReason:\s*!currentDesktopLink\.connected \? rawMediaHtmlFallbackReason : ""/);
  assert.match(popupSource, /captureFallbackReason:\s*rawCaptureFallbackReason/);
  assert.match(optionsSource, /fallbackReason:\s*desktopFallbackRecommended \? rawFallbackReason : ""/);
  assert.match(optionsSource, /mediaHtmlFallbackReason:\s*!desktopFallbackRecommended \? rawMediaHtmlFallbackReason : ""/);
  assert.match(optionsSource, /captureFallbackReason:\s*rawCaptureFallbackReason/);
});

test("background keeps tab audible metadata on media-html diagnostics", () => {
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");

  assert.match(backgroundSource, /tabAudible:\s*Boolean\(tab && tab\.audible\)/);
  assert.match(backgroundSource, /tabActive:\s*Boolean\(tab && tab\.active\)/);
});

test("normalizer uses browser gain calibration instead of chasing browser sources forever", () => {
  const normalizerSource = fs.readFileSync(path.join(root, "audio", "normalizer.js"), "utf8");
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");
  const offscreenHtml = fs.readFileSync(path.join(root, "offscreen", "offscreen.html"), "utf8");

  assert.match(backgroundSource, /"audio\/browser-gain-calibration\.js"/);
  assert.match(offscreenHtml, /audio\/browser-gain-calibration\.js/);
  assert.match(normalizerSource, /BrowserGainCalibration\.createBrowserGainCalibration/);
  assert.match(normalizerSource, /onCalibrationEvent/);
  assert.match(normalizerSource, /calibration\.gainDb/);
});

test("browser gain calibration window is desktop-only", () => {
  const normalizerSource = fs.readFileSync(path.join(root, "audio", "normalizer.js"), "utf8");
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");

  assert.match(normalizerSource, /const DESKTOP_BROWSER_GAIN_MEASUREMENT_WINDOW_MS = 18000/);
  assert.doesNotMatch(normalizerSource, /STANDALONE_BROWSER_GAIN_MEASUREMENT_WINDOW_MS/);
  assert.match(normalizerSource, /function getBrowserGainCalibrationOptions\(sourceSettings\)/);
  assert.match(normalizerSource, /sourceSettings && sourceSettings\.desktopBridgeConnected/);
  assert.match(normalizerSource, /function createBrowserGainCalibrationForSettings\(sourceSettings\)/);
  assert.match(normalizerSource, /BrowserGainCalibration\.createBrowserGainCalibration\(getBrowserGainCalibrationOptions\(sourceSettings\)\)/);
  assert.match(normalizerSource, /refreshBrowserGainCalibrationForSettings\(runtimeSettings\)/);
  assert.match(backgroundSource, /function withDesktopBridgeCalibrationMode\(settings, bridgeConnected\)/);
  assert.match(backgroundSource, /desktopBridgeConnected:\s*Boolean\(bridgeConnected\)/);
  assert.match(backgroundSource, /browserGainMeasurementWindowMs:\s*bridgeConnected \? 18000 : 0/);
  assert.match(backgroundSource, /WLG\.BridgeClient\.checkDesktopBridgeHealth/);
});

test("standalone extension keeps direct target gain while desktop mode uses browser gain calibration", () => {
  const normalizerSource = fs.readFileSync(path.join(root, "audio", "normalizer.js"), "utf8");
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");

  assert.match(normalizerSource, /function shouldUseBrowserGainCalibration\(sourceSettings\)/);
  assert.match(normalizerSource, /return Boolean\(sourceSettings && sourceSettings\.desktopBridgeConnected\)/);
  assert.match(normalizerSource, /shouldUseBrowserGainCalibration\(runtimeSettings\)[\s\S]*BrowserGainCalibration\.createBrowserGainCalibration/);
  assert.match(normalizerSource, /const targetGainDb = processingEnabled\s*\?\s*\(calibration \? calibration\.gainDb : dynamicTargetGainDb\)/);
  assert.match(backgroundSource, /hasDesktopBridgeForSilentMediaUpgrade\(\)/);
  assert.match(backgroundSource, /if \(!bridgeConnected && !allowsStandaloneSilentMediaUpgrade\(status\)\) \{\s*silentMediaUpgradeCandidates\.delete\(tab\.id\);\s*return;\s*\}/);
  assert.match(backgroundSource, /function allowsStandaloneSilentMediaUpgrade\(status\)/);
});

test("background forwards browser source status to local bridge client", () => {
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");

  assert.match(backgroundSource, /bridge\/client\.js/);
  assert.match(backgroundSource, /WLG_BROWSER_SOURCE_STATUS/);
  assert.match(backgroundSource, /BridgeClient\.sendBrowserSourceObserved/);
  assert.match(backgroundSource, /browserProcess:\s*source\.browserProcess\s*\|\|\s*""/);
  assert.match(backgroundSource, /targetRmsDb:\s*source\.targetRmsDb/);
  assert.match(backgroundSource, /targetProfile:\s*source\.targetProfile\s*\|\|\s*source\.activeProfile\s*\|\|\s*""/);
  assert.match(backgroundSource, /calibrationState:\s*source\.calibrationState/);
  assert.match(backgroundSource, /appliedGainDb:\s*source\.appliedGainDb/);
});

test("background forwards tab capture status to local bridge client", () => {
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");

  assert.match(backgroundSource, /WLG_CAPTURE_STATUS/);
  assert.match(backgroundSource, /forwardCaptureStatusToBridge/);
  assert.match(backgroundSource, /sourceId:\s*`tab-capture:\$\{normalizedTabId \|\| "unknown"\}`/);
  assert.match(backgroundSource, /targetRmsDb:\s*source\.targetRmsDb/);
  assert.match(backgroundSource, /targetProfile:\s*source\.targetProfile\s*\|\|\s*source\.activeProfile\s*\|\|\s*""/);
  assert.match(backgroundSource, /classification = classifyBrowserStatus\(\{[\s\S]*sourceType:\s*"tab-capture"[\s\S]*captureSignalState/s);
  assert.match(backgroundSource, /controlSurface:\s*classification\.controlSurface/);
  assert.match(backgroundSource, /browserState:\s*classification\.browserState/);
  assert.match(backgroundSource, /captureSignalState:\s*captureSignalState/);
  assert.match(backgroundSource, /BridgeClient\.sendBrowserSourceObserved\(message\)/);
});

test("background forwards useful extension log events to local bridge client", () => {
  const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");

  assert.match(backgroundSource, /forwardExtensionLogToBridge/);
  assert.match(backgroundSource, /BridgeClient\.sendExtensionLog/);
  assert.match(backgroundSource, /browser\.target\.synced/);
  assert.match(backgroundSource, /tabcapture\.status/);
  assert.match(backgroundSource, /WLG_EXTENSION_LOG/);
  assert.match(backgroundSource, /browser\.gain\.applied/);
  assert.match(backgroundSource, /captureSignalState:\s*source\.captureSignalState/);
});

test("manifest allows localhost bridge without broad host access", () => {
  const manifest = readJson("manifest.json");

  assert.deepEqual(manifest.host_permissions, [
    "http://127.0.0.1/*",
    "http://localhost/*"
  ]);
  assert.deepEqual(manifest.optional_host_permissions, ["<all_urls>"]);
});
runTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

