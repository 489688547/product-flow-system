import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const extensionRoot = new URL("../chrome-extension/company-data-collector/", import.meta.url);

test("MV3 extension uses a stable identity and least-privilege permissions", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", extensionRoot), "utf8"));

  assert.equal(manifest.manifest_version, 3);
  assert.equal(typeof manifest.key, "string");
  assert.ok(manifest.key.length > 100);
  assert.deepEqual(manifest.permissions.sort(), ["alarms", "downloads", "scripting", "storage", "tabs"]);
  assert.deepEqual(manifest.host_permissions.sort(), [
    "http://127.0.0.1:17653/*",
    "https://compass.jinritemai.com/*",
    "https://erp.superboss.cc/*",
    "https://erpb.superboss.cc/*",
    "https://fxg.jinritemai.com/*"
  ]);
  assert.equal(manifest.background.type, "module");
  assert.equal(manifest.background.service_worker, "service-worker.js");

  const forbiddenPermissions = ["cookies", "history", "webRequest", "webRequestBlocking", "debugger", "nativeMessaging"];
  forbiddenPermissions.forEach(permission => assert.equal(manifest.permissions.includes(permission), false));
});

test("extension source never evaluates remote code or accepts remote selectors", async () => {
  const files = [
    "service-worker.js",
    "content-script.js",
    "douyin-content-script.js",
    "providers/registry.js",
    "providers/kuaimai.js",
    "providers/douyin.js",
    "providers/executors/kuaimai.js",
    "providers/executors/douyin.js"
  ];
  const source = (await Promise.all(files.map(file => readFile(new URL(file, extensionRoot), "utf8")))).join("\n");

  assert.doesNotMatch(source, /\beval\s*\(/);
  assert.doesNotMatch(source, /new\s+Function\s*\(/);
  assert.doesNotMatch(source, /task\.(selector|url|script)\b/);
  assert.doesNotMatch(source, /chrome\.cookies/);
});

test("Kuaimai async exports are completed through the bundled download center adapter", async () => {
  const contentScript = await readFile(new URL("content-script.js", extensionRoot), "utf8");
  const executor = await readFile(new URL("providers/executors/kuaimai.js", extensionRoot), "utf8");
  const adapter = await readFile(new URL("providers/kuaimai.js", extensionRoot), "utf8");
  const serviceWorker = await readFile(new URL("service-worker.js", extensionRoot), "utf8");

  assert.match(adapter, /KUAIMAI_DOWNLOAD_CENTER_ROUTE/);
  assert.match(adapter, /selectKuaimaiDownloadRow/);
  assert.match(executor, /download_from_center/);
  assert.match(executor, /confirm_product_fields/);
  assert.match(executor, /confirm_product_export/);
  assert.match(executor, /waitForKuaimaiOrderPage/);
  assert.match(executor, /KUAIMAI_DOWNLOAD_CENTER_TIMEOUT/);
  assert.match(contentScript, /COLLECTOR_CONTENT_SCRIPT_PROBE/);
  assert.match(executor, /assertAppliedKuaimaiRange/);

  // 时间范围必须「等到生效」而不是「立刻判定」。补数任务连着跑会复用同一个标签页、
  // 只换 hash，控件先在、值后到；立刻断言就读到上一天的筛选，于是每次补历史日期
  // 都报 KUAIMAI_TIME_RANGE_NOT_APPLIED，只有当天第一次才通过。
  assert.match(executor, /async function waitForAppliedKuaimaiRange/);
  assert.match(executor, /await waitForAppliedKuaimaiRange\(selectors, context, context\.searchHash/);
  // 等不到就重放一次 hash 导航：实测程序化写输入框不会更新 Vue 模型，
  // 点查询提交的仍是旧筛选，导航是唯一可靠的施加手段。
  assert.match(executor, /window\.location\.hash = searchHash/);
  assert.match(executor, /KUAIMAI_TIME_RANGE_REPLAY_AFTER_MS/);
  // 两个范围断言都是异步的，漏掉 await 会让断言被丢弃、失败也不抛，比不校验更危险。
  const salesAssertCalls = [...executor.matchAll(/(await\s+|function\s+)?assertAppliedKuaimaiSalesRange\(/g)];
  assert.ok(salesAssertCalls.length >= 3, "至少有一处声明和两处调用");
  for (const match of salesAssertCalls) {
    assert.ok(match[1], `assertAppliedKuaimaiSalesRange 必须被 await 或是声明本身：${match[0]}`);
  }
  assert.match(executor, /openKuaimaiExportDialog/);
  assert.match(serviceWorker, /downloadFilePrefixes/);
  assert.match(serviceWorker, /registeredTaskUrl/);
  assert.match(serviceWorker, /probeContentScript/);
  assert.match(serviceWorker, /COLLECTOR_CONTENT_SCRIPT_PROBE/);
  assert.match(serviceWorker, /chrome\.tabs\.reload\(tab\.id\)/);
  assert.match(serviceWorker, /registeredDirectDownload/);
  assert.match(serviceWorker, /chrome\.downloads\.download/);
  assert.match(serviceWorker, /ensurePollAlarm/);
  assert.doesNotMatch(`${contentScript}\n${executor}`, /task\.(downloadCenter|selector|route|url)/);
});

test("Douyin content execution supports safe capture and official downloads only", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", extensionRoot), "utf8"));
  const contentScript = await readFile(new URL("douyin-content-script.js", extensionRoot), "utf8");
  const adapter = await readFile(new URL("providers/douyin.js", extensionRoot), "utf8");
  const executor = await readFile(new URL("providers/executors/douyin.js", extensionRoot), "utf8");
  const serviceWorker = await readFile(new URL("service-worker.js", extensionRoot), "utf8");

  const douyinScript = manifest.content_scripts.find(entry =>
    entry.js.includes("douyin-content-script.js")
  );
  assert.deepEqual(douyinScript.matches.sort(), [
    "https://compass.jinritemai.com/*",
    "https://fxg.jinritemai.com/*"
  ]);
  assert.match(contentScript, /executeDouyinTask/);
  assert.match(executor, /download_official_report|clickOfficialReport/);
  assert.match(executor, /captureStoreOverview/);
  assert.match(executor, /DOUYIN_HUMAN_VERIFICATION_REQUIRED|classifyDouyinPage/);
  assert.match(executor, /近1天/);
  assert.match(executor, /userName/);
  assert.match(executor, /data-card-wrapper/);
  assert.match(executor, /短视频明细/);
  assert.match(adapter, /route:\s*"\/shop\/merchandise-traffic"/);
  assert.match(adapter, /route:\s*"\/shop\/live-overview"/);
  assert.match(adapter, /route:\s*"\/shop\/video\/overview"/);
  assert.match(serviceWorker, /result\?\.kind === "captured"/);
  assert.match(serviceWorker, /safeFileName/);
  assert.match(serviceWorker, /DOUYIN_PROFILE_STORE_ID_KEY/);
  assert.match(serviceWorker, /URLSearchParams/);
  assert.match(serviceWorker, /storeId/);
  assert.doesNotMatch(executor, /chrome\.(cookies|debugger|webRequest)/);
  assert.doesNotMatch(executor, /task\.(url|selector|script)/);
});

test("Douyin visible-number parsing only applies the unit attached to the primary value", async () => {
  const {
    isDouyinYesterdayPresetSelected,
    parseDouyinComparisonNumber,
    parseDouyinStoreIdentityText,
    parseVisibleNumber,
    waitForDouyinPageClassification
  } = await import(new URL("providers/executors/douyin.js", extensionRoot));

  assert.equal(parseVisibleNumber("¥63,750.34 较上期 7.35% 同行顶尖 ¥4.35万"), 63_750.34);
  assert.equal(parseVisibleNumber("33.15万 较上期 64.97% 同行标杆 19.22万"), 331_500);
  assert.equal(parseVisibleNumber("-"), null);
  assert.equal(parseDouyinComparisonNumber("¥42,927.91 昨日 ¥58,095.61", "昨日"), 58_095.61);
  assert.equal(parseDouyinComparisonNumber("2,148 昨日 2,763", "昨日"), 2_763);
  assert.equal(parseDouyinComparisonNumber("¥42,927.91 较上期 8.87%", "昨日"), null);
  assert.deepEqual(
    parseDouyinStoreIdentityText(
      "店铺管理\nTIYES提野星宠物用品旗舰店\n正常营业\n2023年03月15日开店\n店铺ID: 90862283"
    ),
    {
      providerId: "douyin-ecommerce",
      storeId: "90862283",
      storeName: "TIYES提野星宠物用品旗舰店"
    }
  );
  assert.equal(parseDouyinStoreIdentityText("抖店首页\n尚未进入店铺管理"), null);
  assert.equal(isDouyinYesterdayPresetSelected({ label: "近1天", selected: true }), true);
  assert.equal(isDouyinYesterdayPresetSelected({ label: "昨日", selected: true }), true);
  assert.equal(isDouyinYesterdayPresetSelected({ label: "实时", selected: true }), false);
  assert.equal(isDouyinYesterdayPresetSelected({ label: "近1天", selected: false }), false);

  const states = [
    { state: "schema_changed", errorCode: "DOUYIN_PAGE_SCHEMA_CHANGED" },
    { state: "ready" }
  ];
  let waits = 0;
  assert.deepEqual(await waitForDouyinPageClassification({
    read: () => states.shift(),
    waitImpl: async () => { waits += 1; },
    timeoutMs: 100
  }), { state: "ready" });
  assert.equal(waits, 1);
});

test("extension task contract only allows registered provider resources", async () => {
  const { assertRegisteredTask, registeredResource, registeredTaskUrl } = await import(new URL("providers/registry.js", extensionRoot));

  assert.equal(registeredResource("kuaimai", "orders").providerId, "kuaimai");
  assert.equal(registeredResource("kuaimai", "order_items").resourceType, "order_items");
  assert.equal(registeredResource("douyin-ecommerce", "store_daily").providerId, "douyin-ecommerce");
  assert.equal(registeredResource("douyin-ecommerce", "video_daily").resourceType, "video_daily");
  assert.match(
    registeredTaskUrl({
      jobId: "job-1",
      providerId: "kuaimai",
      resourceType: "orders",
      businessDate: "2026-07-21"
    }),
    /startTime=1784563200000&endTime=1784649599000/
  );
  assert.throws(
    () => assertRegisteredTask({ jobId: "job-1", providerId: "unknown", resourceType: "orders", businessDate: "2026-07-21" }),
    error => error?.code === "EXTENSION_TASK_NOT_REGISTERED"
  );
  assert.throws(
    () => assertRegisteredTask({
      jobId: "douyin-job-1",
      providerId: "douyin-ecommerce",
      resourceType: "store_daily",
      businessDate: "2026-07-23"
    }),
    error => error?.code === "EXTENSION_TASK_INVALID"
  );
  assert.throws(
    () => assertRegisteredTask({ jobId: "job-1", providerId: "kuaimai", resourceType: "orders", businessDate: "2026-07-21", url: "https://evil.example" }),
    error => error?.code === "EXTENSION_TASK_UNSAFE_FIELDS"
  );
  assert.equal(
    assertRegisteredTask({
      jobId: "job-1",
      providerId: "kuaimai",
      storeId: "store-a",
      resourceType: "orders",
      businessDate: "2026-07-21"
    }).storeId,
    "store-a"
  );
  assert.throws(
    () => assertRegisteredTask({
      jobId: "job-1",
      providerId: "kuaimai",
      storeId: "../unsafe",
      resourceType: "orders",
      businessDate: "2026-07-21"
    }),
    error => error?.code === "EXTENSION_TASK_INVALID"
  );
});

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function createChromeMock({
  tabs = [],
  downloads = [],
  storage = {},
  contentScriptAvailable = true,
  scriptInjectionError = null
} = {}) {
  const store = new Map(Object.entries(storage));
  const tabList = tabs.map(tab => ({ status: "complete", ...tab }));
  const createdTabs = [];
  const updatedTabs = [];
  const executedScripts = [];
  let nextTabId = 1000;
  const downloadCreatedListeners = [];
  const downloadChangedListeners = [];
  const chrome = {
    storage: {
      local: {
        async get(keys) {
          const list = typeof keys === "string" ? [keys] : [...keys];
          return Object.fromEntries(list.map(key => [key, store.get(key)]));
        },
        async set(values) {
          for (const [key, value] of Object.entries(values)) store.set(key, value);
        },
        async remove(key) {
          store.delete(key);
        }
      }
    },
    tabs: {
      async get(id) {
        const tab = tabList.find(candidate => candidate.id === id);
        if (!tab) throw new Error(`No tab with id: ${id}`);
        return tab;
      },
      async query() {
        throw new Error("采集器不得再扫描或复用员工正在使用的标签页。");
      },
      async create(props) {
        const tab = { id: ++nextTabId, status: "complete", ...props };
        tabList.push(tab);
        createdTabs.push(tab);
        return tab;
      },
      async update(id, props) {
        const tab = tabList.find(candidate => candidate.id === id);
        if (!tab) throw new Error(`No tab with id: ${id}`);
        Object.assign(tab, props);
        updatedTabs.push({ id, props });
        return tab;
      },
      async reload() {},
      async sendMessage() {
        if (!contentScriptAvailable) throw new Error("Receiving end does not exist.");
        return { ok: true };
      },
      onUpdated: { addListener() {}, removeListener() {} }
    },
    scripting: {
      async executeScript(details) {
        executedScripts.push(details);
        if (scriptInjectionError) throw scriptInjectionError;
        contentScriptAvailable = true;
        return [];
      }
    },
    downloads: {
      async search(query = {}) {
        let items = [...downloads];
        if (query.id != null) items = items.filter(item => item.id === query.id);
        if (query.startedAfter) {
          const after = Date.parse(query.startedAfter);
          items = items.filter(item => Date.parse(String(item.startTime || "")) >= after);
        }
        if (query.limit) items = items.slice(0, query.limit);
        return items;
      },
      async download() {
        return 1;
      },
      onCreated: {
        addListener(fn) { downloadCreatedListeners.push(fn); },
        removeListener(fn) {
          const index = downloadCreatedListeners.indexOf(fn);
          if (index >= 0) downloadCreatedListeners.splice(index, 1);
        }
      },
      onChanged: {
        addListener(fn) { downloadChangedListeners.push(fn); },
        removeListener(fn) {
          const index = downloadChangedListeners.indexOf(fn);
          if (index >= 0) downloadChangedListeners.splice(index, 1);
        }
      }
    },
    alarms: {
      async get() { return { periodInMinutes: 1 }; },
      async create() {},
      onAlarm: { addListener() {} }
    },
    runtime: {
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
      onMessage: { addListener() {} },
      async getPlatformInfo() { return { os: "mac", arch: "arm64" }; },
      getURL: path => path
    }
  };
  return { chrome, store, tabList, createdTabs, updatedTabs, executedScripts, downloadCreatedListeners };
}

async function importServiceWorker(mock) {
  globalThis.chrome = mock.chrome;
  return import(new URL("service-worker.js", extensionRoot));
}

async function kuaimaiResource(resourceType = "orders") {
  const { registeredResource } = await import(new URL("providers/registry.js", extensionRoot));
  return registeredResource("kuaimai", resourceType);
}

test("service worker only reuses its own registered collector tab, never employee tabs", async () => {
  const employeeTab = { id: 1, url: "https://erpb.superboss.cc/index.html#/trade/searchlist/" };
  const collectorTab = { id: 2, url: "https://erpb.superboss.cc/index.html#/report/sale_multidimension_next/" };
  const mock = createChromeMock({ tabs: [employeeTab, collectorTab], storage: { collectorTabId: 2 } });
  const sw = await importServiceWorker(mock);
  const resource = await kuaimaiResource();
  const targetUrl = "https://erpb.superboss.cc/index.html#/trade/searchlist/?pageNo=1";

  const tab = await sw.ensureProviderTab(resource, targetUrl);

  assert.equal(tab.id, 2);
  assert.deepEqual(mock.updatedTabs.map(item => item.id), [2]);
  assert.equal(mock.createdTabs.length, 0);
  assert.equal(employeeTab.url, "https://erpb.superboss.cc/index.html#/trade/searchlist/");
});

test("service worker rebuilds the collector tab in the background when it was closed", async () => {
  const employeeTab = { id: 1, url: "https://erpb.superboss.cc/index.html#/trade/searchlist/" };
  const mock = createChromeMock({ tabs: [employeeTab], storage: { collectorTabId: 99 } });
  const sw = await importServiceWorker(mock);
  const resource = await kuaimaiResource();
  const targetUrl = "https://erpb.superboss.cc/index.html#/trade/searchlist/?pageNo=1";

  const tab = await sw.ensureProviderTab(resource, targetUrl);

  assert.equal(mock.createdTabs.length, 1);
  assert.equal(mock.createdTabs[0].active, false);
  assert.equal(mock.createdTabs[0].url, targetUrl);
  assert.equal(tab.id, mock.createdTabs[0].id);
  assert.equal(mock.store.get("collectorTabId"), mock.createdTabs[0].id);
});

test("service worker always opens a new background tab instead of hijacking employee tabs", async () => {
  const employeeTab = { id: 1, url: "https://erpb.superboss.cc/index.html#/trade/searchlist/" };
  const mock = createChromeMock({ tabs: [employeeTab] });
  const sw = await importServiceWorker(mock);
  const resource = await kuaimaiResource();

  const tab = await sw.ensureProviderTab(resource, "https://erpb.superboss.cc/index.html#/trade/searchlist/?pageNo=1");

  assert.equal(mock.createdTabs.length, 1);
  assert.equal(mock.createdTabs[0].active, false);
  assert.equal(tab.id, mock.createdTabs[0].id);
  assert.equal(mock.store.get("collectorTabId"), tab.id);
});

test("service worker self-recovers when Chrome misses automatic content-script injection", async () => {
  const collectorTab = { id: 2, url: "https://erpb.superboss.cc/index.html#/trade/searchlist/" };
  const mock = createChromeMock({
    tabs: [collectorTab],
    storage: { collectorTabId: 2 },
    contentScriptAvailable: false
  });
  const sw = await importServiceWorker(mock);
  const resource = await kuaimaiResource();

  const tab = await sw.ensureProviderTab(
    resource,
    "https://erpb.superboss.cc/index.html#/trade/searchlist/"
  );

  assert.equal(tab.id, 2);
  assert.deepEqual(mock.executedScripts, [{
    target: { tabId: 2 },
    files: ["content-script.js"]
  }]);
});

test("keep-alive timer pings a harmless chrome API and stops cleanly after the task", async () => {
  const mock = createChromeMock();
  const sw = await importServiceWorker(mock);
  let pings = 0;
  const stop = sw.startKeepAlive({ intervalMs: 5, ping: () => { pings += 1; } });

  await sleep(30);
  stop();
  const stoppedAt = pings;
  assert.ok(stoppedAt >= 1);
  await sleep(20);
  assert.equal(pings, stoppedAt);
});

test("recent download matching picks the earliest export after the export click and ignores manual downloads", async () => {
  const exportStartedAt = Date.parse("2026-07-23T07:07:25.000Z");
  const downloads = [
    { id: 1, filename: "快麦ERP交易订单导出20260723150800_ab12Cd.xlsx", startTime: "2026-07-23T07:08:00.000Z" },
    { id: 2, filename: "快麦ERP交易订单导出20260723150740_3tS1kT.xlsx", startTime: "2026-07-23T07:07:40.000Z" },
    { id: 3, filename: "快麦ERP交易订单导出20260723150000_W4k3pA.xlsx", startTime: "2026-07-23T07:00:00.000Z" },
    { id: 4, filename: "员工手动报表.xlsx", startTime: "2026-07-23T07:07:30.000Z" }
  ];
  const mock = createChromeMock({ downloads });
  const sw = await importServiceWorker(mock);
  const resource = await kuaimaiResource();

  const found = await sw.findRecentDownload(resource, exportStartedAt);

  assert.equal(found.id, 2);
});

test("download listener ignores files created before the export click and accepts the first matching export", async () => {
  const exportStartedAt = Date.parse("2026-07-23T07:07:25.000Z");
  const tab = { id: 1, url: "https://erpb.superboss.cc/index.html#/index/download_center/" };
  const mock = createChromeMock({ tabs: [tab] });
  const sw = await importServiceWorker(mock);
  const resource = await kuaimaiResource();

  const pending = sw.waitForDownload(resource, tab.id, exportStartedAt, {
    directWindowMs: 20,
    createTimeoutMs: 2000,
    completeTimeoutMs: 2000
  });
  while (!mock.downloadCreatedListeners.length) await sleep(5);
  const fire = item => [...mock.downloadCreatedListeners].forEach(listener => listener(item));
  // 员工此前手动下载的同名前缀文件：早于本次导出，忽略。
  fire({ id: 41, filename: "快麦ERP交易订单导出20260723150000_W4k3pA.xlsx", startTime: "2026-07-23T07:00:00.000Z", state: "complete" });
  // 导出之后但文件名不匹配登记前缀：忽略。
  fire({ id: 42, filename: "员工手动报表.xlsx", startTime: "2026-07-23T07:07:40.000Z", state: "complete" });
  // 本次导出生成的文件：接受。
  fire({ id: 43, filename: "快麦ERP交易订单导出20260723150745_3tS1kT.xlsx", startTime: "2026-07-23T07:07:45.000Z", state: "complete" });

  const download = await pending;
  assert.equal(download.id, 43);
  assert.equal(mock.downloadCreatedListeners.length, 0);
});

test("service worker hardens tab ownership, keep-alive and download matching", async () => {
  const serviceWorker = await readFile(new URL("service-worker.js", extensionRoot), "utf8");
  const executor = await readFile(new URL("providers/executors/kuaimai.js", extensionRoot), "utf8");

  // 专用标签页登记在 storage，绝不扫描或导航员工标签页；
  // 抖音店铺发现只允许查询抖音域名标签页，不得触碰快麦员工标签页。
  assert.match(serviceWorker, /collectorTabId/);
  assert.match(serviceWorker, /chrome\.tabs\.create\(\{ url: targetUrl, active: false \}\)/);
  assert.doesNotMatch(serviceWorker, /chrome\.tabs\.query\([^)]*superboss/);
  // 长任务保活定时器，任务结束后清除。
  assert.match(serviceWorker, /startKeepAlive/);
  assert.match(serviceWorker, /chrome\.runtime\.getPlatformInfo/);
  assert.match(serviceWorker, /stopKeepAlive\(\)/);
  // 页面就绪超时放宽：标签页加载 30s、内容脚本重试 10s。
  assert.match(serviceWorker, /TAB_LOAD_TIMEOUT_MS = 30000/);
  assert.match(serviceWorker, /CONTENT_SCRIPT_PROBE_TIMEOUT_MS = 10000/);
  // 下载匹配锚定内容脚本（执行器）回传的导出点击时间。
  assert.match(serviceWorker, /exportStartedAt/);
  assert.match(executor, /exportStartedAt: context\.exportStartedAt \|\| null/);
});

test("popup shows the business date and stage without inventing a queue total", async () => {
  const popup = await readFile(new URL("../chrome-extension/company-data-collector/popup.js", import.meta.url), "utf8");
  // 采集中必须能看出在采哪一天、到哪一步，否则用户只知道「在采集」。
  assert.match(popup, /activeJob\.businessDate/);
  assert.match(popup, /stageLabel\(/);
  assert.match(popup, /正在下载报表/);
  // stage 落后于 status 时以 status 为准，与网页端同口径。
  assert.match(popup, /stage === "queued" && status && status !== "queued"/);
  // 扩展一次只领一个任务，不知道服务端队列里还有多少，显示队列总数会误导。
  assert.doesNotMatch(popup, /queueRemaining|队列还剩|队列中 /);
});
