public sealed record AiModelStatus(
    bool Ready,
    string Phase,
    string Message,
    string ModelId,
    long? Bytes = null,
    long? ExpectedBytes = null);
