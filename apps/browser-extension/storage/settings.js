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

  const MEDIA_HTML_SOURCE_TYPE = "media-html";
  const TAB_CAPTURE_SOURCE_TYPE = "tab-capture";
  const PLATFORM_SOURCE_RULES = [];
  const SOURCE_MEMORY_SCHEMA_VERSION = 1;
  const DOMAIN_SOURCE_MEMORY_SOURCE_TYPES = [MEDIA_HTML_SOURCE_TYPE, TAB_CAPTURE_SOURCE_TYPE];
  const DOMAIN_SOURCE_MEMORY_LOCK_TTL_MS = 6 * 60 * 60 * 1000;
  const DOMAIN_SOURCE_MEMORY_EXPIRY_MS = 14 * 24 * 60 * 60 * 1000;
  const DOMAIN_SOURCE_MEMORY_SCORE_SUCCESS = 4;
  const DOMAIN_SOURCE_MEMORY_SCORE_NO_SIGNAL = -3;
  const DOMAIN_SOURCE_MEMORY_SCORE_NO_MEDIA = -2;
  const DOMAIN_SOURCE_MEMORY_SCORE_START_FAILED = -3;
  const DOMAIN_SOURCE_MEMORY_SCORE_UNKNOWN_FAILURE = -2;
  const DOMAIN_SOURCE_MEMORY_MIN_SCORE_TO_PREFER = 0;
  const DOMAIN_SOURCE_MEMORY_MIN_ATTEMPTS_TO_CONSIDER = 1;
  const DOMAIN_SOURCE_MEMORY_MAX_PREFERENCE_FAILURES = 2;

  function normalizeSourceType(sourceType) {
    if (sourceType === MEDIA_HTML_SOURCE_TYPE) return MEDIA_HTML_SOURCE_TYPE;
    if (sourceType === TAB_CAPTURE_SOURCE_TYPE) return TAB_CAPTURE_SOURCE_TYPE;
    return "";
  }

  function emptySourceMemorySnapshot() {
    return {
      attempts: 0,
      successes: 0,
      failures: 0,
      consecutiveFailures: 0,
      score: 0,
      lastOutcome: "",
      lastOutcomeReason: "",
      lastUpdatedAt: 0
    };
  }

  function normalizeSourceMemorySnapshot(raw) {
    const now = Date.now();
    const value = raw && typeof raw === "object" ? raw : {};
    return {
      attempts: Number.isFinite(Number(value.attempts)) ? Number(value.attempts) : 0,
      successes: Number.isFinite(Number(value.successes)) ? Number(value.successes) : 0,
      failures: Number.isFinite(Number(value.failures)) ? Number(value.failures) : 0,
      consecutiveFailures: Number.isFinite(Number(value.consecutiveFailures)) ? Number(value.consecutiveFailures) : 0,
      score: Number.isFinite(Number(value.score)) ? Number(value.score) : 0,
      lastOutcome: String(value.lastOutcome || ""),
      lastOutcomeReason: String(value.lastOutcomeReason || ""),
      lastUpdatedAt: Number.isFinite(Number(value.lastUpdatedAt)) ? Number(value.lastUpdatedAt) : now
    };
  }

  function calculateSourceMemoryScore(score) {
    return Number.isFinite(Number(score)) ? Number(score) : 0;
  }

  function clampSourceScore(score) {
    const next = Math.round(Number.isFinite(Number(score)) ? Number(score) : 0);
    return Math.max(-12, Math.min(20, next));
  }

  function normalizeSourceMemoryForDomain(raw) {
    const now = Date.now();
    const value = raw && typeof raw === "object" ? raw : {};
    const lastUpdatedAt = Number.isFinite(Number(value.lastUpdatedAt)) ? Number(value.lastUpdatedAt) : 0;
    const rawSources = value.sources && typeof value.sources === "object" ? value.sources : value;
    const sources = {};

    DOMAIN_SOURCE_MEMORY_SOURCE_TYPES.forEach((sourceType) => {
      sources[sourceType] = normalizeSourceMemorySnapshot(rawSources[sourceType]);
    });

    const base = {
      v: SOURCE_MEMORY_SCHEMA_VERSION,
      sources,
      preferredSourceType: normalizeSourceType(value.preferredSourceType),
      preferredUntilMs: Number.isFinite(Number(value.preferredUntilMs)) ? Number(value.preferredUntilMs) : 0,
      preferredFailureCount: Number.isFinite(Number(value.preferredFailureCount)) ? Number(value.preferredFailureCount) : 0,
      lastUpdatedAt
    };

    if (now - base.lastUpdatedAt > DOMAIN_SOURCE_MEMORY_EXPIRY_MS) {
      return {
        v: SOURCE_MEMORY_SCHEMA_VERSION,
        sources: {
          "media-html": emptySourceMemorySnapshot(),
          "tab-capture": emptySourceMemorySnapshot()
        },
        preferredSourceType: "",
        preferredUntilMs: 0,
        preferredFailureCount: 0,
        lastUpdatedAt: now
      };
    }

    return base;
  }

  function normalizeDomainSourceMemory(raw) {
    const now = Date.now();
    const input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const cleaned = {};

    Object.keys(input).forEach((domain) => {
      const normalizedDomain = normalizeDomain(domain);
      if (!normalizedDomain) return;
      cleaned[normalizedDomain] = normalizeSourceMemoryForDomain(input[domain]);
    });

    return cleaned;
  }

  function sourceMemoryOutcomeScoreDelta(outcome) {
    const normalizedOutcome = String(outcome || "").toLowerCase();
    if (normalizedOutcome === "success") return DOMAIN_SOURCE_MEMORY_SCORE_SUCCESS;
    if (normalizedOutcome === "tab-capture-no-signal" || normalizedOutcome === "no-signal") return DOMAIN_SOURCE_MEMORY_SCORE_NO_SIGNAL;
    if (normalizedOutcome === "media-no-detect" || normalizedOutcome === "no-media") return DOMAIN_SOURCE_MEMORY_SCORE_NO_MEDIA;
    if (normalizedOutcome === "start-failed" || normalizedOutcome === "tab-capture-start-failed") return DOMAIN_SOURCE_MEMORY_SCORE_START_FAILED;
    return DOMAIN_SOURCE_MEMORY_SCORE_UNKNOWN_FAILURE;
  }

  function clampSourceMemoryAttempt(value) {
    if (!Number.isFinite(Number(value))) return 0;
    return Math.max(0, Math.floor(Number(value)));
  }

  function sourceMemoryOutcomeIsSuccess(outcome) {
    return String(outcome || "").toLowerCase() === "success";
  }

  function isFreshSourceFailure(sourceState, now) {
    if (!sourceState) return false;
    const lastOutcome = String(sourceState.lastOutcome || "").toLowerCase();
    if (lastOutcome === "success") return false;
    if (!Number.isFinite(Number(sourceState.lastUpdatedAt))) return false;
    return (now - Number(sourceState.lastUpdatedAt)) <= DOMAIN_SOURCE_MEMORY_LOCK_TTL_MS;
  }

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
    domainSourceMemory: {},
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
      domainProfiles: normalizeDomainProfiles(stored.domainProfiles || DEFAULT_SETTINGS.domainProfiles),
      domainSourceMemory: normalizeDomainSourceMemory(stored.domainSourceMemory || DEFAULT_SETTINGS.domainSourceMemory)
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

  function getDomainSourceMemory(settings, domain) {
    const normalized = normalizeSettings(settings || {});
    const normalizedDomain = normalizeDomain(domain);
    if (!normalizedDomain) return null;
    return normalized.domainSourceMemory && normalized.domainSourceMemory[normalizedDomain] ? normalized.domainSourceMemory[normalizedDomain] : null;
  }

  function isFailureSourceMemoryOutcome(outcome) {
    return String(outcome || "").toLowerCase() !== "success";
  }

  function shouldIgnoreLockedPreferredSource(domainEntry, now) {
    if (!domainEntry || !domainEntry.preferredSourceType) return false;
    const preferredSourceType = normalizeSourceType(domainEntry.preferredSourceType);
    if (!preferredSourceType) return false;
    const sourceState = domainEntry.sources && domainEntry.sources[preferredSourceType];
    if (!sourceState) return false;
    if (isFreshSourceFailure(sourceState, now)) return true;
    if (!isFailureSourceMemoryOutcome(sourceState.lastOutcome)) return false;
    const lockedFailureCount = clampSourceMemoryAttempt(Math.max(
      Number(sourceState.consecutiveFailures),
      Number(domainEntry.preferredFailureCount)
    ));
    if (lockedFailureCount < DOMAIN_SOURCE_MEMORY_MAX_PREFERENCE_FAILURES) return false;
    if (!Number.isFinite(Number(sourceState.lastUpdatedAt))) return false;
    return now - Number(sourceState.lastUpdatedAt) <= DOMAIN_SOURCE_MEMORY_LOCK_TTL_MS;
  }

  function pickPreferredSourceFromDomainMemory(domainEntry) {
    if (!domainEntry || !domainEntry.sources) return "";

    const now = Date.now();
    const candidateEntries = [];

    if (domainEntry.preferredSourceType && now <= Number(domainEntry.preferredUntilMs || 0)) {
      const preferredSourceType = normalizeSourceType(domainEntry.preferredSourceType);
      const preferredSourceState = domainEntry.sources && domainEntry.sources[preferredSourceType];
      const preferredScore = calculateSourceMemoryScore(preferredSourceState && preferredSourceState.score);
      if (preferredSourceType && preferredScore >= DOMAIN_SOURCE_MEMORY_MIN_SCORE_TO_PREFER && !shouldIgnoreLockedPreferredSource(domainEntry, now)) {
        return preferredSourceType;
      }
    }

    for (const sourceType of DOMAIN_SOURCE_MEMORY_SOURCE_TYPES) {
      const sourceState = domainEntry.sources[sourceType] || {};
      if (isFreshSourceFailure(sourceState, now)) {
        continue;
      }
      const score = calculateSourceMemoryScore(sourceState.score);
      const attempts = clampSourceMemoryAttempt(sourceState.attempts);
      candidateEntries.push({ sourceType, score, attempts });
    }

    const candidates = candidateEntries
      .filter((entry) => entry.attempts >= DOMAIN_SOURCE_MEMORY_MIN_ATTEMPTS_TO_CONSIDER)
      .filter((entry) => entry.score >= DOMAIN_SOURCE_MEMORY_MIN_SCORE_TO_PREFER);

    if (candidates.length === 0) return "";

    candidates.sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.attempts !== left.attempts) return right.attempts - left.attempts;
      return left.sourceType.localeCompare(right.sourceType);
    });

    if (candidates.length < 2) return candidates[0].sourceType;
    if (candidates[0].score === candidates[1].score && candidates[0].attempts === candidates[1].attempts) return "";
    return candidates[0].sourceType;
  }

  function getFallbackSourceTypeForSingleRecentFailure(domainEntry) {
    if (!domainEntry || !domainEntry.sources) return "";

    const now = Date.now();
    const failedSources = DOMAIN_SOURCE_MEMORY_SOURCE_TYPES
      .map((sourceType) => {
        const sourceState = normalizeSourceMemorySnapshot(domainEntry.sources[sourceType]);
        return {
          sourceType,
          attempts: clampSourceMemoryAttempt(sourceState.attempts),
          sourceState
        };
      })
      .filter((entry) => {
        if (entry.attempts !== 1) return false;
        if (!isFailureSourceMemoryOutcome(entry.sourceState.lastOutcome)) return false;
        if (!isFreshSourceFailure(entry.sourceState, now)) return false;
        return true;
      });

    if (failedSources.length !== 1) return "";

    const failed = failedSources[0];
    const alternativeSourceType = failed.sourceType === DOMAIN_SOURCE_MEMORY_SOURCE_TYPES[0]
      ? DOMAIN_SOURCE_MEMORY_SOURCE_TYPES[1]
      : DOMAIN_SOURCE_MEMORY_SOURCE_TYPES[0];
    const alternativeState = normalizeSourceMemorySnapshot(domainEntry.sources[alternativeSourceType]);

    if (clampSourceMemoryAttempt(alternativeState.attempts) > 0) return "";
    return alternativeSourceType;
  }

  function recordDomainSourceMemoryOutcome(settings, domain, sourceType, outcome, reason) {
    const normalizedSourceType = normalizeSourceType(sourceType);
    const normalizedDomain = normalizeDomain(domain);
    const normalizedReason = String(reason || "").trim();
    const normalizedSettings = normalizeSettings(settings || {});
    const next = {
      ...normalizedSettings.domainSourceMemory
    };

    if (!normalizedDomain || !normalizedSourceType) {
      return next;
    }

    const now = Date.now();
    const domainMemory = normalizeSourceMemoryForDomain(next[normalizedDomain]);
    const sourceState = normalizeSourceMemorySnapshot(domainMemory.sources[normalizedSourceType]);
    const delta = sourceMemoryOutcomeScoreDelta(outcome);
    const isSuccess = sourceMemoryOutcomeIsSuccess(outcome);
    const wasPreferred = normalizeSourceType(domainMemory.preferredSourceType) === normalizedSourceType;
    const preferredUntilMs = Number.isFinite(Number(domainMemory.preferredUntilMs)) ? Number(domainMemory.preferredUntilMs) : 0;

    const nextSourceState = {
      ...sourceState,
      attempts: clampSourceMemoryAttempt(sourceState.attempts + 1),
      score: clampSourceScore(sourceState.score + delta),
      lastOutcome: String(outcome || ""),
      lastOutcomeReason: normalizedReason,
      lastUpdatedAt: now
    };
    nextSourceState.failures = isSuccess
      ? clampSourceMemoryAttempt(sourceState.failures)
      : clampSourceMemoryAttempt(sourceState.failures + 1);
    nextSourceState.successes = isSuccess
      ? clampSourceMemoryAttempt(sourceState.successes + 1)
      : clampSourceMemoryAttempt(sourceState.successes);
    nextSourceState.consecutiveFailures = isSuccess
      ? 0
      : clampSourceMemoryAttempt(sourceState.consecutiveFailures + 1);

    domainMemory.sources[normalizedSourceType] = nextSourceState;
    domainMemory.lastUpdatedAt = now;
    domainMemory.preferredFailureCount = wasPreferred && !isSuccess
      ? Math.max(0, Number(domainMemory.preferredFailureCount || 0) + 1)
      : 0;

    if (isSuccess) {
      domainMemory.preferredSourceType = normalizedSourceType;
      domainMemory.preferredUntilMs = now + DOMAIN_SOURCE_MEMORY_LOCK_TTL_MS;
      domainMemory.preferredFailureCount = 0;
    } else if (domainMemory.preferredSourceType && now <= preferredUntilMs && wasPreferred) {
      if (domainMemory.preferredFailureCount >= DOMAIN_SOURCE_MEMORY_MAX_PREFERENCE_FAILURES) {
        domainMemory.preferredSourceType = "";
        domainMemory.preferredUntilMs = 0;
        domainMemory.preferredFailureCount = 0;
      }
    } else if (preferredUntilMs && preferredUntilMs < now) {
      domainMemory.preferredSourceType = "";
      domainMemory.preferredUntilMs = 0;
      domainMemory.preferredFailureCount = 0;
    }

    const recommendedSource = pickPreferredSourceFromDomainMemory({
      ...domainMemory,
      preferredSourceType: ""
    });
    if (!domainMemory.preferredSourceType && recommendedSource) {
      domainMemory.preferredSourceType = recommendedSource;
      domainMemory.preferredUntilMs = now + DOMAIN_SOURCE_MEMORY_LOCK_TTL_MS;
      domainMemory.preferredFailureCount = 0;
    }

    next[normalizedDomain] = {
      ...domainMemory,
      sources: {
        ...domainMemory.sources
      }
    };

    return next;
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
        memorySettings = clone(next);

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
    const normalizedSettings = normalizeSettings(memorySettings || {});
    const domainMemory = getDomainSourceMemory(normalizedSettings, normalizedDomain);
    const fallbackSourceFromSingleRecentFailure = domainMemory ? getFallbackSourceTypeForSingleRecentFailure(domainMemory) : "";
    if (fallbackSourceFromSingleRecentFailure) {
      return fallbackSourceFromSingleRecentFailure;
    }

    const sourceFromMemory = domainMemory ? pickPreferredSourceFromDomainMemory(domainMemory) : "";
    if (sourceFromMemory) {
      return sourceFromMemory;
    }

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
    domainSourceMemory: clone(DEFAULT_SETTINGS.domainSourceMemory),
    getProfile,
    getRuntimeProfile,
    getRecommendedProfileForDomain,
    getPreferredSourceTypeForDomain,
    getDomainSourceMemory,
    pickPreferredSourceFromDomainMemory,
    recordDomainSourceMemoryOutcome,
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
