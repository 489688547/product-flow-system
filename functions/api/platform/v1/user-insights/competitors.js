import { transitionCompetitorCandidate } from "../../../../../src/domain/userInsights.js";
import { assertRuleOwner, requireInsightActor } from "./_shared/access.js";
import { errorResponse, jsonResponse, methodNotAllowed, optionsResponse, readJson, requireD1, UserInsightHttpError } from "./_shared/http.js";
import { appendAudit, getInsightRecord, listInsightRecords, putInsightRecord } from "./_shared/storage.js";

async function handleGet(context) {
  requireInsightActor(context.data);
  return jsonResponse({ synced: true, competitors: await listInsightRecords(requireD1(context.env), "competitors") });
}

async function handleCreate(context) {
  const actor = requireInsightActor(context.data);
  const db = requireD1(context.env);
  const body = await readJson(context.request);
  const competitor = { ...(body.competitor || {}), status: body.competitor?.status === "core" ? "candidate" : (body.competitor?.status || "candidate") };
  assertRuleOwner(actor, competitor);
  if (!competitor.id || !competitor.consumerAppId || !competitor.ownerDepartment) {
    throw new UserInsightHttpError(400, "VALIDATION_COMPETITOR_INVALID", "竞品需要 ID、消费 App 和负责部门。");
  }
  const saved = await putInsightRecord(db, "competitors", competitor, actor.name);
  await appendAudit(db, "create_competitor_candidate", "competitor", saved.id, actor, { status: saved.status });
  return jsonResponse({ synced: true, competitor: saved }, 201);
}

async function handlePatch(context) {
  const actor = requireInsightActor(context.data);
  const db = requireD1(context.env);
  const body = await readJson(context.request);
  const current = await getInsightRecord(db, "competitors", body.id);
  if (!current) throw new UserInsightHttpError(404, "COMPETITOR_NOT_FOUND", "竞品候选不存在。");
  assertRuleOwner(actor, current);
  let next;
  try {
    next = transitionCompetitorCandidate(current, body.status, {
      actor: actor.name,
      department: actor.departments[0] || "",
      reason: body.reason,
      now: new Date().toISOString()
    });
  } catch (error) {
    throw new UserInsightHttpError(400, "VALIDATION_COMPETITOR_TRANSITION", error.message);
  }
  const saved = await putInsightRecord(db, "competitors", next, actor.name, { expectedVersion: body.expectedVersion });
  await appendAudit(db, "transition_competitor", "competitor", saved.id, actor, { status: saved.status, reason: body.reason });
  return jsonResponse({ synced: true, competitor: saved });
}

export async function onRequest(context) {
  try {
    if (context.request.method === "OPTIONS") return optionsResponse();
    if (context.request.method === "GET") return await handleGet(context);
    if (context.request.method === "POST") return await handleCreate(context);
    if (context.request.method === "PATCH") return await handlePatch(context);
    return methodNotAllowed();
  } catch (error) { return errorResponse(error); }
}
