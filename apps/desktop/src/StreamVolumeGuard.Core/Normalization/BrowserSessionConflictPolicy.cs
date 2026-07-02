using StreamVolumeGuard.Core.Audio;
using StreamVolumeGuard.Core.Browser;

namespace StreamVolumeGuard.Core.Normalization;

public sealed class BrowserSessionConflictPolicy
{
    public const string ConflictReason = "browser-gain-conflict";

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
    private readonly TimeSpan browserGainHistoryWindow;

    public BrowserSessionConflictPolicy(TimeSpan freshnessWindow, TimeSpan? browserGainHistoryWindow = null)
    {
        this.freshnessWindow = freshnessWindow <= TimeSpan.Zero ? TimeSpan.FromSeconds(15) : freshnessWindow;
        this.browserGainHistoryWindow = browserGainHistoryWindow.GetValueOrDefault(TimeSpan.FromSeconds(5));
        if (this.browserGainHistoryWindow <= TimeSpan.Zero)
        {
            this.browserGainHistoryWindow = TimeSpan.FromSeconds(5);
        }
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

        if (!HasFreshBrowserGainConflict(session, browserSources, now))
        {
            return decision;
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
            var isCurrentBrowserGain = source.ControlSurface is AudioControlSurface.BrowserGain;
            var hasRecentBrowserGainHistory = source.LastBrowserGainSeenUtc.HasValue &&
                now - source.LastBrowserGainSeenUtc.Value <= browserGainHistoryWindow;
            if (!isCurrentBrowserGain && !hasRecentBrowserGainHistory)
            {
                continue;
            }

            if (isCurrentBrowserGain && now - source.LastSeenUtc > freshnessWindow)
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
