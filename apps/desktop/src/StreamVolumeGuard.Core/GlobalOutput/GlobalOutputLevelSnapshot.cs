namespace StreamVolumeGuard.Core.GlobalOutput;

public sealed record GlobalOutputLevelSnapshot(
    DateTimeOffset ObservedAtUtc,
    string DeviceName,
    GlobalOutputState State,
    double RmsDb,
    double PeakDb,
    double RecentPeakDb,
    bool IsAvailable,
    bool IsClippingPossible,
    string Reason,
    string? ErrorMessage)
{
    public static GlobalOutputLevelSnapshot Unknown(DateTimeOffset observedAtUtc, string? deviceName = null, string? errorMessage = null)
    {
        var classification = GlobalOutputLevelClassifier.Classify(
            rmsDb: double.NaN,
            peakDb: double.NaN,
            isAvailable: false,
            errorMessage: errorMessage ?? "Global output monitor unavailable.");

        return new GlobalOutputLevelSnapshot(
            observedAtUtc,
            string.IsNullOrWhiteSpace(deviceName) ? "Sortie inconnue" : deviceName,
            classification.State,
            double.NaN,
            double.NaN,
            double.NaN,
            IsAvailable: false,
            classification.IsClippingPossible,
            classification.Reason,
            errorMessage);
    }
}
