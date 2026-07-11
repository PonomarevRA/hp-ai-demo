public sealed record ReportChatRequest(string Question, string Context, string Screen);

public sealed record ReportChatResponse(string Answer, string ModelId, string Source);
