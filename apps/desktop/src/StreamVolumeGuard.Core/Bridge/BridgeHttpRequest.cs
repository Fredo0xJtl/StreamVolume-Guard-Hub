namespace StreamVolumeGuard.Core.Bridge;

public sealed record BridgeHttpRequest(
    string Method,
    string Path,
    IReadOnlyDictionary<string, string> Headers,
    byte[] Body);