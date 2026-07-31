export const WEB_COLLECTION_STATES = Object.freeze([
  "queued",
  "claimed",
  "opening",
  "collecting",
  "waiting_human",
  "exporting",
  "downloading",
  "validating",
  "ingesting",
  "success",
  "failed",
  "schema_changed",
  "superseded"
]);

const TRANSITIONS = Object.freeze({
  queued: new Set(["claimed"]),
  claimed: new Set(["opening", "queued", "failed"]),
  opening: new Set(["collecting", "exporting", "waiting_human", "schema_changed", "failed"]),
  collecting: new Set(["validating", "waiting_human", "schema_changed", "failed"]),
  waiting_human: new Set(["queued"]),
  exporting: new Set(["downloading", "waiting_human", "schema_changed", "failed"]),
  downloading: new Set(["validating", "failed"]),
  validating: new Set(["ingesting", "failed"]),
  ingesting: new Set(["success", "failed"]),
  success: new Set(),
  failed: new Set(["queued"]),
  schema_changed: new Set(["queued"])
});

const RETRYABLE_ERROR_CODES = new Set([
  "EXTENSION_DOWNLOAD_TIMEOUT",
  "KUAIMAI_DOWNLOAD_CENTER_TIMEOUT",
  "KUAIMAI_EXPORT_GENERATION_FAILED",
  "WEB_COLLECTION_API_FAILED",
  "WEB_COLLECTION_EXTENSION_FAILED",
  "WEB_COLLECTION_LOCAL_PROCESSING_FAILED"
]);
const RETRY_DELAYS_MINUTES = Object.freeze([5, 15]);

export function webCollectionRetryDecision(job, { now = new Date() } = {}) {
  const attempt = Number(job?.attempt || 0);
  if (job?.status !== "failed" || attempt < 1 || attempt >= 3 || !RETRYABLE_ERROR_CODES.has(String(job?.errorCode || ""))) {
    return { retry: false, delayMinutes: null };
  }
  const delayMinutes = RETRY_DELAYS_MINUTES[attempt - 1];
  const failedAt = Date.parse(String(job?.updatedAt || ""));
  const current = now instanceof Date ? now.valueOf() : Date.parse(String(now || ""));
  if (!Number.isFinite(failedAt) || !Number.isFinite(current)) return { retry: false, delayMinutes };
  return {
    retry: current - failedAt >= delayMinutes * 60 * 1000,
    delayMinutes
  };
}

function dateParts(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("采集计划时间无效。");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
}
function isoDate(parts) {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function previousDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day - 1));
  return date.toISOString().slice(0, 10);
}

function timeZoneOffset(timeZone, businessDate) {
  if (timeZone === "Asia/Shanghai") return "+08:00";
  const probe = new Date(`${businessDate}T12:00:00Z`);
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset"
  }).formatToParts(probe).find(item => item.type === "timeZoneName")?.value || "GMT+00:00";
  return part.replace("GMT", "") || "+00:00";
}

function rangeFor(kind, businessDate, timeZone) {
  if (kind !== "daily_fact") return null;
  const offset = timeZoneOffset(timeZone, businessDate);
  return {
    start: `${businessDate}T00:00:00${offset}`,
    end: `${businessDate}T23:59:59${offset}`,
    timeZone
  };
}

export function webCollectionJobKey(job) {
  const providerId = String(job?.providerId || "").trim();
  const storeId = String(job?.storeId || "").trim();
  const resourceType = String(job?.resourceType || "").trim();
  const businessDate = String(job?.businessDate || "").trim();
  const scheduleVersion = String(job?.scheduleVersion || "v1").trim();
  if (!providerId || !resourceType || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    throw new Error("采集任务幂等键字段不完整。");
  }
  return [providerId, storeId, resourceType, businessDate, scheduleVersion].filter(Boolean).join(":");
}

import { usesSelfService } from "./douyinSelfServiceExtract.js";

// 与 src/domain/douyinSelfServiceExtract.js 的 DAILY_TASK_QUOTA 同源，
// 这里单独写一份是为了让规划层不依赖采集器的模块。
export const DOUYIN_SELF_SERVICE_DAILY_QUOTA = 5;

export function createDailyPlan({
  adapters = [],
  now = new Date(),
  timeZone = "Asia/Shanghai",
  // 凌晨 5 点排昨日采集会拿到半成品：快麦销售主题报表虽然标称 T+1，但清晨聚合
  // 尚未完成，导出的数据严重残缺。2026-07-29 的对照极干净——同一业务日、同一套
  // 代码、同一个采集器，05:07 采到 188 行 ¥8,880，11:55 重采得到 549 行 ¥129,223，
  // 只差采集时间。因此推迟到上午 10 点，给上游留足聚合时间。
  scheduleHour = 10
} = {}) {
  const parts = dateParts(now, timeZone);
  if (Number(parts.hour) < scheduleHour) return [];
  const today = isoDate(parts);
  const yesterday = previousDate(today);
  const plan = [];
  for (const adapter of adapters) {
    if (!adapter || adapter.enabled === false) continue;
    const providerId = String(adapter.id || "").trim();
    if (!providerId) continue;
    const stores = Array.isArray(adapter.stores) && adapter.stores.length
      ? adapter.stores
      : [{ id: String(adapter.storeId || "").trim() }];
    for (const store of stores) {
      if (!store || store.enabled === false) continue;
      const storeId = String(store.id || "").trim();
      for (const resource of adapter.resources || []) {
        if (!resource || resource.enabled === false) continue;
        const resourceType = String(resource.type || "").trim();
        if (!resourceType) continue;
        const rangeKind = resource.rangeKind === "daily_fact" ? "daily_fact" : "current_snapshot";
        const businessDate = rangeKind === "daily_fact" ? yesterday : today;
        const job = {
          providerId,
          storeId,
          resourceType,
          businessDate,
          rangeKind,
          range: rangeFor(rangeKind, businessDate, timeZone),
          scheduleVersion: String(resource.scheduleVersion || "v1"),
          // 抖音的日事实统一走自助取数：逐页导出拿不到成交订单数与成交人数，
          // 页面标签又抓错过（曾显示 314 万单 / 257 万人，实际 GMV 仅 6.5 万）。
          //
          // 这个标记只在本地用来算当日配额。执行器不读它——它按资源类型自己判定，
          // 因为 web_collection_jobs 表没有这一列，标记经服务端一个来回就没了。
          ...(usesSelfService({ providerId, resourceType }) ? { viaSelfService: true } : {})
        };
        plan.push({ ...job, idempotencyKey: webCollectionJobKey(job) });
      }
    }
  }
  assertSelfServiceQuota(plan);
  return plan;
}

// 罗盘自助取数每天只能建 5 条任务（2026-07-31 实测，第 6 条直接被拒）。
//
// 排超了不会在排计划时出问题，而是在跑到第 6 条时被平台拒掉——那时前 5 条已经排进
// 队列，看起来一切正常，唯独有个资源今天永远采不到，且失败信息只说「每天仅支持创建
// 5 条任务」，看不出是计划排多了。所以在排计划时就挡住。
export function assertSelfServiceQuota(plan = []) {
  const count = plan.filter(job => job.viaSelfService).length;
  if (count > DOUYIN_SELF_SERVICE_DAILY_QUOTA) {
    throw new Error(
      `当日自助取数任务 ${count} 条，超过平台配额 ${DOUYIN_SELF_SERVICE_DAILY_QUOTA} 条；`
      + "超出的部分会被平台拒绝，需要先减少资源或改用长区间补采。"
    );
  }
  return true;
}

export function assertWebCollectionTransition(from, to) {
  if (!WEB_COLLECTION_STATES.includes(from) || !WEB_COLLECTION_STATES.includes(to) || !TRANSITIONS[from]?.has(to)) {
    throw new Error(`非法采集状态转换：${from || "unknown"} -> ${to || "unknown"}`);
  }
  return true;
}

export function nextCursorForSuccessfulJob(job, run) {
  if (job?.status !== "success") return null;
  return {
    providerId: job.providerId,
    storeId: String(job.storeId || ""),
    resourceType: job.resourceType,
    businessDate: job.businessDate,
    jobId: job.id,
    runId: run?.id || null,
    batchId: run?.batchId || null,
    completedAt: run?.completedAt || null
  };
}

function failureDedupeKey(job) {
  return [
    job.businessDate,
    job.providerId,
    job.storeId || "",
    job.resourceType,
    job.errorCode || "UNKNOWN",
    job.stage || job.status
  ].filter(Boolean).join(":");
}

export function notificationIntents({
  jobs = [],
  notifications = [],
  now = new Date(),
  timeZone = "Asia/Shanghai"
} = {}) {
  const parts = dateParts(now, timeZone);
  const today = isoDate(parts);
  const sent = new Set(notifications.map(item => item?.dedupeKey).filter(Boolean));
  const incomplete = jobs.filter(job => ["failed", "waiting_human", "schema_changed"].includes(job?.status));
  const intents = incomplete
    .map(job => ({
      kind: "failure",
      jobId: job.id,
      providerId: job.providerId,
      storeId: String(job.storeId || ""),
      resourceType: job.resourceType,
      errorCode: job.errorCode || "UNKNOWN",
      stage: job.stage || job.status,
      dedupeKey: failureDedupeKey(job)
    }))
    .filter(item => !sent.has(item.dedupeKey));
  if (Number(parts.hour) > 6 || (Number(parts.hour) === 6 && Number(parts.minute) >= 30)) {
    const dedupeKey = `${today}:daily-summary`;
    if (incomplete.length && !sent.has(dedupeKey)) {
      intents.push({ kind: "daily_summary", count: incomplete.length, dedupeKey });
    }
  }
  return intents;
}
