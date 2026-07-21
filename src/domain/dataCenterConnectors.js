const OTP_FIELD = /(?:otp|smscode|verificationcode|captcha|qrcode|slider)/i;
const STATUS_VALUES = new Set([
  "unconfigured",
  "pending_validation",
  "waiting_verification",
  "running",
  "healthy",
  "stale",
  "login_required",
  "schema_changed",
  "failed",
  "disabled"
]);
const METADATA_FIELDS = new Set([
  "id",
  "connectorId",
  "name",
  "companySubject",
  "accountType",
  "captureMethod",
  "consoleUrl",
  "datasets",
  "owner",
  "runnerId",
  "credentialEntryId",
  "historyStartDate",
  "schedule",
  "status",
  "enabled",
  "timeBasis",
  "timezone",
  "version",
  "createdAt",
  "updatedAt",
  "lastValidatedAt",
  "lastSuccessAt",
  "lastDataDate"
]);

function field(key, label, type, options = {}) {
  return Object.freeze({
    key,
    label,
    type,
    required: false,
    sensitive: false,
    maxLength: type === "password" || type === "secret" ? 4096 : 500,
    ...options
  });
}

function definition(input) {
  return Object.freeze({
    ...input,
    methods: Object.freeze([...input.methods]),
    accountTypes: Object.freeze([...(input.accountTypes || [])]),
    datasets: Object.freeze([...(input.datasets || [])]),
    fields: Object.freeze(input.fields.map(item => Object.freeze(item)))
  });
}

export const STORE_FILE_IMPORT_CONNECTOR_IDS = Object.freeze([
  "douyin-ecommerce",
  "kuaishou",
  "taobao",
  "pinduoduo",
  "xiaohongshu",
  "jd-jingmai"
]);

const STORE_FILE_IMPORT_CONNECTORS = new Set(STORE_FILE_IMPORT_CONNECTOR_IDS);

export function storeFileImportPending(connectorId) {
  return STORE_FILE_IMPORT_CONNECTORS.has(String(connectorId || ""));
}

export const DATA_CONNECTOR_DEFINITIONS = Object.freeze([
  definition({
    id: "douyin-ecommerce",
    name: "抖音电商",
    identityLabel: "店铺名称",
    description: "店铺订单、商品与经营数据",
    logo: "douyin",
    methods: ["export"],
    accountTypes: ["shop"],
    datasets: ["orders", "products", "shop-performance"],
    fields: []
  }),
  definition({
    id: "oceanengine",
    name: "巨量引擎",
    identityLabel: "广告账户名称",
    description: "巨量引擎与巨量千川投放数据",
    logo: "oceanengine",
    methods: ["api", "browser", "export"],
    accountTypes: ["advertiser", "qianchuan"],
    datasets: ["campaigns", "materials", "advertising-performance"],
    fields: [
      field("accountId", "账户 ID", "text"),
      field("loginAccount", "登录账号", "text", { sensitive: true, methods: ["browser"] }),
      field("password", "密码", "password", { sensitive: true, methods: ["browser"] }),
      field("appId", "App ID", "text", { methods: ["api"] }),
      field("appSecret", "App Secret", "secret", { sensitive: true, methods: ["api"] }),
      field("accessToken", "Access Token", "secret", { sensitive: true, methods: ["api"] })
    ]
  }),
  definition({
    id: "kuaishou",
    name: "快手生态",
    identityLabel: "店铺 / 广告账户名称",
    description: "快手小店与广告经营数据",
    logo: "kuaishou",
    methods: ["export"],
    accountTypes: ["shop", "advertiser"],
    datasets: ["orders", "products", "advertising-performance"],
    fields: []
  }),
  definition({
    id: "taobao",
    name: "淘系",
    identityLabel: "店铺名称",
    description: "天猫与淘宝店铺经营数据",
    logo: "taobao",
    methods: ["export"],
    accountTypes: ["tmall", "taobao"],
    datasets: ["orders", "products", "shop-performance"],
    fields: []
  }),
  definition({
    id: "pinduoduo",
    name: "拼多多",
    identityLabel: "店铺名称",
    description: "拼多多店铺订单与商品数据",
    logo: "pinduoduo",
    methods: ["export"],
    accountTypes: ["shop"],
    datasets: ["orders", "products", "shop-performance"],
    fields: []
  }),
  definition({
    id: "xiaohongshu",
    name: "小红书生态",
    identityLabel: "店铺 / 乘风账户名称",
    description: "小红书店铺与乘风投放数据",
    logo: "xiaohongshu",
    methods: ["export"],
    accountTypes: ["shop", "chengfeng"],
    datasets: ["orders", "products", "advertising-performance"],
    fields: []
  }),
  definition({
    id: "jd-jingmai",
    name: "京东 / 京麦",
    identityLabel: "店铺名称",
    description: "京东店铺与京麦后台经营数据",
    logo: "jd",
    methods: ["export"],
    accountTypes: ["shop"],
    datasets: ["orders", "products", "shop-performance"],
    fields: []
  }),
  definition({
    id: "kuaimai-erp",
    name: "快麦 ERP",
    identityLabel: "ERP 账号名称",
    description: "订单、商品、库存与销售文件",
    logo: "kuaimai",
    methods: ["api", "browser", "export"],
    accountTypes: ["erp"],
    datasets: ["orders", "products", "inventory", "sales"],
    fields: [
      field("loginAccount", "ERP 账号", "text", { sensitive: true, methods: ["browser"] }),
      field("password", "ERP 密码", "password", { sensitive: true, methods: ["browser"] }),
      field("appKey", "App Key", "text", { methods: ["api"] }),
      field("appSecret", "App Secret", "secret", { sensitive: true, methods: ["api"] }),
      field("accessToken", "Access Token", "secret", { sensitive: true, methods: ["api"] }),
      field("refreshToken", "Refresh Token", "secret", { sensitive: true, methods: ["api"] })
    ]
  })
]);

export const INTERNAL_VAULT_TYPES = Object.freeze([
  Object.freeze({ id: "nas", name: "NAS", description: "公司文件与素材存储" }),
  Object.freeze({ id: "email", name: "邮箱", description: "公司邮箱与应用专用密码" }),
  Object.freeze({ id: "finance", name: "财务系统", description: "财务软件、网银辅助与结算后台" }),
  Object.freeze({ id: "government-saas", name: "政务 / SaaS", description: "政务、税务与企业服务后台" }),
  Object.freeze({ id: "custom", name: "自定义内部系统", description: "受控字段的其他公司系统" })
]);

export const CONNECTOR_STATUS_PRIORITY = Object.freeze([
  "waiting_verification",
  "schema_changed",
  "failed",
  "login_required",
  "stale",
  "running",
  "pending_validation",
  "healthy",
  "unconfigured",
  "disabled"
]);

const DEFINITIONS_BY_ID = new Map(DATA_CONNECTOR_DEFINITIONS.map(item => [item.id, item]));

function inputError(message) {
  const error = new Error(message);
  error.status = 400;
  error.code = "DATA_CONNECTOR_INVALID";
  return error;
}

function cleanString(value, label, maxLength = 500) {
  if (value == null) return "";
  if (typeof value !== "string") throw inputError(`${label} 必须是字符串。`);
  const cleaned = value.trim();
  if (cleaned.length > maxLength) throw inputError(`${label} 不能超过 ${maxLength} 个字符。`);
  return cleaned;
}

function cleanConsoleUrl(value) {
  const cleaned = cleanString(value, "后台地址", 1000);
  if (!cleaned) return "";
  let url;
  try {
    url = new URL(cleaned);
  } catch {
    throw inputError("后台地址必须是有效的 HTTPS URL。");
  }
  if (url.protocol !== "https:") throw inputError("后台地址必须使用 HTTPS。");
  if (url.username || url.password) throw inputError("后台地址不能包含账号或密码。");
  return url.toString();
}

export function connectorDefinition(id) {
  const found = DEFINITIONS_BY_ID.get(String(id || "").trim());
  if (!found) throw inputError(`未知连接器：${String(id || "空")}。`);
  return found;
}

export function inferConnectorCaptureMethod(definitionInput, { secretPayload = {}, existingMethod = "" } = {}) {
  const resolved = typeof definitionInput === "string" ? connectorDefinition(definitionInput) : definitionInput;
  if (!resolved || !DEFINITIONS_BY_ID.has(resolved.id)) throw inputError("未知连接器定义。");
  const hasConfiguredField = method => resolved.fields.some(item => (
    item.methods?.includes(method) && String(secretPayload[item.key] || "").trim()
  ));

  if (hasConfiguredField("api")) return "api";
  if (hasConfiguredField("browser")) return "browser";
  if (resolved.methods.includes(existingMethod)) return existingMethod;
  if (resolved.methods.includes("export")) return "export";
  return resolved.methods[0];
}

export function splitConnectorPayload(definitionInput, input = {}) {
  const resolved = typeof definitionInput === "string" ? connectorDefinition(definitionInput) : definitionInput;
  if (!resolved || !DEFINITIONS_BY_ID.has(resolved.id)) throw inputError("未知连接器定义。");
  if (!input || typeof input !== "object" || Array.isArray(input)) throw inputError("连接配置必须是对象。");

  const keys = Object.keys(input);
  const otpKey = keys.find(key => OTP_FIELD.test(key));
  if (otpKey) throw inputError("验证码、扫码或当次人工验证信息不能保存。");
  const fields = new Map(resolved.fields.map(item => [item.key, item]));
  const unknown = keys.filter(key => !METADATA_FIELDS.has(key) && !fields.has(key));
  if (unknown.length) throw inputError(`连接配置包含不支持的字段：${unknown.join("、")}。`);

  const metadata = {};
  for (const key of keys.filter(key => METADATA_FIELDS.has(key))) {
    if (["consoleUrl"].includes(key)) metadata[key] = cleanConsoleUrl(input[key]);
    else if (["datasets"].includes(key)) metadata[key] = Array.isArray(input[key]) ? [...new Set(input[key].map(String).map(item => item.trim()).filter(Boolean))] : [];
    else if (["enabled"].includes(key)) metadata[key] = input[key] !== false;
    else if (typeof input[key] === "string") metadata[key] = cleanString(input[key], key, 1000);
    else if (input[key] != null) metadata[key] = input[key];
  }

  const secretPayload = {};
  for (const [key, fieldDefinition] of fields) {
    if (!(key in input)) continue;
    const value = cleanString(input[key], fieldDefinition.label, fieldDefinition.maxLength);
    if (!value) continue;
    if (fieldDefinition.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw inputError(`${fieldDefinition.label} 格式不正确。`);
    }
    if (fieldDefinition.sensitive) secretPayload[key] = value;
    else metadata[key] = value;
  }
  return { metadata, secretPayload };
}

export function normalizeConnectorInstance(input = {}, { existing = null } = {}) {
  const definition = connectorDefinition(input.connectorId);
  const { metadata } = splitConnectorPayload(definition, input);
  const existingStatus = String(existing?.status || "");
  const status = existing && STATUS_VALUES.has(existingStatus) ? existingStatus : "pending_validation";
  const name = cleanString(input.name, definition.identityLabel, 120);
  if (!name) throw inputError(`${definition.identityLabel}不能为空。`);
  return {
    ...metadata,
    id: cleanString(input.id, "id", 120),
    connectorId: definition.id,
    name,
    captureMethod: definition.methods.includes(input.captureMethod)
      ? input.captureMethod
      : inferConnectorCaptureMethod(definition, { existingMethod: existing?.captureMethod }),
    datasets: Array.isArray(input.datasets)
      ? input.datasets.filter(item => definition.datasets.includes(item))
      : [],
    status: input.enabled === false ? "disabled" : status,
    enabled: input.enabled !== false,
    schedule: "07:30",
    timeBasis: "create_time",
    timezone: "Asia/Shanghai"
  };
}
