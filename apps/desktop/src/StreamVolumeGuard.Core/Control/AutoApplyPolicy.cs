using StreamVolumeGuard.Core.Normalization;

namespace StreamVolumeGuard.Core.Control;

public sealed record AutoApplyPlan(
    bool ShouldSetVolume,
    bool ShouldLogWouldApply,
    float TargetVolumeScalar);

public sealed class AutoApplyPolicy
{
    public AutoApplyPlan Evaluate(VolumeDecision decision, bool autoEnabled)
    {
        if (!decision.ShouldApplyVolume)
        {
            return new AutoApplyPlan(
                ShouldSetVolume: false,
                ShouldLogWouldApply: false,
                TargetVolumeScalar: decision.TargetVolumeScalar);
        }

        return autoEnabled
            ? new AutoApplyPlan(
                ShouldSetVolume: true,
                ShouldLogWouldApply: false,
                TargetVolumeScalar: decision.TargetVolumeScalar)
            : new AutoApplyPlan(
                ShouldSetVolume: false,
                ShouldLogWouldApply: true,
                TargetVolumeScalar: decision.TargetVolumeScalar);
    }
}
