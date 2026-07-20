import { calculateMetricRange } from "../_shared/dataStandardsCalculation.js";
import { dataStandardActor, requireDefinitionView, requireDefinitionWrite } from "../_shared/dataStandardsAuthorization.js";
import { DataStandardsHttpError, errorResponse, jsonResponse, methodNotAllowed, optionsResponse, readJson, requireDatabase, requireSession } from "../_shared/dataStandardsHttp.js";
import { appendDataStandardAudit, dataStandardsDatabase, ensureDataStandardsTables, getDefinitionDetail, listDefinitions } from "../_shared/dataStandardsStorage.js";
import { validateDefinitionInput } from "../_shared/dataStandardsValidation.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function id(prefix) {
  return `${prefix}_${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)}`;
}

function validateRange(from, to) {
  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) {
    throw new DataStandardsHttpError(400, "DATA_STANDARD_INVALID", "预览日期范围无效。");
  }
  const fromTime = Date.parse(`${from}T00:00:00+08:00`);
  const toTime = Date.parse(`${to}T00:00:00+08:00`);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || fromTime > toTime || (toTime - fromTime) / 86400000 > 30) {
    throw new DataStandardsHttpError(400, "DATA_STANDARD_INVALID", "预览最多支持连续 31 天。");
  }
}

async function definitionContext(db) {
  const definitions = await listDefinitions(db);
  const details = await Promise.all(definitions.map(definition => getDefinitionDetail(db, definition.id)));
  return details.map(detail => {
    const current = detail.versions.find(version => version.version === detail.currentVersion) || detail.versions[0];
    return { ...detail, formulaAst: current?.formulaAst || null, executable: current?.executable !== false };
  });
}

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse(["POST", "OPTIONS"]);
  if (request.method !== "POST") return methodNotAllowed();
  let actor = null;
  let db = null;
  let auditContext = null;
  try {
    actor = dataStandardActor(requireSession(data));
    requireDefinitionView(actor);
    const body = await readJson(request);
    const from = String(body.from || "");
    const to = String(body.to || "");
    db = requireDatabase(dataStandardsDatabase(env));
    await ensureDataStandardsTables(db);
    auditContext = { definitionId: `preview:${String(body.metricCode || "unknown").slice(0, 120)}`, from, to };
    validateRange(from, to);
    const { from: ignoredFrom, to: ignoredTo, ...definitionBody } = body;
    void ignoredFrom;
    void ignoredTo;
    const definitions = await definitionContext(db);
    const existing = definitions.find(definition => definition.metricCode === definitionBody.metricCode) || null;
    const draft = validateDefinitionInput(definitionBody, actor, { existing, definitions, preview: true });
    requireDefinitionWrite(actor, draft.ownerDepartment);
    const definition = existing || { id: `preview:${draft.metricCode}`, ...draft, status: "active" };
    auditContext.definitionId = definition.id;
    const version = {
      version: existing?.currentVersion || 1,
      ...draft
    };
    const result = await calculateMetricRange({ db, definition, version, from, to });
    await appendDataStandardAudit(db, definition.id, {
      id: id("audit"),
      action: "preview",
      actorId: actor.id,
      actorName: actor.name,
      definitionVersion: version.version,
      changedFields: ["formulaAst", "sourceFields"],
      rangeStart: from,
      rangeEnd: to,
      createdAt: new Date().toISOString()
    });
    return jsonResponse({ synced: true, result });
  } catch (error) {
    if (actor && db && auditContext) {
      await appendDataStandardAudit(db, auditContext.definitionId, {
        id: id("audit"),
        action: "preview_failed",
        actorId: actor.id,
        actorName: actor.name,
        definitionVersion: null,
        changedFields: [],
        rangeStart: auditContext.from,
        rangeEnd: auditContext.to,
        createdAt: new Date().toISOString()
      }).catch(() => {});
    }
    return errorResponse(error);
  }
}
