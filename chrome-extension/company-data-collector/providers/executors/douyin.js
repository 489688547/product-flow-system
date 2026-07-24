import {
  STORE_DAILY_FACT_KEYS,
  classifyDouyinPage,
  douyinResources,
  projectDouyinTask,
  validateDouyinCapture
} from "../douyin.js";

const SELECTOR_VERSION = "2026-07-24";
const WAIT_AFTER_ACTION_MS = 600;
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
  "[class*='shopName']"
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
  refundAmountByPaymentDate: ["支付口径退款金额", "退款金额（支付日期）"],
  refundAmountByRefundDate: ["退款口径退款金额", "退款金额（退款日期）"],
  refundOrderCountByPaymentDate: ["支付口径退款订单数", "退款订单数（支付日期）"],
  refundOrderCountByRefundDate: ["退款口径退款订单数", "退款订单数（退款日期）"],
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

function bodyHasAny(terms) {
  const bodyText = normalizedText(document.body?.innerText);
  return terms.some(term => bodyText.includes(term));
}

function pageMarkers() {
  const bodyText = normalizedText(document.body?.innerText);
  const markers = {
    loginPage: /\/login(?:[/?#]|$)/i.test(location.pathname)
      || Boolean(document.querySelector("input[type='password']")),
    reportPage: location.origin === "https://compass.jinritemai.com"
      && (bodyText.includes("电商罗盘") || bodyText.includes("抖店罗盘") || bodyText.includes("数据")),
    storeIdentity: STORE_IDENTITY_SELECTORS.some(selector => visible(document.querySelector(selector)))
  };
  for (const [marker, terms] of Object.entries(HUMAN_TERMS)) {
    markers[marker] = bodyHasAny(terms);
  }
  return markers;
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
    const yesterday = exactVisibleText(["昨天", "昨日"], "button, [role='button'], label, span");
    if (yesterday) {
      yesterday.click();
      await wait(WAIT_AFTER_ACTION_MS);
      return;
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
  await wait(WAIT_AFTER_ACTION_MS);
  if (dateInputs.slice(0, 2).some(input => !String(input.value || "").includes(businessDate))) {
    throw Object.assign(new Error("抖店报表日期未生效。"), {
      code: "DOUYIN_DATE_RANGE_NOT_APPLIED"
    });
  }
}

function parseVisibleNumber(value) {
  const text = normalizedText(value).replace(/[¥￥,%]/g, "").replace(/,/g, "");
  if (!text || text === "--" || text === "-") return null;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  if (!Number.isFinite(number)) return null;
  if (text.includes("亿")) return number * 100_000_000;
  if (text.includes("万")) return number * 10_000;
  return number;
}

function metricByRegisteredKey(key) {
  const registered = document.querySelector(`[data-metric-key='${key}'], [data-e2e-metric='${key}']`);
  if (visible(registered)) return parseVisibleNumber(registered.textContent);

  const labels = STORE_METRIC_LABELS[key] || [];
  const cards = Array.from(document.querySelectorAll(
    "[data-e2e*='metric'], [class*='metric'], [class*='card'], [class*='indicator']"
  )).filter(visible);
  const card = cards.find(candidate => labels.some(label => normalizedText(candidate.textContent).includes(label)));
  return card ? parseVisibleNumber(card.textContent.replace(labels.find(label =>
    normalizedText(card.textContent).includes(label)
  ) || "", "")) : null;
}

function captureStoreOverview(resource) {
  const facts = Object.fromEntries(STORE_DAILY_FACT_KEYS.map(key => [key, metricByRegisteredKey(key)]));
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

async function clickOfficialReport(resourceType) {
  const button = exactVisibleText(REPORT_BUTTON_LABELS);
  if (!button) return false;
  button.click();
  await wait(WAIT_AFTER_ACTION_MS);
  return true;
}

export async function executeDouyinTask(task) {
  const projected = projectDouyinTask(task);
  const resource = douyinResources[projected.resourceType];
  const classification = classifyDouyinPage({ url: location.href, markers: pageMarkers() });
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
