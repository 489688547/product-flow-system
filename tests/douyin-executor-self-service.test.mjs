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

test("未标记 viaSelfService 时保持原有逐页路径", async () => {
  // 新通道不得悄悄改变现有行为：没标记就还是走 applyBusinessDate。
  let applied = false;
  const controller = controllerStub({
    async applyBusinessDate() { applied = true; },
    async downloadOfficialReport() { return { filePath: "/tmp/b.xlsx", safeFileName: "b.xlsx" }; }
  });
  const executor = createDouyinDedicatedExecutor({ createController: async () => controller });
  const result = await executor.executeTask({
    task: { ...task, viaSelfService: false },
    browser: { endpoint: "http://127.0.0.1:9222", profileKey: "douyin-ecommerce:90862283", online: true }
  });
  assert.equal(applied, true);
  assert.notEqual(result.reportVersion, "douyin-self-service-v1", "未标记时不得走自助取数");
});

test("viaSelfService 是合法任务字段", () => {
  assert.doesNotThrow(() => validateDedicatedDouyinTask(task));
});

test("文件未落盘时明确失败，不谎报成功", async () => {
  const controller = controllerStub({ async awaitDownload() { return null; } });
  const executor = createDouyinDedicatedExecutor({
    createController: async () => controller,
    createExtractRunner: () => ({ async run() { return { plan: { taskName: "x" } }; } })
  });
  const result = await executor.executeTask({ task, browser: { endpoint: "http://127.0.0.1:9222", profileKey: "douyin-ecommerce:90862283", online: true } });
  assert.equal(result.errorCode, "DOUYIN_EXTRACT_DOWNLOAD_MISSING");
});
