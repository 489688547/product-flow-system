import { SUPPLY_COLLECTIONS, normalizeSupplyChainState } from "../../../../src/domain/supplyChain.js";

export function supplyDatabase(env = {}) {
  return env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB || null;
}

export async function ensureSupplyTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS supply_chain_records (
    entity_type TEXT NOT NULL,
    id TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT,
    PRIMARY KEY (entity_type, id)
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS supply_chain_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`).run();
}

function stateRecordId(record) {
  return String(record?.id || record?.processInstanceId || "").trim();
}

function metaStatement(db, key, value) {
  return db.prepare(`INSERT INTO supply_chain_meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .bind(key, String(value ?? ""));
}

export async function writeSupplyState(db, input, actor = "") {
  const state = normalizeSupplyChainState(input);
  await ensureSupplyTables(db);
  const updatedAt = new Date().toISOString();
  const statements = [];
  for (const collection of SUPPLY_COLLECTIONS) {
    statements.push(db.prepare("DELETE FROM supply_chain_records WHERE entity_type = ?").bind(collection));
    for (const record of state[collection]) {
      const id = stateRecordId(record);
      if (!id) continue;
      statements.push(db.prepare(`INSERT INTO supply_chain_records (entity_type, id, payload, updated_at, updated_by)
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
  await db.batch(statements);
  return { updatedAt, version: state.version };
}

async function readMeta(db, key) {
  const row = await db.prepare("SELECT value FROM supply_chain_meta WHERE key = ?").bind(key).first();
  return row?.value || "";
}

export async function readSupplyState(db) {
  await ensureSupplyTables(db);
  const result = await db.prepare("SELECT entity_type, id, payload, updated_at, updated_by FROM supply_chain_records").all();
  const state = normalizeSupplyChainState();
  for (const row of result?.results || []) {
    if (!SUPPLY_COLLECTIONS.includes(row.entity_type)) continue;
    try {
      state[row.entity_type].push(JSON.parse(row.payload));
    } catch {
      // A malformed record is isolated so the remaining operational data stays available.
    }
  }
  const settings = await readMeta(db, "settings");
  if (settings) {
    try {
      state.settings = { ...state.settings, ...JSON.parse(settings) };
    } catch {
      // Preserve defaults when an old settings payload is malformed.
    }
  }
  state.version = await readMeta(db, "version") || state.version;
  state.updatedAt = await readMeta(db, "updatedAt");
  return {
    state: normalizeSupplyChainState(state),
    version: state.version,
    updatedAt: state.updatedAt,
    updatedBy: await readMeta(db, "updatedBy")
  };
}
