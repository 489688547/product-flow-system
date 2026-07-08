import {
  jsonResponse,
  optionsResponse
} from "./dingtalk/_shared/dingtalk.js";

const STATE_ID = "company";

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
}

function validateStatePayload(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    const error = new Error("缺少有效的产品流程状态数据。");
    error.status = 400;
    throw error;
  }
  const requiredArrays = ["demands", "products", "tasks", "deliverables", "reviews", "feedbackIssues"];
  const missing = requiredArrays.filter(key => !Array.isArray(state[key]));
  if (missing.length) {
    const error = new Error(`状态数据缺少必要列表：${missing.join("、")}`);
    error.status = 400;
    throw error;
  }
}

async function readCompanyState(db) {
  await ensureStateTable(db);
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

async function writeCompanyState(db, state, updatedBy = "") {
  validateStatePayload(state);
  await ensureStateTable(db);
  const updatedAt = new Date().toISOString();
  const version = String(state.version || "unknown");
  const payload = JSON.stringify(state);
  await db.prepare(`INSERT INTO product_flow_state (id, version, payload, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      version = excluded.version,
      payload = excluded.payload,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by`)
    .bind(STATE_ID, version, payload, updatedAt, String(updatedBy || "").slice(0, 80))
    .run();
  return { version, updatedAt };
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (!["GET", "POST"].includes(request.method)) return jsonResponse({ message: "Method not allowed" }, 405);

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
    const saved = await writeCompanyState(db, body.state, body.updatedBy || "");
    return jsonResponse({ synced: true, ...saved });
  } catch (error) {
    return jsonResponse({
      synced: false,
      message: error.message || "公司共享数据同步失败。"
    }, error.status || 500);
  }
}
