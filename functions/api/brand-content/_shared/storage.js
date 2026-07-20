import { normalizeBrandContentState } from "../../../../src/domain/brandContent.js";

export async function ensureBrandContentTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS brand_content_state (
    id TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL
  )`).run();
}

export function parseBrandContentState(row) {
  if (!row) return null;
  try {
    const state = normalizeBrandContentState(JSON.parse(row.payload));
    const version = Math.max(0, Math.trunc(Number(row.version) || 0));
    return { state: { ...state, version }, version, updatedAt: row.updated_at || "", updatedBy: row.updated_by || "" };
  } catch {
    const error = new Error("品牌内容数据损坏，已停止写入，请联系平台管理员恢复。");
    error.status = 500;
    error.code = "BRAND_CONTENT_STATE_CORRUPT";
    throw error;
  }
}

export async function readBrandContentState(db) {
  await ensureBrandContentTable(db);
  const row = await db.prepare("SELECT id, version, payload, updated_at, updated_by FROM brand_content_state WHERE id = ?")
    .bind("company")
    .first();
  return parseBrandContentState(row);
}
