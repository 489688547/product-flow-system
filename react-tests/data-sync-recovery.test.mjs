import assert from "node:assert/strict";
import test from "node:test";
import {
  DOUYIN_RECOVERY,
  buildDouyinCollectionRecovery,
  buildKuaimaiSalesRecovery,
  countDataSyncIssues
} from "../src/domain/dataSyncRecovery.js";
import {
  kuaimaiProductCollectionProgress,
  loadWebCollectionStatus,
  registerDouyinStore,
  triggerKuaimaiProductCollection,
  triggerKuaimaiSalesCollection,
  triggerWebCollection,
  webCollectionStatusApiUrl
} from "../src/state/webCollectionApi.js";

const now = new Date("2026-07-23T01:05:00.000Z");
const runner = {
  id: "runner-1",
  name: "公司 Mac",
  status: "active",
  chromeStatus: "ready",
  lastSeenAt: "2026-07-23T01:04:00.000Z"
};

test("web collection status client reads the existing safe control-plane payload", async () => {
  assert.equal(webCollectionStatusApiUrl(), "/api/platform/v1/web-collection/jobs?limit=100");
  const status = await loadWebCollectionStatus(async url => {
    assert.equal(url, webCollectionStatusApiUrl());
    return new Response(JSON.stringify({ data: { runners: [runner], jobs: [], runs: [], cursors: [], notifications: [] } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  });
  assert.equal(status.runners[0].name, "公司 Mac");
  assert.deepEqual(status.jobs, []);
});

test("Douyin store registration posts only the store name and store ID", async () => {
  const calls = [];
  const result = await registerDouyinStore({
    storeName: "TIYES 提野星旗舰店",
    storeId: "90862283"
  }, async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({
      data: {
        store: {
          providerId: "douyin-ecommerce",
          storeName: "TIYES 提野星旗舰店",
          storeId: "90862283"
        }
      }
    }), { status: 200, headers: { "content-type": "application/json" } });
  });

  assert.equal(calls[0].url, "/api/platform/v1/web-collection/jobs");
  assert.equal(calls[0].options.credentials, "include");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    action: "register_store",
    providerId: "douyin-ecommerce",
    storeName: "TIYES 提野星旗舰店",
    storeId: "90862283"
  });
  assert.equal(result.store.storeId, "90862283");
});

test("sales recovery client can auto-enqueue and manually requeue the exact Chrome resource", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({
      data: { created: calls.length === 1 ? 1 : 0, requeued: calls.length === 2, job: { id: "job-1", status: "queued" } }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  await triggerKuaimaiSalesCollection({ date: "2026-07-22" }, fetchImpl);
  await triggerKuaimaiSalesCollection({ date: "2026-07-22", resourceType: "sales_items", force: true }, fetchImpl);
  assert.equal(calls[0].url, "/api/platform/v1/web-collection/jobs");
  assert.equal(calls[0].options.credentials, "include");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    action: "trigger",
    providerId: "kuaimai",
    resourceType: "order_items",
    businessDate: "2026-07-22",
    force: false
  });
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    action: "trigger",
    providerId: "kuaimai",
    resourceType: "sales_items",
    businessDate: "2026-07-22",
    force: true
  });
});

test("generic collection trigger requires a registered provider, store, resource and business date", async () => {
  const calls = [];
  const result = await triggerWebCollection({
    providerId: "douyin-ecommerce",
    storeId: "store-a",
    resourceType: "product_daily",
    businessDate: "2026-07-23",
    force: true
  }, async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ data: { job: { id: "douyin-job-1" } } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  });
  assert.equal(result.job.id, "douyin-job-1");
  assert.equal(calls[0].url, "/api/platform/v1/web-collection/jobs");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    action: "trigger",
    providerId: "douyin-ecommerce",
    storeId: "store-a",
    resourceType: "product_daily",
    businessDate: "2026-07-23",
    force: true
  });
});

test("Douyin recovery exposes four resources and provider-specific human actions", () => {
  const recovery = buildDouyinCollectionRecovery({
    storeId: "store-a",
    runners: [runner],
    jobs: [{
      id: "douyin-job-1",
      providerId: "douyin-ecommerce",
      storeId: "store-a",
      resourceType: "store_daily",
      businessDate: "2026-07-23",
      status: "waiting_human",
      errorCode: "DOUYIN_LOGIN_REQUIRED",
      runnerId: "runner-1"
    }],
    cursors: [{
      providerId: "douyin-ecommerce",
      storeId: "store-a",
      resourceType: "product_daily",
      businessDate: "2026-07-22"
    }],
    now
  });

  assert.deepEqual(recovery.resources.map(item => item.label), [
    "店铺每日",
    "商品每日",
    "直播每日",
    "短视频每日"
  ]);
  assert.equal(recovery.resources[0].status, "waiting_human");
  assert.equal(recovery.resources[1].status, "success");
  assert.equal(recovery.resources[2].status, "unavailable");
  assert.match(recovery.resources[0].instruction, /公司 Mac.*Chrome.*登录抖店/);
  assert.equal(DOUYIN_RECOVERY.DOUYIN_REPORT_SCHEMA_CHANGED.includes("适配"), true);
});

test("a trusted success cursor keeps a stale duplicate opening job from masking the resource", () => {
  const recovery = buildDouyinCollectionRecovery({
    storeId: "store-a",
    runners: [runner],
    jobs: [{
      id: "stale-opening",
      providerId: "douyin-ecommerce",
      storeId: "store-a",
      resourceType: "store_daily",
      businessDate: "2026-07-23",
      status: "opening",
      runnerId: "runner-1",
      updatedAt: "2026-07-24T08:28:00.000Z"
    }],
    cursors: [{
      providerId: "douyin-ecommerce",
      storeId: "store-a",
      resourceType: "store_daily",
      businessDate: "2026-07-23"
    }],
    now
  });
  const storeDaily = recovery.resources.find(item => item.type === "store_daily");
  assert.equal(storeDaily.status, "success");
  assert.equal(storeDaily.businessDate, "2026-07-23");
  assert.equal(storeDaily.canRetry, true);
  // 新业务日的运行中任务仍应显示为采集中，不被旧游标掩盖。
  const newerDay = buildDouyinCollectionRecovery({
    storeId: "store-a",
    runners: [runner],
    jobs: [{ id: "newer", providerId: "douyin-ecommerce", storeId: "store-a", resourceType: "store_daily", businessDate: "2026-07-24", status: "opening", runnerId: "runner-1" }],
    cursors: [{ providerId: "douyin-ecommerce", storeId: "store-a", resourceType: "store_daily", businessDate: "2026-07-23" }],
    now
  });
  assert.equal(newerDay.resources.find(item => item.type === "store_daily").status, "opening");
});

test("superseded jobs are ignored by the douyin recovery view", () => {
  const recovery = buildDouyinCollectionRecovery({
    storeId: "store-a",
    runners: [runner],
    jobs: [{ id: "sup", providerId: "douyin-ecommerce", storeId: "store-a", resourceType: "live_daily", businessDate: "2026-07-23", status: "superseded", runnerId: "runner-1" }],
    cursors: [],
    now
  });
  assert.equal(recovery.resources.find(item => item.type === "live_daily").status, "unavailable");
});

test("product catalog client triggers the complete Chrome snapshot group", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({
      data: {
        jobs: [
          { id: "products", resourceType: "products", status: "queued" },
          { id: "kits", resourceType: "product_kits", status: "queued" },
          { id: "combinations", resourceType: "product_combinations", status: "queued" }
        ]
      }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await triggerKuaimaiProductCollection({ date: "2026-07-24" }, fetchImpl);

  assert.deepEqual(JSON.parse(calls[0].options.body), {
    action: "trigger",
    providerId: "kuaimai",
    resourceType: "products",
    businessDate: "2026-07-24",
    force: false
  });
  assert.deepEqual(result.jobs.map(job => job.id), ["products", "kits", "combinations"]);
});

test("product collection progress completes only when all three jobs succeed", () => {
  const jobIds = ["products", "kits", "combinations"];
  assert.deepEqual(kuaimaiProductCollectionProgress({
    jobs: [
      { id: "products", resourceType: "products", status: "success" },
      { id: "kits", resourceType: "product_kits", status: "ingesting" },
      { id: "combinations", resourceType: "product_combinations", status: "queued" }
    ]
  }, jobIds), {
    status: "running",
    label: "正在写入商品数据",
    completed: 1,
    total: 3,
    jobs: [
      { id: "products", resourceType: "products", status: "success" },
      { id: "kits", resourceType: "product_kits", status: "ingesting" },
      { id: "combinations", resourceType: "product_combinations", status: "queued" }
    ]
  });
  assert.equal(kuaimaiProductCollectionProgress({
    jobs: jobIds.map(id => ({ id, resourceType: id, status: "success" }))
  }, jobIds).status, "success");
  const failed = kuaimaiProductCollectionProgress({
    jobs: [
      { id: "products", resourceType: "products", status: "success" },
      { id: "kits", resourceType: "product_kits", status: "waiting_human", errorCode: "KUAIMAI_LOGIN_REQUIRED" },
      { id: "combinations", resourceType: "product_combinations", status: "queued" }
    ]
  }, jobIds);
  assert.equal(failed.status, "waiting_human");
  assert.match(failed.label, /登录/);
});

test("sales recovery does not report success while the target-day sales facts are still missing", () => {
  const recovery = buildKuaimaiSalesRecovery({
    date: "2026-07-23",
    anomalyStatus: "anomaly",
    runners: [runner],
    jobs: [{
      id: "sales",
      providerId: "kuaimai",
      resourceType: "sales_items",
      businessDate: "2026-07-23",
      status: "success",
      runnerId: "runner-1",
      updatedAt: "2026-07-24T06:53:21.671Z"
    }],
    now: new Date("2026-07-24T07:00:00.000Z")
  });

  assert.equal(recovery.tone, "danger");
  assert.equal(recovery.label, "入库校验未通过");
  assert.match(recovery.title, /已采集.*销售事实尚未生成/);
  assert.deepEqual(recovery.primaryAction, { type: "retrigger", label: "重新采集并入库" });
});

test("data sync issue count includes a live sales anomaly without double counting persisted issues", () => {
  assert.equal(countDataSyncIssues({ openIssues: 0, latestSalesAnomaly: { status: "anomaly" } }), 1);
  assert.equal(countDataSyncIssues({ openIssues: 3, latestSalesAnomaly: { status: "anomaly" } }), 3);
  assert.equal(countDataSyncIssues({ openIssues: 0, latestSalesAnomaly: { status: "healthy" } }), 0);
});

test("sales recovery selects the exact Kuaimai order-item job and reports Chrome progress", () => {
  const recovery = buildKuaimaiSalesRecovery({
    date: "2026-07-22",
    runners: [runner],
    jobs: [
      { id: "orders", providerId: "kuaimai", resourceType: "orders", businessDate: "2026-07-22", status: "success", updatedAt: "2026-07-23T00:50:00.000Z" },
      { id: "items", providerId: "kuaimai", resourceType: "order_items", businessDate: "2026-07-22", status: "downloading", runnerId: "runner-1", attempt: 2, updatedAt: "2026-07-23T01:03:00.000Z" }
    ],
    now
  });
  assert.equal(recovery.job.id, "items");
  assert.equal(recovery.runner.id, "runner-1");
  assert.equal(recovery.label, "Chrome 采集中");
  assert.equal(recovery.tone, "warning");
  assert.deepEqual(recovery.primaryAction, { type: "refresh", label: "刷新采集进度" });
  assert.equal(recovery.showKuaimaiLogin, false);
  assert.match(recovery.instruction, /公司 Mac/);
});

test("sales recovery turns login, schema and offline states into named actions", () => {
  const login = buildKuaimaiSalesRecovery({
    date: "2026-07-22",
    runners: [runner],
    jobs: [{ id: "items", providerId: "kuaimai", resourceType: "order_items", businessDate: "2026-07-22", status: "waiting_human", errorCode: "KUAIMAI_LOGIN_REQUIRED", runnerId: "runner-1" }],
    now
  });
  assert.equal(login.label, "需要登录");
  assert.deepEqual(login.primaryAction, { type: "retrigger", label: "我已登录，重新触发" });
  assert.equal(login.showKuaimaiLogin, true);
  assert.match(login.instruction, /Chrome.*快麦.*登录/);

  const changed = buildKuaimaiSalesRecovery({
    date: "2026-07-22",
    runners: [runner],
    jobs: [{ id: "items", providerId: "kuaimai", resourceType: "order_items", businessDate: "2026-07-22", status: "schema_changed", errorCode: "KUAIMAI_ORDER_PAGE_SCHEMA_CHANGED", runnerId: "runner-1" }],
    now
  });
  assert.equal(changed.label, "页面结构变化");

  const offline = buildKuaimaiSalesRecovery({
    date: "2026-07-22",
    runners: [{ ...runner, lastSeenAt: "2026-07-22T23:00:00.000Z" }],
    jobs: [],
    now
  });
  assert.equal(offline.label, "采集器离线");
  assert.deepEqual(offline.primaryAction, { type: "refresh", label: "重新检测采集器" });
  assert.equal(offline.showConnectorLink, false);
  assert.match(offline.instruction, /公司 Mac.*后台采集服务.*心跳/);
});

test("sales recovery names missing Chrome site access instead of showing a generic failure", () => {
  const recovery = buildKuaimaiSalesRecovery({
    date: "2026-07-24",
    runners: [{ ...runner, chromeStatus: "extension_online" }],
    jobs: [{
      id: "items",
      providerId: "kuaimai",
      resourceType: "order_items",
      businessDate: "2026-07-24",
      status: "failed",
      errorCode: "EXTENSION_SITE_ACCESS_DENIED",
      runnerId: "runner-1"
    }],
    now
  });

  assert.equal(recovery.label, "需要网站访问权限");
  assert.match(recovery.instruction, /快麦.*网站访问权限/);
  assert.deepEqual(recovery.primaryAction, { type: "retrigger", label: "权限已开启，重新触发" });
});

test("queued work does not pretend to be collecting when the company Mac is offline", () => {
  const recovery = buildKuaimaiSalesRecovery({
    date: "2026-07-22",
    runners: [],
    jobs: [{ id: "items", providerId: "kuaimai", resourceType: "order_items", businessDate: "2026-07-22", status: "queued", stage: "queued" }],
    now
  });
  assert.equal(recovery.label, "采集器离线");
  assert.deepEqual(recovery.primaryAction, { type: "refresh", label: "重新检测采集器" });
  assert.equal(recovery.showConnectorLink, false);
  assert.match(recovery.title, /任务已排队/);
  assert.match(recovery.instruction, /后台采集服务.*自动领取任务/);
});

test("queued work reports extension availability separately from the background runner heartbeat", () => {
  const queuedJob = {
    id: "items",
    providerId: "kuaimai",
    resourceType: "order_items",
    businessDate: "2026-07-22",
    status: "queued",
    stage: "queued"
  };
  const extensionOffline = buildKuaimaiSalesRecovery({
    date: "2026-07-22",
    runners: [{ ...runner, chromeStatus: "extension_offline" }],
    jobs: [queuedJob],
    now
  });
  assert.equal(extensionOffline.label, "Chrome 扩展未连接");
  assert.doesNotMatch(extensionOffline.instruction, /正在执行|正在采集/);

  const extensionOnline = buildKuaimaiSalesRecovery({
    date: "2026-07-22",
    runners: [{ ...runner, chromeStatus: "extension_online" }],
    jobs: [queuedJob],
    now
  });
  assert.equal(extensionOnline.label, "等待 Chrome 领取");
  assert.doesNotMatch(extensionOnline.instruction, /正在执行|正在采集/);
});

test("queued Douyin resources wait for Chrome instead of claiming that collection has started", () => {
  const recovery = buildDouyinCollectionRecovery({
    storeId: "store-a",
    runners: [{ ...runner, chromeStatus: "extension_online" }],
    jobs: [{
      id: "store-daily",
      providerId: "douyin-ecommerce",
      storeId: "store-a",
      resourceType: "store_daily",
      businessDate: "2026-07-22",
      status: "queued",
      stage: "queued"
    }],
    now
  });
  assert.equal(recovery.resources[0].status, "queued");
  assert.match(recovery.resources[0].instruction, /等待.*领取/);
  assert.doesNotMatch(recovery.resources[0].instruction, /正在采集/);
});

test("queued Douyin resources recognize the dedicated browser instead of asking for the extension", () => {
  const recovery = buildDouyinCollectionRecovery({
    storeId: "store-a",
    runners: [{ ...runner, chromeStatus: "dedicated_browser_online" }],
    jobs: [{
      id: "store-daily",
      providerId: "douyin-ecommerce",
      storeId: "store-a",
      resourceType: "store_daily",
      businessDate: "2026-07-24",
      status: "queued",
      stage: "queued"
    }],
    now
  });

  assert.equal(recovery.resources[0].status, "queued");
  assert.match(recovery.resources[0].instruction, /专用 Chrome.*领取/);
  assert.doesNotMatch(recovery.resources[0].instruction, /扩展/);
});

test("sales recovery keeps file import available when status cannot be read", () => {
  const recovery = buildKuaimaiSalesRecovery({
    date: "2026-07-22",
    error: "网络错误",
    now
  });
  assert.equal(recovery.label, "采集状态读取失败");
  assert.equal(recovery.canImportFile, true);
});
