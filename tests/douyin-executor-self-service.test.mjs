import assert from "node:assert/strict";
import test from "node:test";
import {
  SELF_SERVICE_URL,
  createDouyinDedicatedExecutor,
  validateDedicatedDouyinTask
} from "../scripts/web-data-collector/browser/providers/douyin.mjs";

const task = {
  jobId: "job-1", providerId: "douyin-ecommerce", storeId: "90862283",
  resourceType: "live_daily", businessDate: "2026-07-29", viaSelfService: true
};

function controllerStub(overrides = {}) {
  const opened = [];
  return {
    opened,
    async open(url) { opened.push(url); },
    async inspect() { return { state: "ready", storeId: "90862283" }; },
    async applyBusinessDate() { throw new Error("自助取数不应走逐页日期设置"); },
    async downloadOfficialReport() { throw new Error("自助取数不应走逐页导出"); },
    async awaitDownload() { return { filePath: "/tmp/a.xlsx", safeFileName: "a.xlsx" }; },
    ...overrides
  };
}

test("viaSelfService 的任务走自助取数页面，不走逐页导出", async () => {
  const controller = controllerStub();
  let ranWith = null;
  const executor = createDouyinDedicatedExecutor({
    createController: async () => controller,
    createExtractApi: () => ({}),
    createExtractRunner: () => ({
      async run(input) { ranWith = input; return { plan: { taskName: "采集-live-20260729-20260729" } }; }
    })
  });
  const result = await executor.executeTask({ task, browser: { endpoint: "http://127.0.0.1:9222", profileKey: "douyin-ecommerce:90862283", online: true } });
  assert.equal(result.kind, "downloaded");
  assert.equal(result.reportVersion, "douyin-self-service-v1");
  assert.ok(controller.opened.includes(SELF_SERVICE_URL), "必须打开自助取数页面");
  assert.deepEqual(ranWith, { resourceType: "live_daily", from: "2026-07-29", to: "2026-07-29" });
});

test("任务上的 viaSelfService 标记不再影响走向，一切以资源类型为准", async () => {
  // 标记曾经是路由依据，但它经服务端一个来回就没了（表里没有这一列）。
  // 现在即使显式写 false，已验证的资源照样走自助取数——路由不能依赖传不过来的字段。
  let applied = false;
  const controller = controllerStub({
    async applyBusinessDate() { applied = true; },
    async downloadOfficialReport() { return { filePath: "/tmp/b.xlsx", safeFileName: "b.xlsx" }; }
  });
  const executor = createDouyinDedicatedExecutor({
    createController: async () => controller,
    createExtractApi: () => ({}),
    createExtractRunner: () => ({ async run() { return { plan: { taskName: "采集-live-20260729-20260729" } }; } })
  });
  const result = await executor.executeTask({
    task: { ...task, viaSelfService: false },
    browser: { endpoint: "http://127.0.0.1:9222", profileKey: "douyin-ecommerce:90862283", online: true }
  });
  assert.equal(applied, false, "已验证的资源不看标记");
  assert.equal(result.reportVersion, "douyin-self-service-v1");
});

test("viaSelfService 是合法任务字段", () => {
  assert.doesNotThrow(() => validateDedicatedDouyinTask(task));
});

test("文件未落盘时明确失败，不谎报成功", async () => {
  const controller = controllerStub({ async awaitDownload() { return null; } });
  const executor = createDouyinDedicatedExecutor({
    createController: async () => controller,
    createExtractApi: () => ({}),
    createExtractRunner: () => ({ async run() { return { plan: { taskName: "x" } }; } })
  });
  const result = await executor.executeTask({ task, browser: { endpoint: "http://127.0.0.1:9222", profileKey: "douyin-ecommerce:90862283", online: true } });
  assert.equal(result.errorCode, "DOUYIN_EXTRACT_DOWNLOAD_MISSING");
});

test("自助取数通道没接线时明确失败，不悄悄退回逐页导出", async () => {
  // 逐页导出采回的是另一个口径的数据，退回去不会报错，错值却已经入库了。
  const controller = controllerStub({
    async applyBusinessDate() { throw new Error("不该走到这里"); }
  });
  const executor = createDouyinDedicatedExecutor({ createController: async () => controller });
  const result = await executor.executeTask({
    task,
    browser: { endpoint: "http://127.0.0.1:9222", profileKey: "douyin-ecommerce:90862283", online: true }
  });
  assert.equal(result.errorCode, "DOUYIN_EXTRACT_CHANNEL_UNAVAILABLE");
});

test("走不走自助取数由资源类型判定，不依赖任务上的标记", async () => {
  // 之前是在排日计划时打 viaSelfService 标记带过去，但 web_collection_jobs 表没有这一列，
  // 标记经服务端一个来回就没了：执行器拿到 undefined，于是悄悄走回逐页导出，
  // 采回另一个口径的数据还不报错。本地测试全绿，因为测试直接构造带标记的任务，
  // 绕过了那个来回。所以这里刻意不带标记。
  const controller = controllerStub();
  const executor = createDouyinDedicatedExecutor({
    createController: async () => controller,
    createExtractApi: () => ({}),
    createExtractRunner: () => ({ async run() { return { plan: { taskName: "采集-live-20260729-20260729" } }; } })
  });
  const { viaSelfService, ...没有标记的任务 } = task;
  const result = await executor.executeTask({
    task: 没有标记的任务,
    browser: { endpoint: "http://127.0.0.1:9222", profileKey: "douyin-ecommerce:90862283", online: true }
  });
  assert.equal(result.reportVersion, "douyin-self-service-v1");
});

// 原先这里有一个用例断言「store_daily 仍走逐页导出」。四个日事实资源现在都已切换：
// 窗口内走首页接口、窗口外走自助取数，都由下面两个用例覆盖，逐页路径不再是它们的归宿。

test("店铺日事实优先走首页接口：秒级、不占自助取数配额", async () => {
  const controller = controllerStub({
    async downloadOfficialReport() { throw new Error("不该走逐页导出"); }
  });
  let 问了哪天 = null;
  const executor = createDouyinDedicatedExecutor({
    createController: async () => controller,
    createExtractApi: () => ({}),
    createExtractRunner: () => ({ async run() { throw new Error("窗口内不该退到自助取数"); } }),
    createHomepageApi: () => ({
      async readStoreDaily(input) {
        问了哪天 = input.businessDate;
        return { providerId: "douyin-ecommerce", storeId: input.storeId, businessDate: input.businessDate, transactionAmount: 65449.76, adCostAmount: 13116.02 };
      }
    })
  });
  // 业务日按 Asia/Shanghai 的今天回推，取昨天一定在窗口内。
  const 昨天 = new Date(Date.now() + 8 * 3600 * 1000 - 86400000).toISOString().slice(0, 10);
  const result = await executor.executeTask({
    task: { ...task, resourceType: "store_daily", businessDate: 昨天 },
    browser: { endpoint: "http://127.0.0.1:9222", profileKey: "douyin-ecommerce:90862283", online: true }
  });
  assert.equal(result.kind, "captured");
  assert.equal(result.facts.adCostAmount, 13116.02, "广告费随首页通道一起回来");
  assert.equal(问了哪天, 昨天);
});

test("超出首页回溯窗口的日期退回自助取数，不硬取", async () => {
  // 近1天口径只回溯约两天。更早的日期首页拿不到，硬取会落一条全 null 的记录，
  // 页面上会显示成「这天没生意」。
  const controller = controllerStub();
  let 走了自助 = false;
  const executor = createDouyinDedicatedExecutor({
    createController: async () => controller,
    createExtractApi: () => ({}),
    createExtractRunner: () => ({
      async run() { 走了自助 = true; return { plan: { taskName: "采集-shop-20260101-20260101-abcdef" } }; }
    }),
    createHomepageApi: () => ({ async readStoreDaily() { throw new Error("超出窗口不该问首页"); } })
  });
  await executor.executeTask({
    task: { ...task, resourceType: "store_daily", businessDate: "2026-01-01" },
    browser: { endpoint: "http://127.0.0.1:9222", profileKey: "douyin-ecommerce:90862283", online: true }
  });
  assert.equal(走了自助, true);
});
