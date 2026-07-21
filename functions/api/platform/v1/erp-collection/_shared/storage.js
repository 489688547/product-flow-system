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
  return db.prepare(`SELECT id, status FROM erp_collection_batches
    WHERE platform_id = ? AND resource_type = ? AND content_hash = ? LIMIT 1`)
    .bind(batch.platformId, batch.resourceType, batch.contentHash)
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

function batchStatement(db, batch, context, summary) {
  return db.prepare(`INSERT INTO erp_collection_batches
    (id, platform_id, resource_type, source_file_name, content_hash, schema_version, range_start, range_end,
      row_count, status, collected_at, imported_at, imported_by, summary, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      updated_at = excluded.updated_at`)
    .bind(
      batch.id, batch.platformId, batch.resourceType, batch.sourceFileName, batch.contentHash,
      batch.schemaVersion, batch.rangeStart, batch.rangeEnd, batch.rowCount, batch.status,
      batch.collectedAt, context.now, context.actor, JSON.stringify(summary), context.now, context.now
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

export async function ingestErpCollection(db, input, { actor = "" } = {}) {
  const now = new Date().toISOString();
  const existingBatch = await findBatch(db, input.batch);
  const batchId = existingBatch?.id || input.batch.id;
  const existingRecords = await readExistingRecords(db, input.batch.resourceType, input.records);
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
    chunkRecords: input.records.length,
    ...counts
  };
  await runBatches(db, [
    batchStatement(db, { ...input.batch, id: batchId }, { actor: String(actor).slice(0, 120), now }, summary),
    ...changedRecords.map(record => recordStatement(db, record, input.batch.resourceType, batchId, now)),
    ...input.issues.map(issue => issueStatement(db, issue, input.batch.resourceType, batchId, now))
  ]);
  return {
    batchId,
    resourceType: input.batch.resourceType,
    status: input.batch.status,
    duplicateFile: Boolean(existingBatch),
    counts
  };
}
