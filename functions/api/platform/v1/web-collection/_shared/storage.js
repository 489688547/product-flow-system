import {
  assertWebCollectionTransition,
  createDailyPlan,
  webCollectionJobKey,
  webCollectionRetryDecision
} from "../../../../../../src/domain/webCollection.js";
import { collectionIdempotencyKey } from "../../../_shared/collectionTarget.js";
import { routeError } from "./http.js";

const RUNNER_SCOPE = "company_web_collection";
const PROVIDER_RESOURCES = Object.freeze({
  kuaimai: new Set([
    "orders", "order_items", "sales_items", "products", "product_kits", "product_combinations",
    "inventory", "purchases", "suppliers", "aftersales",
    "shops", "warehouses", "sales_analysis", "goods_ledger", "inventory_cost"
  ]),
  "douyin-ecommerce": new Set(["store_daily", "product_daily", "live_daily", "video_daily"]),
  test_fixture: new Set(["sample"])
});
const FORBIDDEN_JOB_FIELDS = new Set([
  "url", "origin", "selector", "selectors", "script", "javascript", "credentials", "cookie", "token",
  "targetenvironment", "targetenvironmentversion", "databaseid", "binding"
]);
const DAILY_COLLECTION_RESOURCES = Object.freeze({
  kuaimai: Object.freeze([
    Object.freeze({ type: "orders", rangeKind: "daily_fact", scheduleVersion: "v2" }),
    Object.freeze({ type: "order_items", rangeKind: "daily_fact", scheduleVersion: "v1" }),
    Object.freeze({ type: "sales_items", rangeKind: "daily_fact", scheduleVersion: "v3" }),
    Object.freeze({ type: "inventory", rangeKind: "current_snapshot", scheduleVersion: "v1" })
  ]),
  "douyin-ecommerce": Object.freeze([
    Object.freeze({ type: "store_daily", rangeKind: "daily_fact", scheduleVersion: "v1" }),
    Object.freeze({ type: "product_daily", rangeKind: "daily_fact", scheduleVersion: "v1" }),
    Object.freeze({ type: "live_daily", rangeKind: "daily_fact", scheduleVersion: "v1" }),
    Object.freeze({ type: "video_daily", rangeKind: "daily_fact", scheduleVersion: "v1" })
  ])
});

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
  const row = await db.prepare(`SELECT id, name, scope, status, token_hash FROM web_collection_runners
    WHERE token_hash = ? AND status = 'active' LIMIT 1`).bind(tokenHash).first();
  if (!row || row.scope !== RUNNER_SCOPE) throw routeError(401, "WEB_COLLECTION_RUNNER_TOKEN_INVALID", "采集设备令牌无效、已停用或权限范围不符。");
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    verificationKey: row.token_hash
  };
}

export async function activeWebCollectionRunner(db) {
  const row = await db.prepare(`SELECT id, name, scope FROM web_collection_runners
    WHERE status = 'active' ORDER BY COALESCE(last_seen_at, created_at) DESC LIMIT 1`).first();
  if (!row || row.scope !== RUNNER_SCOPE) {
    throw routeError(409, "WEB_COLLECTION_RUNNER_REQUIRED", "请先登记公司 Mac 采集器，再添加店铺。");
  }
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
  const storeId = String(input.storeId || "").trim();
  if (storeId && !/^[-_a-zA-Z0-9]{1,128}$/.test(storeId)) {
    throw routeError(400, "WEB_COLLECTION_JOB_INVALID", "店铺标识无效。");
  }
  if (providerId === "douyin-ecommerce" && !storeId) {
    throw routeError(400, "WEB_COLLECTION_JOB_INVALID", "抖店采集任务必须包含已登记店铺标识。");
  }
  const businessDate = String(input.businessDate || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) throw routeError(400, "WEB_COLLECTION_JOB_INVALID", "业务日期无效。");
  const rangeKind = input.rangeKind === "daily_fact" ? "daily_fact" : input.rangeKind === "current_snapshot" ? "current_snapshot" : "";
  if (!rangeKind) throw routeError(400, "WEB_COLLECTION_JOB_INVALID", "资源范围类型无效。");
  const expectedKey = webCollectionJobKey({
    providerId,
    storeId,
    resourceType,
    businessDate,
    scheduleVersion: input.scheduleVersion
  });
  if (input.idempotencyKey !== expectedKey) throw routeError(400, "WEB_COLLECTION_JOB_INVALID", "任务幂等键与资源范围不一致。");
  if (rangeKind === "daily_fact" && (!input.range?.start || !input.range?.end || input.range?.timeZone !== "Asia/Shanghai")) {
    throw routeError(400, "WEB_COLLECTION_JOB_INVALID", "日事实任务必须提供上海时区完整范围。");
  }
  return {
    providerId,
    storeId,
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
    storeId: row.store_id || "",
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
    ,
    targetEnvironment: row.target_environment === "display" ? "display" : "production",
    targetEnvironmentVersion: Math.max(1, Number(row.target_environment_version || 1))
  };
}

function mapRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    jobId: row.job_id,
    runnerId: row.runner_id,
    attempt: Number(row.attempt || 0),
    status: row.status,
    stage: row.stage,
    batchId: row.batch_id || null,
    archiveId: row.archive_id || null,
    rowCount: row.row_count === null || row.row_count === undefined
      ? null
      : Number.isFinite(Number(row.row_count)) ? Number(row.row_count) : null,
    errorCode: row.error_code || null,
    errorSummary: row.error_summary || null,
    startedAt: row.started_at,
    completedAt: row.completed_at || null,
    createdAt: row.created_at
  };
}

export async function heartbeatRunner(db, runner, input) {
  const now = new Date().toISOString();
  await db.prepare(`UPDATE web_collection_runners SET version = ?, chrome_status = ?, current_job_id = ?, last_seen_at = ? WHERE id = ?`)
    .bind(String(input.version || "").slice(0, 40) || null, String(input.chromeStatus || "unknown").slice(0, 40), input.currentJobId || null, now, runner.id).run();
  return { runnerId: runner.id, lastSeenAt: now };
}

function normalizeStoreIdentity(input) {
  const providerId = String(input?.providerId || "").trim();
  const storeId = String(input?.storeId || "").trim();
  const storeName = String(input?.storeName || "").trim();
  if (
    providerId !== "douyin-ecommerce"
    || !/^[-_a-zA-Z0-9]{1,128}$/.test(storeId)
    || !storeName
    || storeName.length > 120
    || /[\u0000-\u001f\u007f]/.test(storeName)
  ) {
    throw routeError(400, "WEB_COLLECTION_STORE_INVALID", "店铺身份无效或平台尚未登记。");
  }
  return { providerId, storeId, storeName };
}

export async function registerWebCollectionStore(db, runner, input) {
  const store = normalizeStoreIdentity(input);
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO web_collection_stores
    (id, provider_id, store_id, store_name, status, runner_id, last_seen_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'connected', ?, ?, ?, ?)
    ON CONFLICT(provider_id, store_id) DO UPDATE SET store_name = excluded.store_name,
      status = 'connected', runner_id = excluded.runner_id, last_seen_at = excluded.last_seen_at,
      updated_at = excluded.updated_at`)
    .bind(randomId("web-store"), store.providerId, store.storeId, store.storeName, runner.id, now, now, now)
    .run();
  return {
    store: {
      ...store,
      status: "connected",
      lastSeenAt: now
    }
  };
}

export async function listRunnerWebCollectionStores(db, runner) {
  const result = await db.prepare(`SELECT provider_id, store_id, store_name
    FROM web_collection_stores
    WHERE runner_id = ? AND status = 'connected'
    ORDER BY provider_id, store_name, store_id`).bind(runner.id).all();
  return {
    stores: (result?.results || []).map(row => ({
      providerId: row.provider_id,
      storeId: row.store_id,
      storeName: row.store_name
    }))
  };
}

export async function ensureWebCollectionPlan(db, jobs, target = { environmentId: "production", environmentVersion: 1 }) {
  if (!Array.isArray(jobs) || !jobs.length || jobs.length > 100) throw routeError(400, "WEB_COLLECTION_JOB_INVALID", "任务计划必须包含 1 至 100 个资源。");
  const normalized = jobs.map(normalizeJob);
  const current = new Date();
  const now = current.toISOString();
  let created = 0;
  const saved = [];
  for (const job of normalized) {
    const idempotencyKey = collectionIdempotencyKey(job.idempotencyKey, target);
    let row = await db.prepare("SELECT * FROM web_collection_jobs WHERE idempotency_key = ? LIMIT 1").bind(idempotencyKey).first();
    if (!row && target.environmentId === "production") {
      row = await db.prepare("SELECT * FROM web_collection_jobs WHERE idempotency_key = ? LIMIT 1")
        .bind(job.idempotencyKey)
        .first();
    }
    if (!row) {
      const id = randomId("web-job");
      await db.prepare(`INSERT INTO web_collection_jobs
        (id, provider_id, store_id, resource_type, business_date, range_kind, range_start, range_end, time_zone,
          schedule_version, idempotency_key, status, selector_version, target_environment,
          target_environment_version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, job.providerId, job.storeId, job.resourceType, job.businessDate, job.rangeKind, job.rangeStart, job.rangeEnd,
          job.timeZone, job.scheduleVersion, idempotencyKey, "queued", job.selectorVersion,
          target.environmentId, target.environmentVersion, now, now).run();
      row = await db.prepare("SELECT * FROM web_collection_jobs WHERE id = ? LIMIT 1").bind(id).first();
      created += 1;
    } else if (webCollectionRetryDecision(mapJob(row), { now: current }).retry) {
      await db.prepare(`UPDATE web_collection_jobs SET status = 'queued', stage = 'queued', runner_id = NULL,
        lease_expires_at = NULL, error_code = NULL, error_summary = NULL, started_at = NULL, completed_at = NULL,
        updated_at = ? WHERE id = ?`)
        .bind(now, row.id).run();
      row = await db.prepare("SELECT * FROM web_collection_jobs WHERE id = ? LIMIT 1").bind(row.id).first();
    }
    saved.push(mapJob(row));
  }
  return { created, duplicate: saved.length - created, jobs: saved };
}

export async function ensureRegisteredWebCollectionPlan(
  db,
  {
    now = new Date(),
    target = { environmentId: "production", environmentVersion: 1 }
  } = {}
) {
  const shopResult = await db.prepare(`SELECT store_id, store_name FROM web_collection_stores
    WHERE provider_id = 'douyin-ecommerce' AND status = 'connected'
    ORDER BY updated_at DESC`).all();
  const stores = (shopResult?.results || [])
    .filter(row => /^[-_a-zA-Z0-9]{1,128}$/.test(String(row.store_id || "")))
    .map(row => ({ id: row.store_id }));
  const jobs = createDailyPlan({
    now,
    adapters: [
      {
        id: "kuaimai",
        enabled: true,
        resources: DAILY_COLLECTION_RESOURCES.kuaimai
      },
      {
        id: "douyin-ecommerce",
        enabled: stores.length > 0,
        stores,
        resources: DAILY_COLLECTION_RESOURCES["douyin-ecommerce"]
      }
    ]
  });
  if (!jobs.length) return { created: 0, duplicate: 0, jobs: [] };
  return ensureWebCollectionPlan(db, jobs, target);
}

function dailyRange(businessDate) {
  return {
    start: `${businessDate}T00:00:00+08:00`,
    end: `${businessDate}T23:59:59+08:00`,
    timeZone: "Asia/Shanghai"
  };
}

export async function triggerWebCollectionJob(db, input, target = { environmentId: "production", environmentVersion: 1 }) {
  const providerId = String(input?.providerId || "").trim();
  const storeId = String(input?.storeId || "").trim();
  const resourceType = String(input?.resourceType || "").trim();
  const businessDate = String(input?.businessDate || "").trim();
  // 商品入口由服务端展开普通商品、套件和组合装三任务；快照类资源不带日范围。
  const productResources = ["products", "product_kits", "product_combinations"];
  const snapshotResources = [...productResources, "inventory"];
  const triggerable = providerId === "kuaimai"
    ? new Set(["orders", "order_items", "sales_items", "products", "inventory"])
    : providerId === "douyin-ecommerce"
      ? new Set(["store_daily", "product_daily", "live_daily", "video_daily"])
      : null;
  if (
    !triggerable?.has(resourceType)
    || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)
    || (providerId === "douyin-ecommerce" && !/^[-_a-zA-Z0-9]{1,128}$/.test(storeId))
  ) {
    throw routeError(400, "WEB_COLLECTION_TRIGGER_INVALID", "当前只支持按业务日期触发已登记的快麦或抖店资源。");
  }
  const requestedResources = providerId === "kuaimai" && resourceType === "products"
    ? productResources
    : [resourceType];
  const requestedJobs = requestedResources.map(type => {
    const scheduleVersion = providerId === "kuaimai" && type === "sales_items"
      ? "v3"
      : providerId === "kuaimai" && type === "orders"
        ? "v2"
        : "v1";
    const rangeKind = snapshotResources.includes(type) ? "current_snapshot" : "daily_fact";
    return {
      providerId,
      storeId,
      resourceType: type,
      businessDate,
      rangeKind,
      range: rangeKind === "daily_fact" ? dailyRange(businessDate) : null,
      scheduleVersion,
      idempotencyKey: webCollectionJobKey({ providerId, storeId, resourceType: type, businessDate, scheduleVersion })
    };
  });
  const plan = await ensureWebCollectionPlan(db, requestedJobs, target);
  const savedJobs = [];
  let requeued = false;
  for (const plannedJob of plan.jobs) {
    let job = plannedJob;
    if (input.force === true && ["waiting_human", "failed", "schema_changed", "success"].includes(job.status)) {
      const now = new Date().toISOString();
      await db.prepare(`UPDATE web_collection_jobs SET status = 'queued', stage = 'queued', runner_id = NULL,
        lease_expires_at = NULL, error_code = NULL, error_summary = NULL, started_at = NULL, completed_at = NULL,
        updated_at = ? WHERE id = ?`)
        .bind(now, job.id).run();
      job = mapJob(await db.prepare("SELECT * FROM web_collection_jobs WHERE id = ? LIMIT 1").bind(job.id).first());
      requeued = true;
    }
    savedJobs.push(job);
  }
  return { created: plan.created, requeued, job: savedJobs[0], jobs: savedJobs };
}

export async function claimWebCollectionJob(db, runner, { leaseSeconds = 300, storeId = "" } = {}) {
  const seconds = Math.min(900, Math.max(60, Number(leaseSeconds) || 300));
  const profileStoreId = String(storeId || "").trim();
  if (profileStoreId && !/^[-_a-zA-Z0-9]{1,128}$/.test(profileStoreId)) {
    throw routeError(400, "WEB_COLLECTION_STORE_INVALID", "Chrome Profile 的店铺标识无效。");
  }
  const now = new Date();
  const lease = new Date(now.getTime() + seconds * 1000).toISOString();
  // 领取前先自愈无法再重领的僵尸任务，避免它们永久占位且从不落到终态。
  await expireUnrecoverableWebCollectionJobs(db, { now }).catch(() => { /* 自愈失败不应阻断领取 */ });
  const row = await db.prepare(`SELECT * FROM web_collection_jobs
    WHERE (provider_id != 'douyin-ecommerce'
      OR (provider_id = 'douyin-ecommerce' AND store_id = ?))
      AND (status = 'queued'
        OR (status IN ('claimed', 'opening', 'collecting', 'exporting', 'downloading', 'validating', 'ingesting')
          AND lease_expires_at < ? AND attempt < 3))
    ORDER BY business_date, created_at LIMIT 1`).bind(profileStoreId, now.toISOString()).first();
  if (!row) return { job: null };
  await db.prepare(`UPDATE web_collection_jobs SET status = 'claimed', stage = 'claimed', runner_id = ?,
    lease_expires_at = ?, attempt = attempt + 1, started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?`)
    .bind(runner.id, lease, now.toISOString(), now.toISOString(), row.id).run();
  const claimed = await db.prepare("SELECT * FROM web_collection_jobs WHERE id = ? LIMIT 1").bind(row.id).first();
  return { job: mapJob(claimed) };
}

// 运行中的采集阶段；过了租约且重试已用尽时无人能再领取，需要扫成终态。
const RUNNING_JOB_STATES = Object.freeze([
  "claimed", "opening", "collecting", "exporting", "downloading", "validating", "ingesting"
]);

// 从未被领取的任务没有租约（lease_expires_at 为 NULL），不会被运行中僵尸任务的规则命中。
// 公司 Mac 是笔记本，夜间休眠时 05:00 的计划任务无人领取；等它次日醒来仍应正常领取，
// 因此窗口取满 24 小时——超过一天仍无人领取，说明这一轮已被放弃，必须落到终态让页面显示实情。
const QUEUED_ABANDONED_MS = 24 * 60 * 60 * 1000;

// 自愈：把「运行中 + 租约已过 + attempt≥3」的僵尸任务转成 failed，恢复重试与展示。
// 只处理公司 Mac 已无法按 claim 逻辑（attempt<3）重领的任务，不与正常重领抢占。
export async function expireUnrecoverableWebCollectionJobs(db, { now = new Date() } = {}) {
  const iso = now.toISOString();
  const placeholders = RUNNING_JOB_STATES.map(() => "?").join(", ");
  const stuck = await db.prepare(`SELECT id, runner_id, attempt, started_at FROM web_collection_jobs
    WHERE status IN (${placeholders}) AND lease_expires_at IS NOT NULL AND lease_expires_at < ? AND attempt >= 3`)
    .bind(...RUNNING_JOB_STATES, iso).all();
  const abandonedBefore = new Date(now.getTime() - QUEUED_ABANDONED_MS).toISOString();
  const abandoned = await db.prepare(`SELECT id, runner_id, attempt, started_at FROM web_collection_jobs
    WHERE status = 'queued' AND COALESCE(updated_at, created_at) < ?`).bind(abandonedBefore).all();
  const expiredRows = stuck?.results || [];
  const abandonedRows = abandoned?.results || [];
  if (!expiredRows.length && !abandonedRows.length) return { expired: 0, abandoned: 0, jobIds: [] };
  const statements = [];
  const failJob = (row, errorCode, errorSummary) => {
    statements.push(db.prepare(`UPDATE web_collection_jobs SET status = 'failed', stage = 'failed',
      error_code = ?, error_summary = ?, lease_expires_at = NULL,
      completed_at = ?, updated_at = ? WHERE id = ?`)
      .bind(errorCode, errorSummary, iso, iso, row.id));
    statements.push(db.prepare(`INSERT INTO web_collection_runs
      (id, job_id, runner_id, attempt, status, stage, batch_id, archive_id, file_hash, row_count,
        error_code, error_summary, started_at, completed_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(randomId("web-run"), row.id, row.runner_id || null, Number(row.attempt || 0), "failed", "failed",
        null, null, null, null, errorCode, errorSummary, row.started_at || iso, iso, iso));
  };
  for (const row of expiredRows) {
    failJob(row, "WEB_COLLECTION_STAGE_EXPIRED", "采集阶段超过租约且重试已用尽，已自动标记失败，可重新触发。");
  }
  for (const row of abandonedRows) {
    failJob(row, "WEB_COLLECTION_QUEUE_ABANDONED", "任务排队超过 24 小时仍无采集器领取，已自动标记失败，可重新触发。");
  }
  await db.batch(statements);
  return {
    expired: expiredRows.length,
    abandoned: abandonedRows.length,
    jobIds: [...expiredRows, ...abandonedRows].map(row => row.id)
  };
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
  const stage = String(input.stage || input.status).slice(0, 60);
  const errorCode = input.errorCode ? String(input.errorCode).slice(0, 80) : null;
  const errorSummary = safeErrorSummary(input.errorSummary);
  const statements = [
    db.prepare(`UPDATE web_collection_jobs SET status = ?, stage = ?, error_code = ?, error_summary = ?,
      lease_expires_at = ?, updated_at = ? WHERE id = ?`)
      .bind(input.status, stage, errorCode, errorSummary, release ? null : row.lease_expires_at, now, row.id)
  ];
  if (release) {
    statements.push(db.prepare(`INSERT INTO web_collection_runs
      (id, job_id, runner_id, attempt, status, stage, batch_id, archive_id, file_hash, row_count,
        error_code, error_summary, started_at, completed_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(randomId("web-run"), row.id, runner.id, Number(row.attempt || 1), input.status, stage,
        null, null, null, null, errorCode, errorSummary, row.started_at || now, now, now));
  }
  await db.batch(statements);
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
      (id, provider_id, store_id, resource_type, business_date, job_id, run_id, batch_id, completed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_id, store_id, resource_type) DO UPDATE SET business_date = excluded.business_date,
        job_id = excluded.job_id, run_id = excluded.run_id, batch_id = excluded.batch_id,
        completed_at = excluded.completed_at, updated_at = excluded.updated_at`)
      .bind(cursorId, row.provider_id, row.store_id || "", row.resource_type, row.business_date, row.id, runId,
        runInput.batchId || null, now, now),
    // 同一 (provider,店铺,资源,业务日) 一旦有成功批次，其余未终结的重复任务标记为已被取代，
    // 避免验收触发等留下的重复任务被再次领取或长期显示为“采集中”。
    db.prepare(`UPDATE web_collection_jobs SET status = 'superseded', stage = 'superseded',
      lease_expires_at = NULL, updated_at = ? WHERE provider_id = ? AND store_id = ?
        AND resource_type = ? AND business_date = ? AND id <> ?
        AND status IN ('queued', 'claimed', 'opening', 'collecting', 'waiting_human', 'exporting', 'downloading', 'validating', 'ingesting')`)
      .bind(now, row.provider_id, row.store_id || "", row.resource_type, row.business_date, row.id)
  ];
  await db.batch(statements);
  return {
    job: mapJob(await db.prepare("SELECT * FROM web_collection_jobs WHERE id = ? LIMIT 1").bind(row.id).first()),
    runId,
    cursor: {
      providerId: row.provider_id,
      storeId: row.store_id || "",
      resourceType: row.resource_type,
      businessDate: row.business_date
    }
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
  // 读取前先自愈僵尸任务，使卡在运行中且无法重领的任务立即显示为可重试的失败态。
  await expireUnrecoverableWebCollectionJobs(db).catch(() => { /* 自愈失败不应阻断状态读取 */ });
  const [runners, stores, jobs, runs, cursors, notifications] = await Promise.all([
    db.prepare(`SELECT id, name, status, version, chrome_status, current_job_id, last_seen_at, created_at
      FROM web_collection_runners ORDER BY created_at DESC LIMIT ?`).bind(safeLimit).all(),
    db.prepare(`SELECT provider_id, store_id, store_name, status, runner_id, last_seen_at, updated_at
      FROM web_collection_stores ORDER BY updated_at DESC LIMIT ?`).bind(safeLimit).all(),
    db.prepare(`SELECT * FROM web_collection_jobs ORDER BY business_date DESC, created_at DESC LIMIT ?`).bind(safeLimit).all(),
    db.prepare(`SELECT id, job_id, runner_id, attempt, status, stage, batch_id, archive_id, row_count,
      error_code, error_summary, started_at, completed_at, created_at
      FROM web_collection_runs ORDER BY created_at DESC LIMIT ?`).bind(safeLimit).all(),
    db.prepare(`SELECT provider_id, store_id, resource_type, business_date, job_id, run_id, batch_id, completed_at, updated_at
      FROM web_collection_cursors ORDER BY updated_at DESC LIMIT ?`).bind(safeLimit).all(),
    db.prepare(`SELECT id, job_id, runner_id, kind, dedupe_key, result, sent_at
      FROM web_collection_notifications ORDER BY sent_at DESC LIMIT ?`).bind(safeLimit).all()
  ]);
  return {
    runners: (runners?.results || []).map(row => ({ id: row.id, name: row.name, status: row.status, version: row.version || null, chromeStatus: row.chrome_status || null, currentJobId: row.current_job_id || null, lastSeenAt: row.last_seen_at || null, createdAt: row.created_at })),
    stores: (stores?.results || []).map(row => ({
      providerId: row.provider_id,
      storeId: row.store_id,
      storeName: row.store_name,
      status: row.status,
      runnerId: row.runner_id,
      lastSeenAt: row.last_seen_at,
      updatedAt: row.updated_at
    })),
    jobs: (jobs?.results || []).map(mapJob),
    runs: (runs?.results || []).map(mapRun),
    cursors: (cursors?.results || []).map(row => ({
      providerId: row.provider_id,
      storeId: row.store_id || "",
      resourceType: row.resource_type,
      businessDate: row.business_date,
      jobId: row.job_id,
      runId: row.run_id,
      batchId: row.batch_id || null,
      completedAt: row.completed_at,
      updatedAt: row.updated_at
    })),
    notifications: (notifications?.results || []).map(row => ({ id: row.id, jobId: row.job_id || null, runnerId: row.runner_id, kind: row.kind, dedupeKey: row.dedupe_key, result: row.result, sentAt: row.sent_at }))
  };
}
