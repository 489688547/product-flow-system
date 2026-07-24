const kuaimaiExecutorPromise = import(
  chrome.runtime.getURL("providers/executors/kuaimai.js")
);

async function runRegisteredTask(task) {
  if (task?.providerId !== "kuaimai") {
    return {
      status: "failed",
      stage: "opening",
      errorCode: "EXTENSION_PROVIDER_NOT_IMPLEMENTED"
    };
  }
  const executor = await kuaimaiExecutorPromise;
  return executor.executeKuaimaiTask(task);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "COLLECTOR_CONTENT_SCRIPT_PROBE") {
    sendResponse({ ok: true, providerId: "kuaimai" });
    return false;
  }
  if (message?.type !== "RUN_REGISTERED_TASK") return false;
  runRegisteredTask(message.task)
    .then(sendResponse)
    .catch(error => sendResponse({
      status: "failed",
      stage: "opening",
      errorCode: error?.code || "EXTENSION_TASK_FAILED"
    }));
  return true;
});
