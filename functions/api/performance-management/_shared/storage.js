import { normalizePerformanceState } from "../../../../src/domain/performanceManagement.js";

const COLLECTIONS = ["templates", "managerAssignments", "assessments", "reviewRequests", "auditLogs"];
export const performanceDatabase = (env = {}) => env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB || null;

export async function ensurePerformanceTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS performance_management_records (
    entity_type TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT,
    PRIMARY KEY (entity_type, id)
  )`).run();
  await db.prepare("CREATE TABLE IF NOT EXISTS performance_management_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)").run();
}

const meta = (db, key, value) => db.prepare(`INSERT INTO performance_management_meta (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(key, String(value ?? ""));

export async function readPerformanceState(db) {
  await ensurePerformanceTables(db);
  const state = normalizePerformanceState();
  const result = await db.prepare("SELECT entity_type, id, payload FROM performance_management_records").all();
  for (const row of result?.results || []) {
    if (!COLLECTIONS.includes(row.entity_type)) continue;
    try { state[row.entity_type].push(JSON.parse(row.payload)); } catch { /* isolate malformed records */ }
  }
  for (const key of ["schemaVersion", "revision", "updatedAt"]) {
    const row = await db.prepare("SELECT value FROM performance_management_meta WHERE key = ?").bind(key).first();
    if (row?.value !== undefined) state[key] = key === "revision" ? Number(row.value) || 0 : row.value;
  }
  return normalizePerformanceState(state);
}

export async function writePerformanceState(db, input, actor = "") {
  const state = normalizePerformanceState(input); await ensurePerformanceTables(db);
  const updatedAt = new Date().toISOString(); const statements = [];
  for (const collection of COLLECTIONS) {
    statements.push(db.prepare("DELETE FROM performance_management_records WHERE entity_type = ?").bind(collection));
    for (const record of state[collection]) if (record.id) statements.push(db.prepare(`INSERT INTO performance_management_records (entity_type,id,payload,updated_at,updated_by)
      VALUES (?,?,?,?,?) ON CONFLICT(entity_type,id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
      .bind(collection, record.id, JSON.stringify(record), updatedAt, actor));
  }
  statements.push(meta(db, "schemaVersion", state.schemaVersion), meta(db, "revision", state.revision), meta(db, "updatedAt", updatedAt));
  await db.batch(statements); return { ...state, updatedAt };
}
