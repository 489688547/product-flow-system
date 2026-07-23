import { confirmCategoryMapping } from "../../../../../src/domain/userInsights.js";
import { assertCategoryManager, requireInsightActor } from "./_shared/access.js";
import { errorResponse, jsonResponse, methodNotAllowed, optionsResponse, readJson, requireD1, UserInsightHttpError } from "./_shared/http.js";
import { appendAudit, listInsightRecords, putInsightRecord } from "./_shared/storage.js";

async function handleGet(context) {
  requireInsightActor(context.data);
  const db = requireD1(context.env, context.data);
  return jsonResponse({ synced: true, mappings: await listInsightRecords(db, "categoryMappings") });
}

async function handleWrite(context) {
  const actor = requireInsightActor(context.data);
  assertCategoryManager(actor);
  const db = requireD1(context.env, context.data);
  const body = await readJson(context.request);
  const source = body.mapping || {};
  let mapping;
  if (body.action === "confirm") {
    mapping = confirmCategoryMapping(source, { name: actor.name, department: actor.departments[0] || "", now: new Date().toISOString() });
  } else if (body.action === "disable") {
    if (!body.reason) throw new UserInsightHttpError(400, "VALIDATION_REASON_REQUIRED", "停用类目需要填写原因。");
    mapping = { ...source, status: "disabled", disabledReason: body.reason };
  } else {
    mapping = { ...source, status: source.status || "suggested" };
  }
  const saved = await putInsightRecord(db, "categoryMappings", mapping, actor.name, { expectedVersion: body.expectedVersion });
  await appendAudit(db, body.action === "confirm" ? "confirm_category" : "upsert_category", "categoryMapping", saved.id, actor, { status: saved.status });
  return jsonResponse({ synced: true, mapping: saved });
}

export async function onRequest(context) {
  try {
    if (context.request.method === "OPTIONS") return optionsResponse();
    if (context.request.method === "GET") return await handleGet(context);
    if (["POST", "PATCH"].includes(context.request.method)) return await handleWrite(context);
    return methodNotAllowed();
  } catch (error) { return errorResponse(error); }
}
