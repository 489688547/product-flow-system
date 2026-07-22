const AI_USAGE_URL = "/api/platform/v1/ai/usage";

async function responsePayload(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(payload.error?.message || payload.message || "AI 使用统计加载失败。"), {
      status: response.status,
      code: payload.error?.code || "AI_USAGE_REQUEST_FAILED",
      requestId: payload.error?.requestId || "",
      retryable: Boolean(payload.error?.retryable)
    });
  }
  return payload;
}

export async function loadAiUsage(range, fetchImpl = fetch, signal) {
  const search = new URLSearchParams({ from: range.from, to: range.to });
  const response = await fetchImpl(`${AI_USAGE_URL}?${search}`, {
    credentials: "include",
    headers: { accept: "application/json" },
    signal
  });
  return responsePayload(response);
}
