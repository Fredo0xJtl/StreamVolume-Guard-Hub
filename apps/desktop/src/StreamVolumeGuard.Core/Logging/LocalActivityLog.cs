using System.Globalization;
using System.Text;

namespace StreamVolumeGuard.Core.Logging;

public sealed class LocalActivityLog
{
    private const int MaxValueLength = 240;
    private readonly Func<DateTimeOffset> nowProvider;
    private readonly object gate = new();
    private int testSessionCounter;

    public LocalActivityLog(
        string logDirectory,
        Func<DateTimeOffset>? nowProvider = null,
        string? runId = null,
        string? testSessionId = null)
    {
        if (string.IsNullOrWhiteSpace(logDirectory))
        {
            throw new ArgumentException("Log directory is required.", nameof(logDirectory));
        }

        LogDirectory = logDirectory;
        this.nowProvider = nowProvider ?? (() => DateTimeOffset.Now);
        RunId = string.IsNullOrWhiteSpace(runId) ? CreateId("run", this.nowProvider()) : runId;
        TestSessionId = string.IsNullOrWhiteSpace(testSessionId) ? CreateTestSessionId(this.nowProvider()) : testSessionId;
    }

    public string LogDirectory { get; }

    public string RunId { get; }

    public string TestSessionId { get; private set; }

    public string CurrentLogFilePath
    {
        get
        {
            var date = nowProvider().ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            return Path.Combine(LogDirectory, $"streamvolume-guard-{date}.log");
        }
    }

    public static LocalActivityLog CreateDefault()
    {
        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (string.IsNullOrWhiteSpace(localAppData))
        {
            localAppData = Path.GetTempPath();
        }

        return new LocalActivityLog(Path.Combine(localAppData, "StreamVolumeGuard", "logs"));
    }

    public string StartNewTestSession()
    {
        lock (gate)
        {
            TestSessionId = CreateTestSessionId(nowProvider());
            return TestSessionId;
        }
    }

    public void Write(string eventName, string message, IReadOnlyDictionary<string, string?>? fields = null)
    {
        var now = nowProvider();
        var builder = new StringBuilder();
        AppendField(builder, "time", now.ToString("yyyy-MM-ddTHH:mm:ss.fffzzz", CultureInfo.InvariantCulture));
        AppendField(builder, "event", eventName);
        AppendField(builder, "message", message);
        AppendField(builder, "runId", RunId);
        AppendField(builder, "testSessionId", TestSessionId);

        if (fields is not null)
        {
            foreach (var item in fields.OrderBy(item => item.Key, StringComparer.OrdinalIgnoreCase))
            {
                AppendField(builder, item.Key, item.Value ?? string.Empty);
            }
        }

        lock (gate)
        {
            Directory.CreateDirectory(LogDirectory);
            File.AppendAllText(CurrentLogFilePath, builder.ToString() + Environment.NewLine, Encoding.UTF8);
        }
    }

    public string ReadRecentText(int maxLines, string? testSessionId = null)
    {
        return string.Join(Environment.NewLine, ReadRecentLines(maxLines, testSessionId));
    }

    public string ReadRecentReport(int maxLines, string? testSessionId = null)
    {
        var lines = ReadRecentLines(maxLines, testSessionId);
        var entries = lines
            .Select(line => (Raw: line, Fields: ParseLogLine(line)))
            .Where(entry => entry.Fields.Count > 0)
            .ToList();

        var builder = new StringBuilder();
        builder.AppendLine("# Rapport StreamVolume Guard Hub");
        builder.AppendLine();

        if (entries.Count == 0)
        {
            builder.AppendLine("Aucun log pour cette session.");
            return builder.ToString().TrimEnd();
        }

        var sessionEntry = entries.LastOrDefault(entry => EventEquals(entry.Fields, "tester.session.start"));
        if (sessionEntry.Fields is null || sessionEntry.Fields.Count == 0)
        {
            sessionEntry = entries[0];
        }

        var globalStateEntries = entries
            .Select(entry => (IReadOnlyDictionary<string, string>)entry.Fields)
            .Where(IsGlobalStateEvent)
            .ToList();

        var browserDetected = IsBrowserExtensionDetected(entries.Select(entry => entry.Fields));

        builder.AppendLine("## Session");
        builder.AppendLine($"- runId: {PickValue(sessionEntry.Fields, "runId")}");
        builder.AppendLine($"- testSessionId: {PickValue(sessionEntry.Fields, "testSessionId")}");
        builder.AppendLine($"- Auto actif: {FormatBool(PickLatestValue(entries.Select(entry => entry.Fields), "autoEnabled"))}");
        builder.AppendLine($"- Profil: {PickLatestValue(globalStateEntries, "targetProfile")}");
        builder.AppendLine($"- Extension navigateur: {(browserDetected ? "detectee" : "non detectee")}");
        builder.AppendLine($"- Sources navigateur visibles: {PickLatestValue(globalStateEntries, "visibleBrowserSources")}");
        builder.AppendLine($"- Sessions Windows visibles: {PickLatestValue(globalStateEntries, "visibleWindowsSessions")}");
        builder.AppendLine();

        AppendSources(builder, entries.Select(entry => entry.Fields));
        builder.AppendLine();

        AppendCoverage(builder, entries.Select(entry => entry.Fields));
        builder.AppendLine();

        AppendGlobalOutput(builder, entries.Select(entry => entry.Fields));
        builder.AppendLine();

        AppendCorrections(builder, entries);
        builder.AppendLine();

        AppendAlerts(builder, entries.Select(entry => entry.Fields), browserDetected);
        builder.AppendLine();

        builder.AppendLine("## Logs bruts");
        builder.AppendLine(string.Join(Environment.NewLine, lines));

        return builder.ToString().TrimEnd();
    }

    private IReadOnlyList<string> ReadRecentLines(int maxLines, string? testSessionId = null)
    {
        if (maxLines <= 0 || !File.Exists(CurrentLogFilePath))
        {
            return Array.Empty<string>();
        }

        var recent = new Queue<string>();
        var expectedTestSession = string.IsNullOrWhiteSpace(testSessionId)
            ? null
            : $"testSessionId={Sanitize(testSessionId)}";

        lock (gate)
        {
            foreach (var line in File.ReadLines(CurrentLogFilePath, Encoding.UTF8))
            {
                if (expectedTestSession is not null && !line.Contains(expectedTestSession, StringComparison.Ordinal))
                {
                    continue;
                }

                recent.Enqueue(line);
                while (recent.Count > maxLines)
                {
                    recent.Dequeue();
                }
            }
        }

        return recent.ToArray();
    }

    private string CreateTestSessionId(DateTimeOffset now)
    {
        testSessionCounter++;
        return $"{CreateId("test", now)}-{testSessionCounter.ToString("D2", CultureInfo.InvariantCulture)}";
    }

    private static string CreateId(string prefix, DateTimeOffset now)
    {
        var timestamp = now.ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture);
        var suffix = Guid.NewGuid().ToString("N", CultureInfo.InvariantCulture)[..8];
        return $"{prefix}-{timestamp}-{suffix}";
    }

    private static void AppendField(StringBuilder builder, string key, string value)
    {
        if (builder.Length > 0)
        {
            builder.Append(" | ");
        }

        builder.Append(Sanitize(key));
        builder.Append('=');
        builder.Append(Sanitize(value));
    }

    private static string Sanitize(string value)
    {
        var builder = new StringBuilder(value.Length);
        foreach (var character in value)
        {
            builder.Append(char.IsControl(character) ? ' ' : character);
        }

        var sanitized = builder
            .ToString()
            .Replace('|', '/')
            .Replace('=', ':')
            .Trim();

        while (sanitized.Contains("  ", StringComparison.Ordinal))
        {
            sanitized = sanitized.Replace("  ", " ", StringComparison.Ordinal);
        }

        if (sanitized.Length > MaxValueLength)
        {
            sanitized = sanitized[..MaxValueLength] + "...";
        }

        return sanitized;
    }

    private static Dictionary<string, string> ParseLogLine(string line)
    {
        var fields = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var segment in line.Split(new[] { " | " }, StringSplitOptions.None))
        {
            var separatorIndex = segment.IndexOf('=');
            if (separatorIndex <= 0)
            {
                continue;
            }

            var key = segment[..separatorIndex].Trim();
            if (key.Length == 0)
            {
                continue;
            }

            fields[key] = segment[(separatorIndex + 1)..].Trim();
        }

        return fields;
    }

    private static void AppendSources(StringBuilder builder, IEnumerable<IReadOnlyDictionary<string, string>> entries)
    {
        var sources = new Dictionary<string, IReadOnlyDictionary<string, string>>(StringComparer.OrdinalIgnoreCase);
        foreach (var fields in entries)
        {
            var display = PickValue(fields, "display", "siteName", "browserProcess", "process", "sourceId");
            if (display == "inconnu")
            {
                continue;
            }

            sources[display] = fields;
        }

        builder.AppendLine("## Sources");
        if (sources.Count == 0)
        {
            builder.AppendLine("- Aucune source detaillee dans cette session.");
            return;
        }

        foreach (var source in sources.OrderBy(source => source.Key, StringComparer.OrdinalIgnoreCase))
        {
            var fields = source.Value;
            var origin = PickValue(fields, "origin");
            var controlSurface = PickValue(fields, "controlSurface");
            var controllable = PickValue(fields, "isControllable", "controllable");
            var status = PickValue(fields, "status");
            var volume = PickValue(fields, "volume", "currentLevel", "appliedGain");
            var target = PickValue(fields, "target", "targetProfile", "targetRmsDb");

            builder.AppendLine($"- {source.Key}: {origin} / {controlSurface} / controllable={controllable} / status={status} / volume={volume} / target={target}");
        }
    }

    private static void AppendCorrections(
        StringBuilder builder,
        IEnumerable<(string Raw, Dictionary<string, string> Fields)> entries)
    {
        builder.AppendLine("## Corrections appliquees");
        var correctionCount = 0;

        foreach (var entry in entries.Where(entry => EventEquals(entry.Fields, "volume.auto")))
        {
            correctionCount++;
            var time = FormatShortTime(PickValue(entry.Fields, "time"));
            var display = PickValue(entry.Fields, "display", "siteName", "browserProcess", "process", "sourceId");
            var volume = PickValue(entry.Fields, "volume");
            var target = PickValue(entry.Fields, "target");
            var reason = PickValue(entry.Fields, "reason");
            var peak = PickValue(entry.Fields, "peak");
            var peakSuffix = peak == "inconnu" ? string.Empty : $" | peak={peak}";

            builder.AppendLine($"- {time} | {display} | {volume} -> {target} | {reason}{peakSuffix}");
        }

        if (correctionCount == 0)
        {
            builder.AppendLine("- Aucune correction appliquee dans cette session.");
        }
    }

    private static void AppendCoverage(StringBuilder builder, IEnumerable<IReadOnlyDictionary<string, string>> entries)
    {
        builder.AppendLine("## Couverture");
        var materializedEntries = entries.ToList();
        var summary = materializedEntries
            .Reverse<IReadOnlyDictionary<string, string>>()
            .FirstOrDefault(entry => EventEquals(entry, "coverage.summary.updated"));

        if (summary is null || summary.Count == 0)
        {
            AppendInferredCoverage(builder, materializedEntries);
            return;
        }

        var securable = PickValue(summary, "securable");
        var total = PickValue(summary, "total");
        builder.AppendLine($"- Score: {securable}/{total} sources securisables");
        builder.AppendLine($"- Direct={PickValue(summary, "direct")} | Fallback={PickValue(summary, "fallback")} | Action={PickValue(summary, "needsAction")} | Limite={PickValue(summary, "limited")} | Inconnu={PickValue(summary, "unknown")}");

        var sources = new Dictionary<string, IReadOnlyDictionary<string, string>>(StringComparer.OrdinalIgnoreCase);
        foreach (var fields in materializedEntries.Where(IsCoverageSourceEvent))
        {
            var display = PickValue(fields, "display", "siteName", "browserProcess", "process", "sourceId");
            if (display != "inconnu")
            {
                sources[display] = fields;
            }
        }

        if (sources.Count == 0)
        {
            builder.AppendLine("- Aucune source de couverture detaillee.");
            return;
        }

        foreach (var source in sources.OrderBy(source => source.Key, StringComparer.OrdinalIgnoreCase))
        {
            var fields = source.Value;
            builder.AppendLine($"- {source.Key}: {PickValue(fields, "origin")} / {PickValue(fields, "controlSurface")} / {PickValue(fields, "coverageStatus")} / {PickValue(fields, "coverageAction")}");
        }
    }

    private static void AppendInferredCoverage(
        StringBuilder builder,
        IEnumerable<IReadOnlyDictionary<string, string>> entries)
    {
        var sources = new Dictionary<string, IReadOnlyDictionary<string, string>>(StringComparer.OrdinalIgnoreCase);
        foreach (var fields in entries.Where(IsSourceObservationEvent))
        {
            var display = PickValue(fields, "display", "siteName", "browserProcess", "process", "sourceId");
            var origin = PickValue(fields, "origin");
            var controlSurface = PickValue(fields, "controlSurface");
            if (display == "inconnu" || origin == "inconnu" || controlSurface == "inconnu")
            {
                continue;
            }

            sources[display] = fields;
        }

        if (sources.Count == 0)
        {
            builder.AppendLine("- Aucune couverture calculee dans cette session.");
            return;
        }

        builder.AppendLine("- Couverture non journalisee : affichage deduit des sources visibles.");
        foreach (var source in sources.OrderBy(source => source.Key, StringComparer.OrdinalIgnoreCase))
        {
            var fields = source.Value;
            var action = PickValue(fields, "coverageAction", "recoveryAction", "reason");
            builder.AppendLine($"- {source.Key}: {PickValue(fields, "origin")} / {PickValue(fields, "controlSurface")} / Non calculee / {action}");
        }
    }

    private static void AppendGlobalOutput(StringBuilder builder, IEnumerable<IReadOnlyDictionary<string, string>> entries)
    {
        builder.AppendLine("## Sortie globale");
        var latest = entries
            .Reverse()
            .FirstOrDefault(IsGlobalOutputEventWithState);

        if (latest is null || latest.Count == 0)
        {
            builder.AppendLine("- Aucune mesure globale dans cette session.");
            return;
        }

        var device = PickValue(latest, "device");
        var state = PickValue(latest, "state");
        var rms = PickValue(latest, "rmsDb");
        var peak = PickValue(latest, "peakDb");
        var recentPeak = PickValue(latest, "recentPeakDb");
        var reason = PickValue(latest, "reason");

        builder.AppendLine($"- {device}: {state} / rms={rms} / peak={peak} / recentPeak={recentPeak} / reason={reason}");
    }

    private static void AppendAlerts(
        StringBuilder builder,
        IEnumerable<IReadOnlyDictionary<string, string>> entries,
        bool browserDetected)
    {
        builder.AppendLine("## Alertes");
        var alerts = new List<string>();
        var materializedEntries = entries.ToList();

        if (!browserDetected)
        {
            alerts.Add("Extension navigateur non detectee dans cette session.");
        }

        if (materializedEntries.Any(entry => string.Equals(PickValue(entry, "reason"), "safety-spike", StringComparison.OrdinalIgnoreCase)))
        {
            alerts.Add("Safety-spike detecte : verifier que le volume reste au-dessus du plancher manuel.");
        }

        if (materializedEntries.Any(entry => EventEquals(entry, "global_output.risky")))
        {
            alerts.Add("Sortie globale risquee : verifier le mix final avant live.");
        }

        if (materializedEntries.Any(entry => EventEquals(entry, "global_output.unknown_active")))
        {
            alerts.Add("Son global actif sans source connue active : verifier le melangeur Windows, OBS ou une application non detectee.");
        }

        if (materializedEntries.Any(entry => EventEquals(entry, "volume.auto_locked")))
        {
            alerts.Add("Correction verrouillee apres calibration one-shot : normal si la source continue sans silence durable.");
        }

        foreach (var entry in materializedEntries.Where(IsObserveOnlyOrUnknown))
        {
            var display = PickValue(entry, "display", "siteName", "browserProcess", "process", "sourceId");
            var controlSurface = PickValue(entry, "controlSurface");
            alerts.Add($"Source non controlable ou observee seulement : {display} ({controlSurface}).");
        }

        foreach (var entry in materializedEntries.Where(IsErrorEvent))
        {
            alerts.Add($"{PickValue(entry, "event")} : {PickValue(entry, "message")}");
        }

        if (alerts.Count == 0)
        {
            builder.AppendLine("- Aucune alerte evidente.");
            return;
        }

        foreach (var alert in alerts.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            builder.AppendLine($"- {alert}");
        }
    }

    private static bool IsBrowserExtensionDetected(IEnumerable<IReadOnlyDictionary<string, string>> entries)
    {
        foreach (var entry in entries)
        {
            if (string.Equals(PickValue(entry, "origin"), "BrowserExtension", StringComparison.OrdinalIgnoreCase) ||
                HasValue(entry, "browserProcess") ||
                HasPositiveInteger(entry, "visibleBrowserSources") ||
                PickValue(entry, "event").StartsWith("browser.", StringComparison.OrdinalIgnoreCase) ||
                PickValue(entry, "event").StartsWith("extension.", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    private static bool IsCoverageSourceEvent(IReadOnlyDictionary<string, string> fields)
    {
        return PickValue(fields, "event").StartsWith("coverage.source.", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsSourceObservationEvent(IReadOnlyDictionary<string, string> fields)
    {
        return EventEquals(fields, "browser.source.received") ||
            EventEquals(fields, "volume.auto") ||
            EventEquals(fields, "volume.auto_locked");
    }

    private static bool IsGlobalStateEvent(IReadOnlyDictionary<string, string> fields)
    {
        var eventName = PickValue(fields, "event");
        return string.Equals(eventName, "tester.session.start", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(eventName, "tester.mark", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(eventName, "config.save", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(eventName, "target.changed", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsGlobalOutputEventWithState(IReadOnlyDictionary<string, string> fields)
    {
        return PickValue(fields, "event").StartsWith("global_output.", StringComparison.OrdinalIgnoreCase) &&
            HasValue(fields, "state");
    }

    private static bool IsObserveOnlyOrUnknown(IReadOnlyDictionary<string, string> fields)
    {
        var controlSurface = PickValue(fields, "controlSurface");
        var controllable = PickValue(fields, "isControllable", "controllable");

        return string.Equals(controlSurface, "ObserveOnly", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(controlSurface, "Unknown", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(controllable, "False", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsErrorEvent(IReadOnlyDictionary<string, string> fields)
    {
        var eventName = PickValue(fields, "event");
        return eventName.EndsWith(".error", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(eventName, "bridge.message.invalid", StringComparison.OrdinalIgnoreCase);
    }

    private static bool EventEquals(IReadOnlyDictionary<string, string> fields, string eventName)
    {
        return string.Equals(PickValue(fields, "event"), eventName, StringComparison.OrdinalIgnoreCase);
    }

    private static bool HasValue(IReadOnlyDictionary<string, string> fields, string key)
    {
        return fields.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value);
    }

    private static bool HasPositiveInteger(IReadOnlyDictionary<string, string> fields, string key)
    {
        return fields.TryGetValue(key, out var value) &&
            int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var number) &&
            number > 0;
    }

    private static string PickValue(IReadOnlyDictionary<string, string> fields, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (fields.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }

        return "inconnu";
    }

    private static string PickLatestValue(IEnumerable<IReadOnlyDictionary<string, string>> entries, params string[] keys)
    {
        foreach (var fields in entries.Reverse())
        {
            var value = PickValue(fields, keys);
            if (value != "inconnu")
            {
                return value;
            }
        }

        return "inconnu";
    }

    private static string FormatBool(string value)
    {
        if (bool.TryParse(value, out var parsed))
        {
            return parsed ? "oui" : "non";
        }

        return value switch
        {
            "1" => "oui",
            "0" => "non",
            _ => "inconnu"
        };
    }

    private static string FormatShortTime(string value)
    {
        return DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed)
            ? parsed.ToString("HH:mm:ss", CultureInfo.InvariantCulture)
            : value;
    }
}

