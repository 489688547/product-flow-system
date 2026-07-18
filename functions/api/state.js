import {
  jsonResponse,
  optionsResponse
} from "./dingtalk/_shared/dingtalk.js";

const STATE_ID = "company";
const MAX_PART_BYTES = 1_000_000;

function stateDatabase(env = {}) {
  return env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB || null;
}

async function ensureStateTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS product_flow_state (
    id TEXT PRIMARY KEY,
    version TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS product_flow_state_parts (
    state_id TEXT NOT NULL,
    part_key TEXT NOT NULL,
    part_index INTEGER NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT,
    PRIMARY KEY (state_id, part_key, part_index)
  )`).run();
}

export function splitUtf8(value, maxBytes = MAX_PART_BYTES) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(value);
  if (bytes.byteLength <= maxBytes) return [value];
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const chunks = [];
  let offset = 0;
  while (offset < bytes.byteLength) {
    let end = Math.min(offset + maxBytes, bytes.byteLength);
    let chunk = "";
    while (!chunk && end > offset) {
      try {
        chunk = decoder.decode(bytes.subarray(offset, end));
      } catch {
        end -= 1;
      }
    }
    chunks.push(chunk);
    offset = end;
  }
  return chunks;
}

function serializeStateParts(state) {
  return Object.entries(state).flatMap(([key, value]) => {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return [];
    return splitUtf8(serialized).map((payload, index) => ({ key, index, payload }));
  });
}

function deserializeStateParts(rows) {
  const grouped = new Map();
  rows.forEach(row => {
    const chunks = grouped.get(row.part_key) || [];
    chunks[Number(row.part_index)] = row.payload;
    grouped.set(row.part_key, chunks);
  });
  return Object.fromEntries([...grouped].map(([key, chunks]) => [key, JSON.parse(chunks.join(""))]));
}

function validateStatePayload(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    const error = new Error("缺少有效的产品流程状态数据。");
    error.status = 400;
    throw error;
  }
  const requiredArrays = ["demands", "products", "tasks", "deliverables", "reviews", "feedbackIssues", "productPlans"];
  const missing = requiredArrays.filter(key => !Array.isArray(state[key]));
  if (missing.length) {
    const error = new Error(`状态数据缺少必要列表：${missing.join("、")}`);
    error.status = 400;
    throw error;
  }
}

export async function readCompanyState(db) {
  await ensureStateTable(db);
  const partResult = await db.prepare(`SELECT part_key, part_index, payload, updated_at, updated_by
    FROM product_flow_state_parts WHERE state_id = ? ORDER BY part_key, part_index`)
    .bind(STATE_ID)
    .all();
  const parts = partResult?.results || [];
  if (parts.length) {
    const state = deserializeStateParts(parts);
    return {
      state,
      version: String(state.version || "unknown"),
      updatedAt: parts[0].updated_at,
      updatedBy: parts[0].updated_by || ""
    };
  }
  const row = await db.prepare("SELECT payload, version, updated_at, updated_by FROM product_flow_state WHERE id = ?")
    .bind(STATE_ID)
    .first();
  if (!row) return null;
  return {
    state: JSON.parse(row.payload),
    version: row.version,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by || ""
  };
}

export async function writeCompanyState(db, state, updatedBy = "") {
  validateStatePayload(state);
  await ensureStateTable(db);
  const updatedAt = new Date().toISOString();
  const version = String(state.version || "unknown");
  const actor = String(updatedBy || "").slice(0, 80);
  const parts = serializeStateParts(state);
  const statements = [
    db.prepare("DELETE FROM product_flow_state_parts WHERE state_id = ?").bind(STATE_ID),
    ...parts.map(part => db.prepare(`INSERT INTO product_flow_state_parts
      (state_id, part_key, part_index, payload, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(STATE_ID, part.key, part.index, part.payload, updatedAt, actor)),
    db.prepare("DELETE FROM product_flow_state WHERE id = ?").bind(STATE_ID)
  ];
  await db.batch(statements);
  return { version, updatedAt };
}

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (!["GET", "POST"].includes(request.method)) return jsonResponse({ message: "Method not allowed" }, 405);
  if (request.method === "POST" && data.session?.role === "readonly") {
    return jsonResponse({ synced: false, message: "只读账号不能修改公司共享数据。" }, 403);
  }

  const db = stateDatabase(env);
  if (!db) {
    return jsonResponse({
      synced: false,
      message: "缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB，当前只能使用本地浏览器缓存。"
    }, 501);
  }

  try {
    if (request.method === "GET") {
      const stored = await readCompanyState(db);
      return jsonResponse(stored ? { synced: true, ...stored } : { synced: false, state: null });
    }
    const body = await request.json().catch(() => ({}));
    const saved = await writeCompanyState(db, body.state, data.session?.name || body.updatedBy || "");
    return jsonResponse({ synced: true, ...saved });
  } catch (error) {
    return jsonResponse({
      synced: false,
      message: error.message || "公司共享数据同步失败。"
    }, error.status || 500);
  }
}
