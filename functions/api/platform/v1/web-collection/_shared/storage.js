import { assertWebCollectionTransition } from "../../../../../../src/domain/webCollection.js";
import { routeError } from "./http.js";

const RUNNER_SCOPE = "company_web_collection";
const PROVIDER_RESOURCES = Object.freeze({
  kuaimai: new Set([
    "orders", "order_items", "sales_items", "products", "inventory", "purchases", "suppliers", "aftersales",
    "shops", "warehouses", "sales_analysis", "goods_ledger", "inventory_cost"
  ]),
  test_fixture: new Set(["sample"])
});
const FORBIDDEN_JOB_FIELDS = new Set(["url", "origin", "selector", "selectors", "script", "javascript", "credentials", "cookie", "token"]);

export function webCollectionDatabase(env = {}) {
  return env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB || null;
}

export async function sha256(value) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function randomId(prefix) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
}

function createRunnerToken() {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return `wdc_${[...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function registerWebCollectionRunner(db, { name = "公司 Mac 网页采集器" } = {}, actor = {}) {
  const token = createRunnerToken();
  const tokenHash = await sha256(token);
  const id = randomId("web-runner");
  const now = new Date().toISOString();
  const safeName = String(name || "公司 Mac 网页采集器").trim().slice(0, 120);
  await db.prepare(`INSERT INTO web_collection_runners
    (id, name, token_hash, scope, status, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, safeName, tokenHash, RUNNER_SCOPE, "active", now, String(actor.actor || actor.userId || "unknown").slice(0, 120))
    .run();
  return { id, name: safeName, token, scope: RUNNER_SCOPE, createdAt: now };
}

export async function authenticateWebCollectionRunner(db, request) {
  const authorization = String(request.headers.get("authorization") || "");
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) throw routeError(401, "WEB_COLLECTION_RUNNER_TOKEN_REQUIRED", "采集设备令牌缺失。");
  const tokenHash = await sha256(token);
  const row = await db.prepare(`SELECT id, name, scope, status FROM web_collection_runners
    WHERE token_hash = ? AND status = 'active' LIMIT 1`).bind(tokenHash).first();
  if (!row || row.scope !== RUNNER_SCOPE) throw routeError(401, "WEB_COLLECTION_RUNNER_TOKEN_INVALID", "采集设备令牌无效、已停用或权限范围不符。");
  return { id: row.id, name: row.name, scope: row.scope };
}

function safeErrorSummary(value) {
  const summary = String(value || "").replace(/[\r\n]+/g, " ").trim().slice(0, 240);
  if (/password|cookie|token|验证码|authorization|bearer/i.test(summary)) return "采集阶段失败，敏感错误详情已隐藏。";
  return summary || null;
}

function normalizeJob(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw routeError(400, "WEB_COLLECTION_JOB_INVALID", "采集任务结构无效。");
  for (const field of Object.keys(input)) {
    if (FORBIDDEN_JOB_FIELDS.has(field.toLowerCase())) throw routeError(400, "WEB_COLLECTION_JOB_INVALID", "任务不能包含网页地址、选择器、脚本或凭据。");
  }
  const providerId = String(input.providerId || "").trim();
  const resourceType = String(input.resourceType || "").trim();
  if (!PROVIDER_RESOURCES[providerId]?.has(resourceType)) throw routeError(400, "WEB_COLLECTION_JOB_INVALID", "provider 或 resource 未在采集器代码注册表中登记。");
  const businessDate = String(input.businessDate || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) throw routeError(400, "WEB_COLLECTION_JOB_INVALID", "业务日期无效。");
  const rangeKind = input.rangeKind === "daily_fact" ? "daily_fact" : input.rangeKind === "current_snapshot" ? "current_snapshot" : "";
  if (!rangeKind) throw routeError(400, "WEB_COLLECTION_JOB_INVALID", "资源范围类型无效。");
  const expectedKey = `${providerId}:${resourceType}:${businessDate}:${String(input.scheduleVersion || "v1")}`;
  if (input.idempotencyKey !== expectedKey) throw routeError(400, "WEB_COLLECTION_JOB_INVALID", "任务幂等键与资源范围不一致。");
  if (rangeKind === "daily_fact" && (!input.range?.start || !input.range?.end || input.range?.timeZone !== "Asia/Shanghai")) {
    throw routeError(400, "WEB_COLLECTION_JOB_INVALID", "日事实任务必须提供上海时区完整范围。");
  }
  return {
    providerId,
    resourceType,
    businessDate,
    rangeKind,
    rangeStart: input.range?.start || null,
    rangeEnd: input.range?.end || null,
    timeZone: input.range?.timeZone || "Asia/Shanghai",
    scheduleVersion: String(input.scheduleVersion || "v1").slice(0, 40),
    idempotencyKey: expectedKey,
    selectorVersion: String(input.selectorVersion || "").slice(0, 80) || null
  };
}

function mapJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    providerId: row.provider_id,
    resourceType: row.resource_type,
    businessDate: row.business_date,
    rangeKind: row.range_kind,
    range: row.range_start ? { start: row.range_start, end: row.range_end, timeZone: row.time_zone } : null,
    scheduleVersion: row.schedule_version,
    idempotencyKey: row.idempotency_key,
    selectorVersion: row.selector_version || null,
    status: row.status,
    stage: row.stage || null,
    attempt: Number(row.attempt || 0),
    runnerId: row.runner_id || null,
    leaseExpiresAt: row.lease_expires_at || null,
    errorCode: row.error_code || null,
    errorSummary: row.error_summary || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at || null,
    completedAt: row.completed_at || null
  };
}

export async function heartbeatRunner(db, runner, input) {
  const now = new Date().toISOString();
  await db.prepare(`UPDATE web_collection_runners SET version = ?, chrome_status = ?, current_job_id = ?, last_seen_at = ? WHERE id = ?`)
    .bind(String(input.version || "").slice(0, 40) || null, String(input.chromeStatus || "unknown").slice(0, 40), input.currentJobId || null, now, runner.id).run();
  return { runnerId: runner.id, lastSeenAt: now };
}

export async function ensureWebCollectionPlan(db, jobs) {
  if (!Array.isArray(jobs) || !jobs.length || jobs.length > 100) throw routeError(400, "WEB_COLLECTION_JOB_INVALID", "任务计划必须包含 1 至 100 个资源。");
  const normalized = jobs.map(normalizeJob);
  const now = new Date().toISOString();
  let created = 0;
  const saved = [];
  for (const job of normalized) {
    let row = await db.prepare("SELECT * FROM web_collection_jobs WHERE idempotency_key = ? LIMIT 1").bind(job.idempotencyKey).first();
    if (!row) {
      const id = randomId("web-job");
      await db.prepare(`INSERT INTO web_collection_jobs
        (id, provider_id, resource_type, business_date, range_kind, range_start, range_end, time_zone,
          schedule_version, idempotency_key, status, selector_version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, job.providerId, job.resourceType, job.businessDate, job.rangeKind, job.rangeStart, job.rangeEnd,
          job.timeZone, job.scheduleVersion, job.idempotencyKey, "queued", job.selectorVersion, now, now).run();
      row = await db.prepare("SELECT * FROM web_collection_jobs WHERE id = ? LIMIT 1").bind(id).first();
      created += 1;
    }
    saved.push(mapJob(row));
  }
  return { created, duplicate: saved.length - created, jobs: saved };
}

export async function claimWebCollectionJob(db, runner, { leaseSeconds = 300 } = {}) {
  const seconds = Math.min(900, Math.max(60, Number(leaseSeconds) || 300));
  const now = new Date();
  const lease = new Date(now.getTime() + seconds * 1000).toISOString();
  const row = await db.prepare(`SELECT * FROM web_collection_jobs
    WHERE status = 'queued' OR (status = 'claimed' AND lease_expires_at < ?)
    ORDER BY business_date, created_at LIMIT 1`).bind(now.toISOString()).first();
  if (!row) return { job: null };
  await db.prepare(`UPDATE web_collection_jobs SET status = 'claimed', stage = 'claimed', runner_id = ?,
    lease_expires_at = ?, attempt = attempt + 1, started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?`)
    .bind(runner.id, lease, now.toISOString(), now.toISOString(), row.id).run();
  const claimed = await db.prepare("SELECT * FROM web_collection_jobs WHERE id = ? LIMIT 1").bind(row.id).first();
  return { job: mapJob(claimed) };
}

async function ownedJob(db, runner, jobId) {
  const row = await db.prepare("SELECT * FROM web_collection_jobs WHERE id = ? LIMIT 1").bind(String(jobId || "")).first();
  if (!row) throw routeError(404, "WEB_COLLECTION_JOB_NOT_FOUND", "采集任务不存在。");
  if (row.runner_id !== runner.id) throw routeError(403, "WEB_COLLECTION_JOB_OWNER_MISMATCH", "采集任务不属于当前设备。");
  return row;
}

export async function transitionWebCollectionJob(db, runner, input) {
  const row = await ownedJob(db, runner, input.jobId);
  if (row.status !== input.from) throw routeError(409, "WEB_COLLECTION_STATE_CONFLICT", "任务状态已经变化，请重新领取。");
  try {
    assertWebCollectionTransition(row.status, input.status);
  } catch {
    throw routeError(409, "WEB_COLLECTION_TRANSITION_INVALID", "采集任务状态转换不合法。");
  }
  const now = new Date().toISOString();
  const release = ["failed", "waiting_human", "schema_changed"].includes(input.status);
  await db.prepare(`UPDATE web_collection_jobs SET status = ?, stage = ?, error_code = ?, error_summary = ?,
    lease_expires_at = ?, updated_at = ? WHERE id = ?`)
    .bind(input.status, String(input.stage || input.status).slice(0, 60), input.errorCode ? String(input.errorCode).slice(0, 80) : null,
      safeErrorSummary(input.errorSummary), release ? null : row.lease_expires_at, now, row.id).run();
  return { job: mapJob(await db.prepare("SELECT * FROM web_collection_jobs WHERE id = ? LIMIT 1").bind(row.id).first()) };
}

export async function completeWebCollectionJob(db, runner, input) {
  const row = await ownedJob(db, runner, input.jobId);
  if (row.status !== "ingesting") throw routeError(409, "WEB_COLLECTION_TRANSITION_INVALID", "只有正在入库的任务可以完成。");
  const runInput = input.run || {};
  const fileHash = runInput.fileHash ? String(runInput.fileHash) : null;
  if (fileHash && !/^[a-f0-9]{64}$/i.test(fileHash)) throw routeError(400, "WEB_COLLECTION_RUN_INVALID", "文件哈希无效。");
  const now = new Date().toISOString();
  const runId = randomId("web-run");
  const cursorId = randomId("web-cursor");
  const statements = [
    db.prepare(`INSERT INTO web_collection_runs
      (id, job_id, runner_id, attempt, status, stage, batch_id, archive_id, file_hash, row_count, started_at, completed_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(runId, row.id, runner.id, Number(row.attempt || 1), "success", "ingesting", runInput.batchId || null,
        runInput.archiveId || null, fileHash, Number.isFinite(Number(runInput.rowCount)) ? Number(runInput.rowCount) : null,
        row.started_at || now, now, now),
    db.prepare(`UPDATE web_collection_jobs SET status = 'success', stage = 'success', lease_expires_at = NULL,
      error_code = NULL, error_summary = NULL, completed_at = ?, updated_at = ? WHERE id = ?`).bind(now, now, row.id),
    db.prepare(`INSERT INTO web_collection_cursors
      (id, provider_id, resource_type, business_date, job_id, run_id, batch_id, completed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_id, resource_type) DO UPDATE SET business_date = excluded.business_date,
        job_id = excluded.job_id, run_id = excluded.run_id, batch_id = excluded.batch_id,
        completed_at = excluded.completed_at, updated_at = excluded.updated_at`)
      .bind(cursorId, row.provider_id, row.resource_type, row.business_date, row.id, runId, runInput.batchId || null, now, now)
  ];
  await db.batch(statements);
  return {
    job: mapJob(await db.prepare("SELECT * FROM web_collection_jobs WHERE id = ? LIMIT 1").bind(row.id).first()),
    runId,
    cursor: { providerId: row.provider_id, resourceType: row.resource_type, businessDate: row.business_date }
  };
}

export async function recordWebCollectionNotification(db, runner, input) {
  const dedupeKey = String(input.dedupeKey || "").trim().slice(0, 240);
  if (!dedupeKey) throw routeError(400, "WEB_COLLECTION_NOTIFICATION_INVALID", "通知去重键缺失。");
  const existing = await db.prepare("SELECT id FROM web_collection_notifications WHERE dedupe_key = ? LIMIT 1").bind(dedupeKey).first();
  if (existing) return { id: existing.id, duplicate: true };
  const id = randomId("web-notification");
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO web_collection_notifications
    (id, job_id, runner_id, kind, dedupe_key, result, sent_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, input.jobId || null, runner.id, String(input.kind || "failure").slice(0, 40), dedupeKey,
      String(input.result || "sent").slice(0, 40), now, now).run();
  return { id, duplicate: false };
}

export async function listWebCollectionStatus(db, { limit = 100 } = {}) {
  const safeLimit = Math.min(300, Math.max(1, Number(limit) || 100));
  const [runners, jobs, cursors, notifications] = await Promise.all([
    db.prepare(`SELECT id, name, status, version, chrome_status, current_job_id, last_seen_at, created_at
      FROM web_collection_runners ORDER BY created_at DESC LIMIT ?`).bind(safeLimit).all(),
    db.prepare(`SELECT * FROM web_collection_jobs ORDER BY business_date DESC, created_at DESC LIMIT ?`).bind(safeLimit).all(),
    db.prepare(`SELECT provider_id, resource_type, business_date, job_id, run_id, batch_id, completed_at, updated_at
      FROM web_collection_cursors ORDER BY updated_at DESC LIMIT ?`).bind(safeLimit).all(),
    db.prepare(`SELECT id, job_id, runner_id, kind, dedupe_key, result, sent_at
      FROM web_collection_notifications ORDER BY sent_at DESC LIMIT ?`).bind(safeLimit).all()
  ]);
  return {
    runners: (runners?.results || []).map(row => ({ id: row.id, name: row.name, status: row.status, version: row.version || null, chromeStatus: row.chrome_status || null, currentJobId: row.current_job_id || null, lastSeenAt: row.last_seen_at || null, createdAt: row.created_at })),
    jobs: (jobs?.results || []).map(mapJob),
    cursors: (cursors?.results || []).map(row => ({ providerId: row.provider_id, resourceType: row.resource_type, businessDate: row.business_date, jobId: row.job_id, runId: row.run_id, batchId: row.batch_id || null, completedAt: row.completed_at, updatedAt: row.updated_at })),
    notifications: (notifications?.results || []).map(row => ({ id: row.id, jobId: row.job_id || null, runnerId: row.runner_id, kind: row.kind, dedupeKey: row.dedupe_key, result: row.result, sentAt: row.sent_at }))
  };
}
