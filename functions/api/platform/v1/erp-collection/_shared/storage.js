import { projectKuaimaiErpRecords } from "../../../../../../src/domain/kuaimaiErpProjection.js";
import { scaleSalesFact } from "../../../../../../src/domain/demoSalesTransform.js";
import { replaceSalesFactsForDates } from "../../../../sales.js";
import { appendGoodsFlowEvents, saveGoodsFlowExceptions, saveInventoryDaily } from "../../goods-flow/_shared/storage.js";
import { upsertProductCatalog } from "../../product-catalog/_shared/storage.js";

const WRITE_BATCH_SIZE = 50;

export function erpCollectionDatabase(env = {}) {
  return env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB || null;
}

async function runBatches(db, statements) {
  for (let index = 0; index < statements.length; index += WRITE_BATCH_SIZE) {
    await db.batch(statements.slice(index, index + WRITE_BATCH_SIZE));
  }
}

async function findBatch(db, batch) {
  return db.prepare(`SELECT id, status, target_environment, target_environment_version FROM erp_collection_batches
    WHERE platform_id = ? AND resource_type = ? AND content_hash = ? LIMIT 1`)
    .bind(batch.platformId, batch.resourceType, batch.contentHash)
    .first();
}

async function findArchive(db, archive) {
  if (!archive) return null;
  return db.prepare(`SELECT id, status FROM erp_file_archives
    WHERE platform_id = ? AND content_hash = ? LIMIT 1`)
    .bind(archive.platformId, archive.contentHash)
    .first();
}

async function readExistingRecords(db, resourceType, records) {
  const existing = new Map();
  for (let index = 0; index < records.length; index += WRITE_BATCH_SIZE) {
    const chunk = records.slice(index, index + WRITE_BATCH_SIZE);
    const placeholders = chunk.map(() => "?").join(", ");
    const result = await db.prepare(`SELECT source_key, content_hash FROM erp_source_records
      WHERE resource_type = ? AND source_key IN (${placeholders})`)
      .bind(resourceType, ...chunk.map(record => record.sourceKey))
      .all();
    for (const row of result?.results || []) existing.set(row.source_key, row.content_hash);
  }
  return existing;
}

async function readBatchRecords(db, batchId) {
  const result = await db.prepare(`SELECT source_key, occurred_at, modified_at, shop_id, warehouse_id, content_hash, payload
    FROM erp_source_records WHERE source_batch_id = ? ORDER BY source_key`).bind(batchId).all();
  return (result?.results || []).map(row => ({
    sourceKey: row.source_key,
    occurredAt: row.occurred_at || null,
    modifiedAt: row.modified_at || null,
    shopId: row.shop_id || null,
    warehouseId: row.warehouse_id || null,
    contentHash: row.content_hash,
    payload: JSON.parse(row.payload || "{}")
  }));
}

async function projectCompletedBatch(controlDb, businessDb, resourceType, batchId, actor, now, target) {
  const records = await readBatchRecords(controlDb, batchId);
  const projection = projectKuaimaiErpRecords(resourceType, records, { batchId, now });
  let catalog = { products: 0, skus: 0 };
  if (projection.catalog.items.length) {
    const result = await upsertProductCatalog(businessDb, projection.catalog, {
      actor: String(actor).slice(0, 120),
      mode: "kuaimai-erp-file",
      fileName: batchId
    });
    catalog = result.counts;
  }
  if (projection.events.length) await appendGoodsFlowEvents(businessDb, projection.events.map(event => ({ ...event, createdBy: String(actor).slice(0, 120) })));
  if (projection.inventoryDaily.length) await saveInventoryDaily(businessDb, projection.inventoryDaily, now);
  const salesRows = target?.environmentId === "display"
    ? projection.salesDaily.map(row => scaleSalesFact(row))
    : projection.salesDaily;
  const sales = salesRows.length
    ? await replaceSalesFactsForDates(businessDb, salesRows, {
      source: "快麦销售主题分析-按订单商品明细（Chrome 采集）",
      importedBy: String(actor).slice(0, 80),
      importedAt: now
    })
    : { rows: 0, dates: [] };
  if (projection.exceptions.length) await saveGoodsFlowExceptions(businessDb, projection.exceptions);
  return {
    sourceRecords: records.length,
    catalogProducts: catalog.products || 0,
    catalogSkus: catalog.skus || 0,
    goodsFlowEvents: projection.events.length,
    inventoryDaily: projection.inventoryDaily.length,
    salesRows: sales.rows,
    salesDates: sales.dates,
    exceptions: projection.exceptions.length
  };
}

function batchStatement(db, batch, context, summary, archiveId, target) {
  return db.prepare(`INSERT INTO erp_collection_batches
    (id, platform_id, resource_type, source_file_name, content_hash, schema_version, range_start, range_end,
      row_count, status, collected_at, imported_at, imported_by, summary, created_at, updated_at, archive_id,
      target_environment, target_environment_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(platform_id, resource_type, content_hash) DO UPDATE SET
      source_file_name = excluded.source_file_name,
      schema_version = excluded.schema_version,
      range_start = excluded.range_start,
      range_end = excluded.range_end,
      row_count = excluded.row_count,
      status = excluded.status,
      imported_at = excluded.imported_at,
      imported_by = excluded.imported_by,
      summary = excluded.summary,
      archive_id = excluded.archive_id,
      target_environment = excluded.target_environment,
      target_environment_version = excluded.target_environment_version,
      updated_at = excluded.updated_at`)
    .bind(
      batch.id, batch.platformId, batch.resourceType, batch.sourceFileName, batch.contentHash,
      batch.schemaVersion, batch.rangeStart, batch.rangeEnd, batch.rowCount, batch.status,
      batch.collectedAt, context.now, context.actor, JSON.stringify(summary), context.now, context.now, archiveId,
      target.environmentId, target.environmentVersion
    );
}

function archiveStatement(db, archive, archiveId, batchId, status, now) {
  return db.prepare(`INSERT INTO erp_file_archives
    (id, platform_id, resource_type, content_hash, file_name, size_bytes, relative_path, storage_type,
      runner_id, status, batch_id, archived_at, processed_at, error_code, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(platform_id, content_hash) DO UPDATE SET
      resource_type = excluded.resource_type,
      file_name = excluded.file_name,
      size_bytes = excluded.size_bytes,
      relative_path = excluded.relative_path,
      storage_type = excluded.storage_type,
      runner_id = COALESCE(excluded.runner_id, erp_file_archives.runner_id),
      status = CASE
        WHEN erp_file_archives.status = 'processed' AND excluded.status = 'archived' THEN erp_file_archives.status
        ELSE excluded.status
      END,
      batch_id = COALESCE(excluded.batch_id, erp_file_archives.batch_id),
      processed_at = COALESCE(excluded.processed_at, erp_file_archives.processed_at),
      error_code = CASE
        WHEN excluded.status = 'archived' THEN erp_file_archives.error_code
        ELSE excluded.error_code
      END,
      updated_at = excluded.updated_at`)
    .bind(
      archiveId, archive.platformId, archive.resourceType, archive.contentHash, archive.fileName,
      archive.sizeBytes, archive.relativePath, archive.storageType, archive.runnerId, status, batchId,
      archive.archivedAt, status === "processed" ? (archive.processedAt || now) : archive.processedAt,
      archive.errorCode, now, now
    );
}

function recordStatement(db, record, resourceType, batchId, now) {
  return db.prepare(`INSERT INTO erp_source_records
    (id, resource_type, source_key, source_batch_id, occurred_at, modified_at, shop_id, warehouse_id,
      content_hash, payload, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(resource_type, source_key) DO UPDATE SET
      source_batch_id = excluded.source_batch_id,
      occurred_at = excluded.occurred_at,
      modified_at = excluded.modified_at,
      shop_id = excluded.shop_id,
      warehouse_id = excluded.warehouse_id,
      content_hash = excluded.content_hash,
      payload = excluded.payload,
      updated_at = excluded.updated_at`)
    .bind(
      record.id, resourceType, record.sourceKey, batchId, record.occurredAt, record.modifiedAt,
      record.shopId, record.warehouseId, record.contentHash, JSON.stringify(record.payload), now, now
    );
}

function issueStatement(db, issue, resourceType, batchId, now) {
  return db.prepare(`INSERT INTO erp_collection_issues
    (id, source_batch_id, resource_type, source_key, code, severity, message, details, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      source_batch_id = excluded.source_batch_id,
      source_key = excluded.source_key,
      code = excluded.code,
      severity = excluded.severity,
      message = excluded.message,
      details = excluded.details,
      status = excluded.status,
      updated_at = excluded.updated_at`)
    .bind(
      issue.id, batchId, resourceType, issue.sourceKey, issue.code, issue.severity,
      issue.message, JSON.stringify(issue.details), issue.status, now, now
    );
}

export async function ingestErpCollection(controlDb, input, {
  actor = "",
  businessDb = controlDb,
  target = { environmentId: "production", environmentVersion: 1 }
} = {}) {
  const now = new Date().toISOString();
  const existingBatch = await findBatch(controlDb, input.batch);
  const batchId = existingBatch?.id || input.batch.id;
  const existingArchive = await findArchive(controlDb, input.archive);
  const archiveId = input.archive ? (existingArchive?.id || input.archive.id) : null;
  const existingRecords = await readExistingRecords(controlDb, input.batch.resourceType, input.records);
  const counts = { inserted: 0, updated: 0, unchanged: 0, issues: input.issues.length };
  const changedRecords = [];
  for (const record of input.records) {
    const previousHash = existingRecords.get(record.sourceKey);
    if (!previousHash) counts.inserted += 1;
    else if (previousHash === record.contentHash) counts.unchanged += 1;
    else counts.updated += 1;
    if (previousHash !== record.contentHash) changedRecords.push(record);
  }
  const summary = {
    idempotencyKey: input.idempotencyKey,
    targetEnvironment: target.environmentId,
    targetEnvironmentVersion: target.environmentVersion,
    chunkRecords: input.records.length,
    ...counts
  };
  await runBatches(controlDb, [
    batchStatement(controlDb, { ...input.batch, id: batchId }, { actor: String(actor).slice(0, 120), now }, summary, archiveId, target),
    ...(input.archive ? [archiveStatement(
      controlDb,
      input.archive,
      archiveId,
      batchId,
      input.batch.status === "pending" ? "processing" : "processed",
      now
    )] : []),
    ...changedRecords.map(record => recordStatement(controlDb, record, input.batch.resourceType, batchId, now)),
    ...input.issues.map(issue => issueStatement(controlDb, issue, input.batch.resourceType, batchId, now))
  ]);
  const projection = input.batch.status === "completed"
    ? await projectCompletedBatch(controlDb, businessDb, input.batch.resourceType, batchId, actor, now, target)
    : null;
  return {
    batchId,
    archiveId,
    resourceType: input.batch.resourceType,
    status: input.batch.status,
    targetEnvironment: target.environmentId,
    targetEnvironmentVersion: target.environmentVersion,
    duplicateFile: Boolean(existingBatch),
    counts,
    projection
  };
}

export async function sha256(value) {
  const encoded = new TextEncoder().encode(String(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function createCollectorToken() {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return `kec_${[...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function registerErpCollector(db, { name = "公司 Mac 快麦采集器" } = {}, actor = {}) {
  const token = createCollectorToken();
  const tokenHash = await sha256(token);
  const id = globalThis.crypto?.randomUUID?.() || `erp-runner-${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const safeName = String(name || "公司 Mac 快麦采集器").trim().slice(0, 120);
  await db.prepare(`INSERT INTO erp_collector_tokens
    (id, token_hash, name, scope, status, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, tokenHash, safeName, "kuaimai_erp_ingest", "active", now, String(actor.actor || actor.userId || "unknown").slice(0, 120))
    .run();
  return { id, token, name: safeName, scope: "kuaimai_erp_ingest", createdAt: now };
}

export async function authenticateErpCollector(db, request) {
  const authorization = String(request.headers.get("authorization") || "");
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) {
    const error = new Error("采集器令牌缺失。");
    error.status = 401;
    error.code = "ERP_COLLECTION_RUNNER_TOKEN_REQUIRED";
    throw error;
  }
  const tokenHash = await sha256(token);
  const row = await db.prepare(`SELECT id, name, scope, status FROM erp_collector_tokens
    WHERE token_hash = ? AND status = 'active' LIMIT 1`).bind(tokenHash).first();
  if (!row || row.scope !== "kuaimai_erp_ingest") {
    const error = new Error("采集器令牌无效、已停用或权限范围不符。");
    error.status = 401;
    error.code = "ERP_COLLECTION_RUNNER_TOKEN_INVALID";
    throw error;
  }
  const now = new Date().toISOString();
  await db.prepare("UPDATE erp_collector_tokens SET last_seen_at = ? WHERE id = ?").bind(now, row.id).run();
  return { actor: row.name, userId: row.id, department: "collector", runnerId: row.id, scope: row.scope };
}

export async function listErpArchives(db, { resourceType = "", status = "", limit = 100 } = {}) {
  const result = await db.prepare(`SELECT id, platform_id, resource_type, content_hash, file_name, size_bytes,
    relative_path, storage_type, runner_id, status, batch_id, archived_at, processed_at, error_code, updated_at
    FROM erp_file_archives ORDER BY archived_at DESC LIMIT ?`).bind(Math.min(500, Math.max(1, Number(limit) || 100))).all();
  return (result?.results || [])
    .filter(row => !resourceType || row.resource_type === resourceType)
    .filter(row => !status || row.status === status)
    .map(row => ({
      id: row.id,
      platformId: row.platform_id,
      resourceType: row.resource_type,
      contentHash: row.content_hash,
      fileName: row.file_name,
      sizeBytes: Number(row.size_bytes || 0),
      relativePath: row.relative_path,
      storageType: row.storage_type,
      runnerId: row.runner_id || null,
      status: row.status,
      batchId: row.batch_id || null,
      archivedAt: row.archived_at,
      processedAt: row.processed_at || null,
      errorCode: row.error_code || null,
      updatedAt: row.updated_at
    }));
}

export async function upsertErpArchive(db, archive, { actor = "" } = {}) {
  const now = new Date().toISOString();
  const existing = await findArchive(db, archive);
  const archiveId = existing?.id || archive.id;
  await archiveStatement(db, archive, archiveId, null, archive.status || "archived", now).run();
  return { archiveId, duplicateFile: Boolean(existing), status: archive.status || "archived", updatedBy: String(actor).slice(0, 120) };
}
