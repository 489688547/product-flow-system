const DATA_SOURCE = "dingtalk-supply-folder";

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const normalized = text(value).replace(/,/g, "");
  if (!normalized || normalized === "/") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function sourceRow(value, fallback) {
  const match = text(value).match(/^\[row=(\d+)\]\s*/);
  return match ? Number(match[1]) : fallback;
}

function withoutSourceRow(value) {
  return text(value).replace(/^\[row=\d+\]\s*/, "");
}

function safeIdPart(value) {
  return text(value).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function recordId(kind, meta, rowNumber) {
  return `${kind}-${safeIdPart(meta.nodeId)}-${safeIdPart(meta.sheetId)}-${rowNumber}`;
}

function evidence(meta, rowNumber) {
  return {
    dataSource: DATA_SOURCE,
    sourceDocument: text(meta.documentName),
    sourceNodeId: text(meta.nodeId),
    sourceSheet: text(meta.sheetName || meta.sheetId),
    sourceRow: rowNumber,
    importedAt: text(meta.importedAt) || new Date().toISOString()
  };
}

function supplierCategory(sourceCategory) {
  const value = text(sourceCategory);
  if (value.includes("快递") || value.includes("服务") || value.includes("加工")) return "加工";
  if (value.includes("产品耗材") || value.includes("包装袋") || value.includes("包装盒") || value.includes("贴纸")) return "包材";
  if (value.includes("打包耗材") || value.includes("快递箱")) return "耗材";
  if (value === "成品") return "成品";
  if (value.includes("原料")) return "原料";
  return "原料";
}

export function parseCsv(csv = "") {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const input = String(csv || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field); field = "";
    } else if (character === "\n" && !quoted) {
      row.push(field); rows.push(row); row = []; field = "";
    } else {
      field += character;
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.map((values, index) => ({
    rowNumber: sourceRow(values[0], index + 1),
    values: [withoutSourceRow(values[0]), ...values.slice(1).map(text)]
  }));
}

export function parseSupplierCsv(csv, meta = {}) {
  const rows = parseCsv(csv);
  const records = [];
  let skipped = 0;
  let sourceCategory = "";
  for (const { rowNumber, values } of rows) {
    if (text(values[0])) sourceCategory = text(values[0]);
    const name = text(values[1]);
    const supplyScope = text(values[2]);
    const isHeader = rowNumber === 1 || name.includes("供应商名称");
    const isSectionMarker = name.endsWith("对接供应商") && !supplyScope;
    if (!name || isHeader || isSectionMarker) { skipped += 1; continue; }
    records.push({
      id: recordId("supplier", meta, rowNumber),
      code: `DT-SUP-${String(rowNumber).padStart(3, "0")}`,
      name,
      category: supplierCategory(sourceCategory),
      sourceCategory,
      supplyScope,
      status: "active",
      ...evidence(meta, rowNumber)
    });
  }
  return { records, skipped };
}

function excelDate(value) {
  const numeric = number(value);
  if (numeric !== null && numeric > 20000 && numeric < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + numeric * 86400000).toISOString().slice(0, 10);
  }
  const normalized = text(value).replace(/[./]/g, "-");
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : "";
}

function monthDay(value, year) {
  const match = text(value).match(/(\d{1,2})月(\d{1,2})日/);
  if (!match) return excelDate(value);
  return `${year}-${String(match[1]).padStart(2, "0")}-${String(match[2]).padStart(2, "0")}`;
}

function reliableSku(value) {
  const sku = text(value).replace(/\.0$/, "");
  if (!/^\d{8,18}$/.test(sku)) return { skuCode: sku, skuMatchStatus: "invalid" };
  if (/0{6,}$/.test(sku)) return { skuCode: sku, skuMatchStatus: "source-rounded" };
  return { skuCode: sku, skuMatchStatus: "exact" };
}

export function parseStocktakeCsv(csv, meta = {}) {
  const rows = parseCsv(csv);
  const records = [];
  let skipped = 0;
  for (const { rowNumber, values } of rows) {
    const [sequence, dateValue, countLabel, productName, barcode, erpValue, countedValue] = values;
    const erpQuantity = number(erpValue);
    const countedQuantity = number(countedValue);
    if (!/^\d+$/.test(text(sequence)) || !text(productName) || erpQuantity === null || countedQuantity === null) { skipped += 1; continue; }
    records.push({
      id: recordId("stocktake", meta, rowNumber),
      productId: "",
      productName: text(productName),
      ...reliableSku(barcode),
      warehouse: text(meta.warehouse),
      stocktakeDate: excelDate(dateValue) || text(meta.snapshotDate),
      stocktakeRound: text(countLabel),
      erpQuantity,
      countedQuantity,
      quantityVariance: countedQuantity - erpQuantity,
      inventoryAmount: null,
      sourceType: "dingtalk-stocktake-import",
      ...evidence(meta, rowNumber)
    });
  }
  return { records, skipped };
}

export function parseFinishedInventoryCsv(csv, meta = {}) {
  const rows = parseCsv(csv);
  const records = [];
  let skipped = 0;
  for (const { rowNumber, values } of rows) {
    const [productName, barcode, unitCostValue, erpValue, varianceValue, varianceAmountValue, countedValue, inventoryAmountValue, returnQuantityValue, returnAmountValue] = values;
    const erpQuantity = number(erpValue);
    const countedQuantity = number(countedValue);
    if (rowNumber <= 3 || !text(productName) || erpQuantity === null || countedQuantity === null) { skipped += 1; continue; }
    records.push({
      id: recordId("finished", meta, rowNumber),
      productId: "",
      productName: text(productName),
      ...reliableSku(barcode),
      warehouse: text(meta.warehouse),
      stocktakeDate: text(meta.snapshotDate),
      erpQuantity,
      countedQuantity,
      quantityVariance: number(varianceValue) ?? countedQuantity - erpQuantity,
      inventoryVarianceAmount: number(varianceAmountValue),
      inventoryAmount: number(inventoryAmountValue),
      unitCost: number(unitCostValue),
      returnQuantity: number(returnQuantityValue),
      returnAmount: number(returnAmountValue),
      sourceType: "dingtalk-finished-inventory",
      ...evidence(meta, rowNumber)
    });
  }
  return { records, skipped };
}

export function parseMaterialInventoryCsv(csv, meta = {}) {
  const rows = parseCsv(csv);
  const records = [];
  let skipped = 0;
  let productCategory = "";
  let productSkuCode = "";
  let productName = "";
  for (const { rowNumber, values } of rows) {
    if (rowNumber === 1) { skipped += 1; continue; }
    if (text(values[0])) productCategory = text(values[0]);
    if (text(values[1])) productSkuCode = reliableSku(values[1]).skuCode;
    if (text(values[2])) productName = text(values[2]);
    const materialName = text(values[3]);
    const quantity = number(values[4]);
    const unitCost = number(values[5]);
    const inventoryAmount = number(values[6]);
    if (!productName || !materialName || quantity === null || inventoryAmount === null) { skipped += 1; continue; }
    records.push({
      id: recordId("material", meta, rowNumber),
      productId: "",
      productCategory,
      productSkuCode,
      productName,
      materialName,
      quantity,
      unitCost,
      inventoryAmount,
      warehouse: text(meta.warehouse),
      snapshotDate: text(meta.snapshotDate),
      note: text(values[7]),
      sourceType: "dingtalk-material-inventory",
      ...evidence(meta, rowNumber)
    });
  }
  return { records, skipped };
}

export function parseInventoryRiskCsv(csv, meta = {}) {
  const rows = parseCsv(csv);
  const records = [];
  let skipped = 0;
  for (const { rowNumber, values } of rows) {
    const [productName, barcode, sellableDaysValue, arrivalDateValue, arrivalQuantityValue, sourceStatus, note] = values;
    const sellableDays = number(sellableDaysValue);
    if (rowNumber <= 2 || !text(productName) || sellableDays === null) { skipped += 1; continue; }
    records.push({
      id: recordId("risk", meta, rowNumber),
      productId: "",
      productName: text(productName),
      ...reliableSku(barcode),
      sellableDays,
      estimatedArrivalDate: monthDay(arrivalDateValue, Number(meta.year) || new Date().getFullYear()),
      estimatedArrivalQuantity: number(arrivalQuantityValue),
      sourceStatus: text(sourceStatus),
      status: text(sourceStatus).includes("解除") ? "resolved" : "active",
      note: text(note),
      sourceType: "dingtalk-inventory-risk",
      ...evidence(meta, rowNumber)
    });
  }
  return { records, skipped };
}

export function mergeImportedRecords(current = [], imported = []) {
  const result = new Map((current || []).map(record => [record.id, record]));
  for (const record of imported || []) result.set(record.id, { ...(result.get(record.id) || {}), ...record });
  return [...result.values()];
}
