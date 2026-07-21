import {
  jsonResponse,
  optionsResponse
} from "./dingtalk/_shared/dingtalk.js";
import {
  ensureProductionAccessTables,
  finishProductionAudit,
  saveProductionSnapshot,
  startProductionAudit
} from "./platform/_shared/productionDataAccess.js";

const STATE_ID = "company";
const MAX_PART_BYTES = 1_000_000;

function stateDatabase(env = {}) {
  return env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB || null;
}

function stateError(message, status, code, retryable = false) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.retryable = retryable;
  return error;
}

function stateErrorResponse(error) {
  const message = error?.message || "公司共享数据同步失败。";
  const requestId = crypto.randomUUID?.() || `req_${Date.now().toString(36)}`;
  return jsonResponse({
    synced: false,
    message,
    error: {
      code: error?.code || "SHARED_STATE_WRITE_FAILED",
      message,
      requestId,
      retryable: Boolean(error?.retryable)
    }
  }, error?.status || 500);
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
  await db.prepare(`INSERT OR IGNORE INTO product_flow_state (id, version, payload, updated_at, updated_by)
    SELECT ?, ?, ?, updated_at, updated_by
    FROM product_flow_state_parts
    WHERE state_id = ?
    ORDER BY part_key, part_index
    LIMIT 1`)
    .bind(STATE_ID, "unknown", "{}", STATE_ID)
    .run();
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

function nextStateTimestamp(baseUpdatedAt = "") {
  const baseTime = Date.parse(baseUpdatedAt);
  const nextTime = Number.isFinite(baseTime) ? Math.max(Date.now(), baseTime + 1) : Date.now();
  return new Date(nextTime).toISOString();
}

export async function writeCompanyState(db, state, updatedBy = "", { baseUpdatedAt = "" } = {}) {
  validateStatePayload(state);
  await ensureStateTable(db);
  const updatedAt = nextStateTimestamp(baseUpdatedAt);
  const version = String(state.version || "unknown");
  const actor = String(updatedBy || "").slice(0, 80);
  const parts = serializeStateParts(state);
  const manifestPayload = JSON.stringify({ writeToken: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}` });
  if (!baseUpdatedAt) {
    await db.batch([
      db.prepare("DELETE FROM product_flow_state_parts WHERE state_id = ?").bind(STATE_ID),
      ...parts.map(part => db.prepare(`INSERT INTO product_flow_state_parts
        (state_id, part_key, part_index, payload, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(STATE_ID, part.key, part.index, part.payload, updatedAt, actor)),
      db.prepare(`INSERT INTO product_flow_state (id, version, payload, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET version = excluded.version, payload = excluded.payload,
          updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
        .bind(STATE_ID, version, manifestPayload, updatedAt, actor)
    ]);
    return { version, updatedAt };
  }

  const guardSql = `EXISTS (SELECT 1 FROM product_flow_state
    WHERE id = ? AND updated_at = ? AND payload = ?)`;
  const results = await db.batch([
    db.prepare(`UPDATE product_flow_state SET version = ?, payload = ?, updated_at = ?, updated_by = ?
      WHERE id = ? AND updated_at = ?`)
      .bind(version, manifestPayload, updatedAt, actor, STATE_ID, baseUpdatedAt),
    db.prepare(`DELETE FROM product_flow_state_parts WHERE state_id = ? AND ${guardSql}`)
      .bind(STATE_ID, STATE_ID, updatedAt, manifestPayload),
    ...parts.map(part => db.prepare(`INSERT INTO product_flow_state_parts
      (state_id, part_key, part_index, payload, updated_at, updated_by)
      SELECT ?, ?, ?, ?, ?, ? WHERE ${guardSql}`)
      .bind(STATE_ID, part.key, part.index, part.payload, updatedAt, actor, STATE_ID, updatedAt, manifestPayload))
  ]);
  if (Number(results?.[0]?.meta?.changes || 0) !== 1) {
    throw stateError("线上数据已被其他页面更新，本次修改未覆盖线上数据，请刷新后重新操作。", 409, "SHARED_STATE_VERSION_CONFLICT", true);
  }
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
    const before = await readCompanyState(db);
    if (!before) {
      throw stateError("线上共享数据尚未初始化，已阻止默认数据自动写入。", 409, "SHARED_STATE_NOT_INITIALIZED");
    }
    if (!body.baseUpdatedAt) {
      throw stateError("缺少线上数据基线，请先刷新后再操作。", 409, "SHARED_STATE_BASE_REQUIRED", true);
    }
    if (body.baseUpdatedAt !== before.updatedAt) {
      throw stateError("线上数据已被其他页面更新，本次修改未覆盖线上数据，请刷新后重新操作。", 409, "SHARED_STATE_VERSION_CONFLICT", true);
    }

    await ensureProductionAccessTables(db);
    const snapshotId = await saveProductionSnapshot(db, before);
    const session = data.session || {};
    const audit = await startProductionAudit({
      db,
      action: "shared-state-write",
      access: {
        userId: session.userId || "company-session",
        unionId: session.unionId || "",
        name: session.name || "公司会话"
      },
      unlock: { reason: "产品全周期共享状态保存" },
      snapshotId,
      before,
      sourceEnvironment: ["localhost", "127.0.0.1", "::1"].includes(new URL(request.url).hostname)
        ? "development"
        : "production"
    });
    try {
      const saved = await writeCompanyState(db, body.state, session.name || "公司会话", { baseUpdatedAt: body.baseUpdatedAt });
      await finishProductionAudit(db, audit.id, saved);
      return jsonResponse({ synced: true, ...saved, auditId: audit.id });
    } catch (error) {
      await finishProductionAudit(db, audit.id, before, "failed").catch(() => {});
      throw error;
    }
  } catch (error) {
    return stateErrorResponse(error);
  }
}
