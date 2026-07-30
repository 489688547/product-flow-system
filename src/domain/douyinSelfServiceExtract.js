// 抖音罗盘「数据工厂 → 自助取数」是官方的批量取数入口，能力远超逐页抓接口：
// 最长支持近 14 个月，一次覆盖店铺、商品、直播间、短视频四个主要维度，指标含
// 成交、结算、退款、支出、流量、体验分（见 docs/features/douyin-api-collection/
// compass-survey.md）。逐页接口的回溯能力差别极大——直播 90 天、商品卡仅约 3 天。
//
// 它是异步的：创建任务 → 排队 → 下载。队列为全平台共用，实测创建后约 12 分钟完成，
// 页面提示一般需 10-20 分钟。因此不能指望同步拿到文件。

export const SELF_SERVICE_ROUTE = "/shop/workshop/appcustom-access?tab=access";

// 主要维度是单选，取值取自页面表单的 radio value。
export const PRIMARY_DIMENSIONS = Object.freeze({
  store_daily: "shop",
  product_daily: "product",
  live_daily: "live",
  video_daily: "video"
});

// 单次统计周期最长 3 个月，超出会被表单拒绝。补历史时必须按此切段。
export const MAX_RANGE_DAYS = 92;

// 页面提示「取数完成等待时间一般至少为 10-20 分钟」，且队列全平台共用。
// 超时留足余量：宁可等，也不要把还在排队的任务判成失败后重复创建，
// 那只会让本就拥挤的队列更长。
export const TASK_TIMEOUT_MS = 45 * 60 * 1000;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(value, label) {
  const text = String(value || "");
  if (!DATE_PATTERN.test(text)) {
    throw Object.assign(new Error(`${label}格式应为 YYYY-MM-DD，收到「${text}」。`), {
      code: "DOUYIN_EXTRACT_DATE_INVALID"
    });
  }
  return text;
}

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
}

// 任务名称要能在任务列表里被唯一认出来：列表只给名称、创建人、状态、创建日期，
// 没有业务字段，靠名称回找是唯一可行的关联方式。
export function buildTaskName({ resourceType, from, to } = {}) {
  const dimension = PRIMARY_DIMENSIONS[resourceType];
  if (!dimension) {
    throw Object.assign(new Error(`资源 ${resourceType} 未登记主要维度。`), {
      code: "DOUYIN_EXTRACT_RESOURCE_INVALID"
    });
  }
  const start = assertDate(from, "开始日期");
  const end = assertDate(to, "结束日期");
  return `采集-${dimension}-${start.replace(/-/g, "")}-${end.replace(/-/g, "")}`;
}

export function buildExtractPlan({ resourceType, from, to } = {}) {
  const dimension = PRIMARY_DIMENSIONS[resourceType];
  if (!dimension) {
    throw Object.assign(new Error(`资源 ${resourceType} 未登记主要维度。`), {
      code: "DOUYIN_EXTRACT_RESOURCE_INVALID"
    });
  }
  const start = assertDate(from, "开始日期");
  const end = assertDate(to, "结束日期");
  if (start > end) {
    throw Object.assign(new Error("开始日期不能晚于结束日期。"), {
      code: "DOUYIN_EXTRACT_RANGE_INVALID"
    });
  }
  const span = daysBetween(start, end);
  if (span > MAX_RANGE_DAYS) {
    throw Object.assign(new Error(`统计周期 ${span} 天超过单次上限 ${MAX_RANGE_DAYS} 天，需拆分。`), {
      code: "DOUYIN_EXTRACT_RANGE_TOO_LONG"
    });
  }
  return {
    taskName: buildTaskName({ resourceType, from: start, to: end }),
    dimension,
    from: start,
    to: end,
    // 自然日累计才会一行一天；统计日期累计给的是区间合计，无法还原到业务日。
    granularity: "自然日累计"
  };
}

// 把一个长区间切成不超过上限的若干段。补 14 个月历史时必须先切，
// 否则表单直接拒绝，而且拒绝信息只在页面上，采集器看不到。
export function splitExtractRange({ from, to, maxDays = MAX_RANGE_DAYS } = {}) {
  const start = assertDate(from, "开始日期");
  const end = assertDate(to, "结束日期");
  if (start > end) return [];
  const segments = [];
  let cursor = start;
  while (cursor <= end) {
    const cursorMs = Date.parse(`${cursor}T00:00:00Z`);
    const lastMs = Math.min(cursorMs + (maxDays - 1) * 86400000, Date.parse(`${end}T00:00:00Z`));
    const last = new Date(lastMs).toISOString().slice(0, 10);
    segments.push({ from: cursor, to: last });
    cursor = new Date(lastMs + 86400000).toISOString().slice(0, 10);
  }
  return segments;
}

const READY_STATUS = "取数完成";
const FAILED_MARKERS = Object.freeze(["失败", "异常"]);

// 任务列表只有名称、创建人、状态、创建日期四列，没有业务字段。
// 因此必须靠任务名称回找自己创建的那一条，不能取「最新一条」——
// 全平台队列里随时可能有别人的任务，取最新会拿错。
export function selectExtractTask(rows = [], taskName = "") {
  const name = String(taskName || "");
  if (!name) return { state: "missing" };
  const row = (Array.isArray(rows) ? rows : []).find(item => String(item?.taskName || "").trim() === name);
  if (!row) return { state: "missing" };
  const status = String(row.status || "").replace(/\s+/g, "");
  if (FAILED_MARKERS.some(marker => status.includes(marker))) {
    return { state: "failed", errorCode: "DOUYIN_EXTRACT_TASK_FAILED", status };
  }
  if (status.includes(READY_STATUS)) return { state: "ready", status };
  return { state: "pending", status };
}

// 判断是否还该继续等。超时后不再等待，但要说清是「还在排队」而不是「失败了」，
// 否则人会以为要改代码，实际只需要过一会儿重试。
export function planExtractWait({ startedAt, now, state, status = "" } = {}) {
  if (state === "ready") return { action: "download" };
  if (state === "failed") {
    return { action: "fail", errorCode: "DOUYIN_EXTRACT_TASK_FAILED", message: `罗盘取数任务失败：${status}` };
  }
  const elapsed = Number(now) - Number(startedAt);
  if (!Number.isFinite(elapsed)) {
    return { action: "fail", errorCode: "DOUYIN_EXTRACT_TIMEOUT", message: "无法判断取数任务已等待多久。" };
  }
  if (elapsed >= TASK_TIMEOUT_MS) {
    return {
      action: "fail",
      errorCode: "DOUYIN_EXTRACT_TIMEOUT",
      message: `罗盘取数任务等待超过 ${Math.round(TASK_TIMEOUT_MS / 60000)} 分钟仍未完成（当前状态：${status || "排队中"}），队列繁忙时属正常，稍后重试即可。`
    };
  }
  return { action: "wait" };
}
