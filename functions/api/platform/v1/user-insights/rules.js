import { copyInsightRuleSet } from "../../../../../src/domain/userInsights.js";
import { assertRuleOwner, requireInsightActor } from "./_shared/access.js";
import { errorResponse, jsonResponse, methodNotAllowed, optionsResponse, readJson, requireD1, UserInsightHttpError } from "./_shared/http.js";
import { appendAudit, getInsightRecord, listInsightRecords, putInsightRecord } from "./_shared/storage.js";

async function handleGet(context) {
  requireInsightActor(context.data);
  return jsonResponse({ synced: true, rules: await listInsightRecords(requireD1(context.env, context.data), "rules") });
}

async function handleWrite(context) {
  const actor = requireInsightActor(context.data);
  const db = requireD1(context.env, context.data);
  const body = await readJson(context.request);
  let rule;
  if (body.action === "copy") {
    const source = await getInsightRecord(db, "rules", body.sourceRuleId);
    if (!source) throw new UserInsightHttpError(404, "RULE_NOT_FOUND", "来源规则不存在。");
    rule = copyInsightRuleSet(source, { ...body.target, actor: actor.name, now: new Date().toISOString() });
  } else {
    rule = { ...(body.rule || {}), status: body.action === "publish" ? "published" : body.action === "disable" ? "disabled" : (body.rule?.status || "draft") };
  }
  assertRuleOwner(actor, rule);
  if (!rule.id || !rule.consumerAppId || !rule.ownerDepartment || !rule.platform) {
    throw new UserInsightHttpError(400, "VALIDATION_RULE_INVALID", "规则需要 ID、消费 App、负责部门和平台。");
  }
  const saved = await putInsightRecord(db, "rules", rule, actor.name, { expectedVersion: body.expectedVersion });
  await appendAudit(db, body.action === "copy" ? "copy_rule" : body.action === "publish" ? "publish_rule" : body.action === "disable" ? "disable_rule" : "upsert_rule", "rule", saved.id, actor, { sourceRuleId: saved.sourceRuleId, rule: { id: saved.id, name: saved.name, consumerAppId: saved.consumerAppId, ownerDepartment: saved.ownerDepartment, platform: saved.platform, categoryId: saved.categoryId, status: saved.status, version: saved.version } });
  return jsonResponse({ synced: true, rule: saved });
}

export async function onRequest(context) {
  try {
    if (context.request.method === "OPTIONS") return optionsResponse();
    if (context.request.method === "GET") return await handleGet(context);
    if (["POST", "PATCH"].includes(context.request.method)) return await handleWrite(context);
    return methodNotAllowed();
  } catch (error) { return errorResponse(error); }
}
