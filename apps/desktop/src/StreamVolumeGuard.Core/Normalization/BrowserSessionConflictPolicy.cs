using StreamVolumeGuard.Core.Audio;
using StreamVolumeGuard.Core.Browser;
using StreamVolumeGuard.Core.Control;

namespace StreamVolumeGuard.Core.Normalization;

public sealed class BrowserSessionConflictPolicy
{
    public const string ConflictReason = "browser-gain-conflict";
    public const string FastTargetFallbackReason = "windows-fast-target";

    private static readonly HashSet<string> ChromiumBrowserProcessNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "brave",
        "brave-browser",
        "chrome",
        "chromium",
        "edge",
        "msedge",
        "opera",
        "opr",
        "vivaldi"
    };

    private readonly TimeSpan freshnessWindow;
    private readonly BrowserSessionControlMode controlMode;

    public BrowserSessionConflictPolicy(
        TimeSpan freshnessWindow,
        TimeSpan? browserGainHistoryWindow = null,
        BrowserSessionControlMode controlMode = BrowserSessionControlMode.BrowserGainPriority)
    {
        this.freshnessWindow = freshnessWindow <= TimeSpan.Zero ? TimeSpan.FromSeconds(15) : freshnessWindow;
        this.controlMode = controlMode;
    }

    public VolumeDecision Apply(
        AudioSessionSnapshot session,
        VolumeDecision decision,
        IEnumerable<BrowserSubSourceSnapshot> browserSources,
        DateTimeOffset now)
    {
        if (!decision.ShouldApplyVolume)
        {
            return decision;
        }

        if (controlMode is BrowserSessionControlMode.GlobalWindowsSession)
        {
            return decision;
        }

        if (!HasFreshBrowserGainConflict(session, browserSources, now))
        {
            return decision;
        }

        if (IsVoluntaryTargetChange(decision))
        {
            return decision with
            {
                Reason = FastTargetFallbackReason
            };
        }

        return decision with
        {
            ShouldApplyVolume = false,
            TargetVolumeScalar = Clamp(session.VolumeScalar),
            Reason = ConflictReason
        };
    }

    private bool HasFreshBrowserGainConflict(
        AudioSessionSnapshot session,
        IEnumerable<BrowserSubSourceSnapshot> browserSources,
        DateTimeOffset now)
    {
        var sessionProcess = NormalizeProcessName(session.ProcessName);
        var sessionDisplay = NormalizeProcessName(session.DisplayName);
        if (string.IsNullOrWhiteSpace(sessionProcess) && string.IsNullOrWhiteSpace(sessionDisplay))
        {
            return false;
        }

        foreach (var source in browserSources)
        {
            if (!IsBlockingBrowserGainSource(source, now))
            {
                continue;
            }

            var sourceProcess = NormalizeProcessName(source.BrowserProcess);
            if (string.IsNullOrWhiteSpace(sourceProcess))
            {
                continue;
            }

            if (IsSameBrowserProcess(sourceProcess, sessionProcess) ||
                IsSameBrowserProcess(sourceProcess, sessionDisplay))
            {
                return true;
            }
        }

        return false;
    }

    private bool IsBlockingBrowserGainSource(BrowserSubSourceSnapshot source, DateTimeOffset now)
    {
        if (source.ControlSurface is not AudioControlSurface.BrowserGain)
        {
            return false;
        }

        if (now - source.LastSeenUtc > freshnessWindow)
        {
            return false;
        }

        return string.Equals(source.CalibrationState, "locked", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsVoluntaryTargetChange(VolumeDecision decision)
    {
        return string.Equals(decision.Reason, TargetVolumeProfilePolicy.ProfileTargetReason, StringComparison.Ordinal);
    }

    private static string NormalizeProcessName(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return string.Empty;
        var normalized = value.Trim();
        if (normalized.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
        {
            normalized = normalized[..^4];
        }

        return normalized.ToLowerInvariant();
    }

    private static bool IsSameBrowserProcess(string sourceProcess, string sessionProcess)
    {
        if (string.IsNullOrWhiteSpace(sourceProcess) || string.IsNullOrWhiteSpace(sessionProcess))
        {
            return false;
        }

        if (string.Equals(sourceProcess, sessionProcess, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return ChromiumBrowserProcessNames.Contains(sourceProcess) &&
               ChromiumBrowserProcessNames.Contains(sessionProcess);
    }

    private static float Clamp(float value)
    {
        if (float.IsNaN(value) || float.IsInfinity(value)) return 0.0f;
        if (value < 0.0f) return 0.0f;
        if (value > 1.0f) return 1.0f;
        return value;
    }
}

public enum BrowserSessionControlMode
{
    GlobalWindowsSession,
    BrowserGainPriority
}
