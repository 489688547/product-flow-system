import assert from "node:assert/strict";
import test from "node:test";
import {
  CALIBERS,
  buildBackfillPreflight,
  buildCollectionProgress,
  buildSyncConclusion,
  buildSyncCoverage,
  detectIncompleteBusinessDays
} from "../src/domain/dataSyncCoverage.js";

const range = { from: "2026-07-21", to: "2026-07-27" };
const now = new Date("2026-07-27T10:00:00.000Z");

// 健康日约 12.8 万，07-26 只有 1.2 万，07-25 完全没有行。
const dailyFacts = [
  { date: "2026-07-21", sales: 130000, qty: 9000 },
  { date: "2026-07-22", sales: 126000, qty: 8800 },
  { date: "2026-07-23", sales: 128000, qty: 8900 },
  { date: "2026-07-24", sales: 129000, qty: 9100 },
  { date: "2026-07-26", sales: 12340, qty: 860 },
  { date: "2026-07-27", sales: 11800, qty: 820 }
];

const stores = [{ providerId: "douyin-ecommerce", storeId: "90862283", storeName: "提野星旗舰店", status: "connected" }];

function coverage(overrides = {}) {
  return buildSyncCoverage({ jobs: [], stores, dailyFacts, range, now, ...overrides });
}

function row(rows, date, caliber) {
  return rows.find(item => item.businessDate === date && item.caliber === caliber) || null;
}

test("整日没有销售事实且没有任务时判为断档", () => {
  const rows = coverage();
  const missing = row(rows, "2026-07-25", "unified");
  assert.ok(missing, "断档日必须产生覆盖行");
  assert.equal(missing.status, "missing");
  assert.equal(missing.selectable, true);
  assert.deepEqual(missing.impacts, ["净销售额", "销量", "毛利", "平台分布"]);
});

test("残缺日给出当日值与同期中位数作为证据，由用户判断是否真缺", () => {
  const incomplete = row(coverage(), "2026-07-26", "unified");
  assert.equal(incomplete.status, "incomplete");
  assert.equal(incomplete.evidence.sales, 12340);
  assert.equal(incomplete.evidence.median, 128500);
  assert.ok(incomplete.evidence.ratio < 0.25);
});

test("中位数只取健康日，断档与残缺日不参与，避免坏日拉低基线掩盖后续坏日", () => {
  // 若把 07-26 与 07-27 的低值算进基线，中位数会被拉低，07-27 就不再被判为残缺。
  const detected = detectIncompleteBusinessDays(dailyFacts, { threshold: 0.25 });
  assert.equal(detected.median, 128500, "基线必须排除已判定残缺的日期");
  assert.deepEqual(detected.dates.sort(), ["2026-07-26", "2026-07-27"]);
});

test("统一口径与平台官方口径分行，且统一口径排在前面", () => {
  const rows = coverage();
  const day = rows.filter(item => item.businessDate === "2026-07-25");
  assert.equal(day.length, 2);
  assert.equal(day[0].caliber, "unified");
  assert.equal(day[1].caliber, "platform");
  assert.equal(CALIBERS.unified.label, "统一口径");
  assert.equal(CALIBERS.platform.label, "平台官方口径");
});

test("平台官方口径缺口不影响统一口径销售数字", () => {
  const platform = row(coverage(), "2026-07-25", "platform");
  assert.equal(platform.impacts.includes("净销售额"), false, "平台缺口不得声称影响统一口径销售额");
  assert.ok(platform.impacts.some(item => /对账/.test(item)));
});

test("平台官方口径只按任务状态判定，不用销售事实推断残缺", () => {
  // 平台侧没有独立销售事实来源，07-26 有任务成功即为已同步，不得因统一口径偏低而误判。
  const jobs = [{
    id: "p1", providerId: "douyin-ecommerce", storeId: "90862283", resourceType: "store_daily",
    businessDate: "2026-07-26", status: "success", stage: "success"
  }];
  const rows = buildSyncCoverage({ jobs, stores, dailyFacts, range, now, includeHealthy: true });
  const platform = row(rows, "2026-07-26", "platform");
  assert.equal(platform.status, "synced", "平台侧有成功任务即为已同步，不得按统一口径的低值判为残缺");
});

test("排队中的日期给出队列位置且不可勾选", () => {
  const jobs = [
    { id: "a", providerId: "kuaimai", resourceType: "order_items", businessDate: "2026-07-25", status: "queued", stage: "queued", createdAt: "2026-07-27T09:00:00.000Z" },
    { id: "b", providerId: "kuaimai", resourceType: "order_items", businessDate: "2026-07-26", status: "queued", stage: "queued", createdAt: "2026-07-27T09:01:00.000Z" }
  ];
  const rows = coverage({ jobs });
  const first = row(rows, "2026-07-25", "unified");
  const second = row(rows, "2026-07-26", "unified");
  assert.equal(first.status, "queued");
  assert.equal(first.queuePosition, 1);
  assert.equal(second.queuePosition, 2);
  // 强制重触发对 queued 无效，给按钮等于欺骗。
  assert.equal(first.selectable, false);
});

test("默认只返回有问题的业务日，健康日不占行", () => {
  const rows = coverage();
  assert.equal(rows.some(item => item.status === "synced"), false);
  const all = buildSyncCoverage({ jobs: [], stores, dailyFacts, range, now, includeHealthy: true });
  assert.ok(all.some(item => item.status === "synced"), "显示全部时健康日必须出现");
});

test("等待人工在两种口径下的含义不同：统一口径以事实为准，平台口径以任务为准", () => {
  const jobs = [
    {
      id: "f1", providerId: "kuaimai", resourceType: "order_items", businessDate: "2026-07-26",
      status: "waiting_human", stage: "waiting_human", errorCode: "KUAIMAI_LOGIN_REQUIRED"
    },
    {
      id: "f2", providerId: "douyin-ecommerce", storeId: "90862283", resourceType: "store_daily",
      businessDate: "2026-07-26", status: "waiting_human", stage: "waiting_human", errorCode: "DOUYIN_LOGIN_REQUIRED"
    }
  ];
  const rows = coverage({ jobs });
  // 统一口径：当天事实偏低，结论是残缺；登录问题作为原因说明而不是结论。
  const unified = row(rows, "2026-07-26", "unified");
  assert.equal(unified.status, "incomplete");
  assert.equal(unified.errorCode, "KUAIMAI_LOGIN_REQUIRED");
  // 平台口径没有独立事实来源，任务状态就是唯一信号。
  const platform = row(rows, "2026-07-26", "platform");
  assert.equal(platform.status, "waiting_human");
  assert.equal(platform.selectable, true);
});

test("采集器离线时扩展与登录状态显示为未知，不把过期心跳渲染成已连接", () => {
  const offlineRunner = { id: "r1", name: "公司 Mac", status: "active", chromeStatus: "ready", lastSeenAt: "2026-07-25T02:46:00.000Z" };
  const preflight = buildBackfillPreflight(
    [{ businessDate: "2026-07-25", caliber: "unified", providerId: "kuaimai", resourceType: "order_items" }],
    { runners: [offlineRunner], stores, jobs: [], now }
  );
  assert.equal(preflight.runnerOnline, false);
  const kuaimai = preflight.groups.flatMap(group => group.providers).find(item => item.providerId === "kuaimai");
  assert.equal(kuaimai.connectionKnown, false, "离线时连接状态不可信");
  assert.match(kuaimai.connectionLabel, /未知/);
  assert.equal(kuaimai.connectionLabel.includes("已连接") && !kuaimai.connectionLabel.includes("最近"), false);
  assert.ok(preflight.lastSeenAt, "必须给出最近一次上报时间供用户判断新旧");
});

test("采集器离线时主动作是重新检测而不是排队", () => {
  const offlineRunner = { id: "r1", name: "公司 Mac", status: "active", chromeStatus: "ready", lastSeenAt: "2026-07-25T02:46:00.000Z" };
  const preflight = buildBackfillPreflight(
    [{ businessDate: "2026-07-25", caliber: "unified", providerId: "kuaimai", resourceType: "order_items" }],
    { runners: [offlineRunner], stores, jobs: [], now }
  );
  assert.equal(preflight.primaryAction, "recheck");
  assert.equal(preflight.canQueueAnyway, true, "仍允许排队，但只能是次要路径");
  assert.match(preflight.blockingReason, /没有设备/);
  assert.match(preflight.queueWarning, /24 小时/, "必须告知排队后的过期规则");
});

test("采集器在线时主动作是排队", () => {
  const onlineRunner = { id: "r1", name: "公司 Mac", status: "active", chromeStatus: "ready", lastSeenAt: "2026-07-27T09:58:00.000Z" };
  const preflight = buildBackfillPreflight(
    [{ businessDate: "2026-07-25", caliber: "unified", providerId: "kuaimai", resourceType: "order_items" }],
    { runners: [onlineRunner], stores, jobs: [], now }
  );
  assert.equal(preflight.runnerOnline, true);
  assert.equal(preflight.primaryAction, "queue");
  assert.equal(preflight.blockingReason, "");
});

test("采集器离线不影响覆盖表对缺口的判定", () => {
  // 「数据缺不缺」来自销售事实与任务记录，与采集器是否在线无关。
  const rows = coverage();
  const missing = row(rows, "2026-07-25", "unified");
  assert.equal(missing.status, "missing");
  assert.equal(missing.trustworthy, true);
});

const onlineRunner = { id: "r1", name: "公司 Mac", status: "active", chromeStatus: "ready", lastSeenAt: "2026-07-27T09:58:00.000Z" };
const staleRunner = { id: "r1", name: "公司 Mac", status: "active", chromeStatus: "ready", lastSeenAt: "2026-07-25T02:46:00.000Z" };

test("进度显示当前业务日与阶段，并用 status 覆盖落后的 stage", () => {
  const jobs = [
    { id: "a", providerId: "kuaimai", resourceType: "order_items", businessDate: "2026-07-25", status: "downloading", stage: "queued" },
    { id: "b", providerId: "kuaimai", resourceType: "order_items", businessDate: "2026-07-26", status: "queued", stage: "queued", createdAt: "2026-07-27T09:00:00.000Z" }
  ];
  const progress = buildCollectionProgress({ jobs, runners: [onlineRunner], now });
  assert.equal(progress.state, "running");
  assert.equal(progress.businessDate, "2026-07-25");
  assert.equal(progress.stageLabel, "正在下载报表");
  assert.equal(progress.stageLabel.includes("等待领取"), false);
  assert.equal(progress.queueRemaining, 1);
});

test("采集器离线且队列非空时不显示执行中", () => {
  const jobs = [{ id: "b", providerId: "kuaimai", resourceType: "order_items", businessDate: "2026-07-26", status: "queued", stage: "queued" }];
  const progress = buildCollectionProgress({ jobs, runners: [staleRunner], now });
  assert.equal(progress.state, "waiting_runner");
  assert.equal(progress.queueRemaining, 1);
  assert.match(progress.label, /等待采集器上线/);
});

test("队列清空后保留最近一次完成结果，不让进度凭空消失", () => {
  const jobs = [{
    id: "done", providerId: "kuaimai", resourceType: "order_items", businessDate: "2026-07-24",
    status: "success", stage: "success", completedAt: "2026-07-27T09:37:00.000Z"
  }];
  const progress = buildCollectionProgress({ jobs, runners: [onlineRunner], now });
  assert.equal(progress.state, "idle");
  assert.equal(progress.queueRemaining, 0);
  assert.match(progress.label, /最近完成/);
  assert.match(progress.label, /2026-07-24/);
});

test("结论区分统一口径缺口与仅平台缺口", () => {
  const unifiedGap = buildSyncConclusion(
    [{ caliber: "unified", status: "missing", businessDate: "2026-07-25" }, { caliber: "unified", status: "incomplete", businessDate: "2026-07-26" }],
    { state: "idle" },
    { windowDays: 14 }
  );
  assert.equal(unifiedGap.tone, "danger");
  assert.match(unifiedGap.text, /2 天/);
  assert.match(unifiedGap.text, /统一口径/);

  const platformOnly = buildSyncConclusion(
    [{ caliber: "platform", status: "missing", businessDate: "2026-07-25" }],
    { state: "idle" },
    { windowDays: 14 }
  );
  // 销售完整就先说完整，那是用户最关心的数字。
  assert.match(platformOnly.text, /^销售数据完整/);
  assert.equal(platformOnly.tone, "warning");

  const healthy = buildSyncConclusion([], { state: "idle" }, { windowDays: 14, latestDate: "2026-07-27" });
  assert.equal(healthy.tone, "success");
  assert.match(healthy.text, /完整/);
});

test("采集器离线时结论的主动作是重新检测", () => {
  const conclusion = buildSyncConclusion(
    [{ caliber: "unified", status: "missing", businessDate: "2026-07-25" }],
    { state: "waiting_runner", runnerOnline: false },
    { windowDays: 14 }
  );
  assert.equal(conclusion.primaryAction, "recheck");
});

test("统一口径以销售事实为准，个别资源采集失败不掩盖当天数据其实是好的", () => {
  // 生产实测：07-27 的 order_items 失败但 sales_items 成功，当天销售事实健康。
  // 若把 failed 排在事实检查之前，11 个健康日会因历史失败记录被误报成采集失败。
  const healthyFacts = [
    { date: "2026-07-21", sales: 141771, qty: 9000 },
    { date: "2026-07-22", sales: 143285, qty: 9100 },
    { date: "2026-07-23", sales: 138113, qty: 8900 },
    { date: "2026-07-24", sales: 126605, qty: 8600 }
  ];
  const jobs = [
    { id: "a", providerId: "kuaimai", resourceType: "order_items", businessDate: "2026-07-24", status: "failed", errorCode: "KUAIMAI_TIME_RANGE_NOT_APPLIED" },
    { id: "b", providerId: "kuaimai", resourceType: "sales_items", businessDate: "2026-07-24", status: "success" }
  ];
  const rows = buildSyncCoverage({
    jobs, stores: [], dailyFacts: healthyFacts,
    range: { from: "2026-07-21", to: "2026-07-24" }, includeHealthy: true
  });
  const day = rows.find(item => item.businessDate === "2026-07-24" && item.caliber === "unified");
  assert.equal(day.status, "synced", "销售事实健康的日子不得因个别资源失败被判为采集失败");
  // 失败信息不丢，降级为附注。
  assert.equal(day.failedResources.length, 1);
  assert.match(day.note, /order_items|采集失败/);
});

test("销售事实缺失时，失败任务作为原因说明而不是掩盖缺口", () => {
  const jobs = [{ id: "a", providerId: "kuaimai", resourceType: "order_items", businessDate: "2026-07-25", status: "failed", errorCode: "KUAIMAI_LOGIN_REQUIRED" }];
  const rows = buildSyncCoverage({
    jobs, stores: [], dailyFacts,
    range: { from: "2026-07-24", to: "2026-07-25" }, includeHealthy: true
  });
  const day = rows.find(item => item.businessDate === "2026-07-25" && item.caliber === "unified");
  assert.equal(day.status, "missing");
  assert.equal(day.errorCode, "KUAIMAI_LOGIN_REQUIRED");
});

test("采集成功但入库失败时，覆盖行指向具体文件并要求重新入库而不是重新采集", () => {
  // 生产实测 2026-07-27：order_items 采集 success、归档成功、入库超时，当日只剩中位数的 8%。
  // 重新采集是白费——文件已经在本机，坏的是入库。
  const jobs = [{
    id: "j1", providerId: "kuaimai", resourceType: "order_items",
    businessDate: "2026-07-27", status: "success", stage: "success"
  }];
  const archives = [{
    id: "arch-0727", resourceType: "order_items", status: "failed",
    errorCode: "ERP_COLLECTION_ARCHIVE_PROCESSING_TIMEOUT",
    fileName: "快麦ERP交易订单明细导出20260727051545.xlsx",
    businessDateStart: "2026-07-27", businessDateEnd: "2026-07-27"
  }];
  const rows = buildSyncCoverage({
    jobs, archives, stores: [], dailyFacts,
    range: { from: "2026-07-26", to: "2026-07-27" }
  });
  const day = rows.find(item => item.businessDate === "2026-07-27" && item.caliber === "unified");
  assert.equal(day.status, "incomplete");
  assert.equal(day.blockedBy?.stage, "ingest", "缺口应归因到入库环节");
  assert.equal(day.blockedBy.fileName, "快麦ERP交易订单明细导出20260727051545.xlsx");
  assert.equal(day.recoveryAction, "reingest");
  assert.match(day.blockedBy.explanation, /已采集|已下载/);
  assert.match(day.blockedBy.explanation, /入库/);
});

test("没有对应归档时缺口仍归因到采集环节，动作维持重新采集", () => {
  const rows = buildSyncCoverage({
    jobs: [], archives: [], stores: [], dailyFacts,
    range: { from: "2026-07-25", to: "2026-07-25" }
  });
  const day = rows.find(item => item.businessDate === "2026-07-25" && item.caliber === "unified");
  assert.equal(day.status, "missing");
  assert.equal(day.blockedBy, null);
  assert.equal(day.recoveryAction, "recollect");
});

test("归档没有业务日期时不得张冠李戴地关联到任意一天", () => {
  const archives = [{
    id: "old", resourceType: "order_items", status: "archived", errorCode: null,
    fileName: "历史文件.xlsx", businessDateStart: null, businessDateEnd: null
  }];
  const rows = buildSyncCoverage({
    jobs: [], archives, stores: [], dailyFacts,
    range: { from: "2026-07-25", to: "2026-07-25" }
  });
  const day = rows.find(item => item.businessDate === "2026-07-25" && item.caliber === "unified");
  assert.equal(day.blockedBy, null);
});

test("批次范围是带时区的时间戳而非日期，仍应正确归因到业务日", () => {
  // 生产真实值：range_start = "2026-07-26T00:00:09+08:00"，不是 "2026-07-26"。
  // 直接做字符串比较永远匹配不上，缺口归因会静默失效。
  const archives = [{
    id: "arch", resourceType: "order_items", status: "failed",
    errorCode: "ERP_COLLECTION_ARCHIVE_PROCESSING_TIMEOUT",
    fileName: "快麦ERP交易订单明细导出20260727051545.xlsx",
    businessDateStart: "2026-07-26T00:00:09+08:00",
    businessDateEnd: "2026-07-26T23:59:59+08:00"
  }];
  const rows = buildSyncCoverage({
    jobs: [], archives, stores: [], dailyFacts,
    range: { from: "2026-07-26", to: "2026-07-27" }
  });
  const day26 = rows.find(item => item.businessDate === "2026-07-26" && item.caliber === "unified");
  assert.equal(day26.blockedBy?.stage, "ingest");
  assert.equal(day26.recoveryAction, "reingest");
  // 文件名里的 20260727 是导出时间，不是业务日期，不得据此归因到 07-27。
  const day27 = rows.find(item => item.businessDate === "2026-07-27" && item.caliber === "unified");
  assert.equal(day27.blockedBy, null);
  assert.equal(day27.recoveryAction, "recollect");
});
