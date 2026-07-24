import {
  COMMERCE_FACT_RESOURCES,
  commerceFactIdentity,
  commerceFactsInternals,
  deriveCommerceMetrics
} from "../../../../../../src/domain/commerceFacts.js";
import { routeError } from "./http.js";

const RESOURCE_TABLES = Object.freeze({
  store_daily: "commerce_store_daily_facts",
  product_daily: "commerce_product_daily_facts",
  live_daily: "commerce_live_daily_facts",
  video_daily: "commerce_video_daily_facts"
});

const DETAIL_FILTERS = Object.freeze({
  product_daily: Object.freeze({ productId: "product_id", skuId: "sku_id" }),
  live_daily: Object.freeze({ liveSessionId: "live_session_id" }),
  video_daily: Object.freeze({ videoId: "video_id" })
});

function camelToSnake(value) {
  return String(value).replace(/[A-Z]/g, character => `_${character.toLowerCase()}`);
}

function snakeToCamel(value) {
  return String(value).replace(/_([a-z])/g, (_, character) => character.toUpperCase());
}

function factColumns(resourceType) {
  const schema = commerceFactsInternals.RESOURCE_SCHEMAS[resourceType];
  return [
    "providerId",
    "storeId",
    "businessDate",
    ...schema.identity,
    ...schema.strings,
    "sourceVersion",
    ...schema.numbers
  ];
}

function factsTable(resourceType) {
  const table = RESOURCE_TABLES[resourceType];
  if (!table) throw routeError(400, "COMMERCE_FACT_SCHEMA_INVALID", "经营事实资源未登记。");
  return table;
}

function batchConflict(message) {
  return routeError(409, "COMMERCE_BATCH_CONFLICT", message);
}

async function findBatch(db, batchId) {
  return db.prepare("SELECT * FROM commerce_fact_batches WHERE id = ? LIMIT 1").bind(batchId).first();
}

function assertMatchingBatch(row, input) {
  if (
    row.job_id !== input.jobId
    || row.provider_id !== input.providerId
    || row.store_id !== input.storeId
    || row.resource_type !== input.resourceType
    || row.business_date !== input.businessDate
    || row.schema_version !== input.schemaVersion
  ) {
    throw batchConflict("经营事实批次与已存在批次范围不一致。");
  }
  if (row.content_hash && input.contentHash && row.content_hash !== input.contentHash) {
    throw batchConflict("经营事实批次内容哈希冲突。");
  }
}

function batchInsertStatement(db, input, now) {
  return db.prepare(`INSERT INTO commerce_fact_batches (
    id, job_id, provider_id, store_id, resource_type, business_date, schema_version,
    source_version, content_hash, status, expected_count, row_count, coverage, confidence,
    error_code, started_at, completed_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      input.batchId,
      input.jobId,
      input.providerId,
      input.storeId,
      input.resourceType,
      input.businessDate,
      input.schemaVersion,
      input.sourceVersion,
      input.contentHash,
      "staging",
      null,
      null,
      null,
      null,
      null,
      now,
      null,
      now,
      now
    );
}

function factInsertStatement(db, input, fact, now) {
  const table = factsTable(input.resourceType);
  const domainColumns = factColumns(input.resourceType);
  const sourcedFact = fact.sourceVersion ? fact : { ...fact, sourceVersion: input.sourceVersion };
  const columns = ["id", "batch_id", ...domainColumns.map(camelToSnake), "created_at"];
  const values = [
    commerceFactIdentity(input.batchId, input.resourceType, fact),
    input.batchId,
    ...domainColumns.map(column => sourcedFact[column] ?? null),
    now
  ];
  const updates = columns
    .filter(column => column !== "id")
    .map(column => `${column} = excluded.${column}`)
    .join(", ");
  return db.prepare(`INSERT INTO ${table} (${columns.join(", ")})
    VALUES (${columns.map(() => "?").join(", ")})
    ON CONFLICT(id) DO UPDATE SET ${updates}`).bind(...values);
}

async function countBatchFacts(db, resourceType, batchId) {
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM ${factsTable(resourceType)} WHERE batch_id = ?`)
    .bind(batchId)
    .first();
  return Number(row?.count || 0);
}

export async function stageCommerceFactChunk(db, input, { now = new Date().toISOString() } = {}) {
  let batch = await findBatch(db, input.batchId);
  if (batch) {
    assertMatchingBatch(batch, input);
    if (batch.status === "completed") {
      return {
        batchId: batch.id,
        status: "completed",
        acceptedCount: 0,
        completedCount: Number(batch.row_count || 0)
      };
    }
    if (batch.status !== "staging") throw batchConflict("经营事实批次已经终止，不能继续写入。");
  } else {
    await batchInsertStatement(db, input, now).run();
    batch = await findBatch(db, input.batchId);
  }

  const statements = input.facts.map(fact => factInsertStatement(db, input, fact, now));
  for (let index = 0; index < statements.length; index += 50) {
    await db.batch(statements.slice(index, index + 50));
  }
  if (!input.complete) {
    return {
      batchId: input.batchId,
      status: "staging",
      acceptedCount: input.facts.length,
      completedCount: null
    };
  }

  const rowCount = await countBatchFacts(db, input.resourceType, input.batchId);
  if (rowCount !== input.expectedCount) {
    throw routeError(
      409,
      "COMMERCE_BATCH_INCOMPLETE",
      `经营事实完整批次行数不一致：期望 ${input.expectedCount}，实际 ${rowCount}。`
    );
  }

  await db.batch([
    db.prepare(`UPDATE commerce_fact_batches SET status = 'superseded', updated_at = ?
      WHERE provider_id = ? AND store_id = ? AND resource_type = ? AND business_date = ?
        AND status = 'completed' AND id <> ?`)
      .bind(now, input.providerId, input.storeId, input.resourceType, input.businessDate, input.batchId),
    db.prepare(`UPDATE commerce_fact_batches SET status = 'completed', expected_count = ?, row_count = ?,
      coverage = ?, confidence = ?, completed_at = ?, updated_at = ?, error_code = NULL WHERE id = ?`)
      .bind(input.expectedCount, rowCount, input.coverage, input.confidence, now, now, input.batchId)
  ]);

  return {
    batchId: input.batchId,
    status: "completed",
    acceptedCount: input.facts.length,
    completedCount: rowCount
  };
}

function assertDate(value, field) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    throw routeError(400, "INVALID_REQUEST", `经营事实查询 ${field} 无效。`);
  }
}

export function normalizeCommerceFactFilters(input = {}) {
  const allowed = new Set([
    "from",
    "to",
    "providerId",
    "storeId",
    "resourceType",
    "productId",
    "skuId",
    "liveSessionId",
    "videoId"
  ]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw routeError(400, "INVALID_REQUEST", `经营事实查询参数未登记：${key}`);
  }
  const filters = Object.fromEntries([...allowed].map(key => [key, String(input[key] || "").trim()]));
  assertDate(filters.from, "from");
  assertDate(filters.to, "to");
  if (filters.from > filters.to) throw routeError(400, "INVALID_REQUEST", "经营事实查询开始日期不能晚于结束日期。");
  if (filters.providerId !== "douyin-ecommerce") throw routeError(400, "INVALID_REQUEST", "经营事实 provider 未登记。");
  if (!/^[-_a-zA-Z0-9]{1,160}$/.test(filters.storeId)) throw routeError(400, "INVALID_REQUEST", "经营事实 storeId 无效。");
  if (!COMMERCE_FACT_RESOURCES.includes(filters.resourceType)) throw routeError(400, "INVALID_REQUEST", "经营事实 resourceType 未登记。");
  const suppliedDimensions = ["productId", "skuId", "liveSessionId", "videoId"].filter(key => filters[key]);
  const allowedDimensions = new Set(Object.keys(DETAIL_FILTERS[filters.resourceType] || {}));
  if (suppliedDimensions.some(key => !allowedDimensions.has(key))) {
    throw routeError(400, "INVALID_REQUEST", "经营事实明细筛选与资源类型不匹配。");
  }
  return filters;
}

function mapFact(row, resourceType) {
  const mapped = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (key === "created_at") continue;
    mapped[snakeToCamel(key)] = value;
  }
  return {
    ...mapped,
    derived: deriveCommerceMetrics(resourceType, mapped)
  };
}

function weakestConfidence(values) {
  if (values.includes("low")) return "low";
  if (values.includes("medium")) return "medium";
  if (values.includes("high")) return "high";
  return null;
}

export async function queryCommerceFacts(db, input) {
  const filters = normalizeCommerceFactFilters(input);
  const table = factsTable(filters.resourceType);
  const params = [filters.providerId, filters.storeId, filters.from, filters.to];
  let dimensionSql = "";
  for (const [key, column] of Object.entries(DETAIL_FILTERS[filters.resourceType] || {})) {
    if (!filters[key]) continue;
    dimensionSql += ` AND f.${column} = ?`;
    params.push(filters[key]);
  }
  const [factsResult, batchesResult] = await Promise.all([
    db.prepare(`SELECT f.* FROM ${table} f
      INNER JOIN commerce_fact_batches b ON b.id = f.batch_id AND b.status = 'completed'
      WHERE f.provider_id = ? AND f.store_id = ? AND f.business_date >= ? AND f.business_date <= ?
      ${dimensionSql}
      ORDER BY f.business_date, f.id`).bind(...params).all(),
    db.prepare(`SELECT business_date, completed_at, coverage, confidence, source_version
      FROM commerce_fact_batches
      WHERE status = 'completed' AND provider_id = ? AND store_id = ? AND resource_type = ?
        AND business_date >= ? AND business_date <= ?
      ORDER BY business_date DESC, completed_at DESC`)
      .bind(filters.providerId, filters.storeId, filters.resourceType, filters.from, filters.to)
      .all()
  ]);
  const batches = batchesResult?.results || [];
  const dates = batches.map(row => row.business_date).filter(Boolean).sort();
  const completedAt = batches.map(row => row.completed_at).filter(Boolean).sort();
  const coverageValues = batches.map(row => row.coverage).filter(value => value !== null && value !== undefined).map(Number);
  return {
    facts: (factsResult?.results || []).map(row => mapFact(row, filters.resourceType)),
    quality: {
      source: filters.providerId,
      latestDate: dates.at(-1) || null,
      lastSuccessfulSyncAt: completedAt.at(-1) || null,
      lastTrustedBusinessDate: dates.at(-1) || null,
      coverage: coverageValues.length ? Math.min(...coverageValues) : null,
      confidence: weakestConfidence(batches.map(row => row.confidence).filter(Boolean)),
      status: batches.length ? "ready" : "unavailable",
      errorCode: null
    }
  };
}

export const commerceFactsStorageInternals = Object.freeze({
  DETAIL_FILTERS,
  RESOURCE_TABLES,
  factColumns,
  mapFact
});
