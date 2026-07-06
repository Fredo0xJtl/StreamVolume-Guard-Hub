// Shared browser-source state machine for diagnostics, bridge payloads, and UI hints.
(function initSourceState(root) {
  const WLG = root.StreamVolumeGuard = root.StreamVolumeGuard || {};
  const SIGNAL_FLOOR_DB = -100;

  const STATES = Object.freeze({
    MEDIA_HTML_STARTING: "media-html-starting",
    MEDIA_HTML_SIGNAL: "media-html-signal",
    MEDIA_HTML_NO_SIGNAL: "media-html-no-signal",
    TAB_CAPTURE_STARTING: "tab-capture-starting",
    TAB_CAPTURE_SIGNAL: "tab-capture-signal",
    TAB_CAPTURE_NO_SIGNAL: "tab-capture-no-signal",
    OBSERVE_ONLY: "observe-only",
    DESKTOP_FALLBACK_AVAILABLE: "desktop-fallback-available"
  });

  function finiteDb(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : -120;
  }

  function finiteCount(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function cleanText(value, fallback) {
    const text = value === undefined || value === null ? "" : String(value);
    return text.trim() || fallback || "";
  }

  function hasUsableSignal(status) {
    const source = status || {};
    return source.captureSignalState === "signal" ||
      finiteDb(source.rmsDb) > SIGNAL_FLOOR_DB ||
      finiteDb(source.outputRmsDb) > SIGNAL_FLOOR_DB ||
      finiteDb(source.measuredRmsDb) > SIGNAL_FLOOR_DB;
  }

  function isTabCaptureFallbackReason(value) {
    return cleanText(value, "").toLowerCase().includes("tab-capture");
  }

  function hasLiveTabCaptureWithoutUsableRms(status) {
    const source = status || {};
    return source.sourceType === "tab-capture" &&
      source.captureSignalState === "no-signal" &&
      Number(source.mediaDetected) > 0 &&
      Number(source.mediaProcessed) > 0 &&
      Number(source.audioTrackCount) > 0 &&
      source.captureTrackState === "live" &&
      source.tabAudible === true;
  }

  function hasTabCaptureFailure(status) {
    const source = status || {};
    return isTabCaptureFallbackReason(source.captureFallbackReason) ||
      isTabCaptureFallbackReason(source.reason) ||
      (source.captureSignalState === "no-signal" && finiteCount(source.captureRestartCount) > 0);
  }

  function isMediaHtmlReasonFallbackAllowed(reason) {
    const sourceReason = cleanText(reason, "");
    if (!sourceReason || isTabCaptureFallbackReason(sourceReason)) return false;
    if (sourceReason === "media-html-starting") return false;
    if (sourceReason === "no-usable-signal" || sourceReason === "insufficient-signal") return true;
    return sourceReason === "no-media-element-detected" ||
      sourceReason === "no-controllable-media-detected" ||
      sourceReason === "media-html-no-usable-signal" ||
      sourceReason === "media-html-no-signal";
  }

  function mediaHtmlReasonFromStatus(status) {
    const source = status || {};
    const explicitMediaHtmlReason = cleanText(source.mediaHtmlFallbackReason, "");
    if (isMediaHtmlReasonFallbackAllowed(explicitMediaHtmlReason)) {
      return explicitMediaHtmlReason;
    }

    const captureFallbackReason = cleanText(source.captureFallbackReason, "");
    if (isMediaHtmlReasonFallbackAllowed(captureFallbackReason)) {
      return captureFallbackReason;
    }

    const fallbackReason = cleanText(source.fallbackReason, "");
    if (isMediaHtmlReasonFallbackAllowed(fallbackReason)) {
      return fallbackReason;
    }

    const calibrationReason = cleanText(source.calibrationReason, "");
    if (isMediaHtmlMeasurementFallbackReason(calibrationReason)) {
      return calibrationReason;
    }

    const sourceReason = cleanText(source.reason, "");
    if (isMediaHtmlReasonFallbackAllowed(sourceReason)) {
      return sourceReason;
    }

    return "";
  }

  function isMediaHtmlMeasurementFallbackReason(reason) {
    const sourceReason = cleanText(reason, "");
    return sourceReason === "no-usable-signal" || sourceReason === "insufficient-signal";
  }

  function reasonFromStatus(status) {
    const source = status || {};
    const captureFallbackReason = cleanText(source.captureFallbackReason, "");
    if (isTabCaptureFallbackReason(captureFallbackReason)) {
      return captureFallbackReason;
    }

    return cleanText(
      source.reason ||
      captureFallbackReason ||
      source.fallbackReason ||
      source.mediaHtmlFallbackReason ||
      source.calibrationReason ||
      source.captureSignalState,
      ""
    );
  }

  function statusFromRisk(status, fallback) {
    const source = status || {};
    if (source.excluded) return "Excluded";
    const explicitStatus = cleanText(source.status, "");
    if (["Safe", "Risky", "Low", "Muted", "Excluded", "Unknown"].includes(explicitStatus)) {
      return explicitStatus;
    }
    if (source.riskLevel === "risky" || source.riskLevel === "warning") return "Risky";
    return fallback || "Unknown";
  }

  function baseClassification(status) {
    const source = status || {};
    return {
      origin: "BrowserExtension",
      sourceType: cleanText(source.sourceType, "unknown"),
      browserState: STATES.OBSERVE_ONLY,
      controlSurface: "ObserveOnly",
      status: statusFromRisk(source, "Unknown"),
      isControllable: false,
      reason: reasonFromStatus(source),
      recommendedAction: "Observer la source et utiliser le fallback Windows ou OBS si necessaire."
    };
  }

  function classifyMediaHtml(status, options) {
    const source = status || {};
    const result = baseClassification(source);
    const mediaDetected = finiteCount(source.mediaDetected);
    const mediaProcessed = finiteCount(source.mediaProcessed);
    const fallbackReason = mediaHtmlReasonFromStatus(source);
    const usableSignal = hasUsableSignal(source);
    const canCaptureTab = source.canCaptureTab !== false;
    const tabAudible = source.tabAudible === true;
    const desktopBridgeConnected = Boolean(options && options.desktopBridgeConnected);

    result.sourceType = "media-html";

    if (hasTabCaptureFailure(source)) {
      result.browserState = desktopBridgeConnected
        ? STATES.DESKTOP_FALLBACK_AVAILABLE
        : STATES.TAB_CAPTURE_NO_SIGNAL;
      result.reason = "tab-capture-no-signal";
      result.recommendedAction = desktopBridgeConnected
        ? "Fallback Windows global navigateur disponible ; il bouge tout le navigateur."
        : "Source observee seulement ; securiser dans OBS ou relancer l'onglet si le signal reste absent.";
      return result;
    }

    if (fallbackReason || mediaDetected < 1 || mediaProcessed < 1) {
      if (!fallbackReason) {
        result.browserState = STATES.MEDIA_HTML_STARTING;
        result.reason = "media-html-starting";
        result.recommendedAction = "Attendre 2 a 4 secondes que le lecteur HTML expose un signal.";
        return result;
      }

      result.browserState = STATES.MEDIA_HTML_NO_SIGNAL;
      result.reason = fallbackReason;
      result.recommendedAction = canCaptureTab && tabAudible
        ? "Tenter tabCapture pour mesurer l'onglet entier."
        : "Observer la source ; lancer l'audio ou utiliser le fallback Windows/OBS si le signal reste absent.";
      return result;
    }

    if (!usableSignal) {
      result.browserState = STATES.MEDIA_HTML_STARTING;
      result.reason = "media-html-starting";
      result.recommendedAction = "Attendre 2 a 4 secondes ; si aucun signal n'arrive, tenter tabCapture.";
      return result;
    }

    result.browserState = STATES.MEDIA_HTML_SIGNAL;
    result.controlSurface = "BrowserGain";
    result.status = statusFromRisk(source, "Safe");
    result.isControllable = true;
    result.reason = cleanText(source.calibrationReason, "media-html-signal");
    result.recommendedAction = "BrowserGain actif sur le media HTML ; la cible dB doit agir.";
    return result;
  }

  function classifyTabCapture(status, options) {
    const source = status || {};
    const result = baseClassification(source);
    const captureSignalState = cleanText(source.captureSignalState, hasUsableSignal(source) ? "signal" : "starting");
    const desktopBridgeConnected = Boolean(options && options.desktopBridgeConnected);

    result.sourceType = "tab-capture";

    if (captureSignalState === "signal") {
      result.browserState = STATES.TAB_CAPTURE_SIGNAL;
      result.controlSurface = "BrowserGain";
      result.status = statusFromRisk(source, "Safe");
      result.isControllable = true;
      result.reason = cleanText(source.calibrationReason, "tab-capture-signal");
      result.recommendedAction = "BrowserGain actif via tabCapture ; la cible dB doit agir.";
      return result;
    }

    if (["starting", "restart-requested", "waiting-for-audio"].includes(captureSignalState)) {
      result.browserState = STATES.TAB_CAPTURE_STARTING;
      result.reason = captureSignalState;
      result.recommendedAction = "Attendre le signal tabCapture ; ne pas annoncer BrowserGain avant signal.";
      return result;
    }

    if (hasLiveTabCaptureWithoutUsableRms(source)) {
      result.browserState = STATES.TAB_CAPTURE_NO_SIGNAL;
      result.reason = reasonFromStatus(source) || "tab-capture-no-signal";
      result.recommendedAction = source.tabAudible
        ? "Capture active avec piste live ; signal Web Audio indisponible, mode observation maintenu."
        : "Capture active ; signal Web Audio indisponible, mode observation maintenu.";
      return result;
    }

    result.browserState = desktopBridgeConnected
      ? STATES.DESKTOP_FALLBACK_AVAILABLE
      : STATES.TAB_CAPTURE_NO_SIGNAL;
    result.reason = reasonFromStatus(source) || captureSignalState || "tab-capture-no-signal";
    result.recommendedAction = desktopBridgeConnected
      ? "Fallback Windows global navigateur disponible ; il bouge tout le navigateur."
      : "Source observee seulement ; securiser dans OBS ou relancer l'onglet si le signal reste absent.";
    return result;
  }

  function classifyBrowserStatus(status, options) {
    const source = status || {};
    if (source.excluded) {
      return {
        ...baseClassification(source),
        status: "Excluded",
        reason: "excluded",
        recommendedAction: "Retirer l'exclusion pour controler cette source."
      };
    }

    if (!source.enabled) {
      return {
        ...baseClassification(source),
        reason: "disabled",
        recommendedAction: "Activer la protection sur l'onglet avant de juger le controle."
      };
    }

    if (source.sourceType === "media-html") {
      return classifyMediaHtml(source, options);
    }

    if (source.sourceType === "tab-capture") {
      return classifyTabCapture(source, options);
    }

    return {
      ...baseClassification(source),
      reason: reasonFromStatus(source) || "unknown-source",
      recommendedAction: "Recharger l'onglet, relancer le media, puis copier un diagnostic."
    };
  }

  WLG.SourceState = {
    STATES,
    classifyBrowserStatus,
    hasUsableSignal,
    isTabCaptureFallbackReason
  };
})(globalThis);
