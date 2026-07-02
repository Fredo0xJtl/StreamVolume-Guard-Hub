using StreamVolumeGuard.Core.Audio;

namespace StreamVolumeGuard.Core.Normalization;

public sealed class VolumeNormalizer
{
    private readonly NormalizerSettings settings;

    public VolumeNormalizer(NormalizerSettings settings)
    {
        this.settings = settings;
    }

    public VolumeDecision Evaluate(AudioSessionSnapshot session, DateTimeOffset now)
    {
        var currentVolume = Clamp(session.VolumeScalar, 0.0f, 1.0f);

        if (session.IsExcluded)
        {
            return new VolumeDecision(AudioSessionStatus.Excluded, false, currentVolume, "excluded");
        }

        if (!session.IsControllable)
        {
            return new VolumeDecision(AudioSessionStatus.Uncontrollable, false, currentVolume, "not-controllable");
        }

        if (session.IsMuted || currentVolume <= 0.0f)
        {
            return new VolumeDecision(AudioSessionStatus.Muted, false, currentVolume, "muted");
        }

        if (session.LastManualChangeUtc is { } manualChange && now - manualChange < settings.ManualCooldown)
        {
            return new VolumeDecision(AudioSessionStatus.Safe, false, currentVolume, "manual-cooldown");
        }

        var peak = Clamp(session.PeakLevel, 0.0f, 1.0f);

        if (peak >= settings.RiskyPeakLevel)
        {
            var target = Math.Max(settings.MinVolumeScalar, currentVolume - settings.MaxStepDown);
            return new VolumeDecision(AudioSessionStatus.Risky, target != currentVolume, target, "peak-above-target");
        }

        if (peak <= settings.LowPeakLevel && currentVolume < settings.MaxVolumeScalar)
        {
            var target = Math.Min(settings.MaxVolumeScalar, currentVolume + settings.MaxStepUp);
            return new VolumeDecision(AudioSessionStatus.Low, target != currentVolume, target, "peak-below-target");
        }

        return new VolumeDecision(AudioSessionStatus.Safe, false, currentVolume, "inside-target-band");
    }

    private static float Clamp(float value, float min, float max)
    {
        if (float.IsNaN(value) || float.IsInfinity(value)) return min;
        if (value < min) return min;
        if (value > max) return max;
        return value;
    }
}
