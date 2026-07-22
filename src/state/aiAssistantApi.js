const KNOWN_EVENTS = new Set(["meta", "text_delta", "sources", "usage", "skill_started", "skill_completed", "skill_failed", "error", "done"]);
const SAFE_ERROR_MESSAGES = Object.freeze({
  AI_SESSION_REQUIRED: "请先使用钉钉登录。",
  AI_PROVIDER_MANAGE_DENIED: "仅总经办可维护 AI 模型服务。",
  AI_PROVIDER_TEST_DENIED: "仅总经办可测试 AI 模型服务。",
  AI_PROVIDER_SECRET_MISSING: "请先在 AI 大模型的模型与安全设置中配置灵算凭据。",
  AI_PROVIDER_NOT_READY: "模型服务尚未准备好。",
  AI_PROVIDER_AUTH_FAILED: "模型服务认证失败，请检查公司级连接。",
  AI_PROVIDER_RATE_LIMITED: "模型服务请求较多，请稍后重试。",
  AI_PROVIDER_TIMEOUT: "模型服务响应超时，请稍后重试。",
  AI_PROVIDER_UNAVAILABLE: "模型服务暂不可用，请稍后重试。",
  AI_MESSAGES_INVALID: "请输入有效的问题。",
  AI_FINANCE_TRANSFER_BLOCKED: "财务数据暂不允许发送给第三方模型。"
});

async function jsonPayload(response, fallback) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = body.error?.code || "AI_REQUEST_FAILED";
    throw Object.assign(new Error(SAFE_ERROR_MESSAGES[code] || fallback), {
      status: response.status,
      code,
      requestId: body.error?.requestId,
      retryable: Boolean(body.error?.retryable)
    });
  }
  return body;
}

export async function loadAiStatus(fetchImpl = fetch) {
  return jsonPayload(await fetchImpl("/api/platform/v1/ai/status"), "AI 总助状态加载失败。");
}

export async function loadAiProvider(fetchImpl = fetch) {
  return jsonPayload(await fetchImpl("/api/platform/v1/ai/provider"), "模型服务状态加载失败。");
}

export async function saveAiProvider(provider, fetchImpl = fetch) {
  return jsonPayload(await fetchImpl("/api/platform/v1/ai/provider", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      providerId: provider.providerId,
      model: provider.model,
      reasoningEffort: provider.reasoningEffort,
      enabled: provider.enabled
    })
  }), "模型服务保存失败。");
}

export async function testAiProvider(fetchImpl = fetch) {
  return jsonPayload(await fetchImpl("/api/platform/v1/ai/provider/test", { method: "POST" }), "模型服务连接测试失败。");
}

function parseFrame(frame) {
  const lines = frame.replaceAll("\r\n", "\n").split("\n");
  const type = lines.find(line => line.startsWith("event:"))?.slice(6).trim();
  if (!KNOWN_EVENTS.has(type)) return null;
  const raw = lines.filter(line => line.startsWith("data:"))
    .map(line => line.slice(5).trimStart())
    .join("\n");
  try {
    return { type, ...JSON.parse(raw) };
  } catch {
    return null;
  }
}

export async function* parseAiSse(stream) {
  if (!stream?.getReader) throw new Error("AI 总助返回了无效响应流。");
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done }).replaceAll("\r\n", "\n");
      const frames = buffer.split("\n\n");
      buffer = frames.pop() || "";
      for (const frame of frames) {
        const parsed = parseFrame(frame);
        if (parsed) yield parsed;
      }
      if (done) {
        const parsed = parseFrame(buffer);
        if (parsed) yield parsed;
        break;
      }
    }
  } finally {
    reader.releaseLock?.();
  }
}

export async function sendAiChat({ messages, appHint, signal, fetchImpl = fetch, onEvent = () => {} }) {
  const response = await fetchImpl("/api/platform/v1/ai/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages, appHint }),
    signal
  });
  if (!response.ok) return jsonPayload(response, "AI 总助暂不可用。");
  for await (const event of parseAiSse(response.body)) onEvent(event);
  return undefined;
}
