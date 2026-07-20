import { DOUYIN_ECOMMERCE } from "../../../../../../src/domain/dataConnections.js";
import { decryptPlatformCredentials, encryptPlatformCredentials, platformCredentialCryptoInternals } from "../../../_shared/credentialCrypto.js";
import { DataConnectionHttpError } from "./http.js";

function randomId(prefix) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now().toString(36)}`;
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function parseJson(value, fallback) {
  try { return JSON.parse(value || ""); } catch { return fallback; }
}

function metadata(row, shops = []) {
  const accountLabel = row.account_label;
  return {
    id: row.id,
    platformId: row.platform_id,
    accountLabel,
    credentialSchemaId: row.credential_schema_id,
    loginEmail: row.platform_id === DOUYIN_ECOMMERCE.id ? accountLabel : undefined,
    status: row.status,
    credentialVersion: Number(row.credential_version || 1),
    lastVerifiedAt: row.last_verified_at || "",
    version: Number(row.version || 1),
    updatedAt: row.updated_at || "",
    shops
  };
}

function shopMetadata(row) {
  return {
    id: row.id,
    connectionId: row.connection_id,
    shopId: row.shop_id,
    shopName: row.shop_name,
    shopAvatarUrl: row.shop_avatar_url || "",
    status: row.status,
    lastVerifiedAt: row.last_verified_at
  };
}

function cryptoPlatformId(connectionId, platformId = DOUYIN_ECOMMERCE.id) {
  return `${platformId}:${connectionId}`;
}

function assertKey(masterKey) {
  if (!platformCredentialCryptoInternals.validMasterKey(masterKey)) {
    throw new DataConnectionHttpError(503, "PLATFORM_CREDENTIAL_KEY_UNAVAILABLE", "数据连接的加密能力暂不可用。", undefined, true);
  }
}

async function writeAudit(db, { connectionId = "", action, result = "success", requestId = "", actor, details = {}, now }) {
  await db.prepare(`INSERT INTO data_connection_audit
    (id, connection_id, action, result, request_id, actor_id, actor_name, details, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`)
    .bind(randomId("audit"), connectionId || null, action, result, requestId || randomId("req"), actor.userId, actor.name, JSON.stringify(details), now).run();
}

export function createDataConnectionStore(db, { masterKey, actor, requestId = "", now = () => new Date() } = {}) {
  assertKey(masterKey);
  return {
    async list() {
      const [connectionResult, shopResult] = await Promise.all([
        db.prepare("SELECT * FROM data_connections WHERE platform_id = ?1 ORDER BY updated_at DESC").bind(DOUYIN_ECOMMERCE.id).all(),
        db.prepare("SELECT * FROM data_connection_shops WHERE platform_id = ?1 ORDER BY updated_at DESC").bind(DOUYIN_ECOMMERCE.id).all()
      ]);
      const shopsByConnection = new Map();
      for (const row of shopResult.results || []) {
        const shops = shopsByConnection.get(row.connection_id) || [];
        shops.push(shopMetadata(row));
        shopsByConnection.set(row.connection_id, shops);
      }
      return (connectionResult.results || []).map(row => metadata(row, shopsByConnection.get(row.id) || []));
    },

    async save(input) {
      const timestamp = now().toISOString();
      const id = clean(input.id, 100) || randomId("connection");
      const current = await db.prepare("SELECT * FROM data_connections WHERE id = ?1 AND platform_id = ?2").bind(id, DOUYIN_ECOMMERCE.id).first();
      const expectedVersion = Number(input.expectedVersion || 0);
      if (Number(current?.version || 0) !== expectedVersion) {
        throw new DataConnectionHttpError(409, "DATA_CONNECTION_VERSION_CONFLICT", "连接已被其他人更新，请刷新后重试。", { currentVersion: Number(current?.version || 0) });
      }
      let previous = {};
      if (current) {
        previous = await decryptPlatformCredentials(current, {
          masterKey,
          platformId: cryptoPlatformId(id),
          keyVersion: Number(current.key_version || 1)
        });
      }
      const submittedPassword = String(input.password || "");
      if (submittedPassword.length > 500) throw new DataConnectionHttpError(400, "DATA_CONNECTION_PASSWORD_INVALID", "密码长度超出限制。");
      const password = submittedPassword || previous.password;
      if (!password) throw new DataConnectionHttpError(400, "DATA_CONNECTION_PASSWORD_REQUIRED", "请输入密码。");
      const encrypted = await encryptPlatformCredentials({ password }, { masterKey, platformId: cryptoPlatformId(id), keyVersion: 1 });
      const credentialVersion = Number(current?.credential_version || 0) + 1;
      const version = expectedVersion + 1;
      let result;
      if (current) {
        result = await db.prepare(`UPDATE data_connections SET account_label = ?1, credential_schema_id = ?2,
          ciphertext = ?3, iv = ?4, algorithm = ?5, key_version = ?6, credential_version = ?7,
          status = 'queued', version = ?8, updated_at = ?9, updated_by = ?10
          WHERE id = ?11 AND platform_id = ?12 AND version = ?13`)
          .bind(input.loginEmail, "email-password-v1", encrypted.ciphertext, encrypted.iv, encrypted.algorithm, encrypted.keyVersion, credentialVersion, version, timestamp, actor.name, id, DOUYIN_ECOMMERCE.id, expectedVersion).run();
        if (Number(result?.meta?.changes ?? 0) !== 1) throw new DataConnectionHttpError(409, "DATA_CONNECTION_VERSION_CONFLICT", "连接已被其他人更新，请刷新后重试。");
      } else {
        await db.prepare(`INSERT INTO data_connections
          (id, platform_id, account_label, credential_schema_id, ciphertext, iv, algorithm, key_version, credential_version, status, version,
            last_verified_at, created_at, created_by, updated_at, updated_by)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'queued', ?10, NULL, ?11, ?12, ?11, ?12)`)
          .bind(id, DOUYIN_ECOMMERCE.id, input.loginEmail, "email-password-v1", encrypted.ciphertext, encrypted.iv, encrypted.algorithm, encrypted.keyVersion, credentialVersion, version, timestamp, actor.name).run();
      }
      const taskId = randomId("task");
      const idempotencyKey = `${id}:${credentialVersion}:douyin_login_verification`;
      const expiresAt = new Date(now().getTime() + 24 * 60 * 60 * 1000).toISOString();
      await db.prepare(`INSERT INTO browser_agent_tasks
        (id, task_type, resource_type, schema_version, cursor, platform_id, connection_id, credential_version, idempotency_key, status, claimed_by,
          claim_expires_at, attempt, result_summary, error_code, expires_at, created_at, updated_at)
        VALUES (?1, 'douyin_login_verification', 'connection_identity', 'v1', NULL, ?2, ?3, ?4, ?5, 'queued', NULL, NULL, 0, '{}', NULL, ?6, ?7, ?7)
        ON CONFLICT(idempotency_key) DO NOTHING`)
        .bind(taskId, DOUYIN_ECOMMERCE.id, id, credentialVersion, idempotencyKey, expiresAt, timestamp).run();
      await writeAudit(db, { connectionId: id, action: current ? "replace_credentials" : "create", requestId, actor, details: { credentialVersion }, now: timestamp });
      return metadata({
        id,
        platform_id: DOUYIN_ECOMMERCE.id,
        account_label: input.loginEmail,
        credential_schema_id: "email-password-v1",
        status: "queued",
        credential_version: credentialVersion,
        last_verified_at: current?.last_verified_at || "",
        version,
        updated_at: timestamp
      }, []);
    },

    async reveal(connectionId) {
      const timestamp = now().toISOString();
      const since = new Date(now().getTime() - 15 * 60 * 1000).toISOString();
      const countRow = await db.prepare(`SELECT COUNT(*) AS count FROM data_connection_audit
        WHERE connection_id = ?1 AND action = 'reveal' AND result = 'success' AND created_at >= ?2`).bind(connectionId, since).first();
      if (Number(countRow?.count || 0) >= 5) {
        throw new DataConnectionHttpError(429, "DATA_CONNECTION_REVEAL_RATE_LIMITED", "明文查看次数过多，请稍后再试。");
      }
      const row = await db.prepare("SELECT * FROM data_connections WHERE id = ?1 AND platform_id = ?2").bind(connectionId, DOUYIN_ECOMMERCE.id).first();
      if (!row) throw new DataConnectionHttpError(404, "DATA_CONNECTION_NOT_FOUND", "数据连接不存在。");
      const credentials = await decryptPlatformCredentials(row, { masterKey, platformId: cryptoPlatformId(connectionId), keyVersion: Number(row.key_version || 1) });
      await writeAudit(db, { connectionId, action: "reveal", requestId, actor, now: timestamp });
      return {
        platformId: row.platform_id,
        accountLabel: row.account_label,
        credentialSchemaId: row.credential_schema_id,
        loginEmail: row.platform_id === DOUYIN_ECOMMERCE.id ? row.account_label : undefined,
        password: credentials.password
      };
    }
  };
}

export const dataConnectionStorageInternals = { cryptoPlatformId, metadata, parseJson };
