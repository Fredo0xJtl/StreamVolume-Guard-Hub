(function initPopup(root) {
  const WLG = root.StreamVolumeGuard;
  const Settings = WLG.Settings;
  const SourceState = WLG.SourceState;

  const elements = {
    siteLabel: document.getElementById("siteLabel"),
    statusBadge: document.getElementById("statusBadge"),
    enabledToggle: document.getElementById("enabledToggle"),
    profileSelect: document.getElementById("profileSelect"),
    profileHint: document.getElementById("profileHint"),
    riskBadge: document.getElementById("riskBadge"),
    containedPeaksValue: document.getElementById("containedPeaksValue"),
    gainValue: document.getElementById("gainValue"),
    rmsValue: document.getElementById("rmsValue"),
    mediaValue: document.getElementById("mediaValue"),
    diagnosticsList: document.getElementById("diagnosticsList"),
    desktopLinkStatus: document.getElementById("desktopLinkStatus"),
    protectButton: document.getElementById("protectButton"),
    autoDomainButton: document.getElementById("autoDomainButton"),
    panicButton: document.getElementById("panicButton"),
    copyDiagnosticButton: document.getElementById("copyDiagnosticButton"),
    optionsButton: document.getElementById("optionsButton"),
    message: document.getElementById("message")
  };

  let currentSettings = Settings.normalizeSettings();
  let currentStatus = null;
  let activeTabContext = null;
  let currentDesktopLink = { connected: false, mode: "standalone", checkedAt: 0 };
  let refreshTimer = null;
  const STATUS_REFRESH_MS = 250;
  const DESKTOP_LINK_REFRESH_MS = 2000;
  const TOGGLE_VISUAL_LOCK_MS = 420;
  let toggleVisualLockValue = null;
  let toggleVisualLockUntilMs = 0;
  let setEnabledInProgress = false;
  const TOGGLE_PENDING_MS = 900;
  const TOGGLE_PENDING_CONFIRM_COUNT = 1;
  const TAB_CAPTURE_NO_SIGNAL_VISUAL_STATES = new Set(["no-signal", "waiting-for-audio", "starting", "restart-requested"]);
  const TAB_CAPTURE_AUDIBLE_OFF_CONFIRM_COUNT = 2;
  const MONITORING_SOURCE_INACTIVE_CONFIRM_COUNT = 2;
  const TOGGLE_INTENT_KEY = "streamVolumeGuard.extensionToggleIntent";
  const TOGGLE_INTENT_TTL_MS = 18000;
  const TOGGLE_INTENT_REFRESH_MS = 1000;
  let pendingToggleState = null;
  let pendingToggleUntilMs = 0;
  let pendingToggleMatchCount = 0;
  let toggleIntentState = null;
  let toggleIntentRefreshUntilMs = 0;
  let diagnosticCopyInProgress = false;
  let cachedTabCaptureObservedNoSignal = false;
  let tabCaptureObservedHoldKey = "";
  let tabCaptureObservedHoldCount = 0;
  let tabCaptureObservedHoldActive = false;
  let monitoringSourceHoldKey = "";
  let monitoringSourceHoldCount = 0;
  let monitoringSourceHoldActive = false;

  const profileLabelKeys = {
    soft: "profileSoft",
    normal: "profileNormal",
    stream: "profileStream",
    obs: "profileObs",
    night: "profileNight"
  };

  const riskLabelKeys = {
    safe: "popupSafe",
    warning: "popupWarning",
    risky: "popupRisky"
  };

  function i18n(key, fallback) {
    if (root.chrome && chrome.i18n && chrome.i18n.getMessage) {
      return chrome.i18n.getMessage(key) || fallback || key;
    }
    return fallback || key;
  }

  function localizeStaticText() {
    if (root.chrome && chrome.i18n && chrome.i18n.getUILanguage) {
      document.documentElement.lang = chrome.i18n.getUILanguage().startsWith("fr") ? "fr" : "en";
    }

    document.querySelectorAll("[data-i18n]").forEach((node) => {
      node.textContent = i18n(node.dataset.i18n, node.textContent);
    });

    document.querySelectorAll("[data-help-i18n]").forEach((node) => {
      const text = i18n(node.dataset.helpI18n, node.getAttribute("aria-label") || "Help");
      node.setAttribute("aria-label", text);
    });
  }

  function runtimeEmptyResponse(type) {
    return {
      ok: false,
      error: `Empty runtime response for ${type || "unknown message"}`,
      statusRoute: "runtime-empty-response",
      diagnosticReason: "runtime-empty-response",
      canInject: false,
      canCaptureTab: false
    };
  }

  function sendRuntimeMessage(type, payload) {
    return new Promise((resolve) => {
      if (!root.chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
        resolve({ ok: false, error: "runtime unavailable" });
        return;
      }

      chrome.runtime.sendMessage({ type, ...(payload || {}) }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || runtimeEmptyResponse(type));
      });
    });
  }

  function queryPopupActiveTab(queryInfo) {
    return new Promise((resolve) => {
      if (!root.chrome || !chrome.tabs || !chrome.tabs.query) {
        resolve(null);
        return;
      }

      chrome.tabs.query(queryInfo, (tabs) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(tabs && tabs[0] ? tabs[0] : null);
      });
    });
  }

  async function refreshActiveTabContext() {
    activeTabContext = await queryPopupActiveTab({ active: true, currentWindow: true })
      || await queryPopupActiveTab({ active: true, lastFocusedWindow: true });
    return activeTabContext;
  }

  function activeTabPayload() {
    return activeTabContext && activeTabContext.id ? { tabId: activeTabContext.id } : {};
  }

  function formatDb(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "0.0 dB";
    return `${number.toFixed(1)} dB`;
  }

  function setToggleVisualLock(enabled) {
    toggleVisualLockValue = Boolean(enabled);
    toggleVisualLockUntilMs = Date.now() + TOGGLE_VISUAL_LOCK_MS;
  }

  function setPendingToggleState(enabled) {
    pendingToggleState = Boolean(enabled);
    pendingToggleUntilMs = Date.now() + TOGGLE_PENDING_MS;
    pendingToggleMatchCount = 0;
  }

  function clearPendingToggleState() {
    pendingToggleState = null;
    pendingToggleUntilMs = 0;
    pendingToggleMatchCount = 0;
  }

  function getPendingToggleState() {
    if (pendingToggleUntilMs <= 0 || Date.now() >= pendingToggleUntilMs) {
      clearPendingToggleState();
      return null;
    }

    return pendingToggleState;
  }

  function normalizeToggleIntent(raw) {
    if (!raw || typeof raw !== "object") return null;
    const at = Number(raw.at);
    if (!Number.isFinite(at)) return null;
    const value = raw.value === true || raw.value === false ? Boolean(raw.value) : null;
    if (value === null) return null;

    return {
      value,
      at,
      ttlMs: Number.isFinite(Number(raw.ttlMs)) ? Number(raw.ttlMs) : TOGGLE_INTENT_TTL_MS
    };
  }

  function isToggleIntentAlive(intent) {
    if (!intent || !Number.isFinite(Number(intent.at))) return false;
    const ttl = Number.isFinite(Number(intent.ttlMs)) ? Number(intent.ttlMs) : TOGGLE_INTENT_TTL_MS;
    const age = Date.now() - Number(intent.at);
    return age >= 0 && age <= ttl;
  }

  function getActiveToggleIntentState() {
    if (!toggleIntentState || !isToggleIntentAlive(toggleIntentState)) {
      toggleIntentState = null;
      return null;
    }

    return Boolean(toggleIntentState.value);
  }

  function setLocalToggleIntent(enabled) {
    toggleIntentState = {
      value: Boolean(enabled),
      at: Date.now(),
      ttlMs: TOGGLE_INTENT_TTL_MS
    };
  }

  async function persistToggleIntent(enabled) {
    setLocalToggleIntent(enabled);
    if (!root.chrome || !chrome.storage || !chrome.storage.local) return;

    await new Promise((resolve) => {
      chrome.storage.local.set(
        {
          [TOGGLE_INTENT_KEY]: {
            value: Boolean(enabled),
            at: toggleIntentState.at,
            ttlMs: TOGGLE_INTENT_TTL_MS
          }
        },
        () => resolve()
      );
    });
  }

  function clearToggleIntentState() {
    toggleIntentState = null;
    toggleIntentRefreshUntilMs = 0;
    if (!root.chrome || !chrome.storage || !chrome.storage.local) return;

    chrome.storage.local.remove(TOGGLE_INTENT_KEY, () => {
      if (chrome.runtime && chrome.runtime.lastError) {
        console.warn("StreamVolume Guard Hub could not clear extension toggle intent.", chrome.runtime.lastError.message);
      }
    });
  }

  async function refreshToggleIntentState() {
    const now = Date.now();
    if (toggleIntentRefreshUntilMs > now) return;
    toggleIntentRefreshUntilMs = now + TOGGLE_INTENT_REFRESH_MS;
    if (!root.chrome || !chrome.storage || !chrome.storage.local) return;

    const storedIntent = await new Promise((resolve) => {
      chrome.storage.local.get([TOGGLE_INTENT_KEY], (result) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(normalizeToggleIntent(result && result[TOGGLE_INTENT_KEY]));
      });
    });

    if (!storedIntent) {
      clearToggleIntentState();
      return;
    }

    if (!isToggleIntentAlive(storedIntent)) {
      clearToggleIntentState();
      return;
    }

    toggleIntentState = storedIntent;
  }

  function hasExplicitEnabledInStatus() {
    return currentStatus && Object.prototype.hasOwnProperty.call(currentStatus, "enabled");
  }

  function getStatusEnabledState() {
    if (!hasExplicitEnabledInStatus()) {
      return null;
    }

    if (!isStatusBasedEnabledStateReliable(currentStatus)) {
      return null;
    }

    return Boolean(currentStatus.enabled) && !Boolean(currentStatus.excluded);
  }

  function isStatusBasedEnabledStateReliable(status) {
    return Boolean(status && status.sourceType && status.sourceType !== "none");
  }

  function getGlobalEnabledState() {
    const observedEnabled = Boolean(currentSettings && currentSettings.enabled);
    const intentState = getActiveToggleIntentState();
    if (intentState !== null) {
      if (intentState !== observedEnabled) {
        clearToggleIntentState();
        return observedEnabled;
      }
      return observedEnabled;
    }

    return observedEnabled;
  }

  function getVisualEnabledState() {
    const pendingState = getPendingToggleState();
    if (pendingState !== null) return pendingState;
    return getGlobalEnabledState();
  }

  function reconcilePendingToggleState() {
    const pendingState = getPendingToggleState();
    if (pendingState === null) {
      const intentState = getActiveToggleIntentState();
      if (intentState !== null && Boolean(currentSettings && currentSettings.enabled) === intentState) {
        clearToggleIntentState();
      }
      return;
    }

    const observedEnabled = Boolean(currentSettings && currentSettings.enabled);

    if (observedEnabled === pendingState) {
      pendingToggleMatchCount += 1;
      if (pendingToggleMatchCount >= TOGGLE_PENDING_CONFIRM_COUNT) {
        clearPendingToggleState();
        clearToggleIntentState();
      }
      return;
    }

    pendingToggleMatchCount = 0;
  }

  function consumeToggleVisualLock() {
    if (toggleVisualLockValue === null) return null;
    if (Date.now() < toggleVisualLockUntilMs) return toggleVisualLockValue;

    toggleVisualLockValue = null;
    toggleVisualLockUntilMs = 0;
    return null;
  }

  function getTabCaptureObservabilityKey(status) {
    const site = status && status.site ? String(status.site) : "";
    const tabId = Number(status && status.tabId);
    return `${site}:${Number.isFinite(tabId) ? tabId : "active"}`;
  }

  function clearTabCaptureObservedHoldState() {
    tabCaptureObservedHoldCount = 0;
    tabCaptureObservedHoldKey = "";
    tabCaptureObservedHoldActive = false;
  }

  function clearMonitoringSourceHoldState() {
    monitoringSourceHoldCount = 0;
    monitoringSourceHoldKey = "";
    monitoringSourceHoldActive = false;
  }

  function getMonitoringSourceHoldKey(status) {
    const site = status && status.site ? String(status.site) : "";
    const sourceType = status && status.sourceType ? String(status.sourceType) : "none";
    const tabId = status && Number(status.tabId);
    const normalizedTabId = Number.isFinite(tabId) ? tabId : "active";
    return `${site}:${sourceType}:${normalizedTabId}`;
  }

  function isObservedTabCaptureTransient(status) {
    if (!status || status.sourceType !== "tab-capture" || status.excluded) return false;
    if (!status.enabled) return false;
    if (Number(status.audioTrackCount) < 1) return false;
    if (status.captureTrackState !== "live") return false;
    return (
      status.tabAudible === false ||
      status.captureSignalState === "starting" ||
      status.captureSignalState === "waiting-for-audio" ||
      status.captureSignalState === "restart-requested"
    );
  }

  function isMatchingTabCaptureObservedHold(status) {
    return Boolean(
      tabCaptureObservedHoldActive &&
      status &&
      !status.excluded &&
      status.enabled &&
      Number(status.audioTrackCount) >= 1 &&
      status.captureTrackState === "live" &&
      getTabCaptureObservabilityKey(status) === tabCaptureObservedHoldKey
    );
  }

  function isObservedTabCaptureHoldTransient(status) {
    if (!status) return false;
    if (!isMatchingTabCaptureObservedHold(status)) return false;
    if (status.sourceType !== "tab-capture") return true;
    if (!status.captureSignalState) return true;
    if (status.tabAudible === false) return true;
    if (
      status.captureSignalState === "starting" ||
      status.captureSignalState === "waiting-for-audio" ||
      status.captureSignalState === "restart-requested"
    ) {
      return true;
    }
    return false;
  }

  function isObservedTabCaptureNoSignalStable(status) {
    const observedNow = isObservedTabCaptureNoSignal(status);
    if (observedNow) {
      tabCaptureObservedHoldKey = getTabCaptureObservabilityKey(status);
      tabCaptureObservedHoldCount = 0;
      tabCaptureObservedHoldActive = true;
      return true;
    }

    if (!status) {
      if (!tabCaptureObservedHoldActive) {
        return false;
      }

      tabCaptureObservedHoldCount += 1;
      return tabCaptureObservedHoldCount < TAB_CAPTURE_AUDIBLE_OFF_CONFIRM_COUNT;
    }

    if (!isMatchingTabCaptureObservedHold(status)) {
      clearTabCaptureObservedHoldState();
      return false;
    }

    if (!isObservedTabCaptureHoldTransient(status)) {
      clearTabCaptureObservedHoldState();
      return false;
    }

    tabCaptureObservedHoldCount += 1;
    if (tabCaptureObservedHoldCount < TAB_CAPTURE_AUDIBLE_OFF_CONFIRM_COUNT) {
      return true;
    }

    clearTabCaptureObservedHoldState();
    return false;
  }

  function updateMonitoringSourceHoldState(status) {
    if (!status || !isMonitoringSourceActive(status)) {
      if (!monitoringSourceHoldActive) return false;
      if (monitoringSourceHoldKey && monitoringSourceHoldKey !== getMonitoringSourceHoldKey(status)) {
        clearMonitoringSourceHoldState();
        return false;
      }
      monitoringSourceHoldCount += 1;
      if (monitoringSourceHoldCount < MONITORING_SOURCE_INACTIVE_CONFIRM_COUNT) {
        return true;
      }
      clearMonitoringSourceHoldState();
      return false;
    }

    monitoringSourceHoldActive = true;
    monitoringSourceHoldKey = getMonitoringSourceHoldKey(status);
    monitoringSourceHoldCount = 0;
    return true;
  }

  function getToggleVisualState(cachedTabCaptureObservedState = null, monitoringSourceActive = false) {
    const lockValue = consumeToggleVisualLock();
    if (lockValue !== null) return lockValue;

    const pendingState = getPendingToggleState();
    if (pendingState !== null) return pendingState;

    const activeIntentState = getActiveToggleIntentState();
    if (activeIntentState !== null) return activeIntentState;

    const safeCachedTabCaptureObservedState = cachedTabCaptureObservedState === null
      ? cachedTabCaptureObservedNoSignal
      : cachedTabCaptureObservedState;
    const safeMonitoringSourceActive = monitoringSourceActive || monitoringSourceHoldActive;

    if (!currentStatus || currentStatus.excluded) return false;

    if (needsDesktopFallback(currentStatus)) return true;
    if (safeCachedTabCaptureObservedState !== null) {
      if (safeCachedTabCaptureObservedState) return true;
    } else if (isObservedTabCaptureNoSignalStable(currentStatus)) {
      return true;
    }

    const effectiveEnabled = getStatusEnabledState();
    if (!effectiveEnabled) return false;

    if (currentStatus.sourceType === "tab-capture") {
      return true;
    }

    return Boolean(safeMonitoringSourceActive) ||
      (hasControllableProtectionSurface(currentStatus) &&
        !requiresTabCaptureUpgrade(currentStatus));
  }

  function getProtectionStateForButton(monitoringSourceActive = false) {
    const lockValue = consumeToggleVisualLock();
    if (lockValue !== null) return lockValue;

    const effectiveEnabled = getStatusEnabledState();
    if (!effectiveEnabled || !currentStatus) return false;
    if (needsDesktopFallback(currentStatus)) return true;
    if (requiresTabCaptureUpgrade(currentStatus)) return false;
    if (cachedTabCaptureObservedNoSignal) return true;
    if (currentStatus && currentStatus.sourceType === "tab-capture") return true;
    if (monitoringSourceActive || isMonitoringSourceActive(currentStatus)) {
      return effectiveEnabled && !requiresTabCaptureUpgrade(currentStatus);
    }
    return false;
  }

  function isObservedTabCaptureNoSignal(status) {
    if (!status || status.excluded) return false;
    if (status.sourceType !== "tab-capture") return false;
    const captureSignalState = String(status.captureSignalState || "");
    const captureTrackState = String(status.captureTrackState || "").toLowerCase();
    if (captureSignalState === "starting" && captureTrackState !== "ended" && captureTrackState !== "interrupted") {
      return Number(status.mediaDetected) >= 1 || Number(status.mediaProcessed) >= 1;
    }
    if (!TAB_CAPTURE_NO_SIGNAL_VISUAL_STATES.has(captureSignalState) && status.tabAudible !== false) {
      return false;
    }
    if (status.audioTrackCount < 1) return false;
    if (status.captureTrackState !== "live") return false;
    if (Number(status.mediaDetected) < 1 && Number(status.mediaProcessed) < 1) return false;
    return true;
  }

  function cacheTabCaptureNoSignalState(status) {
    const observed = isObservedTabCaptureNoSignalStable(status);
    cachedTabCaptureObservedNoSignal = observed;
    return observed;
  }

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function hasDiagnosticBoolean(source, key) {
    return Boolean(source && Object.prototype.hasOwnProperty.call(source, key));
  }

  function profileHintForStatus(status) {
    const site = status.site || "";
    if (!site) return "";
    if ((currentSettings.domainProfiles || {})[site]) {
      return i18n("popupProfileSite", "Profile saved for this site");
    }
    if (Settings.getRecommendedProfileForDomain(site)) {
      return i18n("popupProfileRecommended", "Recommended for this platform");
    }
    return i18n("popupProfileGlobal", "Global profile");
  }

  function hasExplicitDesktopFallback(status) {
    return Boolean(
      status &&
      status.enabled &&
      (
        status.captureFallbackRecommended ||
        status.captureFallbackReason ||
        status.fallbackRecommended ||
        status.fallbackReason
      )
    );
  }

  function isDesktopBridgeConnected() {
    return Boolean(currentDesktopLink && currentDesktopLink.connected);
  }

  function isActiveUncontrollableMediaFallback(status) {
    return Boolean(
      status &&
      status.enabled &&
      status.site &&
      Settings.getPreferredSourceTypeForDomain(status.site) === "tab-capture" &&
      status.sourceType === "media-html" &&
      Number(status.mediaDetected) < 1 &&
      Number(status.mediaProcessed) < 1
    );
  }

  function requiresTabCaptureUpgrade(status) {
    if (!status || !status.enabled || !status.site) return false;
    if (hasExplicitDesktopFallback(status)) return false;
    if (isActiveUncontrollableMediaFallback(status)) return false;
    return Settings.getPreferredSourceTypeForDomain(status.site) === "tab-capture" &&
      status.sourceType !== "tab-capture";
  }

  function hasControllableProtectionSurface(status) {
    const surface = status && status.controlSurface ? status.controlSurface : "";
    return surface === "BrowserGain" || surface === "WindowsSessionVolume";
  }

  function isMonitoringSourceActive(status) {
    return Boolean(
      status &&
      !status.excluded &&
      status.enabled &&
      status.sourceType &&
      status.sourceType !== "none"
    );
  }

  function needsDesktopFallback(status) {
    return Boolean(
      isDesktopBridgeConnected() &&
      status &&
      status.enabled &&
      !status.excluded &&
      (
        hasExplicitDesktopFallback(status) ||
        isActiveUncontrollableMediaFallback(status)
      )
    );
  }

  function hasStandaloneMediaHtmlLimit(status) {
    return Boolean(
      !isDesktopBridgeConnected() &&
      status &&
      status.enabled &&
      !status.excluded &&
      status.sourceType === "media-html" &&
      (status.captureFallbackReason || status.mediaHtmlFallbackReason)
    );
  }

  function isUnknownProtectionStatus(status) {
    return Boolean(
      !status ||
      !status.sourceType ||
      status.sourceType === "unknown" ||
      status.sourceType === "none" ||
      status.statusRoute === "active-tab-empty" ||
      status.statusRoute === "no-active-tab"
    );
  }

  function setMessage(text) {
    elements.message.textContent = text || "";
  }

  function fillProfiles() {
    const fragment = document.createDocumentFragment();
    Object.values(Settings.PROFILES).forEach((profile) => {
      const option = document.createElement("option");
      option.value = profile.id;
      option.textContent = i18n(profileLabelKeys[profile.id], profile.label);
      fragment.appendChild(option);
    });
    elements.profileSelect.replaceChildren(fragment);
  }

  function renderRisk(status) {
    const level = riskLabelKeys[status.riskLevel] ? status.riskLevel : "safe";
    elements.riskBadge.classList.toggle("is-safe", level === "safe");
    elements.riskBadge.classList.toggle("is-warning", level === "warning");
    elements.riskBadge.classList.toggle("is-risky", level === "risky");
    elements.riskBadge.textContent = i18n(riskLabelKeys[level], level);
    elements.containedPeaksValue.textContent = String(status.containedPeakCount || 0);
  }

  function diagnosticItems(status) {
    const items = [];
    const desktopFallbackNeeded = needsDesktopFallback(status);

    if (status.panicActive) {
      items.push({ key: "diagnosticPanicActive", tone: "error" });
    }

    if (desktopFallbackNeeded) {
      items.push({ key: "diagnosticDesktopFallbackActive", tone: "ok" });
      items.push({ key: "diagnosticDesktopFallbackDetail", tone: "warn" });
    }

    if (hasStandaloneMediaHtmlLimit(status)) {
      items.push({ key: "diagnosticStandaloneMediaHtmlLimit", tone: "warn" });
      items.push({ key: "diagnosticStandaloneMediaHtmlLimitDetail", tone: "warn" });
    }

    if (status.sourceType === "tab-capture") {
      items.push({ key: "diagnosticSourceTabCapture", tone: "ok" });
      const captureSignalFailed = status.captureSignalState === "no-signal" ||
        status.captureSignalState === "unavailable" ||
        (!status.captureSignalState && Number(status.rmsDb) <= -100);
      if (
        status.enabled &&
        (
          Number(status.audioTrackCount) < 1 ||
          status.captureTrackState === "ended" ||
          status.captureMuted ||
          captureSignalFailed
        )
      ) {
        items.push({ key: "diagnosticCaptureNoSignal", tone: "warn" });
      }
    } else if ((status.mediaProcessed || 0) > 0) {
      items.push({ key: "diagnosticSourceHtml", tone: "ok" });
    }

    if (status.excluded) {
      items.push({ key: "diagnosticSiteExcluded", tone: "warn" });
      return items;
    }

    if (status.lastError && !desktopFallbackNeeded) {
      items.push({ key: "diagnosticSourceIncompatible", tone: "error" });
    }

    if (status.canInject === false) {
      items.push({ key: "diagnosticPermissionNeeded", tone: "warn" });
    }

    if ((status.mediaDetected || 0) > 0) {
      items.push({ key: "diagnosticMediaDetected", tone: "ok" });
    }

    if ((status.mediaProcessed || 0) > 0 && status.enabled) {
      items.push({ key: "diagnosticPipelineActive", tone: "ok" });
    }

    if (items.length === 0) {
      items.push({ key: "diagnosticWaitingActivation", tone: "warn" });
    }

    return items;
  }

  function renderDiagnostics(status) {
    const fragment = document.createDocumentFragment();
    diagnosticItems(status).forEach((item) => {
      const li = document.createElement("li");
      li.className = `is-${item.tone}`;
      li.textContent = i18n(item.key, item.key);
      fragment.appendChild(li);
    });
    elements.diagnosticsList.replaceChildren(fragment);
  }

  function renderDesktopLink() {
    const connected = Boolean(currentDesktopLink.connected);
    elements.desktopLinkStatus.classList.toggle("is-connected", connected);
    elements.desktopLinkStatus.classList.toggle("is-standalone", !connected);
    elements.desktopLinkStatus.textContent = connected
      ? i18n("popupDesktopConnected", "Desktop connected")
      : i18n("popupDesktopStandalone", "Standalone mode");
  }

  function render() {
    const status = currentStatus;
    const safeStatus = status || {};
    const excluded = Boolean(safeStatus.excluded);
    const enabled = Boolean(safeStatus.enabled);
    const monitoringSourceActive = isMonitoringSourceActive(safeStatus);
    const monitoringSourceActiveWithHold = updateMonitoringSourceHoldState(safeStatus);
    const shouldStopProtection = enabled && !requiresTabCaptureUpgrade(status);
    const needsDesktopFallbackProtection = needsDesktopFallback(status);
    const desktopFallbackActive = needsDesktopFallbackProtection;
    const tabCaptureObserved = cacheTabCaptureNoSignalState(status);
    const tabProtectionActive = shouldStopProtection || needsDesktopFallbackProtection;
    const activationPending = setEnabledInProgress || getPendingToggleState() === true || getActiveToggleIntentState() === true;
    const unknownStatusWithGlobalProtection = Boolean(currentSettings && currentSettings.enabled) && isUnknownProtectionStatus(status);
    const toggleVisualState = getToggleVisualState();
    const protectButtonActive = getProtectionStateForButton(monitoringSourceActiveWithHold);

    elements.siteLabel.textContent = safeStatus.site || i18n("popupUnknownSite", "unknown site");
    elements.enabledToggle.checked = Boolean(toggleVisualState && (tabProtectionActive || activationPending || unknownStatusWithGlobalProtection));
    elements.enabledToggle.disabled = excluded || setEnabledInProgress;
    elements.profileSelect.value = safeStatus.activeProfile || Settings.getEffectiveProfileIdForDomain(currentSettings, safeStatus.site);
    elements.profileHint.textContent = profileHintForStatus(safeStatus);
    elements.gainValue.textContent = formatDb(safeStatus.gainDb);
    elements.rmsValue.textContent = formatDb(safeStatus.rmsDb);
    elements.mediaValue.textContent = `${safeStatus.mediaProcessed || 0}/${safeStatus.mediaDetected || 0}`;
    renderRisk(safeStatus);
    renderDiagnostics(safeStatus);
    renderDesktopLink();

    elements.statusBadge.classList.toggle("is-on", (shouldStopProtection || desktopFallbackActive) && !excluded);
    elements.statusBadge.classList.toggle("is-blocked", excluded);
    let statusBadgeText = i18n("popupReady", "ready");
    if (excluded) {
      statusBadgeText = i18n("popupExcluded", "excluded");
    } else if (desktopFallbackActive) {
      statusBadgeText = i18n("popupWindowsControl", "Windows control");
    } else if (tabCaptureObserved) {
      statusBadgeText = i18n("popupActive", "active");
    } else if (shouldStopProtection) {
      statusBadgeText = i18n("popupActive", "active");
    }

    elements.statusBadge.textContent = statusBadgeText;

    elements.autoDomainButton.disabled = !safeStatus.site;
    elements.protectButton.disabled = excluded;
    elements.protectButton.textContent = protectButtonActive
      ? i18n("popupStopProtection", "Stop protection")
      : i18n("popupProtectTab", "Protect this tab");
    elements.panicButton.classList.toggle("is-panic-active", Boolean(safeStatus.panicActive));
    elements.panicButton.textContent = safeStatus.panicActive
      ? i18n("popupPanicActive", "Panic active")
      : i18n("popupPanic", "Panic");
  }

  async function refreshDesktopLinkStatus(force) {
    const now = Date.now();
    if (!force && now - currentDesktopLink.checkedAt < DESKTOP_LINK_REFRESH_MS) {
      return currentDesktopLink;
    }

    const BridgeClient = WLG.BridgeClient;
    if (!BridgeClient || typeof BridgeClient.checkDesktopBridgeHealth !== "function") {
      currentDesktopLink = { connected: false, mode: "standalone", checkedAt: now };
      return currentDesktopLink;
    }

    const result = await BridgeClient.checkDesktopBridgeHealth();
    currentDesktopLink = {
      connected: Boolean(result && result.connected),
      mode: result && result.mode ? result.mode : "standalone",
      status: result && Number.isFinite(Number(result.status)) ? Number(result.status) : 0,
      checkedAt: now
    };
    return currentDesktopLink;
  }

  async function refresh(forceDesktopLink) {
    currentSettings = await Settings.getSettings();
    await refreshActiveTabContext();
    currentStatus = await sendRuntimeMessage("WLG_GET_ACTIVE_STATUS", activeTabPayload());
    await refreshToggleIntentState();
    await refreshDesktopLinkStatus(true);
    reconcilePendingToggleState();
    render();
  }

  async function setEnabled(enabled) {
    if (setEnabledInProgress) return;

    const requested = Boolean(enabled);
    setEnabledInProgress = true;
    setToggleVisualLock(requested);
    setPendingToggleState(requested);
    elements.enabledToggle.disabled = true;
    elements.protectButton.disabled = true;

    try {
      await persistToggleIntent(requested);
      currentSettings = await Settings.saveSettings({ enabled: requested });
      currentStatus = requested
        ? await sendRuntimeMessage("WLG_PROTECT_CURRENT_TAB", activeTabPayload())
        : await sendRuntimeMessage("WLG_DEACTIVATE_CURRENT_TAB", activeTabPayload());

      if (!currentStatus.ok && currentStatus.error) {
        setMessage(currentStatus.error);
        toggleVisualLockUntilMs = 0;
        toggleVisualLockValue = null;
        clearToggleIntentState();
      }
    } catch (error) {
      setMessage(error.message);
      toggleVisualLockUntilMs = 0;
      toggleVisualLockValue = null;
      clearPendingToggleState();
      clearToggleIntentState();
      currentStatus = { ok: false, error: error.message };
    } finally {
      setEnabledInProgress = false;
      void refresh();
    }
  }

  async function setProfile(profileId) {
    const profile = Settings.getProfile(profileId);
    const site = currentStatus && currentStatus.site;
    const nextSettings = site
      ? {
          domainProfiles: {
            ...(currentSettings.domainProfiles || {}),
            [site]: profile.id
          },
          targetRmsMode: "profile"
        }
      : {
          activeProfile: profile.id,
          targetRmsMode: "profile",
          targetRmsDb: profile.targetRmsDb
        };

    currentSettings = await Settings.saveSettings(nextSettings);
    await sendRuntimeMessage("WLG_REFRESH_ACTIVE_TAB", activeTabPayload());
    setMessage(site ? i18n("popupProfileSaved", "Profile saved for this site") : "");
    await refresh();
  }

  async function setPanic(active) {
    const response = await sendRuntimeMessage("WLG_SET_PANIC", { active, ...activeTabPayload() });
    if (!response.ok && response.error) setMessage(response.error);
    await refresh();
  }

  function cleanDiagnosticText(value) {
    return value === undefined || value === null ? "" : String(value).slice(0, 120).trim();
  }

  function isTabCaptureFallbackReason(reason) {
    if (SourceState && typeof SourceState.isTabCaptureFallbackReason === "function") {
      return SourceState.isTabCaptureFallbackReason(reason);
    }
    return cleanDiagnosticText(reason).toLowerCase().includes("tab-capture");
  }

  function getCaptureFallbackReason(status) {
    if (!status) return "";
    const captureReason = cleanDiagnosticText(status.captureFallbackReason);
    if (isTabCaptureFallbackReason(captureReason)) return captureReason;
    const sourceReason = cleanDiagnosticText(status.reason);
    if (isTabCaptureFallbackReason(sourceReason)) return sourceReason;
    if (status.captureSignalState === "no-signal" && finiteNumber(status.captureRestartCount, 0) > 0) {
      return "tab-capture-no-signal";
    }
    return status.sourceType === "tab-capture" ? captureReason : "";
  }

  function getMediaHtmlFallbackReasonForDiagnostic(status) {
    if (!status || status.sourceType !== "media-html") return "";
    const explicitReason = cleanDiagnosticText(status.mediaHtmlFallbackReason);
    if (explicitReason && !isTabCaptureFallbackReason(explicitReason)) return explicitReason;
    const captureReason = cleanDiagnosticText(status.captureFallbackReason);
    if (captureReason && !isTabCaptureFallbackReason(captureReason)) return captureReason;
    const sourceReason = cleanDiagnosticText(status.reason);
    if (sourceReason && sourceReason !== "media-html-starting" && !isTabCaptureFallbackReason(sourceReason)) return sourceReason;
    if (finiteNumber(status.mediaDetected, 0) < 1) return "no-media-element-detected";
    if (finiteNumber(status.mediaProcessed, 0) < 1) return "no-controllable-media-detected";
    return "";
  }

  function getDiagnosticLastError(status) {
    const message = status && (status.lastError || status.error) ? String(status.lastError || status.error).slice(0, 300) : "";
    if (!message || currentDesktopLink.connected) return message;
    if (message.toLowerCase().includes("fallback desktop")) {
      return "Capture d'onglet sans signal Web Audio exploitable. Source observee seulement en mode extension seule.";
    }
    return message;
  }

  function buildPopupDiagnostic() {
      const manifest = root.chrome && chrome.runtime && chrome.runtime.getManifest
        ? chrome.runtime.getManifest()
        : {};
    const desktopFallbackRecommended = Boolean(currentDesktopLink.connected && currentStatus && currentStatus.captureFallbackRecommended);
    const rawCaptureFallbackReason = getCaptureFallbackReason(currentStatus);
    const rawMediaHtmlFallbackReason = getMediaHtmlFallbackReasonForDiagnostic(currentStatus);
    const classification = SourceState && SourceState.classifyBrowserStatus
      ? SourceState.classifyBrowserStatus(currentStatus || {}, { desktopBridgeConnected: Boolean(currentDesktopLink.connected) })
      : {};

    return {
      product: "StreamVolume Guard Hub",
      extensionVersion: manifest.version || "dev",
      generatedAt: new Date().toISOString(),
      browserLanguage: root.navigator && root.navigator.language ? root.navigator.language : "",
      statusOk: currentStatus ? currentStatus.ok !== false : false,
      statusError: currentStatus && currentStatus.error ? String(currentStatus.error).slice(0, 300) : "",
      statusRoute: currentStatus && currentStatus.statusRoute ? String(currentStatus.statusRoute).slice(0, 120) : "",
      diagnosticReason: currentStatus && currentStatus.diagnosticReason ? String(currentStatus.diagnosticReason).slice(0, 120) : "",
      popupTabIdKnown: Boolean(activeTabContext && activeTabContext.id),
      globalEnabled: Boolean(currentSettings && currentSettings.enabled),
      visualEnabled: Boolean(elements.enabledToggle && elements.enabledToggle.checked),
      origin: classification.origin || "BrowserExtension",
      browserState: classification.browserState || "",
      controlSurface: classification.controlSurface || "Unknown",
      status: classification.status || (currentStatus && currentStatus.status) || "Unknown",
      isControllable: Boolean(classification.isControllable),
      reason: classification.reason || "",
      recommendedAction: classification.recommendedAction || "",
      site: currentStatus && currentStatus.site ? currentStatus.site : "",
      sourceType: currentStatus && currentStatus.sourceType ? currentStatus.sourceType : "unknown",
      activeProfile: currentStatus && currentStatus.activeProfile ? currentStatus.activeProfile : currentSettings.activeProfile,
      enabled: Boolean(currentStatus && currentStatus.enabled),
      excluded: Boolean(currentStatus && currentStatus.excluded),
      canInject: hasDiagnosticBoolean(currentStatus, "canInject") ? currentStatus.canInject !== false : false,
      canCaptureTab: hasDiagnosticBoolean(currentStatus, "canCaptureTab") ? currentStatus.canCaptureTab !== false : false,
      panicActive: Boolean(currentStatus && currentStatus.panicActive),
      mediaDetected: finiteNumber(currentStatus && currentStatus.mediaDetected, 0),
      mediaProcessed: finiteNumber(currentStatus && currentStatus.mediaProcessed, 0),
      skippedAlreadyProcessed: finiteNumber(currentStatus && currentStatus.skippedAlreadyProcessed, 0),
      riskLevel: currentStatus && currentStatus.riskLevel ? currentStatus.riskLevel : "safe",
      containedPeakCount: finiteNumber(currentStatus && currentStatus.containedPeakCount, 0),
      targetRmsDb: finiteNumber(currentStatus && currentStatus.targetRmsDb, currentSettings.targetRmsDb),
      gainDb: finiteNumber(currentStatus && currentStatus.gainDb, 0),
      rmsDb: finiteNumber(currentStatus && currentStatus.rmsDb, -120),
      outputRmsDb: finiteNumber(currentStatus && currentStatus.outputRmsDb, -120),
      outputPeakDb: finiteNumber(currentStatus && currentStatus.outputPeakDb, -120),
      peakDb: finiteNumber(currentStatus && currentStatus.peakDb, -120),
      predictedPeakDb: finiteNumber(currentStatus && currentStatus.predictedPeakDb, -120),
      contextState: currentStatus && currentStatus.contextState ? currentStatus.contextState : "",
      audioTrackCount: finiteNumber(currentStatus && currentStatus.audioTrackCount, 0),
      captureTrackState: currentStatus && currentStatus.captureTrackState ? currentStatus.captureTrackState : "",
      captureMuted: Boolean(currentStatus && currentStatus.captureMuted),
      captureSignalState: currentStatus && currentStatus.captureSignalState ? currentStatus.captureSignalState : "",
      captureRestartCount: finiteNumber(currentStatus && currentStatus.captureRestartCount, 0),
      captureRestartDeferred: Boolean(currentStatus && currentStatus.captureRestartDeferred),
      fallbackRecommended: desktopFallbackRecommended,
      fallbackReason: desktopFallbackRecommended ? rawMediaHtmlFallbackReason : "",
      mediaHtmlFallbackReason: !currentDesktopLink.connected ? rawMediaHtmlFallbackReason : "",
      captureFallbackReason: rawCaptureFallbackReason,
      tabAudible: Boolean(currentStatus && currentStatus.tabAudible),
      tabActive: Boolean(currentStatus && currentStatus.tabActive),
      desktopBridgeConnected: Boolean(currentDesktopLink.connected),
      desktopBridgeMode: currentDesktopLink.mode || "standalone",
      desktopBridgeStatus: finiteNumber(currentDesktopLink.status, 0),
      lastError: getDiagnosticLastError(currentStatus),
      privacy: {
        localOnly: true,
        sentAutomatically: false,
        includesFullUrl: false,
        includesPageTitle: false,
        includesAudio: false
      }
    };
  }

  async function copyDiagnostic() {
    if (diagnosticCopyInProgress) return;

    diagnosticCopyInProgress = true;
    elements.copyDiagnosticButton.disabled = true;
    setMessage(i18n("popupDiagnosticCopying", "Diagnostic..."));

    try {
      const diagnostic = buildPopupDiagnostic();
      await navigator.clipboard.writeText(JSON.stringify(diagnostic, null, 2));
      setMessage(i18n("popupDiagnosticCopied", "Diagnostic copied"));
    } catch (error) {
      setMessage(i18n("popupDiagnosticCopyFailed", "Copy failed"));
    } finally {
      diagnosticCopyInProgress = false;
      elements.copyDiagnosticButton.disabled = false;
    }
  }

  async function requestAutoDomain() {
    const response = await sendRuntimeMessage("WLG_REQUEST_AUTO_DOMAIN_PERMISSION");
    if (response.ok && response.granted) {
      setMessage(`${response.domain} autorisé`);
    } else if (response.domain) {
      setMessage(`${response.domain} non autorisé`);
    } else {
      setMessage(response.error || "Autorisation impossible");
    }
    await refresh();
  }

  elements.enabledToggle.addEventListener("change", () => {
    if (setEnabledInProgress) return;
    setEnabled(elements.enabledToggle.checked);
  });

  elements.profileSelect.addEventListener("change", () => {
    setProfile(elements.profileSelect.value);
  });

  elements.protectButton.addEventListener("click", () => {
    const active = getProtectionStateForButton(updateMonitoringSourceHoldState(currentStatus || {}));
    setEnabled(!active);
  });

  elements.autoDomainButton.addEventListener("click", () => {
    requestAutoDomain();
  });

  elements.panicButton.addEventListener("click", () => {
    setPanic(!(currentStatus && currentStatus.panicActive));
  });

  elements.copyDiagnosticButton.addEventListener("click", () => {
    copyDiagnostic();
  });

  elements.optionsButton.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  document.querySelectorAll(".help-button").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  });

  localizeStaticText();
  fillProfiles();
  refresh(true);
  refreshTimer = root.setInterval(refresh, STATUS_REFRESH_MS);
  function disposePopup() {
    if (refreshTimer) {
      root.clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  root.addEventListener("pagehide", disposePopup);
  root.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      disposePopup();
    }
  });
})(globalThis);
