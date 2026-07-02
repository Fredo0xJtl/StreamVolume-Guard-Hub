// Local capability gate kept small so advanced features can be locked later.
(function initCapabilities(root) {
  const WLG = root.StreamVolumeGuard = root.StreamVolumeGuard || {};

  const FREE_FEATURES = new Set([
    "enableNormalization",
    "targetVolume",
    "activeTabProcessing",
    "localSettings",
    "safetyLimiter",
    "domainExclusions",
    "optionalDomainActivation",
    "perDomainProfiles",
    "tabCaptureFallback",
    "panicMode",
    "diagnosticCopy"
  ]);

  const ADVANCED_FEATURES = new Set([
    "guidedObsCalibration",
    "advancedLimiter",
    "streamerMode",
    "settingsSync",
    "advancedShortcuts"
  ]);

  let localLicenseState = {
    tier: "free",
    source: "local",
    checkedAt: null
  };

  function getLicenseState() {
    return { ...localLicenseState };
  }

  function setLocalLicenseState(nextState) {
    localLicenseState = {
      ...localLicenseState,
      ...nextState,
      checkedAt: new Date().toISOString()
    };
    return getLicenseState();
  }

  function canUseFeature(featureName) {
    if (FREE_FEATURES.has(featureName)) return true;
    if (!ADVANCED_FEATURES.has(featureName)) return false;
    return localLicenseState.tier === "advanced";
  }

  WLG.Capabilities = {
    FREE_FEATURES: Array.from(FREE_FEATURES),
    ADVANCED_FEATURES: Array.from(ADVANCED_FEATURES),
    getLicenseState,
    setLocalLicenseState,
    canUseFeature
  };
})(globalThis);
