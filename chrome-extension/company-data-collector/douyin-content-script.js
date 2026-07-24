const douyinExecutorPromise = import(
  chrome.runtime.getURL("providers/executors/douyin.js")
);

async function runRegisteredTask(task) {
  if (task?.providerId !== "douyin-ecommerce") {
    return {
      kind: "failed",
      status: "failed",
      stage: "opening",
      errorCode: "EXTENSION_PROVIDER_NOT_IMPLEMENTED"
    };
  }
  const executor = await douyinExecutorPromise;
  return executor.executeDouyinTask(task);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "COLLECTOR_CONTENT_SCRIPT_PROBE") {
    sendResponse({ ok: true, providerId: "douyin-ecommerce" });
    return false;
  }
  if (message?.type === "DISCOVER_DOUYIN_STORE") {
    douyinExecutorPromise
      .then(executor => executor.discoverDouyinStoreIdentity())
      .then(sendResponse)
      .catch(error => sendResponse({
        kind: "failed",
        errorCode: error?.code || "DOUYIN_STORE_IDENTITY_FAILED",
        safeSummary: "抖店店铺身份识别失败。"
      }));
    return true;
  }
  if (message?.type !== "RUN_REGISTERED_TASK") return false;
  runRegisteredTask(message.task)
    .then(sendResponse)
    .catch(error => sendResponse({
      kind: "failed",
      status: "failed",
      stage: "opening",
      errorCode: error?.code || "EXTENSION_TASK_FAILED"
    }));
  return true;
});
