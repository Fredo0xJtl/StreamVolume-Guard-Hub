const assert = require("node:assert/strict");
const path = require("node:path");

const protocol = require(path.resolve(__dirname, "..", "index.js"));

function validMessage(overrides = {}) {
  return {
    type: "browser_source_observed",
    browserProcess: "Chrome",
    sourceId: "tab-42:media-1",
    tabId: 42,
    siteName: "YouTube",
    title: "Music stream",
    currentLevel: 0.72,
    appliedGain: 0.83,
    status: "Risky",
    lastSeen: "2026-07-01T18:00:00.000Z",
    origin: "BrowserExtension",
    controlSurface: "BrowserGain",
    ...overrides
  };
}

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}: ${error.message}`);
    process.exitCode = 1;
  }
}

test("normalizes a browser source message with explicit control surface", () => {
  const result = protocol.normalizeBrowserSourceMessage(validMessage());

  assert.equal(result.type, "browser_source_observed");
  assert.equal(result.origin, "BrowserExtension");
  assert.equal(result.controlSurface, "BrowserGain");
  assert.equal(result.canControl, true);
  assert.equal(result.isControllable, true);
  assert.equal(result.currentLevel, 0.72);
  assert.equal(result.appliedGain, 0.83);
});

test("marks observed-only browser source as not directly controllable", () => {
  const result = protocol.normalizeBrowserSourceMessage(validMessage({ controlSurface: "ObserveOnly" }));

  assert.equal(result.canControl, false);
  assert.equal(result.isControllable, false);
  assert.equal(result.controlSurface, "ObserveOnly");
});

test("rejects missing source id", () => {
  assert.throws(
    () => protocol.normalizeBrowserSourceMessage(validMessage({ sourceId: "" })),
    /sourceId is required/
  );
});

test("rejects invalid origin", () => {
  assert.throws(
    () => protocol.normalizeBrowserSourceMessage(validMessage({ origin: "Cloud" })),
    /invalid origin/
  );
});

test("rejects invalid control surface", () => {
  assert.throws(
    () => protocol.normalizeBrowserSourceMessage(validMessage({ controlSurface: "Magic" })),
    /invalid controlSurface/
  );
});

test("clamps levels and gain into safe scalar ranges", () => {
  const result = protocol.normalizeBrowserSourceMessage(validMessage({ currentLevel: 3, appliedGain: -4 }));

  assert.equal(result.currentLevel, 1);
  assert.equal(result.appliedGain, 0);
});

test("normalizes browser source target metadata from desktop", () => {
  const result = protocol.normalizeBrowserSourceMessage(validMessage({
    targetRmsDb: -18,
    targetProfile: "Standard"
  }));

  assert.equal(result.targetRmsDb, -18);
  assert.equal(result.targetProfile, "Standard");
});

test("normalizes browser gain calibration metadata", () => {
  const result = protocol.normalizeBrowserSourceMessage(validMessage({
    calibrationState: "locked",
    measuredRmsDb: -27.25,
    appliedGainDb: 6.25,
    calibrationReason: "window-complete"
  }));

  assert.equal(result.calibrationState, "locked");
  assert.equal(result.measuredRmsDb, -27.25);
  assert.equal(result.appliedGainDb, 6.25);
  assert.equal(result.calibrationReason, "window-complete");
});


test("normalizes browser source recovery diagnostics", () => {
  const result = protocol.normalizeBrowserSourceMessage(validMessage({
    controlSurface: "ObserveOnly",
    captureSignalState: "no-signal",
    calibrationState: "skipped",
    calibrationReason: "tab-capture-no-signal",
    browserState: "tab-capture-no-signal",
    reason: "tab-capture-no-signal",
    recommendedAction: "Source observee seulement ; securiser dans OBS."
  }));

  assert.equal(result.controlSurface, "ObserveOnly");
  assert.equal(result.isControllable, false);
  assert.equal(result.captureSignalState, "no-signal");
  assert.equal(result.calibrationState, "skipped");
  assert.equal(result.calibrationReason, "tab-capture-no-signal");
  assert.equal(result.browserState, "tab-capture-no-signal");
  assert.equal(result.reason, "tab-capture-no-signal");
  assert.equal(result.recommendedAction, "Source observee seulement ; securiser dans OBS.");
});

test("drops invalid browser source state without rejecting the source", () => {
  const result = protocol.normalizeBrowserSourceMessage(validMessage({
    browserState: "magic",
    reason: "bad https://example.test/private",
    recommendedAction: "open https://example.test/private"
  }));

  assert.equal(result.browserState, "");
  assert.equal(result.reason, "bad [redacted-url]");
  assert.equal(result.recommendedAction, "open [redacted-url]");
});
test("normalizes a desktop global target state", () => {
  const result = protocol.normalizeGlobalTargetState({
    type: "global_target_state",
    source: "Desktop",
    targetProfile: "Fort",
    targetDecibels: -15,
    targetRmsDb: -15,
    updatedAt: "2026-07-02T12:00:00.000Z"
  });

  assert.equal(result.type, "global_target_state");
  assert.equal(result.source, "Desktop");
  assert.equal(result.targetProfile, "Fort");
  assert.equal(result.targetDecibels, -15);
  assert.equal(result.targetRmsDb, -15);
  assert.equal(result.updatedAt, "2026-07-02T12:00:00.000Z");
});

test("clamps global target state to the simple desktop range", () => {
  const result = protocol.normalizeGlobalTargetState({
    type: "global_target_state",
    targetProfile: "Unknown",
    targetRmsDb: -8
  });

  assert.equal(result.targetProfile, "Personnalise");
  assert.equal(result.targetRmsDb, -15);
});

test("normalizes a privacy-safe extension log message", () => {
  const result = protocol.normalizeExtensionLogMessage({
    type: "extension_log",
    eventName: "tabcapture.no_signal",
    message: "No signal on https://www.tiktok.com/@secret/video/123",
    severity: "warn",
    browserProcess: "Brave",
    siteName: "TikTok",
    sourceId: "tab-capture:42",
    tabId: 42,
    status: "Unknown",
    controlSurface: "ObserveOnly",
    captureSignalState: "no-signal",
    targetRmsDb: -18,
    targetProfile: "Standard",
    origin: "BrowserExtension",
    lastSeen: "2026-07-02T18:00:00.000Z"
  });

  assert.equal(result.type, "extension_log");
  assert.equal(result.origin, "BrowserExtension");
  assert.equal(result.eventName, "tabcapture.no_signal");
  assert.equal(result.message, "No signal on [redacted-url]");
  assert.equal(result.severity, "warn");
  assert.equal(result.siteName, "TikTok");
  assert.equal(result.controlSurface, "ObserveOnly");
  assert.equal(result.captureSignalState, "no-signal");
  assert.equal(result.targetRmsDb, -18);
  assert.equal(result.lastSeen, "2026-07-02T18:00:00.000Z");
});

test("rejects extension log messages with the wrong origin", () => {
  assert.throws(
    () => protocol.normalizeExtensionLogMessage({
      type: "extension_log",
      eventName: "browser.target.synced",
      message: "target synced",
      origin: "WindowsSession"
    }),
    /invalid origin/
  );
});
