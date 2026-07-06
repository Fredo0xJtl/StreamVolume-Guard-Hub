using StreamVolumeGuard.Core.Audio;
using StreamVolumeGuard.Core.Browser;

namespace StreamVolumeGuard.Core.Coverage;

public enum CoverageBucket
{
    DirectControl,
    WindowsFallback,
    NeedsUserAction,
    Limited,
    Unknown
}

public sealed record CoverageSourceState(
    string SourceId,
    string DisplayName,
    AudioSourceOrigin Origin,
    AudioControlSurface ControlSurface,
    AudioSessionStatus Status,
    bool IsControllable,
    CoverageBucket Bucket,
    bool HasWindowsFallback,
    string RecommendedAction,
    string SecurableGroupKey = "");

public sealed record CoverageSummary(IReadOnlyList<CoverageSourceState> Sources)
{
    public int TotalCount => Sources.Count;
    public int DirectCount => Count(CoverageBucket.DirectControl);
    public int FallbackCount => Count(CoverageBucket.WindowsFallback);
    public int NeedsActionCount => Count(CoverageBucket.NeedsUserAction);
    public int LimitedCount => Count(CoverageBucket.Limited);
    public int UnknownCount => Count(CoverageBucket.Unknown);
    public int SecurableCount => Sources
        .Where(IsSecurable)
        .Select(source => string.IsNullOrWhiteSpace(source.SecurableGroupKey) ? source.SourceId : source.SecurableGroupKey)
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .Count();

    private int Count(CoverageBucket bucket)
    {
        return Sources.Count(source => source.Bucket == bucket);
    }

    private static bool IsSecurable(CoverageSourceState source)
    {
        return source.Bucket is CoverageBucket.DirectControl or CoverageBucket.WindowsFallback or CoverageBucket.NeedsUserAction;
    }
}

public static class CoverageClassifier
{
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

    public static CoverageSummary BuildSummary(
        IEnumerable<AudioSessionSnapshot> windowsSessions,
        IEnumerable<BrowserSubSourceSnapshot> browserSources)
    {
        var sessionList = windowsSessions.ToList();
        var browserList = browserSources.ToList();
        var states = new List<CoverageSourceState>(sessionList.Count + browserList.Count);

        foreach (var session in sessionList)
        {
            var isBrowserGainParent = browserList.Any(source =>
                IsDirectBrowserGainSource(source) && IsMatchingBrowserProcess(source, session));
            var isBrowserFallbackParent = browserList.Any(source =>
                (source.ControlSurface is not AudioControlSurface.BrowserGain || !source.IsControllable) &&
                IsMatchingBrowserProcess(source, session));
            states.Add(ClassifyWindowsSession(session, isBrowserGainParent, isBrowserFallbackParent));
        }

        foreach (var source in browserList)
        {
            var hasWindowsFallback = sessionList.Any(session =>
                IsWindowsFallbackCandidate(session) &&
                (IsSameBrowserProcess(source.BrowserProcess, session.ProcessName) ||
                 IsSameBrowserProcess(source.BrowserProcess, session.DisplayName)));
            states.Add(ClassifyBrowserSource(source, hasWindowsFallback));
        }

        return new CoverageSummary(states);
    }

    private static CoverageSourceState ClassifyWindowsSession(AudioSessionSnapshot session, bool isBrowserGainParent, bool isBrowserFallbackParent)
    {
        var controlSurface = session.IsControllable
            ? AudioControlSurface.WindowsSessionVolume
            : AudioControlSurface.ObserveOnly;

        if (session.IsExcluded || session.IsMuted || !session.IsControllable)
        {
            return new CoverageSourceState(
                session.SessionId,
                session.DisplayName,
                AudioSourceOrigin.WindowsSession,
                controlSurface,
                StatusFromSession(session),
                session.IsControllable,
                CoverageBucket.Limited,
                false,
                session.IsExcluded ? "Source exclue" : "Controle Windows indisponible");
        }

        if (isBrowserGainParent)
        {
            return new CoverageSourceState(
                session.SessionId,
                session.DisplayName,
                AudioSourceOrigin.WindowsSession,
                controlSurface,
                StatusFromSession(session),
                true,
                CoverageBucket.WindowsFallback,
                true,
                "Fallback Windows global disponible",
                $"windows:{session.SessionId}");
        }

        return new CoverageSourceState(
            session.SessionId,
            session.DisplayName,
            AudioSourceOrigin.WindowsSession,
            controlSurface,
            StatusFromSession(session),
            true,
            CoverageBucket.DirectControl,
            false,
            "OK direct",
            isBrowserFallbackParent ? BrowserFallbackGroupKey(session.ProcessName, session.DisplayName) : $"windows:{session.SessionId}");
    }

    private static CoverageSourceState ClassifyBrowserSource(BrowserSubSourceSnapshot source, bool hasWindowsFallback)
    {
        var diagnostic = $"{source.CaptureSignalState} {source.CalibrationState} {source.CalibrationReason} {source.BrowserState} {source.Reason}";
        if (source.ControlSurface is AudioControlSurface.BrowserGain && source.IsControllable)
        {
            return new CoverageSourceState(
                source.SourceId,
                DisplayName(source),
                source.Origin,
                source.ControlSurface,
                source.Status,
                true,
                CoverageBucket.DirectControl,
                hasWindowsFallback,
                ActionOrFallback(source, string.Equals(source.CalibrationState, "locked", StringComparison.OrdinalIgnoreCase) ? "OK direct" : "Attendre la mesure 18-20 s"),
                $"browser:{source.SourceId}");
        }

        if (ContainsDiagnostic(diagnostic, "needs-user-action"))
        {
            return new CoverageSourceState(
                source.SourceId,
                DisplayName(source),
                source.Origin,
                source.ControlSurface,
                source.Status,
                false,
                CoverageBucket.NeedsUserAction,
                hasWindowsFallback,
                ActionOrFallback(source, "Clique Proteger l'onglet actif"),
                $"browser:{source.SourceId}");
        }

        if (hasWindowsFallback)
        {
            return new CoverageSourceState(
                source.SourceId,
                DisplayName(source),
                source.Origin,
                source.ControlSurface,
                source.Status,
                false,
                CoverageBucket.WindowsFallback,
                true,
                ActionOrFallback(source, "Fallback Windows utilise"),
                BrowserFallbackGroupKey(source.BrowserProcess, null));
        }

        if (ContainsDiagnostic(diagnostic, "restricted") ||
            ContainsDiagnostic(diagnostic, "unsupported") ||
            ContainsDiagnostic(diagnostic, "no-signal") ||
            ContainsDiagnostic(diagnostic, "insufficient-signal") ||
            string.Equals(source.CalibrationState, "skipped", StringComparison.OrdinalIgnoreCase))
        {
            return new CoverageSourceState(
                source.SourceId,
                DisplayName(source),
                source.Origin,
                source.ControlSurface,
                source.Status,
                false,
                CoverageBucket.Limited,
                false,
                ActionOrFallback(source, LimitedBrowserAction(diagnostic)));
        }

        if (source.ControlSurface is AudioControlSurface.Unknown || source.Status is AudioSessionStatus.Unknown)
        {
            return new CoverageSourceState(
                source.SourceId,
                DisplayName(source),
                source.Origin,
                source.ControlSurface,
                source.Status,
                false,
                CoverageBucket.Unknown,
                false,
                ActionOrFallback(source, "Verifier logs puis retester"));
        }

        return new CoverageSourceState(
            source.SourceId,
            DisplayName(source),
            source.Origin,
            source.ControlSurface,
            source.Status,
            false,
            CoverageBucket.Limited,
            false,
            ActionOrFallback(source, LimitedBrowserAction(diagnostic)));
    }

    private static AudioSessionStatus StatusFromSession(AudioSessionSnapshot session)
    {
        if (session.IsExcluded) return AudioSessionStatus.Excluded;
        if (session.IsMuted) return AudioSessionStatus.Muted;
        if (!session.IsControllable) return AudioSessionStatus.Uncontrollable;
        return AudioSessionStatus.Safe;
    }

    private static bool IsWindowsFallbackCandidate(AudioSessionSnapshot session)
    {
        return session.IsControllable && !session.IsExcluded && !session.IsMuted && !session.IsSystemSession;
    }

    private static bool IsDirectBrowserGainSource(BrowserSubSourceSnapshot source)
    {
        return source.ControlSurface is AudioControlSurface.BrowserGain && source.IsControllable;
    }

    private static bool IsMatchingBrowserProcess(BrowserSubSourceSnapshot source, AudioSessionSnapshot session)
    {
        return IsSameBrowserProcess(source.BrowserProcess, session.ProcessName) ||
               IsSameBrowserProcess(source.BrowserProcess, session.DisplayName);
    }

    private static string DisplayName(BrowserSubSourceSnapshot source)
    {
        if (!string.IsNullOrWhiteSpace(source.SiteName))
        {
            return source.SiteName;
        }

        if (!string.IsNullOrWhiteSpace(source.Title))
        {
            return source.Title;
        }

        return source.BrowserProcess;
    }

    private static string BrowserFallbackGroupKey(string? primaryProcess, string? secondaryProcess)
    {
        var primary = NormalizeProcessName(primaryProcess);
        if (!string.IsNullOrWhiteSpace(primary))
        {
            return $"browser-fallback:{primary}";
        }

        var secondary = NormalizeProcessName(secondaryProcess);
        return string.IsNullOrWhiteSpace(secondary)
            ? "browser-fallback:unknown"
            : $"browser-fallback:{secondary}";
    }

    private static string LimitedBrowserAction(string diagnostic)
    {
        if (ContainsDiagnostic(diagnostic, "restricted") || ContainsDiagnostic(diagnostic, "unsupported"))
        {
            return "Utilise OBS / capture separee";
        }

        if (ContainsDiagnostic(diagnostic, "no-signal") || ContainsDiagnostic(diagnostic, "insufficient-signal"))
        {
            return "Recharge l'onglet, reprotege, sinon OBS";
        }

        return "Utilise OBS / capture separee";
    }

    private static string ActionOrFallback(BrowserSubSourceSnapshot source, string fallback)
    {
        return string.IsNullOrWhiteSpace(source.RecommendedAction)
            ? fallback
            : source.RecommendedAction;
    }

    private static bool IsSameBrowserProcess(string? sourceProcess, string? sessionProcess)
    {
        var source = NormalizeProcessName(sourceProcess);
        var session = NormalizeProcessName(sessionProcess);
        if (string.IsNullOrWhiteSpace(source) || string.IsNullOrWhiteSpace(session))
        {
            return false;
        }

        if (string.Equals(source, session, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return ChromiumBrowserProcessNames.Contains(source) && ChromiumBrowserProcessNames.Contains(session);
    }

    private static string NormalizeProcessName(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var normalized = value.Trim();
        if (normalized.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
        {
            normalized = normalized[..^4];
        }

        return normalized.ToLowerInvariant();
    }

    private static bool ContainsDiagnostic(string value, string expected)
    {
        return value.Contains(expected, StringComparison.OrdinalIgnoreCase);
    }
}
