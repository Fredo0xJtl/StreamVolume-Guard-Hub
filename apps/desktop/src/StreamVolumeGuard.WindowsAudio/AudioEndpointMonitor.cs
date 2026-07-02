using NAudio.CoreAudioApi;

namespace StreamVolumeGuard.WindowsAudio;

public sealed class AudioEndpointMonitor : IDisposable
{
    private readonly MMDeviceEnumerator enumerator = new();

    public IReadOnlyList<MMDevice> GetActiveRenderEndpoints()
    {
        var endpoints = enumerator
            .EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active)
            .ToList();

        var defaultEndpoint = GetDefaultRenderEndpoint();
        return endpoints
            .OrderByDescending(endpoint => string.Equals(endpoint.ID, defaultEndpoint.ID, StringComparison.OrdinalIgnoreCase))
            .ToList();
    }

    public MMDevice GetDefaultRenderEndpoint()
    {
        return enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
    }

    public void Dispose()
    {
        enumerator.Dispose();
    }
}
