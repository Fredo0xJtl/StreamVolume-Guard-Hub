(function initBrowserGainCalibration(root) {
  const WLG = root.StreamVolumeGuard = root.StreamVolumeGuard || {};
  const Analyser = WLG.Analyser || {
    MIN_DB: -120,
    clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }
  };

  const DEFAULT_MEASUREMENT_WINDOW_MS = 12000;
  const DEFAULT_MIN_USABLE_SIGNAL_MS = 5000;
  const DEFAULT_SILENCE_REARM_MS = 2500;
  const DEFAULT_SIGNAL_FLOOR_DB = -100;
  const DEFAULT_SAFETY_ATTENUATION_THRESHOLD_DB = 6;
  const DEFAULT_DURABLE_LEVEL_SHIFT_MS = 9000;
  const DEFAULT_DURABLE_LEVEL_SHIFT_DB = 8;

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clampGainDb(value, maxReductionDb, maxBoostDb) {
    return Analyser.clamp(
      finiteNumber(value, 0),
      finiteNumber(maxReductionDb, -24),
      finiteNumber(maxBoostDb, 48)
    );
  }

  function isUsableSignal(rmsDb, signalFloorDb) {
    const value = finiteNumber(rmsDb, Analyser.MIN_DB);
    return value > signalFloorDb;
  }

  function median(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) {
      return sorted[middle];
    }
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function roundDb(value) {
    return Number(finiteNumber(value, 0).toFixed(2));
  }

  function createBrowserGainCalibration(options) {
    const settings = options && typeof options === "object" ? options : {};
    const measurementWindowMs = Math.max(1000, finiteNumber(settings.measurementWindowMs, DEFAULT_MEASUREMENT_WINDOW_MS));
    const minUsableSignalMs = Math.max(0, finiteNumber(settings.minUsableSignalMs, DEFAULT_MIN_USABLE_SIGNAL_MS));
    const silenceRearmMs = Math.max(500, finiteNumber(settings.silenceRearmMs, DEFAULT_SILENCE_REARM_MS));
    const signalFloorDb = finiteNumber(settings.signalFloorDb, DEFAULT_SIGNAL_FLOOR_DB);
    const safetyAttenuationThresholdDb = Math.max(0, finiteNumber(settings.safetyAttenuationThresholdDb, DEFAULT_SAFETY_ATTENUATION_THRESHOLD_DB));
    const durableLevelShiftMs = Math.max(1000, finiteNumber(settings.durableLevelShiftMs, DEFAULT_DURABLE_LEVEL_SHIFT_MS));
    const durableLevelShiftDb = Math.max(1, finiteNumber(settings.durableLevelShiftDb, DEFAULT_DURABLE_LEVEL_SHIFT_DB));

    let state = "idle";
    let activeSourceKey = "";
    let activeTargetSignature = "";
    let startedAtMs = 0;
    let lastUpdateAtMs = 0;
    let previousHadSignal = false;
    let usefulSignalMs = 0;
    let samples = [];
    let measuredRmsDb = null;
    let appliedGainDb = 0;
    let safetyGainDb = 0;
    let safetyEventSent = false;
    let reason = "";
    let measurementReason = "";
    let silenceStartedAtMs = null;
    let levelShiftStartedAtMs = null;

    function currentResult(events) {
      return {
        calibrationState: state === "idle" ? "measuring" : state,
        gainDb: state === "locked" ? appliedGainDb : safetyGainDb,
        measuredRmsDb,
        appliedGainDb: state === "locked" ? appliedGainDb : null,
        calibrationReason: reason,
        events: events || []
      };
    }

    function buildEvent(eventName, extra) {
      return {
        eventName,
        calibrationState: state === "idle" ? "measuring" : state,
        measuredRmsDb,
        appliedGainDb: state === "locked" ? appliedGainDb : null,
        reason,
        ...(extra || {})
      };
    }

    function computeSafetyGainDb(input) {
      const rmsDb = finiteNumber(input.rmsDb, Analyser.MIN_DB);
      const targetRmsDb = finiteNumber(input.targetRmsDb, -21);
      if (rmsDb <= targetRmsDb + safetyAttenuationThresholdDb) {
        return 0;
      }

      return roundDb(Analyser.clamp(
        targetRmsDb - rmsDb,
        finiteNumber(input.maxReductionDb, -24),
        0
      ));
    }

    function updateSafetyAttenuation(input, hasSignal, events) {
      if (state !== "measuring" || !hasSignal) {
        safetyGainDb = 0;
        if (state === "measuring" && reason === "safety-attenuation") {
          reason = measurementReason || "window-started";
        }
        return;
      }

      safetyGainDb = computeSafetyGainDb(input);
      if (safetyGainDb < 0) {
        reason = "safety-attenuation";
        if (!safetyEventSent) {
          events.push(buildEvent("browser.gain.applied", { appliedGainDb: safetyGainDb }));
          safetyEventSent = true;
        }
        return;
      }

      if (reason === "safety-attenuation") {
        reason = measurementReason || "window-started";
      }
    }

    function recordMeasurementProgress(nowMs, hasSignal, rmsDb) {
      const elapsedMs = Math.max(0, nowMs - lastUpdateAtMs);
      if (previousHadSignal) {
        usefulSignalMs += elapsedMs;
      }
      if (hasSignal) {
        samples.push(finiteNumber(rmsDb, Analyser.MIN_DB));
      }
      previousHadSignal = hasSignal;
      lastUpdateAtMs = nowMs;
    }

    function startMeasurement(input, eventName, nextReason) {
      const nowMs = finiteNumber(input.nowMs, Date.now());
      const hasSignal = isUsableSignal(input.rmsDb, signalFloorDb);
      state = "measuring";
      activeSourceKey = input.sourceKey || "browser-source";
      activeTargetSignature = input.targetSignature || String(input.targetRmsDb || "");
      startedAtMs = nowMs;
      lastUpdateAtMs = nowMs;
      previousHadSignal = hasSignal;
      usefulSignalMs = 0;
      samples = [];
      measuredRmsDb = null;
      appliedGainDb = 0;
      safetyGainDb = 0;
      safetyEventSent = false;
      reason = nextReason || "window-started";
      measurementReason = reason;
      silenceStartedAtMs = null;
      levelShiftStartedAtMs = null;

      if (hasSignal) {
        samples.push(finiteNumber(input.rmsDb, Analyser.MIN_DB));
      }

      const events = [buildEvent(eventName || "browser.calibration.started")];
      updateSafetyAttenuation(input, hasSignal, events);
      return currentResult(events);
    }

    function retuneLockedTarget(input, targetSignature) {
      activeTargetSignature = targetSignature;
      appliedGainDb = roundDb(clampGainDb(
        finiteNumber(input.targetRmsDb, -21) - measuredRmsDb,
        input.maxReductionDb,
        input.maxBoostDb
      ));
      safetyGainDb = 0;
      reason = "target-changed";
      measurementReason = "";
      silenceStartedAtMs = null;
      levelShiftStartedAtMs = null;

      return currentResult([
        buildEvent("browser.gain.rearmed"),
        buildEvent("browser.gain.applied", { appliedGainDb }),
        buildEvent("browser.gain.locked")
      ]);
    }

    function update(input) {
      const sample = input && typeof input === "object" ? input : {};
      const nowMs = finiteNumber(sample.nowMs, Date.now());
      const sourceKey = sample.sourceKey || "browser-source";
      const targetSignature = sample.targetSignature || String(sample.targetRmsDb || "");
      const enabled = sample.enabled !== false;

      if (!enabled) {
        if (state === "skipped" && reason === "disabled") {
          return currentResult([]);
        }
        state = "skipped";
        reason = "disabled";
        measurementReason = "";
        safetyGainDb = 0;
        silenceStartedAtMs = null;
        levelShiftStartedAtMs = null;
        return currentResult([buildEvent("browser.gain.skipped")]);
      }

      if (state === "skipped" && reason === "disabled") {
        return startMeasurement({ ...sample, sourceKey, targetSignature, nowMs }, "browser.gain.rearmed", "enabled");
      }

      if (state === "idle") {
        return startMeasurement({ ...sample, sourceKey, targetSignature, nowMs }, "browser.calibration.started", "window-started");
      }

      if (activeSourceKey && activeSourceKey !== sourceKey) {
        return startMeasurement({ ...sample, sourceKey, targetSignature, nowMs }, "browser.gain.rearmed", "source-changed");
      }

      if (activeTargetSignature && activeTargetSignature !== targetSignature) {
        if (state === "locked" && measuredRmsDb !== null) {
          return retuneLockedTarget(sample, targetSignature);
        }

        return startMeasurement({ ...sample, sourceKey, targetSignature, nowMs }, "browser.gain.rearmed", "target-changed");
      }

      const hasSignal = isUsableSignal(sample.rmsDb, signalFloorDb);

      if (state === "locked") {
        if (hasSignal) {
          silenceStartedAtMs = null;
          const levelShiftDb = measuredRmsDb === null
            ? 0
            : Math.abs(finiteNumber(sample.rmsDb, measuredRmsDb) - measuredRmsDb);
          if (levelShiftDb >= durableLevelShiftDb) {
            levelShiftStartedAtMs = levelShiftStartedAtMs ?? nowMs;
            if (nowMs - levelShiftStartedAtMs >= durableLevelShiftMs) {
              return startMeasurement({ ...sample, sourceKey, targetSignature, nowMs }, "browser.gain.rearmed", "durable-level-shift");
            }
          } else {
            levelShiftStartedAtMs = null;
          }
          return currentResult([]);
        }

        silenceStartedAtMs = silenceStartedAtMs ?? nowMs;
        levelShiftStartedAtMs = null;
        if (nowMs - silenceStartedAtMs >= silenceRearmMs) {
          return startMeasurement({ ...sample, sourceKey, targetSignature, nowMs }, "browser.gain.rearmed", "silence");
        }

        return currentResult([]);
      }

      if (state === "skipped") {
        safetyGainDb = 0;
        if (hasSignal) {
          return startMeasurement({ ...sample, sourceKey, targetSignature, nowMs }, "browser.gain.rearmed", "source-reappeared");
        }
        return currentResult([]);
      }

      const events = [];
      recordMeasurementProgress(nowMs, hasSignal, sample.rmsDb);
      updateSafetyAttenuation(sample, hasSignal, events);

      if (nowMs - startedAtMs < measurementWindowMs) {
        return currentResult(events);
      }

      const measured = median(samples);
      if (measured === null || usefulSignalMs < minUsableSignalMs) {
        state = "skipped";
        reason = measured === null ? "no-usable-signal" : "insufficient-signal";
        measurementReason = "";
        safetyGainDb = 0;
        return currentResult([buildEvent("browser.gain.skipped")]);
      }

      measuredRmsDb = roundDb(measured);
      appliedGainDb = roundDb(clampGainDb(
        finiteNumber(sample.targetRmsDb, -21) - measuredRmsDb,
        sample.maxReductionDb,
        sample.maxBoostDb
      ));
      state = "locked";
      reason = "stable-window-complete";
      measurementReason = "";
      safetyGainDb = 0;
      levelShiftStartedAtMs = null;

      return currentResult([
        buildEvent("browser.calibration.measured", { measuredRmsDb }),
        buildEvent("browser.gain.applied", { appliedGainDb }),
        buildEvent("browser.gain.locked")
      ]);
    }

    return { update };
  }

  WLG.BrowserGainCalibration = {
    createBrowserGainCalibration
  };
})(globalThis);
