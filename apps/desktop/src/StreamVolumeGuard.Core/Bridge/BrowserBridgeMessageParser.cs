using System.Globalization;
using System.Text.RegularExpressions;
using System.Text.Json;
using StreamVolumeGuard.Core.Audio;
using StreamVolumeGuard.Core.Browser;

namespace StreamVolumeGuard.Core.Bridge;

public static class BrowserBridgeMessageParser
{
    private static readonly Regex UrlLikePattern = new(@"\bhttps?://[^\s]+", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static BrowserSubSourceSnapshot ParseBrowserSource(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            throw new InvalidDataException("message body is required");
        }

        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object)
        {
            throw new InvalidDataException("message object is required");
        }

        var type = RequiredString(root, "type");
        if (!string.Equals(type, "browser_source_observed", StringComparison.Ordinal))
        {
            throw new InvalidDataException("type must be browser_source_observed");
        }

        var sourceId = RequiredString(root, "sourceId");
        var origin = ParseEnum<AudioSourceOrigin>(RequiredString(root, "origin"), "origin");
        var controlSurface = ParseEnum<AudioControlSurface>(RequiredString(root, "controlSurface"), "controlSurface");
        var isControllable = RequiredBoolean(root, "isControllable");
        var expectedControllable = controlSurface is AudioControlSurface.BrowserGain or AudioControlSurface.WindowsSessionVolume;
        if (isControllable != expectedControllable)
        {
            throw new InvalidDataException("isControllable does not match controlSurface");
        }

        return new BrowserSubSourceSnapshot(
            SourceId: sourceId,
            BrowserProcess: OptionalString(root, "browserProcess", "Unknown browser"),
            TabId: OptionalInt(root, "tabId"),
            SiteName: OptionalString(root, "siteName", "Unknown site"),
            Title: OptionalString(root, "title", string.Empty),
            CurrentLevel: ClampScalar(OptionalFloat(root, "currentLevel", 0.0f)),
            AppliedGain: ClampScalar(OptionalFloat(root, "appliedGain", 0.0f)),
            Status: ParseStatus(OptionalString(root, "status", AudioSessionStatus.Unknown.ToString())),
            Origin: origin,
            ControlSurface: controlSurface,
            LastSeenUtc: OptionalTimestamp(root, "lastSeen", DateTimeOffset.UtcNow),
            TargetRmsDb: OptionalTargetDecibels(root, "targetRmsDb"),
            TargetProfile: OptionalString(root, "targetProfile", string.Empty),
            CalibrationState: OptionalCalibrationState(root, "calibrationState"),
            MeasuredRmsDb: OptionalCalibrationDecibels(root, "measuredRmsDb"),
            AppliedGainDb: OptionalGainDecibels(root, "appliedGainDb"),
            CalibrationReason: OptionalString(root, "calibrationReason", string.Empty));
    }

    public static ExtensionLogEntry ParseExtensionLog(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            throw new InvalidDataException("message body is required");
        }

        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object)
        {
            throw new InvalidDataException("message object is required");
        }

        var type = RequiredString(root, "type");
        if (!string.Equals(type, "extension_log", StringComparison.Ordinal))
        {
            throw new InvalidDataException("type must be extension_log");
        }

        var origin = ParseEnum<AudioSourceOrigin>(RequiredString(root, "origin"), "origin");
        if (origin is not AudioSourceOrigin.BrowserExtension)
        {
            throw new InvalidDataException("invalid origin: extension logs must come from BrowserExtension");
        }

        return new ExtensionLogEntry(
            EventName: NormalizeEventName(RequiredString(root, "eventName")),
            Message: RedactUrls(OptionalString(root, "message", "Extension event")),
            Severity: NormalizeSeverity(OptionalString(root, "severity", "info")),
            BrowserProcess: OptionalString(root, "browserProcess", "Unknown browser"),
            SourceId: OptionalString(root, "sourceId", string.Empty),
            TabId: OptionalInt(root, "tabId"),
            SiteName: RedactUrls(OptionalString(root, "siteName", "Unknown site")),
            Status: ParseStatus(OptionalString(root, "status", AudioSessionStatus.Unknown.ToString())),
            ControlSurface: ParseOptionalControlSurface(OptionalString(root, "controlSurface", AudioControlSurface.Unknown.ToString())),
            CaptureSignalState: OptionalString(root, "captureSignalState", string.Empty),
            CalibrationState: OptionalCalibrationState(root, "calibrationState"),
            MeasuredRmsDb: OptionalCalibrationDecibels(root, "measuredRmsDb"),
            AppliedGainDb: OptionalGainDecibels(root, "appliedGainDb"),
            CalibrationReason: OptionalString(root, "calibrationReason", string.Empty),
            TargetRmsDb: OptionalTargetDecibels(root, "targetRmsDb"),
            TargetProfile: OptionalString(root, "targetProfile", string.Empty),
            LastSeenUtc: OptionalTimestamp(root, "lastSeen", DateTimeOffset.UtcNow),
            Origin: origin);
    }

    private static string RequiredString(JsonElement root, string propertyName)
    {
        var value = OptionalString(root, propertyName, string.Empty);
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidDataException($"{propertyName} is required");
        }

        return value;
    }

    private static string OptionalString(JsonElement root, string propertyName, string fallback)
    {
        if (!root.TryGetProperty(propertyName, out var property) || property.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return fallback;
        }

        var value = property.ValueKind == JsonValueKind.String
            ? property.GetString() ?? string.Empty
            : property.ToString();

        value = value.Replace('\r', ' ').Replace('\n', ' ').Replace('\t', ' ').Trim();
        while (value.Contains("  ", StringComparison.Ordinal))
        {
            value = value.Replace("  ", " ", StringComparison.Ordinal);
        }

        return string.IsNullOrWhiteSpace(value) ? fallback : value;
    }

    private static bool RequiredBoolean(JsonElement root, string propertyName)
    {
        if (!root.TryGetProperty(propertyName, out var property) || property.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            throw new InvalidDataException($"{propertyName} is required");
        }

        if (property.ValueKind is JsonValueKind.True or JsonValueKind.False)
        {
            return property.GetBoolean();
        }

        throw new InvalidDataException($"{propertyName} must be boolean");
    }

    private static int? OptionalInt(JsonElement root, string propertyName)
    {
        if (!root.TryGetProperty(propertyName, out var property) || property.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return null;
        }

        if (property.ValueKind == JsonValueKind.Number && property.TryGetInt32(out var number))
        {
            return number;
        }

        var value = OptionalString(root, propertyName, string.Empty);
        return int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed) ? parsed : null;
    }

    private static float OptionalFloat(JsonElement root, string propertyName, float fallback)
    {
        if (!root.TryGetProperty(propertyName, out var property) || property.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return fallback;
        }

        if (property.ValueKind == JsonValueKind.Number && property.TryGetSingle(out var number))
        {
            return number;
        }

        var value = OptionalString(root, propertyName, string.Empty);
        return float.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed) ? parsed : fallback;
    }

    private static float? OptionalTargetDecibels(JsonElement root, string propertyName)
    {
        if (!root.TryGetProperty(propertyName, out var property) || property.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return null;
        }

        float? value = null;
        if (property.ValueKind == JsonValueKind.Number && property.TryGetSingle(out var number))
        {
            value = number;
        }
        else
        {
            var text = OptionalString(root, propertyName, string.Empty);
            if (float.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed))
            {
                value = parsed;
            }
        }

        if (!value.HasValue || float.IsNaN(value.Value) || float.IsInfinity(value.Value))
        {
            return null;
        }

        if (value.Value < -60.0f) return -60.0f;
        if (value.Value > 0.0f) return 0.0f;
        return value.Value;
    }

    private static float? OptionalCalibrationDecibels(JsonElement root, string propertyName)
    {
        var value = OptionalFloatValue(root, propertyName);
        if (!value.HasValue) return null;
        if (value.Value < -120.0f) return -120.0f;
        if (value.Value > 24.0f) return 24.0f;
        return value.Value;
    }

    private static float? OptionalGainDecibels(JsonElement root, string propertyName)
    {
        var value = OptionalFloatValue(root, propertyName);
        if (!value.HasValue) return null;
        if (value.Value < -48.0f) return -48.0f;
        if (value.Value > 48.0f) return 48.0f;
        return value.Value;
    }

    private static float? OptionalFloatValue(JsonElement root, string propertyName)
    {
        if (!root.TryGetProperty(propertyName, out var property) || property.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return null;
        }

        float? value = null;
        if (property.ValueKind == JsonValueKind.Number && property.TryGetSingle(out var number))
        {
            value = number;
        }
        else
        {
            var text = OptionalString(root, propertyName, string.Empty);
            if (float.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed))
            {
                value = parsed;
            }
        }

        return !value.HasValue || float.IsNaN(value.Value) || float.IsInfinity(value.Value)
            ? null
            : value.Value;
    }

    private static string OptionalCalibrationState(JsonElement root, string propertyName)
    {
        var value = OptionalString(root, propertyName, string.Empty);
        return value is "measuring" or "applied" or "locked" or "skipped" or "rearmed"
            ? value
            : string.Empty;
    }

    private static DateTimeOffset OptionalTimestamp(JsonElement root, string propertyName, DateTimeOffset fallback)
    {
        var value = OptionalString(root, propertyName, string.Empty);
        return DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var parsed)
            ? parsed.ToUniversalTime()
            : fallback;
    }

    private static AudioSessionStatus ParseStatus(string value)
    {
        return Enum.TryParse<AudioSessionStatus>(value, ignoreCase: false, out var status)
            ? status
            : AudioSessionStatus.Unknown;
    }

    private static AudioControlSurface ParseOptionalControlSurface(string value)
    {
        return Enum.TryParse<AudioControlSurface>(value, ignoreCase: false, out var controlSurface)
            ? controlSurface
            : AudioControlSurface.Unknown;
    }

    private static string NormalizeEventName(string value)
    {
        var normalized = Regex
            .Replace(value, @"[^a-zA-Z0-9._:-]+", ".")
            .Replace("..", ".", StringComparison.Ordinal)
            .Trim('.');

        while (normalized.Contains("..", StringComparison.Ordinal))
        {
            normalized = normalized.Replace("..", ".", StringComparison.Ordinal);
        }

        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new InvalidDataException("eventName is required");
        }

        return normalized.Length > 80 ? normalized[..80] : normalized;
    }

    private static string NormalizeSeverity(string value)
    {
        var normalized = value.ToLowerInvariant();
        return normalized is "debug" or "info" or "warn" or "error" ? normalized : "info";
    }

    private static string RedactUrls(string value)
    {
        return UrlLikePattern.Replace(value, "[redacted-url]");
    }

    private static TEnum ParseEnum<TEnum>(string value, string propertyName) where TEnum : struct, Enum
    {
        if (!Enum.TryParse<TEnum>(value, ignoreCase: false, out var parsed))
        {
            throw new InvalidDataException($"invalid {propertyName}: {value}");
        }

        return parsed;
    }

    private static float ClampScalar(float value)
    {
        if (float.IsNaN(value) || float.IsInfinity(value)) return 0.0f;
        if (value < 0.0f) return 0.0f;
        if (value > 1.0f) return 1.0f;
        return value;
    }
}
