namespace StreamVolumeGuard.Core.GlobalOutput;

public sealed record GlobalOutputMeasurement(
    double Rms,
    double Peak,
    double RmsDb,
    double PeakDb);
