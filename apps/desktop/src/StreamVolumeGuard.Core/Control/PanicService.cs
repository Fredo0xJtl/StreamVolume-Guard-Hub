using StreamVolumeGuard.Core.Audio;
using StreamVolumeGuard.Core.Normalization;

namespace StreamVolumeGuard.Core.Control;

public sealed class PanicService
{
    public PanicService(float panicTargetVolume)
    {
        PanicTargetVolume = Clamp(panicTargetVolume, 0.0f, 1.0f);
    }

    public float PanicTargetVolume { get; }

    public IEnumerable<VolumeDecision> Apply(IEnumerable<AudioSessionSnapshot> sessions)
    {
        foreach (var session in sessions)
        {
            var current = Clamp(session.VolumeScalar, 0.0f, 1.0f);

            if (session.IsExcluded)
            {
                yield return new VolumeDecision(AudioSessionStatus.Excluded, false, current, "excluded");
                continue;
            }

            if (!session.IsControllable)
            {
                yield return new VolumeDecision(AudioSessionStatus.Uncontrollable, false, current, "not-controllable");
                continue;
            }

            if (session.IsMuted || current <= 0.0f)
            {
                yield return new VolumeDecision(AudioSessionStatus.Muted, false, current, "muted");
                continue;
            }

            var target = Math.Min(current, PanicTargetVolume);
            yield return new VolumeDecision(AudioSessionStatus.Risky, target != current, target, "panic");
        }
    }

    private static float Clamp(float value, float min, float max)
    {
        if (float.IsNaN(value) || float.IsInfinity(value)) return min;
        if (value < min) return min;
        if (value > max) return max;
        return value;
    }
}
