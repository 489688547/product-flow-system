import {
  DEMO_DATA_CATALOG,
  copyableDemoTables,
  recalculatedDemoTables
} from "./demoDataCatalog.js";
import { maskDemoRecord } from "./demoDataMasking.js";
import {
  DISPLAY_SALES_RULE_VERSION,
  scaleSalesFact,
  validateSalesTransform
} from "../../../../src/domain/demoSalesTransform.js";

const ACTIVE_STATUSES = new Set(["queued", "running"]);
const TERMINAL_STATUSES = new Set(["succeeded", "failed"]);
const LEASE_MILLISECONDS = 30_000;
const MAX_TRANSIENT_ATTEMPTS = 3;

export class DemoDataRefreshError extends Error {
  constructor(code, message, status = 500, retryable = false) {
    super(message);
    this.name = "DemoDataRefreshError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

function refreshId(now = new Date()) {
  return crypto.randomUUID?.() || `demo_refresh_${now.getTime().toString(36)}`;
}

function stageEntries(stage, counts = {}) {
  const available = entry => counts.tables?.[entry.table]?.available !== false;
  if (stage === "preflight") {
    return DEMO_DATA_CATALOG
      .filter(entry => entry.policy !== "skip")
      .sort((left, right) => left.copyOrder - right.copyOrder);
  }
  if (stage === "clear") {
    return DEMO_DATA_CATALOG
      .filter(entry => entry.policy !== "skip")
      .filter(available)
      .sort((left, right) => right.copyOrder - left.copyOrder);
  }
  if (stage === "copy") {
    return copyableDemoTables().filter(entry => entry.policy !== "transform_sales").filter(available);
  }
  if (stage === "transform") {
    return copyableDemoTables().filter(entry => entry.policy === "transform_sales").filter(available);
  }
  if (stage === "recalculate") return recalculatedDemoTables().filter(available);
  return [];
}

function nextStage(stage) {
  const stages = ["preflight", "clear", "copy", "transform", "recalculate", "validate", "activate"];
  const index = stages.indexOf(stage);
  return index >= 0 && index < stages.length - 1 ? stages[index + 1] : "activate";
}

function publicJob(job, extra = {}) {
  return {
    id: String(job.id || ""),
    status: String(job.status || "queued"),
    stage: String(job.stage || "preflight"),
    currentTable: String(job.currentTable || ""),
    cursor: job.cursor || {},
    counts: job.counts || {},
    lastErrorCode: String(job.lastErrorCode || ""),
    createdAt: String(job.createdAt || ""),
    startedAt: String(job.startedAt || ""),
    finishedAt: String(job.finishedAt || ""),
    terminal: TERMINAL_STATUSES.has(job.status),
    ...extra
  };
}

export async function createDisplayRefreshJob({
  repository,
  actorId,
  sourceVersion,
  ruleVersion = DISPLAY_SALES_RULE_VERSION,
  now = new Date()
}) {
  const active = await repository.findActiveJob();
  if (active) return publicJob(active, { reused: true });
  const timestamp = now.toISOString();
  const job = {
    id: refreshId(now),
    status: "queued",
    stage: "preflight",
    currentTable: "",
    cursor: { index: 0 },
    sourceVersion: String(sourceVersion || timestamp),
    ruleVersion,
    counts: { tables: {} },
    lastErrorCode: "",
    actorId,
    createdAt: timestamp,
    startedAt: "",
    finishedAt: "",
    updatedAt: timestamp
  };
  try {
    return publicJob(await repository.createJob(job));
  } catch (error) {
    if (error?.code === "DEMO_DATA_REFRESH_ALREADY_ACTIVE") {
      const existing = await repository.findActiveJob();
      if (existing) return publicJob(existing, { reused: true });
    }
    throw error;
  }
}

async function transformRow(entry, row, rowIndex, maskingKey) {
  if (entry.policy === "transform_sales") return scaleSalesFact(row);
  if (entry.policy !== "mask") return { ...row };
  const identity = entry.primaryKey.map(field => row[field]).join(":") || String(rowIndex);
  return maskDemoRecord(row, entry, {
    key: maskingKey,
    namespace: `${entry.table}.${identity}`
  });
}

function progressPatch(stage, index, entry, counts, cursor = {}) {
  return {
    status: "running",
    stage,
    currentTable: entry?.table || "",
    cursor: { index, ...cursor },
    counts,
    lastErrorCode: ""
  };
}

function isTransientStorageError(error) {
  if (error?.retryable === true) return true;
  if (error instanceof DemoDataRefreshError) return false;
  return /D1_ERROR|network|connection|fetch failed|timeout|temporar/i
    .test(String(error?.message || ""));
}

async function processPreflight({ job, data }) {
  const entries = stageEntries("preflight", job.counts);
  const index = Number(job.cursor?.index || 0);
  if (index >= entries.length) {
    return { ...progressPatch("clear", 0, null, job.counts), cursor: { index: 0 } };
  }
  const entry = entries[index];
  const result = await data.preflightTable(entry);
  if (!result.available && entry.required) {
    throw new DemoDataRefreshError(
      "DEMO_DATA_REQUIRED_TABLE_MISSING",
      `展示数据库刷新缺少必需数据表：${entry.table}`
    );
  }
  const counts = {
    ...job.counts,
    tables: {
      ...(job.counts?.tables || {}),
      [entry.table]: {
        available: Boolean(result.available),
        source: Number(result.count || 0),
        copied: 0
      }
    }
  };
  return progressPatch("preflight", index + 1, entry, counts);
}

async function processTableStage({ job, data, maskingKey }) {
  const entries = stageEntries(job.stage, job.counts);
  const index = Number(job.cursor?.index || 0);
  if (index >= entries.length) {
    return { ...progressPatch(nextStage(job.stage), 0, null, job.counts), cursor: { index: 0 } };
  }
  const entry = entries[index];
  if (job.stage === "clear") {
    await data.clearTable(entry);
    return progressPatch("clear", index + 1, entry, job.counts);
  }
  if (job.stage === "recalculate") {
    await data.recalculateTable(entry);
    return progressPatch("recalculate", index + 1, entry, job.counts);
  }

  const batch = await data.copyBatch(entry, job.cursor?.tableCursor || {}, {
    transform: (row, rowIndex) => transformRow(entry, row, rowIndex, maskingKey)
  });
  const previous = job.counts?.tables?.[entry.table] || {};
  const counts = {
    ...job.counts,
    tables: {
      ...(job.counts?.tables || {}),
      [entry.table]: {
        ...previous,
        copied: Number(previous.copied || 0) + Number(batch.rows || 0)
      }
    }
  };
  if (batch.done) return progressPatch(job.stage, index + 1, entry, counts);
  return {
    ...progressPatch(job.stage, index, entry, counts),
    cursor: { index, tableCursor: batch.cursor || {} }
  };
}

export async function runDisplayRefreshStep({
  repository,
  data,
  jobId,
  maskingKey,
  now = new Date()
}) {
  let job = await repository.getJob(jobId);
  if (!job) {
    throw new DemoDataRefreshError("DEMO_DATA_REFRESH_NOT_FOUND", "没有找到展示数据库刷新任务。", 404);
  }
  if (TERMINAL_STATUSES.has(job.status)) return publicJob(job);
  if (!ACTIVE_STATUSES.has(job.status)) {
    throw new DemoDataRefreshError("DEMO_DATA_REFRESH_STATE_INVALID", "展示数据库刷新任务状态无效。", 409);
  }
  const acquired = await repository.acquireLease(jobId, now, new Date(now.getTime() + LEASE_MILLISECONDS));
  if (!acquired) return publicJob(await repository.getJob(jobId), { busy: true });
  job = await repository.getJob(jobId);

  try {
    let patch;
    if (job.stage === "preflight") {
      if (String(maskingKey || "").length < 16) {
        throw new DemoDataRefreshError(
          "DEMO_MASKING_KEY_MISSING",
          "展示数据脱敏能力未配置，刷新已阻止。",
          503
        );
      }
      patch = await processPreflight({ job, data });
    } else if (["clear", "copy", "transform", "recalculate"].includes(job.stage)) {
      patch = await processTableStage({ job, data, maskingKey });
    } else if (job.stage === "validate") {
      const validation = await data.validate(job.counts);
      if (!validation?.valid) {
        const code = validation?.errorCode || "DEMO_DATA_VALIDATION_FAILED";
        const failed = await repository.failJob(jobId, code, validation, now);
        return publicJob(failed);
      }
      patch = {
        status: "running",
        stage: "activate",
        currentTable: "",
        cursor: {},
        validation
      };
    } else {
      const activated = await repository.activateJob(jobId, job.validation || {}, now);
      return publicJob(activated);
    }
    return publicJob(await repository.saveJob(jobId, patch, now));
  } catch (error) {
    if (isTransientStorageError(error)) {
      const retryCount = Number(job.cursor?.retryCount || 0) + 1;
      if (retryCount < MAX_TRANSIENT_ATTEMPTS) {
        const retrying = await repository.saveJob(jobId, {
          status: "running",
          cursor: { ...(job.cursor || {}), retryCount },
          lastErrorCode: "DEMO_DATA_REFRESH_RETRYABLE"
        }, now);
        return publicJob(retrying, {
          message: "展示数据库暂时连接失败，任务将自动重试。",
          retryable: true
        });
      }
      const failed = await repository.failJob(
        jobId,
        "DEMO_DATA_REFRESH_RETRY_EXHAUSTED",
        { valid: false },
        now
      );
      return publicJob(failed);
    }
    const code = error?.code || "DEMO_DATA_REFRESH_FAILED";
    const failed = await repository.failJob(jobId, code, { valid: false }, now);
    return publicJob(failed, {
      message: error?.message || "展示数据库刷新失败。"
    });
  }
}

export const demoDataRefreshInternals = {
  nextStage,
  publicJob,
  stageEntries,
  transformRow
};

function parseObject(value, fallback = {}) {
  if (value && typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value || ""));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizeJobRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    stage: row.stage,
    currentTable: row.current_table || "",
    cursor: parseObject(row.cursor_json),
    sourceVersion: row.source_version,
    ruleVersion: row.rule_version,
    counts: parseObject(row.counts_json, { tables: {} }),
    validation: parseObject(row.validation_json),
    lastErrorCode: row.last_error_code || "",
    actorId: row.actor_id,
    leaseExpiresAt: row.lease_expires_at || "",
    createdAt: row.created_at || "",
    startedAt: row.started_at || "",
    finishedAt: row.finished_at || "",
    updatedAt: row.updated_at || ""
  };
}

function runChanges(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

export function createD1RefreshRepository(controlDb) {
  async function getJob(id) {
    const row = await controlDb.prepare(`SELECT id, status, stage, current_table, cursor_json,
      source_version, rule_version, counts_json, validation_json, last_error_code,
      lease_expires_at, actor_id, created_at, started_at, finished_at, updated_at
      FROM demo_data_refresh_jobs WHERE id = ?`).bind(id).first();
    return normalizeJobRow(row);
  }

  return {
    async findActiveJob() {
      const row = await controlDb.prepare(`SELECT id, status, stage, current_table, cursor_json,
        source_version, rule_version, counts_json, validation_json, last_error_code,
        lease_expires_at, actor_id, created_at, started_at, finished_at, updated_at
        FROM demo_data_refresh_jobs
        WHERE status IN ('queued', 'running')
        ORDER BY created_at DESC LIMIT 1`).first();
      return normalizeJobRow(row);
    },

    async createJob(job) {
      const statements = [
        controlDb.prepare(`INSERT INTO demo_data_refresh_jobs (
          id, status, stage, current_table, cursor_json, source_version, rule_version,
          counts_json, validation_json, last_error_code, lease_expires_at, actor_id,
          created_at, started_at, finished_at, updated_at
        ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, '{}', NULL, NULL, ?, ?, NULL, NULL, ?)`).bind(
          job.id,
          job.status,
          job.stage,
          JSON.stringify(job.cursor),
          job.sourceVersion,
          job.ruleVersion,
          JSON.stringify(job.counts),
          job.actorId,
          job.createdAt,
          job.updatedAt
        ),
        controlDb.prepare(`UPDATE demo_data_environment_state
          SET status = 'refreshing', active_job_id = ?, last_error_code = NULL,
              updated_by = ?, updated_at = ?
          WHERE id = 'display'`).bind(job.id, job.actorId, job.updatedAt)
      ];
      try {
        await controlDb.batch(statements);
      } catch (error) {
        if (/unique|constraint/i.test(String(error?.message || ""))) {
          throw new DemoDataRefreshError(
            "DEMO_DATA_REFRESH_ALREADY_ACTIVE",
            "已有展示数据库刷新任务正在进行。",
            409,
            true
          );
        }
        throw error;
      }
      return getJob(job.id);
    },

    getJob,

    async acquireLease(id, now, leaseExpiresAt) {
      const result = await controlDb.prepare(`UPDATE demo_data_refresh_jobs
        SET status = 'running', started_at = COALESCE(started_at, ?),
            lease_expires_at = ?, updated_at = ?
        WHERE id = ? AND status IN ('queued', 'running')
          AND (lease_expires_at IS NULL OR lease_expires_at < ?)`)
        .bind(now.toISOString(), leaseExpiresAt.toISOString(), now.toISOString(), id, now.toISOString())
        .run();
      return runChanges(result) === 1;
    },

    async saveJob(id, patch, now = new Date()) {
      const current = await getJob(id);
      if (!current) return null;
      const next = { ...current, ...patch };
      await controlDb.prepare(`UPDATE demo_data_refresh_jobs
        SET status = ?, stage = ?, current_table = ?, cursor_json = ?, counts_json = ?,
            validation_json = ?, last_error_code = ?, lease_expires_at = NULL, updated_at = ?
        WHERE id = ? AND status IN ('queued', 'running')`).bind(
        next.status,
        next.stage,
        next.currentTable || null,
        JSON.stringify(next.cursor || {}),
        JSON.stringify(next.counts || {}),
        JSON.stringify(next.validation || {}),
        next.lastErrorCode || null,
        now.toISOString(),
        id
      ).run();
      return getJob(id);
    },

    async failJob(id, code, validation = {}, now = new Date()) {
      const current = await getJob(id);
      if (!current) return null;
      const timestamp = now.toISOString();
      await controlDb.batch([
        controlDb.prepare(`UPDATE demo_data_refresh_jobs
          SET status = 'failed', validation_json = ?, last_error_code = ?,
              lease_expires_at = NULL, finished_at = ?, updated_at = ?
          WHERE id = ? AND status IN ('queued', 'running')`)
          .bind(JSON.stringify(validation || {}), code, timestamp, timestamp, id),
        controlDb.prepare(`UPDATE demo_data_environment_state
          SET status = 'failed', active_job_id = NULL, last_error_code = ?,
              updated_by = ?, updated_at = ?
          WHERE id = 'display' AND active_job_id = ?`)
          .bind(code, current.actorId, timestamp, id)
      ]);
      return getJob(id);
    },

    async activateJob(id, validation = {}, now = new Date()) {
      const current = await getJob(id);
      if (!current) return null;
      const timestamp = now.toISOString();
      await controlDb.batch([
        controlDb.prepare(`UPDATE demo_data_refresh_jobs
          SET status = 'succeeded', stage = 'activate', validation_json = ?,
              last_error_code = NULL, lease_expires_at = NULL, finished_at = ?, updated_at = ?
          WHERE id = ? AND status IN ('queued', 'running')`)
          .bind(JSON.stringify(validation || {}), timestamp, timestamp, id),
        controlDb.prepare(`UPDATE demo_data_environment_state
          SET status = 'ready', version = version + 1, active_job_id = NULL,
              rule_version = ?, source_updated_at = ?, coverage_json = ?,
              validation_json = ?, last_error_code = NULL, updated_by = ?, updated_at = ?
          WHERE id = 'display' AND status = 'refreshing' AND active_job_id = ?`)
          .bind(
            current.ruleVersion,
            timestamp,
            JSON.stringify(current.counts || {}),
            JSON.stringify(validation || {}),
            current.actorId,
            timestamp,
            id
          )
      ]);
      return getJob(id);
    }
  };
}

function quoteIdentifier(value) {
  const identifier = String(value || "");
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new DemoDataRefreshError("DEMO_DATA_SCHEMA_INVALID", "展示数据目录包含无效标识符。");
  }
  return `"${identifier}"`;
}

function resultRows(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

function keysetWhere(primaryKey, cursor = {}) {
  const values = Array.isArray(cursor.values) ? cursor.values : [];
  if (!values.length || values.length !== primaryKey.length) return { sql: "", values: [] };
  const branches = [];
  const bindings = [];
  primaryKey.forEach((field, index) => {
    const terms = [];
    for (let previous = 0; previous < index; previous += 1) {
      terms.push(`${quoteIdentifier(primaryKey[previous])} = ?`);
      bindings.push(values[previous]);
    }
    terms.push(`${quoteIdentifier(field)} > ?`);
    bindings.push(values[index]);
    branches.push(`(${terms.join(" AND ")})`);
  });
  return { sql: `WHERE ${branches.join(" OR ")}`, values: bindings };
}

async function tableExists(db, tableName) {
  const row = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(tableName)
    .first();
  return Boolean(row);
}

async function tableColumns(db, tableName) {
  const result = await db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all();
  return resultRows(result).map(row => String(row.name || "")).filter(Boolean);
}

async function tableCount(db, tableName) {
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(tableName)}`).first();
  return Number(row?.count || 0);
}

const SALES_TOTAL_FIELDS = [
  "qty",
  "sales",
  "net_sales",
  "refund",
  "cost",
  "gross_profit",
  "pre_ship_refund",
  "post_ship_refund"
];

async function salesTotals(db) {
  const selections = SALES_TOTAL_FIELDS.map(field =>
    `COALESCE(SUM(${quoteIdentifier(field)}), 0) AS ${quoteIdentifier(field)}`
  );
  const row = await db.prepare(`SELECT ${selections.join(", ")}
    FROM ${quoteIdentifier("product_sales_daily")}`).first();
  return Object.fromEntries(SALES_TOTAL_FIELDS.map(field => [field, Number(row?.[field] || 0)]));
}

export function createD1RefreshData({ sourceDb, targetDb }) {
  const sourceColumns = new Map();
  const targetColumns = new Map();

  async function columnsFor(entry) {
    if (!sourceColumns.has(entry.table)) {
      sourceColumns.set(entry.table, await tableColumns(sourceDb, entry.table));
    }
    if (!targetColumns.has(entry.table)) {
      targetColumns.set(entry.table, await tableColumns(targetDb, entry.table));
    }
    const source = sourceColumns.get(entry.table);
    const target = new Set(targetColumns.get(entry.table));
    const columns = source.filter(column => target.has(column));
    if (entry.primaryKey.some(field => !columns.includes(field))) {
      throw new DemoDataRefreshError(
        "DEMO_DATA_SCHEMA_MISMATCH",
        `展示数据库表结构不一致：${entry.table}`
      );
    }
    return columns;
  }

  return {
    async preflightTable(entry) {
      const sourceAvailable = await tableExists(sourceDb, entry.table);
      const targetAvailable = await tableExists(targetDb, entry.table);
      if (!sourceAvailable || !targetAvailable) {
        return { available: false, count: 0 };
      }
      const columns = await columnsFor(entry);
      if (!columns.length) {
        throw new DemoDataRefreshError("DEMO_DATA_SCHEMA_MISMATCH", `展示数据库表结构不一致：${entry.table}`);
      }
      const keyFilter = entry.primaryKey
        .map(field => `${quoteIdentifier(field)} IS NULL`)
        .join(" OR ");
      const invalidKey = await sourceDb.prepare(`SELECT COUNT(*) AS count
        FROM ${quoteIdentifier(entry.table)} WHERE ${keyFilter}`).first();
      const keyGroup = entry.primaryKey.map(quoteIdentifier).join(", ");
      const duplicateKey = await sourceDb.prepare(`SELECT COUNT(*) AS count FROM (
        SELECT ${keyGroup} FROM ${quoteIdentifier(entry.table)}
        GROUP BY ${keyGroup} HAVING COUNT(*) > 1
      )`).first();
      if (Number(invalidKey?.count || 0) > 0 || Number(duplicateKey?.count || 0) > 0) {
        throw new DemoDataRefreshError(
          "DEMO_DATA_SOURCE_KEY_INVALID",
          `正式数据库存在无法安全复制的重复或空标识：${entry.table}`
        );
      }
      return { available: true, count: await tableCount(sourceDb, entry.table) };
    },

    async clearTable(entry) {
      await targetDb.prepare(`DELETE FROM ${quoteIdentifier(entry.table)}`).run();
    },

    async copyBatch(entry, cursor, { transform }) {
      const columns = await columnsFor(entry);
      const keyset = keysetWhere(entry.primaryKey, cursor);
      const order = entry.primaryKey.map(quoteIdentifier).join(", ");
      const result = await sourceDb.prepare(`SELECT ${columns.map(quoteIdentifier).join(", ")}
        FROM ${quoteIdentifier(entry.table)} ${keyset.sql}
        ORDER BY ${order} LIMIT ?`).bind(...keyset.values, entry.batchSize).all();
      const rows = resultRows(result);
      if (!rows.length) return { rows: 0, done: true, cursor };

      const statements = [];
      for (let index = 0; index < rows.length; index += 1) {
        const record = await transform(rows[index], index);
        const keyWhere = entry.primaryKey
          .map(field => `${quoteIdentifier(field)} IS ?`)
          .join(" AND ");
        statements.push(targetDb.prepare(`DELETE FROM ${quoteIdentifier(entry.table)}
          WHERE ${keyWhere}`).bind(...entry.primaryKey.map(field => record[field] ?? null)));
        statements.push(targetDb.prepare(`INSERT INTO ${quoteIdentifier(entry.table)}
          (${columns.map(quoteIdentifier).join(", ")})
          VALUES (${columns.map(() => "?").join(", ")})`)
          .bind(...columns.map(column => record[column] ?? null)));
      }
      if (statements.length) await targetDb.batch(statements);
      const last = rows.at(-1);
      return {
        rows: rows.length,
        done: rows.length < entry.batchSize,
        cursor: { values: entry.primaryKey.map(field => last[field]) }
      };
    },

    async recalculateTable(entry) {
      // Recalculated tables are intentionally empty after clear until their
      // registered calculator derives them from display facts.
      await targetDb.prepare(`DELETE FROM ${quoteIdentifier(entry.table)}`).run();
    },

    async validate(counts = {}) {
      const errors = [];
      const coverage = {};
      for (const entry of copyableDemoTables()) {
        if (counts.tables?.[entry.table]?.available === false) continue;
        const [source, display] = await Promise.all([
          tableCount(sourceDb, entry.table),
          tableCount(targetDb, entry.table)
        ]);
        coverage[entry.table] = { source, display };
        if (source !== display) errors.push(`${entry.table}:count_mismatch`);
      }
      const [sourceSales, displaySales] = await Promise.all([
        salesTotals(sourceDb),
        salesTotals(targetDb)
      ]);
      const salesValidation = validateSalesTransform(sourceSales, displaySales);
      errors.push(...salesValidation.errors.map(error => `product_sales_daily:${error}`));
      return {
        valid: errors.length === 0,
        errorCode: errors.length ? "DEMO_DATA_VALIDATION_FAILED" : "",
        errors,
        coverage,
        sales: {
          source: sourceSales,
          display: displaySales,
          factor: 2
        }
      };
    }
  };
}
