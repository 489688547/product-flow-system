import { streamProviderResponse } from "./responses-adapter.js";

const MAX_SKILL_ROUNDS = 2;
const MAX_SKILL_CALLS = 6;

function loopError(code, message) {
  return Object.assign(new Error(message), { code, status: 502, retryable: false });
}

function parsedArguments(argumentsText) {
  try {
    const value = JSON.parse(argumentsText || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]));
}

function callSummary(call) {
  const parsed = parsedArguments(call.arguments);
  return {
    argumentSummary: parsed ? Object.keys(parsed).sort().slice(0, 20) : [],
    dedupeKey: `${call.name}:${parsed ? JSON.stringify(sorted(parsed)) : String(call.arguments || "").slice(0, 500)}`
  };
}

function safeExecutionError(error) {
  return {
    code: String(error?.code || "AI_SKILL_FAILED").startsWith("AI_") ? error.code : "AI_SKILL_FAILED",
    message: String(error?.message || "Skill 查询失败。").slice(0, 160),
    retryable: Boolean(error?.retryable)
  };
}

async function notify(onEvent, event) {
  if (typeof onEvent === "function") await onEvent(event);
}

export async function* runSkillLoop({ config, input = [], tools = [], execute, fetchImpl = fetch, signal, onEvent } = {}) {
  if (typeof execute !== "function") throw loopError("AI_SKILL_EXECUTOR_MISSING", "公司只读 Skill 执行器未配置。");
  let nextInput = [...input];
  let skillRounds = 0;
  let totalCalls = 0;
  let usage = { inputTokens: 0, outputTokens: 0 };
  const seenCalls = new Set();

  while (true) {
    const outputItems = [];
    const calls = [];
    const text = [];
    for await (const event of streamProviderResponse({ config, input: nextInput, tools, fetchImpl, signal })) {
      if (event.type === "output_item") outputItems.push(event.item);
      if (event.type === "function_call") calls.push(event);
      if (event.type === "text_delta") text.push(event.delta);
      if (event.type === "usage") {
        usage = {
          inputTokens: usage.inputTokens + event.inputTokens,
          outputTokens: usage.outputTokens + event.outputTokens
        };
      }
    }

    if (!calls.length) {
      for (const delta of text) yield { type: "text_delta", delta };
      yield { type: "usage", ...usage };
      return;
    }
    if (skillRounds >= MAX_SKILL_ROUNDS) {
      throw loopError("AI_SKILL_LOOP_LIMIT", "AI 多次重复查询，已停止本次回答。");
    }
    skillRounds += 1;
    const functionOutputs = [];

    for (const call of calls) {
      totalCalls += 1;
      if (totalCalls > MAX_SKILL_CALLS) throw loopError("AI_SKILL_CALL_LIMIT", "AI 查询次数超过单次回答上限。");
      const startedAt = Date.now();
      const summary = callSummary(call);
      const common = {
        callId: call.callId,
        skillId: call.name,
        argumentSummary: summary.argumentSummary,
        round: skillRounds
      };
      if (seenCalls.has(summary.dedupeKey)) {
        const duplicate = { code: "AI_SKILL_DUPLICATE", message: "相同 Skill 查询已执行，本次不重复读取。", retryable: false };
        await notify(onEvent, { type: "skill_failed", ...common, ...duplicate, latencyMs: Date.now() - startedAt });
        functionOutputs.push({
          type: "function_call_output",
          call_id: call.callId,
          output: JSON.stringify({ ok: false, error: duplicate })
        });
        continue;
      }
      seenCalls.add(summary.dedupeKey);
      await notify(onEvent, { type: "skill_started", ...common });
      try {
        const result = await execute({ skillId: call.name, argumentsText: call.arguments, callId: call.callId, signal });
        const latencyMs = Date.now() - startedAt;
        await notify(onEvent, { type: "skill_completed", ...common, result, latencyMs });
        functionOutputs.push({
          type: "function_call_output",
          call_id: call.callId,
          output: JSON.stringify({ ok: true, data: result })
        });
      } catch (error) {
        const safe = safeExecutionError(error);
        await notify(onEvent, { type: "skill_failed", ...common, ...safe, latencyMs: Date.now() - startedAt });
        functionOutputs.push({
          type: "function_call_output",
          call_id: call.callId,
          output: JSON.stringify({ ok: false, error: safe })
        });
      }
    }
    nextInput = [...nextInput, ...outputItems, ...functionOutputs];
  }
}
