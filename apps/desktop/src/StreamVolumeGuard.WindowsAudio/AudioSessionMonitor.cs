using System.Diagnostics;
using NAudio.CoreAudioApi;
using StreamVolumeGuard.Core.Audio;

namespace StreamVolumeGuard.WindowsAudio;

public sealed class AudioSessionMonitor
{
    public IReadOnlyList<WindowsAudioSession> ReadSessions(IEnumerable<MMDevice> endpoints, DateTimeOffset now)
    {
        var sessions = new List<WindowsAudioSession>();

        foreach (var endpoint in endpoints)
        {
            var manager = endpoint.AudioSessionManager;
            var sessionCollection = manager.Sessions;

            for (var index = 0; index < sessionCollection.Count; index++)
            {
                var session = sessionCollection[index];
                var snapshot = ToSnapshot(endpoint, session, now);
                sessions.Add(new WindowsAudioSession(snapshot, volume => session.SimpleAudioVolume.Volume = Clamp(volume)));
            }
        }

        return sessions;
    }

    private static AudioSessionSnapshot ToSnapshot(MMDevice endpoint, AudioSessionControl session, DateTimeOffset now)
    {
        var processId = TryGetProcessId(session);
        var processName = TryGetProcessName(processId);
        var displayName = PickDisplayName(session.DisplayName, processName, processId);
        var isControllable = session.SimpleAudioVolume is not null;

        return new AudioSessionSnapshot(
            SessionId: BuildSessionId(endpoint.ID, session.GetSessionInstanceIdentifier),
            DeviceId: endpoint.ID,
            DisplayName: displayName,
            ProcessName: processName,
            ProcessId: processId,
            PeakLevel: ReadPeak(session),
            VolumeScalar: ReadVolume(session),
            IsMuted: session.SimpleAudioVolume?.Mute ?? false,
            IsSystemSession: SafeIsSystemSession(session),
            IsControllable: isControllable,
            LastManualChangeUtc: null,
            IsExcluded: false,
            SeenAtUtc: now);
    }

    private static string BuildSessionId(string endpointId, string instanceId)
    {
        return $"{endpointId}|{instanceId}";
    }

    private static int? TryGetProcessId(AudioSessionControl session)
    {
        try
        {
            var pid = session.GetProcessID;
            return pid == 0 ? null : (int)pid;
        }
        catch
        {
            return null;
        }
    }

    private static string? TryGetProcessName(int? processId)
    {
        if (processId is null) return null;

        try
        {
            using var process = Process.GetProcessById(processId.Value);
            return process.ProcessName;
        }
        catch
        {
            return null;
        }
    }

    private static string PickDisplayName(string? displayName, string? processName, int? processId)
    {
        if (!string.IsNullOrWhiteSpace(displayName)) return displayName;
        if (!string.IsNullOrWhiteSpace(processName)) return processName;
        return processId is null ? "Session inconnue" : $"Processus {processId}";
    }

    private static float ReadPeak(AudioSessionControl session)
    {
        try
        {
            return Clamp(session.AudioMeterInformation?.MasterPeakValue ?? 0.0f);
        }
        catch
        {
            return 0.0f;
        }
    }

    private static float ReadVolume(AudioSessionControl session)
    {
        try
        {
            return Clamp(session.SimpleAudioVolume?.Volume ?? 0.0f);
        }
        catch
        {
            return 0.0f;
        }
    }

    private static bool SafeIsSystemSession(AudioSessionControl session)
    {
        try
        {
            return session.IsSystemSoundsSession;
        }
        catch
        {
            return false;
        }
    }

    private static float Clamp(float value)
    {
        if (float.IsNaN(value) || float.IsInfinity(value)) return 0.0f;
        if (value < 0.0f) return 0.0f;
        if (value > 1.0f) return 1.0f;
        return value;
    }
}
