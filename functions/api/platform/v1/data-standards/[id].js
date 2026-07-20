import { dataStandardActor, requireDefinitionView, requireDefinitionWrite } from "../_shared/dataStandardsAuthorization.js";
import { DataStandardsHttpError, errorResponse, jsonResponse, methodNotAllowed, optionsResponse, readJson, requireDatabase, requireSession } from "../_shared/dataStandardsHttp.js";
import { appendDefinitionVersion, dataStandardsDatabase, ensureDataStandardsTables, getDefinitionDetail, listCurrentResults, listDefinitions } from "../_shared/dataStandardsStorage.js";
import { validateDefinitionInput, validateExpectedVersion } from "../_shared/dataStandardsValidation.js";

function id(prefix) {
  return `${prefix}_${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)}`;
}

function missing() {
  return new DataStandardsHttpError(404, "DATA_STANDARD_INVALID", "数据口径不存在或不可用。");
}

async function definitionContext(db) {
  const definitions = await listDefinitions(db);
  const details = await Promise.all(definitions.map(definition => getDefinitionDetail(db, definition.id)));
  return details.map(detail => {
    const current = detail.versions.find(version => version.version === detail.currentVersion) || detail.versions[0];
    return { ...detail, formulaAst: current?.formulaAst || null, executable: current?.executable !== false };
  });
}

async function enrichedDetail(db, definition) {
  const recentResults = (await listCurrentResults(db, { definitionId: definition.id })).slice(-10).reverse();
  const current = definition.versions.find(version => version.version === definition.currentVersion) || definition.versions[0];
  return { ...definition, dependencies: current?.dependencies || [], recentResults };
}

export async function onRequest({ request, env, data = {}, params = {} }) {
  if (request.method === "OPTIONS") return optionsResponse(["GET", "PUT", "OPTIONS"]);
  if (!["GET", "PUT"].includes(request.method)) return methodNotAllowed();
  try {
    const session = requireSession(data);
    const actor = dataStandardActor(session);
    requireDefinitionView(actor);
    const db = requireDatabase(dataStandardsDatabase(env));
    await ensureDataStandardsTables(db);
    const existing = await getDefinitionDetail(db, String(params.id || ""));
    if (!existing) throw missing();
    if (request.method === "GET") return jsonResponse({ synced: true, definition: await enrichedDetail(db, existing) });

    requireDefinitionWrite(actor, existing.ownerDepartment);
    const body = await readJson(request);
    const expectedVersion = validateExpectedVersion(body);
    if (expectedVersion !== existing.currentVersion) {
      throw new DataStandardsHttpError(409, "DATA_STANDARD_VERSION_CONFLICT", "口径版本已更新，请刷新后重试。", { currentVersion: existing.currentVersion });
    }
    const definitions = await definitionContext(db);
    const draft = validateDefinitionInput(body, actor, { existing, definitions });
    const now = new Date().toISOString();
    const version = {
      version: existing.currentVersion + 1,
      name: draft.name,
      category: draft.category,
      ownerDepartment: draft.ownerDepartment,
      unit: draft.unit,
      period: draft.period,
      effectiveFrom: draft.effectiveFrom,
      displayFormula: draft.displayFormula,
      formulaAst: draft.formulaAst,
      sourceFields: draft.sourceFields,
      dependencies: draft.dependencies,
      executable: draft.executable,
      coverageStatus: draft.coverageStatus,
      createdAt: now,
      createdBy: actor.id
    };
    const current = existing.versions.find(item => item.version === existing.currentVersion) || existing.versions[0];
    const audit = {
      id: id("audit"),
      action: "publish",
      actorId: actor.id,
      actorName: actor.name,
      definitionVersion: version.version,
      changedFields: ["name", "category", "ownerDepartment", "unit", "period", "effectiveFrom", "displayFormula", "formulaAst", "sourceFields"]
        .filter(key => JSON.stringify((current && key in current) ? current[key] : existing[key]) !== JSON.stringify(version[key])),
      createdAt: now
    };
    await appendDefinitionVersion(db, existing.id, existing.currentVersion, version, audit);
    const saved = await getDefinitionDetail(db, existing.id);
    return jsonResponse({ synced: true, definition: await enrichedDetail(db, saved) });
  } catch (error) {
    return errorResponse(error);
  }
}
