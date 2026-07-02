(function initStreamStatus(root) {
  const WLG = root.StreamVolumeGuard = root.StreamVolumeGuard || {};
  const Analyser = WLG.Analyser;

  const WARNING_PEAK_MARGIN_DB = 3;
  const RISK_INPUT_PEAK_MARGIN_DB = 1;
  const WARNING_RMS_MARGIN_DB = 3;
  const RISK_RMS_MARGIN_DB = 7;
  const RISK_HOLD_MS = 1000;

  function finiteDb(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function classifyRisk(input) {
    const options = input || {};
    const ceilingDb = finiteDb(options.ceilingDb, -1);
    const peakDb = finiteDb(options.peakDb, Analyser.MIN_DB);
    const predictedPeakDb = finiteDb(options.predictedPeakDb, Analyser.MIN_DB);
    const rmsDb = finiteDb(options.rmsDb, Analyser.MIN_DB);
    const targetRmsDb = finiteDb(options.targetRmsDb, -18);

    if (peakDb >= ceilingDb - RISK_INPUT_PEAK_MARGIN_DB) {
      return { level: "risky", reason: "incoming-peak" };
    }

    if (predictedPeakDb >= ceilingDb || rmsDb >= targetRmsDb + RISK_RMS_MARGIN_DB) {
      return { level: "risky", reason: "peak" };
    }

    if (
      predictedPeakDb >= ceilingDb - WARNING_PEAK_MARGIN_DB ||
      rmsDb >= targetRmsDb + WARNING_RMS_MARGIN_DB
    ) {
      return { level: "warning", reason: "near-limit" };
    }

    return { level: "safe", reason: "stable" };
  }

  function nextRiskState(input) {
    const options = input || {};
    const nowMs = Math.max(0, finiteDb(options.nowMs, 0));
    const previousRiskUntilMs = Math.max(0, finiteDb(options.previousRiskUntilMs, 0));
    const risk = classifyRisk(options);

    if (risk.level === "risky") {
      return {
        ...risk,
        riskUntilMs: nowMs + RISK_HOLD_MS
      };
    }

    if (nowMs < previousRiskUntilMs) {
      return {
        level: "risky",
        reason: "held-risk",
        riskUntilMs: previousRiskUntilMs
      };
    }

    return {
      ...risk,
      riskUntilMs: previousRiskUntilMs
    };
  }

  function shouldCountContainedPeak(input) {
    const options = input || {};
    const ceilingDb = finiteDb(options.ceilingDb, -1);
    const predictedPeakDb = finiteDb(options.predictedPeakDb, Analyser.MIN_DB);
    return predictedPeakDb >= ceilingDb;
  }

  WLG.StreamStatus = {
    classifyRisk,
    nextRiskState,
    shouldCountContainedPeak
  };
})(globalThis);
