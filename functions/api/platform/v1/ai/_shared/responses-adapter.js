const TIMEOUT_MS = 45_000;

function aiError(code, message, status, retryable) {
  return Object.assign(new Error(message), { code, status, retryable });
}

function providerError(status) {
  if (status === 401 || status === 403) return aiError("AI_PROVIDER_AUTH_FAILED", "模型服务认证失败。", 502, false);
  if (status === 429) return aiError("AI_PROVIDER_RATE_LIMITED", "模型服务请求过多，请稍后手动重试。", 429, true);
  return aiError("AI_PROVIDER_UNAVAILABLE", "模型服务暂不可用。", 502, status >= 500);
}

export function responsesRequest(config, input, { tools = [], toolChoice = "auto" } = {}) {
  if (!config?.secretConfigured) {
    throw aiError("AI_PROVIDER_SECRET_MISSING", "模型服务尚未配置新的服务端密钥。", 503, false);
  }
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${config.apiKey}`
  };
  if (config.actorAuthorization) headers["x-openai-actor-authorization"] = config.actorAuthorization;
  const payload = {
    model: config.model,
    input,
    reasoning: { effort: config.reasoningEffort },
    max_output_tokens: 2000,
    store: false,
    stream: true
  };
  if (Array.isArray(tools) && tools.length > 0) {
    payload.tools = tools;
    payload.tool_choice = toolChoice;
  }
  const body = JSON.stringify(payload);
  return {
    url: config.endpoint,
    init: { method: "POST", headers, body },
    body
  };
}

function parseFrame(frame) {
  const lines = frame.replaceAll("\r\n", "\n").split("\n");
  const event = lines.find(line => line.startsWith("event:"))?.slice(6).trim() || "message";
  const dataText = lines.filter(line => line.startsWith("data:"))
    .map(line => line.slice(5).trimStart())
    .join("\n");
  if (!dataText || dataText === "[DONE]") return null;
  try {
    return { event, data: JSON.parse(dataText) };
  } catch {
    return null;
  }
}

async function* parseSse(body) {
  if (!body?.getReader) throw aiError("AI_PROVIDER_STREAM_FAILED", "模型服务返回了无效响应。", 502, true);
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done }).replaceAll("\r\n", "\n");
      const frames = buffer.split("\n\n");
      buffer = frames.pop() || "";
      for (const rawFrame of frames) {
        const parsed = parseFrame(rawFrame);
        if (parsed) yield parsed;
      }
      if (done) {
        const parsed = parseFrame(buffer);
        if (parsed) yield parsed;
        break;
      }
    }
  } catch (error) {
    if (error?.code) throw error;
    throw aiError("AI_PROVIDER_STREAM_FAILED", "模型服务响应流意外中断。", 502, true);
  } finally {
    reader.releaseLock?.();
  }
}

function requestSignal(signal, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener?.("abort", abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("Timeout", "TimeoutError"));
  }, timeoutMs);
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose() {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", abort);
    }
  };
}

function outputItemKey(item = {}) {
  return String(item.id || item.call_id || "");
}

function outputItemEvents(item) {
  if (!item || typeof item !== "object") return [];
  if (!["function_call", "reasoning", "message"].includes(item.type)) return [];
  const events = [{ type: "output_item", item }];
  if (item.type === "function_call") {
    events.push({
      type: "function_call",
      callId: String(item.call_id || ""),
      name: String(item.name || ""),
      arguments: typeof item.arguments === "string" ? item.arguments : "",
      item
    });
  }
  return events;
}

export async function* streamProviderResponse({ config, input, tools = [], toolChoice = "auto", fetchImpl = fetch, signal, timeoutMs = TIMEOUT_MS } = {}) {
  const request = responsesRequest(config, input, { tools, toolChoice });
  const managedSignal = requestSignal(signal, timeoutMs);
  const emittedItems = new Set();
  try {
    let response;
    try {
      response = await fetchImpl(request.url, { ...request.init, signal: managedSignal.signal });
    } catch (error) {
      const timedOut = managedSignal.timedOut() || error?.name === "TimeoutError";
      throw aiError(
        timedOut ? "AI_PROVIDER_TIMEOUT" : "AI_PROVIDER_UNAVAILABLE",
        timedOut ? "模型服务响应超时。" : "模型服务连接失败。",
        502,
        true
      );
    }
    if (!response.ok) throw providerError(response.status);
    for await (const frame of parseSse(response.body)) {
      if (frame.event === "response.output_text.delta" && typeof frame.data.delta === "string") {
        yield { type: "text_delta", delta: frame.data.delta };
      } else if (frame.event === "response.output_item.done") {
        const item = frame.data.item;
        const key = outputItemKey(item);
        if (key) emittedItems.add(key);
        for (const event of outputItemEvents(item)) yield event;
      } else if (frame.event === "response.completed") {
        for (const item of frame.data.response?.output || []) {
          const key = outputItemKey(item);
          if (key && emittedItems.has(key)) continue;
          if (key) emittedItems.add(key);
          for (const event of outputItemEvents(item)) yield event;
        }
        const usage = frame.data.response?.usage || frame.data.usage || {};
        yield {
          type: "usage",
          inputTokens: Number(usage.input_tokens) || 0,
          outputTokens: Number(usage.output_tokens) || 0
        };
      } else if (frame.event === "response.failed" || frame.event === "error") {
        throw aiError("AI_PROVIDER_STREAM_FAILED", "模型服务未完成回答。", 502, true);
      }
    }
  } finally {
    managedSignal.dispose();
  }
}

const SYNTHETIC_STATUS_TOOL = Object.freeze({
  type: "function",
  name: "lookup_status",
  description: "读取合成状态",
  parameters: Object.freeze({ type: "object", properties: Object.freeze({}), required: Object.freeze([]), additionalProperties: false }),
  strict: true
});

export async function testProviderSkillConnection({ config, fetchImpl = fetch } = {}) {
  const started = Date.now();
  const checkedAt = new Date().toISOString();
  try {
    const input = [{ role: "user", content: "调用 lookup_status 获取合成状态，然后只返回 ok" }];
    const outputItems = [];
    const calls = [];
    for await (const event of streamProviderResponse({
      config,
      input,
      tools: [SYNTHETIC_STATUS_TOOL],
      toolChoice: { type: "function", name: SYNTHETIC_STATUS_TOOL.name },
      fetchImpl
    })) {
      if (event.type === "output_item") outputItems.push(event.item);
      if (event.type === "function_call") calls.push(event);
    }
    if (calls.length !== 1 || calls[0].name !== SYNTHETIC_STATUS_TOOL.name || !calls[0].callId) {
      throw aiError("AI_PROVIDER_SKILLS_UNSUPPORTED", "模型服务未完成 Skill 能力测试。", 502, false);
    }
    let argumentsValue;
    try {
      argumentsValue = JSON.parse(calls[0].arguments || "{}");
    } catch {
      throw aiError("AI_PROVIDER_INVALID_TOOL_ARGUMENTS", "模型服务返回了无效的 Skill 参数。", 502, false);
    }
    if (!argumentsValue || Array.isArray(argumentsValue) || typeof argumentsValue !== "object" || Object.keys(argumentsValue).length > 0) {
      throw aiError("AI_PROVIDER_INVALID_TOOL_ARGUMENTS", "模型服务返回了无效的 Skill 参数。", 502, false);
    }
    let text = "";
    for await (const event of streamProviderResponse({
      config,
      input: [...input, ...outputItems, { type: "function_call_output", call_id: calls[0].callId, output: JSON.stringify({ ok: true }) }],
      tools: [SYNTHETIC_STATUS_TOOL],
      toolChoice: "none",
      fetchImpl
    })) {
      if (event.type === "text_delta") text += event.delta;
    }
    if (!/ok/i.test(text)) throw aiError("AI_PROVIDER_INVALID_RESPONSE", "模型服务未返回预期测试结果。", 502, true);
    return { supported: true, latencyMs: Date.now() - started, checkedAt, statusCode: 200 };
  } catch (error) {
    return {
      supported: false,
      latencyMs: Date.now() - started,
      checkedAt,
      statusCode: error.status || 502,
      error: {
        code: error.code || "AI_PROVIDER_SKILLS_UNSUPPORTED",
        message: error.message || "模型服务暂不支持 Skills。",
        retryable: Boolean(error.retryable)
      }
    };
  }
}

export async function testProviderConnection({ config, fetchImpl = fetch } = {}) {
  const started = Date.now();
  try {
    let text = "";
    for await (const event of streamProviderResponse({
      config,
      input: [{ role: "user", content: "返回 ok" }],
      fetchImpl
    })) {
      if (event.type === "text_delta") text += event.delta;
    }
    if (!/ok/i.test(text)) throw aiError("AI_PROVIDER_INVALID_RESPONSE", "模型服务未返回预期测试结果。", 502, true);
    return {
      connected: true,
      model: config.model,
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
      statusCode: 200
    };
  } catch (error) {
    return {
      connected: false,
      model: config?.model || "",
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
      statusCode: error.status || 502,
      error: {
        code: error.code || "AI_PROVIDER_UNAVAILABLE",
        message: error.message || "模型服务暂不可用。",
        retryable: Boolean(error.retryable)
      }
    };
  }
}
