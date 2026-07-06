namespace StreamVolumeGuard.Core.GlobalOutput;

public static class GlobalOutputLevelMeter
{
    private const double SilenceFloorDb = -120.0;

    public static GlobalOutputMeasurement Measure(IEnumerable<float> samples)
    {
        ArgumentNullException.ThrowIfNull(samples);

        var count = 0;
        var sumSquares = 0.0;
        var peak = 0.0;

        foreach (var sample in samples)
        {
            if (float.IsNaN(sample) || float.IsInfinity(sample))
            {
                continue;
            }

            var absolute = Math.Abs(Clamp(sample));
            sumSquares += absolute * absolute;
            if (absolute > peak)
            {
                peak = absolute;
            }

            count++;
        }

        if (count == 0)
        {
            return new GlobalOutputMeasurement(0.0, 0.0, SilenceFloorDb, SilenceFloorDb);
        }

        var rms = Math.Sqrt(sumSquares / count);
        return new GlobalOutputMeasurement(rms, peak, ToDecibels(rms), ToDecibels(peak));
    }

    public static double ToDecibels(double scalar)
    {
        if (!double.IsFinite(scalar) || scalar <= 0.0)
        {
            return SilenceFloorDb;
        }

        return Math.Max(SilenceFloorDb, 20.0 * Math.Log10(Math.Min(1.0, scalar)));
    }

    private static float Clamp(float sample)
    {
        if (sample < -1.0f) return -1.0f;
        if (sample > 1.0f) return 1.0f;
        return sample;
    }
}
