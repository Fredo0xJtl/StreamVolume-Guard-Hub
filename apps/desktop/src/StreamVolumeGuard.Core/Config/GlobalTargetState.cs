namespace StreamVolumeGuard.Core.Config;

public sealed record GlobalTargetState(
    string Type,
    string Source,
    string TargetProfile,
    float TargetDecibels,
    float TargetRmsDb,
    DateTimeOffset UpdatedAt)
{
    public static GlobalTargetState FromSettings(GlobalTargetSettings settings, DateTimeOffset updatedAt)
    {
        var normalized = settings.Normalize();
        return new GlobalTargetState(
            Type: "global_target_state",
            Source: "Desktop",
            TargetProfile: normalized.Profile,
            TargetDecibels: normalized.TargetDecibels,
            TargetRmsDb: normalized.TargetDecibels,
            UpdatedAt: updatedAt);
    }
}
