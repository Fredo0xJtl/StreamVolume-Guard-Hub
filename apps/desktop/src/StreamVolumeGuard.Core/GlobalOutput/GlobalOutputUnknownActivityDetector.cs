using StreamVolumeGuard.Core.Audio;
using StreamVolumeGuard.Core.Browser;

namespace StreamVolumeGuard.Core.GlobalOutput;

public sealed record GlobalOutputUnknownActivityDecision(
    bool IsUnknownActive,
    string Reason,
    int KnownSources,
    int KnownWindowsSources,
    int KnownBrowserSources,
    int ActiveKnownSources,
    float HighestKnownLevel);

public static class GlobalOutputUnknownActivityDetector
{
    private const float KnownSourceActivityThreshold = 0.02f;

    public static GlobalOutputUnknownActivityDecision Evaluate(
        GlobalOutputLevelSnapshot globalOutput,
        IEnumerable<AudioSessionSnapshot> windowsSessions,
        IEnumerable<BrowserSubSourceSnapshot> browserSources)
    {
        var windows = windowsSessions
            .Where(session => !session.IsExcluded)
            .ToList();
        var browsers = browserSources.ToList();

        var activeWindows = windows.Count(IsActiveWindowsSession);
        var activeBrowsers = browsers.Count(IsActiveBrowserSource);
        var highestKnownLevel = Math.Max(
            windows.Count == 0 ? 0.0f : windows.Max(session => session.PeakLevel),
            browsers.Count == 0 ? 0.0f : browsers.Max(source => source.CurrentLevel));
        var activeKnownSources = activeWindows + activeBrowsers;
        var knownSources = windows.Count + browsers.Count;

        if (!IsGlobalOutputActive(globalOutput))
        {
            return new GlobalOutputUnknownActivityDecision(
                IsUnknownActive: false,
                Reason: "global-output-inactive",
                KnownSources: knownSources,
                KnownWindowsSources: windows.Count,
                KnownBrowserSources: browsers.Count,
                ActiveKnownSources: activeKnownSources,
                HighestKnownLevel: highestKnownLevel);
        }

        if (activeKnownSources > 0)
        {
            return new GlobalOutputUnknownActivityDecision(
                IsUnknownActive: false,
                Reason: "known-source-active",
                KnownSources: knownSources,
                KnownWindowsSources: windows.Count,
                KnownBrowserSources: browsers.Count,
                ActiveKnownSources: activeKnownSources,
                HighestKnownLevel: highestKnownLevel);
        }

        return new GlobalOutputUnknownActivityDecision(
            IsUnknownActive: true,
            Reason: "global-output-without-known-active-source",
            KnownSources: knownSources,
            KnownWindowsSources: windows.Count,
            KnownBrowserSources: browsers.Count,
            ActiveKnownSources: activeKnownSources,
            HighestKnownLevel: highestKnownLevel);
    }

    private static bool IsGlobalOutputActive(GlobalOutputLevelSnapshot snapshot)
    {
        return snapshot.IsAvailable &&
            snapshot.State is GlobalOutputState.Safe or GlobalOutputState.Risky;
    }

    private static bool IsActiveWindowsSession(AudioSessionSnapshot session)
    {
        return !session.IsMuted && session.PeakLevel >= KnownSourceActivityThreshold;
    }

    private static bool IsActiveBrowserSource(BrowserSubSourceSnapshot source)
    {
        return source.Status is not AudioSessionStatus.Muted &&
            source.CurrentLevel >= KnownSourceActivityThreshold;
    }
}
