namespace StreamVolumeGuard.Core.Normalization;

public sealed record NormalizerSettings(
    float TargetPeakLevel,
    float RiskyPeakLevel,
    float LowPeakLevel,
    float MaxStepDown,
    float MaxStepUp,
    float MinVolumeScalar,
    float MaxVolumeScalar,
    TimeSpan ManualCooldown)
{
    public static NormalizerSettings StreamDefault { get; } = new(
        TargetPeakLevel: 0.35f,
        RiskyPeakLevel: 0.65f,
        LowPeakLevel: 0.12f,
        MaxStepDown: 0.08f,
        MaxStepUp: 0.03f,
        MinVolumeScalar: 0.08f,
        MaxVolumeScalar: 1.00f,
        ManualCooldown: TimeSpan.FromSeconds(8));

    public static NormalizerSettings FromTargetDecibels(float targetDecibels)
    {
        if (Math.Abs(targetDecibels - -18.0f) < 0.01f)
        {
            return StreamDefault;
        }

        var ratio = MathF.Pow(10.0f, (targetDecibels - -18.0f) / 20.0f);
        return StreamDefault with
        {
            TargetPeakLevel = Clamp(StreamDefault.TargetPeakLevel * ratio, 0.08f, 0.85f),
            RiskyPeakLevel = Clamp(StreamDefault.RiskyPeakLevel * ratio, 0.18f, 0.95f),
            LowPeakLevel = Clamp(StreamDefault.LowPeakLevel * ratio, 0.03f, 0.35f)
        };
    }

    private static float Clamp(float value, float min, float max)
    {
        if (float.IsNaN(value) || float.IsInfinity(value)) return min;
        if (value < min) return min;
        if (value > max) return max;
        return value;
    }
}
