namespace StreamVolumeGuard.Core.Audio;

public sealed record AudioSessionSnapshot(
    string SessionId,
    string DeviceId,
    string DisplayName,
    string? ProcessName,
    int? ProcessId,
    float PeakLevel,
    float VolumeScalar,
    bool IsMuted,
    bool IsSystemSession,
    bool IsControllable,
    DateTimeOffset? LastManualChangeUtc,
    bool IsExcluded,
    DateTimeOffset SeenAtUtc);
