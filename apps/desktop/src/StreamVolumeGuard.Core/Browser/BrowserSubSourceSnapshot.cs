using StreamVolumeGuard.Core.Audio;

namespace StreamVolumeGuard.Core.Browser;

public sealed record BrowserSubSourceSnapshot(
    string SourceId,
    string BrowserProcess,
    int? TabId,
    string SiteName,
    string Title,
    float CurrentLevel,
    float AppliedGain,
    AudioSessionStatus Status,
    AudioSourceOrigin Origin,
    AudioControlSurface ControlSurface,
    DateTimeOffset LastSeenUtc,
    float? TargetRmsDb = null,
    string TargetProfile = "",
    DateTimeOffset? LastBrowserGainSeenUtc = null,
    string CalibrationState = "",
    float? MeasuredRmsDb = null,
    float? AppliedGainDb = null,
    string CaptureSignalState = "",
    string CalibrationReason = "",
    string BrowserState = "",
    string Reason = "",
    string RecommendedAction = "")
{
    public bool IsControllable => ControlSurface is AudioControlSurface.BrowserGain or AudioControlSurface.WindowsSessionVolume;
}
