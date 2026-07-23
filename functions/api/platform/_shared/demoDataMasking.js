const PERSONAL_FIELD_KINDS = Object.freeze([
  [/^(mobile|phone|telephone|tel|手机号|手机|电话)$/i, "phone"],
  [/(email|mail|邮箱)$/i, "email"],
  [/(address|地址)$/i, "address"],
  [/(idcard|identitycard|身份证)$/i, "identity"],
  [/^(customername|contactname|recipient|emergencycontact|客户姓名|联系人|收件人)$/i, "name"]
]);

export class DemoDataMaskingError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DemoDataMaskingError";
    this.code = code;
    this.status = 503;
  }
}

function assertMaskingKey(key) {
  const normalized = String(key || "");
  if (normalized.length < 16) {
    throw new DemoDataMaskingError(
      "DEMO_MASKING_KEY_MISSING",
      "展示数据脱敏能力未配置，已阻止复制个人信息。"
    );
  }
  return normalized;
}

function bytesToHex(bytes) {
  return [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
}

async function hmac(value, { key, namespace = "demo" }) {
  const safeKey = assertMaskingKey(key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(safeKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(`${namespace}\u001f${String(value ?? "")}`)
  );
  return bytesToHex(new Uint8Array(signature));
}

function digitsFromHex(value, length) {
  let result = "";
  for (const character of value) {
    result += (Number.parseInt(character, 16) % 10).toString();
    if (result.length === length) return result;
  }
  return result.padEnd(length, "0");
}

async function maskValue(value, kind, options) {
  if (value === null || value === undefined || value === "") return value;
  const token = await hmac(value, options);
  if (kind === "phone") return `1${digitsFromHex(token, 10)}`;
  if (kind === "email") return `user-${token.slice(0, 12)}@example.invalid`;
  if (kind === "name") return `成员-${token.slice(0, 8).toUpperCase()}`;
  if (kind === "address") return `展示地址-${token.slice(0, 10).toUpperCase()}`;
  return `display-${token.slice(0, 16)}`;
}

function personalKind(fieldName) {
  for (const [pattern, kind] of PERSONAL_FIELD_KINDS) {
    if (pattern.test(String(fieldName || ""))) return kind;
  }
  return "";
}

export async function maskPersonalJson(value, options) {
  assertMaskingKey(options?.key);
  if (Array.isArray(value)) {
    return Promise.all(value.map((item, index) => maskPersonalJson(item, {
      ...options,
      namespace: `${options.namespace || "json"}[${index}]`
    })));
  }
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const [field, fieldValue] of Object.entries(value)) {
    const kind = personalKind(field);
    const namespace = `${options.namespace || "json"}.${field}`;
    result[field] = kind
      ? await maskValue(fieldValue, kind, { ...options, namespace })
      : await maskPersonalJson(fieldValue, { ...options, namespace });
  }
  return result;
}

async function maskJsonColumn(value, options) {
  if (value === null || value === undefined || value === "") return value;
  let parsed = value;
  const serialized = typeof value === "string";
  if (serialized) {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new DemoDataMaskingError(
        "DEMO_MASKING_JSON_INVALID",
        "个人信息字段格式无效，已阻止复制。"
      );
    }
  }
  const masked = await maskPersonalJson(parsed, options);
  return serialized ? JSON.stringify(masked) : masked;
}

export async function maskDemoRecord(record, strategy = {}, options = {}) {
  assertMaskingKey(options.key);
  const result = { ...record };
  for (const [field, kind] of Object.entries(strategy.maskFields || {})) {
    if (!Object.prototype.hasOwnProperty.call(result, field)) continue;
    result[field] = await maskValue(result[field], kind, {
      ...options,
      namespace: `${options.namespace || "record"}.${field}`
    });
  }
  for (const field of strategy.maskJsonFields || []) {
    if (!Object.prototype.hasOwnProperty.call(result, field)) continue;
    result[field] = await maskJsonColumn(result[field], {
      ...options,
      namespace: `${options.namespace || "record"}.${field}`
    });
  }
  return result;
}
