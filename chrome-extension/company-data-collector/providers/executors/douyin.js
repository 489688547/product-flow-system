import {
  STORE_DAILY_FACT_KEYS,
  classifyDouyinPage,
  douyinResources,
  projectDouyinTask,
  validateDouyinCapture
} from "../douyin.js";

const SELECTOR_VERSION = "2026-07-24";
const WAIT_AFTER_ACTION_MS = 600;
const WAIT_AFTER_DATE_MS = 3_000;
const YESTERDAY_PRESET_LABELS = Object.freeze(["近1天", "昨天", "昨日"]);
const STORE_MANAGEMENT_PATH = "/ffa/grs-new/qualification/common-tools";
const HUMAN_TERMS = Object.freeze({
  captcha: ["验证码", "图形验证"],
  slider: ["拖动滑块", "滑块验证"],
  scan: ["扫码登录", "请使用抖音扫码"],
  deviceVerification: ["设备验证", "安全验证", "新设备"],
  smsVerification: ["短信验证码", "手机验证码"]
});
const STORE_IDENTITY_SELECTORS = Object.freeze([
  "[data-e2e='shop-name']",
  "[data-testid='shop-name']",
  ".shop-name",
  "[class*='shop-name']",
  "[class*='shopName']",
  "[class*='userName']"
]);
const REPORT_BUTTON_LABELS = Object.freeze([
  "下载报表",
  "导出数据",
  "下载数据",
  "下载明细",
  "导出"
]);
const STORE_METRIC_LABELS = Object.freeze({
  transactionAmount: ["成交金额", "支付GMV"],
  transactionOrderCount: ["成交订单数", "支付订单数"],
  transactionBuyerCount: ["成交人数", "支付人数"],
  userPaymentAmount: ["用户实际支付金额", "用户支付金额"],
  settlementAmount: ["结算金额"],
  refundAmountByPaymentDate: ["支付口径退款金额", "退款金额（支付时间）", "退款金额（支付日期）"],
  refundAmountByRefundDate: ["退款口径退款金额", "退款金额（退款时间）", "退款金额（退款日期）"],
  refundOrderCountByPaymentDate: ["支付口径退款订单数", "退款订单数（支付时间）", "退款订单数（支付日期）"],
  refundOrderCountByRefundDate: ["退款口径退款订单数", "退款订单数（退款时间）", "退款订单数（退款日期）"],
  productExposureUsers: ["商品曝光人数", "商品曝光用户数"],
  productClickUsers: ["商品点击人数", "商品点击用户数"]
});

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function visible(element) {
  return Boolean(element && element.getClientRects().length > 0);
}

function normalizedText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function exactVisibleText(labels, selector = "button, [role='button'], a") {
  const allowed = new Set(labels.map(normalizedText));
  return Array.from(document.querySelectorAll(selector))
    .find(element => visible(element) && allowed.has(normalizedText(element.textContent)));
}

export function isDouyinYesterdayPresetSelected({ label = "", selected = false } = {}) {
  return selected === true && YESTERDAY_PRESET_LABELS.includes(normalizedText(label));
}

function yesterdayPresetSelectionApplied() {
  return Array.from(document.querySelectorAll(
    "[role='tab'][aria-selected='true'], button[aria-pressed='true'], [role='button'][aria-pressed='true']"
  )).some(element => isDouyinYesterdayPresetSelected({
    label: element.textContent,
    selected: true
  }));
}

function bodyHasAny(terms) {
  const bodyText = normalizedText(document.body?.innerText);
  return terms.some(term => bodyText.includes(term));
}

function pageMarkers() {
  const bodyText = normalizedText(document.body?.innerText);
  const datePresetVisible = Array.from(document.querySelectorAll(
    "[role='tab'], button, [role='button'], label"
  )).some(element => (
    visible(element)
    && ["实时", ...YESTERDAY_PRESET_LABELS, "近7天", "近30天", "自定义"]
      .includes(normalizedText(element.textContent))
  ));
  const dateInputVisible = Array.from(document.querySelectorAll(
    "input[placeholder*='日期'], input[placeholder*='开始时间'], input[placeholder*='结束时间']"
  )).some(visible);
  const markers = {
    loginPage: /\/login(?:[/?#]|$)/i.test(location.pathname)
      || Boolean(document.querySelector("input[type='password']")),
    reportPage: location.origin === "https://compass.jinritemai.com"
      && (datePresetVisible || dateInputVisible),
    storeIdentity: STORE_IDENTITY_SELECTORS.some(selector => visible(document.querySelector(selector)))
  };
  for (const [marker, terms] of Object.entries(HUMAN_TERMS)) {
    markers[marker] = bodyHasAny(terms);
  }
  return markers;
}

export async function waitForDouyinPageClassification({
  read,
  waitImpl = wait,
  timeoutMs = 30_000,
  pollMs = 250
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let classification = read();
  while (classification?.state === "schema_changed" && Date.now() < deadline) {
    await waitImpl(pollMs);
    classification = read();
  }
  return classification;
}

function setNativeInputValue(input, value) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new Event("blur", { bubbles: true }));
}

function shanghaiYesterday() {
  const shanghai = new Date(Date.now() + 8 * 60 * 60 * 1000);
  shanghai.setUTCDate(shanghai.getUTCDate() - 1);
  return shanghai.toISOString().slice(0, 10);
}

async function applyBusinessDate(businessDate) {
  if (businessDate === shanghaiYesterday()) {
    const yesterday = exactVisibleText(
      YESTERDAY_PRESET_LABELS,
      "[role='tab'], button, [role='button'], label, span"
    );
    if (yesterday) {
      const clickTarget = yesterday.closest("[role='tab'], button, [role='button'], label") || yesterday;
      clickTarget.click();
      await wait(WAIT_AFTER_DATE_MS);
      if (yesterdayPresetSelectionApplied()) return;
      throw Object.assign(new Error("抖店报表日期未切换到昨日。"), {
        code: "DOUYIN_DATE_RANGE_NOT_APPLIED"
      });
    }
  }

  const dateInputs = Array.from(document.querySelectorAll(
    "input[placeholder*='日期'], input[placeholder*='开始时间'], input[placeholder*='结束时间']"
  )).filter(visible);
  if (!dateInputs.length) {
    throw Object.assign(new Error("抖店报表日期控件不可用。"), {
      code: "DOUYIN_DATE_CONTROL_MISSING"
    });
  }
  for (const input of dateInputs.slice(0, 2)) setNativeInputValue(input, businessDate);
  await wait(WAIT_AFTER_DATE_MS);
  if (dateInputs.slice(0, 2).some(input => !String(input.value || "").includes(businessDate))) {
    throw Object.assign(new Error("抖店报表日期未生效。"), {
      code: "DOUYIN_DATE_RANGE_NOT_APPLIED"
    });
  }
}

export function parseVisibleNumber(value) {
  const text = normalizedText(value).replace(/[¥￥,%]/g, "").replace(/,/g, "");
  if (!text || text === "--" || text === "-") return null;
  const match = text.match(/(-?\d+(?:\.\d+)?)\s*(万|亿)?/);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return null;
  if (match[2] === "亿") return number * 100_000_000;
  if (match[2] === "万") return number * 10_000;
  return number;
}

export function parseDouyinComparisonNumber(value, comparisonLabel) {
  const text = normalizedText(value);
  const label = normalizedText(comparisonLabel);
  const index = label ? text.indexOf(label) : -1;
  return index >= 0 ? parseVisibleNumber(text.slice(index + label.length)) : null;
}

export function parseDouyinStoreIdentityText(value) {
  const lines = String(value || "")
    .split(/\r?\n/)
    .map(normalizedText)
    .filter(Boolean);
  const idIndex = lines.findIndex(line => /店铺ID\s*[:：]\s*[-_a-zA-Z0-9]{1,128}/.test(line));
  if (idIndex < 0) return null;
  const storeId = lines[idIndex].match(/店铺ID\s*[:：]\s*([-_a-zA-Z0-9]{1,128})/)?.[1] || "";
  const suffix = /(旗舰店|专营店|专卖店|企业店|个人店|官方店)$/;
  const storeName = lines
    .slice(Math.max(0, idIndex - 8), idIndex)
    .reverse()
    .find(line => suffix.test(line) && line.length <= 120);
  if (!storeId || !storeName) return null;
  return {
    providerId: "douyin-ecommerce",
    storeId,
    storeName
  };
}

export function discoverDouyinStoreIdentity() {
  if (location.origin !== "https://fxg.jinritemai.com") {
    return {
      kind: "failed",
      errorCode: "DOUYIN_ORIGIN_BLOCKED",
      safeSummary: "店铺识别只允许在抖店后台执行。"
    };
  }
  const markers = pageMarkers();
  if (markers.loginPage) {
    return {
      kind: "waiting_human",
      errorCode: "DOUYIN_LOGIN_REQUIRED",
      safeSummary: "请在公司 Chrome 登录抖店后重试。"
    };
  }
  if (
    markers.captcha
    || markers.slider
    || markers.scan
    || markers.deviceVerification
    || markers.smsVerification
  ) {
    return {
      kind: "waiting_human",
      errorCode: "DOUYIN_HUMAN_VERIFICATION_REQUIRED",
      safeSummary: "请在公司 Chrome 完成人工验证后重试。"
    };
  }
  if (location.pathname !== STORE_MANAGEMENT_PATH) {
    return {
      kind: "failed",
      errorCode: "DOUYIN_STORE_IDENTITY_PAGE_REQUIRED",
      safeSummary: "请打开抖店店铺管理页面后重试。"
    };
  }
  const identity = parseDouyinStoreIdentityText(document.body?.innerText);
  return identity
    ? { kind: "store_identity", ...identity }
    : {
      kind: "failed",
      errorCode: "DOUYIN_STORE_IDENTITY_MISSING",
      safeSummary: "抖店店铺管理页未识别到稳定店铺身份。"
    };
}

function selectedDatePresetLabel() {
  const selected = Array.from(document.querySelectorAll(
    "[role='tab'][aria-selected='true'], button[aria-pressed='true'], [role='button'][aria-pressed='true']"
  )).find(element => (
    visible(element)
    && ["实时", ...YESTERDAY_PRESET_LABELS, "近7天", "近30天", "自定义"]
      .includes(normalizedText(element.textContent))
  ));
  return normalizedText(selected?.textContent);
}

function metricByRegisteredKey(key, { comparisonLabel = "" } = {}) {
  const registered = document.querySelector(`[data-metric-key='${key}'], [data-e2e-metric='${key}']`);
  if (visible(registered)) {
    return comparisonLabel
      ? parseDouyinComparisonNumber(registered.textContent, comparisonLabel)
      : parseVisibleNumber(registered.textContent);
  }

  const labels = STORE_METRIC_LABELS[key] || [];
  const cards = Array.from(document.querySelectorAll(
    "[data-e2e*='metric'], [class*='data-card-wrapper'], [class*='metric'], [class*='indicator']"
  )).filter(visible);
  for (const card of cards) {
    const text = normalizedText(card.textContent);
    const label = labels.find(candidate => text.includes(candidate));
    if (!label) continue;
    const metricText = text.replace(label, "");
    const value = comparisonLabel
      ? parseDouyinComparisonNumber(metricText, comparisonLabel)
      : parseVisibleNumber(metricText);
    if (value !== null) return value;
  }
  return null;
}

function captureStoreOverview(resource, options = {}) {
  const facts = Object.fromEntries(
    STORE_DAILY_FACT_KEYS.map(key => [key, metricByRegisteredKey(key, options)])
  );
  if (Object.values(facts).every(value => value === null)) {
    throw Object.assign(new Error("店铺总览指标结构已变化。"), {
      code: "DOUYIN_STORE_CAPTURE_SCHEMA_CHANGED"
    });
  }
  return validateDouyinCapture({
    kind: "captured",
    resourceType: "store_daily",
    facts,
    pageType: resource.pageType,
    selectorVersion: SELECTOR_VERSION
  });
}

function storeOverviewMetricsReady() {
  return metricByRegisteredKey("transactionAmount") !== null;
}

async function clickOfficialReport(resourceType) {
  const buttons = Array.from(document.querySelectorAll("button, [role='button'], a"))
    .filter(element => (
      visible(element)
      && REPORT_BUTTON_LABELS.includes(normalizedText(element.textContent))
    ));
  const button = resourceType === "video_daily"
    ? buttons.find(element => normalizedText(element.parentElement?.parentElement?.textContent).includes("短视频明细"))
    : buttons[0];
  if (!button) return false;
  button.click();
  await wait(WAIT_AFTER_ACTION_MS);
  return true;
}

export async function executeDouyinTask(task) {
  const projected = projectDouyinTask(task);
  const resource = douyinResources[projected.resourceType];
  const classification = await waitForDouyinPageClassification({
    read: () => {
      const current = classifyDouyinPage({ url: location.href, markers: pageMarkers() });
      if (
        current.state === "ready"
        && projected.resourceType === "store_daily"
        && !storeOverviewMetricsReady()
      ) {
        return { state: "schema_changed", errorCode: "DOUYIN_STORE_CAPTURE_SCHEMA_CHANGED" };
      }
      return current;
    }
  });
  if (classification.state !== "ready") {
    return {
      kind: classification.state === "waiting_human" ? "waiting_human" : "failed",
      status: classification.state,
      stage: "opening",
      errorCode: classification.errorCode || "DOUYIN_PAGE_NOT_READY",
      ...(classification.safeSummary ? { safeSummary: classification.safeSummary } : {})
    };
  }

  try {
    if (
      projected.resourceType === "store_daily"
      && projected.businessDate === shanghaiYesterday()
      && selectedDatePresetLabel() === "实时"
    ) {
      return {
        ...captureStoreOverview(resource, { comparisonLabel: "昨日" }),
        status: "captured",
        stage: "collecting"
      };
    }
    await applyBusinessDate(projected.businessDate);
    const downloadStarted = await clickOfficialReport(projected.resourceType);
    if (downloadStarted) {
      return {
        kind: "downloaded",
        status: "exporting",
        stage: "exporting",
        pageType: resource.pageType,
        reportVersion: resource.reportVersion
      };
    }
    if (projected.resourceType === "store_daily") {
      return {
        ...captureStoreOverview(resource),
        status: "captured",
        stage: "collecting"
      };
    }
    return {
      kind: "failed",
      status: "failed",
      stage: "exporting",
      errorCode: "DOUYIN_OFFICIAL_REPORT_BUTTON_MISSING"
    };
  } catch (error) {
    return {
      kind: "failed",
      status: "failed",
      stage: "exporting",
      errorCode: error?.code || "DOUYIN_ACTION_FAILED"
    };
  }
}
