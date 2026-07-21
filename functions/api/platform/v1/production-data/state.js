import { jsonResponse, optionsResponse } from "../../../dingtalk/_shared/dingtalk.js";
import { readCompanyState, writeCompanyState } from "../../../state.js";
import {
  PRODUCTION_WRITE_CONFIRMATION,
  authorizeProductionAccess,
  ensureProductionAccessTables,
  findProductionAudit,
  finishProductionAudit,
  listProductionAudits,
  productionAccessError,
  readProductionSnapshot,
  requireProductionWriteUnlock,
  saveProductionSnapshot,
  startProductionAudit
} from "../../_shared/productionDataAccess.js";

function database(env = {}) {
  return env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB || null;
}

function errorResponse(error) {
  const message = error?.message || "生产数据访问失败。";
  const requestId = crypto.randomUUID?.() || `req_${Date.now().toString(36)}`;
  return jsonResponse({ synced: false, message, error: { code: error?.code || "PRODUCTION_DATA_FAILED", message, requestId, retryable: Boolean(error?.retryable) } }, error?.status || 500);
}

async function rollbackState({ db, body, access, unlock }) {
  if (body.confirmation !== PRODUCTION_WRITE_CONFIRMATION) {
    throw productionAccessError(`请输入“${PRODUCTION_WRITE_CONFIRMATION}”确认回滚。`, 400, "PRODUCTION_CONFIRMATION_REQUIRED");
  }
  const sourceAudit = await findProductionAudit(db, String(body.auditId || ""));
  if (!sourceAudit || sourceAudit.status !== "succeeded" || !sourceAudit.snapshot_id) {
    throw productionAccessError("该审计记录没有可用的写前快照。", 404, "PRODUCTION_ROLLBACK_NOT_AVAILABLE");
  }
  const before = await readCompanyState(db);
  if (!before) throw productionAccessError("生产公司状态不存在。", 404, "PRODUCTION_DATA_NOT_FOUND");
  const rollbackTarget = await readProductionSnapshot(db, sourceAudit.snapshot_id);
  const snapshotId = await saveProductionSnapshot(db, before);
  const audit = await startProductionAudit({
    db,
    action: "rollback",
    access,
    unlock,
    snapshotId,
    before,
    sourceEnvironment: "development"
  });
  try {
    const saved = await writeCompanyState(db, rollbackTarget.state, access.name, { baseUpdatedAt: before.updatedAt });
    await finishProductionAudit(db, audit.id, saved);
    return { synced: true, ...saved, auditId: audit.id, rolledBackAuditId: sourceAudit.id };
  } catch (error) {
    await finishProductionAudit(db, audit.id, before, "failed").catch(() => {});
    if (error?.code === "SHARED_STATE_VERSION_CONFLICT") {
      throw productionAccessError("线上数据已被其他人更新，请刷新后重新操作。", 409, "PRODUCTION_DATA_VERSION_CONFLICT", true);
    }
    throw error;
  }
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (!["GET", "POST"].includes(request.method)) return errorResponse(productionAccessError("Method not allowed", 405, "METHOD_NOT_ALLOWED"));
  const db = database(env);
  if (!db) return errorResponse(productionAccessError("缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB。", 501, "PRODUCTION_STORAGE_UNAVAILABLE"));
  try {
    await ensureProductionAccessTables(db);
    const access = await authorizeProductionAccess(request, db, { capability: request.method === "GET" ? "read" : "write" });
    if (request.method === "GET") {
      const stored = await readCompanyState(db);
      return jsonResponse(stored
        ? { synced: true, ...stored, audit: await listProductionAudits(db) }
        : { synced: false, state: null, audit: [] });
    }

    const unlock = await requireProductionWriteUnlock(request, db, access);
    const body = await request.json().catch(() => ({}));
    if (body.action === "rollback") return jsonResponse(await rollbackState({ db, body, access, unlock }));
    const before = await readCompanyState(db);
    if (!before) throw productionAccessError("生产公司状态不存在。", 404, "PRODUCTION_DATA_NOT_FOUND");
    if (!body.baseUpdatedAt || body.baseUpdatedAt !== before.updatedAt) {
      throw productionAccessError("线上数据已被其他人更新，请刷新后重新操作。", 409, "PRODUCTION_DATA_VERSION_CONFLICT", true);
    }
    const snapshotId = await saveProductionSnapshot(db, before);
    const audit = await startProductionAudit({ db, action: "write", access, unlock, snapshotId, before, sourceEnvironment: "development" });
    try {
      const saved = await writeCompanyState(db, body.state, access.name, { baseUpdatedAt: body.baseUpdatedAt });
      await finishProductionAudit(db, audit.id, saved);
      return jsonResponse({ synced: true, ...saved, auditId: audit.id });
    } catch (error) {
      await finishProductionAudit(db, audit.id, before, "failed").catch(() => {});
      if (error?.code === "SHARED_STATE_VERSION_CONFLICT") {
        throw productionAccessError("线上数据已被其他人更新，请刷新后重新操作。", 409, "PRODUCTION_DATA_VERSION_CONFLICT", true);
      }
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}
