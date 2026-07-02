namespace StreamVolumeGuard.Core.Config;

public sealed record GlobalTargetSettings(string Profile, float TargetDecibels)
{
    public const string QuietProfile = "Calme";
    public const string StandardProfile = "Standard";
    public const string LoudProfile = "Fort";
    public const string CustomProfile = "Personnalise";
    public const float QuietDecibels = -22.0f;
    public const float StandardDecibels = -18.0f;
    public const float LoudDecibels = -15.0f;
    public const float MinDecibels = -30.0f;
    public const float MaxDecibels = -15.0f;

    public static GlobalTargetSettings Standard { get; } = new(StandardProfile, StandardDecibels);

    public GlobalTargetSettings Normalize()
    {
        var target = ClampDecibels(TargetDecibels);
        var profile = NormalizeProfile(Profile, target);
        return new GlobalTargetSettings(profile, target);
    }

    public static string NormalizeProfile(string? profile, float targetDecibels)
    {
        var normalized = (profile ?? string.Empty).Trim();
        if (string.Equals(normalized, QuietProfile, StringComparison.OrdinalIgnoreCase))
        {
            return QuietProfile;
        }

        if (string.Equals(normalized, StandardProfile, StringComparison.OrdinalIgnoreCase))
        {
            return StandardProfile;
        }

        if (string.Equals(normalized, LoudProfile, StringComparison.OrdinalIgnoreCase))
        {
            return LoudProfile;
        }

        if (Math.Abs(targetDecibels - QuietDecibels) < 0.01f) return QuietProfile;
        if (Math.Abs(targetDecibels - StandardDecibels) < 0.01f) return StandardProfile;
        if (Math.Abs(targetDecibels - LoudDecibels) < 0.01f) return LoudProfile;
        return CustomProfile;
    }

    public static float ClampDecibels(float value)
    {
        if (float.IsNaN(value) || float.IsInfinity(value)) return StandardDecibels;
        if (value < MinDecibels) return MinDecibels;
        if (value > MaxDecibels) return MaxDecibels;
        return value;
    }
}
