// Shared RMS and peak helpers for the Web Audio pipeline.
(function initAnalyser(root) {
  const WLG = root.StreamVolumeGuard = root.StreamVolumeGuard || {};

  const MIN_DB = -120;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function dbToLinear(db) {
    return Math.pow(10, db / 20);
  }

  function linearToDb(value) {
    if (!Number.isFinite(value) || value <= 0) return MIN_DB;
    return Math.max(MIN_DB, 20 * Math.log10(value));
  }

  function calculateRms(samples) {
    if (!samples || samples.length === 0) return 0;

    let sumSquares = 0;
    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index];
      sumSquares += sample * sample;
    }

    return Math.sqrt(sumSquares / samples.length);
  }

  function calculatePeak(samples) {
    if (!samples || samples.length === 0) return 0;

    let peak = 0;
    for (let index = 0; index < samples.length; index += 1) {
      peak = Math.max(peak, Math.abs(samples[index]));
    }
    return peak;
  }

  function calculateRmsDb(samples) {
    return linearToDb(calculateRms(samples));
  }

  function calculatePeakDb(samples) {
    return linearToDb(calculatePeak(samples));
  }

  function getAnalyserRmsDb(analyserNode, buffer) {
    analyserNode.getFloatTimeDomainData(buffer);
    return calculateRmsDb(buffer);
  }

  function createAnalyserNode(context, fftSize) {
    const analyser = context.createAnalyser();
    analyser.fftSize = fftSize || 2048;
    analyser.smoothingTimeConstant = 0.7;
    return analyser;
  }

  WLG.Analyser = {
    MIN_DB,
    clamp,
    dbToLinear,
    linearToDb,
    calculateRms,
    calculatePeak,
    calculateRmsDb,
    calculatePeakDb,
    getAnalyserRmsDb,
    createAnalyserNode
  };
})(globalThis);
