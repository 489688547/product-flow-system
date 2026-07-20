import { providerForTask } from "./providers/index.mjs";

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function safeFailure(error) {
  const message = String(error?.message || "采集任务执行失败。");
  return message.replace(/(?:password|cookie|token|secret|authorization)\s*[:=]\s*\S+/gi, "$1=[已清除]").slice(0, 300);
}

async function executeTask(task, { api, browser, wait, maxHumanPolls }) {
  const provider = providerForTask(task);
  provider.validateTask(task);
  const credentials = await api.credential(task.id, task.grant);
  let page = await provider.openAndFill(browser, credentials, { wait });
  let pageState = provider.classify(page);
  let waitedForHuman = false;
  if (pageState.status === "waiting_human_verification") {
    waitedForHuman = true;
    await api.result(task.id, { status: "waiting_human_verification" });
    for (let index = 0; index < maxHumanPolls && pageState.status === "waiting_human_verification"; index += 1) {
      await wait(2000);
      page = await provider.inspect(browser, page?.id);
      pageState = provider.classify(page);
    }
  }
  if (pageState.status === "authenticated") {
    await api.result(task.id, { status: "recognizing" });
    await api.result(task.id, { status: "succeeded", shops: pageState.shops });
    return { completed: true, waitedForHuman };
  }
  const error = new Error(pageState.status === "waiting_human_verification" ? "等待人工验证超时。" : "抖音页面结构已变化，未识别到店铺身份。");
  error.code = pageState.status === "waiting_human_verification" ? "HUMAN_VERIFICATION_TIMEOUT" : "PROVIDER_SCHEMA_CHANGED";
  throw error;
}

export async function runDataConnectionTasks(tasks = [], options = {}) {
  const api = options.api;
  const browser = options.browser;
  const wait = options.wait || delay;
  const maxHumanPolls = Number.isFinite(options.maxHumanPolls) ? options.maxHumanPolls : 900;
  let completed = 0;
  let failed = 0;
  let waitingHuman = 0;
  for (const task of Array.isArray(tasks) ? tasks : []) {
    try {
      const result = await executeTask(task, { api, browser, wait, maxHumanPolls });
      completed += result.completed ? 1 : 0;
      waitingHuman += result.waitedForHuman ? 1 : 0;
    } catch (error) {
      failed += 1;
      try {
        await api.result(task.id, { status: "failed", errorCode: String(error?.code || "AGENT_TASK_FAILED").slice(0, 80), message: safeFailure(error) });
      } catch {}
    }
  }
  return { completed, failed, waitingHuman };
}
