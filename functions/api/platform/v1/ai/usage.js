import { canViewDataCenter } from "../../../data-center/_shared/access.js";
import { listAiFeatureDefinitions } from "./_shared/feature-registry.js";
import { listAiSkillMetadata } from "./_shared/skill-registry.js";

const DAY_MS = 86_400_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function requestId() {
  return globalThis.crypto?.randomUUID?.() || `req_${Date.now().toString(36)}`;
}

function response(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
      ...extraHeaders
    }
  });
}

function errorResponse(message, status, code, retryable = false, id = requestId()) {
  return response({ message, error: { code, message, requestId: id, retryable } }, status);
}

function parseDateOnly(value) {
  const text = String(value || "").trim();
  if (!DATE_PATTERN.test(text)) return null;
  const [year, month, day] = text.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;
  return { text, utcMs: utc.getTime() };
}

function usageRange(url) {
  const from = parseDateOnly(url.searchParams.get("from"));
  const to = parseDateOnly(url.searchParams.get("to"));
  const days = from && to ? Math.floor((to.utcMs - from.utcMs) / DAY_MS) + 1 : 0;
  if (!from || !to || days < 1 || days > 366) {
    throw Object.assign(new Error("请选择完整且不超过 366 天的有效日期范围。"), {
      code: "AI_USAGE_RANGE_INVALID",
      status: 400,
      retryable: false
    });
  }
  return {
    from: from.text,
    to: to.text,
    startUtc: new Date(Date.parse(`${from.text}T00:00:00+08:00`)).toISOString(),
    endExclusiveUtc: new Date(Date.parse(`${to.text}T00:00:00+08:00`) + DAY_MS).toISOString()
  };
}

function number(value) {
  return Math.max(0, Number(value) || 0);
}

function safeText(value, maxLength = 120) {
  return String(value || "").slice(0, maxLength);
}

function ratio(successful, calls) {
  return calls > 0 ? successful / calls : null;
}

function featureLabel(feature, row = {}) {
  const providerCalls = number(row.provider_calls);
  const successfulCalls = number(row.successful_calls);
  const inputTokens = number(row.input_tokens);
  const outputTokens = number(row.output_tokens);
  return {
    appId: feature.appId,
    appName: feature.appName,
    featureId: feature.featureId,
    featureName: feature.featureName,
    providerId: safeText(row.provider_id, 80),
    model: safeText(row.model),
    providerCalls,
    successfulCalls,
    successRate: ratio(successfulCalls, providerCalls),
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    fallbackRuns: number(row.fallback_runs),
    lastUsedAt: safeText(row.last_used_at, 40),
    historyNote: feature.historyNote || ""
  };
}

function unknownFeature(row) {
  const appId = safeText(row.app_id, 80) || "unknown";
  const featureId = safeText(row.feature_id, 80) || "unknown";
  return {
    appId,
    appName: appId,
    featureId,
    featureName: featureId,
    historyNote: ""
  };
}

function buildFeatures(rows = []) {
  const definitions = listAiFeatureDefinitions();
  const definitionsByKey = new Map(definitions.map(item => [`${item.appId}:${item.featureId}`, item]));
  const seen = new Set();
  const features = rows.map(row => {
    const key = `${safeText(row.app_id, 80)}:${safeText(row.feature_id, 80)}`;
    seen.add(key);
    return featureLabel(definitionsByKey.get(key) || unknownFeature(row), row);
  });
  for (const definition of definitions) {
    const key = `${definition.appId}:${definition.featureId}`;
    if (!seen.has(key)) features.push(featureLabel(definition));
  }
  return features.sort((left, right) => right.totalTokens - left.totalTokens
    || right.providerCalls - left.providerCalls
    || left.appName.localeCompare(right.appName, "zh-CN")
    || left.model.localeCompare(right.model));
}

function buildSkills(rows = []) {
  const metadata = new Map(listAiSkillMetadata().map(item => [item.skillId, item]));
  const featureMetadata = new Map(listAiFeatureDefinitions().map(item => [`${item.appId}:${item.featureId}`, item]));
  return rows.map(row => {
    const callerAppId = safeText(row.caller_app_id, 80) || "unknown";
    const callerFeatureId = safeText(row.caller_feature_id, 80) || "unknown";
    const skillId = safeText(row.skill_id);
    const feature = featureMetadata.get(`${callerAppId}:${callerFeatureId}`);
    const skill = metadata.get(skillId);
    return {
      callerAppId,
      callerAppName: feature?.appName || callerAppId,
      callerFeatureId,
      callerFeatureName: feature?.featureName || callerFeatureId,
      sourceAppId: safeText(row.source_app_id, 80) || skill?.sourceAppId || "unknown",
      skillId,
      skillName: skill?.skillName || skillId,
      calls: number(row.calls),
      successes: number(row.successes),
      failures: number(row.failures),
      resultCount: number(row.result_count),
      lastUsedAt: safeText(row.last_used_at, 40)
    };
  }).sort((left, right) => right.calls - left.calls || left.skillName.localeCompare(right.skillName, "zh-CN"));
}

function buildSummary(features, skills) {
  const summary = features.reduce((result, row) => ({
    providerCalls: result.providerCalls + row.providerCalls,
    successfulCalls: result.successfulCalls + row.successfulCalls,
    inputTokens: result.inputTokens + row.inputTokens,
    outputTokens: result.outputTokens + row.outputTokens,
    fallbackRuns: result.fallbackRuns + row.fallbackRuns
  }), { providerCalls: 0, successfulCalls: 0, inputTokens: 0, outputTokens: 0, fallbackRuns: 0 });
  return {
    providerCalls: summary.providerCalls,
    successfulCalls: summary.successfulCalls,
    successRate: ratio(summary.successfulCalls, summary.providerCalls),
    inputTokens: summary.inputTokens,
    outputTokens: summary.outputTokens,
    totalTokens: summary.inputTokens + summary.outputTokens,
    skillCalls: skills.reduce((sum, row) => sum + row.calls, 0),
    fallbackRuns: summary.fallbackRuns
  };
}

async function queryUsage(db, range) {
  const features = await db.prepare(`SELECT app_id, feature_id, provider_id, model,
    SUM(CASE WHEN provider_called = 1 THEN 1 ELSE 0 END) AS provider_calls,
    SUM(CASE WHEN provider_called = 1 AND execution_mode = 'model' AND completed = 1 THEN 1 ELSE 0 END) AS successful_calls,
    SUM(input_tokens) AS input_tokens,
    SUM(output_tokens) AS output_tokens,
    SUM(CASE WHEN execution_mode = 'rule_fallback' THEN 1 ELSE 0 END) AS fallback_runs,
    MAX(created_at) AS last_used_at
    FROM ai_usage_audit
    WHERE created_at >= ? AND created_at < ?
    GROUP BY app_id, feature_id, provider_id, model`)
    .bind(range.startUtc, range.endExclusiveUtc)
    .all();
  const skills = await db.prepare(`SELECT usage.app_id AS caller_app_id,
    usage.feature_id AS caller_feature_id, skill.app_id AS source_app_id,
    skill.skill_id,
    COUNT(*) AS calls,
    SUM(CASE WHEN skill.result_code = 'AI_SKILL_COMPLETED' THEN 1 ELSE 0 END) AS successes,
    SUM(CASE WHEN skill.result_code = 'AI_SKILL_COMPLETED' THEN 0 ELSE 1 END) AS failures,
    SUM(skill.result_count) AS result_count,
    MAX(skill.created_at) AS last_used_at
    FROM ai_skill_audit AS skill
    INNER JOIN ai_usage_audit AS usage ON usage.request_id = skill.request_id
    WHERE skill.created_at >= ? AND skill.created_at < ?
    GROUP BY usage.app_id, usage.feature_id, skill.app_id, skill.skill_id`)
    .bind(range.startUtc, range.endExclusiveUtc)
    .all();
  return { featureRows: features?.results || [], skillRows: skills?.results || [] };
}

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return response(null, 204, { allow: "GET, OPTIONS" });
  if (request.method !== "GET") return errorResponse("Method not allowed", 405, "AI_METHOD_NOT_ALLOWED");
  if (!data.session) return errorResponse("请先使用钉钉登录。", 401, "AI_SESSION_REQUIRED");
  if (!canViewDataCenter(data.session)) return errorResponse("当前账号没有数据中心查看权限。", 403, "AI_USAGE_ACCESS_DENIED");
  const db = env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB;
  if (!db) return errorResponse("AI 使用统计数据库暂不可用。", 503, "AI_STORAGE_UNAVAILABLE", true);

  let range;
  try {
    range = usageRange(new URL(request.url));
  } catch (error) {
    return errorResponse(error.message, error.status, error.code, Boolean(error.retryable));
  }

  try {
    const { featureRows, skillRows } = await queryUsage(db, range);
    const features = buildFeatures(featureRows);
    const skills = buildSkills(skillRows);
    return response({
      range: { from: range.from, to: range.to, timezone: "Asia/Shanghai" },
      summary: buildSummary(features, skills),
      features,
      skills
    });
  } catch {
    return errorResponse("AI 使用统计加载失败。", 500, "AI_USAGE_QUERY_FAILED", true);
  }
}

export const aiUsageInternals = { usageRange, buildFeatures, buildSkills, buildSummary };
