import { jsonResponse, optionsResponse } from "../../../../dingtalk/_shared/dingtalk.js";

const COST_DEPARTMENTS = new Set(["总经办", "财务部", "供应链", "供应链部", "供应链团队", "采购部"]);
const EDIT_DEPARTMENTS = new Set(["总经办", "运营部"]);

export { jsonResponse, optionsResponse };

export function errorResponse(message, status, code, retryable = false) {
  const requestId = globalThis.crypto?.randomUUID?.() || `req_${Date.now().toString(36)}`;
  return jsonResponse({ synced: false, message, error: { code, message, requestId, retryable } }, status);
}

export function requireCatalogSession(data = {}) {
  const session = data.session;
  if (!session) {
    const error = new Error("请先使用钉钉登录。");
    error.status = 401;
    error.code = "AUTH_SESSION_REQUIRED";
    throw error;
  }
  return session;
}

export function requireCatalogEditor(session = {}) {
  const department = String(session.department || session.departmentName || "").trim();
  if (session.role === "readonly" || !EDIT_DEPARTMENTS.has(department)) {
    const error = new Error("仅总经办和运营部可维护商品主数据。");
    error.status = 403;
    error.code = "PERMISSION_WRITE_DENIED";
    throw error;
  }
}

export function canViewCatalogCost(session = {}) {
  return COST_DEPARTMENTS.has(String(session.department || session.departmentName || "").trim());
}

export function filterCatalogCosts(items = [], session = {}) {
  if (canViewCatalogCost(session)) return items;
  return items.map(item => ({
    ...item,
    skus: (item.skus || []).map(({ purchasePrice: _purchasePrice, wholesalePrice: _wholesalePrice, ...sku }) => sku)
  }));
}

export function catalogError(error, fallback = "商品主数据服务异常。") {
  return errorResponse(error?.message || fallback, error?.status || 500, error?.code || "PRODUCT_CATALOG_UNEXPECTED", Boolean(error?.retryable ?? true));
}
