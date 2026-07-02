// Content script: detects media elements once and attaches the normalizer.
(function initContent(root) {
  const WLG = root.StreamVolumeGuard = root.StreamVolumeGuard || {};

  if (WLG.Content && WLG.Content.loaded) {
    WLG.Content.rescan();
    return;
  }

  const Settings = WLG.Settings;
  const Normalizer = WLG.Normalizer;
  const Analyser = WLG.Analyser;

  const BYPASS_ATTR = "streamVolumeGuardBypass";
  const PROCESSED_ATTR = "streamVolumeGuardProcessed";
  const ERROR_ATTR = "streamVolumeGuardError";
  const normalizers = new Map();
  const processingMedia = new Set();
  const SETTINGS_UPDATE_DEBOUNCE_MS = 1200;
  const BRIDGE_STATUS_DEBOUNCE_MS = 1000;

  let settings = Settings.normalizeSettings();
  let observer = null;
  let scanTimer = null;
  let settingsUpdateTimer = null;
  let pendingSettingsUpdate = null;
  let bridgeStatusTimer = null;
  let lastSettingsJson = "";

  const state = {
    ok: true,
    installed: true,
    enabled: false,
    mode: "manual",
    sourceType: "media-html",
    panicActive: false,
    site: Settings.normalizeDomain(root.location.hostname),
    activeProfile: settings.activeProfile,
    excluded: false,
    mediaDetected: 0,
    mediaProcessed: 0,
    skippedAlreadyProcessed: 0,
    gainDb: 0,
    targetRmsDb: settings.targetRmsDb,
    maxBoostDb: settings.maxBoostDb,
    rmsDb: Analyser.MIN_DB,
    outputRmsDb: Analyser.MIN_DB,
    outputPeakDb: Analyser.MIN_DB,
    peakDb: Analyser.MIN_DB,
    predictedPeakDb: Analyser.MIN_DB,
    riskLevel: "safe",
    containedPeakCount: 0,
    lastError: "",
    updatedAt: Date.now()
  };

  function updateState(partial) {
    Object.assign(state, partial, { updatedAt: Date.now() });
    publishLocalTestStatus();
    scheduleBrowserSourceStatus();
  }

  function dbToScalar(db) {
    const number = Number(db);
    if (!Number.isFinite(number) || number <= -60) return 0;
    if (number >= 0) return 1;
    return Math.max(0, Math.min(1, (number + 60) / 60));
  }

  function gainDbToScalar(db) {
    const number = Number(db);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(1, Math.pow(10, number / 20)));
  }

  function mapRiskToStatus(riskLevel) {
    if (state.excluded) return "Excluded";
    if (!state.enabled) return "Unknown";
    if (riskLevel === "risky" || riskLevel === "warning") return "Risky";
    return "Safe";
  }

  function buildBrowserSourceStatus() {
    return {
      sourceId: `media-html:${state.site || "unknown"}`,
      siteName: state.site,
      title: state.site ? `${state.site} media` : "",
      currentLevel: dbToScalar(state.outputRmsDb),
      appliedGain: gainDbToScalar(state.gainDb),
      targetRmsDb: state.targetRmsDb,
      targetProfile: settings.desktopTargetProfile || state.activeProfile,
      status: mapRiskToStatus(state.riskLevel),
      controlSurface: state.enabled ? "BrowserGain" : "ObserveOnly",
      isControllable: state.enabled,
      sourceType: state.sourceType,
      lastSeen: new Date(state.updatedAt).toISOString()
    };
  }

  function scheduleBrowserSourceStatus() {
    if (!root.chrome || !root.chrome.runtime || !root.chrome.runtime.sendMessage) return;
    if (bridgeStatusTimer) return;

    bridgeStatusTimer = root.setTimeout(() => {
      bridgeStatusTimer = null;
      root.chrome.runtime.sendMessage({
        type: "WLG_BROWSER_SOURCE_STATUS",
        status: buildBrowserSourceStatus()
      }, () => {
        // Best-effort local bridge only. The desktop may be closed.
      });
    }, BRIDGE_STATUS_DEBOUNCE_MS);
  }
  function isLocalTestPage() {
    return (
      (state.site === "127.0.0.1" || state.site === "localhost") &&
      root.document &&
      root.document.title === "StreamVolume Guard Hub - Test Page"
    );
  }

  function publishLocalTestStatus() {
    if (!isLocalTestPage() || !root.postMessage) return;
    root.postMessage({
      type: "WLG_TEST_PAGE_STATUS",
      status: {
        ok: state.ok,
        enabled: state.enabled,
        activeProfile: state.activeProfile,
        mediaDetected: state.mediaDetected,
        mediaProcessed: normalizers.size,
        gainDb: state.gainDb,
        targetRmsDb: state.targetRmsDb,
        maxBoostDb: state.maxBoostDb,
        rmsDb: state.rmsDb,
        outputRmsDb: state.outputRmsDb,
        outputPeakDb: state.outputPeakDb,
        peakDb: state.peakDb,
        riskLevel: state.riskLevel,
        containedPeakCount: state.containedPeakCount,
        excluded: state.excluded,
        updatedAt: state.updatedAt
      }
    }, root.location.origin);
  }

  function candidateMediaElements() {
    return Array.from(document.querySelectorAll("video, audio")).filter((media) => {
      return media instanceof HTMLMediaElement && media.dataset[BYPASS_ATTR] !== "true" && !media.dataset[ERROR_ATTR];
    });
  }

  function cleanupDetachedMedia() {
    normalizers.forEach((normalizer, media) => {
      if (media.isConnected) return;
      try {
        normalizer.stop();
      } catch (error) {
        // Best-effort cleanup only.
      }
      normalizers.delete(media);
      processingMedia.delete(media);
      delete media.dataset[PROCESSED_ATTR];
      delete media.dataset[ERROR_ATTR];
    });
  }

  function syncBypassState() {
    normalizers.forEach((normalizer) => {
      if (normalizer.setEnabled) {
        normalizer.setEnabled(settings.enabled && state.enabled && !state.excluded);
      }
      if (normalizer.setPanic) {
        normalizer.setPanic(state.panicActive);
      }
    });
  }

  function applyPendingSettingsUpdate(options) {
    const immediate = Boolean(options && options.immediate);
    const nextSettings = pendingSettingsUpdate;
    settingsUpdateTimer = null;
    pendingSettingsUpdate = null;

    if (!nextSettings) return;

    normalizers.forEach((normalizer) => {
      if (normalizer.updateSettings) {
        normalizer.updateSettings(nextSettings, { immediate });
      }
    });
  }

  function updateNormalizerSettings(options) {
    const immediate = Boolean(options && options.immediate);
    const normalizedSettings = Settings.normalizeSettings(settings);
    pendingSettingsUpdate = normalizedSettings;
    const nextJson = JSON.stringify({
      targetRmsDb: normalizedSettings.targetRmsDb,
      maxBoostDb: normalizedSettings.maxBoostDb,
      maxReductionDb: normalizedSettings.maxReductionDb,
      activeProfile: normalizedSettings.activeProfile,
      compressorEnabled: normalizedSettings.compressorEnabled,
      limiterEnabled: normalizedSettings.limiterEnabled
    });

    if (nextJson === lastSettingsJson && !(immediate && settingsUpdateTimer)) return;
    lastSettingsJson = nextJson;

    if (settingsUpdateTimer) {
      root.clearTimeout(settingsUpdateTimer);
      settingsUpdateTimer = null;
    }

    if (immediate) {
      applyPendingSettingsUpdate({ immediate: true });
      return;
    }

    settingsUpdateTimer = root.setTimeout(() => applyPendingSettingsUpdate({ immediate: false }), SETTINGS_UPDATE_DEBOUNCE_MS);
  }

  function handleNormalizerState(nextState) {
    updateState({
      gainDb: nextState.gainDb,
      targetRmsDb: nextState.targetRmsDb,
      maxBoostDb: nextState.maxBoostDb,
      rmsDb: nextState.rmsDb,
      outputRmsDb: nextState.outputRmsDb,
      outputPeakDb: nextState.outputPeakDb,
      peakDb: nextState.peakDb,
      predictedPeakDb: nextState.predictedPeakDb,
      riskLevel: nextState.riskLevel,
      containedPeakCount: nextState.containedPeakCount,
      activeProfile: nextState.profileId
    });
  }

  async function refreshSettings(options) {
    const sourceSettings = options && options.settings
      ? options.settings
      : await Settings.getSettings();
    settings = Settings.getSettingsForDomain(sourceSettings, state.site);
    updateState({
      activeProfile: settings.activeProfile,
      targetRmsDb: settings.targetRmsDb,
      maxBoostDb: settings.maxBoostDb,
      excluded: Settings.isDomainExcluded(state.site, settings)
    });
    updateNormalizerSettings(options);
    syncBypassState();
    return settings;
  }

  async function processMedia(media) {
    if (normalizers.has(media)) return;
    if (processingMedia.has(media)) return;
    if (media.dataset[PROCESSED_ATTR] === "true") {
      updateState({ skippedAlreadyProcessed: state.skippedAlreadyProcessed + 1 });
      return;
    }

    let normalizer = null;
    processingMedia.add(media);
    try {
      normalizer = Normalizer.createMediaNormalizer(media, settings, {
        onState: handleNormalizerState
      });
      await normalizer.start();
      normalizers.set(media, normalizer);
      media.dataset[PROCESSED_ATTR] = "true";
    } catch (error) {
      if (normalizer) {
        normalizer.stop();
      }
      if (!error.retryable) {
        media.dataset[ERROR_ATTR] = "true";
      }
      updateState({ lastError: error.message });
    } finally {
      processingMedia.delete(media);
    }
  }

  async function scanMedia() {
    cleanupDetachedMedia();
    const mediaElements = candidateMediaElements();

    updateState({
      mediaDetected: mediaElements.length,
      mediaProcessed: normalizers.size,
      skippedAlreadyProcessed: 0
    });

    if (!state.enabled || state.excluded || !settings.enabled) {
      syncBypassState();
      return getStatus();
    }

    await Promise.all(mediaElements.map(processMedia));
    updateState({ mediaProcessed: normalizers.size });
    syncBypassState();
    return getStatus();
  }

  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = root.setTimeout(() => {
      scanTimer = null;
      scanMedia();
    }, 250);
  }

  async function setEnabled(enabled, mode, suppliedSettings) {
    await refreshSettings({ immediate: true, settings: suppliedSettings });
    updateState({
      enabled: Boolean(enabled) && !state.excluded,
      mode: mode || state.mode,
      lastError: ""
    });
    await scanMedia();
    return getStatus();
  }

  async function setPanic(active) {
    updateState({ panicActive: Boolean(active) });
    syncBypassState();
    return getStatus();
  }

  async function rescan(options) {
    await refreshSettings(options || { immediate: true });
    return scanMedia();
  }

  function getStatus() {
    cleanupDetachedMedia();
    return {
      ...state,
      mediaProcessed: normalizers.size
    };
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function startSettingsChangeListener() {
    if (!chrome.storage || !chrome.storage.onChanged || !chrome.storage.onChanged.addListener) return;
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      if (!changes[Settings.SETTINGS_KEY] && !changes[Settings.LEGACY_SETTINGS_KEY]) return;
      rescan({ immediate: true });
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const type = message && message.type;

    if (type === "WLG_SET_ENABLED") {
      setEnabled(Boolean(message.enabled), message.mode, message.settings)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (type === "WLG_GET_STATUS") {
      sendResponse(getStatus());
      return false;
    }

    if (type === "WLG_SET_PANIC") {
      setPanic(Boolean(message.active))
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (type === "WLG_REFRESH_SETTINGS" || type === "WLG_SCAN_MEDIA") {
      rescan({ immediate: true, settings: message.settings })
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    return false;
  });

  WLG.Content = {
    loaded: true,
    getStatus,
    rescan,
    setEnabled,
    setPanic
  };

  refreshSettings({ immediate: true })
    .then(() => {
      startObserver();
      startSettingsChangeListener();
      return scanMedia();
    })
    .catch((error) => updateState({ ok: false, lastError: error.message }));
})(globalThis);

