import assert from "node:assert/strict";
import test from "node:test";
import { TASK_TIMEOUT_MS } from "../src/domain/douyinSelfServiceExtract.js";
import { createDouyinExtractRunner } from "../scripts/web-data-collector/browser/providers/douyinExtractRunner.js";

function harness(statusSequence) {
  const calls = { created: 0, reads: 0, downloads: [] };
  let clock = 0;
  const form = {
    async createTask({ resourceType, from, to }) {
      calls.created += 1;
      return { taskName: `采集-shop-${from.replace(/-/g, "")}-${to.replace(/-/g, "")}`, from, to };
    },
    async readTasks() {
      const status = statusSequence[Math.min(calls.reads, statusSequence.length - 1)];
      calls.reads += 1;
      if (status === null) return [{ taskName: "别人的任务", status: "取数完成" }];
      return [
        { taskName: "别人的任务", status: "取数完成" },
        { taskName: "采集-shop-20260725-20260729", status }
      ];
    },
    async downloadTask(name) { calls.downloads.push(name); }
  };
  const runner = createDouyinExtractRunner({
    form,
    wait: async () => { clock += 30_000; },
    now: () => clock,
    pollIntervalMs: 30_000
  });
  return { runner, calls };
}

const task = { resourceType: "store_daily", from: "2026-07-25", to: "2026-07-29" };

test("排队中持续等待，完成后下载自己那条", async () => {
  const h = harness(["排队中 78/78", "排队中 12/78", "取数完成"]);
  const result = await h.runner.run(task);
  assert.equal(result.downloaded, true);
  assert.deepEqual(h.calls.downloads, ["采集-shop-20260725-20260729"]);
  assert.equal(h.calls.created, 1, "全程只创建一次任务");
});

test("任务尚未出现在列表时继续等，不重复创建", async () => {
  // 刚创建时列表可能还没刷出来。把它当成失败再重建，只会让全平台队列更长。
  const h = harness([null, null, "取数完成"]);
  await h.runner.run(task);
  assert.equal(h.calls.created, 1);
});

test("平台判失败立即停止，不空等", async () => {
  const h = harness(["取数失败"]);
  await assert.rejects(() => h.runner.run(task), error => error.code === "DOUYIN_EXTRACT_TASK_FAILED");
  assert.deepEqual(h.calls.downloads, []);
});

test("等太久按超时结束，并说明是队列繁忙", async () => {
  const h = harness(["排队中 78/78"]);
  await assert.rejects(
    () => h.runner.run(task),
    error => error.code === "DOUYIN_EXTRACT_TIMEOUT" && /稍后重试/.test(error.message)
  );
  assert.ok(h.calls.reads * 30_000 >= TASK_TIMEOUT_MS - 30_000, "应一直轮询到超时");
});
