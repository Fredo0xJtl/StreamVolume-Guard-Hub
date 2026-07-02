// Service worker: injects the audio pipeline, tab capture fallback, and tab diagnostics.
(function initBackground(root) {
  try {
    if (!root.StreamVolumeGuard) {
      importScripts("storage/settings.js", "license/capabilities.js");
    }
    if (!root.StreamVolumeGuard || !root.StreamVolumeGuard.BridgeClient) {
      importScripts("bridge/client.js");
    }
  } catch (error) {
    console.warn("StreamVolume Guard Hub could not import shared scripts.", error);
  }

  const WLG = root.StreamVolumeGuard = root.StreamVolumeGuard || {};
  const Settings = WLG.Settings;
  const captureStatuses = new Map();
  const GLOBAL_TARGET_SYNC_INTERVAL_MS = 1500;
  let lastGlobalTargetSignature = "";
  let lastGlobalTargetSyncMs = 0;
  let globalTargetSyncPromise = null;

  const SCRIPT_FILES = [
    "storage/settings.js",
    "license/capabilities.js",
    "audio/analyser.js",
    "audio/limiter.js",
    "audio/stream-status.js",
    "audio/normalizer.js",
    "content.js"
  ];

  function getActiveTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs && tabs[0] ? tabs[0] : null);
      });
    });
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

  function normalizeBridgeStatus(tab, status) {
    const source = status && typeof status === "object" ? status : {};
    const tabId = tab && tab.id ? Number(tab.id) : Number(source.tabId) || null;
    const site = source.siteName || (tab ? getDomainFromUrl(tab.url) : "") || "Unknown site";
    const controlSurface = source.controlSurface === "BrowserGain" || source.controlSurface === "ObserveOnly"
      ? source.controlSurface
      : "Unknown";

    return {
      browserProcess: source.browserProcess || "",
      sourceId: `tab-${tabId || "unknown"}:${source.sourceId || source.sourceType || "media"}`,
      tabId,
      siteName: site,
      title: source.title || "",
      currentLevel: source.currentLevel,
      appliedGain: source.appliedGain,
      targetRmsDb: source.targetRmsDb,
      targetProfile: source.targetProfile || source.activeProfile || "",
      status: source.status || "Unknown",
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
    const controlSurface = source.enabled && captureSignalState === "signal" ? "BrowserGain" : "ObserveOnly";

    return {
      browserProcess: source.browserProcess || "",
      sourceId: `tab-capture:${normalizedTabId || "unknown"}`,
      tabId: normalizedTabId,
      siteName: site,
      title: site ? `${site} tab capture` : "Tab capture",
      currentLevel: dbToScalar(source.outputRmsDb ?? source.rmsDb),
      appliedGain: gainDbToScalar(source.gainDb),
      targetRmsDb: source.targetRmsDb,
      targetProfile: source.targetProfile || source.activeProfile || "",
      status: mapCaptureStatusToBridgeStatus(source),
      lastSeen: new Date(source.updatedAt || Date.now()).toISOString(),
      origin: "BrowserExtension",
      controlSurface
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
    return WLG.BridgeClient.sendBrowserSourceObserved(message);
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
        targetRmsDb: source.targetRmsDb,
        targetProfile: source.targetProfile || source.activeProfile || ""
      });
    }

    return result;
  }

  async function getSettingsWithGlobalTarget() {
    const savedSettings = await Settings.getSettings();
    if (!WLG.BridgeClient || !WLG.BridgeClient.fetchGlobalTargetState || !Settings.applyGlobalTarget) {
      return savedSettings;
    }

    try {
      const response = await WLG.BridgeClient.fetchGlobalTargetState();
      if (response && response.ok && response.state) {
        return Settings.applyGlobalTarget(savedSettings, response.state);
      }
    } catch (error) {
      // Best-effort bridge sync only. Local extension settings remain the fallback.
    }

    return savedSettings;
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

  function updateCaptureStatus(tabId, partial) {
    const previous = captureStatuses.get(tabId) || {};
    const status = {
      ...previous,
      ...partial,
      updatedAt: Date.now()
    };
    captureStatuses.set(tabId, status);
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

    if (incoming.captureSignalState === "no-signal" && incoming.tabAudible !== true) {
      incoming.captureSignalState = "waiting-for-audio";
      incoming.captureRestartDeferred = true;
      incoming.lastError = "";
    }

    return incoming;
  }

  function shouldFallbackSilentCaptureToMedia(status) {
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

  function baseStatusForTab(tab) {
    return {
      ok: true,
      installed: false,
      enabled: false,
      sourceType: "none",
      panicActive: false,
      site: getDomainFromUrl(tab && tab.url),
      canInject: canInjectUrl(tab && tab.url),
      canCaptureTab: canCaptureTab(),
      mediaDetected: 0,
      mediaProcessed: 0,
      gainDb: 0,
      rmsDb: -120,
      peakDb: -120,
      predictedPeakDb: -120,
      riskLevel: "safe",
      containedPeakCount: 0
    };
  }

  function mergeStatus(tab, contentStatus) {
    const base = contentStatus || baseStatusForTab(tab);
    const captureStatus = tab && tab.id ? getCaptureStatus(tab.id) : null;
    const shared = {
      ...base,
      site: base.site || getDomainFromUrl(tab && tab.url),
      canCaptureTab: canCaptureTab()
    };

    if (captureStatus && captureStatus.enabled) {
      return {
        ...shared,
        ...captureStatus,
        canInject: shared.canInject,
        canCaptureTab: canCaptureTab()
      };
    }

    return shared;
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
    if (!tab || !tab.id || !canInjectUrl(tab.url)) {
      return {
        ok: false,
        error: "This tab cannot be processed by a Chrome extension content script."
      };
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
    const settings = await getEffectiveSettingsForDomain(getDomainFromUrl(tab.url));
    const response = await sendMessage(tab.id, {
      type: "WLG_SET_ENABLED",
      enabled: Boolean(enabled),
      mode: "manual",
      settings
    });

    return response || { ok: true };
  }

  async function fallbackSilentCaptureToMedia(tabId, status) {
    const tab = await getTabById(tabId);
    if (!tab || !tab.id || !canInjectUrl(tab.url)) {
      updateCaptureStatus(tabId, {
        ...status,
        captureFallbackReason: "tab-audible-but-web-audio-silent",
        lastError: "Capture d'onglet sans signal Web Audio exploitable, et fallback media HTML impossible sur cet onglet."
      });
      return null;
    }

    await sendRuntimeMessage({ target: "offscreen", type: "WLG_STOP_TAB_CAPTURE", tabId });
    captureStatuses.delete(tabId);
    const fallbackStatus = await injectAndSet(tab, true);
    if (fallbackStatus && fallbackStatus.ok === false) {
      updateCaptureStatus(tabId, {
        ...status,
        enabled: false,
        sourceType: "none",
        captureFallbackReason: "tab-audible-but-web-audio-silent",
        lastError: fallbackStatus.error || "Capture d'onglet sans signal Web Audio exploitable, fallback media HTML impossible."
      });
    }
    return fallbackStatus;
  }

  async function getStatusForActiveTab() {
    const tab = await getActiveTab();
    if (!tab || !tab.id) {
      return { ok: false, installed: false, error: "No active tab found." };
    }

    const response = await sendMessage(tab.id, { type: "WLG_GET_STATUS" });
    return mergeStatus(tab, response);
  }

  async function grantAutoDomainForActiveTab() {
    const tab = await getActiveTab();
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
    const restartCount = Number(options && options.restartCount) || 0;
    if (!tab || !tab.id || !/^https?:\/\//i.test(tab.url || "")) {
      return { ok: false, error: "Tab capture needs a normal web tab." };
    }
    if (!canCaptureTab()) {
      return { ok: false, canCaptureTab: false, error: "tabCapture is not available in this browser." };
    }

    const site = getDomainFromUrl(tab.url);
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
      await sendMessage(tab.id, { type: "WLG_SET_ENABLED", enabled: false });
    }

    const savedSettings = await getSettingsWithGlobalTarget();
    if (Settings.isDomainExcluded(site, savedSettings)) {
      return {
        ok: false,
        enabled: false,
        excluded: true,
        site,
        canInject: canInjectUrl(tab.url),
        canCaptureTab: canCaptureTab(),
        error: "This domain is excluded from StreamVolume Guard Hub."
      };
    }

    const settings = Settings.getSettingsForDomain(savedSettings, site);
    await ensureOffscreenDocument();
    const streamId = await getTabCaptureStreamId(tab.id);

    captureStatuses.set(tab.id, {
      ...baseStatusForTab(tab),
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

    if (!response.ok) {
      captureStatuses.delete(tab.id);
      return response;
    }

    return mergeStatus(tab, response.status || captureStatuses.get(tab.id));
  }

  async function startTabCaptureForActiveTab(options) {
    return startTabCaptureForTab(await getActiveTab(), options);
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

    captureStatuses.set(tab.id, {
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
    captureStatuses.delete(tab.id);
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

  async function protectActiveTab() {
    const tab = await getActiveTab();
    if (!tab || !tab.id) return { ok: false, error: "No active tab found." };

    const site = getDomainFromUrl(tab.url);
    const preferredSourceType = Settings.getPreferredSourceTypeForDomain(site);
    if (preferredSourceType === "tab-capture" && !canCaptureTab()) {
      return {
        ok: false,
        enabled: false,
        sourceType: "tab-capture",
        site,
        canCaptureTab: false,
        error: "Capture d'onglet indisponible sur ce navigateur. TikTok ne peut pas etre protege correctement avec le mode media HTML."
      };
    }
    if (preferredSourceType === "tab-capture" && canCaptureTab()) {
      return startTabCaptureForActiveTab({ replaceMedia: true });
    }

    return injectAndSet(tab, true);
  }

  async function stopTabCaptureForActiveTab() {
    const tab = await getActiveTab();
    if (!tab || !tab.id) return { ok: true, enabled: false };
    await sendRuntimeMessage({ target: "offscreen", type: "WLG_STOP_TAB_CAPTURE", tabId: tab.id });
    captureStatuses.delete(tab.id);
    return getStatusForActiveTab();
  }

  async function setPanicForActiveTab(active) {
    const tab = await getActiveTab();
    if (!tab || !tab.id) return { ok: false, error: "No active tab found." };

    const contentResponse = await sendMessage(tab.id, { type: "WLG_SET_PANIC", active });
    const captureStatus = getCaptureStatus(tab.id);
    let updatedCaptureStatus = null;
    if (captureStatus && captureStatus.enabled) {
      const captureResponse = await sendRuntimeMessage({ target: "offscreen", type: "WLG_SET_CAPTURE_PANIC", tabId: tab.id, active });
      updatedCaptureStatus = captureResponse && captureResponse.status ? captureResponse.status : null;
    }

    return mergeStatus(tab, updatedCaptureStatus || contentResponse);
  }

  async function refreshTab(tab, sourceSettings) {
    if (!tab || !tab.id) return { ok: true };
    const site = getDomainFromUrl(tab.url);
    const effectiveSettings = sourceSettings
      ? Settings.getSettingsForDomain(sourceSettings, site)
      : await getEffectiveSettingsForDomain(site);
    const contentResponse = await sendMessage(tab.id, { type: "WLG_REFRESH_SETTINGS", settings: effectiveSettings });
    const captureStatus = getCaptureStatus(tab.id);
    let updatedCaptureStatus = null;
    if (captureStatus && captureStatus.enabled) {
      const site = captureStatus.site || getDomainFromUrl(tab.url);
      const savedSettings = effectiveSettings;
      if (Settings.isDomainExcluded(site, savedSettings)) {
        await sendRuntimeMessage({ target: "offscreen", type: "WLG_STOP_TAB_CAPTURE", tabId: tab.id });
        captureStatuses.delete(tab.id);
        return mergeStatus(tab, {
          ...contentResponse,
          enabled: false,
          excluded: true,
          sourceType: "none",
          site
        });
      }
      const settings = Settings.getSettingsForDomain(savedSettings, site);
      const captureResponse = await sendRuntimeMessage({ target: "offscreen", type: "WLG_UPDATE_CAPTURE_SETTINGS", tabId: tab.id, settings, site });
      updatedCaptureStatus = captureResponse && captureResponse.status ? captureResponse.status : null;
    }
    return mergeStatus(tab, updatedCaptureStatus || contentResponse);
  }

  async function refreshActiveTab() {
    return refreshTab(await getActiveTab());
  }

  async function refreshOpenTabs(sourceSettings) {
    const tabs = await getAllTabs();
    const statuses = await Promise.all(tabs.map((tab) => refreshTab(tab, sourceSettings)));
    return {
      ok: true,
      refreshed: statuses.filter((status) => status && (status.installed || status.sourceType !== "none")).length
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
    if ("audible" in changeInfo) {
      maybeRestartWaitingCapture(tabId);
    }

    if (changeInfo.status === "complete") {
      if (captureStatuses.has(tabId)) {
        captureStatuses.delete(tabId);
        sendRuntimeMessage({ target: "offscreen", type: "WLG_STOP_TAB_CAPTURE", tabId });
      }
      maybeAutoInject(tabId, tab);
    }
  });

  chrome.tabs.onActivated.addListener((activeInfo) => {
    maybeRestartWaitingCapture(activeInfo.tabId);
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    captureStatuses.delete(tabId);
    sendRuntimeMessage({ target: "offscreen", type: "WLG_STOP_TAB_CAPTURE", tabId });
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const type = message && message.type;

    if (type === "WLG_CAPTURE_STATUS") {
      if (message.tabId) {
        if (message.status && message.status.enabled) {
          const updatedStatus = updateCaptureStatus(
            message.tabId,
            normalizeIncomingCaptureStatus(message.tabId, message.status)
          );
          forwardCaptureStatusToBridge(message.tabId, updatedStatus).catch(() => {});
          if (shouldFallbackSilentCaptureToMedia(updatedStatus)) {
            fallbackSilentCaptureToMedia(message.tabId, updatedStatus).catch((error) => {
              updateCaptureStatus(message.tabId, {
                captureFallbackReason: "tab-audible-but-web-audio-silent",
                lastError: error.message || "Fallback media HTML impossible apres capture d'onglet silencieuse."
              });
            });
          }
        } else {
          captureStatuses.delete(message.tabId);
        }
      }
      return false;
    }

    if (type === "WLG_BROWSER_SOURCE_STATUS") {
      forwardBrowserSourceStatus(sender, message.status)
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
      protectActiveTab()
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (type === "WLG_DEACTIVATE_CURRENT_TAB") {
      getActiveTab()
        .then(async (tab) => {
          if (!tab || !tab.id) return { ok: true, enabled: false };
          await stopTabCaptureForActiveTab();
          return sendMessage(tab.id, { type: "WLG_SET_ENABLED", enabled: false });
        })
        .then((response) => sendResponse(response || { ok: true, enabled: false }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (type === "WLG_GET_ACTIVE_STATUS") {
      getStatusForActiveTab()
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (type === "WLG_REQUEST_AUTO_DOMAIN_PERMISSION") {
      grantAutoDomainForActiveTab()
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (type === "WLG_START_TAB_CAPTURE") {
      startTabCaptureForActiveTab({ replaceMedia: true })
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (type === "WLG_PROTECT_CURRENT_TAB") {
      protectActiveTab()
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (type === "WLG_STOP_TAB_CAPTURE") {
      stopTabCaptureForActiveTab()
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (type === "WLG_SET_PANIC") {
      setPanicForActiveTab(Boolean(message.active))
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (type === "WLG_REFRESH_ACTIVE_TAB") {
      (message.scope === "all-open-tabs" ? refreshOpenTabs() : refreshActiveTab())
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    return false;
  });
})(globalThis);

