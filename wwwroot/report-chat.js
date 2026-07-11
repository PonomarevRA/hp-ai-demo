function trackChat(action, params) {
  if (window.MetrikaSPA?.trackReportChat) {
    window.MetrikaSPA.trackReportChat(action, params);
  }
}

export async function fetchModelStatus() {
  const response = await fetch("/api/ai-model/status");
  if (!response.ok) {
    throw new Error("Не удалось проверить статус ONNX-модели на сервере.");
  }
  return response.json();
}

export async function askReportChat({ question, context, screen }) {
  trackChat("ask_start", { screen, question_length: question.length });
  const startedAt = performance.now();

  const response = await fetch("/api/report-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, context, screen }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    trackChat("error", { screen, message: String(payload.error || response.statusText) });
    throw new Error(payload.error || "Не удалось получить ответ от ONNX-модели на сервере.");
  }

  trackChat("ask_success", {
    screen,
    question_length: question.length,
    answer_length: String(payload.answer || "").length,
    duration_ms: Math.round(performance.now() - startedAt),
  });

  return payload.answer || "";
}
