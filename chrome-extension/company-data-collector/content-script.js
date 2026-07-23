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

async function salesPageProbe(provider, selectors, matchesText) {
  const bodyText = String(document.body?.innerText || "");
  const verificationTerms = ["验证码", "安全验证", "拖动滑块", "扫码验证", "设备验证"];
  const base = provider.classifyPage({
    url: location.href,
    markers: {
      loginPage: /\/login(?:[/?#]|$)/i.test(location.pathname) || Boolean(document.querySelector("input[type='password']")),
      humanVerification: verificationTerms.some(term => bodyText.includes(term))
    }
  });
  if (["waiting_login", "waiting_human", "blocked_origin"].includes(base.state)) return base;
  const ready = Boolean(document.querySelector(selectors.timeBasis))
    && Boolean(document.querySelector(selectors.startDate))
    && Boolean(document.querySelector(selectors.endDate))
    && Boolean(exactTextElement(selectors.calculateButton, "计算数据", matchesText))
    && Boolean(exactTextElement(selectors.exportButton, "导出", matchesText))
    && Boolean(exactTextElement(selectors.reportTab, "按订单商品明细", matchesText));
  return ready
    ? { state: "ready" }
    : { state: "schema_changed", errorCode: "KUAIMAI_SALES_PAGE_SCHEMA_CHANGED" };
}

async function waitForKuaimaiSalesPage(provider, selectors, matchesText) {
  const deadline = Date.now() + KUAIMAI_ORDER_PAGE_READY_TIMEOUT_MS;
  let classification;
  do {
    classification = await salesPageProbe(provider, selectors, matchesText);
    if (["ready", "waiting_login", "waiting_human", "blocked_origin"].includes(classification.state)) {
      return classification;
    }
    await wait(250);
  } while (Date.now() < deadline);
  return classification;
}

function setNativeInputValue(input, value) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new Event("blur", { bubbles: true }));
}

async function prepareKuaimaiSalesReport(action, selectors, matchesText, context) {
  const legacyButton = exactTextElement(selectors.dialogButton, "暂不，继续使用旧版", matchesText);
  if (legacyButton) {
    legacyButton.click();
    await wait(300);
  }
  const timeBasis = findRequired(selectors.timeBasis, "KUAIMAI_SALES_TIME_BASIS_MISSING");
  if (timeBasis.value !== action.timeBasis) {
    timeBasis.click();
    await wait(150);
    const option = findRequiredTextElement(
      selectors.selectOption,
      action.timeBasis,
      matchesText,
      "KUAIMAI_SALES_TIME_BASIS_OPTION_MISSING"
    );
    option.click();
    await wait(250);
  }
  const yesterday = exactTextElement(selectors.yesterdayRadio, "昨天", matchesText);
  if (yesterday) {
    yesterday.click();
    await wait(250);
  }
  const startDate = findRequired(selectors.startDate, "KUAIMAI_SALES_START_DATE_MISSING");
  const endDate = findRequired(selectors.endDate, "KUAIMAI_SALES_END_DATE_MISSING");
  if (startDate.value !== action.businessDate) setNativeInputValue(startDate, action.businessDate);
  if (endDate.value !== action.businessDate) setNativeInputValue(endDate, action.businessDate);
  await wait(250);
  const reportTab = findRequiredTextElement(
    selectors.reportTab,
    action.dimension,
    matchesText,
    "KUAIMAI_SALES_DETAIL_TAB_MISSING"
  );
  reportTab.click();
  await wait(500);
  context.expectedSalesDate = action.businessDate;
  context.expectedSalesTimeBasis = action.timeBasis;
}

function assertAppliedKuaimaiSalesRange(selectors, context) {
  const timeBasis = findRequired(selectors.timeBasis, "KUAIMAI_SALES_TIME_BASIS_MISSING");
  const startDate = findRequired(selectors.startDate, "KUAIMAI_SALES_START_DATE_MISSING");
  const endDate = findRequired(selectors.endDate, "KUAIMAI_SALES_END_DATE_MISSING");
  if (
    timeBasis.value !== context.expectedSalesTimeBasis
    || startDate.value !== context.expectedSalesDate
    || endDate.value !== context.expectedSalesDate
  ) {
    throw Object.assign(new Error("销售报表创建时间范围未生效。"), {
      code: "KUAIMAI_SALES_TIME_RANGE_NOT_APPLIED"
    });
  }
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
    case "prepare_sales_report":
      await prepareKuaimaiSalesReport(action, context.salesSelectors, matchesText, context);
      return;
    case "calculate_sales_report": {
      assertAppliedKuaimaiSalesRange(context.salesSelectors, context);
      const button = findRequiredTextElement(
        context.salesSelectors.calculateButton,
        "计算数据",
        matchesText,
        "KUAIMAI_SALES_CALCULATE_MISSING"
      );
      button.click();
      await wait(3500);
      assertAppliedKuaimaiSalesRange(context.salesSelectors, context);
      return;
    }
    case "export_sales_items": {
      const button = findRequiredTextElement(
        context.salesSelectors.exportButton,
        "导出",
        matchesText,
        "KUAIMAI_SALES_EXPORT_MISSING"
      );
      button.click();
      await wait(500);
      return;
    }
    case "confirm_sales_export": {
      const button = findRequiredTextElement(
        context.salesSelectors.dialogButton,
        "确定",
        matchesText,
        "KUAIMAI_SALES_EXPORT_CONFIRM_MISSING"
      );
      context.exportStartedAt = Date.now();
      button.click();
      await wait(800);
      return;
    }
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
  const { KUAIMAI_SELECTORS, KUAIMAI_SALES_SELECTORS, matchesKuaimaiControlText } = kuaimai;
  const runtime = registeredTaskRuntime(task);
  if (runtime.provider.id !== "kuaimai") {
    return { status: "failed", stage: "opening", errorCode: "EXTENSION_PROVIDER_NOT_IMPLEMENTED" };
  }
  const classification = task.resourceType === "sales_items"
    ? await waitForKuaimaiSalesPage(runtime.provider, KUAIMAI_SALES_SELECTORS, matchesKuaimaiControlText)
    : await waitForKuaimaiOrderPage(runtime.provider, KUAIMAI_SELECTORS, matchesKuaimaiControlText);
  if (classification.state !== "ready") {
    return {
      status: classification.state,
      stage: "opening",
      errorCode: classification.errorCode || "EXTENSION_PAGE_NOT_READY"
    };
  }
  try {
    const context = { exportStartedAt: null, kuaimai, salesSelectors: KUAIMAI_SALES_SELECTORS };
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
