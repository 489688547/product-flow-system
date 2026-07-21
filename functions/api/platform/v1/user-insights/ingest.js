import { buildRuleSuggestions, discoverCompetitorCandidates, normalizeMarketSnapshot } from "../../../../../src/domain/userInsights.js";
import { errorResponse, jsonResponse, methodNotAllowed, optionsResponse, readJson, requireD1, UserInsightHttpError } from "./_shared/http.js";
import { appendAudit, authenticateRunner, listInsightRecords, putInsightRecord, readIdempotency, runnerAllows, sanitizeInsightRecord, writeIdempotency } from "./_shared/storage.js";

async function handlePost(context) {
  const db = requireD1(context.env);
  const runner = await authenticateRunner(db, context.request);
  const body = await readJson(context.request);
  const run = sanitizeInsightRecord(body.run || {});
  if (!body.idempotencyKey || !run.id || !run.platform || !run.categoryId || !run.dimension) {
    throw new UserInsightHttpError(400, "VALIDATION_INGEST_INVALID", "采集批次缺少幂等键、平台、类目或维度。");
  }
  if (!runnerAllows(runner, run)) throw new UserInsightHttpError(403, "PERMISSION_RUNNER_SCOPE_DENIED", "采集批次超出设备授权范围。");
  const duplicate = await readIdempotency(db, body.idempotencyKey);
  if (duplicate) return jsonResponse({ synced: true, duplicate: true, runId: duplicate });
  const mappings = await db.prepare("SELECT id, payload, version, updated_at, updated_by FROM user_insight_category_mappings ORDER BY updated_at DESC").all();
  const confirmed = (mappings.results || []).map(row => {
    try { return JSON.parse(row.payload); } catch { return null; }
  }).find(mapping => mapping && mapping.status === "confirmed"
    && mapping.platform === run.platform
    && String(mapping.shopId || "") === String(run.shopId || "")
    && mapping.categoryId === run.categoryId);
  if (!confirmed) throw new UserInsightHttpError(403, "PERMISSION_CATEGORY_UNCONFIRMED", "该平台类目尚未人工确认，不能写入采集数据。");

  const actor = `collector:${runner.id}`;
  const savedRun = await putInsightRecord(db, "syncRuns", { ...run, runnerId: runner.id, idempotencyKey: body.idempotencyKey }, actor);
  let savedSnapshot = null;
  const savedEntities = [];
  if (body.action === "complete" && body.snapshot) {
    const snapshot = normalizeMarketSnapshot({ ...body.snapshot, platform: run.platform, shopId: run.shopId || "", categoryId: run.categoryId, dimension: run.dimension, syncRunId: run.id });
    savedSnapshot = await putInsightRecord(db, "snapshots", snapshot, actor);
    for (const entity of (Array.isArray(body.entities) ? body.entities : []).slice(0, 2000)) {
      const clean = sanitizeInsightRecord({ ...entity, platform: run.platform, shopId: run.shopId || "", categoryId: run.categoryId, dimension: run.dimension, snapshotId: savedSnapshot.id });
      if (!clean.id) continue;
      savedEntities.push(await putInsightRecord(db, "entities", clean, actor));
    }
    const [ruleSets, existingCompetitors] = await Promise.all([
      listInsightRecords(db, "rules"),
      listInsightRecords(db, "competitors")
    ]);
    const candidates = discoverCompetitorCandidates({ entities: savedEntities, ruleSets, existing: existingCompetitors });
    for (const candidate of candidates) await putInsightRecord(db, "competitors", candidate, actor);
    const suggestions = buildRuleSuggestions({ snapshots: [savedSnapshot], ruleSets });
    for (const suggestion of suggestions) {
      await appendAudit(db, "generate_suggestion", "suggestion", suggestion.id, { name: actor, userId: runner.id, departments: [] }, { suggestion });
    }
  }
  await writeIdempotency(db, body.idempotencyKey, savedRun.id);
  return jsonResponse({ synced: true, duplicate: false, run: savedRun, snapshot: savedSnapshot, entityCount: savedEntities.length });
}

export async function onRequest(context) {
  try {
    if (context.request.method === "OPTIONS") return optionsResponse("POST, OPTIONS");
    if (context.request.method === "POST") return await handlePost(context);
    return methodNotAllowed();
  } catch (error) { return errorResponse(error); }
}
