const AI_USAGE_URL = "/api/platform/v1/ai/usage";
const SAFE_ERROR_MESSAGES = Object.freeze({
  AI_SESSION_REQUIRED: "请先使用钉钉登录。",
  AI_USAGE_ACCESS_DENIED: "当前账号没有数据中心查看权限。",
  AI_USAGE_RANGE_INVALID: "请选择完整且不超过 366 天的有效日期范围。",
  AI_STORAGE_UNAVAILABLE: "AI 使用统计暂不可用。",
  AI_USAGE_QUERY_FAILED: "AI 使用统计加载失败。"
});

async function responsePayload(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = payload.error?.code || "AI_USAGE_REQUEST_FAILED";
    throw Object.assign(new Error(SAFE_ERROR_MESSAGES[code] || "AI 使用统计加载失败，请稍后重试。"), {
      status: response.status,
      code,
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
