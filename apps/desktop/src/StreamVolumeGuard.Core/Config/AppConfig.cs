namespace StreamVolumeGuard.Core.Config;

public sealed class AppConfig
{
    public bool AutoEnabled { get; init; }
    public bool DarkThemeEnabled { get; init; }
    public bool StreamSafeEnabled { get; init; }
    public string TargetProfile { get; init; } = GlobalTargetSettings.StandardProfile;
    public float TargetDecibels { get; init; } = GlobalTargetSettings.StandardDecibels;
    public string BridgeToken { get; init; } = string.Empty;
    public List<string> ExcludedSessionIds { get; init; } = new();

    public static AppConfig Default => new();

    public AppConfig Normalize()
    {
        var excluded = ExcludedSessionIds
            .Select(item => item?.Trim() ?? string.Empty)
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(item => item, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var target = new GlobalTargetSettings(TargetProfile, TargetDecibels).Normalize();

        return new AppConfig
        {
            AutoEnabled = AutoEnabled,
            DarkThemeEnabled = DarkThemeEnabled,
            StreamSafeEnabled = StreamSafeEnabled,
            TargetProfile = target.Profile,
            TargetDecibels = target.TargetDecibels,
            BridgeToken = (BridgeToken ?? string.Empty).Trim(),
            ExcludedSessionIds = excluded
        };
    }
}
