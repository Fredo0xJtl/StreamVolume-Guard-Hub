(function initOffscreen(root) {
  const WLG = root.StreamVolumeGuard;
  const Settings = WLG.Settings;
  const Normalizer = WLG.Normalizer;
  const SourceState = WLG.SourceState;
  const captures = new Map();
  const CAPTURE_NO_SIGNAL_WATCHDOG_MS = 1800;
  const MAX_CAPTURE_RESTARTS = 1;
  const SPOTIFY_CAPTURE_DOMAINS = new Set(["spotify.com"]);
  const SPOTIFY_SIGNAL_CONFIRM_COUNT = 3;

  function getCaptureHealth(stream) {
    const audioTracks = stream && stream.getAudioTracks ? stream.getAudioTracks() : [];
    const firstTrack = audioTracks[0] || null;
    return {
      audioTrackCount: audioTracks.length,
      captureTrackState: firstTrack ? firstTrack.readyState : "missing",
      captureMuted: firstTrack ? Boolean(firstTrack.muted) : true
    };
  }

  function getCaptureSignalState(captureHealth, nextState, startedAt) {
    if (
      Number(captureHealth.audioTrackCount) < 1 ||
      captureHealth.captureTrackState === "ended" ||
      captureHealth.captureMuted
    ) {
      return "unavailable";
    }

    if (Number(nextState.rmsDb) > -100) return "signal";

    const elapsedMs = Date.now() - Number(startedAt || Date.now());
    return elapsedMs >= CAPTURE_NO_SIGNAL_WATCHDOG_MS ? "no-signal" : "starting";
  }

  function isSpotifyDomain(site) {
    const normalizedSite = Settings.normalizeDomain(typeof site === "string" ? site : "");
    if (!normalizedSite) return false;
    return (
      SPOTIFY_CAPTURE_DOMAINS.has(normalizedSite) ||
      [...SPOTIFY_CAPTURE_DOMAINS].some((domain) => normalizedSite.endsWith(`.${domain}`))
    );
  }

  function buildNormalizerStatus(stream, nextState, startedAt, restartCount, restartDeferred, capture) {
    const captureHealth = getCaptureHealth(stream);
    let captureSignalState = getCaptureSignalState(captureHealth, nextState, startedAt);
    if (isSpotifyDomain(capture && capture.site)) {
      if (captureSignalState === "signal") {
        const confirmCount = Number(capture.spotifySignalConfirmCount) || 0;
        capture.spotifySignalConfirmCount = Math.min(confirmCount + 1, SPOTIFY_SIGNAL_CONFIRM_COUNT);
        if (capture.spotifySignalConfirmCount < SPOTIFY_SIGNAL_CONFIRM_COUNT) {
          captureSignalState = "no-signal";
        }
      } else {
        capture.spotifySignalConfirmCount = 0;
      }
    }
    if (restartDeferred && captureSignalState === "no-signal") {
      captureSignalState = "waiting-for-audio";
    }
    const captureHealthError = captureHealth.audioTrackCount < 1 ||
      captureHealth.captureTrackState === "ended" ||
      captureHealth.captureMuted
      ? "Capture d'onglet active, mais aucun signal audio exploitable n'est detecte."
      : "";
    const captureSignalError = captureSignalState === "no-signal"
      ? "Capture d'onglet active, piste audio live, mais aucun signal Web Audio detecte."
      : "";
    const captureFallbackRecommended = captureSignalState === "no-signal";
    const captureFallbackReason = captureFallbackRecommended ? "tab-capture-no-signal" : "";

    const status = {
      gainDb: nextState.gainDb,
      targetRmsDb: nextState.targetRmsDb,
      maxBoostDb: nextState.maxBoostDb,
      rmsDb: nextState.rmsDb,
      outputRmsDb: nextState.outputRmsDb,
      outputPeakDb: nextState.outputPeakDb,
      peakDb: nextState.peakDb,
      predictedPeakDb: nextState.predictedPeakDb,
      calibrationState: nextState.calibrationState,
      measuredRmsDb: nextState.measuredRmsDb,
      appliedGainDb: nextState.appliedGainDb,
      calibrationReason: nextState.calibrationReason,
      contextState: nextState.contextState,
      ...captureHealth,
      captureSignalState,
      captureRestartCount: Number(restartCount) || 0,
      captureRestartDeferred: Boolean(restartDeferred),
      captureFallbackRecommended,
      captureFallbackReason,
      riskLevel: nextState.riskLevel,
      containedPeakCount: nextState.containedPeakCount,
      activeProfile: nextState.profileId,
      panicActive: nextState.panicActive,
      lastError: captureHealthError || captureSignalError,
      enabled: true,
      sourceType: "tab-capture"
    };
    const classification = SourceState && SourceState.classifyBrowserStatus
      ? SourceState.classifyBrowserStatus(status)
      : {
        origin: "BrowserExtension",
        browserState: captureSignalState === "signal" ? "tab-capture-signal" : "tab-capture-starting",
        controlSurface: captureSignalState === "signal" ? "BrowserGain" : "ObserveOnly",
        status: captureSignalState === "signal" ? "Safe" : "Unknown",
        isControllable: captureSignalState === "signal",
        reason: captureFallbackReason || captureSignalState,
        recommendedAction: "Observer la capture et copier un diagnostic."
      };

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

  function baseStatus(tabId, site, settings, restartCount) {
    return {
      ok: true,
      installed: true,
      enabled: true,
      mode: "tab-capture",
      sourceType: "tab-capture",
      origin: "BrowserExtension",
      browserState: "tab-capture-starting",
      controlSurface: "ObserveOnly",
      status: "Unknown",
      isControllable: false,
      reason: "starting",
      recommendedAction: "Attendre le signal tabCapture.",
      panicActive: false,
      site: Settings.normalizeDomain(site),
      activeProfile: settings.activeProfile,
      excluded: false,
      canInject: true,
      canCaptureTab: true,
      mediaDetected: 1,
      mediaProcessed: 1,
      skippedAlreadyProcessed: 0,
      gainDb: 0,
      targetRmsDb: settings.targetRmsDb,
      maxBoostDb: settings.maxBoostDb,
      rmsDb: -120,
      outputRmsDb: -120,
      outputPeakDb: -120,
      peakDb: -120,
      predictedPeakDb: -120,
      calibrationState: "measuring",
      measuredRmsDb: null,
      appliedGainDb: null,
      calibrationReason: "",
      contextState: "unknown",
      audioTrackCount: 0,
      captureTrackState: "pending",
      captureMuted: false,
      captureSignalState: "starting",
      captureRestartCount: Number(restartCount) || 0,
      captureRestartDeferred: false,
      captureFallbackRecommended: false,
      captureFallbackReason: "",
      riskLevel: "safe",
      containedPeakCount: 0,
      lastError: "",
      updatedAt: Date.now(),
      tabId
    };
  }

  function postStatus(tabId, status) {
    chrome.runtime.sendMessage({ type: "WLG_CAPTURE_STATUS", tabId, status });
  }

  function updateStatus(tabId, partial) {
    const capture = captures.get(tabId);
    if (!capture) return null;
    capture.status = {
      ...capture.status,
      ...partial,
      updatedAt: Date.now()
    };
    postStatus(tabId, capture.status);
    return capture.status;
  }

  function forwardCalibrationEvent(tabId, site, event) {
    if (!event) return;
    const controlSurface = event.eventName === "browser.gain.skipped" ? "ObserveOnly" : "BrowserGain";
    chrome.runtime.sendMessage({
      type: "WLG_EXTENSION_LOG",
      log: {
        eventName: event.eventName,
        message: `BrowserGain calibration ${event.reason || event.calibrationState || "updated"}`,
        severity: event.eventName === "browser.gain.skipped" ? "warn" : "info",
        sourceId: `tab-capture:${tabId || "unknown"}`,
        tabId,
        siteName: Settings.normalizeDomain(site),
        status: "Safe",
        controlSurface,
        calibrationState: event.calibrationState,
        measuredRmsDb: event.measuredRmsDb,
        appliedGainDb: event.appliedGainDb,
        calibrationReason: event.reason,
        targetRmsDb: event.targetRmsDb,
        targetProfile: event.targetProfile || ""
      }
    }, () => {
      // Best-effort local logs only. The desktop may be closed.
    });
  }

  function requestCaptureRestart(tabId, status) {
    const capture = captures.get(tabId);
    if (!capture) return;
    if (capture.restartRequested) return;
    if (capture.restartDeferred) return;
    if (status.captureSignalState !== "no-signal") return;
    if (isSpotifyDomain(capture.site)) return;

    const restartCount = Number(capture.restartCount) || 0;
    if (restartCount >= MAX_CAPTURE_RESTARTS) return;

    const nextRestartCount = restartCount + 1;
    capture.restartRequested = true;
    updateStatus(tabId, {
      captureSignalState: "restart-requested",
      captureRestartCount: restartCount,
      captureRestartDeferred: false,
      lastError: "Capture d'onglet silencieuse, relance automatique demandee."
    });

    chrome.runtime.sendMessage({
      type: "WLG_RESTART_TAB_CAPTURE",
      tabId,
      reason: "no-signal",
      restartCount: nextRestartCount
    }, (response) => {
      const currentCapture = captures.get(tabId);
      if (chrome.runtime.lastError) {
        if (currentCapture) currentCapture.restartRequested = false;
        updateStatus(tabId, {
          lastError: chrome.runtime.lastError.message || "Relance automatique de capture impossible."
        });
        return;
      }

      if (response && response.deferred) {
        if (currentCapture) {
          currentCapture.restartRequested = false;
          currentCapture.restartDeferred = true;
        }
        updateStatus(tabId, response.status || {
          captureSignalState: "waiting-for-audio",
          captureRestartCount: restartCount,
          captureRestartDeferred: true,
          lastError: ""
        });
        return;
      }

      if (!response || response.ok !== false) return;
      if (currentCapture) currentCapture.restartRequested = false;
      updateStatus(tabId, {
        lastError: response.error || "Relance automatique de capture impossible."
      });
    });
  }

  function handleNormalizerState(tabId, stream, nextState, startedAt, restartCount) {
    const capture = captures.get(tabId);
    const updatedStatus = updateStatus(
      tabId,
      buildNormalizerStatus(
        stream,
        nextState,
        startedAt,
        restartCount,
        capture && capture.restartDeferred,
        capture
      )
    );
    if (!updatedStatus) return null;

    if (updatedStatus.captureSignalState === "signal" && capture) {
      capture.restartRequested = false;
      capture.restartDeferred = false;
      if (updatedStatus.captureRestartDeferred || updatedStatus.lastError) {
        return updateStatus(tabId, { captureRestartDeferred: false, lastError: "" });
      }
      return updatedStatus;
    }

    requestCaptureRestart(tabId, updatedStatus);
    return updatedStatus;
  }

  function scheduleCaptureSignalWatchdog(tabId) {
    const capture = captures.get(tabId);
    if (!capture) return;

    if (capture.signalWatchdogTimer) {
      clearTimeout(capture.signalWatchdogTimer);
    }

    capture.signalWatchdogTimer = setTimeout(() => {
      const capture = captures.get(tabId);
      if (!capture) return;

      capture.signalWatchdogTimer = null;
      if (capture.status.captureSignalState !== "starting") return;

      handleNormalizerState(tabId, capture.stream, capture.normalizer.getState(), capture.startedAt, capture.restartCount);
    }, CAPTURE_NO_SIGNAL_WATCHDOG_MS + 250);
  }

  function stopCapture(tabId, options) {
    const stopOptions = options && typeof options === "object" ? options : {};
    const capture = captures.get(tabId);
    if (!capture) return { ok: true, enabled: false };

    if (capture.signalWatchdogTimer) {
      clearTimeout(capture.signalWatchdogTimer);
    }

    try {
      capture.normalizer.stop();
    } catch (error) {
      // Best-effort cleanup when the tab or offscreen document is closing.
    }

    try {
      capture.stream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      // Some browsers already stop tracks when capture ends.
    }

    captures.delete(tabId);
    const status = {
      ...capture.status,
      enabled: false,
      mediaProcessed: 0,
      sourceType: "none",
      captureStopReason: stopOptions.reason || "manual-stop",
      updatedAt: Date.now()
    };

    if (!stopOptions.silent) {
      postStatus(tabId, status);
    }

    return { ok: true, status };
  }

  function updateCaptureSettingsFromSavedSettings(tabId, savedSettings, site) {
    const capture = captures.get(tabId);
    if (!capture) return null;

    const captureSite = site || capture.site;
    if (Settings.isDomainExcluded(captureSite, Settings.normalizeSettings(savedSettings))) {
      stopCapture(tabId, { reason: "site-excluded" });
      return null;
    }

    const settings = Settings.getSettingsForDomain(savedSettings, captureSite);
    capture.settings = settings;
    capture.site = captureSite;
    capture.normalizer.updateSettings(settings, { immediate: true });
    return updateStatus(tabId, {
      site: Settings.normalizeDomain(capture.site),
      activeProfile: settings.activeProfile,
      targetRmsDb: settings.targetRmsDb,
      maxBoostDb: settings.maxBoostDb
    });
  }

  async function startCapture(message) {
    const tabId = Number(message.tabId);
    if (!tabId || !message.streamId) {
      return { ok: false, error: "Invalid tab capture request." };
    }

    stopCapture(tabId, { reason: "capture-restart", silent: true });

    const settings = Settings.getSettingsForDomain(message.settings, message.site);
    const restartCount = Number(message.restartCount) || 0;
    const status = baseStatus(tabId, message.site, settings, restartCount);
    let stream = null;
    let normalizer = null;
    let startedAt = Date.now();

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: "tab",
            chromeMediaSourceId: message.streamId
          }
        },
        video: false
      });
      startedAt = Date.now();
      Object.assign(status, getCaptureHealth(stream));
      normalizer = Normalizer.createMediaStreamNormalizer(stream, settings, {
        onState(nextState) {
          handleNormalizerState(tabId, stream, nextState, startedAt, restartCount);
        },
        onCalibrationEvent(event) {
          forwardCalibrationEvent(tabId, message.site, event);
        }
      });

      captures.set(tabId, {
        stream,
        normalizer,
        settings,
        site: message.site,
        status,
        startedAt,
        restartCount,
        restartRequested: false,
        restartDeferred: false,
        signalWatchdogTimer: null
      });
      stream.getTracks().forEach((track) => {
        track.addEventListener("ended", () => stopCapture(tabId, { reason: "track-ended" }), { once: true });
      });

      await normalizer.start();
      scheduleCaptureSignalWatchdog(tabId);
      const startedStatus = handleNormalizerState(tabId, stream, normalizer.getState(), startedAt, restartCount);
      return { ok: true, status: startedStatus || captures.get(tabId).status };
    } catch (error) {
      if (captures.has(tabId)) {
        stopCapture(tabId, { reason: "startup-error" });
      } else {
        try {
          if (normalizer) normalizer.stop();
        } catch (cleanupError) {
          // Best-effort cleanup after a failed capture startup.
        }
        try {
          if (stream) stream.getTracks().forEach((track) => track.stop());
        } catch (cleanupError) {
          // Best-effort cleanup after a failed capture startup.
        }
      }
      const failedStatus = { ...status, ok: false, enabled: false, mediaProcessed: 0, lastError: error.message };
      postStatus(tabId, failedStatus);
      return { ok: false, error: error.message, status: failedStatus };
    }
  }

  function updateSettings(message) {
    const tabId = Number(message.tabId);
    const status = updateCaptureSettingsFromSavedSettings(tabId, message.settings, message.site);
    if (!status) return { ok: true, enabled: false };
    return { ok: true, status };
  }

  function setPanic(message) {
    const tabId = Number(message.tabId);
    const capture = captures.get(tabId);
    if (!capture) return { ok: true, enabled: false };
    capture.normalizer.setPanic(Boolean(message.active));
    const status = updateStatus(tabId, { panicActive: Boolean(message.active) });
    return { ok: true, status };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.target !== "offscreen") return false;

    if (message.type === "WLG_START_TAB_CAPTURE") {
      startCapture(message).then(sendResponse);
      return true;
    }

    if (message.type === "WLG_STOP_TAB_CAPTURE") {
      sendResponse(stopCapture(Number(message.tabId), { reason: "user-stop" }));
      return false;
    }

    if (message.type === "WLG_UPDATE_CAPTURE_SETTINGS") {
      sendResponse(updateSettings(message));
      return false;
    }

    if (message.type === "WLG_SET_CAPTURE_PANIC") {
      sendResponse(setPanic(message));
      return false;
    }

    return false;
  });

  if (root.chrome && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      if (!changes[Settings.SETTINGS_KEY] && !changes[Settings.LEGACY_SETTINGS_KEY]) return;

      Settings.getSettings().then((savedSettings) => {
        captures.forEach((capture, tabId) => {
          updateCaptureSettingsFromSavedSettings(tabId, savedSettings);
        });
      }).catch((error) => {
        console.warn("StreamVolume Guard Hub could not refresh tab capture settings.", error);
      });
    });
  }
})(globalThis);
