export const DATA_ENVIRONMENT_COOKIE = "pfs_data_environment";
export const DATA_ENVIRONMENT_GRANT_TTL_SECONDS = 7 * 24 * 60 * 60;

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomToken() {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashEnvironmentToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(token || "")));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
}

export function environmentCookieToken(request) {
  const raw = request?.headers?.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === DATA_ENVIRONMENT_COOKIE) return decodeURIComponent(valueParts.join("="));
  }
  return "";
}

export function environmentGrantCookie(token, requestUrl = "") {
  let secure = true;
  try {
    const url = new URL(requestUrl);
    secure = url.protocol === "https:" || !["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    secure = true;
  }
  return [
    `${DATA_ENVIRONMENT_COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    secure ? "Secure" : "",
    "SameSite=Lax",
    "Path=/"
  ].filter(Boolean).join("; ");
}

function safeJson(value, fallback = {}) {
  try {
    const parsed = JSON.parse(String(value || ""));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function normalizeDisplayEnvironmentState(row = null) {
  if (!row) {
    return {
      enabled: false,
      status: "empty",
      version: 1,
      activeJobId: "",
      ruleVersion: "",
      sourceUpdatedAt: "",
      coverage: {},
      validation: {},
      lastErrorCode: "",
      updatedAt: ""
    };
  }
  return {
    enabled: Number(row.enabled) === 1,
    status: String(row.status || "empty"),
    version: Math.max(1, Number(row.version || 1)),
    activeJobId: String(row.active_job_id || ""),
    ruleVersion: String(row.rule_version || ""),
    sourceUpdatedAt: String(row.source_updated_at || ""),
    coverage: safeJson(row.coverage_json),
    validation: safeJson(row.validation_json),
    lastErrorCode: String(row.last_error_code || ""),
    updatedAt: String(row.updated_at || "")
  };
}

export async function getDisplayEnvironmentState(controlDb) {
  const row = await controlDb.prepare(`SELECT id, enabled, status, version, active_job_id,
    rule_version, source_updated_at, coverage_json, validation_json, last_error_code,
    updated_by, updated_at
    FROM demo_data_environment_state WHERE id = 'display'`).first();
  return normalizeDisplayEnvironmentState(row);
}

export async function resolveEnvironmentGrant(controlDb, tokenHash) {
  if (!tokenHash) return null;
  return controlDb.prepare(`SELECT id, token_hash, actor_id, environment_id,
    environment_version, expires_at, revoked_at, created_at, updated_at
    FROM data_environment_grants WHERE token_hash = ?`)
    .bind(tokenHash)
    .first();
}

export async function createEnvironmentGrant(controlDb, {
  actorId,
  environmentId,
  environmentVersion,
  now = new Date()
}) {
  const token = randomToken();
  const tokenHash = await hashEnvironmentToken(token);
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + DATA_ENVIRONMENT_GRANT_TTL_SECONDS * 1000).toISOString();
  const id = crypto.randomUUID?.() || `environment_grant_${now.getTime().toString(36)}`;
  await controlDb.prepare(`INSERT INTO data_environment_grants (
    id, token_hash, actor_id, environment_id, environment_version,
    expires_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    id,
    tokenHash,
    actorId,
    environmentId,
    environmentVersion,
    expiresAt,
    createdAt,
    createdAt
  ).run();
  return { token, tokenHash, id, expiresAt };
}

export async function revokeEnvironmentGrant(controlDb, tokenHash, actorId, now = new Date()) {
  if (!tokenHash || !actorId) return false;
  const timestamp = now.toISOString();
  await controlDb.prepare(`UPDATE data_environment_grants SET revoked_at = ?, updated_at = ?
    WHERE token_hash = ? AND actor_id = ? AND revoked_at IS NULL`)
    .bind(timestamp, timestamp, tokenHash, actorId)
    .run();
  return true;
}

export async function appendDataEnvironmentAudit(controlDb, {
  actorId,
  action,
  environmentId,
  environmentVersion,
  jobId = "",
  resultCode,
  now = new Date()
}) {
  const id = crypto.randomUUID?.() || `environment_audit_${now.getTime().toString(36)}`;
  await controlDb.prepare(`INSERT INTO data_environment_audit (
    id, actor_id, action, environment_id, environment_version, job_id, result_code, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    id,
    actorId,
    action,
    environmentId,
    environmentVersion,
    jobId || null,
    resultCode,
    now.toISOString()
  ).run();
  return id;
}
