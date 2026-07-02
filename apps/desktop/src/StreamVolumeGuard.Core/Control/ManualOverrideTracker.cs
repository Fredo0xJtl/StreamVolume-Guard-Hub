namespace StreamVolumeGuard.Core.Control;

public sealed class ManualOverrideTracker
{
    private readonly Dictionary<string, DateTimeOffset> changes = new(StringComparer.OrdinalIgnoreCase);

    public void RecordManualChange(string sessionId, DateTimeOffset changedAtUtc)
    {
        changes[sessionId] = changedAtUtc;
    }

    public DateTimeOffset? GetLastManualChangeUtc(string sessionId)
    {
        return changes.TryGetValue(sessionId, out var changedAtUtc) ? changedAtUtc : null;
    }
}
