export const KUAIMAI_ERP_RESOURCE_TYPES = Object.freeze([
  "orders",
  "order_items",
  "products",
  "skus",
  "inventory_snapshot",
  "inventory_movements",
  "suppliers",
  "purchase_orders",
  "aftersales",
  "shops",
  "warehouses",
  "finance"
]);

const RESOURCE_TYPES = new Set(KUAIMAI_ERP_RESOURCE_TYPES);
const EVENT_TIME_REQUIRED = new Set(["orders", "order_items", "inventory_movements", "purchase_orders", "aftersales", "finance"]);
const HASH_PATTERN = /^[a-f0-9]{64}$/i;
const SECRET_KEY_PATTERN = /^(password|passwd|pwd|cookie|cookies|access_?token|refresh_?token|verification_?code|raw_?html)$/i;
const MAX_CHUNK_SIZE = 500;

export class ErpCollectionValidationError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.name = "ErpCollectionValidationError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new ErpCollectionValidationError(code, message, 400, details);
}

function text(value, max = 240) {
  return String(value ?? "").trim().slice(0, max);
}

function nullableText(value, max = 240) {
  const normalized = text(value, max);
  return normalized || null;
}

function timestamp(value, { required = false, code = "ERP_COLLECTION_TIMESTAMP_INVALID", label = "时间" } = {}) {
  const normalized = text(value, 80);
  if (!normalized) {
    if (required) fail(code, `${label}不能为空。`);
    return null;
  }
  if (Number.isNaN(Date.parse(normalized))) fail(code, `${label}格式无效。`);
  return normalized;
}

function hash(value) {
  const normalized = text(value, 64).toLowerCase();
  if (!HASH_PATTERN.test(normalized)) fail("ERP_COLLECTION_HASH_INVALID", "内容哈希必须是 64 位 SHA-256 十六进制字符串。");
  return normalized;
}

function assertNoSecrets(value, path = "payload") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) fail("ERP_COLLECTION_SECRET_FIELD", `原始记录不允许包含秘密字段：${path}.${key}`);
    assertNoSecrets(child, `${path}.${key}`);
  }
}

function normalizeRecord(record, resourceType, index) {
  if (!record || typeof record !== "object" || Array.isArray(record)) fail("ERP_COLLECTION_RECORD_INVALID", `第 ${index + 1} 条记录格式无效。`);
  const sourceKey = text(record.sourceKey, 320);
  if (!sourceKey) fail("ERP_COLLECTION_SOURCE_KEY_REQUIRED", `第 ${index + 1} 条记录缺少稳定来源键。`);
  const payload = record.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) fail("ERP_COLLECTION_PAYLOAD_REQUIRED", `第 ${index + 1} 条记录缺少原始字段对象。`);
  assertNoSecrets(payload);
  return {
    id: text(record.id, 320) || `${resourceType}:${sourceKey}`,
    sourceKey,
    occurredAt: timestamp(record.occurredAt, {
      required: EVENT_TIME_REQUIRED.has(resourceType),
      code: "ERP_COLLECTION_OCCURRED_AT_REQUIRED",
      label: "业务发生时间"
    }),
    modifiedAt: timestamp(record.modifiedAt, { label: "修改时间" }),
    shopId: nullableText(record.shopId, 160),
    warehouseId: nullableText(record.warehouseId, 160),
    contentHash: hash(record.contentHash),
    payload
  };
}

function normalizeIssue(issue, resourceType, batchId, index) {
  if (!issue || typeof issue !== "object" || Array.isArray(issue)) fail("ERP_COLLECTION_ISSUE_INVALID", `第 ${index + 1} 条异常格式无效。`);
  const code = text(issue.code, 120);
  const message = text(issue.message, 1000);
  if (!code || !message) fail("ERP_COLLECTION_ISSUE_INVALID", `第 ${index + 1} 条异常缺少编码或说明。`);
  const details = issue.details && typeof issue.details === "object" && !Array.isArray(issue.details) ? issue.details : {};
  assertNoSecrets(details, "issue.details");
  return {
    id: text(issue.id, 320) || `${batchId}:issue:${index + 1}`,
    sourceKey: nullableText(issue.sourceKey, 320),
    code,
    severity: ["info", "warning", "error"].includes(issue.severity) ? issue.severity : "error",
    message,
    details,
    status: ["open", "resolved", "ignored"].includes(issue.status) ? issue.status : "open",
    resourceType
  };
}

export function normalizeErpCollectionPayload(input, { idempotencyKey = "" } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("ERP_COLLECTION_BODY_INVALID", "请求内容必须是 JSON 对象。");
  const rawBatch = input.batch;
  if (!rawBatch || typeof rawBatch !== "object" || Array.isArray(rawBatch)) fail("ERP_COLLECTION_BATCH_REQUIRED", "缺少导入批次信息。");
  const platformId = text(rawBatch.platformId || "kuaimai", 80).toLowerCase();
  if (platformId !== "kuaimai") fail("ERP_COLLECTION_PLATFORM_INVALID", "当前采集器只接受快麦 ERP 官方导出数据。");
  const resourceType = text(rawBatch.resourceType, 80).toLowerCase();
  if (!RESOURCE_TYPES.has(resourceType)) fail("ERP_COLLECTION_RESOURCE_INVALID", "资源类型未登记。", { supported: KUAIMAI_ERP_RESOURCE_TYPES });
  const contentHash = hash(rawBatch.contentHash);
  const records = Array.isArray(input.records) ? input.records : [];
  const issues = Array.isArray(input.issues) ? input.issues : [];
  if (!records.length) fail("ERP_COLLECTION_RECORDS_REQUIRED", "当前分块没有可导入记录。");
  if (records.length > MAX_CHUNK_SIZE || issues.length > MAX_CHUNK_SIZE) fail("ERP_COLLECTION_CHUNK_TOO_LARGE", `单次最多导入 ${MAX_CHUNK_SIZE} 条记录和 ${MAX_CHUNK_SIZE} 条异常。`);
  const batchId = text(rawBatch.id, 320) || `kuaimai-${resourceType}-${contentHash.slice(0, 24)}`;
  const collectedAt = timestamp(rawBatch.collectedAt || new Date().toISOString(), { required: true, label: "采集时间" });
  const normalizedRecords = records.map((record, index) => normalizeRecord(record, resourceType, index));
  const normalizedIssues = issues.map((issue, index) => normalizeIssue(issue, resourceType, batchId, index));
  const requestedStatus = text(rawBatch.status, 40);
  const status = ["pending", "partial", "completed"].includes(requestedStatus)
    ? requestedStatus
    : (normalizedIssues.some(issue => issue.severity === "error") ? "partial" : "completed");
  return {
    idempotencyKey: text(idempotencyKey, 160),
    batch: {
      id: batchId,
      platformId,
      resourceType,
      sourceFileName: text(rawBatch.sourceFileName, 240),
      contentHash,
      schemaVersion: text(rawBatch.schemaVersion || "v1", 40),
      rangeStart: timestamp(rawBatch.rangeStart, { label: "范围开始时间" }),
      rangeEnd: timestamp(rawBatch.rangeEnd, { label: "范围结束时间" }),
      rowCount: Math.max(0, Math.trunc(Number(rawBatch.rowCount) || records.length)),
      status,
      collectedAt
    },
    records: normalizedRecords,
    issues: normalizedIssues
  };
}
