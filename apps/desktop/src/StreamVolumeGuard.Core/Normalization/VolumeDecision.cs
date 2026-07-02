using StreamVolumeGuard.Core.Audio;

namespace StreamVolumeGuard.Core.Normalization;

public sealed record VolumeDecision(
    AudioSessionStatus Status,
    bool ShouldApplyVolume,
    float TargetVolumeScalar,
    string Reason);
