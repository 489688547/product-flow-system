import { chmodSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const SENSITIVE_KEY = /cookie|token|password|credential|authorization|secret|session/i;
const TRUST_LEVELS = new Set(["untrusted", "validated"]);
const RUN_STATUSES = new Set(["running", "waiting_human", "failed", "completed"]);
const SAFE_ID = /^[-_.:a-zA-Z0-9]{1,160}$/;

function storeError(code, message) {
  return Object.assign(new Error(message), { code });
}

function containsSensitive(value, seen = new Set()) {
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some(item => containsSensitive(item, seen));
  return Object.entries(value).some(([key, nested]) => (
    SENSITIVE_KEY.test(key) || containsSensitive(nested, seen)
  ));
}

function safeJson(value, label) {
  const normalized = value === undefined ? null : structuredClone(value);
  if (containsSensitive(normalized)) {
    throw storeError("COLLECTOR_RESULT_SENSITIVE", `采集器实验${label}包含敏感字段。`);
  }
  const serialized = JSON.stringify(normalized);
  if (Buffer.byteLength(serialized) > 10_485_760) {
    throw storeError("COLLECTOR_OUTPUT_LIMIT_EXCEEDED", `采集器实验${label}超过本机存储上限。`);
  }
  return serialized;
}

function id(value, label) {
  const normalized = String(value || "");
  if (!SAFE_ID.test(normalized)) throw storeError("COLLECTOR_RUN_INVALID", `采集器实验${label}无效。`);
  return normalized;
}

function hash(value) {
  const normalized = String(value || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw storeError("COLLECTOR_RUN_INVALID", "采集器实验模板哈希无效。");
  }
  return normalized;
}

function fullQuality(value) {
  return value?.requiredFieldsComplete === true
    && value?.storeMatched === true
    && value?.businessDateMatched === true
    && value?.schemaMatched === true
    && Number(value?.coverage) === 1;
}

function rowToRun(row) {
  if (!row) return null;
  return {
    runId: row.run_id,
    templateId: row.template_id,
    templateVersion: row.template_version,
    contentHash: row.content_hash,
    status: row.status,
    trustLevel: row.trust_level,
    outputs: JSON.parse(row.outputs_json),
    quality: row.quality_json ? JSON.parse(row.quality_json) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function createExperimentalRunStore({
  databasePath: inputDatabasePath,
  now = () => new Date()
}) {
  if (!isAbsolute(inputDatabasePath || "")) {
    throw storeError("COLLECTOR_STORE_INVALID", "采集器实验数据库路径必须是绝对路径。");
  }
  const databasePath = resolve(inputDatabasePath);
  mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
  const database = new DatabaseSync(databasePath);
  chmodSync(databasePath, 0o600);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS experimental_runs (
      run_id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      template_version INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      status TEXT NOT NULL,
      trust_level TEXT NOT NULL,
      outputs_json TEXT NOT NULL,
      quality_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const upsert = database.prepare(`
    INSERT INTO experimental_runs (
      run_id, template_id, template_version, content_hash, status, trust_level,
      outputs_json, quality_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(run_id) DO UPDATE SET
      template_id = excluded.template_id,
      template_version = excluded.template_version,
      content_hash = excluded.content_hash,
      status = excluded.status,
      trust_level = excluded.trust_level,
      outputs_json = excluded.outputs_json,
      quality_json = excluded.quality_json,
      updated_at = excluded.updated_at
  `);
  const select = database.prepare("SELECT * FROM experimental_runs WHERE run_id = ?");
  const validate = database.prepare(`
    UPDATE experimental_runs
    SET trust_level = 'validated', quality_json = ?, updated_at = ?
    WHERE run_id = ?
  `);

  return Object.freeze({
    saveRun(input = {}) {
      const runId = id(input.runId, "运行标识");
      const templateId = id(input.templateId, "模板标识");
      const templateVersion = Number(input.templateVersion);
      if (!Number.isInteger(templateVersion) || templateVersion < 1) {
        throw storeError("COLLECTOR_RUN_INVALID", "采集器实验模板版本无效。");
      }
      const status = String(input.status || "");
      if (!RUN_STATUSES.has(status)) {
        throw storeError("COLLECTOR_RUN_INVALID", "采集器实验运行状态无效。");
      }
      const trustLevel = String(input.trustLevel || "");
      if (!TRUST_LEVELS.has(trustLevel)) {
        throw storeError("COLLECTOR_RESULT_UNTRUSTED", "实验结果不能写为正式可信事实。");
      }
      const outputsJson = safeJson(input.outputs || {}, "输出");
      const qualityJson = input.quality === null || input.quality === undefined
        ? null
        : safeJson(input.quality, "质量结果");
      const timestamp = now().toISOString();
      upsert.run(
        runId,
        templateId,
        templateVersion,
        hash(input.contentHash),
        status,
        trustLevel,
        outputsJson,
        qualityJson,
        timestamp,
        timestamp
      );
      return rowToRun(select.get(runId));
    },
    getRun(inputRunId) {
      return rowToRun(select.get(id(inputRunId, "运行标识")));
    },
    markValidated(inputRunId, quality) {
      const runId = id(inputRunId, "运行标识");
      if (!fullQuality(quality)) {
        throw storeError("COLLECTOR_QUALITY_INCOMPLETE", "实验结果质量校验未完整通过。");
      }
      const result = validate.run(safeJson(quality, "质量结果"), now().toISOString(), runId);
      if (Number(result.changes || 0) !== 1) {
        throw storeError("COLLECTOR_RUN_NOT_FOUND", "采集器实验运行不存在。");
      }
      return rowToRun(select.get(runId));
    },
    close() {
      database.close();
    }
  });
}
