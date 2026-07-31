import assert from "node:assert/strict";
import test from "node:test";

async function moduleUnderTest() {
  return import("../scripts/web-data-collector/browser/providers/douyin.mjs").catch(() => ({}));
}

const task = {
  jobId: "job-1",
  providerId: "douyin-ecommerce",
  storeId: "90862283",
  resourceType: "product_daily",
  businessDate: "2026-07-24",
  status: "opening",
  attempt: 1,
  scheduleVersion: "v1"
};

test("dedicated Douyin adapter accepts only registered task fields and resources", async () => {
  const { validateDedicatedDouyinTask } = await moduleUnderTest();
  assert.equal(typeof validateDedicatedDouyinTask, "function", "validateDedicatedDouyinTask must be implemented");

  assert.deepEqual(validateDedicatedDouyinTask(task), task);
  for (const unsafe of [
    { ...task, url: "https://evil.example" },
    { ...task, selector: "body" },
    { ...task, script: "document.cookie" },
    { ...task, resourceType: "orders" },
    { ...task, storeId: "../personal" }
  ]) {
    assert.throws(() => validateDedicatedDouyinTask(unsafe), error => (
      /^DOUYIN_/.test(String(error?.code || ""))
    ));
  }
});

test("专用浏览器只打开登记过的页面：自助取数走固定的取数页", async () => {
  // 保留的性质是「只去登记过的地址」，变的只是去哪个页面：四个日事实资源现在都走
  // 自助取数，落地页因此是固定的取数页，而不是各资源自己的报表页。
  const { createDouyinDedicatedExecutor, SELF_SERVICE_URL, isRegisteredDouyinUrl } = await moduleUnderTest();
  const opened = [];
  const executor = createDouyinDedicatedExecutor({
    createController: async () => ({
      async open(url) { opened.push(url); },
      async inspect() { return { state: "ready", storeId: "90862283" }; },
      async applyBusinessDate() { throw new Error("自助取数不该走逐页日期设置"); },
      async downloadOfficialReport() { throw new Error("自助取数不该走逐页导出"); },
      async awaitDownload() { return { filePath: "/managed/downloads/a.xlsx", safeFileName: "a.xlsx" }; }
    }),
    createExtractApi: () => ({}),
    createExtractRunner: () => ({ async run() { return { plan: { taskName: "采集-product-20260729-20260729" } }; } })
  });

  const result = await executor.executeTask({
    task,
    browser: { online: true, profileKey: "douyin-ecommerce:90862283", endpoint: "http://127.0.0.1:43127" }
  });

  assert.equal(result.kind, "downloaded");
  // 先打开资源落地页做登录态与店铺校验，再转到取数页——两个都必须在白名单里。
  assert.ok(opened.every(isRegisteredDouyinUrl), `打开了未登记的地址：${opened.join("、")}`);
  assert.ok(opened.includes(SELF_SERVICE_URL), "自助取数任务必须落到取数页");
});

test("dedicated Douyin adapter stops for login, verification, wrong store and schema changes", async () => {
  const { createDouyinDedicatedExecutor } = await moduleUnderTest();
  assert.equal(typeof createDouyinDedicatedExecutor, "function", "createDouyinDedicatedExecutor must be implemented");

  for (const [inspection, expectedKind, expectedCode] of [
    [{ state: "login_required" }, "waiting_human", "DOUYIN_LOGIN_REQUIRED"],
    [{ state: "human_verification" }, "waiting_human", "DOUYIN_HUMAN_VERIFICATION_REQUIRED"],
    [{ state: "ready", storeId: "another-store" }, "failed", "DOUYIN_STORE_MISMATCH"],
    [{ state: "schema_changed" }, "schema_changed", "DOUYIN_PAGE_SCHEMA_CHANGED"]
  ]) {
    const executor = createDouyinDedicatedExecutor({
      createController: async () => ({
        async open() {},
        async inspect() { return inspection; }
      })
    });
    const result = await executor.executeTask({
      task,
      browser: {
        online: true,
        profileKey: "douyin-ecommerce:90862283",
        endpoint: "http://127.0.0.1:43127"
      }
    });
    assert.equal(result.kind, expectedKind);
    assert.equal(result.errorCode, expectedCode);
    assert.equal(result.jobId, "job-1");
  }
});

test("Douyin page inspection never treats the public site or a pre-login report shell as ready", async () => {
  const { classifyDouyinPageSnapshot } = await moduleUnderTest();
  assert.equal(typeof classifyDouyinPageSnapshot, "function", "classifyDouyinPageSnapshot must be implemented");

  assert.deepEqual(classifyDouyinPageSnapshot({
    origin: "https://compass.jinritemai.com",
    path: "/",
    title: "抖音电商罗盘数据官网",
    body: "首页 产品介绍 版本对比 入驻",
    hasPassword: false,
    hasDateControl: false,
    hasReportAction: false
  }), { state: "login_required" });

  assert.deepEqual(classifyDouyinPageSnapshot({
    origin: "https://compass.jinritemai.com",
    path: "/shop/merchandise-traffic",
    title: "商品卡列表-抖音电商罗盘",
    body: "帮助 获取菜单失败",
    hasPassword: false,
    hasDateControl: false,
    hasReportAction: false
  }), { state: "loading" });

  assert.deepEqual(classifyDouyinPageSnapshot({
    origin: "",
    path: "",
    title: "",
    body: "",
    hasPassword: false,
    hasDateControl: false,
    hasReportAction: false
  }), { state: "loading" });

  const readySnapshot = {
    origin: "https://compass.jinritemai.com",
    path: "/shop/merchandise-traffic",
    title: "商品卡列表-抖音电商罗盘",
    body: "TIYES提野星宠物用品旗舰店 昨天 下载报表",
    hasPassword: false,
    hasDateControl: true,
    hasReportAction: true
  };
  assert.deepEqual(classifyDouyinPageSnapshot(readySnapshot, {
    expectedStoreId: "90862283",
    expectedStoreName: "TIYES提野星宠物用品旗舰店"
  }), { state: "ready", storeId: "90862283" });
  assert.deepEqual(classifyDouyinPageSnapshot({
    ...readySnapshot,
    body: "另一家店 昨天 下载报表"
  }, {
    expectedStoreId: "90862283",
    expectedStoreName: "TIYES提野星宠物用品旗舰店"
  }), { state: "store_identity_unavailable" });
});

// 原先这里有一个用例断言「没有报表时 store_daily 退回页面指标抓取」。
// 那条路径正是产生 314 万成交订单数 / 257 万成交人数（同日 GMV 仅 6.5 万）的来源，
// 现在 store_daily 走自助取数，它在专用浏览器里已不可达，因此删除该用例。
// 扩展模式仍走页面抓取，其字段白名单由 tests/douyin-extension-adapter.test.mjs 覆盖。

test("CDP controller allows only registered pages and resolves an official download locally", async () => {
  const { createCdpDouyinController } = await moduleUnderTest();
  assert.equal(typeof createCdpDouyinController, "function", "createCdpDouyinController must be implemented");
  const commands = [];
  const listeners = new Map();
  let evaluateCount = 0;
  const controller = createCdpDouyinController({
    browser: {
      online: true,
      endpoint: "http://127.0.0.1:43127",
      profileKey: "douyin-ecommerce:90862283"
    },
    downloadsDirectory: "/managed/downloads",
    fetchImpl: async (url, options = {}) => {
      if (url === "http://127.0.0.1:43127/json") {
        return new Response(JSON.stringify([{
          id: "page-1",
          type: "page",
          url: "https://compass.jinritemai.com/shop/merchandise-traffic",
          webSocketDebuggerUrl: "ws://page-1"
        }]));
      }
      if (url === "http://127.0.0.1:43127/json/version") {
        return new Response(JSON.stringify({ webSocketDebuggerUrl: "ws://browser-1" }));
      }
      throw new Error(`unexpected fetch ${options.method || "GET"} ${url}`);
    },
    createSession: url => ({
      on(method, listener) {
        listeners.set(method, listener);
        return () => listeners.delete(method);
      },
      async send(method, params) {
        commands.push([url, method, params]);
        if (url === "ws://page-1" && method === "Runtime.evaluate") {
          evaluateCount += 1;
          if (evaluateCount === 1) {
            return {
              result: {
                value: {
                  origin: "https://compass.jinritemai.com",
                  path: "/shop/merchandise-traffic",
                  title: "商品卡列表-抖音电商罗盘",
                  body: "商品 昨天 下载报表",
                  hasPassword: false,
                  hasDateControl: true,
                  hasReportAction: true
                }
              }
            };
          }
          if (evaluateCount === 2) return { result: { value: { applied: true } } };
          queueMicrotask(() => {
            listeners.get("Browser.downloadWillBegin")?.({
              guid: "download-1",
              suggestedFilename: "商品明细_2026-07-24.xlsx"
            });
            listeners.get("Browser.downloadProgress")?.({
              guid: "download-1",
              state: "completed"
            });
          });
          return { result: { value: { clicked: true } } };
        }
        return {};
      },
      close() {}
    }),
    wait: async () => {}
  });

  await assert.rejects(controller.open("https://evil.example/report"), /登记/);
  await controller.open("https://compass.jinritemai.com/shop/merchandise-traffic");
  assert.deepEqual(await controller.inspect({ expectedStoreId: "90862283" }), {
    state: "ready",
    storeId: "90862283"
  });
  await controller.applyBusinessDate("2026-07-24");
  const downloaded = await controller.downloadOfficialReport({
    resourceType: "product_daily",
    pageType: "shop_compass_product",
    reportVersion: "douyin-product-v2"
  });

  assert.deepEqual(downloaded, {
    filePath: "/managed/downloads/商品明细_2026-07-24.xlsx",
    safeFileName: "商品明细_2026-07-24.xlsx"
  });
  assert.equal(commands.some(([, method]) => method === "Browser.setDownloadBehavior"), true);
  assert.doesNotMatch(JSON.stringify(commands), /document\\.cookie|localStorage|sessionStorage/i);
});

test("dedicated Douyin adapter attaches only a local registered-page diagnostic artifact on crashes", async () => {
  const { createDouyinDedicatedExecutor } = await moduleUnderTest();
  assert.equal(typeof createDouyinDedicatedExecutor, "function", "createDouyinDedicatedExecutor must be implemented");
  const executor = createDouyinDedicatedExecutor({
    createController: async () => ({
      async open() {},
      async inspect() {
        throw Object.assign(new Error("page failed"), { code: "DOUYIN_ACTION_FAILED" });
      },
      async captureFailureArtifact() {
        return Buffer.from("registered-page-screenshot");
      },
      close() {}
    })
  });

  await assert.rejects(
    executor.executeTask({
      task,
      browser: {
        online: true,
        profileKey: "douyin-ecommerce:90862283",
        endpoint: "http://127.0.0.1:43127"
      }
    }),
    error => (
      error?.code === "DOUYIN_ACTION_FAILED"
      && error.localArtifact?.toString() === "registered-page-screenshot"
    )
  );
});
