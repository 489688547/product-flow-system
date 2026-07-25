export function createDedicatedBrowserRuntime({
  api,
  profileRegistry,
  ensureBrowser,
  orchestrator,
  executeTask,
  checkpointStore = null,
  diagnosticStore = null,
  diagnosticPageType = () => ""
}) {
  if (
    typeof api?.assignedStores !== "function"
    || typeof profileRegistry?.register !== "function"
    || typeof ensureBrowser !== "function"
    || typeof orchestrator?.nextTask !== "function"
    || typeof orchestrator?.submitResult !== "function"
    || typeof executeTask !== "function"
  ) {
    throw new Error("专用浏览器采集运行时依赖不完整。");
  }

  return Object.freeze({
    async runOnce() {
      const assignment = await api.assignedStores();
      const stores = Array.isArray(assignment?.stores) ? assignment.stores : [];
      let processed = 0;
      let failed = 0;
      for (const store of stores) {
        if (store?.providerId !== "douyin-ecommerce") continue;
        const profile = profileRegistry.register(store);
        const browser = await ensureBrowser(profile);
        orchestrator.recordBrowserStatus?.({
          providerId: profile.providerId,
          storeId: profile.storeId,
          online: browser.online === true
        });
        const task = await orchestrator.nextTask({
          storeId: profile.storeId,
          executor: "dedicated"
        });
        if (!task) continue;
        const checkpoint = await checkpointStore?.load?.(task.jobId);
        let result;
        try {
          result = checkpoint?.result || await executeTask({ task, browser, profile });
        } catch (error) {
          const candidateCode = String(error?.code || "WEB_COLLECTION_BROWSER_ACTION_FAILED").toUpperCase();
          const errorCode = /^[A-Z0-9_]{3,80}$/.test(candidateCode)
            ? candidateCode
            : "WEB_COLLECTION_BROWSER_ACTION_FAILED";
          let diagnostic = null;
          const pageType = diagnosticPageType(task);
          if (diagnosticStore?.write && pageType) {
            diagnostic = await diagnosticStore.write({
              jobId: task.jobId,
              pageType,
              errorCode,
              safeSummary: "本机浏览器操作失败。",
              artifact: Buffer.isBuffer(error?.localArtifact) ? error.localArtifact : Buffer.alloc(0)
            }).catch(() => null);
          }
          await orchestrator.submitResult({
            kind: "failed",
            jobId: task.jobId,
            errorCode,
            safeSummary: diagnostic?.diagnosticId
              ? `本机浏览器操作失败，诊断编号 ${diagnostic.diagnosticId}。`
              : "本机浏览器操作失败。",
            stage: "opening"
          });
          await checkpointStore?.clear?.(task.jobId);
          failed += 1;
          continue;
        }
        if (!checkpoint?.result && checkpointStore?.save) {
          await checkpointStore.save(task.jobId, {
            stage: result.kind === "downloaded" ? "downloaded" : "validated",
            result
          });
        }
        await orchestrator.submitResult(result);
        await checkpointStore?.clear?.(task.jobId);
        processed += 1;
      }
      return { assigned: stores.length, processed, failed };
    }
  });
}
