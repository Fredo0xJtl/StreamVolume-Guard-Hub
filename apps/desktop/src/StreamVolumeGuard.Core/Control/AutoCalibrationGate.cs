using StreamVolumeGuard.Core.Audio;
using StreamVolumeGuard.Core.Normalization;

namespace StreamVolumeGuard.Core.Control;

public sealed record AutoCalibrationGateSettings(
    TimeSpan ResetAfterSilence,
    float SilencePeakLevel)
{
    public static AutoCalibrationGateSettings StreamDefault { get; } = new(
        ResetAfterSilence: TimeSpan.FromSeconds(6),
        SilencePeakLevel: 0.02f);
}

public sealed class AutoCalibrationGate
{
    public const string LockedReason = "auto-calibration-locked";
    public const string SilentReason = "source-silent";

    private readonly AutoCalibrationGateSettings settings;
    private readonly Dictionary<string, SessionCalibrationState> states = new(StringComparer.OrdinalIgnoreCase);

    public AutoCalibrationGate(AutoCalibrationGateSettings settings)
    {
        this.settings = settings;
    }

    public VolumeDecision Evaluate(AudioSessionSnapshot session, VolumeDecision decision, DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(session.SessionId))
        {
            return decision;
        }

        var currentVolume = Clamp(session.VolumeScalar, 0.0f, 1.0f);
        var isSilent = IsSilent(session);
        var state = GetState(session.SessionId);

        if (!decision.ShouldApplyVolume)
        {
            TrackSilenceForReset(state, isSilent, now);
            return decision;
        }

        if (isSilent)
        {
            state.QuietSinceUtc ??= now;

            if (state.HasApplied && now - state.QuietSinceUtc < settings.ResetAfterSilence)
            {
                return decision with
                {
                    ShouldApplyVolume = false,
                    TargetVolumeScalar = currentVolume,
                    Reason = LockedReason
                };
            }

            state.HasApplied = false;
            return decision with
            {
                Status = AudioSessionStatus.Safe,
                ShouldApplyVolume = false,
                TargetVolumeScalar = currentVolume,
                Reason = SilentReason
            };
        }

        state.QuietSinceUtc = null;
        if (state.HasApplied)
        {
            return decision with
            {
                ShouldApplyVolume = false,
                TargetVolumeScalar = currentVolume,
                Reason = LockedReason
            };
        }

        return decision;
    }

    private void TrackSilenceForReset(SessionCalibrationState state, bool isSilent, DateTimeOffset now)
    {
        if (!state.HasApplied)
        {
            if (!isSilent)
            {
                state.QuietSinceUtc = null;
            }

            return;
        }

        if (!isSilent)
        {
            state.QuietSinceUtc = null;
            return;
        }

        state.QuietSinceUtc ??= now;
        if (now - state.QuietSinceUtc >= settings.ResetAfterSilence)
        {
            state.HasApplied = false;
        }
    }

    public void RecordApplied(AudioSessionSnapshot session, DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(session.SessionId))
        {
            return;
        }

        var state = GetState(session.SessionId);
        state.HasApplied = true;
        state.QuietSinceUtc = IsSilent(session) ? now : null;
    }

    public void RemoveMissing(IEnumerable<string> currentSessionIds)
    {
        var current = currentSessionIds.ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var sessionId in states.Keys.ToArray())
        {
            if (!current.Contains(sessionId))
            {
                states.Remove(sessionId);
            }
        }
    }

    public void Clear()
    {
        states.Clear();
    }

    private SessionCalibrationState GetState(string sessionId)
    {
        if (!states.TryGetValue(sessionId, out var state))
        {
            state = new SessionCalibrationState();
            states[sessionId] = state;
        }

        return state;
    }

    private bool IsSilent(AudioSessionSnapshot session)
    {
        return Clamp(session.PeakLevel, 0.0f, 1.0f) <= settings.SilencePeakLevel;
    }

    private static float Clamp(float value, float min, float max)
    {
        if (float.IsNaN(value) || float.IsInfinity(value)) return min;
        if (value < min) return min;
        if (value > max) return max;
        return value;
    }

    private sealed class SessionCalibrationState
    {
        public bool HasApplied { get; set; }
        public DateTimeOffset? QuietSinceUtc { get; set; }
    }
}
