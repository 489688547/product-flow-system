import { buildInsightSuggestion, normalizeMarketSnapshot } from "../../../../src/domain/userInsights.js";
import { requireInsightActor, requireWritable } from "./user-insights/_shared/access.js";
import { errorResponse, jsonResponse, methodNotAllowed, optionsResponse, readJson, requireD1, UserInsightHttpError } from "./user-insights/_shared/http.js";
import { appendAudit, listInsightRecords, putInsightRecord } from "./user-insights/_shared/storage.js";

function inScope(item, scope) {
  return (!scope.platform || item.platform === scope.platform)
    && (!scope.shopId || item.shopId === scope.shopId)
    && (!scope.productId || item.productId === scope.productId)
    && (!scope.skuId || item.skuId === scope.skuId)
    && (!scope.categoryId || item.categoryId === scope.categoryId)
    && (!scope.from || !item.rangeTo || item.rangeTo >= scope.from)
    && (!scope.to || !item.rangeFrom || item.rangeFrom <= scope.to);
}

function queryScope(request) {
  const url = new URL(request.url);
  return Object.fromEntries(["viewType", "platform", "shopId", "productId", "skuId", "categoryId", "from", "to"]
    .map(key => [key, String(url.searchParams.get(key) || "").trim()]));
}

async function handleGet(context) {
  const actor = requireInsightActor(context.data);
  const db = requireD1(context.env);
  const scope = queryScope(context.request);
  const [categoryMappings, snapshots, entities, ruleSets, competitors, auditLogs, syncRuns] = await Promise.all([
    listInsightRecords(db, "categoryMappings"),
    listInsightRecords(db, "snapshots"),
    listInsightRecords(db, "entities"),
    listInsightRecords(db, "rules"),
    listInsightRecords(db, "competitors"),
    listInsightRecords(db, "auditLogs"),
    listInsightRecords(db, "syncRuns")
  ]);
  return jsonResponse({
    synced: true,
    scope,
    advisoryOnly: true,
    actor: { departments: actor.departments, readonly: actor.readonly },
    data: {
      categoryMappings: categoryMappings.filter(item => inScope(item, scope)),
      snapshots: snapshots.filter(item => inScope(item, scope)).map(normalizeMarketSnapshot),
      entities: entities.filter(item => inScope(item, scope)),
      ruleSets: ruleSets.filter(item => !scope.platform || item.platform === scope.platform),
      competitors: competitors.filter(item => inScope(item, scope)),
      suggestions: auditLogs.filter(item => item.entityType === "suggestion").map(item => item.details?.suggestion).filter(Boolean).filter(item => inScope(item, scope)).map(buildInsightSuggestion),
      ruleHistory: auditLogs.filter(item => item.entityType === "rule").map(item => ({ id: item.id, action: item.action, updatedAt: item.createdAt, updatedBy: item.actor, ...(item.details?.rule || {}) })),
      syncRuns: syncRuns.filter(item => inScope(item, scope)).slice(0, 50)
    }
  });
}

async function handlePost(context) {
  const actor = requireInsightActor(context.data);
  requireWritable(actor);
  const db = requireD1(context.env);
  const body = await readJson(context.request);
  if (body.action !== "retry") throw new UserInsightHttpError(400, "VALIDATION_ACTION_INVALID", "用户洞察操作无效。");
  const scope = body.scope || {};
  if (!scope.platform || !scope.categoryId) throw new UserInsightHttpError(400, "VALIDATION_RETRY_SCOPE", "手动重试需要已确认的平台类目。");
  const mappings = await listInsightRecords(db, "categoryMappings");
  const confirmed = mappings.find(item => item.status === "confirmed" && inScope(item, scope));
  if (!confirmed) throw new UserInsightHttpError(409, "CATEGORY_CONFIRMATION_REQUIRED", "请先确认平台类目，再发起手动重试。");
  const now = new Date().toISOString();
  const id = globalThis.crypto?.randomUUID?.() || `retry-${Date.now().toString(36)}`;
  const run = await putInsightRecord(db, "syncRuns", {
    id,
    ...scope,
    status: "queued",
    trigger: "manual",
    requestedAt: now,
    requestedBy: actor.name
  }, actor.name, { now });
  await appendAudit(db, "request_retry", "syncRun", id, actor, { scope });
  return jsonResponse({ synced: true, run }, 202);
}

export async function onRequest(context) {
  try {
    if (context.request.method === "OPTIONS") return optionsResponse("GET, POST, OPTIONS");
    if (context.request.method === "GET") return await handleGet(context);
    if (context.request.method === "POST") return await handlePost(context);
    return methodNotAllowed();
  } catch (error) {
    return errorResponse(error);
  }
}
