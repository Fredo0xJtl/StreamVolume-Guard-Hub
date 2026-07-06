(function initBridgeClient(root) {
  const WLG = root.StreamVolumeGuard = root.StreamVolumeGuard || {};

  const LOCAL_BRIDGE_ENDPOINT = "http://127.0.0.1:47841/browser-source";
  const LOCAL_GLOBAL_TARGET_ENDPOINT = "http://127.0.0.1:47841/global-target";
  const LOCAL_EXTENSION_LOG_ENDPOINT = "http://127.0.0.1:47841/extension-log";
  const LOCAL_HEALTH_ENDPOINT = "http://127.0.0.1:47841/health";
  const MIN_SEND_INTERVAL_MS = 1000;
  const MIN_LOG_SEND_INTERVAL_MS = 1500;
  const LOCAL_FETCH_TIMEOUT_MS = 650;
  const TARGET_MIN_DB = -30;
  const TARGET_MAX_DB = -15;
  const URL_LIKE_PATTERN = /\bhttps?:\/\/[^\s]+/gi;
  const lastSentBySourceId = new Map();
  const lastSentLogBySignature = new Map();

  function sanitizeText(value, fallback) {
    const text = value === undefined || value === null ? "" : String(value);
    const normalized = text.replace(/[\r\n\t]+/g, " ").trim().replace(/\s{2,}/g, " ");
    return normalized || fallback || "";
  }

  function detectBrowserProcess() {
    const ua = root.navigator && root.navigator.userAgent ? root.navigator.userAgent : "";
    if (/\bEdg\//.test(ua)) return "msedge";
    if (/\bOPR\//.test(ua) || /\bOpera\//.test(ua)) return "opera";
    if (/\bFirefox\//.test(ua)) return "firefox";
    if (root.navigator && root.navigator.brave) return "brave";
    if (/\bChrome\//.test(ua) || /\bChromium\//.test(ua)) return "chrome";
    if (/\bSafari\//.test(ua)) return "safari";
    return "Browser";
  }

  function clampScalar(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    if (number < 0) return 0;
    if (number > 1) return 1;
    return number;
  }

  function clampTargetDb(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return -18;
    if (number < TARGET_MIN_DB) return TARGET_MIN_DB;
    if (number > TARGET_MAX_DB) return TARGET_MAX_DB;
    return number;
  }

  function clampOptionalTargetDb(value) {
    if (value === undefined || value === null || value === "") return null;
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    if (number < -60) return -60;
    if (number > 0) return 0;
    return number;
  }

  function normalizeStatus(value) {
    const normalized = sanitizeText(value, "Unknown");
    return ["Safe", "Risky", "Low", "Muted", "Excluded", "Unknown"].includes(normalized)
      ? normalized
      : "Unknown";
  }

  function normalizeControlSurface(value) {
    const normalized = sanitizeText(value, "Unknown");
    return ["BrowserGain", "ObserveOnly", "Unknown"].includes(normalized)
      ? normalized
      : "Unknown";
  }

  function normalizeCalibrationState(value) {
    const normalized = sanitizeText(value, "");
    return ["measuring", "applied", "locked", "skipped", "rearmed"].includes(normalized)
      ? normalized
      : "";
  }

  function clampOptionalAudioDb(value) {
    if (value === undefined || value === null || value === "") return null;
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    if (number < -120) return -120;
    if (number > 24) return 24;
    return number;
  }

  function clampOptionalGainDb(value) {
    if (value === undefined || value === null || value === "") return null;
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    if (number < -48) return -48;
    if (number > 48) return 48;
    return number;
  }

  function redactUrlLikeText(value, fallback) {
    return sanitizeText(value, fallback).replace(URL_LIKE_PATTERN, "[redacted-url]");
  }

  function normalizeSeverity(value) {
    const normalized = sanitizeText(value, "info").toLowerCase();
    return ["debug", "info", "warn", "error"].includes(normalized) ? normalized : "info";
  }

  function normalizeEventName(value) {
    const normalized = sanitizeText(value, "")
      .replace(/[^a-zA-Z0-9._:-]+/g, ".")
      .replace(/\.{2,}/g, ".")
      .replace(/^\.+|\.+$/g, "");
    if (!normalized) {
      throw new Error("eventName is required");
    }
    return normalized.length > 80 ? normalized.slice(0, 80) : normalized;
  }

  function localTimeoutErrorMessage(error) {
    if (error && error.name === "AbortError") return "bridge timeout";
    return error && error.message ? error.message : "bridge unavailable";
  }

  async function fetchWithLocalTimeout(endpoint, options) {
    const requestOptions = { ...(options || {}) };
    let timeoutId = 0;

    if (typeof AbortController === "function") {
      const controller = new AbortController();
      requestOptions.signal = controller.signal;
      timeoutId = root.setTimeout(() => controller.abort(), LOCAL_FETCH_TIMEOUT_MS);
    }

    try {
      return await fetch(endpoint, requestOptions);
    } finally {
      if (timeoutId) {
        root.clearTimeout(timeoutId);
      }
    }
  }

  function buildBrowserSourceObserved(input) {
    const status = input && typeof input === "object" ? input : {};
    const sourceId = sanitizeText(status.sourceId, "");
    if (!sourceId) {
      throw new Error("sourceId is required");
    }

    const controlSurface = normalizeControlSurface(status.controlSurface);
    const isControllable = controlSurface === "BrowserGain";

    return {
      type: "browser_source_observed",
      browserProcess: sanitizeText(status.browserProcess, detectBrowserProcess()),
      sourceId,
      tabId: Number.isFinite(Number(status.tabId)) ? Number(status.tabId) : null,
      siteName: sanitizeText(status.siteName, "Unknown site"),
      title: sanitizeText(status.title, ""),
      currentLevel: clampScalar(status.currentLevel),
      appliedGain: clampScalar(status.appliedGain),
      calibrationState: normalizeCalibrationState(status.calibrationState),
      measuredRmsDb: clampOptionalAudioDb(status.measuredRmsDb),
      appliedGainDb: clampOptionalGainDb(status.appliedGainDb),
      calibrationReason: sanitizeText(status.calibrationReason, ""),
      captureSignalState: sanitizeText(status.captureSignalState, ""),
      browserState: sanitizeText(status.browserState, ""),
      reason: sanitizeText(status.reason, ""),
      recommendedAction: sanitizeText(status.recommendedAction, ""),
      targetRmsDb: clampOptionalTargetDb(status.targetRmsDb),
      targetProfile: sanitizeText(status.targetProfile, ""),
      status: normalizeStatus(status.status),
      lastSeen: sanitizeText(status.lastSeen, "") || new Date().toISOString(),
      origin: "BrowserExtension",
      controlSurface,
      isControllable
    };
  }

  function normalizeGlobalTargetState(input) {
    const state = input && typeof input === "object" ? input : {};
    if (state.type !== "global_target_state") {
      throw new Error("type must be global_target_state");
    }

    const targetRmsDb = clampTargetDb(state.targetRmsDb ?? state.targetDecibels);
    const targetProfile = sanitizeText(state.targetProfile, "Standard");
    return {
      type: "global_target_state",
      source: sanitizeText(state.source, "Desktop"),
      targetProfile,
      targetDecibels: targetRmsDb,
      targetRmsDb,
      updatedAt: sanitizeText(state.updatedAt, "") || new Date().toISOString()
    };
  }

  function buildExtensionLogMessage(input) {
    const log = input && typeof input === "object" ? input : {};
    const eventName = normalizeEventName(log.eventName);

    return {
      type: "extension_log",
      eventName,
      message: redactUrlLikeText(log.message, eventName),
      severity: normalizeSeverity(log.severity),
      browserProcess: sanitizeText(log.browserProcess, detectBrowserProcess()),
      sourceId: sanitizeText(log.sourceId, ""),
      tabId: Number.isFinite(Number(log.tabId)) ? Number(log.tabId) : null,
      siteName: redactUrlLikeText(log.siteName, "Unknown site"),
      status: normalizeStatus(log.status),
      controlSurface: normalizeControlSurface(log.controlSurface),
      captureSignalState: sanitizeText(log.captureSignalState, ""),
      calibrationState: normalizeCalibrationState(log.calibrationState),
      measuredRmsDb: clampOptionalAudioDb(log.measuredRmsDb),
      appliedGainDb: clampOptionalGainDb(log.appliedGainDb),
      calibrationReason: sanitizeText(log.calibrationReason, ""),
      targetRmsDb: clampOptionalTargetDb(log.targetRmsDb),
      targetProfile: sanitizeText(log.targetProfile, ""),
      lastSeen: sanitizeText(log.lastSeen, "") || new Date().toISOString(),
      origin: "BrowserExtension"
    };
  }

  function shouldThrottle(sourceId, nowMs) {
    const previous = lastSentBySourceId.get(sourceId) || 0;
    if (nowMs - previous < MIN_SEND_INTERVAL_MS) return true;
    lastSentBySourceId.set(sourceId, nowMs);
    return false;
  }

  function shouldThrottleLog(message, nowMs) {
    const signature = [
      message.eventName,
      message.sourceId,
      message.siteName,
      message.captureSignalState,
      message.status
    ].join("|");
    const previous = lastSentLogBySignature.get(signature) || 0;
    if (nowMs - previous < MIN_LOG_SEND_INTERVAL_MS) return true;
    lastSentLogBySignature.set(signature, nowMs);
    return false;
  }

  async function sendBrowserSourceObserved(input, options) {
    const message = buildBrowserSourceObserved(input);
    const nowMs = options && Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
    if (!(options && options.force) && shouldThrottle(message.sourceId, nowMs)) {
      return { ok: true, throttled: true };
    }

    if (typeof fetch !== "function") {
      return { ok: false, error: "fetch unavailable" };
    }

    try {
      const response = await fetchWithLocalTimeout(LOCAL_BRIDGE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
        cache: "no-store",
        credentials: "omit"
      });

      return { ok: response.ok, status: response.status };
    } catch (error) {
      return { ok: false, error: localTimeoutErrorMessage(error) };
    }
  }

  async function sendExtensionLog(input, options) {
    const message = buildExtensionLogMessage(input);
    const nowMs = options && Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
    if (!(options && options.force) && shouldThrottleLog(message, nowMs)) {
      return { ok: true, throttled: true };
    }

    if (typeof fetch !== "function") {
      return { ok: false, error: "fetch unavailable" };
    }

    try {
      const response = await fetchWithLocalTimeout(LOCAL_EXTENSION_LOG_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
        cache: "no-store",
        credentials: "omit"
      });

      return { ok: response.ok, status: response.status };
    } catch (error) {
      return { ok: false, error: localTimeoutErrorMessage(error) };
    }
  }

  async function fetchGlobalTargetState() {
    if (typeof fetch !== "function") {
      return { ok: false, error: "fetch unavailable" };
    }

    try {
      const response = await fetchWithLocalTimeout(LOCAL_GLOBAL_TARGET_ENDPOINT, {
        method: "GET",
        cache: "no-store",
        credentials: "omit"
      });
      if (!response.ok) {
        return { ok: false, status: response.status };
      }

      const state = normalizeGlobalTargetState(await response.json());
      return { ok: true, state };
    } catch (error) {
      return { ok: false, error: localTimeoutErrorMessage(error) };
    }
  }

  async function checkDesktopBridgeHealth() {
    if (typeof fetch !== "function") {
      return { ok: false, connected: false, mode: "standalone", error: "fetch unavailable" };
    }

    try {
      const response = await fetchWithLocalTimeout(LOCAL_HEALTH_ENDPOINT, {
        method: "GET",
        cache: "no-store",
        credentials: "omit"
      });

      if (!response.ok) {
        return { ok: false, connected: false, mode: "standalone", status: response.status };
      }

      let state = null;
      try {
        state = await response.json();
      } catch (error) {
        state = null;
      }

      return { ok: true, connected: true, mode: "desktop", status: response.status, state };
    } catch (error) {
      return { ok: false, connected: false, mode: "standalone", error: localTimeoutErrorMessage(error) };
    }
  }

  WLG.BridgeClient = {
    LOCAL_BRIDGE_ENDPOINT,
    LOCAL_GLOBAL_TARGET_ENDPOINT,
    LOCAL_EXTENSION_LOG_ENDPOINT,
    LOCAL_HEALTH_ENDPOINT,
    buildBrowserSourceObserved,
    buildExtensionLogMessage,
    sendBrowserSourceObserved,
    sendExtensionLog,
    normalizeGlobalTargetState,
    fetchGlobalTargetState,
    checkDesktopBridgeHealth
  };
})(globalThis);
