using StreamVolumeGuard.Core.Audio;
using StreamVolumeGuard.Core.Normalization;

namespace StreamVolumeGuard.Core.Control;

public sealed record AutoCalibrationGateSettings(
    TimeSpan ResetAfterSilence,
    float SilencePeakLevel,
    float SafetySpikePeakLevel = 0.80f,
    TimeSpan? SafetySpikeMinAge = null)
{
    public static AutoCalibrationGateSettings StreamDefault { get; } = new(
        ResetAfterSilence: TimeSpan.FromSeconds(6),
        SilencePeakLevel: 0.02f,
        SafetySpikePeakLevel: 0.80f,
        SafetySpikeMinAge: TimeSpan.FromSeconds(3));
}

public sealed class AutoCalibrationGate
{
    public const string LockedReason = "auto-calibration-locked";
    public const string SilentReason = "source-silent";
    public const string SafetySpikeReason = "safety-spike";

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
            if (!state.HasSafetyApplied && IsSafetySpike(state, session, decision, currentVolume, now))
            {
                return decision with
                {
                    Reason = SafetySpikeReason
                };
            }

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
            state.HasSafetyApplied = false;
            state.LastAppliedUtc = null;
        }
    }

    public void RecordApplied(AudioSessionSnapshot session, DateTimeOffset now, bool usedSafetyBypass = false)
    {
        if (string.IsNullOrWhiteSpace(session.SessionId))
        {
            return;
        }

        var state = GetState(session.SessionId);
        state.HasApplied = true;
        state.LastAppliedUtc = now;
        if (usedSafetyBypass)
        {
            state.HasSafetyApplied = true;
        }

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

    private bool IsSafetySpike(SessionCalibrationState state, AudioSessionSnapshot session, VolumeDecision decision, float currentVolume, DateTimeOffset now)
    {
        var minAge = settings.SafetySpikeMinAge ?? TimeSpan.FromSeconds(3);
        return decision.Status == AudioSessionStatus.Risky
            && state.LastAppliedUtc.HasValue
            && now - state.LastAppliedUtc.Value >= minAge
            && Clamp(session.PeakLevel, 0.0f, 1.0f) >= settings.SafetySpikePeakLevel
            && decision.TargetVolumeScalar < currentVolume;
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
        public bool HasSafetyApplied { get; set; }
        public DateTimeOffset? LastAppliedUtc { get; set; }
        public DateTimeOffset? QuietSinceUtc { get; set; }
    }
}
