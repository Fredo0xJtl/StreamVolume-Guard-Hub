// Local settings schema shared by popup, options, background, and content scripts.
(function initSettings(root) {
  const WLG = root.StreamVolumeGuard = root.StreamVolumeGuard || {};

  const SETTINGS_KEY = "streamVolumeGuard.settings";
  const LEGACY_SETTINGS_KEY = "webloudnessGuard.settings";
  const SETTINGS_SCHEMA_VERSION = 9;
  const RECOVERABLE_BOOST_HEADROOM_DB = 2;

  const PROFILES = {
    soft: {
      id: "soft",
      label: "Doux",
      targetRmsDb: -20,
      attackMs: 140,
      releaseMs: 1400,
      compressorThresholdDb: -16,
      compressorKneeDb: 18,
      compressorRatio: 2.2,
      ratio: 2.2,
      limiterCeilingDb: -1
    },
    normal: {
      id: "normal",
      label: "Normal",
      targetRmsDb: -18,
      attackMs: 100,
      releaseMs: 1100,
      compressorThresholdDb: -15,
      compressorKneeDb: 14,
      compressorRatio: 3,
      ratio: 3,
      limiterCeilingDb: -1
    },
    stream: {
      id: "stream",
      label: "Stream",
      targetRmsDb: -21,
      attackMs: 80,
      releaseMs: 1250,
      compressorThresholdDb: -18,
      compressorKneeDb: 14,
      compressorRatio: 3,
      ratio: 3,
      limiterCeilingDb: -1
    },
    obs: {
      id: "obs",
      label: "OBS",
      targetRmsDb: -22,
      attackMs: 40,
      releaseMs: 850,
      compressorThresholdDb: -20,
      compressorKneeDb: 10,
      compressorRatio: 4.5,
      ratio: 4.5,
      limiterCeilingDb: -1
    },
    night: {
      id: "night",
      label: "Nuit",
      targetRmsDb: -24,
      attackMs: 70,
      releaseMs: 1800,
      compressorThresholdDb: -22,
      compressorKneeDb: 12,
      compressorRatio: 5,
      ratio: 5,
      limiterCeilingDb: -1.5
    }
  };

  const PLATFORM_PROFILE_RULES = [
    { domains: ["youtube.com", "youtu.be"], profileId: "stream" },
    { domains: ["twitch.tv"], profileId: "stream" },
    { domains: ["tiktok.com"], profileId: "stream" },
    { domains: ["kick.com"], profileId: "stream" },
    { domains: ["spotify.com", "open.spotify.com"], profileId: "stream" },
    { domains: ["deezer.com"], profileId: "stream" }
  ];

  const PLATFORM_SOURCE_RULES = [
    { domains: ["tiktok.com"], sourceType: "tab-capture" }
  ];

  const DEFAULT_SETTINGS = {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    enabled: true,
    activeProfile: "stream",
    targetRmsMode: "profile",
    targetRmsDb: PROFILES.stream.targetRmsDb,
    desktopTargetProfile: "",
    desktopTargetSource: "",
    desktopTargetUpdatedAt: "",
    maxBoostDb: 48,
    maxReductionDb: -24,
    autoDomains: [],
    excludedDomains: [],
    domainProfiles: {},
    platformProfilesEnabled: true,
    showAdvancedControls: false,
    limiterEnabled: true,
    compressorEnabled: true,
    panicGainDb: -30
  };
  const TARGET_RMS_MIN_DB = -48;
  const TARGET_RMS_MAX_DB = -15;
  const LOCAL_TEST_QUIET_RMS_DB = -63;

  let memorySettings = { ...DEFAULT_SETTINGS };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function storageAvailable() {
    return Boolean(root.chrome && chrome.storage && chrome.storage.local);
  }

  function normalizeDomain(input) {
    if (!input || typeof input !== "string") return "";

    let value = input.trim().toLowerCase();
    if (!value) return "";
    value = value.replace(/^\*\./, "");

    try {
      const url = new URL(value.includes("://") ? value : `https://${value}`);
      return url.hostname.replace(/^www\./, "");
    } catch (error) {
      return value
        .replace(/^[a-z]+:\/\//, "")
        .split("/")[0]
        .split("?")[0]
        .split("#")[0]
        .split(":")[0]
        .replace(/^www\./, "");
    }
  }

  function uniqueDomains(domains) {
    if (!Array.isArray(domains)) return [];
    return Array.from(new Set(domains.map(normalizeDomain).filter(Boolean))).sort();
  }

  function normalizeProfileId(profileId) {
    return profileId === "universal" ? "stream" : profileId;
  }

  function normalizeDomainProfiles(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.entries(value).reduce((result, [domain, profileId]) => {
      const normalizedDomain = normalizeDomain(domain);
      const normalizedProfileId = normalizeProfileId(profileId);
      if (normalizedDomain && PROFILES[normalizedProfileId]) {
        result[normalizedDomain] = normalizedProfileId;
      }
      return result;
    }, {});
  }

  function getMinimumRecoverableBoostDb(targetRmsDb) {
    const target = Number(targetRmsDb);
    if (!Number.isFinite(target)) return DEFAULT_SETTINGS.maxBoostDb;
    return Math.min(48, Math.max(0, Math.ceil(target - LOCAL_TEST_QUIET_RMS_DB + RECOVERABLE_BOOST_HEADROOM_DB)));
  }

  function normalizeSettings(input) {
    const stored = input && typeof input === "object" ? input : {};
    const storedSchemaVersion = Number(stored.schemaVersion) || 0;
    const lowBoostNeedsMigration =
      storedSchemaVersion > 0 &&
      storedSchemaVersion < 4 &&
      Number(stored.maxBoostDb) < 45;
    const defaultStreamTargetNeedsMigration =
      storedSchemaVersion > 0 &&
      storedSchemaVersion < 5 &&
      (stored.activeProfile || DEFAULT_SETTINGS.activeProfile) === "stream" &&
      Math.abs(Number(stored.targetRmsDb) - -18.5) <= 0.01;
    const merged = {
      ...DEFAULT_SETTINGS,
      ...stored,
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      autoDomains: uniqueDomains(stored.autoDomains || DEFAULT_SETTINGS.autoDomains),
      excludedDomains: uniqueDomains(stored.excludedDomains || DEFAULT_SETTINGS.excludedDomains),
      domainProfiles: normalizeDomainProfiles(stored.domainProfiles || DEFAULT_SETTINGS.domainProfiles)
    };

    merged.activeProfile = normalizeProfileId(merged.activeProfile);
    if (!PROFILES[merged.activeProfile]) merged.activeProfile = DEFAULT_SETTINGS.activeProfile;

    const rawTargetRmsDb = Number(merged.targetRmsDb);
    const activeProfileTargetRmsDb = PROFILES[merged.activeProfile].targetRmsDb;
    const explicitTargetRmsMode = stored.targetRmsMode === "custom" || stored.targetRmsMode === "profile" || stored.targetRmsMode === "desktop"
      ? stored.targetRmsMode
      : "";
    const inferredTargetRmsMode = Number.isFinite(rawTargetRmsDb) &&
      Math.abs(rawTargetRmsDb - activeProfileTargetRmsDb) > 0.01
      ? "custom"
      : "profile";
    merged.targetRmsMode = explicitTargetRmsMode || inferredTargetRmsMode;
    merged.targetRmsDb = Number.isFinite(rawTargetRmsDb)
      ? Math.max(TARGET_RMS_MIN_DB, Math.min(TARGET_RMS_MAX_DB, rawTargetRmsDb))
      : activeProfileTargetRmsDb;
    if (defaultStreamTargetNeedsMigration) {
      merged.targetRmsMode = "profile";
      merged.targetRmsDb = PROFILES[merged.activeProfile].targetRmsDb;
    }
    if (merged.targetRmsMode === "profile") {
      merged.targetRmsDb = activeProfileTargetRmsDb;
    }
    merged.desktopTargetProfile = normalizeOptionalString(merged.desktopTargetProfile);
    merged.desktopTargetSource = normalizeOptionalString(merged.desktopTargetSource);
    merged.desktopTargetUpdatedAt = normalizeOptionalString(merged.desktopTargetUpdatedAt);
    merged.maxBoostDb = Math.min(48, Math.max(0, Number(merged.maxBoostDb)));
    if (lowBoostNeedsMigration) {
      merged.maxBoostDb = DEFAULT_SETTINGS.maxBoostDb;
    }
    merged.maxBoostDb = Math.max(merged.maxBoostDb, getMinimumRecoverableBoostDb(merged.targetRmsDb));
    merged.maxReductionDb = Math.max(-48, Math.min(0, Number(merged.maxReductionDb)));
    merged.enabled = Boolean(merged.enabled);
    merged.limiterEnabled = merged.limiterEnabled !== false;
    merged.compressorEnabled = merged.compressorEnabled !== false;
    merged.platformProfilesEnabled = merged.platformProfilesEnabled !== false;
    {
      const panicGainDb = Number(merged.panicGainDb);
      merged.panicGainDb = Number.isFinite(panicGainDb)
        ? Math.max(-60, Math.min(-6, panicGainDb))
        : DEFAULT_SETTINGS.panicGainDb;
    }

    return merged;
  }

  function getProfile(profileId) {
    const normalizedProfileId = normalizeProfileId(profileId);
    return clone(PROFILES[normalizedProfileId] || PROFILES.normal);
  }

  function getSettings() {
    if (!storageAvailable()) {
      return Promise.resolve(normalizeSettings(memorySettings));
    }

    return new Promise((resolve) => {
      chrome.storage.local.get([SETTINGS_KEY, LEGACY_SETTINGS_KEY], (result) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          resolve(normalizeSettings(memorySettings));
          return;
        }

        const hasCurrentSettings = Boolean(result && result[SETTINGS_KEY]);
        const hasLegacySettings = Boolean(result && result[LEGACY_SETTINGS_KEY]);
        const next = normalizeSettings(
          hasCurrentSettings ? result[SETTINGS_KEY] : result[LEGACY_SETTINGS_KEY]
        );

        if (!hasCurrentSettings && hasLegacySettings) {
          chrome.storage.local.set({ [SETTINGS_KEY]: next });
        }

        resolve(next);
      });
    });
  }

  async function saveSettings(partialSettings) {
    const current = await getSettings();
    const partial = partialSettings && typeof partialSettings === "object" ? partialSettings : {};
    const hasTargetChange = Object.prototype.hasOwnProperty.call(partial, "targetRmsDb");
    const hasTargetModeChange = Object.prototype.hasOwnProperty.call(partial, "targetRmsMode");
    const nextInput = {
      ...current,
      ...partial,
      ...(hasTargetChange && !hasTargetModeChange ? { targetRmsMode: "custom" } : {})
    };
    const next = normalizeSettings(nextInput);
    memorySettings = clone(next);

    if (!storageAvailable()) return next;

    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [SETTINGS_KEY]: next }, () => {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(next);
      });
    });
  }

  async function resetSettings() {
    memorySettings = clone(DEFAULT_SETTINGS);

    if (!storageAvailable()) return clone(DEFAULT_SETTINGS);

    return new Promise((resolve, reject) => {
      chrome.storage.local.remove([SETTINGS_KEY, LEGACY_SETTINGS_KEY], () => {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(clone(DEFAULT_SETTINGS));
      });
    });
  }

  function domainInList(domain, domains) {
    const normalized = normalizeDomain(domain);
    return uniqueDomains(domains).some((entry) => {
      return normalized === entry || normalized.endsWith(`.${entry}`);
    });
  }

  function isDomainExcluded(domain, settings) {
    return domainInList(domain, settings.excludedDomains);
  }

  function isDomainAutoEnabled(domain, settings) {
    return domainInList(domain, settings.autoDomains);
  }

  function getRecommendedProfileForDomain(domain) {
    const normalizedDomain = normalizeDomain(domain);
    const match = PLATFORM_PROFILE_RULES.find((rule) => domainInList(normalizedDomain, rule.domains));
    return match ? match.profileId : "";
  }

  function getPreferredSourceTypeForDomain(domain) {
    const normalizedDomain = normalizeDomain(domain);
    const match = PLATFORM_SOURCE_RULES.find((rule) => domainInList(normalizedDomain, rule.domains));
    return match ? match.sourceType : "media-html";
  }

  function getEffectiveProfileIdForDomain(settings, domain) {
    const normalized = normalizeSettings(settings);
    const normalizedDomain = normalizeDomain(domain);
    const domainProfiles = normalized.domainProfiles || {};
    const matchedDomainProfile = Object.entries(domainProfiles)
      .sort(([leftDomain], [rightDomain]) => rightDomain.length - leftDomain.length)
      .find(([profileDomain, profileId]) => {
        return PROFILES[profileId] && domainInList(normalizedDomain, [profileDomain]);
      });

    if (matchedDomainProfile) {
      return matchedDomainProfile[1];
    }

    if (normalized.platformProfilesEnabled) {
      const recommendedProfile = getRecommendedProfileForDomain(normalizedDomain);
      if (recommendedProfile) return recommendedProfile;
    }

    return normalized.activeProfile;
  }

  function getSettingsForDomain(settings, domain) {
    const normalized = normalizeSettings(settings);
    const effectiveProfileId = getEffectiveProfileIdForDomain(normalized, domain);
    return normalizeSettings({
      ...normalized,
      activeProfile: effectiveProfileId
    });
  }

  function normalizeOptionalString(value) {
    if (value === undefined || value === null) return "";
    return String(value).replace(/[\r\n\t]+/g, " ").trim();
  }

  function applyGlobalTarget(settings, targetState) {
    const normalized = normalizeSettings(settings);
    const state = targetState && typeof targetState === "object" ? targetState : {};
    if (state.type !== "global_target_state") return normalized;

    const rawTarget = Number(state.targetRmsDb ?? state.targetDecibels);
    if (!Number.isFinite(rawTarget)) return normalized;

    const targetRmsDb = Math.max(TARGET_RMS_MIN_DB, Math.min(TARGET_RMS_MAX_DB, rawTarget));
    return normalizeSettings({
      ...normalized,
      targetRmsMode: "desktop",
      targetRmsDb: targetRmsDb,
      desktopTargetProfile: normalizeOptionalString(state.targetProfile) || "Standard",
      desktopTargetSource: normalizeOptionalString(state.source) || "Desktop",
      desktopTargetUpdatedAt: normalizeOptionalString(state.updatedAt) || new Date().toISOString()
    });
  }

  function getRuntimeProfile(settings) {
    const normalized = normalizeSettings(settings);
    return {
      ...getProfile(normalized.activeProfile),
      targetRmsDb: normalized.targetRmsDb,
      maxBoostDb: normalized.maxBoostDb,
      maxReductionDb: normalized.maxReductionDb
    };
  }

  WLG.Settings = {
    SETTINGS_KEY,
    LEGACY_SETTINGS_KEY,
    SETTINGS_SCHEMA_VERSION,
    DEFAULT_SETTINGS: clone(DEFAULT_SETTINGS),
    PROFILES: clone(PROFILES),
    PLATFORM_PROFILE_RULES: clone(PLATFORM_PROFILE_RULES),
    PLATFORM_SOURCE_RULES: clone(PLATFORM_SOURCE_RULES),
    getProfile,
    getRuntimeProfile,
    getRecommendedProfileForDomain,
    getPreferredSourceTypeForDomain,
    getEffectiveProfileIdForDomain,
    getSettingsForDomain,
    applyGlobalTarget,
    getSettings,
    saveSettings,
    resetSettings,
    normalizeDomain,
    normalizeSettings,
    getMinimumRecoverableBoostDb,
    isDomainExcluded,
    isDomainAutoEnabled,
    domainInList
  };
})(globalThis);
