using StreamVolumeGuard.Core.Audio;
using StreamVolumeGuard.Core.Config;
using StreamVolumeGuard.Core.Normalization;

namespace StreamVolumeGuard.Core.Control;

public sealed record TargetVolumeProfilePolicySettings(
    float QuietMultiplier,
    float StandardMultiplier,
    float LoudMultiplier,
    float MinimumCustomMultiplier,
    float MinimumDelta)
{
    public static TargetVolumeProfilePolicySettings StreamDefault { get; } = new(
        QuietMultiplier: 0.40f,
        StandardMultiplier: 0.70f,
        LoudMultiplier: 1.00f,
        MinimumCustomMultiplier: 0.15f,
        MinimumDelta: 0.01f);
}

public sealed class TargetVolumeProfilePolicy
{
    public const string ProfileTargetReason = "profile-target";

    private readonly TargetVolumeProfilePolicySettings settings;

    public TargetVolumeProfilePolicy()
        : this(TargetVolumeProfilePolicySettings.StreamDefault)
    {
    }

    public TargetVolumeProfilePolicy(TargetVolumeProfilePolicySettings settings)
    {
        this.settings = settings;
    }

    public VolumeDecision Apply(
        AudioSessionSnapshot session,
        VolumeDecision baseDecision,
        GlobalTargetSettings targetSettings)
    {
        var currentVolume = Clamp(session.VolumeScalar, 0.0f, 1.0f);

        if (session.IsExcluded || !session.IsControllable || session.IsMuted || currentVolume <= 0.0f)
        {
            return baseDecision;
        }

        if (string.Equals(baseDecision.Reason, VolumeNormalizer.ManualCooldownReason, StringComparison.Ordinal))
        {
            return baseDecision;
        }

        var normalizedTarget = targetSettings.Normalize();
        var minimumVolume = Clamp(settings.MinimumCustomMultiplier, 0.0f, 1.0f);
        var desiredVolume = Clamp(MultiplierFor(normalizedTarget), minimumVolume, 1.0f);
        if (session.IsSystemSession && desiredVolume > currentVolume)
        {
            return new VolumeDecision(AudioSessionStatus.Safe, false, currentVolume, WindowsSystemSessionClassifier.ProtectOnlyReason);
        }

        if (Math.Abs(desiredVolume - currentVolume) < settings.MinimumDelta)
        {
            return HoldAutomaticAdjustmentAtProfileTarget(baseDecision, currentVolume);
        }

        var status = desiredVolume > currentVolume
            ? AudioSessionStatus.Low
            : AudioSessionStatus.Risky;

        return new VolumeDecision(status, true, desiredVolume, ProfileTargetReason);
    }

    private VolumeDecision HoldAutomaticAdjustmentAtProfileTarget(VolumeDecision baseDecision, float currentVolume)
    {
        if (!baseDecision.ShouldApplyVolume)
        {
            return baseDecision;
        }

        return baseDecision with
        {
            ShouldApplyVolume = false,
            TargetVolumeScalar = currentVolume,
            Reason = ProfileTargetReason
        };
    }

    private float MultiplierFor(GlobalTargetSettings targetSettings)
    {
        if (string.Equals(targetSettings.Profile, GlobalTargetSettings.QuietProfile, StringComparison.OrdinalIgnoreCase))
        {
            return settings.QuietMultiplier;
        }

        if (string.Equals(targetSettings.Profile, GlobalTargetSettings.StandardProfile, StringComparison.OrdinalIgnoreCase))
        {
            return settings.StandardMultiplier;
        }

        if (string.Equals(targetSettings.Profile, GlobalTargetSettings.LoudProfile, StringComparison.OrdinalIgnoreCase))
        {
            return settings.LoudMultiplier;
        }

        return CustomMultiplierFor(targetSettings.TargetDecibels);
    }

    private float CustomMultiplierFor(float targetDecibels)
    {
        var clamped = GlobalTargetSettings.ClampDecibels(targetDecibels);
        if (clamped <= GlobalTargetSettings.QuietDecibels)
        {
            return Lerp(
                settings.MinimumCustomMultiplier,
                settings.QuietMultiplier,
                InverseLerp(GlobalTargetSettings.MinDecibels, GlobalTargetSettings.QuietDecibels, clamped));
        }

        if (clamped <= GlobalTargetSettings.StandardDecibels)
        {
            return Lerp(
                settings.QuietMultiplier,
                settings.StandardMultiplier,
                InverseLerp(GlobalTargetSettings.QuietDecibels, GlobalTargetSettings.StandardDecibels, clamped));
        }

        return Lerp(
            settings.StandardMultiplier,
            settings.LoudMultiplier,
            InverseLerp(GlobalTargetSettings.StandardDecibels, GlobalTargetSettings.LoudDecibels, clamped));
    }

    private static float InverseLerp(float min, float max, float value)
    {
        if (Math.Abs(max - min) < 0.0001f)
        {
            return 0.0f;
        }

        return Clamp((value - min) / (max - min), 0.0f, 1.0f);
    }

    private static float Lerp(float start, float end, float amount)
    {
        return start + ((end - start) * Clamp(amount, 0.0f, 1.0f));
    }

    private static float Clamp(float value, float min, float max)
    {
        if (float.IsNaN(value) || float.IsInfinity(value)) return min;
        if (value < min) return min;
        if (value > max) return max;
        return value;
    }
}
