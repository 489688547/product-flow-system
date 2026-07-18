import { normalizeEcommerceOperationsState } from "../../../../src/domain/ecommerceOperations.js";

const COLLECTIONS = ["cycles", "plans", "executions", "collaborations", "responsibilities", "playbooks", "aiReviews", "auditLogs"];

export function operationsDatabase(env = {}) {
  return env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB || null;
}

export async function ensureOperationsTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS ecommerce_operation_records (
    entity_type TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL,
    updated_at TEXT NOT NULL, updated_by TEXT,
    PRIMARY KEY (entity_type, id)
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS ecommerce_operation_meta (
    key TEXT PRIMARY KEY, value TEXT NOT NULL
  )`).run();
}

function meta(db, key, value) {
  return db.prepare(`INSERT INTO ecommerce_operation_meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(key, String(value ?? ""));
}

export async function readOperationsState(db) {
  await ensureOperationsTables(db);
  const state = normalizeEcommerceOperationsState();
  const result = await db.prepare("SELECT entity_type, id, payload FROM ecommerce_operation_records").all();
  for (const row of result?.results || []) {
    if (!COLLECTIONS.includes(row.entity_type)) continue;
    try { state[row.entity_type].push(JSON.parse(row.payload)); } catch { /* isolate malformed records */ }
  }
  for (const key of ["schemaVersion", "revision", "updatedAt"]) {
    const row = await db.prepare("SELECT value FROM ecommerce_operation_meta WHERE key = ?").bind(key).first();
    if (row?.value !== undefined) state[key] = key === "revision" ? Number(row.value) || 0 : row.value;
  }
  return normalizeEcommerceOperationsState(state);
}

export async function writeOperationsState(db, input, actor = "") {
  const state = normalizeEcommerceOperationsState(input);
  await ensureOperationsTables(db);
  const updatedAt = new Date().toISOString();
  const statements = [];
  for (const collection of COLLECTIONS) {
    statements.push(db.prepare("DELETE FROM ecommerce_operation_records WHERE entity_type = ?").bind(collection));
    for (const record of state[collection]) {
      if (!record.id) continue;
      statements.push(db.prepare(`INSERT INTO ecommerce_operation_records (entity_type, id, payload, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(entity_type, id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at, updated_by=excluded.updated_by`)
        .bind(collection, record.id, JSON.stringify(record), updatedAt, actor));
    }
  }
  statements.push(meta(db, "schemaVersion", state.schemaVersion));
  statements.push(meta(db, "revision", state.revision));
  statements.push(meta(db, "updatedAt", updatedAt));
  await db.batch(statements);
  return { ...state, updatedAt };
}
