using StreamVolumeGuard.Core.Audio;

namespace StreamVolumeGuard.Core.Control;

public sealed class SessionReferenceVolumeStore
{
    private readonly Dictionary<string, float> references = new(StringComparer.OrdinalIgnoreCase);

    public float GetOrAdd(AudioSessionSnapshot snapshot)
    {
        if (string.IsNullOrWhiteSpace(snapshot.SessionId))
        {
            return Clamp(snapshot.VolumeScalar);
        }

        if (!references.TryGetValue(snapshot.SessionId, out var reference))
        {
            reference = Clamp(snapshot.VolumeScalar);
            references[snapshot.SessionId] = reference;
        }

        return reference;
    }

    public void Update(string sessionId, float volumeScalar)
    {
        if (string.IsNullOrWhiteSpace(sessionId))
        {
            return;
        }

        references[sessionId] = Clamp(volumeScalar);
    }

    public void RemoveMissing(IEnumerable<string> currentSessionIds)
    {
        var current = currentSessionIds.ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var sessionId in references.Keys.ToArray())
        {
            if (!current.Contains(sessionId))
            {
                references.Remove(sessionId);
            }
        }
    }

    private static float Clamp(float value)
    {
        if (float.IsNaN(value) || float.IsInfinity(value)) return 1.0f;
        if (value < 0.0f) return 0.0f;
        if (value > 1.0f) return 1.0f;
        return value;
    }
}
