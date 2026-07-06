using System.Globalization;

namespace StreamVolumeGuard.Core.GlobalOutput;

public static class GlobalOutputLogFields
{
    public static Dictionary<string, string?> FromSnapshot(GlobalOutputLevelSnapshot snapshot)
    {
        return new Dictionary<string, string?>
        {
            ["device"] = snapshot.DeviceName,
            ["state"] = snapshot.State.ToString(),
            ["rmsDb"] = FormatDecibels(snapshot.RmsDb),
            ["peakDb"] = FormatDecibels(snapshot.PeakDb),
            ["recentPeakDb"] = FormatDecibels(snapshot.RecentPeakDb),
            ["isAvailable"] = snapshot.IsAvailable.ToString(CultureInfo.InvariantCulture),
            ["clippingPossible"] = snapshot.IsClippingPossible.ToString(CultureInfo.InvariantCulture),
            ["reason"] = snapshot.Reason,
            ["error"] = snapshot.ErrorMessage ?? string.Empty,
            ["observedAt"] = snapshot.ObservedAtUtc.ToString("O", CultureInfo.InvariantCulture)
        };
    }

    private static string FormatDecibels(double value)
    {
        return double.IsFinite(value)
            ? value.ToString("0.0", CultureInfo.InvariantCulture)
            : "unknown";
    }
}
