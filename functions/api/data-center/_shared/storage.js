import { DATA_CENTER_PERSISTED_COLLECTIONS, normalizeDataCenterState } from "../../../../src/domain/dataCenter.js";

const TABLES = {
  sources: "data_sources",
  runners: "data_runners",
  syncRuns: "data_sync_runs",
  sourceFiles: "data_source_files",
  mappings: "data_dimension_mappings",
  qualityIssues: "data_quality_issues",
  subscriptions: "data_app_subscriptions",
  auditLogs: "data_audit_logs"
};
const BATCH_SIZE = 50;

export function dataCenterDatabase(env = {}) {
  return env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB || null;
}

export async function ensureDataCenterTables(db) {
  for (const table of Object.values(TABLES)) {
    await db.prepare(`CREATE TABLE IF NOT EXISTS ${table} (
      entity_type TEXT NOT NULL,
      id TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT,
      PRIMARY KEY (entity_type, id)
    )`).run();
  }
  await db.prepare(`CREATE TABLE IF NOT EXISTS data_center_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`).run();
}

function recordId(record) {
  return String(record?.id || record?.metricCode || record?.appId || "").trim();
}

function metaStatement(db, key, value) {
  return db.prepare(`INSERT INTO data_center_meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .bind(key, String(value ?? ""));
}

export async function writeDataCenterState(db, input, actor = "") {
  const state = normalizeDataCenterState(input);
  await ensureDataCenterTables(db);
  const updatedAt = new Date().toISOString();
  const statements = [];
  for (const collection of DATA_CENTER_PERSISTED_COLLECTIONS) {
    const table = TABLES[collection];
    statements.push(db.prepare(`DELETE FROM ${table} WHERE entity_type = ?`).bind(collection));
    for (const record of state[collection]) {
      const id = recordId(record);
      if (!id) continue;
      statements.push(db.prepare(`INSERT INTO ${table} (entity_type, id, payload, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(entity_type, id) DO UPDATE SET
          payload = excluded.payload,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by`)
        .bind(collection, id, JSON.stringify(record), updatedAt, actor));
    }
  }
  statements.push(metaStatement(db, "version", state.version));
  statements.push(metaStatement(db, "updatedAt", updatedAt));
  statements.push(metaStatement(db, "updatedBy", actor));
  statements.push(metaStatement(db, "settings", JSON.stringify(state.settings)));
  for (let index = 0; index < statements.length; index += BATCH_SIZE) {
    await db.batch(statements.slice(index, index + BATCH_SIZE));
  }
  return { updatedAt, version: state.version };
}

async function readMeta(db, key) {
  const row = await db.prepare("SELECT value FROM data_center_meta WHERE key = ?").bind(key).first();
  return row?.value || "";
}

export async function readDataCenterState(db) {
  await ensureDataCenterTables(db);
  const state = normalizeDataCenterState();
  for (const collection of DATA_CENTER_PERSISTED_COLLECTIONS) {
    const table = TABLES[collection];
    const result = await db.prepare(`SELECT entity_type, id, payload, updated_at, updated_by FROM ${table}`).all();
    const records = [];
    for (const row of result?.results || []) {
      try {
        records.push(JSON.parse(row.payload));
      } catch {
        // Isolate malformed legacy records so the remaining data stays available.
      }
    }
    if (records.length || !state[collection].length) state[collection] = records;
  }
  try {
    const legacy = await db.prepare(`SELECT entity_type, id, payload, updated_at, updated_by
      FROM data_metric_definitions_legacy`).all();
    const records = [];
    for (const row of legacy?.results || []) {
      try {
        records.push(JSON.parse(row.payload));
      } catch {
        // Preserve the remaining legacy definitions when one payload is malformed.
      }
    }
    if (records.length) state.metricDefinitions = records;
  } catch {
    // Before migration 0004, keep the built-in compatibility definitions.
  }
  const settings = await readMeta(db, "settings");
  if (settings) {
    try {
      state.settings = { ...state.settings, ...JSON.parse(settings) };
    } catch {
      // Keep defaults when an old settings record is malformed.
    }
  }
  state.version = await readMeta(db, "version") || state.version;
  state.updatedAt = await readMeta(db, "updatedAt");
  return {
    state: normalizeDataCenterState(state),
    version: state.version,
    updatedAt: state.updatedAt,
    updatedBy: await readMeta(db, "updatedBy")
  };
}
