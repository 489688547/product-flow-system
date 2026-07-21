import { dataAcquisitionContract, registeredDataAcquisitionProviders } from "../../../../../../src/domain/dataAcquisition.js";
import { revealCredentialEntry } from "../../../_shared/credentialVaultStorage.js";
import { sha256 } from "../../user-insights/_shared/storage.js";
import { DataConnectionHttpError } from "../../data-connections/_shared/http.js";
import { writeAcquisitionResult } from "./providerResultWriters.js";

function randomId(prefix) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now().toString(36)}`;
}

function createGrant() {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return `bat_${[...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

function taskMetadata(row, grant, grantExpiresAt) {
  const contract = dataAcquisitionContract(row.platform_id, row.task_type, row.resource_type);
  return {
    id: row.id,
    type: row.task_type,
    resourceType: row.resource_type,
    schemaVersion: row.schema_version || "v1",
    cursor: row.cursor || "",
    platformId: row.platform_id,
    status: "claimed",
    loginUrl: contract.loginUrl,
    expiresAt: row.expires_at,
    grant,
    grantExpiresAt
  };
}

export function createBrowserAgentTaskStore(db, { masterKey, runner, now = () => new Date() } = {}) {
  return {
    async claim() {
      const timestamp = now();
      const result = await db.prepare(`SELECT * FROM browser_agent_tasks
        WHERE (status = 'queued' OR (status = 'claimed' AND claim_expires_at <= ?1)) AND expires_at > ?1 ORDER BY created_at LIMIT 20`)
        .bind(timestamp.toISOString()).all();
      const registered = new Set(registeredDataAcquisitionProviders().map(item => item.id));
      const allowed = new Set((runner.allowedScope?.platforms || []).filter(item => registered.has(item)));
      const claimed = [];
      for (const row of (result.results || []).filter(item => allowed.has(item.platform_id)).slice(0, 5)) {
        const claimExpiresAt = new Date(timestamp.getTime() + 5 * 60 * 1000).toISOString();
        const update = await db.prepare(`UPDATE browser_agent_tasks SET status = 'claimed', claimed_by = ?1,
          claim_expires_at = ?2, attempt = attempt + 1, updated_at = ?3 WHERE id = ?4
          AND (status = 'queued' OR (status = 'claimed' AND claim_expires_at <= ?3))`)
          .bind(runner.id, claimExpiresAt, timestamp.toISOString(), row.id).run();
        if (Number(update?.meta?.changes ?? 0) !== 1) continue;
        const grant = createGrant();
        const grantHash = await sha256(grant);
        await db.prepare(`INSERT INTO browser_agent_task_grants
          (id, task_id, runner_id, connection_id, credential_version, grant_hash, expires_at, consumed_at, created_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8)`)
          .bind(randomId("grant"), row.id, runner.id, row.connection_id, row.credential_version, grantHash, claimExpiresAt, timestamp.toISOString()).run();
        claimed.push(taskMetadata(row, grant, claimExpiresAt));
      }
      return claimed;
    },

    async credential(taskId, grant) {
      const timestamp = now().toISOString();
      const grantHash = await sha256(grant);
      const row = await db.prepare(`SELECT g.id AS grant_id, g.task_id, g.runner_id, g.connection_id,
          g.credential_version AS grant_credential_version, g.expires_at AS grant_expires_at, g.consumed_at,
          t.credential_version AS task_credential_version, t.status AS task_status, t.claimed_by,
          t.platform_id, t.task_type, t.resource_type,
          c.account_label, c.credential_schema_id, c.credential_entry_id, c.credential_version,
          e.version AS vault_credential_version
        FROM browser_agent_task_grants g
        JOIN browser_agent_tasks t ON t.id = g.task_id
        JOIN data_connections c ON c.id = g.connection_id
        JOIN credential_vault_entries e ON e.id = c.credential_entry_id AND e.archived_at IS NULL
        WHERE g.task_id = ?1 AND g.grant_hash = ?2`).bind(taskId, grantHash).first();
      const valid = row && !row.consumed_at && row.grant_expires_at > timestamp && row.task_status === "claimed"
        && row.runner_id === row.claimed_by
        && Number(row.grant_credential_version) === Number(row.task_credential_version)
        && Number(row.credential_version) === Number(row.task_credential_version)
        && Number(row.vault_credential_version) === Number(row.task_credential_version);
      if (!valid) throw new DataConnectionHttpError(401, "BROWSER_AGENT_GRANT_INVALID", "任务凭证无效、已过期或已使用。");
      const consume = await db.prepare("UPDATE browser_agent_task_grants SET consumed_at = ?1 WHERE id = ?2 AND consumed_at IS NULL")
        .bind(timestamp, row.grant_id).run();
      if (Number(consume?.meta?.changes ?? 0) !== 1) throw new DataConnectionHttpError(401, "BROWSER_AGENT_GRANT_INVALID", "任务凭证无效、已过期或已使用。");
      const revealed = await revealCredentialEntry(db, row.credential_entry_id, {
        masterKey,
        actorType: "runner",
        actorId: runner.id,
        actorName: runner.name || runner.id,
        purpose: `浏览器采集任务 ${taskId}`,
        requestId: taskId
      });
      const contract = dataAcquisitionContract(row.platform_id || "douyin-ecommerce", row.task_type || "douyin_login_verification", row.resource_type || "connection_identity");
      return {
        platformId: row.platform_id,
        accountLabel: row.account_label,
        credentialSchemaId: row.credential_schema_id,
        credentials: revealed.secretPayload,
        loginUrl: contract.loginUrl
      };
    },

    async result(taskId, input) {
      const timestamp = now().toISOString();
      const task = await db.prepare("SELECT * FROM browser_agent_tasks WHERE id = ?1 AND claimed_by = ?2").bind(taskId, runner.id).first();
      if (!task) throw new DataConnectionHttpError(404, "BROWSER_AGENT_TASK_NOT_FOUND", "浏览器任务不存在或不属于当前设备。");
      if (!runner.allowedScope?.platforms?.includes(task.platform_id)) throw new DataConnectionHttpError(403, "BROWSER_AGENT_SCOPE_DENIED", "当前采集设备无权回写该平台任务。");
      if (["succeeded", "failed", "expired"].includes(task.status)) {
        throw new DataConnectionHttpError(409, "BROWSER_AGENT_TASK_FINISHED", "浏览器任务已经结束。");
      }
      let recordCount = 0;
      if (input.status === "succeeded") {
        const written = await writeAcquisitionResult(db, task, input, timestamp);
        recordCount = Number(written.recordCount || 0);
      } else if (["waiting_human_verification", "recognizing", "failed"].includes(input.status)) {
        await db.prepare("UPDATE data_connections SET status = ?1, updated_at = ?2 WHERE id = ?3")
          .bind(input.status, timestamp, task.connection_id).run();
      }
      const summary = JSON.stringify({ status: input.status, recordCount, message: String(input.message || "").slice(0, 300) });
      await db.prepare(`UPDATE browser_agent_tasks SET status = ?1, result_summary = ?2, error_code = ?3,
        updated_at = ?4 WHERE id = ?5 AND claimed_by = ?6`)
        .bind(input.status, summary, input.errorCode || null, timestamp, taskId, runner.id).run();
      return { id: taskId, status: input.status, recordCount };
    }
  };
}

export const browserAgentTaskInternals = { createGrant, taskMetadata };
