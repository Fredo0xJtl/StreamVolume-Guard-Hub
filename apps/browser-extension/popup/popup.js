(function initPopup(root) {
  const WLG = root.StreamVolumeGuard;
  const Settings = WLG.Settings;

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
    protectButton: document.getElementById("protectButton"),
    autoDomainButton: document.getElementById("autoDomainButton"),
    panicButton: document.getElementById("panicButton"),
    copyDiagnosticButton: document.getElementById("copyDiagnosticButton"),
    optionsButton: document.getElementById("optionsButton"),
    message: document.getElementById("message")
  };

  let currentSettings = Settings.normalizeSettings();
  let currentStatus = null;
  let refreshTimer = null;
  const STATUS_REFRESH_MS = 250;

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
        resolve(response || { ok: true });
      });
    });
  }

  function formatDb(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "0.0 dB";
    return `${number.toFixed(1)} dB`;
  }

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
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

  function requiresTabCaptureUpgrade(status) {
    if (!status || !status.enabled || !status.site) return false;
    return Settings.getPreferredSourceTypeForDomain(status.site) === "tab-capture" &&
      status.sourceType !== "tab-capture";
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

    if (status.panicActive) {
      items.push({ key: "diagnosticPanicActive", tone: "error" });
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

    if (status.lastError) {
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

  function render() {
    const status = currentStatus || {};
    const excluded = Boolean(status.excluded);
    const enabled = Boolean(status.enabled);
    const shouldStopProtection = enabled && !requiresTabCaptureUpgrade(status);

    elements.siteLabel.textContent = status.site || i18n("popupUnknownSite", "unknown site");
    elements.enabledToggle.checked = currentSettings.enabled && shouldStopProtection;
    elements.enabledToggle.disabled = excluded;
    elements.profileSelect.value = status.activeProfile || Settings.getEffectiveProfileIdForDomain(currentSettings, status.site);
    elements.profileHint.textContent = profileHintForStatus(status);
    elements.gainValue.textContent = formatDb(status.gainDb);
    elements.rmsValue.textContent = formatDb(status.rmsDb);
    elements.mediaValue.textContent = `${status.mediaProcessed || 0}/${status.mediaDetected || 0}`;
    renderRisk(status);
    renderDiagnostics(status);

    elements.statusBadge.classList.toggle("is-on", shouldStopProtection && !excluded);
    elements.statusBadge.classList.toggle("is-blocked", excluded);
    elements.statusBadge.textContent = excluded
      ? i18n("popupExcluded", "excluded")
      : shouldStopProtection
        ? i18n("popupActive", "active")
        : i18n("popupReady", "ready");

    elements.autoDomainButton.disabled = !status.site;
    elements.protectButton.disabled = excluded;
    elements.protectButton.textContent = shouldStopProtection
      ? i18n("popupStopProtection", "Stop protection")
      : i18n("popupProtectTab", "Protect this tab");
    elements.panicButton.classList.toggle("is-panic-active", Boolean(status.panicActive));
    elements.panicButton.textContent = status.panicActive
      ? i18n("popupPanicActive", "Panic active")
      : i18n("popupPanic", "Panic");
  }

  async function refresh() {
    currentSettings = await Settings.getSettings();
    currentStatus = await sendRuntimeMessage("WLG_GET_ACTIVE_STATUS");
    render();
  }

  async function setEnabled(enabled) {
    currentSettings = await Settings.saveSettings({ enabled });
    currentStatus = enabled
      ? await sendRuntimeMessage("WLG_PROTECT_CURRENT_TAB")
      : await sendRuntimeMessage("WLG_DEACTIVATE_CURRENT_TAB");
    if (!currentStatus.ok && currentStatus.error) setMessage(currentStatus.error);
    render();
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
    await sendRuntimeMessage("WLG_REFRESH_ACTIVE_TAB");
    setMessage(site ? i18n("popupProfileSaved", "Profile saved for this site") : "");
    await refresh();
  }

  async function setPanic(active) {
    const response = await sendRuntimeMessage("WLG_SET_PANIC", { active });
    if (!response.ok && response.error) setMessage(response.error);
    await refresh();
  }

  async function copyDiagnostic() {
    const manifest = root.chrome && chrome.runtime && chrome.runtime.getManifest
      ? chrome.runtime.getManifest()
      : {};
    const diagnostic = {
      product: "StreamVolume Guard Hub",
      extensionVersion: manifest.version || "dev",
      generatedAt: new Date().toISOString(),
      browserLanguage: root.navigator && root.navigator.language ? root.navigator.language : "",
      site: currentStatus && currentStatus.site ? currentStatus.site : "",
      sourceType: currentStatus && currentStatus.sourceType ? currentStatus.sourceType : "unknown",
      activeProfile: currentStatus && currentStatus.activeProfile ? currentStatus.activeProfile : currentSettings.activeProfile,
      enabled: Boolean(currentStatus && currentStatus.enabled),
      excluded: Boolean(currentStatus && currentStatus.excluded),
      canInject: currentStatus ? currentStatus.canInject !== false : false,
      canCaptureTab: currentStatus ? currentStatus.canCaptureTab !== false : false,
      panicActive: Boolean(currentStatus && currentStatus.panicActive),
      mediaDetected: finiteNumber(currentStatus && currentStatus.mediaDetected, 0),
      mediaProcessed: finiteNumber(currentStatus && currentStatus.mediaProcessed, 0),
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
      tabAudible: Boolean(currentStatus && currentStatus.tabAudible),
      tabActive: Boolean(currentStatus && currentStatus.tabActive),
      lastError: currentStatus && currentStatus.lastError ? String(currentStatus.lastError).slice(0, 300) : "",
      privacy: {
        localOnly: true,
        sentAutomatically: false,
        includesFullUrl: false,
        includesPageTitle: false,
        includesAudio: false
      }
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnostic, null, 2));
      setMessage(i18n("popupDiagnosticCopied", "Diagnostic copied"));
    } catch (error) {
      setMessage(i18n("popupDiagnosticCopyFailed", "Copy failed"));
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
    setEnabled(elements.enabledToggle.checked);
  });

  elements.profileSelect.addEventListener("change", () => {
    setProfile(elements.profileSelect.value);
  });

  elements.protectButton.addEventListener("click", () => {
    const shouldStopProtection = currentStatus && currentStatus.enabled && !requiresTabCaptureUpgrade(currentStatus);
    setEnabled(!shouldStopProtection);
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
  refresh();
  refreshTimer = root.setInterval(refresh, STATUS_REFRESH_MS);
  root.addEventListener("unload", () => root.clearInterval(refreshTimer));
})(globalThis);
