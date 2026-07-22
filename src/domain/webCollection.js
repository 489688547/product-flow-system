export const WEB_COLLECTION_STATES = Object.freeze([
  "queued",
  "claimed",
  "opening",
  "waiting_human",
  "exporting",
  "downloading",
  "validating",
  "ingesting",
  "success",
  "failed",
  "schema_changed"
]);

const TRANSITIONS = Object.freeze({
  queued: new Set(["claimed"]),
  claimed: new Set(["opening", "queued", "failed"]),
  opening: new Set(["exporting", "waiting_human", "schema_changed", "failed"]),
  waiting_human: new Set(["queued"]),
  exporting: new Set(["downloading", "waiting_human", "schema_changed", "failed"]),
  downloading: new Set(["validating", "failed"]),
  validating: new Set(["ingesting", "failed"]),
  ingesting: new Set(["success", "failed"]),
  success: new Set(),
  failed: new Set(["queued"]),
  schema_changed: new Set(["queued"])
});

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
  const resourceType = String(job?.resourceType || "").trim();
  const businessDate = String(job?.businessDate || "").trim();
  const scheduleVersion = String(job?.scheduleVersion || "v1").trim();
  if (!providerId || !resourceType || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    throw new Error("采集任务幂等键字段不完整。");
  }
  return `${providerId}:${resourceType}:${businessDate}:${scheduleVersion}`;
}

export function createDailyPlan({
  adapters = [],
  now = new Date(),
  timeZone = "Asia/Shanghai",
  scheduleHour = 5
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
    for (const resource of adapter.resources || []) {
      if (!resource || resource.enabled === false) continue;
      const resourceType = String(resource.type || "").trim();
      if (!resourceType) continue;
      const rangeKind = resource.rangeKind === "daily_fact" ? "daily_fact" : "current_snapshot";
      const businessDate = rangeKind === "daily_fact" ? yesterday : today;
      const job = {
        providerId,
        resourceType,
        businessDate,
        rangeKind,
        range: rangeFor(rangeKind, businessDate, timeZone),
        scheduleVersion: String(resource.scheduleVersion || "v1")
      };
      plan.push({ ...job, idempotencyKey: webCollectionJobKey(job) });
    }
  }
  return plan;
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
    resourceType: job.resourceType,
    businessDate: job.businessDate,
    jobId: job.id,
    runId: run?.id || null,
    batchId: run?.batchId || null,
    completedAt: run?.completedAt || null
  };
}

function failureDedupeKey(job) {
  return [job.businessDate, job.providerId, job.resourceType, job.errorCode || "UNKNOWN", job.stage || job.status].join(":");
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

