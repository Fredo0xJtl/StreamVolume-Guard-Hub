// Service worker: injects the audio pipeline, tab capture fallback, and tab diagnostics.
(function initBackground(root) {
  try {
    if (!root.StreamVolumeGuard) {
      importScripts("storage/settings.js", "license/capabilities.js", "audio/source-state.js");
    }
    if (!root.StreamVolumeGuard || !root.StreamVolumeGuard.SourceState) {
      importScripts("audio/source-state.js");
    }
    if (!root.StreamVolumeGuard || !root.StreamVolumeGuard.BridgeClient) {
      importScripts("bridge/client.js");
    }
  } catch (error) {
    console.warn("StreamVolume Guard Hub could not import shared scripts.", error);
  }

  const WLG = root.StreamVolumeGuard = root.StreamVolumeGuard || {};
  const Settings = WLG.Settings;
  const SourceState = WLG.SourceState;
  const captureStatuses = new Map();
  const sourceMemoryOutcomeFingerprints = new Map();
  const TAB_LISTENING_POLL_MS = 900;
  const TAB_AUDIBLE_FALSE_CONFIRM_COUNT = 2;
  const silentMediaUpgradeCandidates = new Map();
  const sourceNoSignalCooldowns = new Map();
  const sourceNoSignalDomainCooldowns = new Map();
  const spotifyNoSignalCooldowns = new Map();
  const spotifyNoSignalDomainCooldowns = new Map();
  const silentMediaUpgradeCooldowns = new Map();
  const silentMediaUpgradeInFlight = new Set();
  let captureListeningPollTimer = null;
  let captureListeningPollInFlight = false;
  const captureListeningAudibleState = new Map();
  const GLOBAL_TARGET_SYNC_INTERVAL_MS = 1500;
  const SILENT_MEDIA_UPGRADE_MIN_REPORTS = 3;
  const SILENT_MEDIA_UPGRADE_LEVEL_THRESHOLD = 0.001;
  const SILENT_MEDIA_UPGRADE_COOLDOWN_MS = 45000;
  const SOURCE_NO_SIGNAL_COOLDOWN_MS = 45000;
  const SPOTIFY_NO_SIGNAL_COOLDOWN_MS = 45000;
  const SPOTIFY_CAPTURE_DOMAINS = new Set(["spotify.com"]);
  const mediaHtmlFallbackReasonsForUpgrade = new Set([
    "no-media-element-detected",
    "no-controllable-media-detected",
    "media-html-no-usable-signal"
  ]);
  const BROWSER_GAIN_CALIBRATION_EVENTS = new Set([
    "browser.calibration.started",
    "browser.calibration.measured",
    "browser.gain.applied",
    "browser.gain.locked",
    "browser.gain.skipped",
    "browser.gain.rearmed"
  ]);
  let lastGlobalTargetSignature = "";
  let lastGlobalTargetSyncMs = 0;
  let globalTargetSyncPromise = null;
  let globalTargetSyncIntervalMs = null;
  const GLOBAL_DISABLE_COOLDOWN_MS = 2500;
  let globalDisableCooldownUntilMs = 0;

  const SCRIPT_FILES = [
    "storage/settings.js",
    "license/capabilities.js",
    "audio/analyser.js",
    "audio/limiter.js",
    "audio/stream-status.js",
    "audio/source-state.js",
    "audio/browser-gain-calibration.js",
    "audio/normalizer.js",
    "content.js"
  ];

  async function queryActiveTab(queryInfo) {
    return new Promise((resolve) => {
      chrome.tabs.query(queryInfo, (tabs) => {
        resolve(tabs && tabs[0] ? tabs[0] : null);
      });
    });
  }

  async function getActiveTab() {
    const currentWindowTab = await queryActiveTab({ active: true, currentWindow: true });
    if (currentWindowTab && canInjectUrl(currentWindowTab.url)) return currentWindowTab;

    const lastFocusedTab = await queryActiveTab({ active: true, lastFocusedWindow: true });
    if (lastFocusedTab && canInjectUrl(lastFocusedTab.url)) return lastFocusedTab;

    const tabs = await getAllTabs();
    return tabs.find((tab) => tab && tab.active && canInjectUrl(tab.url)) || currentWindowTab || lastFocusedTab || null;
  }

  function getTabById(tabId) {
    return new Promise((resolve) => {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(tab || null);
      });
    });
  }

  function getAllTabs() {
    return new Promise((resolve) => {
      chrome.tabs.query({}, (tabs) => {
        resolve(Array.isArray(tabs) ? tabs : []);
      });
    });
  }

  function hasUsefulObservedStatus(status) {
    return Boolean(
      status &&
      (
        status.installed ||
        status.enabled ||
        Boolean(status.site) ||
        (status.sourceType && status.sourceType !== "none")
      )
    );
  }

  function scoreObservedStatus(tab, status) {
    if (!hasUsefulObservedStatus(status)) return -1;

    let score = 0;
    if (status.enabled) score += 1000;
    if (status.installed) score += 500;
    if (status.sourceType && status.sourceType !== "none") score += 300;
    if (Number(status.mediaProcessed) > 0) score += 220;
    if (Number(status.mediaDetected) > 0) score += 120;
    if (status.captureSignalState === "signal") score += 100;
    if (tab && tab.audible) score += 80;
    if (tab && tab.active) score += 20;
    if (status.site) score += 10;
    return score;
  }

  async function getStatusForTab(tab, globalEnabled) {
    if (!tab || !tab.id) return null;
    const response = await sendMessage(tab.id, { type: "WLG_GET_STATUS" });
    const captureStatus = getCaptureStatus(tab.id);
    if (!response && !captureStatus) return null;
    const normalizedResponse = response && typeof response === "object"
      ? { ...response, enabled: Boolean(response.enabled) && globalEnabled }
      : response;
    return mergeStatus(tab, normalizedResponse || captureStatus, globalEnabled);
  }

  async function getBestObservedTabStatus(globalEnabled, excludedTabId) {
    const ignoredTabId = Number(excludedTabId) || 0;
    const tabs = await getAllTabs();
    const results = await Promise.allSettled(
      tabs
        .filter((tab) => tab && tab.id && tab.id !== ignoredTabId)
        .map(async (tab) => {
          const status = await getStatusForTab(tab, globalEnabled);
          return { tab, status, score: scoreObservedStatus(tab, status) };
        })
    );

    const candidates = results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value)
      .filter((candidate) => candidate && candidate.score >= 0)
      .sort((left, right) => right.score - left.score);

    return candidates.length > 0 ? candidates[0].status : null;
  }

  async function getTabSiteDetails(tab) {
    const urlSite = getDomainFromTab(tab);
    if (urlSite) return { site: urlSite, reason: "tab-url", error: "" };
    if (!tab || !tab.id) {
      return { site: "", reason: "missing-tab", error: "No active tab found." };
    }

    const existingStatus = await sendMessage(tab.id, { type: "WLG_GET_STATUS" });
    if (existingStatus && existingStatus.site) {
      return { site: Settings.normalizeDomain(existingStatus.site), reason: "content-status", error: "" };
    }

    try {
      await executeScripts(tab.id);
      const injectedStatus = await sendMessageWithRetry(tab.id, { type: "WLG_GET_STATUS" });
      const injectedSite = Settings.normalizeDomain(injectedStatus && injectedStatus.site ? injectedStatus.site : "");
      if (injectedSite) {
        return { site: injectedSite, reason: "content-site-recovered", error: "" };
      }
      return {
        site: "",
        reason: "content-status-empty",
        error: injectedStatus && injectedStatus.error ? injectedStatus.error : "Content script returned no site."
      };
    } catch (error) {
      return { site: "", reason: "content-site-recovery-failed", error: error && error.message ? error.message : "Content script site recovery failed." };
    }
  }

  async function getTabSite(tab) {
    const details = await getTabSiteDetails(tab);
    return details.site;
  }

  function sendMessage(tabId, message) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response || null);
      });
    });
  }

  function delay(ms) {
    return new Promise((resolve) => root.setTimeout(resolve, ms));
  }

  async function sendMessageWithRetry(tabId, message, attempts) {
    const totalAttempts = Math.max(1, Number(attempts) || 3);
    for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
      const response = await sendMessage(tabId, message);
      if (response) return response;
      if (attempt < totalAttempts - 1) {
        await delay(120);
      }
    }

    return null;
  }

  async function setGlobalExtensionEnabled(enabled) {
    const desired = Boolean(enabled);
    try {
      await Settings.saveSettings({ enabled: desired });
      globalDisableCooldownUntilMs = desired ? 0 : Date.now() + GLOBAL_DISABLE_COOLDOWN_MS;
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : "Unable to persist extension enabled state." };
    }
  }

  function isGlobalDisableCooldownActive() {
    return Date.now() < globalDisableCooldownUntilMs;
  }

  async function disableAllTabProtection() {
    const captureTabIds = Array.from(captureStatuses.keys());
    const stoppedCaptures = captureTabIds.map(async (tabId) => {
      await sendRuntimeMessage({ target: "offscreen", type: "WLG_STOP_TAB_CAPTURE", tabId });
      clearCaptureStatus(tabId);
    });
    await Promise.allSettled(stoppedCaptures);
    return true;
  }

  async function stopActiveTabWithGlobalState(tabId) {
    const tab = tabId ? await getTabById(Number(tabId)) : await getActiveTab();
    if (!tab || !tab.id) {
      return { ok: true, enabled: false };
    }

    const site = getDomainFromUrl(tab.url);
    const effectiveSettings = await getSettingsWithGlobalTarget();
    const sourceSettings = Settings.getSettingsForDomain(effectiveSettings, site);
    const disabledSourceSettings = { ...sourceSettings, enabled: false };
    const settingsState = await setGlobalExtensionEnabled(false);
    await disableAllTabProtection();
    const stopCaptureResult = await stopTabCaptureForActiveTab(tab.id);
    const contentResponse = await sendMessageWithRetry(tab.id, {
      type: "WLG_SET_ENABLED",
      enabled: true,
      settings: disabledSourceSettings
    }, 3);
    const statusResponse = await getStatusForActiveTab(tab.id);
    const status = {
      ...(statusResponse && typeof statusResponse === "object" ? statusResponse : {}),
      ...(stopCaptureResult && typeof stopCaptureResult === "object" ? stopCaptureResult : {}),
      enabled: false
    };

    if (!settingsState.ok) {
      return {
        ...status,
        ok: false,
        error: `${(statusResponse && statusResponse.error) || (contentResponse && contentResponse.error) || status.error || ""}${status.error ? "; " : ""}${settingsState.error}`.replace(/^;\s*/, "")
      };
    }

    if (!contentResponse && settingsState.ok) {
      return status.ok === false
        ? { ...status }
        : statusResponse || stopCaptureResult || { ok: true, enabled: false, error: "No response from active tab while disabling." };
    }

    return { ...status, ok: status.ok === false ? false : true };
  }

  async function activateCurrentTabWithGlobalState(tabId) {
    const settingsState = await setGlobalExtensionEnabled(true);
    const activeResult = await protectActiveTab({ tabId });

    if (!settingsState.ok && activeResult && activeResult.ok !== false) {
      return { ...activeResult, error: `${activeResult.error ? `${activeResult.error}; ` : ""}${settingsState.error}` };
    }

    return activeResult;
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { ok: true });
      });
    });
  }

  function executeScripts(tabId) {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          files: SCRIPT_FILES
        },
        () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve();
        }
      );
    });
  }

  function containsPermission(origins) {
    return new Promise((resolve) => {
      chrome.permissions.contains({ origins }, (contains) => resolve(Boolean(contains)));
    });
  }

  function requestPermission(origins) {
    return new Promise((resolve) => {
      chrome.permissions.request({ origins }, (granted) => resolve(Boolean(granted)));
    });
  }

  function originsForDomain(domain) {
    return [`*://${domain}/*`, `*://*.${domain}/*`];
  }

  function getDomainFromUrl(url) {
    try {
      return Settings.normalizeDomain(new URL(url).hostname);
    } catch (error) {
      return "";
    }
  }

  function getDomainFromTab(tab) {
    return Settings.normalizeDomain((tab && tab.__wlgSite) || getDomainFromUrl(tab && tab.url));
  }

  function normalizeBridgeStatus(tab, status) {
    const source = status && typeof status === "object" ? status : {};
    const classification = classifyBrowserStatus(source);
    const tabId = tab && tab.id ? Number(tab.id) : Number(source.tabId) || null;
    const site = source.siteName || (tab ? getDomainFromUrl(tab.url) : "") || "Unknown site";
    const controlSurface = source.controlSurface === "BrowserGain" || source.controlSurface === "ObserveOnly"
      ? source.controlSurface
      : classification.controlSurface;

    return {
      browserProcess: source.browserProcess || "",
      sourceId: `tab-${tabId || "unknown"}:${source.sourceId || source.sourceType || "media"}`,
      tabId,
      siteName: site,
      title: source.title || "",
      currentLevel: source.currentLevel,
      appliedGain: source.appliedGain,
      calibrationState: source.calibrationState,
      measuredRmsDb: source.measuredRmsDb,
      appliedGainDb: source.appliedGainDb,
      calibrationReason: source.calibrationReason || source.reason || source.captureFallbackReason,
      captureSignalState: source.captureSignalState || "",
      browserState: source.browserState || classification.browserState,
      reason: source.reason || classification.reason,
      recommendedAction: source.recommendedAction || classification.recommendedAction,
      targetRmsDb: source.targetRmsDb,
      targetProfile: source.targetProfile || source.activeProfile || "",
      status: source.status || classification.status || "Unknown",
      lastSeen: source.lastSeen || new Date().toISOString(),
      origin: "BrowserExtension",
      controlSurface
    };
  }

  function dbToScalar(db) {
    const number = Number(db);
    if (!Number.isFinite(number) || number <= -60) return 0;
    if (number >= 0) return 1;
    return Math.max(0, Math.min(1, (number + 60) / 60));
  }

  function gainDbToScalar(db) {
    const number = Number(db);
    if (!Number.isFinite(number)) return 1;
    return Math.max(0, Math.min(1, Math.pow(10, number / 20)));
  }

  function withDesktopBridgeCalibrationMode(settings, bridgeConnected) {
    return {
      ...settings,
      desktopBridgeConnected: Boolean(bridgeConnected),
      browserGainMeasurementWindowMs: bridgeConnected ? 18000 : 0,
      browserGainMinUsableSignalMs: bridgeConnected ? 8000 : 0
    };
  }

  async function isDesktopBridgeConnectedForCalibration() {
    if (!WLG.BridgeClient || !WLG.BridgeClient.checkDesktopBridgeHealth) return false;

    try {
      const response = await WLG.BridgeClient.checkDesktopBridgeHealth();
      return Boolean(response && response.connected);
    } catch (error) {
      return false;
    }
  }

  async function hasDesktopBridgeForSilentMediaUpgrade() {
    return isDesktopBridgeConnectedForCalibration();
  }

  function mapCaptureStatusToBridgeStatus(status) {
    if (!status || !status.enabled) return "Unknown";
    if (status.excluded) return "Excluded";
    if (status.captureSignalState !== "signal") return "Unknown";
    if (status.riskLevel === "risky" || status.riskLevel === "warning") return "Risky";
    return "Safe";
  }

  function normalizeCaptureBridgeStatus(tab, tabId, status) {
    const source = status && typeof status === "object" ? status : {};
    const normalizedTabId = Number(tabId) || (tab && tab.id ? Number(tab.id) : null);
    const site = source.site || (tab ? getDomainFromUrl(tab.url) : "") || "Unknown site";
    const captureSignalState = source.captureSignalState || "unknown";
    const classification = classifyBrowserStatus({
      ...source,
      enabled: source.enabled !== false,
      sourceType: "tab-capture",
      captureSignalState
    });

    return {
      browserProcess: source.browserProcess || "",
      sourceId: `tab-capture:${normalizedTabId || "unknown"}`,
      tabId: normalizedTabId,
      siteName: site,
      title: site ? `${site} tab capture` : "Tab capture",
      currentLevel: dbToScalar(source.outputRmsDb ?? source.rmsDb),
      appliedGain: gainDbToScalar(source.gainDb),
      calibrationState: source.calibrationState,
      measuredRmsDb: source.measuredRmsDb,
      appliedGainDb: source.appliedGainDb,
      calibrationReason: source.calibrationReason || classification.reason,
      captureSignalState: captureSignalState,
      browserState: classification.browserState,
      reason: classification.reason,
      recommendedAction: classification.recommendedAction,
      targetRmsDb: source.targetRmsDb,
      targetProfile: source.targetProfile || source.activeProfile || "",
      status: classification.status || mapCaptureStatusToBridgeStatus(source),
      lastSeen: new Date(source.updatedAt || Date.now()).toISOString(),
      origin: "BrowserExtension",
      controlSurface: classification.controlSurface
    };
  }

  function classifyBrowserStatus(status, options) {
    if (!SourceState || !SourceState.classifyBrowserStatus) {
      return {
        origin: "BrowserExtension",
        sourceType: status && status.sourceType ? status.sourceType : "unknown",
        browserState: "observe-only",
        controlSurface: status && status.controlSurface ? status.controlSurface : "ObserveOnly",
        status: status && status.status ? status.status : "Unknown",
        isControllable: false,
        reason: status && (status.captureFallbackReason || status.calibrationReason || status.captureSignalState) || "",
        recommendedAction: "Observer la source et copier un diagnostic."
      };
    }

    return SourceState.classifyBrowserStatus(status, options);
  }

  function withBrowserClassification(status, options) {
    const classification = classifyBrowserStatus(status, options);
    return {
      ...status,
      origin: classification.origin,
      browserState: classification.browserState,
      controlSurface: classification.controlSurface,
      status: classification.status,
      isControllable: classification.isControllable,
      reason: classification.reason,
      recommendedAction: classification.recommendedAction
    };
  }

  async function forwardExtensionLogToBridge(input) {
    if (!WLG.BridgeClient || !WLG.BridgeClient.sendExtensionLog) {
      return { ok: false, error: "bridge client unavailable" };
    }

    return WLG.BridgeClient.sendExtensionLog(input);
  }

  async function forwardBrowserSourceStatus(sender, status) {
    if (!WLG.BridgeClient || !WLG.BridgeClient.sendBrowserSourceObserved) {
      return { ok: false, error: "bridge client unavailable" };
    }

    await maybeSyncGlobalTargetForOpenTabs();
    const tab = sender && sender.tab ? sender.tab : null;
    const message = normalizeBridgeStatus(tab, status);
    const result = await WLG.BridgeClient.sendBrowserSourceObserved(message);
    maybeUpgradeSilentMediaToTabCapture(sender, status).catch(() => {});
    return result;
  }

  async function forwardCaptureStatusToBridge(tabId, status) {
    if (!WLG.BridgeClient || !WLG.BridgeClient.sendBrowserSourceObserved) {
      return { ok: false, error: "bridge client unavailable" };
    }

    await maybeSyncGlobalTargetForOpenTabs();
    const tab = await getTabById(Number(tabId));
    const source = status && typeof status === "object" ? status : {};
    const message = normalizeCaptureBridgeStatus(tab, tabId, status);
    const result = await WLG.BridgeClient.sendBrowserSourceObserved(message);

    if (source.captureSignalState && source.captureSignalState !== "signal") {
      await forwardExtensionLogToBridge({
        eventName: "tabcapture.status",
        message: `Tab capture status: ${source.captureSignalState}`,
        severity: source.captureSignalState === "no-signal" || source.captureSignalState === "unavailable" ? "warn" : "info",
        browserProcess: message.browserProcess,
        sourceId: message.sourceId,
        tabId: message.tabId,
        siteName: message.siteName,
        status: message.status,
        controlSurface: message.controlSurface,
        captureSignalState: source.captureSignalState,
        calibrationReason: source.calibrationReason || source.captureFallbackReason,
        targetRmsDb: source.targetRmsDb,
        targetProfile: source.targetProfile || source.activeProfile || ""
      });
    }

    return result;
  }

  async function getSettingsWithGlobalTarget() {
    const savedSettings = await Settings.getSettings();
    if (!WLG.BridgeClient || !WLG.BridgeClient.fetchGlobalTargetState || !Settings.applyGlobalTarget) {
      return withDesktopBridgeCalibrationMode(savedSettings, false);
    }

    try {
      const response = await WLG.BridgeClient.fetchGlobalTargetState();
      if (response && response.ok && response.state) {
        return withDesktopBridgeCalibrationMode(Settings.applyGlobalTarget(savedSettings, response.state), true);
      }
    } catch (error) {
      // Best-effort bridge sync only. Local extension settings remain the fallback.
    }

    return withDesktopBridgeCalibrationMode(savedSettings, await isDesktopBridgeConnectedForCalibration());
  }

  function getGlobalTargetSignature(state) {
    const target = Number(state && (state.targetRmsDb ?? state.targetDecibels));
    if (!Number.isFinite(target)) return "";

    return [
      state.targetProfile || "",
      target.toFixed(2),
      state.updatedAt || ""
    ].join("|");
  }

  async function maybeSyncGlobalTargetForOpenTabs() {
    if (!WLG.BridgeClient || !WLG.BridgeClient.fetchGlobalTargetState || !Settings.applyGlobalTarget) {
      return { ok: false, error: "global target sync unavailable" };
    }

    const nowMs = Date.now();
    if (globalTargetSyncPromise) return globalTargetSyncPromise;
    if (nowMs - lastGlobalTargetSyncMs < GLOBAL_TARGET_SYNC_INTERVAL_MS) {
      return { ok: true, throttled: true };
    }
    lastGlobalTargetSyncMs = nowMs;

    globalTargetSyncPromise = (async () => {
      const response = await WLG.BridgeClient.fetchGlobalTargetState();
      if (!response || !response.ok || !response.state) {
        return response || { ok: false, error: "global target unavailable" };
      }

      const signature = getGlobalTargetSignature(response.state);
      if (!signature || signature === lastGlobalTargetSignature) {
        return { ok: true, unchanged: true };
      }

      lastGlobalTargetSignature = signature;
      const syncedSettings = Settings.applyGlobalTarget(await Settings.getSettings(), response.state);
      const refreshResult = await refreshOpenTabs(syncedSettings);
      await forwardExtensionLogToBridge({
        eventName: "browser.target.synced",
        message: "Desktop global target synced to protected browser tabs",
        severity: "info",
        targetRmsDb: response.state.targetRmsDb,
        targetProfile: response.state.targetProfile || "",
        status: "Safe",
        controlSurface: "Unknown"
      });
      return refreshResult;
    })()
      .catch((error) => ({ ok: false, error: error && error.message ? error.message : "global target sync failed" }))
      .finally(() => {
        globalTargetSyncPromise = null;
      });

    return globalTargetSyncPromise;
  }

  function startPeriodicGlobalTargetSync() {
    if (globalTargetSyncIntervalMs) return;

    globalTargetSyncIntervalMs = root.setInterval(() => {
      maybeSyncGlobalTargetForOpenTabs().catch(() => {});
    }, GLOBAL_TARGET_SYNC_INTERVAL_MS);
  }

  async function getEffectiveSettingsForDomain(domain) {
    return Settings.getSettingsForDomain(await getSettingsWithGlobalTarget(), domain);
  }

  function canInjectUrl(url) {
    return /^https?:\/\//i.test(url || "") || /^file:\/\//i.test(url || "");
  }

  function canCaptureTab() {
    return Boolean(
      chrome.tabCapture &&
      chrome.tabCapture.getMediaStreamId &&
      chrome.offscreen &&
      chrome.offscreen.createDocument
    );
  }

  function getCaptureStatus(tabId) {
    return captureStatuses.get(tabId) || null;
  }

  function hasActiveCaptureStatuses() {
    for (const status of captureStatuses.values()) {
      if (status && status.enabled && status.sourceType === "tab-capture") {
        return true;
      }
    }
    return false;
  }

  function clearCaptureStatus(tabId) {
    const normalizedTabId = Number(tabId);
    if (!Number.isFinite(normalizedTabId)) return;
    if (!captureStatuses.delete(normalizedTabId)) return;
    sourceMemoryOutcomeFingerprints.delete(normalizedTabId);
    captureListeningAudibleState.delete(normalizedTabId);
    stopCaptureListeningPoller();
  }

  function normalizeSourceTypeForMemory(sourceType) {
    if (sourceType === "tab-capture" || sourceType === "media-html") return sourceType;
    return "";
  }

  function resolveSourceMemoryOutcome(status) {
    const sourceType = normalizeSourceTypeForMemory(status && status.sourceType);
    if (!sourceType) return "";
    if (sourceType === "tab-capture") {
      if (status.captureSignalState === "signal") return "success";
      const captureSignalState = String(status.captureSignalState || "").toLowerCase();
      const hasLiveCaptureTrack = String(status.captureTrackState || "").toLowerCase() === "live" && Number(status.audioTrackCount) > 0;
      const captureFallbackReason = String(status.captureFallbackReason || "").toLowerCase();
      if (
        (captureSignalState === "no-signal" || captureSignalState === "waiting-for-audio" || captureSignalState === "restart-requested" || captureSignalState === "starting")
        && hasLiveCaptureTrack
      ) {
        return "tab-capture-no-signal";
      }
      if (captureSignalState === "unavailable") return "tab-capture-start-failed";
      if (captureFallbackReason === "tab-capture-start-failed") return "tab-capture-start-failed";
      if (!status.enabled) {
        const fallbackReason = String(status.captureFallbackReason || "").toLowerCase();
        const stopReason = String(status.captureStopReason || "").toLowerCase();
        if (fallbackReason === "tab-capture-start-failed" || stopReason === "startup-error" || stopReason === "capture-restart") {
          return "tab-capture-start-failed";
        }
      }
      return "";
    }

    if (sourceType === "media-html") {
      const fallbackReason = String(status.captureFallbackReason || status.reason || "").toLowerCase();
      if (fallbackReason === "no-media-element-detected"
        || fallbackReason === "no-controllable-media-detected"
        || fallbackReason === "media-html-no-usable-signal"
        || fallbackReason === "no-media") {
        return "media-no-detect";
      }
      if (status.isControllable === true && Number(status.mediaDetected) > 0 && Number(status.mediaProcessed) > 0) return "success";
      return "";
    }

    return "";
  }

  function buildSourceMemoryFingerprint(normalizedStatus) {
    const sourceType = normalizeSourceTypeForMemory(normalizedStatus.sourceType);
    if (!sourceType) return "";
    const fallbackReason = String(normalizedStatus.captureFallbackReason || normalizedStatus.reason || "").toLowerCase();
    const mediaSignature = sourceType === "media-html"
      ? `|${Number(normalizedStatus.mediaDetected) || 0}|${Number(normalizedStatus.mediaProcessed) || 0}|${Boolean(normalizedStatus.isControllable)}`
      : "";
    return `${sourceType}|${normalizedStatus.captureSignalState || ""}|${Number(normalizedStatus.captureRestartCount) || 0}|${fallbackReason}${mediaSignature}`;
  }

  async function persistSourceMemoryOutcome(site, sourceType, outcome, reason) {
    const normalizedSite = Settings.normalizeDomain(site);
    const normalizedSourceType = normalizeSourceTypeForMemory(sourceType);
    if (!normalizedSite || !normalizedSourceType || !outcome) return;

    try {
      const settings = await Settings.getSettings();
      const nextDomainSourceMemory = Settings.recordDomainSourceMemoryOutcome(
        settings,
        normalizedSite,
        normalizedSourceType,
        outcome,
        reason
      );
      await Settings.saveSettings({ domainSourceMemory: nextDomainSourceMemory });
    } catch (error) {
      // Memory persistence failures are intentionally non-blocking.
    }
  }

  function maybePersistSourceMemoryFromCaptureStatus(tabId, normalizedStatus, previousStatus) {
    if (!normalizedStatus || !tabId) return;
    const outcome = resolveSourceMemoryOutcome(normalizedStatus);
    if (!outcome) return;

    const sourceType = normalizeSourceTypeForMemory(normalizedStatus.sourceType);
    const normalizedStatusForFingerprint = {
      ...normalizedStatus,
      sourceType,
      captureSignalState: normalizedStatus.captureSignalState || "",
      captureRestartCount: normalizedStatus.captureRestartCount || 0
    };
    const nextFingerprint = buildSourceMemoryFingerprint(normalizedStatusForFingerprint);
    const previousFingerprint = sourceMemoryOutcomeFingerprints.get(Number(tabId)) || "";
    const previousStatusType = previousStatus && previousStatus.sourceType;
    const didTransition = previousFingerprint !== nextFingerprint || previousStatusType !== sourceType;
    if (!didTransition) return;

    sourceMemoryOutcomeFingerprints.set(Number(tabId), nextFingerprint);
    const reason = String(normalizedStatus.captureFallbackReason || normalizedStatus.lastError || normalizedStatus.reason || "").trim();
    void persistSourceMemoryOutcome(normalizedStatus.site, sourceType, outcome, reason);
  }

  function getListeningAudibleState(tabId) {
    const normalizedTabId = Number(tabId);
    if (!Number.isFinite(normalizedTabId)) return null;
    const existing = captureListeningAudibleState.get(normalizedTabId);
    if (existing) return existing;
    const initialized = {
      falseStreak: 0,
      committedAudible: true,
      lastUpdateAt: 0
    };
    captureListeningAudibleState.set(normalizedTabId, initialized);
    return initialized;
  }

  function resetListeningAudibleState(tabId) {
    const normalizedTabId = Number(tabId);
    if (!Number.isFinite(normalizedTabId)) return;
    captureListeningAudibleState.delete(normalizedTabId);
  }

  function resolveDebouncedAudible(tabId, incomingAudible, fallbackAudible) {
    const state = getListeningAudibleState(tabId);
    if (!state) return incomingAudible;
    if (incomingAudible) {
      state.falseStreak = 0;
      state.committedAudible = true;
      state.lastUpdateAt = Date.now();
      return true;
    }

    if (state.committedAudible === false) {
      state.falseStreak = 0;
      return false;
    }

    state.falseStreak += 1;
    if (state.falseStreak >= TAB_AUDIBLE_FALSE_CONFIRM_COUNT) {
      state.falseStreak = 0;
      state.committedAudible = false;
      state.lastUpdateAt = Date.now();
      return false;
    }

    state.lastUpdateAt = Date.now();
    return Boolean(fallbackAudible);
  }

  function setCaptureStatus(tabId, status) {
    const normalizedTabId = Number(tabId);
    if (!Number.isFinite(normalizedTabId)) return null;
    const nextStatus = status || {};
    captureStatuses.set(normalizedTabId, nextStatus);
    if (!nextStatus || !nextStatus.enabled || nextStatus.sourceType !== "tab-capture") {
      resetListeningAudibleState(normalizedTabId);
      return nextStatus;
    }
    if (nextStatus && nextStatus.enabled && nextStatus.sourceType === "tab-capture") {
      startCaptureListeningPoller();
    }
    return nextStatus;
  }

  function updateCaptureStatus(tabId, partial) {
    const previous = captureStatuses.get(tabId) || {};
    const status = {
      ...previous,
      ...partial,
      updatedAt: Date.now()
    };
    setCaptureStatus(tabId, status);
    return status;
  }

  function shouldDeferSilentCaptureRestart(tab) {
    return !tab || tab.audible !== true;
  }

  function normalizeIncomingCaptureStatus(tabId, status) {
    const previous = captureStatuses.get(tabId) || {};
    const incoming = {
      ...previous,
      ...(status || {})
    };

    if (incoming.captureSignalState === "signal") {
      incoming.captureRestartDeferred = false;
      incoming.lastError = "";
    }

    if (incoming.captureSignalState === "no-signal" && incoming.tabAudible === false) {
      incoming.captureSignalState = "waiting-for-audio";
      incoming.captureRestartDeferred = true;
      incoming.lastError = "";
    }

    return incoming;
  }

  function shouldFallbackSilentCaptureToMedia(status) {
    if (isSpotifyDomain(status && status.site)) return false;
    return Boolean(
      status &&
      status.sourceType === "tab-capture" &&
      status.captureSignalState === "no-signal" &&
      status.tabAudible === true &&
      Number(status.captureRestartCount) >= 1 &&
      Number(status.rmsDb) <= -100 &&
      Number(status.outputRmsDb) <= -100
    );
  }

  function shouldPreserveSpotifyCaptureAfterTransientOff(tabId, incomingStatus) {
    const existing = getCaptureStatus(tabId);
    if (!incomingStatus || incomingStatus.enabled) return false;
    if (!existing) return false;
    if (!existing.enabled) return false;
    if (existing.sourceType !== "tab-capture") return false;
    if (!isActiveSpotifyCaptureForPreservation(existing, incomingStatus)) return false;
    const stopReason = String(incomingStatus.captureStopReason || "").toLowerCase();
    if (
      stopReason === "user-stop" ||
      stopReason === "manual-stop" ||
      stopReason === "site-excluded"
    ) {
      return false;
    }
    if (!isSpotifyDomain(existing.site)) return false;
    return true;
  }

  function isActiveSpotifyCaptureForPreservation(existing, incomingStatus) {
    const incomingTrackState = String(incomingStatus && incomingStatus.captureTrackState || "").toLowerCase();
    const hasUsableCaptureTrack = Number(existing.audioTrackCount) > 0 && existing.captureTrackState === "live";
    const hasCapturedElements = Number(existing.mediaDetected) > 0 || Number(existing.mediaProcessed) > 0;
    const incomingNotTerminal = incomingTrackState !== "ended" && incomingTrackState !== "interrupted";

    return (
      existing && isSpotifyDomain(existing.site) &&
      hasUsableCaptureTrack &&
      hasCapturedElements &&
      incomingNotTerminal
    );
  }

  function isSpotifyDomain(domain) {
    const normalizedDomain = Settings.normalizeDomain(domain || "");
    if (!normalizedDomain) return false;
    if (SPOTIFY_CAPTURE_DOMAINS.has(normalizedDomain)) return true;
    return normalizedDomain.endsWith(".spotify.com");
  }

  function getSourceNoSignalCooldownUntil(tabId) {
    const normalizedTabId = Number(tabId);
    if (!Number.isFinite(normalizedTabId)) return 0;
    return sourceNoSignalCooldowns.get(normalizedTabId) || 0;
  }

  function clearSourceNoSignalCooldown(tabId) {
    sourceNoSignalCooldowns.delete(Number(tabId));
  }

  function setSourceNoSignalCooldown(tabId) {
    const normalizedTabId = Number(tabId);
    if (!Number.isFinite(normalizedTabId)) return 0;
    const until = Date.now() + SOURCE_NO_SIGNAL_COOLDOWN_MS;
    sourceNoSignalCooldowns.set(normalizedTabId, until);
    return until;
  }

  function getSourceNoSignalDomainCooldownUntil(site) {
    const normalizedSite = normalizeDomainForMemory(site);
    if (!normalizedSite) return 0;
    return sourceNoSignalDomainCooldowns.get(normalizedSite) || 0;
  }

  function setSourceNoSignalDomainCooldown(site, untilMs) {
    const normalizedSite = normalizeDomainForMemory(site);
    if (!normalizedSite) return 0;
    const safeUntil = Number.isFinite(Number(untilMs)) ? Number(untilMs) : Date.now() + SOURCE_NO_SIGNAL_COOLDOWN_MS;
    const until = safeUntil > Date.now() ? safeUntil : Date.now() + SOURCE_NO_SIGNAL_COOLDOWN_MS;
    sourceNoSignalDomainCooldowns.set(normalizedSite, until);
    return until;
  }

  function clearSourceNoSignalDomainCooldown(site) {
    const normalizedSite = normalizeDomainForMemory(site);
    if (!normalizedSite) return;
    sourceNoSignalDomainCooldowns.delete(normalizedSite);
  }

  function setSourceNoSignalCooldowns(tabId, site) {
    const until = setSourceNoSignalCooldown(tabId);
    setSourceNoSignalDomainCooldown(site, until);
    return until;
  }

  function isSourceNoSignalLocked(tabId, site) {
    const tabUntil = getSourceNoSignalCooldownUntil(tabId);
    const domainUntil = getSourceNoSignalDomainCooldownUntil(site);
    return (Number.isFinite(tabUntil) && tabUntil > Date.now()) || (Number.isFinite(domainUntil) && domainUntil > Date.now());
  }

  function clearSourceNoSignalCooldowns(tabId, site) {
    clearSourceNoSignalCooldown(tabId);
    clearSourceNoSignalDomainCooldown(site);
  }

  function getSpotifyNoSignalCooldownUntil(tabId) {
    const normalizedTabId = Number(tabId);
    if (!Number.isFinite(normalizedTabId)) return 0;
    return spotifyNoSignalCooldowns.get(normalizedTabId) || 0;
  }

  function clearSpotifyNoSignalCooldown(tabId) {
    spotifyNoSignalCooldowns.delete(Number(tabId));
  }

  function setSpotifyNoSignalCooldown(tabId) {
    const normalizedTabId = Number(tabId);
    if (!Number.isFinite(normalizedTabId)) return 0;
    const until = Date.now() + SPOTIFY_NO_SIGNAL_COOLDOWN_MS;
    spotifyNoSignalCooldowns.set(normalizedTabId, until);
    return until;
  }

  function isSpotifyNoSignalLocked(tabId) {
    const until = getSpotifyNoSignalCooldownUntil(tabId);
    return Number.isFinite(until) && until > Date.now();
  }

  function normalizeSpotifyDomain(domain) {
    return Settings.normalizeDomain(domain || "");
  }

  function getSpotifyNoSignalDomainCooldownUntil(site) {
    const normalizedSite = normalizeSpotifyDomain(site);
    if (!normalizedSite) return 0;
    return spotifyNoSignalDomainCooldowns.get(normalizedSite) || 0;
  }

  function setSpotifyNoSignalDomainCooldown(site, untilMs) {
    const normalizedSite = normalizeSpotifyDomain(site);
    if (!normalizedSite) return 0;
    const safeUntil = Number.isFinite(Number(untilMs)) ? Number(untilMs) : Date.now() + SPOTIFY_NO_SIGNAL_COOLDOWN_MS;
    const until = safeUntil > Date.now() ? safeUntil : Date.now() + SPOTIFY_NO_SIGNAL_COOLDOWN_MS;
    spotifyNoSignalDomainCooldowns.set(normalizedSite, until);
    return until;
  }

  function clearSpotifyNoSignalDomainCooldown(site) {
    const normalizedSite = normalizeSpotifyDomain(site);
    if (!normalizedSite) return;
    spotifyNoSignalDomainCooldowns.delete(normalizedSite);
  }

  function isSpotifyNoSignalDomainLocked(site) {
    const until = getSpotifyNoSignalDomainCooldownUntil(site);
    return Number.isFinite(until) && until > Date.now();
  }

  function setSpotifyNoSignalCooldowns(tabId, site) {
    const until = setSpotifyNoSignalCooldown(tabId);
    setSpotifyNoSignalDomainCooldown(site, until);
    return until;
  }

  function normalizeDomainForMemory(site) {
    return Settings.normalizeDomain(site || "");
  }

  function buildNoSignalTabCaptureStatus(tab, settings, restartCount, untilMs) {
    const targetRmsDb = Number.isFinite(Number(settings && settings.targetRmsDb))
      ? Number(settings.targetRmsDb)
      : -21;
    const maxBoostDb = Number.isFinite(Number(settings && settings.maxBoostDb))
      ? Number(settings.maxBoostDb)
      : 0;
    const normalizedTab = tab || {};
    return {
      ...baseStatusForTab(tab),
      installed: true,
      enabled: true,
      sourceType: "tab-capture",
      mode: "tab-capture",
      activeProfile: settings && settings.activeProfile,
      mediaDetected: 1,
      mediaProcessed: 1,
      skippedAlreadyProcessed: 0,
      targetRmsDb,
      maxBoostDb,
      contextState: "",
      tabAudible: Boolean(normalizedTab.audible),
      tabActive: Boolean(normalizedTab.active),
      audioTrackCount: 1,
      captureTrackState: "live",
      captureMuted: false,
      captureSignalState: "no-signal",
      captureFallbackRecommended: true,
      captureFallbackReason: "tab-capture-no-signal",
      captureRestartCount: Number(restartCount) || 0,
      captureRestartDeferred: false,
      captureNoSignalUntil: Number.isFinite(untilMs) ? untilMs : 0,
      riskLevel: "safe",
      containedPeakCount: 0,
      lastError: "Capture d'onglet détectée, piste live, mais aucun signal Web Audio exploitable n'a été mesuré."
    };
  }

  function shouldKeepDesktopFallbackAfterMediaFallback(fallbackStatus) {
    const hasFallbackReason = Boolean(
      fallbackStatus &&
      (fallbackStatus.captureFallbackRecommended || fallbackStatus.captureFallbackReason)
    );

    return Boolean(
      fallbackStatus &&
      fallbackStatus.enabled &&
      fallbackStatus.sourceType === "media-html" &&
      (hasFallbackReason || Number(fallbackStatus.mediaProcessed) < 1)
    );
  }

  function buildStoppedTabCaptureFallbackStatus(status, overrides = {}) {
    const incoming = {
      ...(status || {}),
      ...overrides
    };

    return {
      ...incoming,
      enabled: incoming.enabled !== false,
      sourceType: incoming.sourceType || "media-html",
      mediaDetected: Math.max(0, Number(incoming.mediaDetected) || 0),
      mediaProcessed: Math.max(0, Number(incoming.mediaProcessed) || 0),
      captureSignalState: "no-signal",
      captureFallbackRecommended: true,
      captureFallbackReason: incoming.captureFallbackReason || "tab-capture-no-signal",
      contextState: "",
      audioTrackCount: 0,
      captureTrackState: "",
      captureMuted: false,
      captureRestartDeferred: false,
      lastError: incoming.lastError || "Capture d'onglet sans signal Web Audio exploitable. La source reste visible en observation ; fallback Windows seulement si l'app desktop est connectee."
    };
  }

  async function stopSilentTabCapture(tabId) {
    try {
      await sendRuntimeMessage({ target: "offscreen", type: "WLG_STOP_TAB_CAPTURE", tabId });
    } catch (error) {
      // Best-effort: the fallback status below must still replace the stale live capture status.
    }

      clearCaptureStatus(tabId);
  }

  function markSilentMediaUpgradeCooldown(tabId, reason) {
    const normalizedTabId = Number(tabId);
    if (!normalizedTabId) return;

    silentMediaUpgradeCandidates.delete(normalizedTabId);
    silentMediaUpgradeCooldowns.set(normalizedTabId, {
      reason: reason || "cooldown",
      untilMs: Date.now() + SILENT_MEDIA_UPGRADE_COOLDOWN_MS
    });
  }

  function isSilentMediaUpgradeCoolingDown(tabId) {
    const normalizedTabId = Number(tabId);
    if (!normalizedTabId) return false;

    const cooldown = silentMediaUpgradeCooldowns.get(normalizedTabId);
    if (!cooldown) return false;
    if (Date.now() < Number(cooldown.untilMs)) return true;

    silentMediaUpgradeCooldowns.delete(normalizedTabId);
    return false;
  }

  function getMediaHtmlFallbackReasonForUpgrade(source) {
    const fallbackReason = String(
      source && (
        source.captureFallbackReason ||
        source.fallbackReason ||
        source.calibrationReason ||
        ""
      )
    );
    return mediaHtmlFallbackReasonsForUpgrade.has(fallbackReason) ? fallbackReason : "";
  }

  function allowsStandaloneSilentMediaUpgrade(status) {
    return Boolean(getMediaHtmlFallbackReasonForUpgrade(status));
  }

  function shouldUpgradeSilentMediaToTabCapture(tab, status) {
    if (!status || typeof status !== "object") return false;
    const source = status;
    if (!tab || !tab.id || !canCaptureTab() || !canInjectUrl(tab.url)) return false;
    if (!(tab.audible === true)) return false;
    if (status.sourceType !== "media-html") return false;
    const fallbackReason = getMediaHtmlFallbackReasonForUpgrade(source);
    const canUpgradeFallbackReason = mediaHtmlFallbackReasonsForUpgrade.has(fallbackReason);
    if (source.controlSurface !== "BrowserGain" && !canUpgradeFallbackReason) return false;
    if ((source.isControllable === false && !canUpgradeFallbackReason) || source.status === "Excluded") return false;
    if (getCaptureStatus(tab.id) && getCaptureStatus(tab.id).enabled) return false;
    if (isSilentMediaUpgradeCoolingDown(tab.id)) return false;

    const currentLevel = Number(source.currentLevel);
    return canUpgradeFallbackReason || (Number.isFinite(currentLevel) && currentLevel <= SILENT_MEDIA_UPGRADE_LEVEL_THRESHOLD);
  }

  function recordSilentMediaUpgradeCandidate(tab, status) {
    if (!shouldUpgradeSilentMediaToTabCapture(tab, status)) {
      if (tab && tab.id) silentMediaUpgradeCandidates.delete(tab.id);
      return false;
    }

    const source = status && typeof status === "object" ? status : {};
    const sourceKey = source.sourceId || source.sourceType || "media-html";
    const previous = silentMediaUpgradeCandidates.get(tab.id);
    const count = previous && previous.sourceKey === sourceKey ? Number(previous.count) + 1 : 1;

    silentMediaUpgradeCandidates.set(tab.id, {
      count,
      sourceKey,
      lastSeenMs: Date.now()
    });

    if (getMediaHtmlFallbackReasonForUpgrade(source)) return true;
    return count >= SILENT_MEDIA_UPGRADE_MIN_REPORTS;
  }

  async function maybeUpgradeSilentMediaToTabCapture(sender, status) {
    const tab = sender && sender.tab ? sender.tab : null;
    if (!tab || !tab.id) return;

    const bridgeConnected = await hasDesktopBridgeForSilentMediaUpgrade();
    if (!bridgeConnected && !allowsStandaloneSilentMediaUpgrade(status)) {
      silentMediaUpgradeCandidates.delete(tab.id);
      return;
    }

    if (!recordSilentMediaUpgradeCandidate(tab, status)) return;
    if (silentMediaUpgradeInFlight.has(tab.id)) return;

    silentMediaUpgradeInFlight.add(tab.id);
    silentMediaUpgradeCandidates.delete(tab.id);

    try {
      if (bridgeConnected) {
        await forwardExtensionLogToBridge({
          eventName: "browser.media_html_silent_upgrade",
          message: "Media HTML is silent while the tab is audible; switching to tab capture.",
          severity: "info",
          tabId: tab.id,
          siteName: getDomainFromUrl(tab.url),
          status: "Unknown",
          controlSurface: "ObserveOnly"
        });
      }

      const result = await startTabCaptureForTab(tab, { replaceMedia: true, reason: "media-html-silent" });
      if (result && result.ok === false) {
        markSilentMediaUpgradeCooldown(tab.id, "tab-capture-start-failed");
        if (bridgeConnected) {
          await forwardExtensionLogToBridge({
            eventName: "browser.media_html_silent_upgrade_failed",
            message: result.error || "Silent media HTML upgrade to tab capture failed.",
            severity: "warn",
            tabId: tab.id,
            siteName: getDomainFromUrl(tab.url),
            status: "Unknown",
            controlSurface: "ObserveOnly"
          });
        }
      }
    } catch (error) {
      markSilentMediaUpgradeCooldown(tab.id, "tab-capture-start-error");
      if (bridgeConnected) {
        await forwardExtensionLogToBridge({
          eventName: "browser.media_html_silent_upgrade_failed",
          message: error && error.message ? error.message : "Silent media HTML upgrade to tab capture failed.",
          severity: "warn",
          tabId: tab.id,
          siteName: getDomainFromUrl(tab.url),
          status: "Unknown",
          controlSurface: "ObserveOnly"
        });
      }
    } finally {
      silentMediaUpgradeInFlight.delete(tab.id);
    }
  }

  function baseStatusForTab(tab) {
    const normalWebTab = /^https?:\/\//i.test(tab && tab.url ? tab.url : "");
    const captureAvailable = canCaptureTab();
    return {
      ok: true,
      installed: false,
      enabled: false,
      sourceType: "none",
      panicActive: false,
      site: getDomainFromTab(tab),
      canInject: Boolean(getDomainFromTab(tab)) || canInjectUrl(tab && tab.url),
      canCaptureTab: captureAvailable,
      captureSignalState: captureAvailable && normalWebTab ? "needs-user-action" : captureAvailable ? "restricted" : "unsupported",
      captureFallbackRecommended: false,
      captureFallbackReason: "",
      mediaDetected: 0,
      mediaProcessed: 0,
      gainDb: 0,
      rmsDb: -120,
      peakDb: -120,
      predictedPeakDb: -120,
      riskLevel: "safe",
      containedPeakCount: 0,
      origin: "BrowserExtension",
      browserState: "observe-only",
      controlSurface: "Unknown",
      status: "Unknown",
      isControllable: false,
      reason: captureAvailable && normalWebTab ? "needs-user-action" : captureAvailable ? "restricted" : "unsupported",
      recommendedAction: captureAvailable && normalWebTab
        ? "Cliquer Proteger l'onglet actif."
        : "Utiliser un navigateur Chromium compatible ou le fallback Windows/OBS."
    };
  }

  function captureSignalStateForUnavailableReason(reason) {
    if (reason === "tab-capture-restricted") return "restricted";
    if (reason === "tab-capture-start-failed") return "restricted";
    if (reason === "tab-capture-needs-user-action") return "needs-user-action";
    return "unsupported";
  }

  function tabCaptureUnavailableMessage(reason) {
    if (reason === "tab-capture-restricted") {
      return "Capture d'onglet bloquee sur cette page. Utilise le fallback Windows ou OBS.";
    }
    if (reason === "tab-capture-needs-user-action") {
      return "Clique sur Proteger l'onglet actif pour demarrer la capture d'onglet.";
    }
    return "Capture d'onglet indisponible sur ce navigateur. Utilise Chrome, Brave ou Edge, sinon fallback Windows ou OBS.";
  }

  function buildTabCaptureUnavailableStatus(tab, reason) {
    const fallbackReason = reason || "tab-capture-unsupported";
    return {
      ...baseStatusForTab(tab),
      ok: false,
      installed: false,
      enabled: false,
      sourceType: "tab-capture",
      mode: "tab-capture",
      status: "Unknown",
      controlSurface: "ObserveOnly",
      captureSignalState: captureSignalStateForUnavailableReason(fallbackReason),
      captureFallbackRecommended: true,
      captureFallbackReason: fallbackReason,
      lastError: tabCaptureUnavailableMessage(fallbackReason),
      error: tabCaptureUnavailableMessage(fallbackReason)
    };
  }

  function markMediaHtmlNoMediaAsDesktopFallback(tab, status, globalEnabled) {
    const site = (status && status.site) || getDomainFromTab(tab);
    if (!status || !globalEnabled || status.sourceType !== "media-html") return status;
    if (Settings.getPreferredSourceTypeForDomain(site) !== "tab-capture") return status;
    if (Number(status.mediaDetected) > 0 || Number(status.mediaProcessed) > 0) return status;

    return {
      ...status,
      enabled: true,
      site,
      status: "Unknown",
      controlSurface: "ObserveOnly",
      isControllable: false,
      captureFallbackRecommended: true,
      captureFallbackReason: "no-media-element-detected",
      lastError: status.lastError || "Aucun media HTML controlable detecte. La source reste visible en observation ; fallback Windows seulement si l'app desktop est connectee."
    };
  }

  function mergeStatus(tab, contentStatus, globalEnabled = true) {
    const base = contentStatus || baseStatusForTab(tab);
    const captureStatus = tab && tab.id ? getCaptureStatus(tab.id) : null;
    const shared = markMediaHtmlNoMediaAsDesktopFallback(tab, {
      ...base,
      site: base.site || getDomainFromTab(tab),
      canInject: Boolean(base.installed) || Boolean(base.canInject) || Boolean(getDomainFromTab(tab)) || canInjectUrl(tab && tab.url),
      canCaptureTab: canCaptureTab(),
      tabAudible: Boolean(tab && tab.audible),
      tabActive: Boolean(tab && tab.active),
      enabled: Boolean(base.enabled) && Boolean(globalEnabled)
    }, Boolean(globalEnabled));
    const hasActiveCaptureStatus = Boolean(captureStatus && captureStatus.enabled && globalEnabled);

    if (hasActiveCaptureStatus) {
      const debouncedTabAudible = typeof captureStatus.tabAudible === "boolean"
        ? Boolean(captureStatus.tabAudible)
        : Boolean(tab && tab.audible);
      const mergedStatus = withBrowserClassification({
        ...shared,
        ...captureStatus,
        tabAudible: debouncedTabAudible,
        tabActive: shared.tabActive,
        canInject: shared.canInject,
        canCaptureTab: canCaptureTab()
      });
      if (tab && tab.id) {
        maybePersistSourceMemoryFromCaptureStatus(tab.id, mergedStatus, captureStatus);
      }
      return mergedStatus;
    }

    const mergedStatus = withBrowserClassification(shared);
    if (tab && tab.id) {
      maybePersistSourceMemoryFromCaptureStatus(tab.id, mergedStatus, null);
    }
    return mergedStatus;
  }

  function syncCaptureListeningState(tabId, tab) {
    const captureStatus = getCaptureStatus(tabId);
    if (!captureStatus) return;

    const hasAudibleUpdate = Boolean(tab && Object.prototype.hasOwnProperty.call(tab, "audible"));
    const hasActiveUpdate = Boolean(tab && Object.prototype.hasOwnProperty.call(tab, "active"));
    const nextTabAudible = hasAudibleUpdate
      ? resolveDebouncedAudible(tabId, Boolean(tab.audible), captureStatus.tabAudible)
      : captureStatus.tabAudible;
    const nextTabActive = hasActiveUpdate ? Boolean(tab.active) : captureStatus.tabActive;
    if (captureStatus.tabAudible === nextTabAudible && captureStatus.tabActive === nextTabActive) {
      return captureStatus;
    }

    const updatedStatus = updateCaptureStatus(tabId, {
      tabAudible: nextTabAudible,
      tabActive: nextTabActive
    });
    forwardCaptureStatusToBridge(tabId, updatedStatus).catch(() => {});

    if (updatedStatus.tabAudible && updatedStatus.captureSignalState === "waiting-for-audio") {
      maybeRestartWaitingCapture(tabId);
    }

    return updatedStatus;
  }

  function syncCaptureListeningStateById(tabId) {
    if (!tabId) return;
    return getTabById(tabId).then((tab) => {
      if (!tab || !tab.id) return null;
      return syncCaptureListeningState(tabId, tab);
    });
  }

  function startCaptureListeningPoller() {
    if (captureListeningPollTimer || !hasActiveCaptureStatuses()) return;
    captureListeningPollTimer = setInterval(() => {
      void syncCaptureListeningPoll();
    }, TAB_LISTENING_POLL_MS);
  }

  function stopCaptureListeningPoller() {
    if (!captureListeningPollTimer || hasActiveCaptureStatuses()) return;
    clearInterval(captureListeningPollTimer);
    captureListeningPollTimer = null;
    captureListeningPollInFlight = false;
  }

  async function syncCaptureListeningPoll() {
    if (captureListeningPollInFlight || !hasActiveCaptureStatuses()) {
      if (!hasActiveCaptureStatuses()) {
        stopCaptureListeningPoller();
      }
      return;
    }
    captureListeningPollInFlight = true;
    try {
      const tabIds = Array.from(captureStatuses.keys());
      for (const tabId of tabIds) {
        const status = getCaptureStatus(tabId);
        if (!status || !status.enabled) continue;
        await syncCaptureListeningStateById(tabId);
      }
    } finally {
      captureListeningPollInFlight = false;
      stopCaptureListeningPoller();
      startCaptureListeningPoller();
    }
  }

  async function ensureOffscreenDocument() {
    if (!canCaptureTab()) {
      throw new Error("tabCapture is not available in this browser build.");
    }

    if (chrome.offscreen.hasDocument) {
      const exists = await chrome.offscreen.hasDocument();
      if (exists) return;
    }

    return new Promise((resolve, reject) => {
      chrome.offscreen.createDocument(
        {
          url: "offscreen/offscreen.html",
          reasons: ["AUDIO_PLAYBACK"],
          justification: "StreamVolume Guard Hub processes captured tab audio locally."
        },
        () => {
          if (chrome.runtime.lastError) {
            const message = chrome.runtime.lastError.message || "Could not create offscreen document.";
            if (/Only a single offscreen document/i.test(message)) {
              resolve();
              return;
            }
            reject(new Error(message));
            return;
          }
          resolve();
        }
      );
    });
  }

  function getTabCaptureStreamId(tabId) {
    return new Promise((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
        if (chrome.runtime.lastError || !streamId) {
          reject(new Error(chrome.runtime.lastError ? chrome.runtime.lastError.message : "No tab capture stream id."));
          return;
        }
        resolve(streamId);
      });
    });
  }

  async function injectAndSet(tab, enabled) {
    if (!tab || !tab.id) {
      return {
        ok: false,
        error: "This tab cannot be processed by a Chrome extension content script."
      };
    }

    const site = await getTabSite(tab);
    const canProcessTab = Boolean(site) || canInjectUrl(tab.url);

    if (enabled) {
      const settings = await Settings.getSettings();
      if (!settings || !settings.enabled) {
        return {
          ok: false,
          enabled: false,
          sourceType: "none",
          site,
          canInject: canProcessTab,
          canCaptureTab: canCaptureTab(),
          error: "Global extension toggle is disabled."
      };
      }
    }

    const captureStatus = getCaptureStatus(tab.id);
    if (enabled && captureStatus && captureStatus.enabled) {
      return {
        ok: false,
        enabled: true,
        sourceType: "tab-capture",
        error: "Capture d'onglet deja active. Arrete la capture avant d'activer l'onglet."
      };
    }

    await executeScripts(tab.id);
    const settings = site
      ? Settings.getSettingsForDomain(await getSettingsWithGlobalTarget(), site)
      : await getSettingsWithGlobalTarget();
    const response = await sendMessageWithRetry(tab.id, {
      type: "WLG_SET_ENABLED",
      enabled: Boolean(enabled),
      mode: "manual",
      settings
    });

    if (!response) {
      return {
        ok: false,
        enabled: false,
        sourceType: "media-html",
        site,
        canInject: canProcessTab,
        canCaptureTab: canCaptureTab(),
        error: "Activation impossible sur cet onglet. Recharge la page, relance l'extension, puis reessaie."
      };
    }

    return {
      ...response,
      site: response.site || site
    };
  }

  async function fallbackSilentCaptureToMedia(tabId, status) {
    const globalSettings = await Settings.getSettings();
    if (!globalSettings || !globalSettings.enabled) {
      const disabledStatus = {
        ...status,
        enabled: false,
        captureFallbackReason: status && status.captureFallbackReason ? status.captureFallbackReason : "manual-disable",
        lastError: "Manual extension stop active: tab capture fallback is disabled."
      };
      updateCaptureStatus(tabId, disabledStatus);
      forwardCaptureStatusToBridge(tabId, disabledStatus).catch(() => {});
      return disabledStatus;
    }
    if (isGlobalDisableCooldownActive()) {
      const cooldownStatus = {
        ...status,
        enabled: false,
        captureFallbackReason: "manual-disable-cooldown",
        lastError: "Disable request in progress. Fallback media-html will stay dormant until rearmed."
      };
      updateCaptureStatus(tabId, cooldownStatus);
      forwardCaptureStatusToBridge(tabId, cooldownStatus).catch(() => {});
      return cooldownStatus;
    }

    const tab = await getTabById(tabId);
    markSilentMediaUpgradeCooldown(tabId, "tab-capture-no-signal");
    const observedFallbackStatus = buildStoppedTabCaptureFallbackStatus(status, {
      enabled: true,
      sourceType: "media-html",
      mediaDetected: Math.max(1, Number(status && status.mediaDetected) || 0),
      mediaProcessed: 0,
      captureFallbackReason: "tab-capture-no-signal",
      lastError: "Capture d'onglet sans signal Web Audio exploitable. La source reste visible en observation ; fallback Windows seulement si l'app desktop est connectee."
    });

    await stopSilentTabCapture(tabId);

    if (!tab || !tab.id || !canInjectUrl(tab.url)) {
      updateCaptureStatus(tabId, observedFallbackStatus);
      forwardCaptureStatusToBridge(tabId, observedFallbackStatus).catch(() => {});
      return observedFallbackStatus;
    }

    const fallbackStatus = await injectAndSet(tab, true);
    if (fallbackStatus && fallbackStatus.ok === false) {
      const failedFallbackStatus = buildStoppedTabCaptureFallbackStatus(observedFallbackStatus, {
        lastError: fallbackStatus.error || observedFallbackStatus.lastError
      });
      updateCaptureStatus(tabId, failedFallbackStatus);
      forwardCaptureStatusToBridge(tabId, failedFallbackStatus).catch(() => {});
      return failedFallbackStatus;
    }
    if (shouldKeepDesktopFallbackAfterMediaFallback(fallbackStatus)) {
      const mediaFallbackObservation = buildStoppedTabCaptureFallbackStatus(observedFallbackStatus, {
        ...(fallbackStatus || {}),
        enabled: true,
        sourceType: "media-html",
        mediaDetected: Number(fallbackStatus.mediaDetected) || observedFallbackStatus.mediaDetected,
        mediaProcessed: Number(fallbackStatus.mediaProcessed) || 0,
        captureFallbackReason: observedFallbackStatus.captureFallbackReason,
        lastError: fallbackStatus.lastError || fallbackStatus.error || "Fallback media HTML actif mais aucun media controlable. La source reste visible en observation ; fallback Windows seulement si l'app desktop est connectee."
      });
      updateCaptureStatus(tabId, mediaFallbackObservation);
      forwardCaptureStatusToBridge(tabId, mediaFallbackObservation).catch(() => {});
      return mediaFallbackObservation;
    }
    return fallbackStatus;
  }

  async function getStatusForActiveTab(tabId) {
    const tab = tabId ? await getTabById(Number(tabId)) : await getActiveTab();
    const settings = await Settings.getSettings();
    const globalEnabled = Boolean(settings && settings.enabled);
    let activeStatus = null;

    if (!tab || !tab.id) {
      const observedStatus = await getBestObservedTabStatus(globalEnabled, 0);
      return observedStatus || {
        ok: false,
        installed: false,
        statusRoute: "no-active-tab",
        diagnosticReason: "missing-tab",
        error: "No active tab found.",
        lastError: "No active tab found.",
        canInject: false,
        canCaptureTab: canCaptureTab()
      };
    }

    const response = await sendMessage(tab.id, { type: "WLG_GET_STATUS" });
    const normalizedResponse = response && typeof response === "object"
      ? { ...response, enabled: Boolean(response.enabled) && globalEnabled }
      : response;
    activeStatus = mergeStatus(tab, normalizedResponse, globalEnabled);
    if (hasUsefulObservedStatus(activeStatus)) return activeStatus;

    const siteDetails = await getTabSiteDetails(tab);
    const site = siteDetails.site;
    if (site) {
      const tabWithSite = { ...tab, __wlgSite: site };
      const recoveredResponse = await sendMessage(tab.id, { type: "WLG_GET_STATUS" });
      const normalizedRecoveredResponse = recoveredResponse && typeof recoveredResponse === "object"
        ? { ...recoveredResponse, enabled: Boolean(recoveredResponse.enabled) && globalEnabled }
        : normalizedResponse;
      activeStatus = mergeStatus(tabWithSite, normalizedRecoveredResponse, globalEnabled);
      if (hasUsefulObservedStatus(activeStatus)) return activeStatus;
    }

    const diagnosticError = siteDetails.error || (activeStatus && activeStatus.error) || (activeStatus && activeStatus.lastError) || "";
    activeStatus = {
      ...(activeStatus || {}),
      ok: diagnosticError ? false : activeStatus && activeStatus.ok === false ? false : true,
      statusRoute: "active-tab-empty",
      diagnosticReason: siteDetails.reason,
      error: diagnosticError,
      lastError: siteDetails.error || (activeStatus && activeStatus.lastError) || (activeStatus && activeStatus.error) || "",
      canInject: Boolean(site) || canInjectUrl(tab.url),
      canCaptureTab: canCaptureTab()
    };

    if (tabId) return activeStatus;

    const observedStatus = await getBestObservedTabStatus(globalEnabled, tab && tab.id);
    if (observedStatus) return observedStatus;
    return activeStatus;
  }

  async function grantAutoDomainForActiveTab(tabId) {
    const tab = tabId ? await getTabById(Number(tabId)) : await getActiveTab();
    const domain = tab ? getDomainFromUrl(tab.url) : "";
    if (!domain) {
      return { ok: false, error: "No valid domain for this tab." };
    }

    const origins = originsForDomain(domain);
    const granted = await requestPermission(origins);
    if (!granted) {
      return { ok: false, granted: false, domain };
    }

    const settings = await Settings.getSettings();
    await Settings.saveSettings({
      autoDomains: Array.from(new Set([...(settings.autoDomains || []), domain]))
    });

    return { ok: true, granted: true, domain };
  }

  async function startTabCaptureForTab(tab, options) {
    const replaceMedia = Boolean(options && options.replaceMedia);
    const forceTabCapture = Boolean(options && options.forceTabCapture);
    const restartCount = Number(options && options.restartCount) || 0;
    const site = await getTabSite(tab);
    const tabWithSite = site ? { ...tab, __wlgSite: site } : tab;
    const preferredSourceType = Settings.getPreferredSourceTypeForDomain(site);
    const sourceMemoryLockUntil = isSourceNoSignalLocked(tab && tab.id, site)
      ? Math.max(getSourceNoSignalCooldownUntil(tab && tab.id), getSourceNoSignalDomainCooldownUntil(site))
      : 0;
    if (!forceTabCapture && site && preferredSourceType === "media-html") {
      return injectAndSet(tabWithSite, true);
    }
    if (!forceTabCapture && sourceMemoryLockUntil > 0) {
      if (tab && tab.id) {
        clearCaptureStatus(tab.id);
      }
      const noSignalStatus = buildNoSignalTabCaptureStatus(
        tabWithSite,
        Settings.getSettingsForDomain(await getSettingsWithGlobalTarget(), site),
        restartCount,
        sourceMemoryLockUntil
      );
      return fallbackTabCaptureStartToMedia(tabWithSite, noSignalStatus);
    }

    if (!tab || !tab.id || (!site && !/^https?:\/\//i.test(tab.url || ""))) {
      return buildTabCaptureUnavailableStatus(tab, "tab-capture-restricted");
    }
    if (!canCaptureTab()) {
      return buildTabCaptureUnavailableStatus(tabWithSite, "tab-capture-unsupported");
    }

    let shouldDisableMediaAfterCaptureStarts = false;
    const contentStatus = await sendMessage(tab.id, { type: "WLG_GET_STATUS" });
    if (contentStatus && contentStatus.enabled) {
      if (!replaceMedia) {
        return {
          ok: false,
          enabled: true,
          sourceType: contentStatus.sourceType || "media-html",
          site,
          error: "Desactive d'abord le traitement de l'onglet avant de capturer l'onglet."
        };
      }
      shouldDisableMediaAfterCaptureStarts = true;
    }

    const savedSettings = await getSettingsWithGlobalTarget();
    if (Settings.isDomainExcluded(site, savedSettings)) {
      return {
        ok: false,
        enabled: false,
        excluded: true,
        site,
        canInject: Boolean(site) || canInjectUrl(tab.url),
        canCaptureTab: canCaptureTab(),
        error: "This domain is excluded from StreamVolume Guard Hub."
      };
    }

    const settings = Settings.getSettingsForDomain(savedSettings, site);
    await ensureOffscreenDocument();
    const streamId = await getTabCaptureStreamId(tab.id);

    setCaptureStatus(tab.id, {
      ...baseStatusForTab(tabWithSite),
      installed: true,
      enabled: true,
      sourceType: "tab-capture",
      mode: "tab-capture",
      activeProfile: settings.activeProfile,
      captureSignalState: "starting",
      captureRestartCount: restartCount,
      captureRestartDeferred: false,
      tabAudible: Boolean(tab.audible),
      tabActive: Boolean(tab.active),
      lastError: "",
      updatedAt: Date.now()
    });

    const response = await sendRuntimeMessage({
      target: "offscreen",
      type: "WLG_START_TAB_CAPTURE",
      tabId: tab.id,
      streamId,
      site,
      settings,
      restartCount
    });

    const responseStatus = response && response.status ? response.status : null;
    const responseOutcome = responseStatus ? resolveSourceMemoryOutcome(responseStatus) : "";
    if (responseOutcome) {
      if (responseOutcome === "tab-capture-no-signal" && String(responseStatus.captureSignalState || "").toLowerCase() !== "signal") {
        setSourceNoSignalCooldowns(tab.id, site);
      }
      if (String(responseStatus.captureSignalState || "").toLowerCase() === "signal") {
        clearSourceNoSignalCooldowns(tab.id, site);
      }
      void persistSourceMemoryOutcome(
        site,
        "tab-capture",
        responseOutcome,
        String(
          (responseStatus && (responseStatus.captureFallbackReason || responseStatus.lastError)) ||
          (response && response.error) ||
          "tab-capture-start-status"
        )
      );
      if (responseOutcome === "tab-capture-no-signal") {
        const noSignalFallbackStatus = responseStatus && responseStatus.sourceType === "tab-capture"
          ? responseStatus
          : buildNoSignalTabCaptureStatus(
              tabWithSite,
              settings,
              restartCount,
              getSourceNoSignalCooldownUntil(tab.id)
            );
        const fallbackStatus = await fallbackTabCaptureStartToMedia(tabWithSite, noSignalFallbackStatus);
        clearCaptureStatus(tab.id);
        return fallbackStatus;
      }
    }

    if (!response.ok) {
      const startOutcome = response && response.status && response.status.captureFallbackReason === "tab-capture-no-signal"
        ? "tab-capture-no-signal"
        : "tab-capture-start-failed";
      if (startOutcome === "tab-capture-no-signal") {
        setSourceNoSignalCooldowns(tab.id, site);
      }
      void persistSourceMemoryOutcome(
        site,
        "tab-capture",
        startOutcome,
        response && response.error || String(response && response.status && response.status.lastError || "start-tab-capture-failed")
      );
      clearCaptureStatus(tab.id);
      if (startOutcome === "tab-capture-no-signal") {
        const noSignalFallbackStatus = response && response.status
          ? response.status
          : buildNoSignalTabCaptureStatus(
              tabWithSite,
              settings,
              restartCount,
              getSourceNoSignalCooldownUntil(tab.id)
            );
        const fallbackStatus = await fallbackTabCaptureStartToMedia(tabWithSite, noSignalFallbackStatus);
        return fallbackStatus;
      }
      return response;
    }

    if (shouldDisableMediaAfterCaptureStarts) {
      await sendMessage(tab.id, {
        type: "WLG_SET_ENABLED",
        enabled: false
      });
    }

    return mergeStatus(tabWithSite, response.status || captureStatuses.get(tab.id));
  }

  async function fallbackTabCaptureStartToMedia(tab, failedStatus) {
    const failure = failedStatus || buildTabCaptureUnavailableStatus(tab, "tab-capture-start-failed");
    const fallbackReason = failure && failure.captureFallbackReason ? failure.captureFallbackReason : "tab-capture-start-failed";
    if (!tab || !tab.id || (!getDomainFromTab(tab) && !canInjectUrl(tab.url))) {
      return failure;
    }

    await forwardExtensionLogToBridge({
      eventName: "browser.tab_capture_start_fallback",
      message: "Tab capture did not start; trying media-html fallback.",
      severity: "warn",
      tabId: tab.id,
      siteName: getDomainFromUrl(tab.url),
      status: "Unknown",
      controlSurface: "ObserveOnly",
      captureSignalState: failure.captureSignalState || "restricted",
      calibrationReason: failure.captureFallbackReason || "tab-capture-start-failed"
    });

    const fallbackStatus = await injectAndSet(tab, true);
    if (fallbackStatus && fallbackStatus.ok !== false) {
      clearCaptureStatus(tab.id);
      return {
        ...fallbackStatus,
        captureFallbackRecommended: false,
        captureFallbackReason: fallbackReason,
        lastError: fallbackStatus.lastError || ""
      };
    }

    return {
      ...failure,
      captureFallbackRecommended: true,
      captureFallbackReason: failure.captureFallbackReason || "tab-capture-start-failed",
      lastError: (fallbackStatus && fallbackStatus.error) || failure.lastError || failure.error || "Tab capture failed and media-html fallback is unavailable.",
      error: (fallbackStatus && fallbackStatus.error) || failure.error || "Tab capture failed and media-html fallback is unavailable."
    };
  }

  async function startTabCaptureForActiveTab(options) {
    const tabId = Number(options && options.tabId) || 0;
    return startTabCaptureForTab(tabId ? await getTabById(tabId) : await getActiveTab(), options);
  }

  async function restartTabCapture(tabId, restartCount) {
    const tab = await getTabById(tabId);
    if (!tab || !tab.id) {
      return { ok: false, error: "Onglet introuvable pour relancer la capture." };
    }

    const currentStatus = getCaptureStatus(tab.id);
    if (!currentStatus || currentStatus.sourceType !== "tab-capture") {
      return { ok: false, error: "Aucune capture d'onglet active a relancer." };
    }
    if (isSpotifyDomain(currentStatus.site || getDomainFromTab(tab))) {
      return {
        ok: true,
        status: updateCaptureStatus(tab.id, {
          captureSignalState: currentStatus.captureSignalState || "no-signal",
          captureRestartCount: Number(restartCount) || 1,
          captureRestartDeferred: false,
          lastError: ""
        })
      };
    }

    const requestedRestartCount = Number(restartCount) || 1;
    if (shouldDeferSilentCaptureRestart(tab)) {
      const status = updateCaptureStatus(tab.id, {
        captureSignalState: "waiting-for-audio",
        captureRestartDeferred: true,
        tabAudible: Boolean(tab.audible),
        tabActive: Boolean(tab.active),
        lastError: ""
      });
      return { ok: true, deferred: true, status };
    }

    if (requestedRestartCount > 1) {
      return {
        ok: false,
        status: currentStatus,
        error: "Relance automatique deja tentee pour cette capture."
      };
    }

    setCaptureStatus(tab.id, {
      ...currentStatus,
      captureSignalState: "restart-requested",
      captureRestartCount: requestedRestartCount,
      captureRestartDeferred: false,
      tabAudible: Boolean(tab.audible),
      tabActive: Boolean(tab.active),
      lastError: "Capture d'onglet silencieuse, relance automatique en cours.",
      updatedAt: Date.now()
    });

    await sendRuntimeMessage({ target: "offscreen", type: "WLG_STOP_TAB_CAPTURE", tabId: tab.id });
    clearCaptureStatus(tab.id);
    return startTabCaptureForTab(tab, { replaceMedia: true, restartCount: requestedRestartCount });
  }

  async function maybeRestartWaitingCapture(tabId) {
    const status = getCaptureStatus(tabId);
    if (!status || status.captureSignalState !== "waiting-for-audio") return;

    const tab = await getTabById(tabId);
    if (shouldDeferSilentCaptureRestart(tab)) {
      if (tab && tab.id) {
        updateCaptureStatus(tab.id, {
          tabAudible: Boolean(tab.audible),
          tabActive: Boolean(tab.active)
        });
      }
      return;
    }

    const nextRestartCount = (Number(status.captureRestartCount) || 0) + 1;
    restartTabCapture(tabId, nextRestartCount).catch((error) => {
      updateCaptureStatus(tabId, {
        lastError: error.message || "Relance automatique de capture impossible."
      });
    });
  }

  async function protectActiveTab(options) {
    const tabId = Number(options && options.tabId) || 0;
    const tab = tabId ? await getTabById(tabId) : await getActiveTab();
    if (!tab || !tab.id) return { ok: false, error: "No active tab found." };

    const site = await getTabSite(tab);
    const tabWithSite = site ? { ...tab, __wlgSite: site } : tab;
    const preferredSourceType = Settings.getPreferredSourceTypeForDomain(site);
    if (preferredSourceType === "tab-capture") {
      if (!canCaptureTab()) {
        return buildTabCaptureUnavailableStatus(tabWithSite, "tab-capture-unsupported");
      }

      let captureResult = null;
      try {
        captureResult = await startTabCaptureForActiveTab({ replaceMedia: true, tabId: tab.id });
      } catch (error) {
        captureResult = {
          ...buildTabCaptureUnavailableStatus(tabWithSite, "tab-capture-start-failed"),
          lastError: error && error.message ? error.message : "Tab capture start failed.",
          error: error && error.message ? error.message : "Tab capture start failed."
        };
      }
      if (captureResult && captureResult.ok !== false) {
        return captureResult;
      }

      return fallbackTabCaptureStartToMedia(tabWithSite, captureResult || buildTabCaptureUnavailableStatus(tabWithSite, "tab-capture-start-failed"));
    }

    return injectAndSet(tabWithSite, true);
  }

  async function stopTabCaptureForActiveTab(tabId) {
    const tab = tabId ? await getTabById(Number(tabId)) : await getActiveTab();
    if (!tab || !tab.id) return { ok: true, enabled: false };
    clearSourceNoSignalCooldowns(tab.id, getDomainFromTab(tab));
    clearSpotifyNoSignalCooldown(tab.id);
    await sendRuntimeMessage({ target: "offscreen", type: "WLG_STOP_TAB_CAPTURE", tabId: tab.id });
    clearCaptureStatus(tab.id);
    return getStatusForActiveTab(tab.id);
  }

  async function setPanicForActiveTab(active, tabId) {
    const tab = tabId ? await getTabById(Number(tabId)) : await getActiveTab();
    if (!tab || !tab.id) return { ok: false, error: "No active tab found." };

    const settings = await Settings.getSettings();
    const globalEnabled = Boolean(settings && settings.enabled);
    const contentResponse = await sendMessage(tab.id, { type: "WLG_SET_PANIC", active });
    const captureStatus = getCaptureStatus(tab.id);
    let updatedCaptureStatus = null;
    if (captureStatus && captureStatus.enabled) {
      const captureResponse = await sendRuntimeMessage({ target: "offscreen", type: "WLG_SET_CAPTURE_PANIC", tabId: tab.id, active });
      updatedCaptureStatus = captureResponse && captureResponse.status ? captureResponse.status : null;
    }

    return mergeStatus(tab, updatedCaptureStatus || contentResponse, globalEnabled);
  }

  async function refreshTab(tab, sourceSettings, forceEnabledFromSource = false) {
    if (!tab || !tab.id) return { ok: true };
    const site = getDomainFromUrl(tab.url);
    const forceEnabledFromSourceSetting = Boolean(forceEnabledFromSource);
    const liveSettings = await getSettingsWithGlobalTarget();
    const normalizedSourceSettings = sourceSettings && sourceSettings.__forceEnabledFromSource
      ? (() => {
          const next = { ...sourceSettings };
          delete next.__forceEnabledFromSource;
          return next;
        })()
      : sourceSettings;
    const mergedSettings = normalizedSourceSettings
      ? {
          ...liveSettings,
          ...normalizedSourceSettings,
          ...(forceEnabledFromSourceSetting ? {} : { enabled: Boolean(liveSettings && liveSettings.enabled) })
        }
      : liveSettings;
    const effectiveSettings = Settings.getSettingsForDomain(mergedSettings, site);
    const globalEnabled = Boolean((effectiveSettings || {}).enabled);
    const contentResponse = await sendMessage(tab.id, { type: "WLG_REFRESH_SETTINGS", settings: effectiveSettings });
    const normalizedContentResponse = contentResponse && typeof contentResponse === "object"
      ? { ...contentResponse, enabled: Boolean(contentResponse.enabled) && globalEnabled }
      : contentResponse;
    const captureStatus = getCaptureStatus(tab.id);
    let updatedCaptureStatus = null;
    if (captureStatus && captureStatus.enabled) {
      const site = captureStatus.site || getDomainFromUrl(tab.url);
      const savedSettings = effectiveSettings;
      if (Settings.isDomainExcluded(site, savedSettings)) {
        await sendRuntimeMessage({ target: "offscreen", type: "WLG_STOP_TAB_CAPTURE", tabId: tab.id });
        clearCaptureStatus(tab.id);
        return mergeStatus(tab, {
        ...normalizedContentResponse,
        enabled: false,
        excluded: true,
        sourceType: "none",
        site
      }, globalEnabled);
      }
      const settings = Settings.getSettingsForDomain(savedSettings, site);
      const captureResponse = await sendRuntimeMessage({ target: "offscreen", type: "WLG_UPDATE_CAPTURE_SETTINGS", tabId: tab.id, settings, site });
      updatedCaptureStatus = captureResponse && captureResponse.status ? captureResponse.status : null;
    }
    return mergeStatus(tab, updatedCaptureStatus || normalizedContentResponse, globalEnabled);
  }

  async function refreshActiveTab(tabId) {
    return refreshTab(tabId ? await getTabById(Number(tabId)) : await getActiveTab());
  }

  async function refreshOpenTabs(sourceSettings) {
    const tabs = await getAllTabs();
    const forceEnabledFromSource = Boolean(sourceSettings && sourceSettings.__forceEnabledFromSource);
    const sanitizedSourceSettings = sourceSettings && sourceSettings.__forceEnabledFromSource
      ? (() => {
          const next = { ...sourceSettings };
          delete next.__forceEnabledFromSource;
          return next;
        })()
      : sourceSettings;
    const refreshResults = await Promise.allSettled(tabs.map((tab) => refreshTab(tab, sanitizedSourceSettings, forceEnabledFromSource)));
    const fulfilledStatuses = refreshResults
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);
    return {
      ok: true,
      refreshed: fulfilledStatuses.filter((status) => status && (status.installed || status.sourceType !== "none")).length,
      failed: refreshResults.filter((result) => result.status === "rejected").length
    };
  }

  async function maybeAutoInject(tabId, tab) {
    if (!tab || !tab.url || !canInjectUrl(tab.url)) return;

    const settings = await getSettingsWithGlobalTarget();
    const domain = getDomainFromUrl(tab.url);
    if (!settings.enabled || !domain) return;
    if (Settings.isDomainExcluded(domain, settings)) return;
    if (!Settings.isDomainAutoEnabled(domain, settings)) return;

    const origins = originsForDomain(domain);
    const allowed = await containsPermission(origins);
    if (!allowed) return;

    try {
      await executeScripts(tabId);
      await sendMessage(tabId, {
        type: "WLG_SET_ENABLED",
        enabled: true,
        mode: "auto",
        settings: Settings.getSettingsForDomain(settings, domain)
      });
    } catch (error) {
      console.warn("StreamVolume Guard Hub auto activation failed.", error);
    }
  }

  chrome.runtime.onInstalled.addListener(() => {
    Settings.getSettings().then((settings) => Settings.saveSettings(settings));
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if ("audible" in changeInfo || "mutedInfo" in changeInfo) {
      if ("audible" in changeInfo) {
        const listeningTab = tab ? { ...tab, id: tabId } : { id: tabId };
        listeningTab.audible = changeInfo.audible;
        syncCaptureListeningState(tabId, listeningTab);
      } else {
        void syncCaptureListeningStateById(tabId);
      }
      maybeRestartWaitingCapture(tabId);
    }

    if (changeInfo.active && tab) {
      syncCaptureListeningState(tabId, tab);
    }

    if (changeInfo.status === "complete") {
      if (captureStatuses.has(tabId)) {
        clearCaptureStatus(tabId);
        sendRuntimeMessage({ target: "offscreen", type: "WLG_STOP_TAB_CAPTURE", tabId });
      }
      clearSourceNoSignalCooldown(tabId);
      maybeAutoInject(tabId, tab);
    }
  });

  chrome.tabs.onActivated.addListener((activeInfo) => {
    if (!activeInfo || !activeInfo.tabId) return;
    syncCaptureListeningStateById(activeInfo.tabId);
    maybeRestartWaitingCapture(activeInfo.tabId);
    void maybeSyncGlobalTargetForOpenTabs();
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    clearSourceNoSignalCooldown(tabId);
    clearSpotifyNoSignalCooldown(tabId);
    clearCaptureStatus(tabId);
    sendRuntimeMessage({ target: "offscreen", type: "WLG_STOP_TAB_CAPTURE", tabId });
  });

  async function handleCaptureStatusMessage(message) {
    if (message.tabId) {
      const normalizedStatus = normalizeIncomingCaptureStatus(message.tabId, message.status);
      const globalSettings = await Settings.getSettings();
      const previousStatus = getCaptureStatus(message.tabId);

      if (!globalSettings || !globalSettings.enabled) {
        const disabledStatus = updateCaptureStatus(
          message.tabId,
          {
            ...normalizedStatus,
            enabled: false,
            lastError: "Manual extension stop active."
          }
        );
        forwardCaptureStatusToBridge(message.tabId, disabledStatus).catch(() => {});
        return { ok: true, enabled: false };
      }

      if (message.status && message.status.enabled) {
        const captureSignalState = String(message.status.captureSignalState || "").toLowerCase();
        if (captureSignalState === "signal") {
          clearSourceNoSignalCooldowns(message.tabId, message.status.site);
        } else if (
          captureSignalState === "no-signal" &&
          message.status.sourceType === "tab-capture"
        ) {
          setSourceNoSignalCooldowns(message.tabId, message.status.site);
        }
        const updatedStatus = updateCaptureStatus(message.tabId, normalizedStatus);
        forwardCaptureStatusToBridge(message.tabId, updatedStatus).catch(() => {});
        maybePersistSourceMemoryFromCaptureStatus(message.tabId, updatedStatus, previousStatus);
        if (shouldFallbackSilentCaptureToMedia(updatedStatus)) {
          fallbackSilentCaptureToMedia(message.tabId, updatedStatus).catch((error) => {
            updateCaptureStatus(message.tabId, {
              captureFallbackReason: "tab-audible-but-web-audio-silent",
              lastError: error.message || "Fallback media HTML impossible apres capture d'onglet silencieuse."
            });
          });
        }
      } else {
        if (shouldPreserveSpotifyCaptureAfterTransientOff(message.tabId, normalizedStatus)) {
          const preservedStatus = updateCaptureStatus(message.tabId, {
            ...normalizedStatus,
            ...getCaptureStatus(message.tabId),
            enabled: true,
            captureFallbackRecommended: true,
            captureFallbackReason: "tab-capture-no-signal"
          });
          forwardCaptureStatusToBridge(message.tabId, preservedStatus).catch(() => {});
          return { ok: true, enabled: true };
        }

        if (isGlobalDisableCooldownActive()) {
          const disabledStatus = updateCaptureStatus(message.tabId, {
            ...normalizeIncomingCaptureStatus(message.tabId, message.status),
            enabled: false
          });
          forwardCaptureStatusToBridge(message.tabId, disabledStatus).catch(() => {});
          return { ok: true, enabled: false };
        }
        clearCaptureStatus(message.tabId);
      }
    }
    return { ok: true };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const type = message && message.type;

    if (type === "WLG_CAPTURE_STATUS") {
      handleCaptureStatusMessage(message)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (type === "WLG_BROWSER_SOURCE_STATUS") {
      forwardBrowserSourceStatus(sender, message.status)
        .then((response) => sendResponse(response || { ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (type === "WLG_EXTENSION_LOG") {
      const log = message.log || {};
      if (BROWSER_GAIN_CALIBRATION_EVENTS.has(log.eventName)) {
        log.severity = log.eventName === "browser.gain.skipped" ? "warn" : "info";
      }
      forwardExtensionLogToBridge(log)
        .then((response) => sendResponse(response || { ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (type === "WLG_RESTART_TAB_CAPTURE") {
      restartTabCapture(Number(message.tabId), Number(message.restartCount) || 1)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (type === "WLG_ACTIVATE_CURRENT_TAB") {
      activateCurrentTabWithGlobalState(message.tabId)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (type === "WLG_DEACTIVATE_CURRENT_TAB") {
      stopActiveTabWithGlobalState(message.tabId)
        .then((response) => sendResponse(response || { ok: true, enabled: false }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (type === "WLG_GET_ACTIVE_STATUS") {
      getStatusForActiveTab(message.tabId)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (type === "WLG_REQUEST_AUTO_DOMAIN_PERMISSION") {
      grantAutoDomainForActiveTab(message.tabId)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (type === "WLG_START_TAB_CAPTURE") {
      startTabCaptureForActiveTab({ replaceMedia: true, forceTabCapture: true, tabId: message.tabId })
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (type === "WLG_PROTECT_CURRENT_TAB") {
      activateCurrentTabWithGlobalState(message.tabId)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (type === "WLG_STOP_TAB_CAPTURE") {
      stopTabCaptureForActiveTab(message.tabId)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (type === "WLG_SET_PANIC") {
      setPanicForActiveTab(Boolean(message.active), message.tabId)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (type === "WLG_REFRESH_ACTIVE_TAB") {
      (message.scope === "all-open-tabs" ? refreshOpenTabs() : refreshActiveTab(message.tabId))
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    return false;
  });

  startPeriodicGlobalTargetSync();
  void maybeSyncGlobalTargetForOpenTabs();
})(globalThis);

