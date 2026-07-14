const SESSION_COOKIE = "pfs_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function authDatabase(env = {}) {
  return env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB || null;
}

function requireDatabase(env = {}) {
  const db = authDatabase(env);
  if (!db) {
    const error = new Error("缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB，无法创建登录会话。");
    error.status = 501;
    throw error;
  }
  return db;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function cookieValue(request, name) {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === name) return decodeURIComponent(valueParts.join("="));
  }
  return "";
}

function publicSession(row = {}) {
  return {
    corpId: row.corp_id || "",
    userId: row.user_id || "",
    unionId: row.union_id || "",
    name: row.name || "",
    role: row.role || "readonly",
    department: row.department || "",
    title: row.title || "",
    loginMode: row.login_mode || "",
    expiresAt: row.expires_at || ""
  };
}

export async function ensureAuthTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS product_flow_sessions (
    id_hash TEXT PRIMARY KEY,
    corp_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    union_id TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    department TEXT,
    title TEXT,
    login_mode TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS product_flow_org_members (
    corp_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    union_id TEXT,
    name TEXT NOT NULL,
    department TEXT,
    title TEXT,
    role TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    synced_at TEXT NOT NULL,
    PRIMARY KEY (corp_id, user_id)
  )`).run();
}

export async function upsertOrgMembers(db, org = {}, corpId = "") {
  await ensureAuthTables(db);
  const normalizedCorpId = String(corpId || org.corpId || "");
  const syncedAt = String(org.syncedAt || new Date().toISOString());
  await db.prepare("UPDATE product_flow_org_members SET active = 0, synced_at = ? WHERE corp_id = ?")
    .bind(syncedAt, normalizedCorpId)
    .run();
  for (const user of Array.isArray(org.users) ? org.users : []) {
    if (!user.userId) continue;
    await db.prepare(`INSERT INTO product_flow_org_members (
      corp_id, user_id, union_id, name, department, title, role, active, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(corp_id, user_id) DO UPDATE SET
      union_id = excluded.union_id,
      name = excluded.name,
      department = excluded.department,
      title = excluded.title,
      role = excluded.role,
      active = excluded.active,
      synced_at = excluded.synced_at`).bind(
      normalizedCorpId,
      String(user.userId),
      String(user.unionId || ""),
      String(user.name || user.userId),
      (Array.isArray(user.departmentNames) ? user.departmentNames : [user.department]).filter(Boolean).join(" / "),
      String(user.title || ""),
      String(user.role || "readonly"),
      user.active === false ? 0 : 1,
      syncedAt
    ).run();
  }
}

export function sessionCookie(token) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function createSession(identity = {}, loginMode = "browser", env = {}) {
  const db = requireDatabase(env);
  await ensureAuthTables(db);
  const token = randomToken();
  const idHash = await hashToken(token);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_SECONDS * 1000);

  await db.prepare(`INSERT INTO product_flow_sessions (
    id_hash, corp_id, user_id, union_id, name, role, department, title,
    login_mode, created_at, last_seen_at, expires_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    idHash,
    String(identity.corpId || ""),
    String(identity.userId || ""),
    String(identity.unionId || ""),
    String(identity.name || ""),
    String(identity.role || "readonly"),
    String(identity.department || ""),
    String(identity.title || ""),
    String(loginMode || "browser"),
    createdAt.toISOString(),
    createdAt.toISOString(),
    expiresAt.toISOString()
  ).run();

  return {
    token,
    cookie: sessionCookie(token),
    session: {
      ...identity,
      loginMode,
      expiresAt: expiresAt.toISOString()
    }
  };
}

export async function readSession(request, env = {}) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const db = authDatabase(env);
  if (!db) return null;
  await ensureAuthTables(db);
  const idHash = await hashToken(token);
  const row = await db.prepare(`SELECT id_hash, corp_id, user_id, union_id, name, role,
    department, title, login_mode, created_at, last_seen_at, expires_at, revoked_at
    FROM product_flow_sessions WHERE id_hash = ?`).bind(idHash).first();
  if (!row || row.revoked_at || Date.parse(row.expires_at) <= Date.now()) return null;

  const lastSeenAt = new Date().toISOString();
  await db.prepare("UPDATE product_flow_sessions SET last_seen_at = ? WHERE id_hash = ?")
    .bind(lastSeenAt, idHash)
    .run();
  return publicSession(row);
}

export async function requireSession(request, env = {}) {
  const session = await readSession(request, env);
  if (session) return session;
  const error = new Error("请先使用钉钉登录。");
  error.status = 401;
  throw error;
}

export async function revokeSession(request, env = {}) {
  const token = cookieValue(request, SESSION_COOKIE);
  const db = authDatabase(env);
  if (!token || !db) return false;
  await ensureAuthTables(db);
  const idHash = await hashToken(token);
  const row = await db.prepare("SELECT id_hash FROM product_flow_sessions WHERE id_hash = ?")
    .bind(idHash)
    .first();
  if (!row) return false;
  await db.prepare("UPDATE product_flow_sessions SET revoked_at = ? WHERE id_hash = ?")
    .bind(new Date().toISOString(), idHash)
    .run();
  return true;
}

export const authSessionInternals = {
  cookieValue,
  hashToken,
  publicSession
};
