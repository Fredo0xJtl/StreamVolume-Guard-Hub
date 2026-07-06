namespace StreamVolumeGuard.Core.GlobalOutput;

public static class GlobalOutputLevelClassifier
{
    public const double SilentRmsDb = -60.0;
    public const double SilentPeakDb = -55.0;
    public const double RiskyRmsDb = -14.0;
    public const double RiskyPeakDb = -3.0;
    public const double ClippingPeakDb = -1.0;

    public static GlobalOutputLevelClassification Classify(double rmsDb, double peakDb, bool isAvailable, string? errorMessage)
    {
        if (!isAvailable || !string.IsNullOrWhiteSpace(errorMessage) || !double.IsFinite(rmsDb) || !double.IsFinite(peakDb))
        {
            return new GlobalOutputLevelClassification(GlobalOutputState.Unknown, IsClippingPossible: false, "loopback-unavailable");
        }

        var clippingPossible = peakDb >= ClippingPeakDb;
        if (clippingPossible)
        {
            return new GlobalOutputLevelClassification(GlobalOutputState.Risky, IsClippingPossible: true, "clipping-possible");
        }

        if (peakDb >= RiskyPeakDb || rmsDb >= RiskyRmsDb)
        {
            return new GlobalOutputLevelClassification(GlobalOutputState.Risky, IsClippingPossible: false, "level-risky");
        }

        if (rmsDb <= SilentRmsDb && peakDb <= SilentPeakDb)
        {
            return new GlobalOutputLevelClassification(GlobalOutputState.Silent, IsClippingPossible: false, "output-silent");
        }

        return new GlobalOutputLevelClassification(GlobalOutputState.Safe, IsClippingPossible: false, "level-safe");
    }
}
