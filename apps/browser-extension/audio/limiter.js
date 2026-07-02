(function initLimiter(root) {
  const WLG = root.StreamVolumeGuard = root.StreamVolumeGuard || {};
  const Analyser = WLG.Analyser;

  const DEFAULT_CEILING_DB = -1;

  function computeLimiterGain(inputPeakDb, ceilingDb) {
    const ceiling = Number.isFinite(Number(ceilingDb)) ? Number(ceilingDb) : DEFAULT_CEILING_DB;
    const peak = Number.isFinite(Number(inputPeakDb)) ? Number(inputPeakDb) : ceiling;
    if (peak <= ceiling) return 1;
    return Math.min(1, Analyser.dbToLinear(ceiling - peak));
  }

  function createSafetyLimiter(context, ceilingDb) {
    const ceiling = Number.isFinite(Number(ceilingDb)) ? Number(ceilingDb) : DEFAULT_CEILING_DB;
    const limiter = context.createDynamicsCompressor();
    const ceilingGain = context.createGain();

    // This is a safety limiter, not a mastering limiter. It catches obvious peaks
    // while keeping the MVP lightweight and easy to audit.
    limiter.threshold.value = ceiling;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.08;
    ceilingGain.gain.value = 1;

    limiter.connect(ceilingGain);

    return {
      input: limiter,
      output: ceilingGain,
      limiter,
      ceilingGain,
      ceilingDb: ceiling
    };
  }

  WLG.Limiter = {
    DEFAULT_CEILING_DB,
    computeLimiterGain,
    createSafetyLimiter
  };
})(globalThis);
