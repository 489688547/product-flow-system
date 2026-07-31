export const COMMERCE_FACT_RESOURCES = Object.freeze([
  "store_daily",
  "product_daily",
  "live_daily",
  "video_daily"
]);

const RESOURCE_SET = new Set(COMMERCE_FACT_RESOURCES);
const CONFIDENCE_LEVELS = new Set(["high", "medium", "low"]);
const SENSITIVE_FIELD = /(cookie|token|password|credential|html|pageText|absolutePath|customerName|mobile|email)/i;
const BUSINESS_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_SCOPE_ID = /^[-_a-zA-Z0-9]{1,160}$/;

const COMMON_FIELDS = Object.freeze([
  "providerId",
  "storeId",
  "businessDate",
  "sourceVersion"
]);

const RESOURCE_SCHEMAS = Object.freeze({
  store_daily: Object.freeze({
    identity: Object.freeze([]),
    strings: Object.freeze([]),
    numbers: Object.freeze([
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
    ])
  }),
  product_daily: Object.freeze({
    identity: Object.freeze(["productId"]),
    strings: Object.freeze(["skuId", "productName", "skuName", "merchantCode"]),
    numbers: Object.freeze([
      "exposureUsers",
      "clickUsers",
      "transactionBuyers",
      "transactionOrderCount",
      "transactionQuantity",
      "transactionAmount",
      "userPaymentAmount",
      "refundOrderCount",
      "refundQuantity",
      "refundAmount"
    ])
  }),
  live_daily: Object.freeze({
    identity: Object.freeze(["liveSessionId"]),
    strings: Object.freeze(["accountId", "startedAt", "endedAt"]),
    numbers: Object.freeze([
      "durationSeconds",
      "exposureUsers",
      "entryUsers",
      "viewerUsers",
      "effectiveViewerUsers",
      "productClickUsers",
      "addToCartUsers",
      "transactionBuyers",
      "transactionOrderCount",
      "transactionQuantity",
      "transactionAmount",
      "userPaymentAmount",
      "refundOrderCount",
      "refundAmount"
    ])
  }),
  video_daily: Object.freeze({
    identity: Object.freeze(["videoId"]),
    strings: Object.freeze(["accountId", "publishedAt", "title", "productId", "materialId"]),
    numbers: Object.freeze([
      "playUsers",
      "playCount",
      "effectivePlayCount",
      "likeCount",
      "commentCount",
      "shareCount",
      "productExposureCount",
      "productClickCount",
      "transactionBuyers",
      "transactionOrderCount",
      "transactionQuantity",
      "transactionAmount",
      // 自助取数给的是「短视频用户支付金额」，与成交金额是两个口径。
      // 没有这一列就只能丢数或冒充成交金额，后者会造出看起来权威的错值。
      "userPaymentAmount",
      "refundOrderCount",
      "refundAmount"
    ])
  })
});

function factError(code, message) {
  const error = new Error(message);
  error.status = 400;
  error.code = code;
  error.retryable = false;
  return error;
}

function assertPlainObject(value, message = "经营事实结构无效。") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw factError("COMMERCE_FACT_SCHEMA_INVALID", message);
  }
}

function nullableNumber(value, field) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw factError("COMMERCE_FACT_SCHEMA_INVALID", `经营事实数值字段无效：${field}`);
  }
  return number;
}

function nullableString(value, field, maxLength = 300) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (!text || text.length > maxLength) {
    throw factError("COMMERCE_FACT_SCHEMA_INVALID", `经营事实文本字段无效：${field}`);
  }
  return text;
}

function requiredIdentity(value, field) {
  const text = nullableString(value, field, 200);
  if (!text || /\s/.test(text)) {
    throw factError("COMMERCE_FACT_SCHEMA_INVALID", `经营事实缺少稳定标识：${field}`);
  }
  return text;
}

function schemaFor(resourceType) {
  const schema = RESOURCE_SCHEMAS[String(resourceType || "")];
  if (!schema) throw factError("COMMERCE_FACT_SCHEMA_INVALID", "经营事实资源未登记。");
  return schema;
}

function allowedFactFields(resourceType) {
  const schema = schemaFor(resourceType);
  return new Set([...COMMON_FIELDS, ...schema.identity, ...schema.strings, ...schema.numbers]);
}

export function normalizeCommerceFact(resourceType, input) {
  assertPlainObject(input);
  const schema = schemaFor(resourceType);
  const allowed = allowedFactFields(resourceType);
  for (const field of Object.keys(input)) {
    if (SENSITIVE_FIELD.test(field) || !allowed.has(field)) {
      throw factError("COMMERCE_FACT_SCHEMA_INVALID", `经营事实包含未登记或敏感字段：${field}`);
    }
  }

  const providerId = String(input.providerId || "").trim();
  const storeId = String(input.storeId || "").trim();
  const businessDate = String(input.businessDate || "").trim();
  if (providerId !== "douyin-ecommerce") {
    throw factError("COMMERCE_FACT_SCHEMA_INVALID", "经营事实 provider 未登记。");
  }
  if (!SAFE_SCOPE_ID.test(storeId)) {
    throw factError("COMMERCE_FACT_SCHEMA_INVALID", "经营事实店铺标识无效。");
  }
  if (!BUSINESS_DATE.test(businessDate)) {
    throw factError("COMMERCE_FACT_SCHEMA_INVALID", "经营事实业务日期无效。");
  }

  const normalized = {
    providerId,
    storeId,
    businessDate,
    sourceVersion: nullableString(input.sourceVersion, "sourceVersion", 80)
  };
  for (const field of schema.identity) normalized[field] = requiredIdentity(input[field], field);
  for (const field of schema.strings) {
    const maxLength = field === "title" ? 500 : 300;
    normalized[field] = nullableString(input[field], field, maxLength);
  }
  for (const field of schema.numbers) normalized[field] = nullableNumber(input[field], field);
  return normalized;
}

function safeRatio(numerator, denominator) {
  if (
    numerator === null
    || numerator === undefined
    || denominator === null
    || denominator === undefined
    || Number(denominator) === 0
  ) return null;
  return Number(numerator) / Number(denominator);
}

export function deriveCommerceMetrics(resourceType, row = {}) {
  switch (resourceType) {
    case "store_daily":
      return {
        refundRate: safeRatio(row.refundAmountByPaymentDate, row.transactionAmount),
        averageOrderValue: safeRatio(row.transactionAmount, row.transactionOrderCount),
        exposureClickRate: safeRatio(row.productClickUsers, row.productExposureUsers),
        clickTransactionRate: safeRatio(row.transactionBuyerCount, row.productClickUsers)
      };
    case "product_daily":
      return {
        refundRate: safeRatio(row.refundAmount, row.transactionAmount),
        clickRate: safeRatio(row.clickUsers, row.exposureUsers),
        transactionConversionRate: safeRatio(row.transactionBuyers, row.clickUsers),
        averageSellingPrice: safeRatio(row.transactionAmount, row.transactionQuantity)
      };
    case "live_daily":
      return {
        entryRate: safeRatio(row.entryUsers, row.exposureUsers),
        effectiveViewRate: safeRatio(row.effectiveViewerUsers, row.viewerUsers),
        productClickRate: safeRatio(row.productClickUsers, row.effectiveViewerUsers),
        addToCartRate: safeRatio(row.addToCartUsers, row.productClickUsers),
        paymentConversionRate: safeRatio(row.transactionBuyers, row.addToCartUsers),
        refundRate: safeRatio(row.refundAmount, row.transactionAmount)
      };
    case "video_daily":
      return {
        effectivePlayRate: safeRatio(row.effectivePlayCount, row.playCount),
        productClickRate: safeRatio(row.productClickCount, row.productExposureCount),
        transactionConversionRate: safeRatio(row.transactionBuyers, row.productClickCount),
        refundRate: safeRatio(row.refundAmount, row.transactionAmount)
      };
    default:
      throw factError("COMMERCE_FACT_SCHEMA_INVALID", "经营事实资源未登记。");
  }
}

function identityParts(resourceType, fact) {
  switch (resourceType) {
    case "store_daily": return [fact.providerId, fact.storeId, fact.businessDate];
    case "product_daily": return [fact.providerId, fact.storeId, fact.businessDate, fact.productId, fact.skuId || ""];
    case "live_daily": return [fact.providerId, fact.storeId, fact.businessDate, fact.liveSessionId];
    case "video_daily": return [fact.providerId, fact.storeId, fact.businessDate, fact.videoId];
    default: throw factError("COMMERCE_FACT_SCHEMA_INVALID", "经营事实资源未登记。");
  }
}

export function commerceFactIdentity(batchId, resourceType, fact) {
  if (!SAFE_SCOPE_ID.test(String(batchId || ""))) {
    throw factError("COMMERCE_FACT_SCHEMA_INVALID", "经营事实批次标识无效。");
  }
  return ["commerce-fact", batchId, resourceType, ...identityParts(resourceType, fact)]
    .map(value => encodeURIComponent(String(value || "")))
    .join(":");
}

const BATCH_FIELDS = new Set([
  "jobId",
  "batchId",
  "providerId",
  "storeId",
  "resourceType",
  "businessDate",
  "schemaVersion",
  "sourceVersion",
  "contentHash",
  "chunkIndex",
  "complete",
  "expectedCount",
  "coverage",
  "confidence",
  "facts"
]);

export function normalizeCommerceBatchInput(input) {
  assertPlainObject(input, "经营事实批次结构无效。");
  for (const field of Object.keys(input)) {
    if (SENSITIVE_FIELD.test(field) || !BATCH_FIELDS.has(field)) {
      throw factError("COMMERCE_FACT_SCHEMA_INVALID", `经营事实批次包含未登记或敏感字段：${field}`);
    }
  }

  const jobId = String(input.jobId || "").trim();
  const batchId = String(input.batchId || "").trim();
  const providerId = String(input.providerId || "").trim();
  const storeId = String(input.storeId || "").trim();
  const resourceType = String(input.resourceType || "").trim();
  const businessDate = String(input.businessDate || "").trim();
  const schemaVersion = String(input.schemaVersion || "").trim();
  if (!SAFE_SCOPE_ID.test(jobId) || !SAFE_SCOPE_ID.test(batchId)) {
    throw factError("COMMERCE_FACT_SCHEMA_INVALID", "经营事实任务或批次标识无效。");
  }
  if (providerId !== "douyin-ecommerce" || !RESOURCE_SET.has(resourceType)) {
    throw factError("COMMERCE_FACT_SCHEMA_INVALID", "经营事实 provider 或 resource 未登记。");
  }
  if (!SAFE_SCOPE_ID.test(storeId) || !BUSINESS_DATE.test(businessDate)) {
    throw factError("COMMERCE_FACT_SCHEMA_INVALID", "经营事实店铺或业务日期无效。");
  }
  if (!SAFE_SCOPE_ID.test(schemaVersion)) {
    throw factError("COMMERCE_FACT_SCHEMA_INVALID", "经营事实 schema version 无效。");
  }
  const chunkIndex = Number(input.chunkIndex);
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex > 10000) {
    throw factError("COMMERCE_FACT_SCHEMA_INVALID", "经营事实分块序号无效。");
  }
  if (typeof input.complete !== "boolean") {
    throw factError("COMMERCE_FACT_SCHEMA_INVALID", "经营事实批次完成标记无效。");
  }
  if (!Array.isArray(input.facts) || input.facts.length > 500) {
    throw factError("COMMERCE_FACT_SCHEMA_INVALID", "经营事实分块必须是最多 500 行的数组。");
  }
  const expectedCount = input.expectedCount === null || input.expectedCount === undefined
    ? null
    : Number(input.expectedCount);
  if (input.complete && (!Number.isInteger(expectedCount) || expectedCount < 0)) {
    throw factError("COMMERCE_BATCH_INCOMPLETE", "完成经营事实批次必须提供有效 expectedCount。");
  }
  if (!input.complete && expectedCount !== null) {
    throw factError("COMMERCE_FACT_SCHEMA_INVALID", "未完成分块不能声明 expectedCount。");
  }
  const coverage = input.coverage === null || input.coverage === undefined ? null : Number(input.coverage);
  const confidence = input.confidence === null || input.confidence === undefined
    ? null
    : String(input.confidence);
  if (input.complete && (!Number.isFinite(coverage) || coverage < 0 || coverage > 1 || !CONFIDENCE_LEVELS.has(confidence))) {
    throw factError("COMMERCE_FACT_SCHEMA_INVALID", "完成经营事实批次必须提供覆盖率和可信等级。");
  }
  if (!input.complete && (coverage !== null || confidence !== null)) {
    throw factError("COMMERCE_FACT_SCHEMA_INVALID", "未完成分块不能声明最终质量。");
  }
  const contentHash = input.contentHash === null || input.contentHash === undefined || input.contentHash === ""
    ? null
    : String(input.contentHash).toLowerCase();
  if (contentHash && !/^[a-f0-9]{64}$/.test(contentHash)) {
    throw factError("COMMERCE_FACT_SCHEMA_INVALID", "经营事实内容哈希无效。");
  }

  const facts = input.facts.map(fact => normalizeCommerceFact(resourceType, fact));
  for (const fact of facts) {
    if (fact.providerId !== providerId || fact.storeId !== storeId || fact.businessDate !== businessDate) {
      throw factError("COMMERCE_FACT_SCHEMA_INVALID", "经营事实行与批次范围不一致。");
    }
  }

  return {
    jobId,
    batchId,
    providerId,
    storeId,
    resourceType,
    businessDate,
    schemaVersion,
    sourceVersion: nullableString(input.sourceVersion, "sourceVersion", 80),
    contentHash,
    chunkIndex,
    complete: input.complete,
    expectedCount,
    coverage,
    confidence,
    facts
  };
}

export const commerceFactsInternals = Object.freeze({
  RESOURCE_SCHEMAS,
  safeRatio
});
