using StreamVolumeGuard.Core.Normalization;

namespace StreamVolumeGuard.Core.Audio;

public static class WindowsSystemSessionClassifier
{
    public const string GroupSessionId = "windows-system-sounds";
    public const string DisplayName = "Sons système Windows";

    private const string AudioServiceResourceName = "AudioSrv.Dll";
    private const string AudioServiceResourceId = "-202";

    public static bool IsSystemSounds(AudioSessionSnapshot snapshot)
    {
        return snapshot.IsSystemSession || IsAudioServiceResourceName(snapshot.DisplayName);
    }

    public static AudioSessionSnapshot BuildGroupSnapshot(IReadOnlyList<AudioSessionSnapshot> snapshots)
    {
        if (snapshots.Count == 0)
        {
            throw new ArgumentException("At least one system session is required.", nameof(snapshots));
        }

        return new AudioSessionSnapshot(
            SessionId: GroupSessionId,
            DeviceId: BuildGroupDeviceId(snapshots),
            DisplayName: DisplayName,
            ProcessName: "system",
            ProcessId: null,
            PeakLevel: Clamp(snapshots.Max(snapshot => snapshot.PeakLevel)),
            VolumeScalar: Clamp((float)snapshots.Average(snapshot => snapshot.VolumeScalar)),
            IsMuted: snapshots.All(snapshot => snapshot.IsMuted),
            IsSystemSession: true,
            IsControllable: snapshots.Any(snapshot => snapshot.IsControllable),
            LastManualChangeUtc: LatestManualChange(snapshots),
            IsExcluded: snapshots.All(snapshot => snapshot.IsExcluded),
            SeenAtUtc: snapshots.Max(snapshot => snapshot.SeenAtUtc));
    }

    public static VolumeDecision BuildGroupDecision(IReadOnlyList<VolumeDecision> decisions)
    {
        if (decisions.Count == 0)
        {
            throw new ArgumentException("At least one system decision is required.", nameof(decisions));
        }

        var strongest = decisions.OrderByDescending(decision => StatusPriority(decision.Status)).First();
        return strongest with
        {
            ShouldApplyVolume = decisions.Any(decision => decision.ShouldApplyVolume),
            TargetVolumeScalar = Clamp((float)decisions.Average(decision => decision.TargetVolumeScalar)),
            Reason = $"{decisions.Count} sessions système regroupées; {strongest.Reason}"
        };
    }

    private static bool IsAudioServiceResourceName(string displayName)
    {
        return displayName.Contains(AudioServiceResourceName, StringComparison.OrdinalIgnoreCase)
            && displayName.Contains(AudioServiceResourceId, StringComparison.OrdinalIgnoreCase);
    }

    private static string BuildGroupDeviceId(IReadOnlyList<AudioSessionSnapshot> snapshots)
    {
        var first = snapshots[0].DeviceId;
        return snapshots.All(snapshot => string.Equals(snapshot.DeviceId, first, StringComparison.OrdinalIgnoreCase))
            ? first
            : "multiple-devices";
    }

    private static DateTimeOffset? LatestManualChange(IReadOnlyList<AudioSessionSnapshot> snapshots)
    {
        DateTimeOffset? latest = null;
        foreach (var snapshot in snapshots)
        {
            if (snapshot.LastManualChangeUtc is null)
            {
                continue;
            }

            if (latest is null || snapshot.LastManualChangeUtc > latest)
            {
                latest = snapshot.LastManualChangeUtc;
            }
        }

        return latest;
    }

    private static int StatusPriority(AudioSessionStatus status)
    {
        return status switch
        {
            AudioSessionStatus.Risky => 70,
            AudioSessionStatus.Low => 60,
            AudioSessionStatus.Muted => 50,
            AudioSessionStatus.Uncontrollable => 45,
            AudioSessionStatus.Unknown => 40,
            AudioSessionStatus.Excluded => 30,
            AudioSessionStatus.Safe => 10,
            _ => 0
        };
    }

    private static float Clamp(float value)
    {
        if (float.IsNaN(value) || float.IsInfinity(value)) return 0.0f;
        if (value < 0.0f) return 0.0f;
        if (value > 1.0f) return 1.0f;
        return value;
    }
}
