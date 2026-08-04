import assert from "node:assert/strict";
import { mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  classifyDouyinEgoSnapshot,
  parseDouyinStoreIdentityText,
  validateDouyinEgoTask
} from "../scripts/web-data-collector/browser/providers/douyinEgoState.mjs";
import {
  collectDouyinResourceWithEgo,
  configureEgoDownload,
  egoTaskSpaceName,
  executeDouyinEgoTask,
  waitForStableEgoDownload
} from "../scripts/web-data-collector/browser/providers/douyinEgoTask.mjs";
import { runEgoProbe } from "../scripts/web-data-collector/ego-probe.mjs";
import { buildEgoProbeTask } from "../scripts/web-data-collector/index.mjs";

const task = Object.freeze({
  jobId: "job-ego-1",
  providerId: "douyin-ecommerce",
  storeId: "90862283",
  storeName: "TIYES提野星宠物用品旗舰店",
  resourceType: "video_daily",
  businessDate: "2026-08-03",
  status: "opening",
  attempt: 1,
  scheduleVersion: "v1",
  workspace: "/var/tmp/product-flow/job-ego-1"
});

function context(overrides = {}) {
  return {
    elapsedMs: 1_000,
    loadTimeoutMs: 45_000,
    expectedStoreId: "90862283",
    actualStoreId: "90862283",
    identityVerified: true,
    ...overrides
  };
}

const stablePage = Object.freeze({
  origin: "https://compass.jinritemai.com",
  path: "/shop/video/overview",
  title: "短视频分析-抖音电商罗盘",
  body: "短视频明细 下载明细",
  readyState: "complete",
  networkIdle: true,
  hasPassword: false,
  hasRegisteredResourceSentinels: true
});

test("Ego Douyin task accepts only registered local execution fields", () => {
  assert.deepEqual(validateDouyinEgoTask(task), task);
  for (const unsafe of [
    { ...task, url: "https://evil.example" },
    { ...task, selector: "body" },
    { ...task, script: "document.cookie" },
    { ...task, explicitHumanRetry: true },
    { ...task, resourceType: "orders" },
    { ...task, workspace: "relative/downloads" }
  ]) {
    assert.throws(
      () => validateDouyinEgoTask(unsafe),
      error => /^DOUYIN_EGO_TASK_/.test(String(error?.code || ""))
    );
  }
});

test("Ego Douyin store identity parser requires one labelled stable store ID", () => {
  assert.deepEqual(parseDouyinStoreIdentityText(`主体信息
店铺名称：TIYES提野星宠物用品旗舰店
店铺 ID：90862283
经营类目：宠物用品`), {
    providerId: "douyin-ecommerce",
    storeId: "90862283",
    storeName: "TIYES提野星宠物用品旗舰店"
  });
  assert.deepEqual(parseDouyinStoreIdentityText(`店铺名称
TIYES提野星宠物用品旗舰店
商家编号
90862283`), {
    providerId: "douyin-ecommerce",
    storeId: "90862283",
    storeName: "TIYES提野星宠物用品旗舰店"
  });
  assert.equal(parseDouyinStoreIdentityText("店铺名称：旗舰店\n账号 ID：90862283"), null);
  assert.equal(parseDouyinStoreIdentityText("店铺 ID：90862283\n店铺编号：99887766"), null);
});

test("empty report shell followed by login is not a schema change", () => {
  assert.deepEqual(classifyDouyinEgoSnapshot({
    ...stablePage,
    body: "帮助 获取菜单失败",
    readyState: "interactive",
    networkIdle: false,
    hasRegisteredResourceSentinels: false
  }, context({ elapsedMs: 12_000 })), { state: "loading" });

  assert.deepEqual(classifyDouyinEgoSnapshot({
    ...stablePage,
    path: "/login",
    title: "抖店登录",
    body: "手机号登录",
    hasPassword: true,
    hasRegisteredResourceSentinels: false
  }, context({ elapsedMs: 15_000 })), {
    state: "login_required",
    errorCode: "DOUYIN_LOGIN_REQUIRED"
  });
});

test("Ego Douyin state classification separates every terminal cause", () => {
  const cases = [
    [
      { ...stablePage, body: "请拖动滑块完成安全验证", hasRegisteredResourceSentinels: false },
      context(),
      { state: "human_verification", errorCode: "DOUYIN_HUMAN_VERIFICATION_REQUIRED" }
    ],
    [
      { ...stablePage, origin: "https://evil.example" },
      context(),
      { state: "unexpected_navigation", errorCode: "DOUYIN_NAVIGATION_UNEXPECTED" }
    ],
    [
      stablePage,
      context({ actualStoreId: "99887766", identityVerified: false }),
      { state: "store_mismatch", errorCode: "DOUYIN_STORE_MISMATCH", actualStoreId: "99887766" }
    ],
    [
      stablePage,
      context({ actualStoreId: "", identityVerified: false }),
      { state: "store_identity_unavailable", errorCode: "DOUYIN_STORE_IDENTITY_UNAVAILABLE" }
    ],
    [
      { ...stablePage, body: "", readyState: "loading", networkIdle: false, hasRegisteredResourceSentinels: false },
      context({ elapsedMs: 45_000 }),
      { state: "load_timeout", errorCode: "DOUYIN_PAGE_LOAD_TIMEOUT" }
    ],
    [
      { ...stablePage, hasRegisteredResourceSentinels: false },
      context(),
      { state: "schema_changed", errorCode: "DOUYIN_PAGE_SCHEMA_CHANGED" }
    ],
    [
      stablePage,
      context(),
      { state: "ready", storeId: "90862283" }
    ]
  ];

  for (const [snapshot, classificationContext, expected] of cases) {
    assert.deepEqual(classifyDouyinEgoSnapshot(snapshot, classificationContext), expected);
  }
});

function egoHelpers({
  ownership = "agent",
  identityStoreId = "90862283",
  identitySnapshot = null,
  identitySnapshots = null,
  identityTabUrl = "https://fxg.jinritemai.com/ffa/mshop/homepage/index",
  resourceSnapshot = null
} = {}) {
  const calls = [];
  let currentUrl = "";
  let identityRead = 0;
  const name = "EC 抖音 90862283";
  return {
    calls,
    async listTaskSpaces() {
      calls.push(["listTaskSpaces"]);
      return [{ id: 41, name, ownership }];
    },
    async useOrCreateTaskSpace(value) {
      calls.push(["useOrCreateTaskSpace", value]);
      return { id: 41, name, ownership: "agent" };
    },
    async claimTaskSpace(id) {
      calls.push(["claimTaskSpace", id]);
      return { id, name, ownership: "agent" };
    },
    async takeOverTaskSpace(id) {
      calls.push(["takeOverTaskSpace", id]);
      return { id, name, ownership: "agent" };
    },
    async handOffTaskSpace(id) {
      calls.push(["handOffTaskSpace", id]);
      return { done: true };
    },
    async listTabs() {
      calls.push(["listTabs"]);
      return [{ targetId: "tab-identity", url: identityTabUrl }];
    },
    async switchTab(targetId) {
      calls.push(["switchTab", targetId]);
      if (targetId === "tab-identity") currentUrl = identityTabUrl;
    },
    async openOrReuseTab(url) {
      currentUrl = url;
      calls.push(["openOrReuseTab", url]);
      return { targetId: url.includes("/ffa/mshop/homepage/index") ? "tab-identity" : "tab-resource", url };
    },
    async pageInfo() {
      const parsed = new URL(currentUrl);
      return { url: currentUrl, title: parsed.hostname };
    },
    async js() {
      if (currentUrl.includes("/ffa/mshop/homepage/index")) {
        if (Array.isArray(identitySnapshots)) {
          const snapshot = identitySnapshots[Math.min(identityRead, identitySnapshots.length - 1)];
          identityRead += 1;
          return snapshot;
        }
        if (identitySnapshot) return identitySnapshot;
        return `店铺名称：TIYES提野星宠物用品旗舰店\n店铺 ID：${identityStoreId}`;
      }
      if (resourceSnapshot) return resourceSnapshot;
      return {
        origin: "https://compass.jinritemai.com",
        path: "/shop/video/overview",
        title: "短视频分析-抖音电商罗盘",
        body: "短视频明细 下载明细",
        readyState: "complete",
        networkIdle: true,
        hasPassword: false,
        hasRegisteredResourceSentinels: true
      };
    },
    async wait() {},
    async completeTaskSpace() {},
    async gotoAndWait() {},
    async cdp() {}
  };
}

test("hidden homepage shop information verifies one labelled store ID", async () => {
  const helpers = egoHelpers({
    identitySnapshot: {
      visibleText: "TIYES提野星宠物用品旗舰店 店铺管理 商家体验分",
      labelledStoreIds: ["90862283"]
    }
  });
  const result = await executeDouyinEgoTask({
    task,
    control: { explicitHumanRetry: false }
  }, helpers, {
    collect: async input => ({
      kind: "download_capability_check",
      jobId: input.task.jobId,
      safeSummary: "identity-ok"
    })
  });

  assert.equal(result.kind, "download_capability_check");
  assert.equal(helpers.calls.some(([name, targetId]) => name === "switchTab" && targetId === "tab-identity"), true);
  assert.equal(
    helpers.calls.some(([name, url]) => name === "openOrReuseTab" && String(url).startsWith("https://fxg.jinritemai.com")),
    false
  );
});

test("delayed homepage shop information is awaited before identity is rejected", async () => {
  const helpers = egoHelpers({
    identitySnapshots: [
      { visibleText: "首页加载中", labelledStoreIds: [] },
      {
        visibleText: "TIYES提野星宠物用品旗舰店 店铺管理 商家体验分",
        labelledStoreIds: ["90862283"]
      }
    ]
  });
  const result = await executeDouyinEgoTask({
    task,
    control: { explicitHumanRetry: false }
  }, helpers, {
    collect: async input => ({
      kind: "download_capability_check",
      jobId: input.task.jobId,
      safeSummary: "identity-ready"
    })
  });

  assert.equal(result.kind, "download_capability_check");
});

test("missing homepage identity remains a technical failure without handing control to the user", async () => {
  const helpers = egoHelpers({
    identitySnapshots: [{ visibleText: "首页 店铺管理 商家体验分", labelledStoreIds: [] }]
  });
  const result = await executeDouyinEgoTask({
    task,
    control: { explicitHumanRetry: false }
  }, helpers);

  assert.equal(result.kind, "failed");
  assert.equal(result.errorCode, "DOUYIN_STORE_IDENTITY_UNAVAILABLE");
  assert.equal(helpers.calls.some(([name]) => name === "handOffTaskSpace"), false);
});

test("query-bearing existing homepage is reused instead of opening a duplicate identity tab", async () => {
  const helpers = egoHelpers({
    identityTabUrl: "https://fxg.jinritemai.com/ffa/mshop/homepage/index?btm_show_id=existing",
    identitySnapshot: {
      visibleText: "TIYES提野星宠物用品旗舰店 店铺管理 商家体验分",
      labelledStoreIds: ["90862283"]
    }
  });
  const result = await executeDouyinEgoTask({
    task,
    control: { explicitHumanRetry: false }
  }, helpers, {
    collect: async input => ({
      kind: "download_capability_check",
      jobId: input.task.jobId,
      safeSummary: "identity-tab-reused"
    })
  });

  assert.equal(result.kind, "download_capability_check");
  assert.deepEqual(
    helpers.calls.filter(([name, url]) => name === "openOrReuseTab" && String(url).startsWith("https://fxg.jinritemai.com")),
    []
  );
});

test("current video overview is ready without the removed date label", async () => {
  const helpers = egoHelpers({
    resourceSnapshot: {
      origin: "https://compass.jinritemai.com",
      path: "/shop/video/overview",
      title: "视频概览",
      body: "短视频 本店数据 视频概览 视频销量榜 下载明细 短视频明细",
      readyState: "complete",
      networkIdle: true,
      hasPassword: false
    }
  });
  const result = await executeDouyinEgoTask({
    task,
    control: { explicitHumanRetry: false }
  }, helpers, {
    collect: async input => ({
      kind: "download_capability_check",
      jobId: input.task.jobId,
      safeSummary: "current-video-overview-ready"
    })
  });

  assert.equal(result.kind, "download_capability_check");
});

test("Ego task space binding is deterministic for one registered store", () => {
  assert.equal(egoTaskSpaceName({
    providerId: "douyin-ecommerce",
    storeId: "90862283"
  }), "EC 抖音 90862283");
});

test("automatic polling never claims a user-controlled Ego task space", async () => {
  const helpers = egoHelpers({ ownership: "user" });
  const result = await executeDouyinEgoTask({
    task,
    control: { explicitHumanRetry: false }
  }, helpers);

  assert.equal(result.kind, "waiting_human");
  assert.equal(result.errorCode, "EGO_TASK_SPACE_USER_CONTROLLED");
  assert.equal(helpers.calls.some(([name]) => name === "claimTaskSpace"), false);
  assert.equal(helpers.calls.some(([name]) => name === "openOrReuseTab"), false);
});

test("manual same-job retry takes over the store space and selects its exact tab", async () => {
  const helpers = egoHelpers({ ownership: "user" });
  const result = await executeDouyinEgoTask({
    task,
    control: { explicitHumanRetry: true }
  }, helpers, {
    collect: async input => ({
      kind: "download_capability_check",
      jobId: input.task.jobId,
      safeSummary: "ready-only"
    })
  });

  assert.equal(result.kind, "download_capability_check");
  assert.deepEqual(helpers.calls.slice(0, 4), [
    ["listTaskSpaces"],
    ["takeOverTaskSpace", 41],
    ["listTabs"],
    ["switchTab", "tab-identity"]
  ]);
  assert.equal(helpers.calls.some(([name]) => name === "handOffTaskSpace"), false);
});

test("wrong stable store identity hands off without opening a resource page", async () => {
  const helpers = egoHelpers({ identityStoreId: "99887766" });
  const result = await executeDouyinEgoTask({
    task,
    control: { explicitHumanRetry: false }
  }, helpers);

  assert.equal(result.kind, "waiting_human");
  assert.equal(result.errorCode, "DOUYIN_STORE_MISMATCH");
  assert.deepEqual(
    helpers.calls.filter(([name]) => name === "openOrReuseTab").map(([, url]) => url),
    []
  );
  assert.equal(helpers.calls.some(([name, targetId]) => name === "switchTab" && targetId === "tab-identity"), true);
  assert.equal(helpers.calls.some(([name]) => name === "handOffTaskSpace"), true);
});

test("Ego controlled download configures the task workspace before export", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "ego-download-"));
  const calls = [];
  await configureEgoDownload({
    workspace,
    cdp: async (method, params) => calls.push([method, params])
  });

  assert.deepEqual(calls, [["Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: workspace,
    eventsEnabled: true
  }]]);
});

test("Ego controlled download falls back to the page domain on older Chromium", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "ego-download-"));
  const calls = [];
  await configureEgoDownload({
    workspace,
    cdp: async (method, params) => {
      calls.push([method, params]);
      if (method === "Browser.setDownloadBehavior") throw new Error("method not found");
    }
  });

  assert.deepEqual(calls.map(([method]) => method), [
    "Browser.setDownloadBehavior",
    "Page.setDownloadBehavior"
  ]);
});

test("Ego download success requires a new stable file inside the task workspace", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "ego-download-"));
  const startedAt = Date.now();
  const filePath = join(workspace, "采集-video-20260803-20260803.xlsx");
  await writeFile(filePath, "real-export");

  assert.deepEqual(await waitForStableEgoDownload({
    workspace,
    startedAt,
    timeoutMs: 100,
    pollIntervalMs: 1,
    stabilityDelayMs: 1
  }), {
    filePath,
    safeFileName: "采集-video-20260803-20260803.xlsx"
  });
});

test("Ego download discovery rejects pre-existing and partial files", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "ego-download-"));
  const oldFile = join(workspace, "old.xlsx");
  await writeFile(oldFile, "old-export");
  await utimes(oldFile, new Date(0), new Date(0));
  await writeFile(join(workspace, "new.xlsx.crdownload"), "partial");

  await assert.rejects(waitForStableEgoDownload({
    workspace,
    startedAt: Date.now(),
    timeoutMs: 5,
    pollIntervalMs: 1,
    stabilityDelayMs: 1
  }), error => error.code === "EGO_DOWNLOAD_TIMEOUT");
});

test("Ego collection configures download before reusing the mature extract runner", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "ego-download-"));
  const calls = [];
  const helpers = {
    async cdp(method) { calls.push(method); },
    async openOrReuseTab(url) { calls.push(`open:${url}`); },
    async js() { return null; },
    async wait() {}
  };
  const result = await collectDouyinResourceWithEgo({
    task: { ...task, workspace },
    helpers,
    createApi: () => ({ kind: "api" }),
    createRunner: () => ({
      async run() {
        calls.push("extract:run");
        await writeFile(join(workspace, "采集-video-20260803-20260803.xlsx"), "real-export");
        return { downloaded: true };
      }
    }),
    downloadOptions: { timeoutMs: 100, pollIntervalMs: 1, stabilityDelayMs: 1 }
  });

  assert.equal(calls[0], "Browser.setDownloadBehavior");
  assert.equal(calls.includes("extract:run"), true);
  assert.equal(result.kind, "downloaded");
  assert.equal(result.safeFileName, "采集-video-20260803-20260803.xlsx");
});

test("local Ego probe archives and parses one file but stops at pending upload", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "ego-probe-"));
  const filePath = join(workspace, "video.xlsx");
  await writeFile(filePath, "fixture");
  const checkpoints = [];
  let remoteCalls = 0;
  const result = await runEgoProbe({
    task: { ...task, workspace },
    executeTask: async () => ({
      kind: "downloaded",
      jobId: task.jobId,
      filePath,
      safeFileName: "video.xlsx",
      pageType: "shop_compass_self_service",
      reportVersion: "douyin-self-service-v1"
    }),
    checkpointStore: {
      async save(jobId, checkpoint) { checkpoints.push([jobId, checkpoint]); }
    },
    archiveReport: async () => ({
      sha256: "a".repeat(64),
      relativeArchiveKey: "douyin-ecommerce/90862283/video_daily/2026/08/2026-08-03/a.xlsx"
    }),
    parseReport: async () => ({
      reportVersion: "douyin-self-service-v1",
      facts: [{ videoId: "video-1" }],
      coverage: 1,
      confidence: "high"
    }),
    completeRemote: async () => { remoteCalls += 1; }
  });

  assert.equal(result.kind, "pending_upload");
  assert.equal(result.fileHash, "a".repeat(64));
  assert.equal(result.rowCount, 1);
  assert.deepEqual(checkpoints.map(([, checkpoint]) => checkpoint.stage), [
    "downloaded",
    "archived",
    "parsed",
    "pending_upload"
  ]);
  assert.equal(remoteCalls, 0);
});

test("probe-ego CLI builds one local-only registered task", () => {
  assert.deepEqual(buildEgoProbeTask([
    "probe-ego",
    "--store-id", "90862283",
    "--store-name", "TIYES提野星宠物用品旗舰店",
    "--resource", "video_daily",
    "--business-date", "2026-08-03"
  ], { homeDirectory: "/Users/company" }), {
    jobId: "ego-probe-90862283-video_daily-2026-08-03",
    providerId: "douyin-ecommerce",
    storeId: "90862283",
    storeName: "TIYES提野星宠物用品旗舰店",
    resourceType: "video_daily",
    businessDate: "2026-08-03",
    status: "opening",
    attempt: 1,
    scheduleVersion: "ego-probe-v1",
    workspace: "/Users/company/Library/Application Support/Product Flow Collector/Ego Probes/ego-probe-90862283-video_daily-2026-08-03"
  });
});
