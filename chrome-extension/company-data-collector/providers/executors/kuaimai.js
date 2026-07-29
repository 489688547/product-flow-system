import { registeredTaskRuntime } from "../registry.js";
import * as kuaimai from "../kuaimai.js";

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const KUAIMAI_ORDER_PAGE_READY_TIMEOUT_MS = 15_000;
const KUAIMAI_TIME_RANGE_APPLY_TIMEOUT_MS = 20_000;
const KUAIMAI_TIME_RANGE_REPLAY_AFTER_MS = 4_000;
const KUAIMAI_SALES_CALCULATE_TIMEOUT_MS = 180_000;
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

async function waitForRequiredTextElement(selector, value, matchesText, code) {
  const deadline = Date.now() + 5000;
  do {
    const element = exactTextElement(selector, value, matchesText);
    if (element) return element;
    await wait(100);
  } while (Date.now() < deadline);
  throw Object.assign(new Error("页面控件不可用。"), { code });
}

function appliedKuaimaiRangeMatches(selectors, context) {
  const timeBasis = findRequired(selectors.timeBasis, "KUAIMAI_TIME_BASIS_MISSING");
  const startTime = findRequired(selectors.startTime, "KUAIMAI_START_TIME_MISSING");
  const endTime = findRequired(selectors.endTime, "KUAIMAI_END_TIME_MISSING");
  return timeBasis.value === context.expectedTimeBasis
    && startTime.value === context.expectedStartTime
    && endTime.value === context.expectedEndTime;
}

function assertAppliedKuaimaiRange(selectors, context) {
  if (appliedKuaimaiRangeMatches(selectors, context)) return;
  throw Object.assign(new Error("创建时间范围未生效。"), {
    code: "KUAIMAI_TIME_RANGE_NOT_APPLIED"
  });
}

// 补数任务连着跑时会复用同一个标签页，只换 hash。页面「就绪」的判据是控件存在，
// 而复用时控件本来就在，只是还带着上一天的值——立刻断言就会读到旧值，
// 于是每次补历史日期都报 KUAIMAI_TIME_RANGE_NOT_APPLIED，只有当天第一次
// （新开标签页，控件和值一起出现）才通过。所以必须等值追上来，而不是立刻判定。
async function waitForAppliedKuaimaiRange(selectors, context, searchHash = "") {
  const startedAt = Date.now();
  const deadline = startedAt + KUAIMAI_TIME_RANGE_APPLY_TIMEOUT_MS;
  let replayed = false;
  do {
    if (appliedKuaimaiRangeMatches(selectors, context)) return;
    // 光等不一定收敛：任务连着跑时页面偶尔就是不重新应用筛选。此时重放一次
    // hash 导航——实测这是唯一可靠的施加手段（程序化写输入框不会更新 Vue 模型，
    // 点查询提交的仍是旧筛选）。改 hash 是页内跳转，不会重载文档、不会中断本脚本。
    if (!replayed && searchHash && Date.now() - startedAt >= KUAIMAI_TIME_RANGE_REPLAY_AFTER_MS) {
      replayed = true;
      window.location.hash = searchHash;
    }
    await wait(200);
  } while (Date.now() < deadline);
  assertAppliedKuaimaiRange(selectors, context);
}

// 「导出」按钮在计算过程中始终可点，所以它不能当完成信号：实测点完「计算数据」
// 第 2 秒时遮罩还在、表格还是 0 行，导出按钮已经可点。原先固定等 3.5 秒就导出，
// 导出的是算到一半的中间结果——07-26 只落了 176 行 ¥8,498，正常是约 530 行 ¥13 万。
// 真正的完成信号是遮罩消失且表格出现数据行。
async function waitForKuaimaiSalesCalculation() {
  const deadline = Date.now() + KUAIMAI_SALES_CALCULATE_TIMEOUT_MS;
  let settled = 0;
  do {
    const masked = Array.from(document.querySelectorAll(".el-loading-mask"))
      .some(mask => mask.getClientRects().length > 0);
    const rows = document.querySelectorAll("tbody tr").length;
    // 连续两次都稳定才收工，避免正好命中两段计算之间的空档。
    if (!masked && rows > 0) {
      settled += 1;
      if (settled >= 2) return;
    } else {
      settled = 0;
    }
    await wait(500);
  } while (Date.now() < deadline);
  throw Object.assign(new Error("销售报表计算未在预期时间内完成。"), {
    code: "KUAIMAI_SALES_CALCULATE_TIMEOUT"
  });
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

function normalizeControlLabel(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function findDialogCheckbox(dialog, field) {
  const expected = normalizeControlLabel(field);
  const labels = Array.from(dialog.querySelectorAll("label"));
  const label = labels.find(candidate => normalizeControlLabel(candidate.textContent) === expected);
  if (label) {
    const nested = label.querySelector("input[type='checkbox']");
    if (nested) return { input: nested, control: label };
    const targetId = label.getAttribute("for");
    if (targetId) {
      const linked = dialog.querySelector(`#${CSS.escape(targetId)}`);
      if (linked?.matches("input[type='checkbox']")) return { input: linked, control: label };
    }
  }
  const input = Array.from(dialog.querySelectorAll("input[type='checkbox']")).find(candidate =>
    normalizeControlLabel(candidate.getAttribute("aria-label")) === expected
  );
  return input ? { input, control: input } : null;
}

async function selectKuaimaiOrderExportFields(fields, selectors, matchesText) {
  const confirmation = exactTextElement(selectors.exportConfirmButton, "立即导出", matchesText);
  const dialog = confirmation?.closest(selectors.exportDialog);
  if (!confirmation || !dialog) {
    throw Object.assign(new Error("订单导出配置弹窗不可用。"), {
      code: "KUAIMAI_EXPORT_DIALOG_MISSING"
    });
  }
  for (const field of fields || []) {
    const checkbox = findDialogCheckbox(dialog, field);
    if (!checkbox) {
      throw Object.assign(new Error("订单导出字段不可用。"), {
        code: "KUAIMAI_EXPORT_FIELD_MISSING"
      });
    }
    if (!checkbox.input.checked) {
      checkbox.control.click();
      await wait(20);
    }
    if (!checkbox.input.checked) {
      throw Object.assign(new Error("订单导出字段未生效。"), {
        code: "KUAIMAI_EXPORT_FIELD_NOT_SELECTED"
      });
    }
  }
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

function isKuaimaiProductResource(resourceType) {
  return ["products", "product_kits", "product_combinations"].includes(resourceType);
}

async function productPageProbe(provider, selectors, matchesText) {
  const bodyText = String(document.body?.innerText || "");
  const verificationTerms = ["验证码", "安全验证", "拖动滑块", "扫码验证", "设备验证"];
  return provider.classifyProductPage({
    url: location.href,
    markers: {
      loginPage: /\/login(?:[/?#]|$)/i.test(location.pathname) || Boolean(document.querySelector("input[type='password']")),
      humanVerification: verificationTerms.some(term => bodyText.includes(term)),
      productCode: Boolean(document.querySelector(selectors.productCode)),
      queryButton: Boolean(exactTextElement(selectors.queryButton, "查询", matchesText)),
      exportMenu: Boolean(exactTextElement(selectors.exportMenu, "导出", matchesText)),
      exportOption: Array.from(document.querySelectorAll(selectors.exportOption))
        .some(element => ["导出普通商品", "导出套件", "导出组合装"].some(label => matchesText(element.textContent, label)))
    }
  });
}

async function waitForKuaimaiProductPage(provider, selectors, matchesText) {
  const deadline = Date.now() + KUAIMAI_ORDER_PAGE_READY_TIMEOUT_MS;
  let classification;
  do {
    classification = await productPageProbe(provider, selectors, matchesText);
    if (["ready", "waiting_login", "waiting_human", "blocked_origin"].includes(classification.state)) {
      return classification;
    }
    await wait(250);
  } while (Date.now() < deadline);
  return classification;
}

async function inventoryPageProbe(provider, selectors, matchesText) {
  const bodyText = String(document.body?.innerText || "");
  const verificationTerms = ["验证码", "安全验证", "拖动滑块", "扫码验证", "设备验证"];
  return provider.classifyInventoryPage({
    url: location.href,
    markers: {
      loginPage: /\/login(?:[/?#]|$)/i.test(location.pathname)
        || Boolean(document.querySelector("input[type='password']"))
        || bodyText.includes("登录超时"),
      humanVerification: verificationTerms.some(term => bodyText.includes(term)),
      queryButton: Boolean(exactTextElement(selectors.queryButton, "查询", matchesText)),
      exportControl: Array.from(document.querySelectorAll(selectors.exportControl))
        .some(element => provider.matchesInventoryExportLabel(element.textContent))
    }
  });
}

async function waitForKuaimaiInventoryPage(provider, selectors, matchesText) {
  const deadline = Date.now() + KUAIMAI_ORDER_PAGE_READY_TIMEOUT_MS;
  let classification;
  do {
    classification = await inventoryPageProbe(provider, selectors, matchesText);
    if (["ready", "waiting_login", "waiting_human", "blocked_origin"].includes(classification.state)) {
      return classification;
    }
    await wait(250);
  } while (Date.now() < deadline);
  return classification;
}

async function visibleProductDialog(selectors, predicate, timeoutCode) {
  const deadline = Date.now() + KUAIMAI_ORDER_PAGE_READY_TIMEOUT_MS;
  do {
    const dialog = Array.from(document.querySelectorAll(selectors.exportDialog))
      .find(element => element.getClientRects().length > 0 && predicate(element));
    if (dialog) return dialog;
    await wait(250);
  } while (Date.now() < deadline);
  throw Object.assign(new Error("商品导出弹窗不可用。"), { code: timeoutCode });
}

function productDialogConfirm(dialog, selectors, matchesText, errorCode) {
  const button = Array.from(dialog.querySelectorAll(selectors.exportDialogButton))
    .find(element => matchesText(element.textContent, "确定") && element.getClientRects().length > 0);
  if (!button) throw Object.assign(new Error("商品导出确认按钮不可用。"), { code: errorCode });
  return button;
}

function setNativeInputValue(input, value) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new Event("blur", { bubbles: true }));
}

// 销售报表的日期框是 Element UI 只读日期选择器（readOnly=true），写 value 只改 DOM、
// 不更新 Vue 模型：实测把两端都写成 2026-07-26 后，输入框显示对了，计算请求带的却
// 仍是页面原范围 2026-07-22 ~ 2026-07-28。导出因此是七天聚合而不是目标业务日，
// 落库时被判 WEB_COLLECTION_BUSINESS_DATE_MISMATCH，或落成残缺数据。
// 唯一可靠的方式是打开日期面板点日期格。
async function closeKuaimaiPickers() {
  document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, view: window }));
  document.body.click();
  await wait(400);
}

async function pickKuaimaiDate(input, businessDate) {
  const day = String(Number(String(businessDate).slice(8, 10)));
  // 先关掉上一个面板：两个日期框各有自己的浮层，残留的旧面板会让点击落到错的那个，
  // 表现为只有开始日期生效、结束日期仍是旧值。
  await closeKuaimaiPickers();
  for (const type of ["mousedown", "mouseup", "click", "focus"]) {
    input.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  }
  input.focus();
  const deadline = Date.now() + 5000;
  do {
    const panels = Array.from(document.querySelectorAll(".el-picker-panel.el-date-picker"))
      .filter(panel => panel.getClientRects().length > 0);
    const panel = panels[panels.length - 1];
    const cell = panel && Array.from(panel.querySelectorAll("td")).find(td =>
      td.getClientRects().length > 0
      && !/prev-month|next-month|disabled/.test(td.className)
      && td.textContent.trim() === day
    );
    if (cell) {
      cell.click();
      await wait(500);
      await closeKuaimaiPickers();
      if (input.value === businessDate) return;
      break;
    }
    await wait(200);
  } while (Date.now() < deadline);
  throw Object.assign(new Error("销售报表日期未能选中。"), {
    code: "KUAIMAI_SALES_DATE_PICK_FAILED"
  });
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
  if (startDate.value !== action.businessDate) await pickKuaimaiDate(startDate, action.businessDate);
  if (endDate.value !== action.businessDate) await pickKuaimaiDate(endDate, action.businessDate);
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

function appliedKuaimaiSalesRangeMatches(selectors, context) {
  const timeBasis = findRequired(selectors.timeBasis, "KUAIMAI_SALES_TIME_BASIS_MISSING");
  const startDate = findRequired(selectors.startDate, "KUAIMAI_SALES_START_DATE_MISSING");
  const endDate = findRequired(selectors.endDate, "KUAIMAI_SALES_END_DATE_MISSING");
  return timeBasis.value === context.expectedSalesTimeBasis
    && startDate.value === context.expectedSalesDate
    && endDate.value === context.expectedSalesDate;
}

// 与订单页同因：复用标签页时控件先在、值后到，立刻断言会读到上一次的筛选。
async function assertAppliedKuaimaiSalesRange(selectors, context) {
  const deadline = Date.now() + KUAIMAI_TIME_RANGE_APPLY_TIMEOUT_MS;
  do {
    if (appliedKuaimaiSalesRangeMatches(selectors, context)) return;
    await wait(200);
  } while (Date.now() < deadline);
  throw Object.assign(new Error("销售报表创建时间范围未生效。"), {
    code: "KUAIMAI_SALES_TIME_RANGE_NOT_APPLIED"
  });
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
      // 下载链接是 <a href="javascript:void(0)">：点击会让浏览器同时尝试跳转到这个
      // javascript: URL，被页面 CSP 拦下并记一条扩展错误。文件确实下载得到，功能
      // 没问题，但每下载一次就攒一条噪音，真正的故障会被淹掉（错误页上几十条全是
      // 这一条）。挡掉默认跳转即可——preventDefault 只阻止默认行为，页面自己的
      // 点击处理器照常执行。
      const suppressNavigation = event => event.preventDefault();
      download.addEventListener("click", suppressNavigation);
      try {
        download.click();
      } finally {
        download.removeEventListener("click", suppressNavigation);
      }
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
    case "query_inventory": {
      const button = findRequiredTextElement(
        context.inventorySelectors.queryButton,
        "查询",
        matchesText,
        "KUAIMAI_INVENTORY_QUERY_MISSING"
      );
      button.click();
      await wait(1800);
      return;
    }
    case "export_inventory_snapshot": {
      const inventorySelectors = context.inventorySelectors;
      const exportControl = Array.from(document.querySelectorAll(inventorySelectors.exportControl))
        .find(element =>
          element.getClientRects().length > 0
          && context.kuaimai.matchesKuaimaiInventoryExportLabel(element.textContent)
        );
      if (!exportControl) {
        throw Object.assign(new Error("库存官方导出入口不可用。"), {
          code: "KUAIMAI_INVENTORY_EXPORT_MISSING"
        });
      }
      const exportTrigger = exportControl.closest(inventorySelectors.exportTrigger) || exportControl;
      exportTrigger.dispatchEvent(new MouseEvent("mouseenter", {
        bubbles: false,
        cancelable: true,
        view: window
      }));
      exportControl.dispatchEvent(new MouseEvent("mouseenter", {
        bubbles: false,
        cancelable: true,
        view: window
      }));
      exportControl.dispatchEvent(new MouseEvent("mouseover", {
        bubbles: true,
        cancelable: true,
        view: window
      }));
      exportControl.click();
      const exportOption = await waitForRequiredTextElement(
        inventorySelectors.exportOption,
        kuaimai.KUAIMAI_INVENTORY_EXPORT_OPTION,
        matchesText,
        "KUAIMAI_INVENTORY_EXPORT_OPTION_MISSING"
      );
      context.exportStartedAt = Date.now();
      exportOption.click();
      await wait(500);
      return;
    }
    case "confirm_inventory_export": {
      const inventorySelectors = context.inventorySelectors;
      const dialogs = Array.from(document.querySelectorAll(inventorySelectors.exportDialog))
        .filter(element => element.getClientRects().length > 0);
      if (!dialogs.length) return;
      const labels = ["立即导出", "确定", "导出"];
      const confirmation = dialogs
        .flatMap(dialog => Array.from(dialog.querySelectorAll(inventorySelectors.exportDialogButton)))
        .find(element =>
          element.getClientRects().length > 0
          && labels.some(label => matchesText(element.value || element.textContent, label))
        );
      if (!confirmation) {
        throw Object.assign(new Error("库存导出确认按钮不可用。"), {
          code: "KUAIMAI_INVENTORY_EXPORT_CONFIRM_MISSING"
        });
      }
      confirmation.click();
      await wait(800);
      return;
    }
    case "export_product_snapshot": {
      const productSelectors = context.productSelectors;
      const menu = findRequiredTextElement(
        productSelectors.exportMenu,
        "导出",
        matchesText,
        "KUAIMAI_PRODUCT_EXPORT_MENU_MISSING"
      );
      menu.click();
      await wait(150);
      const option = findRequiredTextElement(
        productSelectors.exportOption,
        action.exportLabel,
        matchesText,
        "KUAIMAI_PRODUCT_EXPORT_OPTION_MISSING"
      );
      option.click();
      await wait(500);
      const dialog = Array.from(document.querySelectorAll(productSelectors.exportDialog))
        .find(element => element.getClientRects().length > 0 && String(element.textContent || "").includes("选择导出格式"));
      if (!dialog) {
        throw Object.assign(new Error("商品导出格式弹窗不可用。"), { code: "KUAIMAI_PRODUCT_EXPORT_DIALOG_MISSING" });
      }
      const format = dialog.querySelector(`${productSelectors.exportFormat}[value='${action.formatValue}']`);
      if (!format) {
        throw Object.assign(new Error("商品导出格式不可用。"), { code: "KUAIMAI_PRODUCT_EXPORT_FORMAT_MISSING" });
      }
      (format.closest("label") || format).click();
      await wait(100);
      const confirm = Array.from(dialog.querySelectorAll(productSelectors.exportDialogButton))
        .find(element => matchesText(element.textContent, "确定") && element.getClientRects().length > 0);
      if (!confirm) {
        throw Object.assign(new Error("商品导出确认按钮不可用。"), { code: "KUAIMAI_PRODUCT_EXPORT_CONFIRM_MISSING" });
      }
      confirm.click();
      await wait(800);
      return;
    }
    case "confirm_product_fields": {
      const productSelectors = context.productSelectors;
      const dialog = await visibleProductDialog(
        productSelectors,
        element => element.querySelectorAll("input[type='checkbox']").length > 0,
        "KUAIMAI_PRODUCT_FIELDS_DIALOG_MISSING"
      );
      productDialogConfirm(
        dialog,
        productSelectors,
        matchesText,
        "KUAIMAI_PRODUCT_FIELDS_CONFIRM_MISSING"
      ).click();
      await wait(500);
      return;
    }
    case "confirm_product_export": {
      const productSelectors = context.productSelectors;
      const dialog = await visibleProductDialog(
        productSelectors,
        element => /导出过程中|确定要导出/i.test(String(element.textContent || ""))
          && !String(element.textContent || "").includes("选择导出格式"),
        "KUAIMAI_PRODUCT_FINAL_CONFIRM_MISSING"
      );
      context.exportStartedAt = Date.now();
      productDialogConfirm(
        dialog,
        productSelectors,
        matchesText,
        "KUAIMAI_PRODUCT_FINAL_CONFIRM_MISSING"
      ).click();
      await wait(800);
      return;
    }
    case "prepare_sales_report":
      await prepareKuaimaiSalesReport(action, context.salesSelectors, matchesText, context);
      return;
    case "calculate_sales_report": {
      await assertAppliedKuaimaiSalesRange(context.salesSelectors, context);
      const button = findRequiredTextElement(
        context.salesSelectors.calculateButton,
        "计算数据",
        matchesText,
        "KUAIMAI_SALES_CALCULATE_MISSING"
      );
      button.click();
      await waitForKuaimaiSalesCalculation();
      await assertAppliedKuaimaiSalesRange(context.salesSelectors, context);
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
      context.searchHash = action.searchHash || "";
      await waitForAppliedKuaimaiRange(selectors, context, context.searchHash);
      return;
    }
    case "wait_for_results":
      await wait(3000);
      // 结果加载完仍要复核一次：中途若被别的筛选覆盖，导出的就不是目标业务日。
      await waitForAppliedKuaimaiRange(selectors, context, context.searchHash || "");
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
    case "select_order_export_fields":
      await selectKuaimaiOrderExportFields(action.fields, selectors, matchesText);
      return;
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

export async function executeKuaimaiTask(task) {
  const {
    KUAIMAI_INVENTORY_SELECTORS,
    KUAIMAI_PRODUCT_SELECTORS,
    KUAIMAI_SELECTORS,
    KUAIMAI_SALES_SELECTORS,
    matchesKuaimaiControlText
  } = kuaimai;
  const runtime = registeredTaskRuntime(task);
  if (runtime.provider.id !== "kuaimai") {
    return { status: "failed", stage: "opening", errorCode: "EXTENSION_PROVIDER_NOT_IMPLEMENTED" };
  }
  const classification = task.resourceType === "sales_items"
    ? await waitForKuaimaiSalesPage(runtime.provider, KUAIMAI_SALES_SELECTORS, matchesKuaimaiControlText)
    : isKuaimaiProductResource(task.resourceType)
      ? await waitForKuaimaiProductPage(runtime.provider, KUAIMAI_PRODUCT_SELECTORS, matchesKuaimaiControlText)
      : task.resourceType === "inventory"
        ? await waitForKuaimaiInventoryPage(runtime.provider, KUAIMAI_INVENTORY_SELECTORS, matchesKuaimaiControlText)
        : await waitForKuaimaiOrderPage(runtime.provider, KUAIMAI_SELECTORS, matchesKuaimaiControlText);
  if (classification.state !== "ready") {
    return {
      status: classification.state,
      stage: "opening",
      errorCode: classification.errorCode || "EXTENSION_PAGE_NOT_READY"
    };
  }
  try {
    const context = {
      exportStartedAt: null,
      inventorySelectors: KUAIMAI_INVENTORY_SELECTORS,
      kuaimai,
      productSelectors: KUAIMAI_PRODUCT_SELECTORS,
      salesSelectors: KUAIMAI_SALES_SELECTORS
    };
    for (const action of runtime.actionPlan) {
      await runKuaimaiAction(action, KUAIMAI_SELECTORS, matchesKuaimaiControlText, context);
    }
    // 回传导出点击时间，service worker 只接受这之后创建的下载文件。
    return { status: "exporting", stage: "exporting", exportStartedAt: context.exportStartedAt || null };
  } catch (error) {
    return {
      status: "failed",
      stage: "exporting",
      errorCode: error?.code || "EXTENSION_ACTION_FAILED"
    };
  }
}
