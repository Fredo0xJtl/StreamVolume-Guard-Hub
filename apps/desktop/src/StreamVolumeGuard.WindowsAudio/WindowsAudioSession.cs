using StreamVolumeGuard.Core.Audio;

namespace StreamVolumeGuard.WindowsAudio;

public sealed record WindowsAudioSession(AudioSessionSnapshot Snapshot, Action<float> SetVolume);
