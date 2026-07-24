export const KUAIMAI_ERP_RESOURCE_TYPES = Object.freeze([
  "orders",
  "order_items",
  "sales_items",
  "products",
  "product_kits",
  "product_combinations",
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
const EVENT_TIME_REQUIRED = new Set(["orders", "order_items", "sales_items", "inventory_movements", "purchase_orders", "aftersales", "finance"]);
const HASH_PATTERN = /^[a-f0-9]{64}$/i;
const SECRET_KEY_PATTERN = /^(password|passwd|pwd|cookie|cookies|access_?token|refresh_?token|verification_?code|raw_?html)$/i;
const PERSONAL_DATA_KEY_PATTERN = /^(收件人|收件姓名|收货人|收货姓名|手机|手机号|手机号码|联系电话|联系手机|电话|固话|座机|省|市|区|县|街道|收件地址|收货地址|详细地址|街道地址|详细地址\(包含省市区\)|购方地址|快递单号|物流单号|运单号|退回快递单号|邮箱|电子邮箱|email|买家旺旺|买家昵称|买家姓名|买家ID|买家留言|系统备注|卖家备注|买家备注|身份证|身份证号|证件号)$/i;
const MAX_CHUNK_SIZE = 500;
// 销售事实分块上传：新格式单包最多 1000 条，单批最多 50 包（即 5 万条总量上限）；
// 老版 runner 的整批单包格式保持兼容，仍允许最多 5000 条一包。
const MAX_SALES_FACTS_PER_PACK = 1000;
const MAX_SALES_FACTS_LEGACY_PACK = 5000;
const MAX_SALES_FACTS_CHUNKS = 50;
const MAX_SALES_FACTS_REPLACE_DATES = 400;
const INDEX_FIELDS = Object.freeze({
  sourceOrderId: ["sourceOrderId", "系统订单号", "系统单号", "订单编号", "订单号", "交易号"],
  sourceItemId: ["sourceItemId", "订单明细ID", "明细ID", "子订单号"],
  sourceProductId: ["sourceProductId", "系统商品ID", "系统主商品ID", "商品ID"],
  sourceSkuId: ["sourceSkuId", "系统规格ID", "系统SKU ID", "规格ID", "SKU ID"],
  productCode: ["productCode", "套件主商家编码", "套件商家编码", "组合装主商家编码", "组合装商家编码", "主商家编码", "商品编码"],
  skuCode: ["skuCode", "套件规格商家编码", "组合装规格商家编码", "规格商家编码", "商家编码", "规格编码", "SKU编码"],
  barcode: ["barcode", "69码", "规格条形码", "商品条形码", "条码", "条形码"],
  productName: ["productName", "套件名称", "组合装名称", "商品名称"],
  skuName: ["skuName", "规格", "规格名称", "商品规格"],
  shortName: ["shortName", "商品简称"],
  remark: ["remark", "商品备注"],
  skuRemark: ["skuRemark", "规格备注"],
  wholesalePrice: ["wholesalePrice", "规格批发价(元)", "商品批发价(元)", "批发价（元）", "批发价"],
  purchasePrice: ["purchasePrice", "规格成本价(元)", "商品成本价(元)", "成本价（元）", "成本价", "采购价"],
  salePrice: ["salePrice", "规格销售价(元)", "商品销售价(元)", "销售价（元）", "销售价", "售价"],
  weight: ["weight", "规格重量(千克)", "商品重量(千克)", "重量（kg）", "重量"],
  category: ["category", "规格类目", "商品分类", "商品类目", "分类"],
  brand: ["brand", "规格品牌", "商品品牌", "品牌"],
  componentProductCode: ["componentProductCode", "单品主商家编码", "子商品主商家编码", "组成商品主商家编码"],
  componentSkuCode: ["componentSkuCode", "单品规格商家编码", "子商品规格商家编码", "子商品商家编码", "组成规格商家编码"],
  componentName: ["componentName", "单品名称", "子商品名称", "组成商品名称"],
  componentSpecification: ["componentSpecification", "单品规格", "子商品规格", "组成规格"],
  componentQuantity: ["componentQuantity", "组合比例", "单品数量", "组成数量", "数量"],
  componentCost: ["componentCost", "子商品供应商进价", "单品成本价", "组成成本价"],
  quantity: ["quantity", "数量", "净销量", "销售数量", "库存数量", "可用库存", "变动数量", "采购数量", "退款数量"],
  netQuantity: ["netQuantity", "净销量"],
  grossQuantity: ["grossQuantity", "销售数量"],
  returnQuantity: ["returnQuantity", "退货数量"],
  amount: ["amount", "金额", "实发金额", "付款金额", "采购金额", "退款金额"],
  paidAmount: ["paidAmount", "商品买家已付金额", "订单买家已付金额", "买家已付金额"],
  grossSales: ["grossSales", "销售金额"],
  netSales: ["netSales", "净销售额"],
  salesCost: ["salesCost", "销售成本"],
  returnCost: ["returnCost", "退货成本"],
  netCost: ["netCost", "净销售成本"],
  refundAmount: ["refundAmount", "退款金额", "退款"],
  grossProfit: ["grossProfit", "净销售毛利", "净毛利"],
  preShipRefundRate: ["preShipRefundRate", "发货前退款率"],
  postShipRefundRate: ["postShipRefundRate", "发货后退款率"],
  status: ["status", "订单状态", "商品状态", "采购状态", "售后状态"],
  platform: ["platform", "所属平台", "平台", "来源平台"],
  shopName: ["shopName", "店铺名称", "店铺"],
  warehouseName: ["warehouseName", "仓库名称", "仓库"],
  supplierCode: ["supplierCode", "供应商编号", "供应商编码"],
  supplierName: ["supplierName", "供应商名称"],
  documentNumber: ["documentNumber", "采购单号", "采购订单号", "出入库单号", "单据编号", "售后单号", "退款单号"],
  movementType: ["movementType", "出入库类型", "业务类型", "单据类型"]
});

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
    if (PERSONAL_DATA_KEY_PATTERN.test(key)) fail("ERP_COLLECTION_PERSONAL_DATA_FIELD", `原始记录不允许包含个人信息字段：${path}.${key}`);
    assertNoSecrets(child, `${path}.${key}`);
  }
}

function minimalIndex(value) {
  const result = {};
  for (const [standardKey, aliases] of Object.entries(INDEX_FIELDS)) {
    const alias = aliases.find(key => value[key] !== undefined && value[key] !== null && String(value[key]).trim() !== "");
    if (alias) result[standardKey] = typeof value[alias] === "number" ? value[alias] : text(value[alias], 320);
  }
  return result;
}

function normalizeRecord(record, resourceType, index) {
  if (!record || typeof record !== "object" || Array.isArray(record)) fail("ERP_COLLECTION_RECORD_INVALID", `第 ${index + 1} 条记录格式无效。`);
  const sourceKey = text(record.sourceKey, 320);
  if (!sourceKey) fail("ERP_COLLECTION_SOURCE_KEY_REQUIRED", `第 ${index + 1} 条记录缺少稳定来源键。`);
  const payload = record.index || record.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) fail("ERP_COLLECTION_PAYLOAD_REQUIRED", `第 ${index + 1} 条记录缺少标准索引对象。`);
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
    payload: minimalIndex(payload)
  };
}

function normalizeArchive(rawArchive, batch) {
  if (rawArchive === undefined || rawArchive === null) return null;
  if (typeof rawArchive !== "object" || Array.isArray(rawArchive)) fail("ERP_COLLECTION_ARCHIVE_INVALID", "归档清单格式无效。");
  const archiveHash = hash(rawArchive.contentHash);
  if (archiveHash !== batch.contentHash) fail("ERP_COLLECTION_ARCHIVE_HASH_MISMATCH", "归档哈希必须与批次文件哈希一致。");
  const relativePath = text(rawArchive.relativePath, 500).replace(/\\/g, "/");
  if (!relativePath.startsWith("原始归档/") || relativePath.includes("../") || relativePath.startsWith("/")) {
    fail("ERP_COLLECTION_ARCHIVE_PATH_INVALID", "归档清单只接受原始归档目录内的相对路径。");
  }
  const storageType = text(rawArchive.storageType || "local_desktop", 40);
  if (storageType !== "local_desktop") fail("ERP_COLLECTION_ARCHIVE_STORAGE_INVALID", "当前只支持公司 Mac 本地原始归档。");
  return {
    id: text(rawArchive.id, 320) || `kuaimai-archive-${archiveHash.slice(0, 24)}`,
    platformId: batch.platformId,
    resourceType: batch.resourceType,
    contentHash: archiveHash,
    fileName: text(rawArchive.fileName || batch.sourceFileName, 240),
    sizeBytes: Math.max(0, Math.trunc(Number(rawArchive.sizeBytes) || 0)),
    relativePath,
    storageType,
    runnerId: nullableText(rawArchive.runnerId, 320),
    status: ["archived", "processing", "processed", "failed"].includes(rawArchive.status) ? rawArchive.status : "archived",
    archivedAt: timestamp(rawArchive.archivedAt || batch.collectedAt, { required: true, label: "归档时间" }),
    processedAt: timestamp(rawArchive.processedAt, { label: "处理时间" }),
    errorCode: nullableText(rawArchive.errorCode, 120)
  };
}

export function normalizeErpArchive(rawArchive) {
  if (!rawArchive || typeof rawArchive !== "object" || Array.isArray(rawArchive)) fail("ERP_COLLECTION_ARCHIVE_INVALID", "归档清单格式无效。");
  const platformId = text(rawArchive.platformId || "kuaimai", 80).toLowerCase();
  if (platformId !== "kuaimai") fail("ERP_COLLECTION_PLATFORM_INVALID", "当前采集器只接受快麦 ERP 官方导出数据。");
  const resourceType = text(rawArchive.resourceType, 80).toLowerCase();
  if (!RESOURCE_TYPES.has(resourceType)) fail("ERP_COLLECTION_RESOURCE_INVALID", "资源类型未登记。", { supported: KUAIMAI_ERP_RESOURCE_TYPES });
  const contentHash = hash(rawArchive.contentHash);
  return normalizeArchive(rawArchive, {
    platformId,
    resourceType,
    contentHash,
    sourceFileName: text(rawArchive.fileName, 240),
    collectedAt: timestamp(rawArchive.archivedAt || new Date().toISOString(), { required: true, label: "归档时间" })
  });
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
  const batch = {
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
  };
  return {
    idempotencyKey: text(idempotencyKey, 160),
    archive: normalizeArchive(input.archive, batch),
    batch,
    records: normalizedRecords,
    issues: normalizedIssues
  };
}

function normalizeSalesFactsChunk(rawChunk) {
  if (rawChunk === undefined || rawChunk === null) return null;
  if (typeof rawChunk !== "object" || Array.isArray(rawChunk)) {
    fail("ERP_COLLECTION_SALES_FACTS_CHUNK_INVALID", "销售事实分块信息格式无效。");
  }
  const index = Math.trunc(Number(rawChunk.index));
  const total = Math.trunc(Number(rawChunk.total));
  if (!Number.isInteger(index) || !Number.isInteger(total) || index < 1 || total < index) {
    fail("ERP_COLLECTION_SALES_FACTS_CHUNK_INVALID", "销售事实分块序号必须从 1 开始且不超过总包数。");
  }
  if (total > MAX_SALES_FACTS_CHUNKS) {
    fail("ERP_COLLECTION_SALES_FACTS_TOO_LARGE", `单批最多分 ${MAX_SALES_FACTS_CHUNKS} 包上传标准销售事实。`);
  }
  return { index, total };
}

function normalizeSalesFactsReplaceDates(rawDates, chunk, facts) {
  if (rawDates === undefined || rawDates === null) {
    // 多包分块的首包必须携带完整日期列表：服务端先按这些日期整体删除，
    // 后续包只插入，避免第二包把第一包已写入的数据删掉。
    if (chunk && chunk.total > 1 && chunk.index === 1) {
      fail("ERP_COLLECTION_SALES_FACTS_DATES_REQUIRED", "分块上传的首包必须携带完整重写日期列表。");
    }
    return null;
  }
  if (!Array.isArray(rawDates) || !rawDates.length) {
    fail("ERP_COLLECTION_SALES_FACTS_DATES_INVALID", "重写日期列表不能为空。");
  }
  if (chunk && chunk.index > 1) {
    fail("ERP_COLLECTION_SALES_FACTS_DATES_INVALID", "只有分块首包允许携带重写日期列表，后续包只能插入。");
  }
  if (rawDates.length > MAX_SALES_FACTS_REPLACE_DATES) {
    fail("ERP_COLLECTION_SALES_FACTS_DATES_INVALID", `单批最多重写 ${MAX_SALES_FACTS_REPLACE_DATES} 个日期。`);
  }
  const dates = [...new Set(rawDates.map(value => {
    const day = text(value, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      fail("ERP_COLLECTION_SALES_FACTS_DATES_INVALID", "重写日期必须是 YYYY-MM-DD 格式。");
    }
    return day;
  }))].sort();
  const covered = new Set(dates);
  if (facts.some(fact => !covered.has(fact.date))) {
    fail("ERP_COLLECTION_SALES_FACTS_DATES_INVALID", "重写日期列表必须覆盖本包所有销售事实的日期。");
  }
  return dates;
}

export function normalizeErpSalesFactsPayload(input, { idempotencyKey = "" } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("ERP_COLLECTION_BODY_INVALID", "请求内容必须是 JSON 对象。");
  if (text(input.batch?.resourceType, 80).toLowerCase() !== "sales_items") {
    fail("ERP_COLLECTION_RESOURCE_INVALID", "销售事实投影只接受 sales_items 资源。");
  }
  if (text(input.batch?.status, 40) !== "completed") {
    fail("ERP_COLLECTION_BATCH_PARTIAL", "销售明细批次未通过完整性校验，不能写入标准事实。");
  }
  const rawFacts = Array.isArray(input.facts) ? input.facts : [];
  if (!rawFacts.length) fail("ERP_COLLECTION_SALES_FACTS_EMPTY", "销售明细没有可写入的标准事实。");
  const chunk = normalizeSalesFactsChunk(input.chunk);
  const packLimit = chunk ? MAX_SALES_FACTS_PER_PACK : MAX_SALES_FACTS_LEGACY_PACK;
  if (rawFacts.length > packLimit) {
    fail("ERP_COLLECTION_SALES_FACTS_TOO_LARGE", `单包最多写入 ${packLimit} 条标准销售事实。`);
  }
  const facts = rawFacts.map((fact, index) => {
    if (!fact || typeof fact !== "object" || Array.isArray(fact)) fail("ERP_COLLECTION_SALES_FACT_INVALID", `第 ${index + 1} 条销售事实格式无效。`);
    const code = text(fact.code, 32);
    const date = text(fact.date, 10);
    if (!/^69\d{10,12}$/.test(code) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      fail("ERP_COLLECTION_SALES_FACT_INVALID", `第 ${index + 1} 条销售事实缺少有效 69 码或日期。`);
    }
    return {
      code,
      date,
      platform: text(fact.platform || "未知平台", 120),
      qty: Number(fact.qty) || 0,
      sales: Number(fact.sales) || 0,
      netSales: Number(fact.netSales) || 0,
      grossProfit: Number(fact.grossProfit) || 0,
      refund: Number(fact.refund) || 0,
      cost: Number(fact.cost) || 0,
      preShipRefund: Number(fact.preShipRefund) || 0,
      postShipRefund: Number(fact.postShipRefund) || 0
    };
  });
  const base = normalizeErpCollectionPayload({
    batch: input.batch,
    archive: input.archive,
    issues: input.issues,
    records: [{
      sourceKey: "projected-sales-validation",
      occurredAt: `${facts[0].date}T00:00:00+08:00`,
      contentHash: input.batch.contentHash,
      payload: { barcode: facts[0].code }
    }]
  }, { idempotencyKey });
  if (base.issues.some(issue => issue.severity === "error")) {
    fail("ERP_COLLECTION_BATCH_PARTIAL", "销售明细仍有阻断性校验错误，不能写入标准事实。");
  }
  const replaceDates = normalizeSalesFactsReplaceDates(input.replaceDates, chunk, facts);
  return { ...base, records: [], facts, chunk, replaceDates };
}
