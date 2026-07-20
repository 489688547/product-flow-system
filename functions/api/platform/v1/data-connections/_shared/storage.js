import { DOUYIN_ECOMMERCE } from "../../../../../../src/domain/dataConnections.js";
import {
  assertCredentialRevealRateLimit,
  createCredentialEntry,
  replaceCredentialEntry,
  revealCredentialEntry
} from "../../../_shared/credentialVaultStorage.js";
import { DataConnectionHttpError } from "./http.js";

function randomId(prefix) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now().toString(36)}`;
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
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

function vaultContext({ masterKey, actor, requestId, purpose }) {
  return {
    masterKey,
    actorType: "employee",
    actorId: actor.userId,
    actorName: actor.name,
    requestId,
    purpose
  };
}

async function writeAudit(db, { connectionId = "", action, result = "success", requestId = "", actor, details = {}, now }) {
  await db.prepare(`INSERT INTO data_connection_audit
    (id, connection_id, action, result, request_id, actor_id, actor_name, details, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`)
    .bind(randomId("audit"), connectionId || null, action, result, requestId || randomId("req"), actor.userId, actor.name, JSON.stringify(details), now).run();
}

export function createDataConnectionStore(db, { masterKey, actor, requestId = "", now = () => new Date() } = {}) {
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
      const submittedPassword = String(input.password || "");
      if (submittedPassword.length > 500) throw new DataConnectionHttpError(400, "DATA_CONNECTION_PASSWORD_INVALID", "密码长度超出限制。");
      if (!current && !submittedPassword) throw new DataConnectionHttpError(400, "DATA_CONNECTION_PASSWORD_REQUIRED", "请输入密码。");

      let credentialEntryId = current?.credential_entry_id || "";
      let credentialVersion = Number(current?.credential_version || 0);
      const context = vaultContext({ masterKey, actor, requestId, purpose: current ? "替换抖音数据连接凭证" : "创建抖音数据连接凭证" });
      if (current && submittedPassword) {
        const entry = await replaceCredentialEntry(db, credentialEntryId, {
          expectedVersion: credentialVersion,
          name: `${input.loginEmail} 抖音登录凭证`,
          schemaVersion: 1,
          secretPayload: { password: submittedPassword }
        }, context);
        credentialVersion = entry.version;
      } else if (!current) {
        const entry = await createCredentialEntry(db, {
          scopeType: "connector",
          scopeId: id,
          category: DOUYIN_ECOMMERCE.id,
          name: `${input.loginEmail} 抖音登录凭证`,
          schemaVersion: 1,
          secretPayload: { password: submittedPassword }
        }, context);
        credentialEntryId = entry.id;
        credentialVersion = entry.version;
      }

      const version = expectedVersion + 1;
      if (current) {
        const result = await db.prepare(`UPDATE data_connections SET account_label = ?1, credential_schema_id = ?2,
          credential_entry_id = ?3, credential_version = ?4, status = 'queued', version = ?5,
          updated_at = ?6, updated_by = ?7 WHERE id = ?8 AND platform_id = ?9 AND version = ?10`)
          .bind(input.loginEmail, "email-password-v1", credentialEntryId, credentialVersion, version, timestamp, actor.name, id, DOUYIN_ECOMMERCE.id, expectedVersion).run();
        if (Number(result?.meta?.changes ?? 0) !== 1) throw new DataConnectionHttpError(409, "DATA_CONNECTION_VERSION_CONFLICT", "连接已被其他人更新，请刷新后重试。");
      } else {
        await db.prepare(`INSERT INTO data_connections
          (id, platform_id, account_label, credential_schema_id, credential_entry_id, credential_version, status, version,
            last_verified_at, created_at, created_by, updated_at, updated_by)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'queued', ?7, NULL, ?8, ?9, ?8, ?9)`)
          .bind(id, DOUYIN_ECOMMERCE.id, input.loginEmail, "email-password-v1", credentialEntryId, credentialVersion, version, timestamp, actor.name).run();
      }

      const taskId = randomId("task");
      const idempotencyKey = `${id}:${version}:douyin_login_verification`;
      const expiresAt = new Date(now().getTime() + 24 * 60 * 60 * 1000).toISOString();
      await db.prepare(`INSERT INTO browser_agent_tasks
        (id, task_type, resource_type, schema_version, cursor, platform_id, connection_id, credential_version, idempotency_key, status, claimed_by,
          claim_expires_at, attempt, result_summary, error_code, expires_at, created_at, updated_at)
        VALUES (?1, 'douyin_login_verification', 'connection_identity', 'v1', NULL, ?2, ?3, ?4, ?5, 'queued', NULL, NULL, 0, '{}', NULL, ?6, ?7, ?7)
        ON CONFLICT(idempotency_key) DO NOTHING`)
        .bind(taskId, DOUYIN_ECOMMERCE.id, id, credentialVersion, idempotencyKey, expiresAt, timestamp).run();
      await writeAudit(db, { connectionId: id, action: current ? "replace_credentials" : "create", requestId, actor, details: { credentialEntryId, credentialVersion }, now: timestamp });
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
      const row = await db.prepare("SELECT * FROM data_connections WHERE id = ?1 AND platform_id = ?2").bind(connectionId, DOUYIN_ECOMMERCE.id).first();
      if (!row) throw new DataConnectionHttpError(404, "DATA_CONNECTION_NOT_FOUND", "数据连接不存在。");
      await assertCredentialRevealRateLimit(db, row.credential_entry_id);
      const revealed = await revealCredentialEntry(db, row.credential_entry_id, vaultContext({
        masterKey,
        actor,
        requestId,
        purpose: "查看抖音数据连接密码"
      }));
      await writeAudit(db, { connectionId, action: "reveal", requestId, actor, details: { credentialEntryId: row.credential_entry_id }, now: timestamp });
      return {
        platformId: row.platform_id,
        accountLabel: row.account_label,
        credentialSchemaId: row.credential_schema_id,
        loginEmail: row.platform_id === DOUYIN_ECOMMERCE.id ? row.account_label : undefined,
        password: revealed.secretPayload.password
      };
    }
  };
}

export const dataConnectionStorageInternals = { metadata, vaultContext };
