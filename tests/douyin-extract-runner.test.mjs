import assert from "node:assert/strict";
import test from "node:test";
import { TASK_TIMEOUT_MS } from "../src/domain/douyinSelfServiceExtract.js";
import { createDouyinExtractRunner } from "../scripts/web-data-collector/browser/providers/douyinExtractRunner.js";

// 用假的接口客户端驱动 runner：状态序列一轮一个，模拟排队到完成的过程。
function harness(stateSequence, { step = 30_000 } = {}) {
  const calls = { created: 0, polls: 0, downloads: [] };
  let clock = 0;
  const api = {
    async createTask({ resourceType, from, to }) {
      calls.created += 1;
      return { taskName: `采集-shop-${from.replace(/-/g, "")}-${to.replace(/-/g, "")}`, from, to };
    },
    async findTask() {
      const entry = stateSequence[Math.min(calls.polls, stateSequence.length - 1)];
      calls.polls += 1;
      return entry;
    },
    async downloadTask(taskName) {
      calls.downloads.push(taskName);
      return { taskName };
    }
  };
  const runner = createDouyinExtractRunner({
    api,
    wait: async () => { clock += step; },
    now: () => clock,
    pollIntervalMs: step
  });
  return { runner, calls, advance: ms => { clock += ms; } };
}

test("排队中持续等待，完成后按名称下载", async () => {
  const { runner, calls } = harness([
    { state: "pending", status: "排队中 3/4" },
    { state: "pending", status: "排队中 1/4" },
    { state: "ready" }
  ]);
  const result = await runner.run({ resourceType: "store_daily", from: "2026-07-25", to: "2026-07-29" });
  assert.equal(result.downloaded, true);
  assert.deepEqual(calls.downloads, ["采集-shop-20260725-20260729"]);
  assert.equal(calls.created, 1, "全程只建一个任务");
});

test("任务还没出现在列表里，视同排队，绝不重复建任务", async () => {
  // 队列是全平台共用的，重复建任务只会把队排得更长。
  const { runner, calls } = harness([
    { state: "missing" },
    { state: "missing" },
    { state: "ready" }
  ]);
  await runner.run({ resourceType: "store_daily", from: "2026-07-25", to: "2026-07-29" });
  assert.equal(calls.created, 1);
});

test("等超时报的是超时，不是失败——排队慢不需要改代码", async () => {
  const { runner } = harness([{ state: "pending", status: "排队中 12/20" }], { step: TASK_TIMEOUT_MS / 4 });
  await assert.rejects(
    runner.run({ resourceType: "store_daily", from: "2026-07-25", to: "2026-07-29" }),
    error => error.code === "DOUYIN_EXTRACT_TIMEOUT" && /排队/.test(error.message)
  );
});

test("平台判失败就立刻停，不再空等", async () => {
  const { runner } = harness([{ state: "failed", status: "取数失败" }]);
  await assert.rejects(
    runner.run({ resourceType: "store_daily", from: "2026-07-25", to: "2026-07-29" }),
    error => error.code === "DOUYIN_EXTRACT_TASK_FAILED"
  );
});
