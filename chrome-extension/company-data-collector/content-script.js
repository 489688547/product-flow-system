const registryPromise = import(chrome.runtime.getURL("providers/registry.js"));
const kuaimaiPromise = import(chrome.runtime.getURL("providers/kuaimai.js"));

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const KUAIMAI_ORDER_PAGE_READY_TIMEOUT_MS = 15_000;
const KUAIMAI_DOWNLOAD_CENTER_TIMEOUT_MS = 180_000;
const KUAIMAI_DOWNLOAD_CENTER_POLL_MS = 2_500;

function exactTextElement(selector, value, matchesText) {
  return Array.from(document.querySelectorAll(selector)).find(element =>
    matchesText(element.textContent, value) && element.getClientRects().length > 0
  );
}

function findRequired(selector, code) {
  const element = document.querySelector(selector);
  if (!element) throw Object.assign(new Error("页面控件不可用。"), { code });
  return element;
}

function findRequiredTextElement(selector, value, matchesText, code) {
  const element = exactTextElement(selector, value, matchesText);
  if (!element) throw Object.assign(new Error("页面控件不可用。"), { code });
  return element;
}

function assertAppliedKuaimaiRange(selectors, context) {
  const timeBasis = findRequired(selectors.timeBasis, "KUAIMAI_TIME_BASIS_MISSING");
  const startTime = findRequired(selectors.startTime, "KUAIMAI_START_TIME_MISSING");
  const endTime = findRequired(selectors.endTime, "KUAIMAI_END_TIME_MISSING");
  if (
    timeBasis.value !== context.expectedTimeBasis
    || startTime.value !== context.expectedStartTime
    || endTime.value !== context.expectedEndTime
  ) {
    throw Object.assign(new Error("创建时间范围未生效。"), {
      code: "KUAIMAI_TIME_RANGE_NOT_APPLIED"
    });
  }
}

async function openKuaimaiExportDialog({
  label,
  missingCode,
  selectors,
  matchesText
}) {
  const deadline = Date.now() + 5000;
  do {
    const confirmation = exactTextElement(
      selectors.exportConfirmButton,
      "立即导出",
      matchesText
    );
    if (confirmation) return;
    const link = exactTextElement(selectors.exportLink, label, matchesText);
    if (!link) throw Object.assign(new Error("导出入口不可用。"), { code: missingCode });
    link.click();
    await wait(500);
  } while (Date.now() < deadline);
  throw Object.assign(new Error("立即导出按钮不可用。"), {
    code: "KUAIMAI_EXPORT_CONFIRM_MISSING"
  });
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

async function waitForKuaimaiOrderPage(provider, selectors, matchesText) {
  const deadline = Date.now() + KUAIMAI_ORDER_PAGE_READY_TIMEOUT_MS;
  let classification;
  do {
    classification = provider.classifyPage(await pageProbe(selectors, matchesText));
    if (["ready", "waiting_login", "waiting_human", "blocked_origin"].includes(classification.state)) {
      return classification;
    }
    await wait(250);
  } while (Date.now() < deadline);
  return classification;
}

function readDownloadCenterRows(selectors) {
  return Array.from(document.querySelectorAll(selectors.row)).map(row => ({
    exportTime: row.querySelector(selectors.exportTime)?.textContent || "",
    content: row.querySelector(selectors.content)?.textContent || "",
    status: row.querySelector(selectors.status)?.textContent || ""
  }));
}

async function downloadFromKuaimaiCenter({
  resourceType,
  exportStartedAt,
  route,
  selectors,
  selectRow
}) {
  const downloadCenterUrl = new URL(route, location.origin).href;
  if (location.href !== downloadCenterUrl) {
    location.assign(downloadCenterUrl);
    await wait(500);
  }

  const deadline = Date.now() + KUAIMAI_DOWNLOAD_CENTER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const selection = selectRow({
      resourceType,
      startedAt: exportStartedAt,
      rows: readDownloadCenterRows(selectors)
    });
    if (selection.state === "failed") {
      throw Object.assign(new Error("快麦导出生成失败。"), { code: selection.errorCode });
    }
    if (selection.state === "ready") {
      const row = document.querySelectorAll(selectors.row)[selection.rowIndex];
      const download = row?.querySelector(selectors.download);
      if (!download) {
        throw Object.assign(new Error("快麦下载控件不可用。"), { code: "KUAIMAI_DOWNLOAD_BUTTON_MISSING" });
      }
      download.click();
      return;
    }

    const refresh = document.querySelector(selectors.refresh);
    if (refresh?.getClientRects().length > 0) refresh.click();
    await wait(KUAIMAI_DOWNLOAD_CENTER_POLL_MS);
  }
  throw Object.assign(new Error("快麦下载中心等待超时。"), { code: "KUAIMAI_DOWNLOAD_CENTER_TIMEOUT" });
}

async function runKuaimaiAction(action, selectors, matchesText, context) {
  switch (action.action) {
    case "verify_time_range": {
      context.expectedTimeBasis = action.timeBasis;
      context.expectedStartTime = action.startValue;
      context.expectedEndTime = action.endValue;
      assertAppliedKuaimaiRange(selectors, context);
      return;
    }
    case "wait_for_results":
      await wait(3000);
      assertAppliedKuaimaiRange(selectors, context);
      return;
    case "export_orders": {
      await openKuaimaiExportDialog({
        label: "导出订单",
        missingCode: "KUAIMAI_EXPORT_ORDERS_MISSING",
        selectors,
        matchesText
      });
      return;
    }
    case "export_order_items": {
      await openKuaimaiExportDialog({
        label: "导出订单明细",
        missingCode: "KUAIMAI_EXPORT_ORDER_ITEMS_MISSING",
        selectors,
        matchesText
      });
      return;
    }
    case "confirm_export": {
      const button = exactTextElement(selectors.exportConfirmButton, "立即导出", matchesText);
      if (!button) throw Object.assign(new Error("立即导出按钮不可用。"), { code: "KUAIMAI_EXPORT_CONFIRM_MISSING" });
      context.exportStartedAt = Date.now();
      button.click();
      await wait(800);
      return;
    }
    case "download_from_center": {
      if (!Number.isFinite(context.exportStartedAt)) {
        throw Object.assign(new Error("快麦导出任务缺少开始时间。"), { code: "KUAIMAI_EXPORT_START_MISSING" });
      }
      const {
        KUAIMAI_DOWNLOAD_CENTER_ROUTE,
        KUAIMAI_DOWNLOAD_CENTER_SELECTORS,
        selectKuaimaiDownloadRow
      } = context.kuaimai;
      await downloadFromKuaimaiCenter({
        resourceType: action.resourceType,
        exportStartedAt: context.exportStartedAt,
        route: KUAIMAI_DOWNLOAD_CENTER_ROUTE,
        selectors: KUAIMAI_DOWNLOAD_CENTER_SELECTORS,
        selectRow: selectKuaimaiDownloadRow
      });
      return;
    }
    default:
      throw Object.assign(new Error("页面动作未登记。"), { code: "EXTENSION_ACTION_NOT_REGISTERED" });
  }
}

async function runRegisteredTask(task) {
  const [{ registeredTaskRuntime }, kuaimai] = await Promise.all([registryPromise, kuaimaiPromise]);
  const { KUAIMAI_SELECTORS, matchesKuaimaiControlText } = kuaimai;
  const runtime = registeredTaskRuntime(task);
  if (runtime.provider.id !== "kuaimai") {
    return { status: "failed", stage: "opening", errorCode: "EXTENSION_PROVIDER_NOT_IMPLEMENTED" };
  }
  const classification = await waitForKuaimaiOrderPage(
    runtime.provider,
    KUAIMAI_SELECTORS,
    matchesKuaimaiControlText
  );
  if (classification.state !== "ready") {
    return {
      status: classification.state,
      stage: "opening",
      errorCode: classification.errorCode || "EXTENSION_PAGE_NOT_READY"
    };
  }
  try {
    const context = { exportStartedAt: null, kuaimai };
    for (const action of runtime.actionPlan) {
      await runKuaimaiAction(action, KUAIMAI_SELECTORS, matchesKuaimaiControlText, context);
    }
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
  if (message?.type === "COLLECTOR_CONTENT_SCRIPT_PROBE") {
    sendResponse({ ok: true });
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
