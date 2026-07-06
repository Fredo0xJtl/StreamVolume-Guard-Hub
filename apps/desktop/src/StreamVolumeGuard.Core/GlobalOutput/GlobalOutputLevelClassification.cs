namespace StreamVolumeGuard.Core.GlobalOutput;

public sealed record GlobalOutputLevelClassification(
    GlobalOutputState State,
    bool IsClippingPossible,
    string Reason);
