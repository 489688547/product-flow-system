const APP_IDS = new Set([
  "company-platform",
  "product-lifecycle",
  "supply-chain",
  "data-center",
  "ecommerce-operations",
  "brand-content",
  "people-performance"
]);
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const STATUSES = new Set(["connected", "integrating", "unavailable", "deprecated"]);
const SENSITIVE_KEY = /authorization|cookie|credential|password|secret|session|token|api[-_]?key|private[-_]?key/i;
const DEFAULT_MAX_ARRAY_ITEMS = 20;
const DEFAULT_MAX_BYTES = 100 * 1024;

function apiCatalogError(code, message) {
  return Object.assign(new Error(message), { code });
}

const normalize = value => String(value ?? "").trim();

function validExample(value) {
  return value !== undefined
    && value !== null
    && typeof value === "object"
    && !Array.isArray(value);
}

export function validateApiRegistry(input) {
  if (
    !input
    || input.version !== 1
    || !Array.isArray(input.apps)
    || !Array.isArray(input.endpoints)
  ) {
    throw apiCatalogError("API_REGISTRY_INVALID", "API 登记表格式无效。");
  }

  const appIds = new Set();
  const apps = input.apps.map(app => {
    const id = normalize(app?.id);
    const label = normalize(app?.label);
    if (!APP_IDS.has(id) || !label || appIds.has(id)) {
      throw apiCatalogError("API_REGISTRY_INVALID", "API App 登记无效。");
    }
    appIds.add(id);
    return { id, label, order: Number(app.order) || 0 };
  }).sort((left, right) => left.order - right.order);

  const endpointKeys = new Set();
  const endpointIds = new Set();
  const endpoints = input.endpoints.map(endpoint => {
    const method = normalize(endpoint?.method).toUpperCase();
    const path = normalize(endpoint?.path);
    const appId = normalize(endpoint?.appId);
    const id = normalize(endpoint?.id);
    const status = normalize(endpoint?.status);
    const contract = normalize(endpoint?.contract);
    const key = `${method} ${path}`;

    if (!id || endpointIds.has(id) || !METHODS.has(method) || !path.startsWith("/api/")) {
      throw apiCatalogError("API_REGISTRY_INVALID", "API endpoint 登记无效。");
    }
    if (!appIds.has(appId)) {
      throw apiCatalogError("API_APP_UNKNOWN", `API endpoint 使用了未知 App：${appId}`);
    }
    if (endpointKeys.has(key)) {
      throw apiCatalogError("API_ENDPOINT_DUPLICATE", `API endpoint 重复：${key}`);
    }
    if (!STATUSES.has(status) || !/^[a-z0-9-]+-v\d+\.md$/.test(contract)) {
      throw apiCatalogError("API_CONTRACT_MISSING", `API endpoint 缺少有效契约：${key}`);
    }
    if (!validExample(endpoint.requestExample) || !validExample(endpoint.responseExample)) {
      throw apiCatalogError("API_EXAMPLE_INVALID", `API endpoint 缺少结构化示例：${key}`);
    }
    if (endpoint.liveTest?.enabled && method !== "GET") {
      throw apiCatalogError("API_LIVE_TEST_FORBIDDEN", "只有 GET 接口允许安全实测。");
    }

    endpointIds.add(id);
    endpointKeys.add(key);
    return {
      ...endpoint,
      id,
      appId,
      method,
      path,
      status,
      contract,
      errors: Array.isArray(endpoint.errors) ? endpoint.errors.map(normalize).filter(Boolean) : [],
      liveTest: endpoint.liveTest?.enabled
        ? {
            enabled: true,
            query: Array.isArray(endpoint.liveTest.query)
              ? endpoint.liveTest.query.map(normalize).filter(Boolean)
              : []
          }
        : { enabled: false, query: [] }
    };
  });

  return { version: 1, apps, endpoints };
}

export function filterApiEndpoints(
  endpoints,
  { query = "", appId = "all", method = "all", status = "all" } = {}
) {
  const needle = normalize(query).toLocaleLowerCase("zh-CN");
  return endpoints.filter(endpoint => {
    if (appId !== "all" && endpoint.appId !== appId) return false;
    if (method !== "all" && endpoint.method !== method) return false;
    if (status !== "all" && endpoint.status !== status) return false;
    if (!needle) return true;
    return [
      endpoint.title,
      endpoint.summary,
      endpoint.method,
      endpoint.path,
      ...(endpoint.errors || [])
    ].join("\n").toLocaleLowerCase("zh-CN").includes(needle);
  });
}

export function buildApiLiveUrl(endpoint, params = {}) {
  if (endpoint?.method !== "GET" || endpoint?.liveTest?.enabled !== true) {
    throw apiCatalogError("API_LIVE_TEST_FORBIDDEN", "该接口不允许页面实测。");
  }
  const path = normalize(endpoint.path);
  if (!path.startsWith("/api/") || path.startsWith("//") || /[:*]/.test(path)) {
    throw apiCatalogError("API_LIVE_TEST_PATH_FORBIDDEN", "该接口不是固定同源路径。");
  }
  const allowed = new Set(endpoint.liveTest.query || []);
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (!allowed.has(key)) {
      throw apiCatalogError("API_LIVE_TEST_QUERY_FORBIDDEN", `查询字段未登记：${key}`);
    }
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      throw apiCatalogError("API_LIVE_TEST_QUERY_FORBIDDEN", `查询字段值无效：${key}`);
    }
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export function sanitizeApiPreview(
  value,
  { maxArrayItems = DEFAULT_MAX_ARRAY_ITEMS, maxBytes = DEFAULT_MAX_BYTES } = {}
) {
  let truncated = false;
  const visit = (current, key = "") => {
    if (SENSITIVE_KEY.test(key)) return "[已遮罩]";
    if (Array.isArray(current)) {
      if (current.length > maxArrayItems) truncated = true;
      return current.slice(0, maxArrayItems).map(item => visit(item));
    }
    if (current && typeof current === "object") {
      return Object.fromEntries(Object.entries(current).map(([childKey, child]) => (
        [childKey, visit(child, childKey)]
      )));
    }
    if (typeof current === "string" && current.length > 10_000) {
      truncated = true;
      return `${current.slice(0, 10_000)}…`;
    }
    return current;
  };

  const body = visit(value);
  const serialized = JSON.stringify(body);
  const encoder = new TextEncoder();
  const encoded = encoder.encode(serialized);
  if (encoded.byteLength <= maxBytes) {
    return { body, truncated };
  }
  const previewBudget = Math.max(0, Math.floor((maxBytes - 256) / 4));
  const boundedPreview = new TextDecoder().decode(encoded.slice(0, previewBudget));
  return {
    body: {
      preview: `${boundedPreview}…`,
      notice: "响应超过预览上限，已截断。"
    },
    truncated: true
  };
}
