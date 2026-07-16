import { jsonResponse, optionsResponse } from "./dingtalk/_shared/dingtalk.js";
import { canAccessCompanyPlatform } from "../../src/domain/permissions.js";

const COLLECTIONS = [
  "strategies",
  "requiredResults",
  "departmentCommitments",
  "commitmentMilestones",
  "incentiveProjects",
  "departmentRewardBudgets",
  "monthlyReports",
  "reportCorrections",
  "objectives",
  "metrics",
  "projects",
  "milestones",
  "risks",
  "decisionRequests",
  "personalTodos",
  "statusUpdates",
  "monthlySnapshots",
  "appLinks",
  "appEvents",
  "appRegistry",
  "auditLogs"
];

function platformDatabase(env = {}) {
  return env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB || null;
}

async function ensureTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS platform_records (
    entity_type TEXT NOT NULL,
    id TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT,
    PRIMARY KEY (entity_type, id)
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS platform_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`).run();
}

function validateState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    const error = new Error("缺少有效的战略执行平台数据。");
    error.status = 400;
    throw error;
  }
  const missing = COLLECTIONS.filter(key => !Array.isArray(state[key]));
  if (missing.length) {
    const error = new Error(`战略执行数据缺少必要列表：${missing.join("、")}`);
    error.status = 400;
    throw error;
  }
}

async function writeMeta(db, key, value) {
  await db.prepare(`INSERT INTO platform_meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .bind(key, String(value || ""))
    .run();
}

async function writePlatformState(db, state, updatedBy) {
  validateState(state);
  await ensureTables(db);
  const updatedAt = new Date().toISOString();
  for (const collection of COLLECTIONS) {
    await db.prepare("DELETE FROM platform_records WHERE entity_type = ?").bind(collection).run();
    for (const record of state[collection]) {
      if (!record?.id) continue;
      await db.prepare(`INSERT INTO platform_records (entity_type, id, payload, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(entity_type, id) DO UPDATE SET
          payload = excluded.payload,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by`)
        .bind(collection, String(record.id), JSON.stringify(record), updatedAt, updatedBy)
        .run();
    }
  }
  await writeMeta(db, "version", state.version || "strategy-platform-v1");
  await writeMeta(db, "updatedAt", updatedAt);
  await writeMeta(db, "updatedBy", updatedBy);
  return { updatedAt, version: state.version || "strategy-platform-v1" };
}

async function readMeta(db, key) {
  const row = await db.prepare("SELECT value FROM platform_meta WHERE key = ?").bind(key).first();
  return row?.value || "";
}

async function readPlatformState(db) {
  await ensureTables(db);
  const result = await db.prepare("SELECT entity_type, id, payload, updated_at, updated_by FROM platform_records").all();
  const rows = result?.results || [];
  if (!rows.length) return null;
  const state = Object.fromEntries(COLLECTIONS.map(key => [key, []]));
  rows.forEach(row => {
    if (!COLLECTIONS.includes(row.entity_type)) return;
    try {
      state[row.entity_type].push(JSON.parse(row.payload));
    } catch {
      // A malformed record is isolated so other company data remains available.
    }
  });
  state.version = await readMeta(db, "version") || "strategy-platform-v1";
  state.updatedAt = await readMeta(db, "updatedAt");
  return {
    state,
    version: state.version,
    updatedAt: state.updatedAt,
    updatedBy: await readMeta(db, "updatedBy")
  };
}

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (!["GET", "POST"].includes(request.method)) return jsonResponse({ message: "Method not allowed" }, 405);
  if (!canAccessCompanyPlatform(data.session)) {
    return jsonResponse({ synced: false, message: "当前仅总经办可访问经营执行平台。" }, 403);
  }
  if (request.method === "POST" && data.session?.role === "readonly") {
    return jsonResponse({ synced: false, message: "只读账号不能修改战略执行数据。" }, 403);
  }
  const db = platformDatabase(env);
  if (!db) {
    return jsonResponse({
      synced: false,
      message: "缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB，当前只能使用本地浏览器缓存。"
    }, 501);
  }
  try {
    if (request.method === "GET") {
      const stored = await readPlatformState(db);
      return jsonResponse(stored ? { synced: true, ...stored } : { synced: false, state: null });
    }
    const body = await request.json().catch(() => ({}));
    const saved = await writePlatformState(db, body.state, String(data.session?.name || "").slice(0, 80));
    return jsonResponse({ synced: true, ...saved });
  } catch (error) {
    return jsonResponse({ synced: false, message: error.message || "战略执行数据同步失败。" }, error.status || 500);
  }
}
