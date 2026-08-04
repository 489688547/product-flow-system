import { egoTaskSpaceName } from "./providers/douyinEgoTask.mjs";

export function createEgoBrowserRuntime({
  api,
  orchestrator,
  executeTask,
  checkpointStore,
  workspaceForTask
} = {}) {
  if (
    typeof api?.assignedStores !== "function"
    || typeof orchestrator?.nextTask !== "function"
    || typeof orchestrator?.submitResult !== "function"
    || typeof executeTask !== "function"
    || typeof checkpointStore?.load !== "function"
    || typeof workspaceForTask !== "function"
  ) {
    throw new Error("Ego 浏览器采集运行时依赖不完整。");
  }

  return Object.freeze({
    async runOnce() {
      const assignment = await api.assignedStores();
      const stores = Array.isArray(assignment?.stores) ? assignment.stores : [];
      let processed = 0;
      let failed = 0;
      for (const store of stores) {
        if (store?.providerId !== "douyin-ecommerce") continue;
        const task = await orchestrator.nextTask({ storeId: store.storeId, executor: "ego" });
        if (!task) continue;
        const checkpoint = await checkpointStore.load(task.jobId);
        let result = checkpoint?.result || null;
        let resume = checkpoint?.resume || {};
        const taskSpaceName = egoTaskSpaceName(task);
        const explicitHumanRetry = checkpoint?.stage === "waiting_human"
          && checkpoint?.resume?.humanWait?.taskSpaceName === taskSpaceName;
        const save = async (stage, nextResume = resume) => {
          resume = nextResume || {};
          await checkpointStore.save(task.jobId, {
            stage,
            ...(result ? { result } : {}),
            ...(Object.keys(resume).length ? { resume } : {})
          });
        };
        let browserExecutionInProgress = false;
        try {
          if (!result) {
            resume = {};
            await checkpointStore.save(task.jobId, { stage: "opening" });
            browserExecutionInProgress = true;
            result = await executeTask({
              task: {
                ...task,
                storeName: store.storeName,
                workspace: workspaceForTask(task)
              },
              control: { explicitHumanRetry }
            });
            browserExecutionInProgress = false;
            if (result.kind === "waiting_human") {
              await orchestrator.submitResult(result);
              await checkpointStore.save(task.jobId, {
                stage: "waiting_human",
                resume: {
                  humanWait: {
                    errorCode: result.errorCode,
                    taskSpaceName
                  }
                }
              });
              processed += 1;
              continue;
            }
            await checkpointStore.save(task.jobId, {
              stage: result.kind === "downloaded" ? "downloaded" : "validated",
              result
            });
          }
          await orchestrator.submitResult(result, {
            resume,
            onCheckpoint: (stage, nextResume) => save(stage, nextResume)
          });
          await checkpointStore.clear?.(task.jobId);
          processed += 1;
        } catch (error) {
          failed += 1;
          if (browserExecutionInProgress) {
            const errorCode = /^[A-Z0-9_]{3,80}$/.test(String(error?.code || ""))
              ? String(error.code)
              : "EGO_PROCESS_FAILED";
            const failure = {
              kind: "failed",
              jobId: task.jobId,
              errorCode,
              safeSummary: "Ego 任务进程执行失败，请检查 Ego 是否可用后重试。",
              stage: "opening"
            };
            try {
              await orchestrator.submitResult(failure);
              await checkpointStore.clear?.(task.jobId);
            } catch {
              // The opening checkpoint remains available for a later service retry.
            }
          }
        }
      }
      return { assigned: stores.length, processed, failed };
    }
  });
}
