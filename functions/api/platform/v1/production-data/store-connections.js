import { storeFileImportPending } from "../../../../../src/domain/dataCenterConnectors.js";
import { jsonResponse, optionsResponse } from "../../../dingtalk/_shared/dingtalk.js";
import { destroyConnectorRecord, listConnectorRecords } from "../../../data-center/_shared/connectorStorage.js";
import { destroyCredentialEntry, listCredentialMetadata } from "../../_shared/credentialVaultStorage.js";
import {
  authorizeProductionAccess,
  ensureProductionAccessTables,
  finishProductionAudit,
  productionAccessError,
  requireProductionWriteUnlock,
  saveProductionSnapshot,
  startProductionAudit
} from "../../_shared/productionDataAccess.js";
import { createDataConnectionStore } from "../data-connections/_shared/storage.js";

const CONFIRMATION = "销毁店铺凭证";

function database(env = {}) {
  return env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB || null;
}

function errorResponse(error) {
  const message = error?.message || "店铺连接清理失败。";
  const requestId = crypto.randomUUID?.() || `req_${Date.now().toString(36)}`;
  return jsonResponse({ synced: false, message, error: { code: error?.code || "STORE_CONNECTION_CLEANUP_FAILED", message, requestId, retryable: Boolean(error?.retryable) } }, error?.status || 500);
}

function actorFromAccess(access) {
  return { userId: access.userId, name: access.name, role: access.role, readonly: false, departments: ["总经办"] };
}

async function summarizeStoreConnections(db) {
  const [credentials, connectorRecords, legacyConnections, taskRow] = await Promise.all([
    listCredentialMetadata(db, { scopeType: "connector", includeArchived: true }),
    listConnectorRecords(db),
    db.prepare("SELECT id, status FROM data_connections WHERE platform_id = ?").bind("douyin-ecommerce").all(),
    db.prepare(`SELECT COUNT(*) AS count FROM browser_agent_tasks
      WHERE platform_id = ? AND status IN ('queued', 'claimed', 'waiting_human_verification', 'recognizing')`)
      .bind("douyin-ecommerce").first()
  ]);
  return {
    storeCredentialsWithSecret: credentials.filter(item => storeFileImportPending(item.category) && item.hasSecret).length,
    storeConnectorInstances: connectorRecords.connectors.filter(item => storeFileImportPending(item.connectorId)).length,
    legacyConnections: (legacyConnections?.results || []).filter(item => item.status !== "disabled").length,
    activeBrowserTasks: Number(taskRow?.count || 0)
  };
}

async function cleanupStoreConnections(db, env, access, unlock) {
  const before = await summarizeStoreConnections(db);
  const now = new Date().toISOString();
  const snapshotId = await saveProductionSnapshot(db, {
    state: before,
    version: "store-credentials-v1",
    updatedAt: now,
    updatedBy: access.name
  });
  const audit = await startProductionAudit({
    db,
    action: "destroy_store_credentials",
    access,
    unlock,
    snapshotId,
    before: { version: "store-credentials-v1", updatedAt: now },
    sourceEnvironment: "production"
  });
  try {
    const legacyStore = createDataConnectionStore(db, {
      masterKey: env.PLATFORM_CREDENTIAL_MASTER_KEY,
      actor: actorFromAccess(access),
      requestId: audit.requestId
    });
    for (const connection of await legacyStore.list()) {
      if (connection.status === "disabled") continue;
      await legacyStore.destroy({ id: connection.id, expectedVersion: connection.version });
    }

    const records = await listConnectorRecords(db);
    for (const connection of records.connectors.filter(item => storeFileImportPending(item.connectorId))) {
      await destroyConnectorRecord(db, connection.id, { expectedVersion: connection.version }, {
        expectedVersion: connection.version,
        actor: access.name,
        actorId: access.userId,
        requestId: audit.requestId
      });
    }

    const credentials = await listCredentialMetadata(db, { scopeType: "connector", includeArchived: true });
    for (const credential of credentials.filter(item => storeFileImportPending(item.category) && item.hasSecret)) {
      await destroyCredentialEntry(db, credential.id, { expectedVersion: credential.version }, {
        actorType: "employee",
        actorId: access.userId,
        actorName: access.name,
        requestId: audit.requestId,
        purpose: "清理已退役店铺网页登录凭证"
      });
    }

    await db.prepare(`DELETE FROM browser_agent_task_grants WHERE task_id IN (
      SELECT id FROM browser_agent_tasks WHERE platform_id = ?
    )`).bind("douyin-ecommerce").run();
    await db.prepare(`UPDATE browser_agent_tasks SET status = 'failed', error_code = 'PROVIDER_RETIRED',
      claimed_by = NULL, claim_expires_at = NULL, updated_at = ?
      WHERE platform_id = ? AND status IN ('queued', 'claimed', 'waiting_human_verification', 'recognizing')`)
      .bind(now, "douyin-ecommerce").run();

    const after = await summarizeStoreConnections(db);
    await finishProductionAudit(db, audit.id, { version: "store-credentials-v1", updatedAt: new Date().toISOString() });
    return { before, after, auditId: audit.id };
  } catch (error) {
    await finishProductionAudit(db, audit.id, { version: "store-credentials-v1", updatedAt: new Date().toISOString() }, "failed").catch(() => {});
    throw error;
  }
}

export async function handleStoreConnectionCleanupRequest({ request, env }, dependencies = {}) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (!["GET", "POST"].includes(request.method)) return errorResponse(productionAccessError("Method not allowed", 405, "METHOD_NOT_ALLOWED"));
  const db = database(env);
  if (!db) return errorResponse(productionAccessError("缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB。", 501, "PRODUCTION_STORAGE_UNAVAILABLE"));
  try {
    const authorize = dependencies.authorize || authorizeProductionAccess;
    const summarize = dependencies.summarize || summarizeStoreConnections;
    const requireUnlock = dependencies.requireUnlock || requireProductionWriteUnlock;
    const cleanup = dependencies.cleanup || cleanupStoreConnections;
    if (!dependencies.authorize) await ensureProductionAccessTables(db);
    const access = await authorize(request, db, { capability: request.method === "GET" ? "read" : "write" });
    if (request.method === "GET") return jsonResponse({ synced: true, summary: await summarize(db) });
    const body = await request.json().catch(() => ({}));
    if (body.confirmation !== CONFIRMATION) throw productionAccessError(`请输入“${CONFIRMATION}”确认。`, 400, "STORE_CONNECTION_CLEANUP_CONFIRMATION_REQUIRED");
    const unlock = await requireUnlock(request, db, access);
    return jsonResponse({ synced: true, ...await cleanup(db, env, access, unlock) });
  } catch (error) {
    return errorResponse(error);
  }
}

export function onRequest(context) {
  return handleStoreConnectionCleanupRequest(context);
}

export const storeConnectionCleanupInternals = { summarizeStoreConnections, cleanupStoreConnections };
