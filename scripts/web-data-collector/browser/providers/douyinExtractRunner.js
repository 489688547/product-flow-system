// 自助取数的完整流程：建任务 → 轮询 → 下载 → 交给上层解析入库。
//
// 走的是接口而不是页面表单（见 src/domain/douyinExtractApi.js 里的原因）。建一个任务
// 实测 286 毫秒，驱动表单要三分钟，而且时不时点空还不报错。
//
// 它是异步的，队列由抖音全平台共用（实测排到过第 22 位），页面提示一般需 10-20 分钟，
// 实测最快 3 分钟。因此这里的核心是「等」而不是「做」，而等的过程必须能区分三件事：
// 还在排队、平台判失败、等太久了。把三者混成一个「失败」会让人误以为要改代码。

import { planExtractWait } from "../../../../src/domain/douyinSelfServiceExtract.js";

export function createDouyinExtractRunner({
  api,
  wait,
  now = () => Date.now(),
  pollIntervalMs = 30_000
}) {
  return Object.freeze({
    // 返回 { plan, downloaded }。文件落到浏览器下载目录，由上层按归档流程接手——
    // 这里不碰文件系统，保持可测。
    async run({ resourceType, from, to }) {
      const plan = await api.createTask({ resourceType, from, to });
      const startedAt = now();

      for (;;) {
        const found = await api.findTask(plan.taskName);

        // 任务刚建好时列表可能还没刷出来，这与「排队中」同样属于要继续等的情形。
        const state = found.state === "missing" ? "pending" : found.state;
        const decision = planExtractWait({
          startedAt,
          now: now(),
          state,
          status: found.status || (found.state === "missing" ? "任务尚未出现在列表" : "")
        });

        if (decision.action === "download") {
          await api.downloadTask(plan.taskName);
          return { plan, downloaded: true };
        }
        if (decision.action === "fail") {
          throw Object.assign(new Error(decision.message), { code: decision.errorCode });
        }
        await wait(pollIntervalMs);
      }
    }
  });
}
