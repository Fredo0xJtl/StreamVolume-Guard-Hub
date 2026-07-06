"use strict";

const SOURCE_ORIGINS = Object.freeze({
  WINDOWS_SESSION: "WindowsSession",
  BROWSER_EXTENSION: "BrowserExtension"
});

const CONTROL_SURFACES = Object.freeze({
  WINDOWS_SESSION_VOLUME: "WindowsSessionVolume",
  BROWSER_GAIN: "BrowserGain",
  OBSERVE_ONLY: "ObserveOnly",
  UNKNOWN: "Unknown"
});

const STATUSES = Object.freeze(["Safe", "Risky", "Low", "Muted", "Excluded", "Unknown"]);
const BROWSER_STATES = Object.freeze([
  "media-html-starting",
  "media-html-signal",
  "media-html-no-signal",
  "tab-capture-starting",
  "tab-capture-signal",
  "tab-capture-no-signal",
  "observe-only",
  "desktop-fallback-available"
]);
const TARGET_PROFILES = Object.freeze(["Calme", "Standard", "Fort", "Personnalise"]);
const CALIBRATION_STATES = Object.freeze(["", "measuring", "applied", "locked", "skipped", "rearmed"]);
const LOG_SEVERITIES = Object.freeze(["debug", "info", "warn", "error"]);
const TARGET_MIN_DB = -30;
const TARGET_MAX_DB = -15;
const URL_LIKE_PATTERN = /\bhttps?:\/\/[^\s]+/gi;

function normalizeBrowserSourceMessage(message) {
  if (!message || typeof message !== "object") {
    throw new Error("message object is required");
  }

  if (message.type !== "browser_source_observed") {
    throw new Error("type must be browser_source_observed");
  }

  const sourceId = normalizeRequiredString(message.sourceId, "sourceId");
  const origin = normalizeEnum(message.origin, Object.values(SOURCE_ORIGINS), "origin");
  const controlSurface = normalizeEnum(message.controlSurface, Object.values(CONTROL_SURFACES), "controlSurface");
  const status = normalizeEnum(message.status || "Unknown", STATUSES, "status");
  const isControllable = controlSurface === CONTROL_SURFACES.BROWSER_GAIN || controlSurface === CONTROL_SURFACES.WINDOWS_SESSION_VOLUME;

  return {
    type: "browser_source_observed",
    browserProcess: normalizeOptionalString(message.browserProcess) || "Unknown browser",
    sourceId,
    tabId: normalizeOptionalNumber(message.tabId),
    siteName: normalizeOptionalString(message.siteName) || "Unknown site",
    title: normalizeOptionalString(message.title) || "",
    currentLevel: clampScalar(message.currentLevel),
    appliedGain: clampScalar(message.appliedGain),
    calibrationState: normalizeCalibrationState(message.calibrationState),
    measuredRmsDb: normalizeOptionalAudioDb(message.measuredRmsDb),
    appliedGainDb: normalizeOptionalGainDb(message.appliedGainDb),
    calibrationReason: normalizeOptionalString(message.calibrationReason),
    captureSignalState: normalizeOptionalString(message.captureSignalState),
    browserState: normalizeBrowserState(message.browserState),
    reason: redactUrlLikeText(message.reason),
    recommendedAction: redactUrlLikeText(message.recommendedAction),
    targetRmsDb: normalizeOptionalTargetDb(message.targetRmsDb),
    targetProfile: normalizeOptionalString(message.targetProfile),
    status,
    lastSeen: normalizeTimestamp(message.lastSeen),
    origin,
    controlSurface,
    isControllable,
    canControl: isControllable
  };
}

function normalizeGlobalTargetState(message) {
  if (!message || typeof message !== "object") {
    throw new Error("message object is required");
  }

  if (message.type !== "global_target_state") {
    throw new Error("type must be global_target_state");
  }

  const source = normalizeOptionalString(message.source) || "Desktop";
  const rawProfile = normalizeOptionalString(message.targetProfile) || "Standard";
  const targetProfile = TARGET_PROFILES.includes(rawProfile) ? rawProfile : "Personnalise";
  const targetDecibels = clampTargetDb(message.targetRmsDb ?? message.targetDecibels);

  return {
    type: "global_target_state",
    source,
    targetProfile,
    targetDecibels,
    targetRmsDb: targetDecibels,
    updatedAt: normalizeTimestamp(message.updatedAt)
  };
}

function normalizeExtensionLogMessage(message) {
  if (!message || typeof message !== "object") {
    throw new Error("message object is required");
  }

  if (message.type !== "extension_log") {
    throw new Error("type must be extension_log");
  }

  const origin = normalizeEnum(message.origin, [SOURCE_ORIGINS.BROWSER_EXTENSION], "origin");
  const controlSurface = normalizeOptionalString(message.controlSurface)
    ? normalizeEnum(message.controlSurface, Object.values(CONTROL_SURFACES), "controlSurface")
    : CONTROL_SURFACES.UNKNOWN;

  return {
    type: "extension_log",
    origin,
    eventName: normalizeEventName(message.eventName),
    message: redactUrlLikeText(message.message || message.eventName || "Extension event"),
    severity: normalizeSeverity(message.severity),
    browserProcess: normalizeOptionalString(message.browserProcess) || "Unknown browser",
    sourceId: normalizeOptionalString(message.sourceId),
    tabId: normalizeOptionalNumber(message.tabId),
    siteName: redactUrlLikeText(message.siteName || "Unknown site"),
    status: normalizeEnum(message.status || "Unknown", STATUSES, "status"),
    controlSurface,
    captureSignalState: normalizeOptionalString(message.captureSignalState),
    calibrationState: normalizeCalibrationState(message.calibrationState),
    measuredRmsDb: normalizeOptionalAudioDb(message.measuredRmsDb),
    appliedGainDb: normalizeOptionalGainDb(message.appliedGainDb),
    calibrationReason: normalizeOptionalString(message.calibrationReason),
    captureSignalState: normalizeOptionalString(message.captureSignalState),
    targetRmsDb: normalizeOptionalTargetDb(message.targetRmsDb),
    targetProfile: normalizeOptionalString(message.targetProfile),
    lastSeen: normalizeTimestamp(message.lastSeen)
  };
}

function normalizeRequiredString(value, fieldName) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }
  return normalized;
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/[\r\n\t]+/g, " ").trim();
}

function normalizeEventName(value) {
  const normalized = normalizeRequiredString(value, "eventName")
    .replace(/[^a-zA-Z0-9._:-]+/g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+|\.+$/g, "");
  if (!normalized) {
    throw new Error("eventName is required");
  }
  return normalized.length > 80 ? normalized.slice(0, 80) : normalized;
}

function normalizeSeverity(value) {
  const normalized = normalizeOptionalString(value).toLowerCase();
  return LOG_SEVERITIES.includes(normalized) ? normalized : "info";
}

function normalizeBrowserState(value) {
  const normalized = normalizeOptionalString(value);
  return BROWSER_STATES.includes(normalized) ? normalized : "";
}

function normalizeCalibrationState(value) {
  const normalized = normalizeOptionalString(value);
  return CALIBRATION_STATES.includes(normalized) ? normalized : "";
}

function redactUrlLikeText(value) {
  return normalizeOptionalString(value).replace(URL_LIKE_PATTERN, "[redacted-url]");
}

function normalizeOptionalNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeEnum(value, allowed, fieldName) {
  const normalized = normalizeOptionalString(value);
  if (!allowed.includes(normalized)) {
    throw new Error(`invalid ${fieldName}: ${normalized}`);
  }
  return normalized;
}

function normalizeTimestamp(value) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return new Date().toISOString();
  }

  const timestamp = new Date(normalized);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error("invalid lastSeen timestamp");
  }
  return timestamp.toISOString();
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

function normalizeOptionalTargetDb(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (number < -60) return -60;
  if (number > 0) return 0;
  return number;
}

function normalizeOptionalAudioDb(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (number < -120) return -120;
  if (number > 24) return 24;
  return number;
}

function normalizeOptionalGainDb(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (number < -48) return -48;
  if (number > 48) return 48;
  return number;
}

module.exports = {
  SOURCE_ORIGINS,
  CONTROL_SURFACES,
  STATUSES,
  BROWSER_STATES,
  CALIBRATION_STATES,
  LOG_SEVERITIES,
  TARGET_PROFILES,
  TARGET_MIN_DB,
  TARGET_MAX_DB,
  normalizeBrowserSourceMessage,
  normalizeGlobalTargetState,
  normalizeExtensionLogMessage
};
