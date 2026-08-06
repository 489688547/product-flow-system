import { isAbsolute } from "node:path";

const TASK_FIELDS = new Set([
  "jobId",
  "providerId",
  "storeId",
  "storeName",
  "resourceType",
  "businessDate",
  "status",
  "attempt",
  "scheduleVersion",
  "workspace"
]);
const RESOURCES = new Set(["store_daily", "product_daily", "live_daily", "video_daily"]);
const STABLE_ID = /^[-_a-zA-Z0-9]{1,128}$/;
const LOGIN_PATH = /^\/login(?:\/|$)/i;
const VERIFICATION_TERMS = Object.freeze([
  "验证码",
  "图形验证",
  "拖动滑块",
  "滑块验证",
  "扫码登录",
  "设备验证",
  "安全验证",
  "短信验证码",
  "手机验证码"
]);

function stateError(code, message) {
  return Object.assign(new Error(message), { code });
}

function validBusinessDate(value) {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

export function validateDouyinEgoTask(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw stateError("DOUYIN_EGO_TASK_INVALID", "Ego 抖店任务格式无效。");
  }
  if (Object.keys(value).some(field => !TASK_FIELDS.has(field))) {
    throw stateError("DOUYIN_EGO_TASK_UNSAFE_FIELDS", "Ego 抖店任务包含未登记字段。");
  }
  const storeName = String(value.storeName || "").trim();
  if (
    value.providerId !== "douyin-ecommerce"
    || !STABLE_ID.test(String(value.jobId || ""))
    || !STABLE_ID.test(String(value.storeId || ""))
    || !RESOURCES.has(value.resourceType)
    || !validBusinessDate(value.businessDate)
    || !isAbsolute(String(value.workspace || ""))
    || !storeName
    || storeName.length > 120
    || /[\u0000-\u001f\u007f]/.test(storeName)
  ) {
    throw stateError("DOUYIN_EGO_TASK_INVALID", "Ego 抖店任务字段无效。");
  }
  return structuredClone(value);
}

function cleanLine(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function labelledValues(lines, labelPattern, valuePattern) {
  const values = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const combined = line.match(new RegExp(`^(?:${labelPattern})\\s*[:：]\\s*(${valuePattern})$`, "i"));
    if (combined) {
      values.push(cleanLine(combined[1]));
      continue;
    }
    if (new RegExp(`^(?:${labelPattern})\\s*[:：]?$`, "i").test(line)) {
      const next = cleanLine(lines[index + 1]);
      if (new RegExp(`^${valuePattern}$`, "i").test(next)) values.push(next);
    }
  }
  return [...new Set(values)];
}

export function parseDouyinStoreIdentityText(value) {
  const text = String(value || "");
  if (!text || text.length > 50_000 || /[\u0000\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return null;
  const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const storeIds = labelledValues(
    lines,
    "店铺\\s*ID|店铺编号|商家编号",
    "[-_a-zA-Z0-9]{1,128}"
  );
  const storeNames = labelledValues(
    lines,
    "店铺名称",
    "[^\\u0000-\\u001f\\u007f:：]{1,120}"
  );
  if (storeIds.length !== 1 || storeNames.length !== 1) return null;
  return {
    providerId: "douyin-ecommerce",
    storeId: storeIds[0],
    storeName: storeNames[0]
  };
}

export function parseDouyinStoreIdentitySnapshot(value) {
  if (typeof value === "string") return parseDouyinStoreIdentityText(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (Object.keys(value).some(field => !["visibleText", "labelledStoreIds"].includes(field))) return null;
  const visibleText = String(value.visibleText || "");
  if (
    visibleText.length > 50_000
    || /[\u0000\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(visibleText)
    || !Array.isArray(value.labelledStoreIds)
    || value.labelledStoreIds.length > 8
  ) return null;
  const storeIds = [...new Set(value.labelledStoreIds.map(cleanLine))];
  if (storeIds.length !== 1 || !STABLE_ID.test(storeIds[0])) return null;
  const visibleIdentity = parseDouyinStoreIdentityText(visibleText);
  if (visibleIdentity && visibleIdentity.storeId !== storeIds[0]) return null;
  return {
    providerId: "douyin-ecommerce",
    storeId: storeIds[0],
    ...(visibleIdentity?.storeName ? { storeName: visibleIdentity.storeName } : {})
  };
}

function result(state, errorCode, extra = {}) {
  return { state, errorCode, ...extra };
}

function isLoginSnapshot(snapshot) {
  const path = String(snapshot?.path || "");
  const title = String(snapshot?.title || "");
  const body = String(snapshot?.body || "");
  return LOGIN_PATH.test(path)
    || snapshot?.hasPassword === true
    || (path === "/" && /官网/.test(title) && body.includes("产品介绍") && body.includes("入驻"));
}

function isStillLoading(snapshot) {
  const body = String(snapshot?.body || "").trim();
  return snapshot?.readyState !== "complete"
    || snapshot?.networkIdle !== true
    || !body
    || body.includes("获取菜单失败")
    || snapshot?.loading === true;
}

export function classifyDouyinEgoSnapshot(snapshot, context = {}) {
  const body = String(snapshot?.body || "");
  if (isLoginSnapshot(snapshot)) {
    return result("login_required", "DOUYIN_LOGIN_REQUIRED");
  }
  if (snapshot?.needsHumanVerification === true || VERIFICATION_TERMS.some(term => body.includes(term))) {
    return result("human_verification", "DOUYIN_HUMAN_VERIFICATION_REQUIRED");
  }
  if (String(snapshot?.origin || "") !== "https://compass.jinritemai.com") {
    return result("unexpected_navigation", "DOUYIN_NAVIGATION_UNEXPECTED");
  }

  const expectedStoreId = String(context.expectedStoreId || "");
  const actualStoreId = String(context.actualStoreId || "");
  if (STABLE_ID.test(actualStoreId) && STABLE_ID.test(expectedStoreId) && actualStoreId !== expectedStoreId) {
    return result("store_mismatch", "DOUYIN_STORE_MISMATCH", { actualStoreId });
  }
  if (context.identityVerified !== true || actualStoreId !== expectedStoreId) {
    return result("store_identity_unavailable", "DOUYIN_STORE_IDENTITY_UNAVAILABLE");
  }

  if (isStillLoading(snapshot)) {
    const elapsedMs = Math.max(0, Number(context.elapsedMs) || 0);
    const loadTimeoutMs = Math.max(1, Number(context.loadTimeoutMs) || 45_000);
    return elapsedMs < loadTimeoutMs
      ? { state: "loading" }
      : result("load_timeout", "DOUYIN_PAGE_LOAD_TIMEOUT");
  }
  if (snapshot?.hasRegisteredResourceSentinels !== true) {
    return result("schema_changed", "DOUYIN_PAGE_SCHEMA_CHANGED");
  }
  return { state: "ready", storeId: expectedStoreId };
}
