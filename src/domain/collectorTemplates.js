const TEMPLATE_FIELDS = new Set([
  "templateId",
  "version",
  "mode",
  "providerId",
  "profileId",
  "timeoutSeconds",
  "limits",
  "steps",
  "status"
]);
const LIMIT_FIELDS = new Set([
  "maxOutputBytes",
  "maxChildProcesses",
  "maxLoopIterations",
  "maxFiles"
]);
const EDITABLE_FIELDS = new Set([
  "mode",
  "providerId",
  "profileId",
  "timeoutSeconds",
  "limits",
  "steps"
]);
const MODES = new Set(["formal", "experimental"]);
const STATUSES = new Set(["draft", "published", "archived"]);
const EDITOR_ROLES = new Set(["executive", "data_admin"]);
const STEP_TYPES = new Set([
  "browser.open",
  "browser.wait",
  "browser.click",
  "browser.javascript",
  "browser.download",
  "local.python",
  "local.command",
  "file.parse",
  "flow.condition",
  "flow.loop",
  "flow.setVariable",
  "assert.page",
  "assert.store",
  "assert.businessDate",
  "assert.schema"
]);
const FREE_EXECUTION_TYPES = new Set([
  "browser.javascript",
  "local.python",
  "local.command"
]);
const SENSITIVE_SOURCE = /document\s*\.\s*cookie|localStorage|sessionStorage|authorization|password|access[_-]?token|secret/i;
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const SAFE_VARIABLE = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;
const MAX_TEMPLATE_STEPS = 200;

function collectorError(code, message) {
  return Object.assign(new Error(message), { code });
}

function onlyFields(value, fields, code = "COLLECTOR_TEMPLATE_FIELD_NOT_ALLOWED") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw collectorError("COLLECTOR_TEMPLATE_INVALID", "采集模板结构无效。");
  }
  if (Object.keys(value).some(key => !fields.has(key))) {
    throw collectorError(code, "采集模板包含未登记字段。");
  }
}

function text(value, label, pattern = SAFE_ID) {
  const normalized = String(value || "").trim();
  if (!pattern.test(normalized)) {
    throw collectorError("COLLECTOR_TEMPLATE_INVALID", `采集模板${label}无效。`);
  }
  return normalized;
}

function integer(value, label, { min, max }) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < min || normalized > max) {
    throw collectorError("COLLECTOR_TEMPLATE_INVALID", `采集模板${label}无效。`);
  }
  return normalized;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function normalizeStringArray(value, label, { allowEmpty = true } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.length > 100) {
    throw collectorError("COLLECTOR_TEMPLATE_INVALID", `采集模板${label}无效。`);
  }
  return value.map(item => {
    const normalized = String(item);
    if (normalized.length > 2_000 || SENSITIVE_SOURCE.test(normalized)) {
      throw collectorError("COLLECTOR_TEMPLATE_SENSITIVE_ACCESS", `采集模板${label}包含敏感访问。`);
    }
    return normalized;
  });
}

function normalizeUrl(value, allowedOrigins) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw collectorError("COLLECTOR_TEMPLATE_INVALID", "采集模板页面地址无效。");
  }
  if (url.protocol !== "https:" || !allowedOrigins.has(url.origin)) {
    throw collectorError("COLLECTOR_TEMPLATE_ORIGIN_NOT_ALLOWED", "采集模板页面来源未登记。");
  }
  url.username = "";
  url.password = "";
  return url.toString();
}

function normalizeLimits(value) {
  onlyFields(value, LIMIT_FIELDS);
  return {
    maxOutputBytes: integer(value.maxOutputBytes, "最大输出", { min: 1_024, max: 10_485_760 }),
    maxChildProcesses: integer(value.maxChildProcesses, "最大子进程数", { min: 1, max: 16 }),
    maxLoopIterations: integer(value.maxLoopIterations, "最大循环次数", { min: 1, max: 10_000 }),
    maxFiles: integer(value.maxFiles, "最大文件数", { min: 1, max: 1_000 })
  };
}

function stepFields(type) {
  const common = ["id", "type", "timeoutSeconds", "retry"];
  const byType = {
    "browser.open": ["url"],
    "browser.wait": ["milliseconds", "selectors"],
    "browser.click": ["selectors"],
    "browser.javascript": ["code"],
    "browser.download": ["selectors", "filePattern"],
    "local.python": ["script", "args"],
    "local.command": ["command", "shell"],
    "file.parse": ["parser", "input"],
    "flow.condition": ["when", "then", "else"],
    "flow.loop": ["items", "itemVariable", "maxIterations", "steps"],
    "flow.setVariable": ["name", "value"],
    "assert.page": ["pageType"],
    "assert.store": ["storeId"],
    "assert.businessDate": ["businessDate"],
    "assert.schema": ["schemaVersion"]
  };
  return new Set([...common, ...(byType[type] || [])]);
}

function optionalTimeout(value) {
  return value === undefined
    ? undefined
    : integer(value, "步骤超时", { min: 1, max: 3_600 });
}

function normalizeStep(input, context, depth = 0) {
  if (depth > 8) throw collectorError("COLLECTOR_TEMPLATE_INVALID", "采集模板流程嵌套过深。");
  const type = String(input?.type || "");
  if (!STEP_TYPES.has(type)) {
    throw collectorError("COLLECTOR_TEMPLATE_STEP_NOT_REGISTERED", "采集模板步骤类型未登记。");
  }
  onlyFields(input, stepFields(type));
  if (context.mode === "formal" && FREE_EXECUTION_TYPES.has(type)) {
    throw collectorError("COLLECTOR_TEMPLATE_STEP_NOT_REGISTERED", "正式模板不能包含自由脚本步骤。");
  }
  const normalized = {
    id: text(input.id, "步骤标识"),
    type
  };
  const timeoutSeconds = optionalTimeout(input.timeoutSeconds);
  if (timeoutSeconds !== undefined) normalized.timeoutSeconds = timeoutSeconds;
  if (input.retry !== undefined) {
    normalized.retry = integer(input.retry, "步骤重试次数", { min: 0, max: 5 });
  }

  if (type === "browser.open") normalized.url = normalizeUrl(input.url, context.allowedOrigins);
  if (["browser.wait", "browser.click", "browser.download"].includes(type) && input.selectors !== undefined) {
    normalized.selectors = normalizeStringArray(input.selectors, "候选选择器", { allowEmpty: false });
  }
  if (type === "browser.wait") {
    normalized.milliseconds = integer(input.milliseconds, "等待时间", { min: 1, max: 120_000 });
  }
  if (type === "browser.javascript") {
    const code = String(input.code || "");
    if (!code || code.length > 100_000) {
      throw collectorError("COLLECTOR_TEMPLATE_INVALID", "采集模板 JavaScript 无效。");
    }
    if (SENSITIVE_SOURCE.test(code)) {
      throw collectorError("COLLECTOR_TEMPLATE_SENSITIVE_ACCESS", "采集模板 JavaScript 包含敏感访问。");
    }
    normalized.code = code;
  }
  if (type === "browser.download" && input.filePattern !== undefined) {
    normalized.filePattern = String(input.filePattern).slice(0, 240);
  }
  if (type === "local.python") {
    normalized.script = text(input.script, "Python 脚本", /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}\.py$/);
    normalized.args = normalizeStringArray(input.args || [], "Python 参数");
  }
  if (type === "local.command") {
    normalized.command = normalizeStringArray(input.command, "命令参数", { allowEmpty: false });
    if (input.shell !== undefined) normalized.shell = input.shell === true;
  }
  if (type === "file.parse") {
    normalized.parser = text(input.parser, "文件解析器");
    normalized.input = String(input.input || "").slice(0, 1_000);
  }
  if (type === "flow.setVariable") {
    normalized.name = text(input.name, "变量名", SAFE_VARIABLE);
    normalized.value = structuredClone(input.value);
  }
  if (type === "flow.condition") {
    normalized.when = structuredClone(input.when);
    normalized.then = normalizeSteps(input.then || [], context, depth + 1);
    normalized.else = normalizeSteps(input.else || [], context, depth + 1, { allowEmpty: true });
  }
  if (type === "flow.loop") {
    normalized.items = String(input.items || "").slice(0, 1_000);
    normalized.itemVariable = text(input.itemVariable, "循环变量", SAFE_VARIABLE);
    normalized.maxIterations = integer(input.maxIterations, "步骤循环次数", {
      min: 1,
      max: context.limits.maxLoopIterations
    });
    normalized.steps = normalizeSteps(input.steps || [], context, depth + 1);
  }
  for (const field of ["pageType", "storeId", "businessDate", "schemaVersion"]) {
    if (Object.hasOwn(input, field)) normalized[field] = String(input[field] || "").slice(0, 240);
  }
  return normalized;
}

function normalizeSteps(steps, context, depth = 0, { allowEmpty = false } = {}) {
  if (!Array.isArray(steps) || (!allowEmpty && steps.length === 0) || steps.length > MAX_TEMPLATE_STEPS) {
    throw collectorError("COLLECTOR_TEMPLATE_INVALID", "采集模板步骤无效。");
  }
  const normalized = steps.map(step => normalizeStep(step, context, depth));
  const ids = normalized.map(step => step.id);
  if (new Set(ids).size !== ids.length) {
    throw collectorError("COLLECTOR_TEMPLATE_INVALID", "采集模板步骤标识重复。");
  }
  return normalized;
}

export function normalizeCollectorTemplate(input, { allowedOrigins = [] } = {}) {
  onlyFields(input, TEMPLATE_FIELDS);
  const mode = String(input.mode || "");
  const status = String(input.status || "");
  if (!MODES.has(mode) || !STATUSES.has(status)) {
    throw collectorError("COLLECTOR_TEMPLATE_INVALID", "采集模板模式或状态无效。");
  }
  const limits = normalizeLimits(input.limits);
  const context = {
    mode,
    limits,
    allowedOrigins: new Set(allowedOrigins.map(value => new URL(value).origin))
  };
  const normalized = {
    templateId: text(input.templateId, "标识"),
    version: integer(input.version, "版本", { min: 1, max: 1_000_000 }),
    mode,
    providerId: text(input.providerId, "Provider"),
    profileId: text(input.profileId, "Profile"),
    timeoutSeconds: integer(input.timeoutSeconds, "总超时", { min: 1, max: 86_400 }),
    limits,
    steps: normalizeSteps(input.steps, context),
    status
  };
  return deepFreeze(normalized);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, stableValue(value[key])])
  );
}

function contentShape(template) {
  return {
    templateId: template.templateId,
    version: template.version,
    mode: template.mode,
    providerId: template.providerId,
    profileId: template.profileId,
    timeoutSeconds: template.timeoutSeconds,
    limits: template.limits,
    steps: template.steps
  };
}

export async function collectorTemplateContentHash(template) {
  const payload = new TextEncoder().encode(JSON.stringify(stableValue(contentShape(template))));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", payload);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
}

function canEdit(actor) {
  return actor?.executive === true || EDITOR_ROLES.has(String(actor?.role || ""));
}

export function createCollectorTemplateVersion(current, patch = {}, {
  actor,
  allowedOrigins = []
} = {}) {
  if (!canEdit(actor)) {
    throw collectorError("COLLECTOR_TEMPLATE_ACTION_DENIED", "当前账号不能修改采集模板。");
  }
  if (!patch || typeof patch !== "object" || Array.isArray(patch)
    || Object.keys(patch).some(key => !EDITABLE_FIELDS.has(key))) {
    throw collectorError("COLLECTOR_TEMPLATE_FIELD_NOT_ALLOWED", "采集模板改版包含未登记字段。");
  }
  return normalizeCollectorTemplate({
    ...structuredClone(current),
    ...structuredClone(patch),
    version: Number(current?.version || 0) + 1,
    status: "draft"
  }, { allowedOrigins });
}

export async function verifyCollectorExecutionBundle(bundle, {
  runnerId,
  now = new Date(),
  allowedOrigins = []
} = {}) {
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) {
    throw collectorError("COLLECTOR_EXECUTION_BUNDLE_INVALID", "采集执行包无效。");
  }
  if (String(bundle.runnerId || "") !== String(runnerId || "")) {
    throw collectorError("COLLECTOR_TEMPLATE_ACTION_DENIED", "采集执行包未分配给当前 Runner。");
  }
  const expiresAt = Date.parse(String(bundle.expiresAt || ""));
  const current = now instanceof Date ? now.valueOf() : Date.parse(String(now || ""));
  if (!Number.isFinite(expiresAt) || !Number.isFinite(current) || expiresAt <= current) {
    throw collectorError("COLLECTOR_EXECUTION_BUNDLE_EXPIRED", "采集执行包已过期。");
  }
  const template = normalizeCollectorTemplate(bundle.template, { allowedOrigins });
  if (
    bundle.templateId !== template.templateId
    || Number(bundle.version) !== template.version
    || !/^[a-f0-9]{64}$/.test(String(bundle.contentHash || ""))
    || await collectorTemplateContentHash(template) !== bundle.contentHash
  ) {
    throw collectorError("COLLECTOR_TEMPLATE_HASH_MISMATCH", "采集模板版本或内容哈希不匹配。");
  }
  return deepFreeze({
    runId: text(bundle.runId, "运行标识"),
    runnerId: String(bundle.runnerId),
    templateId: template.templateId,
    version: template.version,
    contentHash: bundle.contentHash,
    expiresAt: new Date(expiresAt).toISOString(),
    template
  });
}

function qualityComplete(quality) {
  return quality?.requiredFieldsComplete === true
    && quality?.storeMatched === true
    && quality?.businessDateMatched === true
    && quality?.schemaMatched === true
    && Number(quality?.coverage) === 1;
}

export function collectorRunTrustLevel({ template, quality, ingestCompleted = false } = {}) {
  if (!qualityComplete(quality)) return "untrusted";
  if (template?.mode === "formal" && template?.status === "published" && ingestCompleted === true) {
    return "trusted";
  }
  return "validated";
}
