using NAudio.CoreAudioApi;
using NAudio.Wave;
using StreamVolumeGuard.Core.GlobalOutput;

namespace StreamVolumeGuard.WindowsAudio;

public sealed class GlobalOutputMonitor : IDisposable
{
    private static readonly TimeSpan RecentPeakWindow = TimeSpan.FromSeconds(3);
    private readonly MMDeviceEnumerator enumerator = new();
    private readonly Queue<(DateTimeOffset ObservedAtUtc, double Peak)> recentPeaks = new();
    private readonly object gate = new();
    private WasapiLoopbackCapture? capture;
    private MMDevice? device;
    private bool disposed;

    public event EventHandler<GlobalOutputLevelSnapshot>? LevelAvailable;
    public event EventHandler<Exception>? MonitorError;

    public string? CurrentDeviceName { get; private set; }

    public bool IsRunning { get; private set; }

    public void Start()
    {
        ThrowIfDisposed();

        lock (gate)
        {
            if (capture is not null)
            {
                return;
            }

            try
            {
                device = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
                CurrentDeviceName = device.FriendlyName;
                capture = new WasapiLoopbackCapture(device);
                capture.DataAvailable += Capture_DataAvailable;
                capture.RecordingStopped += Capture_RecordingStopped;
                capture.StartRecording();
                IsRunning = true;
            }
            catch
            {
                CleanupCapture();
                throw;
            }
        }
    }

    public void Stop()
    {
        WasapiLoopbackCapture? currentCapture;
        lock (gate)
        {
            currentCapture = capture;
        }

        if (currentCapture is not null)
        {
            try
            {
                currentCapture.StopRecording();
            }
            catch
            {
                // Stop must stay best-effort so app shutdown is not blocked by the audio stack.
            }
        }

        lock (gate)
        {
            CleanupCapture();
            recentPeaks.Clear();
            IsRunning = false;
        }
    }

    private void Capture_DataAvailable(object? sender, WaveInEventArgs e)
    {
        try
        {
            WasapiLoopbackCapture? currentCapture;
            string deviceName;
            lock (gate)
            {
                currentCapture = capture;
                deviceName = CurrentDeviceName ?? "Sortie inconnue";
            }

            if (currentCapture is null || e.BytesRecorded <= 0)
            {
                return;
            }

            var samples = DecodeSamples(e.Buffer, e.BytesRecorded, currentCapture.WaveFormat);
            var measurement = GlobalOutputLevelMeter.Measure(samples);
            var classification = GlobalOutputLevelClassifier.Classify(
                measurement.RmsDb,
                measurement.PeakDb,
                isAvailable: true,
                errorMessage: null);

            var now = DateTimeOffset.UtcNow;
            var recentPeakDb = GlobalOutputLevelMeter.ToDecibels(UpdateRecentPeak(now, measurement.Peak));
            var snapshot = new GlobalOutputLevelSnapshot(
                now,
                deviceName,
                classification.State,
                measurement.RmsDb,
                measurement.PeakDb,
                recentPeakDb,
                IsAvailable: true,
                classification.IsClippingPossible,
                classification.Reason,
                ErrorMessage: null);

            LevelAvailable?.Invoke(this, snapshot);
        }
        catch (Exception ex)
        {
            MonitorError?.Invoke(this, ex);
        }
    }

    private void Capture_RecordingStopped(object? sender, StoppedEventArgs e)
    {
        lock (gate)
        {
            IsRunning = false;
        }

        if (e.Exception is not null)
        {
            MonitorError?.Invoke(this, e.Exception);
        }
    }

    private double UpdateRecentPeak(DateTimeOffset now, double peak)
    {
        lock (gate)
        {
            recentPeaks.Enqueue((now, peak));
            while (recentPeaks.Count > 0 && now - recentPeaks.Peek().ObservedAtUtc > RecentPeakWindow)
            {
                recentPeaks.Dequeue();
            }

            return recentPeaks.Count == 0 ? peak : recentPeaks.Max(item => item.Peak);
        }
    }

    private static IReadOnlyList<float> DecodeSamples(byte[] buffer, int bytesRecorded, WaveFormat format)
    {
        var bytesPerSample = Math.Max(1, format.BitsPerSample / 8);
        var sampleCount = bytesRecorded / bytesPerSample;
        var samples = new List<float>(sampleCount);

        if (format.Encoding is WaveFormatEncoding.IeeeFloat ||
            (format.Encoding is WaveFormatEncoding.Extensible && format.BitsPerSample == 32))
        {
            for (var offset = 0; offset + 3 < bytesRecorded; offset += 4)
            {
                samples.Add(BitConverter.ToSingle(buffer, offset));
            }

            return samples;
        }

        if (format.Encoding is WaveFormatEncoding.Pcm or WaveFormatEncoding.Extensible)
        {
            switch (format.BitsPerSample)
            {
                case 16:
                    for (var offset = 0; offset + 1 < bytesRecorded; offset += 2)
                    {
                        samples.Add(BitConverter.ToInt16(buffer, offset) / 32768f);
                    }
                    break;
                case 24:
                    for (var offset = 0; offset + 2 < bytesRecorded; offset += 3)
                    {
                        var value = buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
                        if ((value & 0x800000) != 0)
                        {
                            value |= unchecked((int)0xFF000000);
                        }

                        samples.Add(value / 8388608f);
                    }
                    break;
                case 32:
                    for (var offset = 0; offset + 3 < bytesRecorded; offset += 4)
                    {
                        samples.Add(BitConverter.ToInt32(buffer, offset) / 2147483648f);
                    }
                    break;
            }
        }

        return samples;
    }

    private void CleanupCapture()
    {
        if (capture is not null)
        {
            capture.DataAvailable -= Capture_DataAvailable;
            capture.RecordingStopped -= Capture_RecordingStopped;
            capture.Dispose();
            capture = null;
        }

        if (device is not null)
        {
            device.Dispose();
            device = null;
        }
    }

    private void ThrowIfDisposed()
    {
        ObjectDisposedException.ThrowIf(disposed, this);
    }

    public void Dispose()
    {
        if (disposed)
        {
            return;
        }

        Stop();
        enumerator.Dispose();
        disposed = true;
    }
}
