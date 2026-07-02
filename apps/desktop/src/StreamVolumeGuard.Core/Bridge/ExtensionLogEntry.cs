using StreamVolumeGuard.Core.Audio;
using StreamVolumeGuard.Core.Browser;

namespace StreamVolumeGuard.Core.Bridge;

public sealed record ExtensionLogEntry(
    string EventName,
    string Message,
    string Severity,
    string BrowserProcess,
    string SourceId,
    int? TabId,
    string SiteName,
    AudioSessionStatus Status,
    AudioControlSurface ControlSurface,
    string CaptureSignalState,
    float? TargetRmsDb,
    string TargetProfile,
    DateTimeOffset LastSeenUtc,
    AudioSourceOrigin Origin);
