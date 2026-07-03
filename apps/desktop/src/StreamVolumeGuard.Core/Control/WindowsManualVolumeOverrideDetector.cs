using StreamVolumeGuard.Core.Audio;

namespace StreamVolumeGuard.Core.Control;

public sealed record WindowsManualVolumeOverrideSettings(
    float HighVolumeThreshold,
    float MinimumJump)
{
    public static WindowsManualVolumeOverrideSettings StreamDefault { get; } = new(
        HighVolumeThreshold: 0.95f,
        MinimumJump: 0.20f);
}

public sealed record WindowsManualVolumeOverride(
    string SessionId,
    string DisplayName,
    float PreviousVolumeScalar,
    float CurrentVolumeScalar);

public sealed class WindowsManualVolumeOverrideDetector
{
    private readonly WindowsManualVolumeOverrideSettings settings;
    private readonly Dictionary<string, float> lastVolumes = new(StringComparer.OrdinalIgnoreCase);

    public WindowsManualVolumeOverrideDetector()
        : this(WindowsManualVolumeOverrideSettings.StreamDefault)
    {
    }

    public WindowsManualVolumeOverrideDetector(WindowsManualVolumeOverrideSettings settings)
    {
        this.settings = settings;
    }

    public WindowsManualVolumeOverride? Detect(IEnumerable<AudioSessionSnapshot> sessions)
    {
        WindowsManualVolumeOverride? detected = null;
        var currentIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var session in sessions)
        {
            if (string.IsNullOrWhiteSpace(session.SessionId))
            {
                continue;
            }

            currentIds.Add(session.SessionId);
            var current = Clamp(session.VolumeScalar);

            if (detected is null
                && IsEligible(session)
                && lastVolumes.TryGetValue(session.SessionId, out var previous)
                && current >= settings.HighVolumeThreshold
                && current - previous >= settings.MinimumJump)
            {
                detected = new WindowsManualVolumeOverride(
                    session.SessionId,
                    session.DisplayName,
                    previous,
                    current);
            }

            lastVolumes[session.SessionId] = current;
        }

        foreach (var sessionId in lastVolumes.Keys.ToArray())
        {
            if (!currentIds.Contains(sessionId))
            {
                lastVolumes.Remove(sessionId);
            }
        }

        return detected;
    }

    public void RecordVolume(string sessionId, float volumeScalar)
    {
        if (string.IsNullOrWhiteSpace(sessionId))
        {
            return;
        }

        lastVolumes[sessionId] = Clamp(volumeScalar);
    }

    private static bool IsEligible(AudioSessionSnapshot session)
    {
        return session.IsControllable
            && !session.IsExcluded
            && !session.IsMuted
            && !session.IsSystemSession;
    }

    private static float Clamp(float value)
    {
        if (float.IsNaN(value) || float.IsInfinity(value)) return 0.0f;
        if (value < 0.0f) return 0.0f;
        if (value > 1.0f) return 1.0f;
        return value;
    }
}
