import { dataStandardActor, requireDefinitionView } from "./_shared/dataStandardsAuthorization.js";
import { errorResponse, jsonResponse, methodNotAllowed, optionsResponse, readJson, requireDatabase, requireSession } from "./_shared/dataStandardsHttp.js";
import { dataStandardsDatabase, ensureDataStandardsTables, getDefinitionDetail, insertDefinitionWithVersion, listDefinitions } from "./_shared/dataStandardsStorage.js";
import { validateDefinitionInput, validateListQuery } from "./_shared/dataStandardsValidation.js";

function id(prefix) {
  return `${prefix}_${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)}`;
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
  if (request.method === "OPTIONS") return optionsResponse(["GET", "POST", "OPTIONS"]);
  if (!["GET", "POST"].includes(request.method)) return methodNotAllowed();
  try {
    const session = requireSession(data);
    const actor = dataStandardActor(session);
    requireDefinitionView(actor);
    const db = requireDatabase(dataStandardsDatabase(env, data));
    await ensureDataStandardsTables(db);
    if (request.method === "GET") {
      const definitions = await listDefinitions(db, validateListQuery(request));
      const summaries = await Promise.all(definitions.map(async definition => {
        const detail = await getDefinitionDetail(db, definition.id);
        const current = detail?.versions?.find(version => version.version === definition.currentVersion) || detail?.versions?.[0];
        return {
          ...definition,
          effectiveFrom: current?.effectiveFrom || "",
          displayFormula: current?.displayFormula || "",
          sourceFields: current?.sourceFields || [],
          dependencies: current?.dependencies || [],
          executable: current?.executable !== false,
          coverageStatus: current?.coverageStatus || "DATA_NOT_COVERED"
        };
      }));
      return jsonResponse({ synced: true, definitions: summaries });
    }

    const body = await readJson(request);
    const definitions = await definitionContext(db);
    const draft = validateDefinitionInput(body, actor, { definitions });
    if (definitions.some(definition => definition.metricCode === draft.metricCode)) {
      const error = new Error("metricCode 已存在，请使用新的稳定代码。");
      error.code = "DATA_STANDARD_VERSION_CONFLICT";
      error.status = 409;
      throw error;
    }
    const now = new Date().toISOString();
    const definitionId = id("standard");
    const definition = {
      id: definitionId,
      metricCode: draft.metricCode,
      category: draft.category,
      name: draft.name,
      ownerDepartment: draft.ownerDepartment,
      unit: draft.unit,
      period: draft.period,
      currentVersion: 1,
      status: "active",
      createdAt: now,
      createdBy: actor.id,
      updatedAt: now,
      updatedBy: actor.id
    };
    const version = {
      version: 1,
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
    const audit = {
      id: id("audit"),
      action: "create",
      actorId: actor.id,
      actorName: actor.name,
      definitionVersion: 1,
      changedFields: ["metricCode", "name", "category", "ownerDepartment", "unit", "period", "effectiveFrom", "displayFormula", "formulaAst", "sourceFields"],
      createdAt: now
    };
    const saved = await insertDefinitionWithVersion(db, definition, version, audit);
    return jsonResponse({ synced: true, definition: saved }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
