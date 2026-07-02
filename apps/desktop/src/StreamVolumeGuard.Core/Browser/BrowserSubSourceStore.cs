namespace StreamVolumeGuard.Core.Browser;

public sealed class BrowserSubSourceStore
{
    private readonly Dictionary<string, BrowserSubSourceSnapshot> sources = new(StringComparer.OrdinalIgnoreCase);

    public void Upsert(BrowserSubSourceSnapshot source)
    {
        if (string.IsNullOrWhiteSpace(source.SourceId))
        {
            throw new ArgumentException("Browser source id is required.", nameof(source));
        }

        sources.TryGetValue(source.SourceId, out var previous);

        var lastBrowserGainSeenUtc = source.ControlSurface is AudioControlSurface.BrowserGain
            ? source.LastSeenUtc
            : source.LastBrowserGainSeenUtc ?? previous?.LastBrowserGainSeenUtc;

        sources[source.SourceId] = source with
        {
            LastBrowserGainSeenUtc = lastBrowserGainSeenUtc
        };
    }

    public IReadOnlyList<BrowserSubSourceSnapshot> GetAll()
    {
        return sources.Values
            .OrderBy(item => item.BrowserProcess, StringComparer.OrdinalIgnoreCase)
            .ThenBy(item => item.SiteName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(item => item.SourceId, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public int RemoveStale(DateTimeOffset cutoffUtc)
    {
        var staleIds = sources
            .Where(item => item.Value.LastSeenUtc < cutoffUtc)
            .Select(item => item.Key)
            .ToList();

        foreach (var sourceId in staleIds)
        {
            sources.Remove(sourceId);
        }

        return staleIds.Count;
    }
}
