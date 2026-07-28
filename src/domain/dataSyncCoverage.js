import { runnerOnline, stageText } from "./dataSyncRecovery.js";

// 两种口径都权威，回答不同问题：统一口径来自快麦 ERP，为跨平台可比做过归一；
// 平台官方口径与该平台后台一致。两者本就不相等，页面不得暗示应当相等。
export const CALIBERS = Object.freeze({
  unified: Object.freeze({
    id: "unified",
    label: "统一口径",
    providers: Object.freeze(["kuaimai"]),
    impacts: Object.freeze(["净销售额", "销量", "毛利", "平台分布"])
  }),
  platform: Object.freeze({
    id: "platform",
    label: "平台官方口径",
    providers: Object.freeze(["douyin-ecommerce"]),
    impacts: Object.freeze(["与该平台对账", "该平台流量与内容分析"])
  })
});

// 统一口径的默认采集目标；平台口径的资源由已登记店铺展开。
const UNIFIED_RESOURCE = Object.freeze({ providerId: "kuaimai", resourceType: "order_items", label: "订单明细" });
const PLATFORM_RESOURCES = Object.freeze([
  Object.freeze({ type: "store_daily", label: "店铺每日" }),
  Object.freeze({ type: "product_daily", label: "商品每日" }),
  Object.freeze({ type: "live_daily", label: "直播每日" }),
  Object.freeze({ type: "video_daily", label: "短视频每日" })
]);

const RUNNING_JOB_STATES = new Set(["claimed", "opening", "collecting", "exporting", "downloading", "validating", "ingesting", "running"]);
const BLOCKED_JOB_STATES = new Set(["waiting_human", "schema_changed"]);
// 排队任务超过 24 小时无人领取会被服务端自愈为失败，弹窗必须提前告知。
const QUEUE_ABANDON_HOURS = 24;
const DEFAULT_BATCH_LIMIT = 20;

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function businessDatesInRange({ from, to }) {
  const dates = [];
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return dates;
  for (let stamp = start; stamp <= end; stamp += 86400000) {
    dates.push(new Date(stamp).toISOString().slice(0, 10));
  }
  return dates;
}

// 残缺判定必须迭代：把已判定残缺的日期移出基线后重算，否则连续坏日会把中位数拉低，
// 使后面的坏日显得正常而逃过检测。
export function detectIncompleteBusinessDays(dailyFacts = [], { threshold = 0.25, excludeDates = [] } = {}) {
  const facts = dailyFacts
    .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(String(item?.date || "")))
    .map(item => ({ date: String(item.date), sales: number(item.sales), qty: number(item.qty) }));
  const excluded = new Set(excludeDates);
  const incomplete = new Set();
  let currentMedian = 0;
  for (let round = 0; round < facts.length + 1; round += 1) {
    const baseline = facts.filter(item => !excluded.has(item.date) && !incomplete.has(item.date));
    currentMedian = median(baseline.map(item => item.sales));
    if (!currentMedian) break;
    const nextIncomplete = facts.filter(item => (
      !excluded.has(item.date)
      && !incomplete.has(item.date)
      && item.sales / currentMedian < threshold
    ));
    if (!nextIncomplete.length) break;
    nextIncomplete.forEach(item => incomplete.add(item.date));
  }
  return {
    median: currentMedian,
    threshold,
    dates: [...incomplete],
    evidenceFor(date) {
      const fact = facts.find(item => item.date === date);
      if (!fact || !currentMedian) return null;
      return { sales: fact.sales, qty: fact.qty, median: currentMedian, ratio: fact.sales / currentMedian };
    }
  };
}

function jobsFor(jobs, { providerIds, businessDate }) {
  return jobs.filter(job => (
    providerIds.includes(String(job?.providerId || ""))
    && String(job?.businessDate || "") === businessDate
  ));
}

function queuePositions(jobs) {
  const queued = jobs
    .filter(job => String(job?.status || "") === "queued")
    .slice()
    .sort((left, right) => (
      `${left.businessDate}:${left.createdAt || ""}`.localeCompare(`${right.businessDate}:${right.createdAt || ""}`)
    ));
  return new Map(queued.map((job, index) => [job.id, index + 1]));
}

function resourceLabels(caliber, stores) {
  if (caliber === "unified") return [UNIFIED_RESOURCE.label];
  return stores.length ? PLATFORM_RESOURCES.map(item => item.label) : [];
}

function coverageRow({ caliber, businessDate, dayJobs, positions, incomplete, stores }) {
  const definition = CALIBERS[caliber];
  const base = {
    key: `${caliber}:${businessDate}`,
    businessDate,
    caliber,
    caliberLabel: definition.label,
    impacts: [...definition.impacts],
    resourceLabels: resourceLabels(caliber, stores),
    storeNames: caliber === "platform" ? stores.map(store => store.storeName).filter(Boolean) : [],
    queuePosition: null,
    evidence: null,
    // 缺口判定来自销售事实与任务记录，与采集器是否在线无关，因此始终可信。
    trustworthy: true,
    jobs: dayJobs
  };
  const queued = dayJobs.find(job => String(job.status) === "queued");
  if (queued) return { ...base, status: "queued", queuePosition: positions.get(queued.id) || null, selectable: false };
  if (dayJobs.some(job => RUNNING_JOB_STATES.has(String(job.status)))) {
    return { ...base, status: "running", selectable: false };
  }
  const blocked = dayJobs.find(job => BLOCKED_JOB_STATES.has(String(job.status)));
  if (blocked) return { ...base, status: "waiting_human", selectable: true, errorCode: String(blocked.errorCode || "") };
  const failed = dayJobs.find(job => String(job.status) === "failed");
  if (failed) return { ...base, status: "failed", selectable: true, errorCode: String(failed.errorCode || "") };
  if (caliber === "platform") {
    // 平台侧没有独立的销售事实来源，只能按任务状态判定，不做统计推断。
    if (dayJobs.some(job => String(job.status) === "success")) return { ...base, status: "synced", selectable: false };
    return { ...base, status: "missing", selectable: true };
  }
  if (incomplete.missing.has(businessDate)) return { ...base, status: "missing", selectable: true };
  if (incomplete.detected.dates.includes(businessDate)) {
    return { ...base, status: "incomplete", selectable: true, evidence: incomplete.detected.evidenceFor(businessDate) };
  }
  return { ...base, status: "synced", selectable: false };
}

export function buildSyncCoverage({
  jobs = [],
  stores = [],
  dailyFacts = [],
  range = { from: "", to: "" },
  includeHealthy = false,
  threshold = 0.25
} = {}) {
  const dates = businessDatesInRange(range);
  if (!dates.length) return [];
  const factDates = new Set(dailyFacts.map(item => String(item?.date || "")));
  const connectedStores = stores.filter(store => String(store?.status || "") === "connected");
  const missing = new Set(dates.filter(date => !factDates.has(date)));
  const detected = detectIncompleteBusinessDays(dailyFacts, { threshold, excludeDates: [...missing] });
  const incomplete = { missing, detected };
  const positions = queuePositions(jobs);
  const rows = [];
  for (const businessDate of dates) {
    for (const caliber of ["unified", "platform"]) {
      const providerIds = [...CALIBERS[caliber].providers];
      if (caliber === "platform" && !connectedStores.length) continue;
      rows.push(coverageRow({
        caliber,
        businessDate,
        dayJobs: jobsFor(jobs, { providerIds, businessDate }),
        positions,
        incomplete,
        stores: connectedStores
      }));
    }
  }
  const ordered = rows.sort((left, right) => (
    right.businessDate.localeCompare(left.businessDate)
    || (left.caliber === "unified" ? -1 : 1)
  ));
  return includeHealthy ? ordered : ordered.filter(item => item.status !== "synced");
}

function providerLabel(providerId) {
  return { kuaimai: "快麦", "douyin-ecommerce": "抖店" }[providerId] || providerId;
}

function loginUrlFor(providerId) {
  return {
    kuaimai: "https://erpb.superboss.cc/index.html#/trade/searchlist/",
    "douyin-ecommerce": "https://fxg.jinritemai.com/"
  }[providerId] || "";
}

// 采集器离线时 chrome_status 与任务错误码都是历史值，不再代表当前状态。
// 此时一律标记为未知并附最近上报时间，不得把过期心跳渲染成「已连接」。
function providerConnection({ providerId, runner, online, jobs }) {
  const recentLoginIssue = jobs.some(job => (
    String(job?.providerId || "") === providerId
    && /LOGIN_REQUIRED|HUMAN_VERIFICATION_REQUIRED/i.test(String(job?.errorCode || ""))
  ));
  if (!online) {
    const observed = recentLoginIssue ? "最近一次采集提示需要登录" : "最近一次上报为已连接";
    return { connectionKnown: false, needsLogin: recentLoginIssue, connectionLabel: `未知 · ${observed}` };
  }
  if (recentLoginIssue) return { connectionKnown: true, needsLogin: true, connectionLabel: "需要登录" };
  const chromeReady = ["ready", "extension_online", "dedicated_browser_online"].includes(String(runner?.chromeStatus || ""));
  return {
    connectionKnown: true,
    needsLogin: false,
    connectionLabel: chromeReady ? "扩展已连接" : "扩展未连接"
  };
}

export function buildBackfillPreflight(targets = [], {
  runners = [],
  stores = [],
  jobs = [],
  now = new Date(),
  limit = DEFAULT_BATCH_LIMIT
} = {}) {
  const runner = runners.find(item => String(item?.status || "") !== "disabled") || runners[0] || null;
  const online = runnerOnline(runner, now);
  const byCaliber = new Map();
  for (const target of targets) {
    const caliber = String(target?.caliber || "unified");
    const providerId = String(target?.providerId || CALIBERS[caliber]?.providers[0] || "");
    if (!byCaliber.has(caliber)) byCaliber.set(caliber, new Map());
    const providers = byCaliber.get(caliber);
    if (!providers.has(providerId)) {
      providers.set(providerId, {
        providerId,
        providerName: providerLabel(providerId),
        loginUrl: loginUrlFor(providerId),
        ...providerConnection({ providerId, runner, online, jobs }),
        items: []
      });
    }
    providers.get(providerId).items.push({
      businessDate: String(target?.businessDate || ""),
      resourceType: String(target?.resourceType || ""),
      storeName: String(target?.storeName || "")
    });
  }
  const groups = ["unified", "platform"]
    .filter(caliber => byCaliber.has(caliber))
    .map(caliber => ({
      caliber,
      caliberLabel: CALIBERS[caliber].label,
      impacts: [...CALIBERS[caliber].impacts],
      providers: [...byCaliber.get(caliber).values()]
    }));
  const total = targets.length;
  const businessDates = new Set(targets.map(target => String(target?.businessDate || "")));
  const exceedsLimit = total > limit;
  return {
    total,
    businessDayCount: businessDates.size,
    groups,
    runnerName: runner?.name || "公司 Mac",
    runnerOnline: online,
    lastSeenAt: runner?.lastSeenAt || "",
    // 离线时默认动作是去解决问题，不是往空队列里塞任务。
    primaryAction: !online ? "recheck" : exceedsLimit ? "none" : "queue",
    canQueueAnyway: !exceedsLimit,
    blockingReason: online ? "" : `${runner?.name || "公司 Mac"}采集器未上报心跳，当前没有设备会领取任务。`,
    queueWarning: online ? "" : `排队后 ${QUEUE_ABANDON_HOURS} 小时仍无采集器领取会自动标记为失败，需要重新触发。`,
    exceedsLimit,
    limit,
    limitReason: exceedsLimit ? `一次最多补 ${limit} 个目标，当前选择了 ${total} 个，请缩小范围。` : ""
  };
}

function latestCompleted(jobs) {
  return jobs
    .filter(job => String(job?.status || "") === "success" && job?.completedAt)
    .slice()
    .sort((left, right) => String(right.completedAt).localeCompare(String(left.completedAt)))[0] || null;
}

export function buildCollectionProgress({ jobs = [], runners = [], now = new Date() } = {}) {
  const runner = runners.find(item => String(item?.status || "") !== "disabled") || runners[0] || null;
  const online = runnerOnline(runner, now);
  const queued = jobs.filter(job => String(job?.status || "") === "queued");
  const active = jobs.find(job => RUNNING_JOB_STATES.has(String(job?.status || "")));
  const base = {
    runnerName: runner?.name || "公司 Mac",
    runnerOnline: online,
    queueRemaining: queued.length,
    lastSeenAt: runner?.lastSeenAt || ""
  };
  if (active && online) {
    const stageLabel = stageText(active);
    return {
      ...base,
      state: "running",
      businessDate: String(active.businessDate || ""),
      providerId: String(active.providerId || ""),
      resourceType: String(active.resourceType || ""),
      stageLabel,
      label: `正在补 ${active.businessDate} ${providerLabel(active.providerId)} · ${stageLabel}`
    };
  }
  if (queued.length && !online) {
    // 采集器离线时不得显示执行中——没有设备在跑。
    return { ...base, state: "waiting_runner", label: `队列中 ${queued.length} 个，等待采集器上线` };
  }
  if (queued.length) {
    return { ...base, state: "queued", label: `队列中 ${queued.length} 个，等待领取` };
  }
  const done = latestCompleted(jobs);
  if (done) {
    // 队列清空后保留最近结果，避免进度突然消失让人以为从没跑过。
    return { ...base, state: "idle", label: `最近完成 ${done.businessDate} ${providerLabel(done.providerId)}` };
  }
  return { ...base, state: "idle", label: online ? "暂无采集任务" : "采集器离线" };
}

export function buildSyncConclusion(coverage = [], progress = {}, { windowDays = 14, latestDate = "" } = {}) {
  const problems = coverage.filter(row => !["synced", "queued", "running"].includes(String(row?.status || "")));
  const unifiedDays = new Set(problems.filter(row => row.caliber === "unified").map(row => row.businessDate));
  const platformDays = new Set(problems.filter(row => row.caliber === "platform").map(row => row.businessDate));
  const offline = progress?.runnerOnline === false;
  const primaryAction = offline ? "recheck" : unifiedDays.size || platformDays.size ? "backfill" : "none";
  if (unifiedDays.size) {
    return {
      tone: "danger",
      primaryAction,
      text: `最近 ${windowDays} 天有 ${unifiedDays.size} 天的统一口径销售数据不能信`,
      unifiedDayCount: unifiedDays.size,
      platformDayCount: platformDays.size
    };
  }
  if (platformDays.size) {
    return {
      tone: "warning",
      primaryAction,
      text: `销售数据完整 · 平台官方口径数据缺 ${platformDays.size} 天`,
      unifiedDayCount: 0,
      platformDayCount: platformDays.size
    };
  }
  return {
    tone: "success",
    primaryAction,
    text: latestDate ? `最近 ${windowDays} 天数据完整，截取到 ${latestDate}` : `最近 ${windowDays} 天数据完整`,
    unifiedDayCount: 0,
    platformDayCount: 0
  };
}
