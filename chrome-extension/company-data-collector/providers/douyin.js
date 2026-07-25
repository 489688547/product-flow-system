export const DOUYIN_ALLOWED_ORIGINS = Object.freeze([
  "https://fxg.jinritemai.com",
  "https://compass.jinritemai.com"
]);

export const STORE_DAILY_FACT_KEYS = Object.freeze([
  "transactionAmount",
  "transactionOrderCount",
  "transactionBuyerCount",
  "userPaymentAmount",
  "settlementAmount",
  "refundAmountByPaymentDate",
  "refundAmountByRefundDate",
  "refundOrderCountByPaymentDate",
  "refundOrderCountByRefundDate",
  "productExposureUsers",
  "productClickUsers"
]);

const STORE_FACT_KEY_SET = new Set(STORE_DAILY_FACT_KEYS);
const TASK_FIELDS = new Set([
  "jobId",
  "providerId",
  "storeId",
  "resourceType",
  "businessDate",
  "status",
  "attempt",
  "scheduleVersion"
]);
const CAPTURE_FIELDS = new Set([
  "kind",
  "resourceType",
  "facts",
  "pageType",
  "selectorVersion"
]);
const UNSAFE_FIELD_PATTERN = /(cookie|token|password|credential|html|pageText|absolutePath|customerName|mobile|email)/i;

function douyinError(code, message) {
  return Object.assign(new Error(message), { code });
}

function validOrigin(value) {
  try {
    return DOUYIN_ALLOWED_ORIGINS.includes(new URL(value).origin);
  } catch {
    return false;
  }
}

function assertBusinessDate(value) {
  const businessDate = String(value || "");
  const match = businessDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw douyinError("EXTENSION_TASK_BUSINESS_DATE_INVALID", "业务日期无效。");
  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    parsed.getUTCFullYear() !== Number(year)
    || parsed.getUTCMonth() !== Number(month) - 1
    || parsed.getUTCDate() !== Number(day)
  ) {
    throw douyinError("EXTENSION_TASK_BUSINESS_DATE_INVALID", "业务日期不存在。");
  }
  return businessDate;
}

function assertStableIdentifier(value, code) {
  if (!/^[-_a-zA-Z0-9]{1,128}$/.test(String(value || ""))) {
    throw douyinError(code, "抖店任务标识无效。");
  }
}

export const douyinResources = Object.freeze({
  store_daily: Object.freeze({
    providerId: "douyin-ecommerce",
    resourceType: "store_daily",
    origin: "https://compass.jinritemai.com",
    route: "/shop",
    pageType: "shop_compass_overview",
    reportVersion: "douyin-store-v1",
    scheduleVersion: "v1",
    rangeKind: "daily_fact",
    downloadExtensions: [".xlsx", ".xls", ".csv"],
    downloadFilePrefixes: ["店铺", "抖店罗盘", "罗盘"],
    downloadOrigins: ["https://compass.jinritemai.com", "https://fxg.jinritemai.com"]
  }),
  product_daily: Object.freeze({
    providerId: "douyin-ecommerce",
    resourceType: "product_daily",
    origin: "https://compass.jinritemai.com",
    route: "/shop/merchandise-traffic",
    pageType: "shop_compass_product",
    reportVersion: "douyin-product-v2",
    scheduleVersion: "v1",
    rangeKind: "daily_fact",
    downloadExtensions: [".xlsx", ".xls", ".csv"],
    downloadFilePrefixes: ["商品", "抖店罗盘", "罗盘"],
    downloadOrigins: ["https://compass.jinritemai.com", "https://fxg.jinritemai.com"]
  }),
  live_daily: Object.freeze({
    providerId: "douyin-ecommerce",
    resourceType: "live_daily",
    origin: "https://compass.jinritemai.com",
    route: "/shop/live-overview",
    pageType: "shop_compass_live",
    reportVersion: "douyin-live-v2",
    scheduleVersion: "v1",
    rangeKind: "daily_fact",
    downloadExtensions: [".xlsx", ".xls", ".csv"],
    downloadFilePrefixes: ["直播", "抖店罗盘", "罗盘"],
    downloadOrigins: ["https://compass.jinritemai.com", "https://fxg.jinritemai.com"]
  }),
  video_daily: Object.freeze({
    providerId: "douyin-ecommerce",
    resourceType: "video_daily",
    origin: "https://compass.jinritemai.com",
    route: "/shop/video/overview",
    pageType: "shop_compass_video",
    reportVersion: "douyin-video-v2",
    scheduleVersion: "v1",
    rangeKind: "daily_fact",
    downloadExtensions: [".xlsx", ".xls", ".csv"],
    downloadFilePrefixes: ["视频", "抖店罗盘", "罗盘"],
    downloadOrigins: ["https://compass.jinritemai.com", "https://fxg.jinritemai.com"]
  })
});

export function projectDouyinTask(task) {
  if (!task || typeof task !== "object" || Array.isArray(task)) {
    throw douyinError("DOUYIN_TASK_INVALID", "抖店任务格式无效。");
  }
  const unknown = Object.keys(task).filter(field => !TASK_FIELDS.has(field));
  if (unknown.length) throw douyinError("DOUYIN_TASK_UNSAFE_FIELDS", "抖店任务包含未登记字段。");
  if (task.providerId !== "douyin-ecommerce") {
    throw douyinError("DOUYIN_TASK_INVALID", "抖店任务平台无效。");
  }
  if (!douyinResources[task.resourceType]) {
    throw douyinError("DOUYIN_RESOURCE_NOT_REGISTERED", "抖店资源未登记。");
  }
  assertStableIdentifier(task.jobId, "DOUYIN_TASK_INVALID");
  assertStableIdentifier(task.storeId, "DOUYIN_TASK_INVALID");
  assertBusinessDate(task.businessDate);
  return { ...task };
}

export function classifyDouyinPage({ url = "", markers = {} } = {}) {
  if (!validOrigin(url)) {
    return { state: "blocked_origin", errorCode: "DOUYIN_ORIGIN_BLOCKED" };
  }
  if (markers.loginPage || /\/login(?:[/?#]|$)/i.test(url)) {
    return {
      state: "waiting_human",
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
      state: "waiting_human",
      errorCode: "DOUYIN_HUMAN_VERIFICATION_REQUIRED",
      safeSummary: "页面需要验证码、扫码、滑块或设备确认，请人工完成后重试。"
    };
  }
  // 店铺身份已在任务领取前通过抖店后台完成配对；罗盘新版不再稳定暴露
  // 旧版 shop-name DOM 标记，因此业务页本身加载完成即可继续采集。
  if (markers.reportPage) return { state: "ready" };
  return { state: "schema_changed", errorCode: "DOUYIN_PAGE_SCHEMA_CHANGED" };
}

export function buildDouyinTaskUrl(baseUrl, task) {
  const projected = projectDouyinTask(task);
  const resource = douyinResources[projected.resourceType];
  if (!validOrigin(baseUrl) || new URL(baseUrl).origin !== resource.origin) {
    throw douyinError("DOUYIN_ORIGIN_BLOCKED", "抖店任务地址不在登记域名内。");
  }
  return new URL(resource.route, resource.origin).href;
}

export function buildDouyinActionPlan(task) {
  const projected = projectDouyinTask(task);
  const actions = [
    { action: "apply_business_date", businessDate: projected.businessDate },
    { action: "download_official_report", resourceType: projected.resourceType }
  ];
  if (projected.resourceType === "store_daily") {
    actions.push({ action: "capture_store_fallback", businessDate: projected.businessDate });
  }
  return actions;
}

export function validateDouyinCapture(capture) {
  if (!capture || typeof capture !== "object" || Array.isArray(capture)) {
    throw douyinError("DOUYIN_CAPTURE_SCHEMA_INVALID", "店铺读数格式无效。");
  }
  const unknown = Object.keys(capture).filter(field => !CAPTURE_FIELDS.has(field));
  if (unknown.length || Object.keys(capture).some(field => UNSAFE_FIELD_PATTERN.test(field))) {
    throw douyinError("DOUYIN_CAPTURE_UNSAFE_FIELDS", "店铺读数包含不允许的字段。");
  }
  if (capture.kind !== "captured" || capture.resourceType !== "store_daily") {
    throw douyinError("DOUYIN_CAPTURE_RESOURCE_INVALID", "仅允许店铺总览安全读数。");
  }
  if (!capture.facts || typeof capture.facts !== "object" || Array.isArray(capture.facts)) {
    throw douyinError("DOUYIN_CAPTURE_SCHEMA_INVALID", "店铺读数字段无效。");
  }
  const factKeys = Object.keys(capture.facts);
  if (
    factKeys.some(key => !STORE_FACT_KEY_SET.has(key) || UNSAFE_FIELD_PATTERN.test(key))
    || factKeys.length !== STORE_DAILY_FACT_KEYS.length
  ) {
    throw douyinError("DOUYIN_CAPTURE_SCHEMA_INVALID", "店铺读数字段不完整或未登记。");
  }
  for (const key of STORE_DAILY_FACT_KEYS) {
    const value = capture.facts[key];
    if (value !== null && !Number.isFinite(value)) {
      throw douyinError("DOUYIN_CAPTURE_SCHEMA_INVALID", "店铺读数必须是数值或空值。");
    }
  }
  if (!/^[a-z0-9_-]{1,64}$/i.test(String(capture.pageType || ""))) {
    throw douyinError("DOUYIN_CAPTURE_SCHEMA_INVALID", "页面类型无效。");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(capture.selectorVersion || ""))) {
    throw douyinError("DOUYIN_CAPTURE_SCHEMA_INVALID", "选择器版本无效。");
  }
  return {
    kind: "captured",
    resourceType: "store_daily",
    facts: Object.fromEntries(STORE_DAILY_FACT_KEYS.map(key => [key, capture.facts[key]])),
    pageType: capture.pageType,
    selectorVersion: capture.selectorVersion
  };
}
