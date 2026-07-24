const BASE_URL = "/api/platform/v1/development-backlog";

const SAFE_MESSAGES = Object.freeze({
  AUTH_SESSION_REQUIRED: "请先使用钉钉登录。",
  BACKLOG_STORAGE_UNAVAILABLE: "研发待办数据库暂不可用。",
  BACKLOG_QUERY_FAILED: "研发待办加载失败，请稍后重试。",
  BACKLOG_WRITE_FAILED: "研发待办保存失败，请稍后重试。",
  BACKLOG_FORBIDDEN: "当前账号没有执行此操作的权限。",
  BACKLOG_NOT_FOUND: "研发待办不存在或已被移除。",
  BACKLOG_INPUT_INVALID: "请检查研发待办输入。",
  BACKLOG_MODULE_NOT_REGISTERED: "请选择已登记的研发模块。",
  BACKLOG_INVALID_TRANSITION: "当前状态不能执行此操作。",
  BACKLOG_VERSION_CONFLICT: "事项已被其他任务更新，请刷新后重试。",
  BACKLOG_SCOPE_REQUIRED: "请先明确受影响路径再认领。",
  BACKLOG_SCOPE_INVALID: "受影响路径必须是仓库相对路径。",
  BACKLOG_ACTIVE_CONFLICT: "存在范围重叠的活跃研发待办。",
  BACKLOG_BRANCH_INVALID: "分支名必须使用 codex/ 前缀。",
  BACKLOG_ACCEPTANCE_EVIDENCE_REQUIRED: "提交验收前必须填写验收证据。",
  BACKLOG_AI_DRAFT_INVALID: "AI 草稿格式无效，请重新生成。",
  AI_DISABLED: "公司 AI 尚未启用，请先前往 AI 大模型设置。",
  AI_PROVIDER_NOT_READY: "公司 AI 尚未配置，请先前往 AI 大模型设置。",
  AI_PROVIDER_SECRET_MISSING: "公司 AI 凭据不可用，请先前往 AI 大模型设置。",
  AI_PROVIDER_TIMEOUT: "AI 响应超时，请稍后重新生成。",
  AI_PROVIDER_RATE_LIMITED: "AI 请求较多，请稍后重新生成。",
  AI_PROVIDER_UNAVAILABLE: "AI 服务暂时不可用，请稍后重新生成。"
});

async function responsePayload(response, fallback) {
  const payload = await response.json().catch(() => ({}));
  if (response.ok) return payload;
  const source = payload.error || {};
  const code = String(source.code || "BACKLOG_REQUEST_FAILED");
  throw Object.assign(new Error(SAFE_MESSAGES[code] || fallback), {
    status: response.status,
    code,
    requestId: String(source.requestId || ""),
    retryable: Boolean(source.retryable),
    ...(source.details && typeof source.details === "object" ? { details: source.details } : {})
  });
}

function requestOptions(options = {}) {
  return {
    credentials: "include",
    headers: {
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {})
    },
    ...options
  };
}

export async function loadDevelopmentBacklog(filters = {}, fetchImpl = fetch, signal) {
  const search = new URLSearchParams();
  for (const key of ["status", "priority", "moduleId", "ownerId", "query"]) {
    if (filters[key]) search.set(key, filters[key]);
  }
  if (filters.includeClosed) search.set("includeClosed", "true");
  search.set("page", String(filters.page || 1));
  search.set("pageSize", String(filters.pageSize || 30));
  const response = await fetchImpl(`${BASE_URL}?${search}`, requestOptions({ signal }));
  return responsePayload(response, "研发待办加载失败，请稍后重试。");
}

export async function loadDevelopmentBacklogItem(itemId, fetchImpl = fetch, signal) {
  const response = await fetchImpl(`${BASE_URL}/${encodeURIComponent(itemId)}`, requestOptions({ signal }));
  return responsePayload(response, "研发待办详情加载失败，请稍后重试。");
}

export async function createDevelopmentBacklogItem(draft, fetchImpl = fetch) {
  const response = await fetchImpl(BASE_URL, requestOptions({
    method: "POST",
    body: JSON.stringify(draft)
  }));
  return responsePayload(response, "研发待办创建失败，请稍后重试。");
}

export async function updateDevelopmentBacklogItem(itemId, expectedVersion, patch, fetchImpl = fetch) {
  const response = await fetchImpl(`${BASE_URL}/${encodeURIComponent(itemId)}`, requestOptions({
    method: "PATCH",
    body: JSON.stringify({ expectedVersion, patch })
  }));
  return responsePayload(response, "研发待办更新失败，请稍后重试。");
}

export async function runDevelopmentBacklogAction(itemId, action, expectedVersion, input = {}, fetchImpl = fetch) {
  const response = await fetchImpl(`${BASE_URL}/${encodeURIComponent(itemId)}/actions`, requestOptions({
    method: "POST",
    body: JSON.stringify({ action, expectedVersion, ...input })
  }));
  return responsePayload(response, "研发待办状态更新失败，请稍后重试。");
}

export async function draftDevelopmentBacklog(description, fetchImpl = fetch, signal) {
  const response = await fetchImpl(`${BASE_URL}/ai-draft`, requestOptions({
    method: "POST",
    body: JSON.stringify({ description }),
    signal
  }));
  return responsePayload(response, "AI 草稿生成失败，请稍后重试。");
}

export function isAiConfigurationError(error) {
  return !error?.retryable && [
    "AI_DISABLED",
    "AI_PROVIDER_NOT_READY",
    "AI_PROVIDER_SECRET_MISSING",
    "AI_FEATURE_NOT_REGISTERED"
  ].includes(String(error?.code || ""));
}
