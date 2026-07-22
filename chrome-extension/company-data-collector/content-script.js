const registryPromise = import(chrome.runtime.getURL("providers/registry.js"));
const kuaimaiPromise = import(chrome.runtime.getURL("providers/kuaimai.js"));

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function exactTextElement(selector, value, matchesText) {
  return Array.from(document.querySelectorAll(selector)).find(element =>
    matchesText(element.textContent, value) && element.getClientRects().length > 0
  );
}

function dispatchValue(input, value) {
  const prototype = input instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) throw Object.assign(new Error("输入控件不可写。"), { code: "KUAIMAI_INPUT_UNAVAILABLE" });
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new Event("blur", { bubbles: true }));
}

function findRequired(selector, code) {
  const element = document.querySelector(selector);
  if (!element) throw Object.assign(new Error("页面控件不可用。"), { code });
  return element;
}

async function pageProbe(selectors, matchesText) {
  const bodyText = String(document.body?.innerText || "");
  const verificationTerms = ["验证码", "安全验证", "拖动滑块", "扫码验证", "设备验证"];
  return {
    url: location.href,
    markers: {
      loginPage: /\/login(?:[/?#]|$)/i.test(location.pathname) || Boolean(document.querySelector("input[type='password']")),
      humanVerification: verificationTerms.some(term => bodyText.includes(term)),
      timeBasis: Boolean(document.querySelector(selectors.timeBasis)),
      startTime: Boolean(document.querySelector(selectors.startTime)),
      endTime: Boolean(document.querySelector(selectors.endTime)),
      queryButton: Boolean(exactTextElement(selectors.queryButton, "查询", matchesText)),
      exportOrders: Boolean(exactTextElement(selectors.exportLink, "导出订单", matchesText)),
      exportOrderItems: Boolean(exactTextElement(selectors.exportLink, "导出订单明细", matchesText))
    }
  };
}

async function runKuaimaiAction(action, selectors, matchesText) {
  switch (action.action) {
    case "select_time_basis": {
      const input = findRequired(selectors.timeBasis, "KUAIMAI_TIME_BASIS_MISSING");
      input.click();
      await wait(120);
      const option = exactTextElement(selectors.selectOption, action.value, matchesText);
      if (!option) throw Object.assign(new Error("创建时间选项不可用。"), { code: "KUAIMAI_CREATION_TIME_OPTION_MISSING" });
      option.click();
      await wait(100);
      return;
    }
    case "set_start_time":
      dispatchValue(findRequired(selectors.startTime, "KUAIMAI_START_TIME_MISSING"), action.value);
      return;
    case "set_end_time":
      dispatchValue(findRequired(selectors.endTime, "KUAIMAI_END_TIME_MISSING"), action.value);
      return;
    case "submit_query":
      exactTextElement(selectors.queryButton, "查询", matchesText)?.click();
      return;
    case "wait_for_results":
      await wait(1200);
      return;
    case "export_orders":
      exactTextElement(selectors.exportLink, "导出订单", matchesText)?.click();
      return;
    case "export_order_items":
      exactTextElement(selectors.exportLink, "导出订单明细", matchesText)?.click();
      return;
    default:
      throw Object.assign(new Error("页面动作未登记。"), { code: "EXTENSION_ACTION_NOT_REGISTERED" });
  }
}

async function runRegisteredTask(task) {
  const [{ registeredTaskRuntime }, { KUAIMAI_SELECTORS, matchesKuaimaiControlText }] = await Promise.all([registryPromise, kuaimaiPromise]);
  const runtime = registeredTaskRuntime(task);
  if (runtime.provider.id !== "kuaimai") {
    return { status: "failed", stage: "opening", errorCode: "EXTENSION_PROVIDER_NOT_IMPLEMENTED" };
  }
  const classification = runtime.provider.classifyPage(await pageProbe(KUAIMAI_SELECTORS, matchesKuaimaiControlText));
  if (classification.state !== "ready") {
    return {
      status: classification.state,
      stage: "opening",
      errorCode: classification.errorCode || "EXTENSION_PAGE_NOT_READY"
    };
  }
  try {
    for (const action of runtime.actionPlan) await runKuaimaiAction(action, KUAIMAI_SELECTORS, matchesKuaimaiControlText);
    return { status: "exporting", stage: "exporting" };
  } catch (error) {
    return {
      status: "failed",
      stage: "exporting",
      errorCode: error?.code || "EXTENSION_ACTION_FAILED"
    };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
