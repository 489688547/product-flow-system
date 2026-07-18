import { getDingUserAccessToken } from "../../dingtalk/_shared/dingtalk.js";
import { ensureAuthTables, getSessionIdHash } from "./session.js";

function tokenError(message, status = 500, code = "") {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

function bytesToBase64(bytes) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(String(value || "")), char => char.charCodeAt(0));
}

async function encryptionKey(env = {}) {
  const raw = String(env.DINGTALK_TOKEN_ENCRYPTION_KEY || "").trim();
  const bytes = raw
    ? base64ToBytes(raw)
    : new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(env.DINGTALK_APP_SECRET || env.DINGTALK_CLIENT_SECRET || ""))));
  if (bytes.length !== 32) throw tokenError("钉钉群授权加密配置无效，请联系管理员。");
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptToken(token, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify({
    accessToken: String(token.accessToken || ""),
    refreshToken: String(token.refreshToken || "")
  }));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(env), plaintext);
  return { ciphertext: bytesToBase64(new Uint8Array(ciphertext)), iv: bytesToBase64(iv) };
}

async function decryptToken(row, env) {
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(row.iv) },
      await encryptionKey(env),
      base64ToBytes(row.access_ciphertext)
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw tokenError("钉钉群授权已失效，请重新授权。", 428, "GROUP_AUTH_REQUIRED");
  }
}

export async function saveDingUserToken(db, sessionIdHash, token = {}, env = {}) {
  if (!db || !sessionIdHash || !token.accessToken) throw tokenError("无法保存钉钉群授权。", 400);
  await ensureAuthTables(db);
  const encrypted = await encryptToken(token, env);
  const seconds = Math.max(60, Number(token.expireIn || token.expiresIn || 7200));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + seconds * 1000).toISOString();
  await db.prepare(`INSERT INTO product_flow_ding_user_tokens (
    session_id_hash, access_ciphertext, iv, expires_at, updated_at
  ) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(session_id_hash) DO UPDATE SET
    access_ciphertext = excluded.access_ciphertext,
    iv = excluded.iv,
    expires_at = excluded.expires_at,
    updated_at = excluded.updated_at`).bind(
    sessionIdHash, encrypted.ciphertext, encrypted.iv, expiresAt, now.toISOString()
  ).run();
}

export async function getValidDingUserToken(request, env = {}, fetchImpl = fetch) {
  const sessionIdHash = await getSessionIdHash(request, env);
  if (!sessionIdHash) throw tokenError("请先使用钉钉登录。", 401);
  await ensureAuthTables(env.PRODUCT_FLOW_DB);
  const row = await env.PRODUCT_FLOW_DB.prepare(
    "SELECT session_id_hash, access_ciphertext, iv, expires_at FROM product_flow_ding_user_tokens WHERE session_id_hash = ?"
  ).bind(sessionIdHash).first();
  if (!row) throw tokenError("需要授权访问当前账号可见的钉钉群。", 428, "GROUP_AUTH_REQUIRED");
  const token = await decryptToken(row, env);
  if (Date.parse(row.expires_at) > Date.now() + 60_000) return token.accessToken;
  if (!token.refreshToken) throw tokenError("群聊授权已过期，请重新授权。", 428, "GROUP_AUTH_REQUIRED");
  const refreshed = await getDingUserAccessToken(env, { refreshToken: token.refreshToken }, fetchImpl);
  await saveDingUserToken(env.PRODUCT_FLOW_DB, sessionIdHash, refreshed, env);
  return refreshed.accessToken;
}

export async function deleteDingUserToken(request, env = {}) {
  const sessionIdHash = await getSessionIdHash(request, env);
  if (!sessionIdHash || !env.PRODUCT_FLOW_DB) return false;
  await ensureAuthTables(env.PRODUCT_FLOW_DB);
  await env.PRODUCT_FLOW_DB.prepare("DELETE FROM product_flow_ding_user_tokens WHERE session_id_hash = ?")
    .bind(sessionIdHash).run();
  return true;
}
