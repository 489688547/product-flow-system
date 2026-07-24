import { normalizeBacklogDraft } from "../../../../../src/domain/developmentBacklog.js";
import { invokeAiFeature } from "../ai/_shared/invoke-feature.js";
import { BacklogHttpError, errorResponse, jsonResponse, methodNotAllowed, optionsResponse, readJson, requireSession } from "./_shared/http.js";

const CONFIGURATION_ERROR_CODES = new Set([
  "AI_DISABLED",
  "AI_PROVIDER_NOT_READY",
  "AI_PROVIDER_SECRET_MISSING"
]);
const RETRYABLE_ERROR_CODES = new Set([
  "AI_PROVIDER_TIMEOUT",
  "AI_PROVIDER_RATE_LIMITED",
  "AI_PROVIDER_UNAVAILABLE"
]);

const SYSTEM_INSTRUCTION = `你是公司研发需求分析助手。把用户描述整理成一个研发待办 JSON 对象，不输出 Markdown 或解释。
只允许字段：title、background、moduleId、priority、acceptanceCriteria、scopePaths、dependencyIds。
moduleId 只能是 company-platform、data-center、data-acquisition、ai-platform、ecommerce-operations、product-lifecycle、supply-chain、brand-content、hr-performance。
priority 只能是 p0、p1、p2、p3。scopePaths 只能写仓库相对路径；不确定时返回空数组。验收标准必须可验证。`;

function aiDraftError(code, message, status = 502, retryable = false) {
  return Object.assign(new Error(message), { code, status, retryable });
}

function descriptionInput(value) {
  const description = String(value || "").trim();
  if (description.length < 2 || description.length > 8_000) {
    throw new BacklogHttpError(400, "BACKLOG_INPUT_INVALID", "请输入 2 至 8000 字的需求描述。");
  }
  return description;
}

export function parseBacklogDraftText(value) {
  const text = String(value || "").trim();
  const unfenced = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const firstBrace = unfenced.indexOf("{");
  const lastBrace = unfenced.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw aiDraftError("BACKLOG_AI_DRAFT_INVALID", "AI 没有返回有效的结构化草稿。", 502, true);
  }
  let parsed;
  try {
    parsed = JSON.parse(unfenced.slice(firstBrace, lastBrace + 1));
  } catch {
    throw aiDraftError("BACKLOG_AI_DRAFT_INVALID", "AI 草稿格式无效，请重新生成。", 502, true);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw aiDraftError("BACKLOG_AI_DRAFT_INVALID", "AI 草稿格式无效，请重新生成。", 502, true);
  }
  return normalizeBacklogDraft({ ...parsed, sourceType: "ai_assistant" });
}

function mapAiFailure(error) {
  const code = String(error?.code || "");
  if (CONFIGURATION_ERROR_CODES.has(code)) {
    return aiDraftError(code, "公司 AI 尚未配置，请先前往 AI 大模型完成设置。", Number(error.status) || 503, false);
  }
  if (RETRYABLE_ERROR_CODES.has(code)) {
    return aiDraftError(code, "AI 服务暂时不可用，请稍后重新生成。", Number(error.status) || 502, true);
  }
  return error;
}

export async function runBacklogDraft({
  env = {},
  data = {},
  session,
  description,
  invoke = invokeAiFeature
} = {}) {
  const input = descriptionInput(description);
  try {
    const result = await invoke({
      env,
      data,
      session,
      appId: "company-platform",
      featureId: "development-backlog-draft",
      systemInstruction: SYSTEM_INSTRUCTION,
      userInput: input,
      timeoutMs: 20_000
    });
    return {
      mode: result.mode,
      draft: parseBacklogDraftText(result.text)
    };
  } catch (error) {
    throw mapAiFailure(error);
  }
}

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return methodNotAllowed();
  try {
    const session = requireSession(data);
    const body = await readJson(request);
    const result = await runBacklogDraft({
      env,
      data,
      session,
      description: body.description
    });
    return jsonResponse({ synced: true, ...result });
  } catch (error) {
    return errorResponse(error, "BACKLOG_AI_DRAFT_FAILED");
  }
}
