import { createHash } from "node:crypto";
import { File } from "node:buffer";
import { basename } from "node:path";
import { readFile } from "node:fs/promises";
import { streamSpreadsheetRows } from "../../src/domain/xlsxLite.js";

const RESOURCE_SCHEMAS = {
  orders: {
    identities: [["系统订单号", "系统单号", "订单编号", "订单号", "交易号"]],
    occurredAt: ["订单创建时间", "创建时间", "下单时间", "交易创建时间"],
    modifiedAt: ["订单修改时间", "修改时间", "更新时间"],
    shop: ["店铺ID", "店铺编号", "店铺名称", "店铺"],
    warehouse: ["仓库ID", "仓库编号", "仓库名称", "仓库"]
  },
  order_items: {
    identities: [
      ["订单明细ID", "明细ID", "子订单号"],
      ["系统订单号", "系统单号", "订单编号", "订单号"],
      ["系统规格ID", "规格ID", "SKU ID", "商家编码", "规格编码", "SKU编码"]
    ],
    occurredAt: ["订单创建时间", "创建时间", "下单时间", "交易创建时间"],
    modifiedAt: ["订单修改时间", "修改时间", "更新时间"],
    shop: ["店铺ID", "店铺编号", "店铺名称", "店铺"],
    warehouse: ["仓库ID", "仓库编号", "仓库名称", "仓库"]
  },
  products: {
    identities: [["系统商品ID", "商品ID", "主商家编码", "商品编码", "商家编码"]],
    modifiedAt: ["修改时间", "更新时间"],
    shop: ["店铺ID", "店铺编号", "店铺名称", "店铺"]
  },
  skus: {
    identities: [["系统规格ID", "规格ID", "SKU ID", "商家编码", "规格编码", "SKU编码", "69码", "条码"]],
    modifiedAt: ["修改时间", "更新时间"],
    shop: ["店铺ID", "店铺编号", "店铺名称", "店铺"]
  },
  inventory_snapshot: {
    identities: [
      ["仓库ID", "仓库编号", "仓库名称", "仓库"],
      ["系统规格ID", "规格ID", "SKU ID", "商家编码", "规格编码", "SKU编码", "69码", "条码"]
    ],
    modifiedAt: ["库存更新时间", "修改时间", "更新时间", "盘点时间"],
    warehouse: ["仓库ID", "仓库编号", "仓库名称", "仓库"]
  },
  inventory_movements: {
    identities: [
      ["出入库单号", "单据编号", "业务单号", "库存流水号"],
      ["明细ID", "系统规格ID", "规格ID", "SKU ID", "商家编码", "规格编码", "SKU编码"]
    ],
    occurredAt: ["出入库时间", "业务时间", "创建时间", "审核时间"],
    modifiedAt: ["修改时间", "更新时间"],
    warehouse: ["仓库ID", "仓库编号", "仓库名称", "仓库"]
  },
  suppliers: {
    identities: [["供应商ID", "供应商编号", "供应商编码", "供应商名称"]],
    modifiedAt: ["修改时间", "更新时间"]
  },
  purchase_orders: {
    identities: [["采购单号", "采购订单号", "单据编号"]],
    occurredAt: ["采购时间", "创建时间", "下单时间", "审核时间"],
    modifiedAt: ["修改时间", "更新时间"],
    warehouse: ["仓库ID", "仓库编号", "仓库名称", "仓库"]
  },
  aftersales: {
    identities: [["售后单号", "退款单号", "售后编号", "系统售后单号"]],
    occurredAt: ["申请时间", "售后创建时间", "创建时间"],
    modifiedAt: ["修改时间", "更新时间", "处理时间"],
    shop: ["店铺ID", "店铺编号", "店铺名称", "店铺"]
  },
  shops: {
    identities: [["店铺ID", "店铺编号", "店铺名称", "店铺"]],
    modifiedAt: ["修改时间", "更新时间"]
  },
  warehouses: {
    identities: [["仓库ID", "仓库编号", "仓库名称", "仓库"]],
    modifiedAt: ["修改时间", "更新时间"]
  },
  finance: {
    identities: [["结算单号", "账单编号", "单据编号", "流水号"]],
    occurredAt: ["结算时间", "账单时间", "业务时间", "创建时间"],
    modifiedAt: ["修改时间", "更新时间"],
    shop: ["店铺ID", "店铺编号", "店铺名称", "店铺"]
  }
};

export class KuaimaiExportError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "KuaimaiExportError";
    this.code = code;
    this.details = details;
  }
}

function cleanHeader(value) {
  return String(value ?? "").replace(/^\ufeff/, "").replace(/\s+/g, "").trim();
}

function displayHeader(value, index) {
  return String(value ?? "").replace(/^\ufeff/, "").trim() || `未命名列${index + 1}`;
}

function valueText(value) {
  return String(value ?? "").trim();
}

function findColumn(headers, aliases = []) {
  const normalized = headers.map(cleanHeader);
  for (const alias of aliases) {
    const index = normalized.indexOf(cleanHeader(alias));
    if (index >= 0) return index;
  }
  return -1;
}

function resolveColumns(headers, schema) {
  const identityColumns = schema.identities.map(aliases => findColumn(headers, aliases)).filter(index => index >= 0);
  return {
    identityColumns,
    occurredAt: findColumn(headers, schema.occurredAt),
    modifiedAt: findColumn(headers, schema.modifiedAt),
    shop: findColumn(headers, schema.shop),
    warehouse: findColumn(headers, schema.warehouse)
  };
}

function headerScore(row, schema) {
  const columns = resolveColumns(row, schema);
  return columns.identityColumns.length * 4
    + (columns.occurredAt >= 0 ? 3 : 0)
    + (columns.modifiedAt >= 0 ? 1 : 0)
    + (columns.shop >= 0 ? 1 : 0)
    + (columns.warehouse >= 0 ? 1 : 0);
}

function shanghaiTimestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = Math.round((value - 25569) * 86400 * 1000);
    const date = new Date(milliseconds);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    const hour = String(date.getUTCHours()).padStart(2, "0");
    const minute = String(date.getUTCMinutes()).padStart(2, "0");
    const second = String(date.getUTCSeconds()).padStart(2, "0");
    return `${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`;
  }
  const raw = valueText(value);
  const local = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:\s+|T)(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/.exec(raw);
  if (local) {
    const [, year, month, day, hour, minute, second = "0"] = local;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:${second.padStart(2, "0")}+08:00`;
  }
  if (!Number.isNaN(Date.parse(raw))) return raw;
  return null;
}

function rowPayload(headers, row) {
  return Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]));
}

function rowHash(payload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function sourceFile(input) {
  if (typeof input !== "string") {
    if (input?.arrayBuffer && input?.name) return input;
    throw new KuaimaiExportError("KUAIMAI_EXPORT_FILE_REQUIRED", "请提供快麦导出的 XLSX 或 CSV 文件。");
  }
  const buffer = await readFile(input);
  return new File([buffer], basename(input));
}

async function fileHash(file) {
  return createHash("sha256").update(new Uint8Array(await file.arrayBuffer())).digest("hex");
}

export async function readKuaimaiExport(input, { resourceType = "orders", collectedAt = new Date().toISOString() } = {}) {
  const schema = RESOURCE_SCHEMAS[resourceType];
  if (!schema) throw new KuaimaiExportError("KUAIMAI_EXPORT_RESOURCE_INVALID", `不支持的资源类型：${resourceType}`);
  const file = await sourceFile(input);
  const rows = [];
  await streamSpreadsheetRows(file, row => {
    if (row.some(value => valueText(value))) rows.push(row);
  });
  if (!rows.length) throw new KuaimaiExportError("KUAIMAI_EXPORT_EMPTY", "导出文件没有数据行。");
  let headerIndex = -1;
  let bestScore = -1;
  for (let index = 0; index < Math.min(rows.length, 30); index += 1) {
    const score = headerScore(rows[index], schema);
    if (score > bestScore) {
      bestScore = score;
      headerIndex = index;
    }
  }
  const headers = rows[headerIndex].map(displayHeader);
  const columns = resolveColumns(headers, schema);
  const missing = [];
  if (!columns.identityColumns.length) missing.push("稳定来源编号");
  if (schema.occurredAt && columns.occurredAt < 0) missing.push("业务发生时间/订单创建时间");
  if (missing.length) {
    throw new KuaimaiExportError("KUAIMAI_EXPORT_REQUIRED_COLUMNS_MISSING", `导出文件缺少必需列：${missing.join("、")}`, { headers });
  }

  const recordsByKey = new Map();
  const issues = [];
  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row.some(value => valueText(value))) continue;
    const identity = columns.identityColumns.map(index => valueText(row[index])).filter(Boolean);
    if (!identity.length) {
      issues.push({ code: "SOURCE_KEY_MISSING", severity: "error", message: `第 ${rowIndex + 1} 行缺少稳定来源编号。`, details: { rowNumber: rowIndex + 1 } });
      continue;
    }
    const occurredAt = columns.occurredAt >= 0 ? shanghaiTimestamp(row[columns.occurredAt]) : null;
    if (schema.occurredAt && !occurredAt) {
      issues.push({ sourceKey: identity.join("::"), code: "OCCURRED_AT_INVALID", severity: "error", message: `第 ${rowIndex + 1} 行缺少有效业务发生时间。`, details: { rowNumber: rowIndex + 1 } });
      continue;
    }
    const payload = rowPayload(headers, row);
    const sourceKey = identity.join("::");
    if (recordsByKey.has(sourceKey)) {
      issues.push({ sourceKey, code: "DUPLICATE_SOURCE_KEY", severity: "warning", message: `文件中来源键 ${sourceKey} 重复，保留最后一行。`, details: { rowNumber: rowIndex + 1 } });
    }
    recordsByKey.set(sourceKey, {
      sourceKey,
      occurredAt,
      modifiedAt: columns.modifiedAt >= 0 ? shanghaiTimestamp(row[columns.modifiedAt]) : null,
      shopId: columns.shop >= 0 ? valueText(row[columns.shop]) : null,
      warehouseId: columns.warehouse >= 0 ? valueText(row[columns.warehouse]) : null,
      contentHash: rowHash(payload),
      payload
    });
  }
  const records = [...recordsByKey.values()];
  if (!records.length) throw new KuaimaiExportError("KUAIMAI_EXPORT_NO_VALID_RECORDS", "导出文件没有通过校验的有效记录。", { issues });
  const timestamps = records.map(record => record.occurredAt).filter(Boolean).sort();
  const contentHash = await fileHash(file);
  return {
    batch: {
      id: `kuaimai-${resourceType}-${contentHash.slice(0, 24)}`,
      platformId: "kuaimai",
      resourceType,
      sourceFileName: file.name,
      contentHash,
      schemaVersion: "v1",
      rangeStart: timestamps[0] || null,
      rangeEnd: timestamps.at(-1) || null,
      rowCount: records.length,
      status: issues.some(issue => issue.severity === "error") ? "partial" : "completed",
      collectedAt
    },
    headers,
    records,
    issues,
    preview: records.slice(0, 3).map(record => ({ sourceKey: record.sourceKey, occurredAt: record.occurredAt, shopId: record.shopId }))
  };
}
