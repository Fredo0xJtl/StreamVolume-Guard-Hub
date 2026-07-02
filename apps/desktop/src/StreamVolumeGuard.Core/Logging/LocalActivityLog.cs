using System.Globalization;
using System.Text;

namespace StreamVolumeGuard.Core.Logging;

public sealed class LocalActivityLog
{
    private const int MaxValueLength = 240;
    private readonly Func<DateTimeOffset> nowProvider;
    private readonly object gate = new();

    public LocalActivityLog(string logDirectory, Func<DateTimeOffset>? nowProvider = null)
    {
        if (string.IsNullOrWhiteSpace(logDirectory))
        {
            throw new ArgumentException("Log directory is required.", nameof(logDirectory));
        }

        LogDirectory = logDirectory;
        this.nowProvider = nowProvider ?? (() => DateTimeOffset.Now);
    }

    public string LogDirectory { get; }

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

    public void Write(string eventName, string message, IReadOnlyDictionary<string, string?>? fields = null)
    {
        var now = nowProvider();
        var builder = new StringBuilder();
        AppendField(builder, "time", now.ToString("yyyy-MM-ddTHH:mm:ss.fffzzz", CultureInfo.InvariantCulture));
        AppendField(builder, "event", eventName);
        AppendField(builder, "message", message);

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

    public string ReadRecentText(int maxLines)
    {
        if (maxLines <= 0 || !File.Exists(CurrentLogFilePath))
        {
            return string.Empty;
        }

        var recent = new Queue<string>();
        foreach (var line in File.ReadLines(CurrentLogFilePath, Encoding.UTF8))
        {
            recent.Enqueue(line);
            while (recent.Count > maxLines)
            {
                recent.Dequeue();
            }
        }

        return string.Join(Environment.NewLine, recent);
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
}

