import { isSalesBarcode } from "./salesData.js";

const SKU_ARRAY_KEYS = ["skus", "items", "itemSkus"];
const ROW_FIELDS = {
  sourceProductId: ["系统主商品ID", "系统商品ID", "sysItemId"],
  sourceSkuId: ["系统规格ID", "系统SKU ID", "sysSkuId"],
  merchantCode: ["主商家编码", "平台商家编码", "商家编码", "outerId"],
  merchantSkuCode: ["规格商家编码", "SKU商家编码", "skuOuterId"],
  name: ["商品名称", "产品名称", "title"],
  shortName: ["商品简称", "shortTitle"],
  remark: ["商品备注", "remark"],
  specification: ["规格", "规格名称", "颜色属性", "propertiesName"],
  specificationAlias: ["规格别名", "propertiesAlias"],
  skuRemark: ["规格备注", "skuRemark"],
  barcode: ["69码", "规格条形码", "商品条形码", "条形码", "条码", "商品条码", "barcode"],
  wholesalePrice: ["规格批发价(元)", "商品批发价(元)", "批发价", "wholesalePrice"],
  purchasePrice: ["规格成本价(元)", "商品成本价(元)", "成本价", "采购价", "purchasePrice"],
  otherPrice1: ["其他价格1", "otherPrice1"],
  salePrice: ["规格销售价(元)", "商品销售价(元)", "销售价", "售价", "priceOutput", "sellingPrice"],
  weight: ["规格重量(千克)", "商品重量(千克)", "重量", "weight"],
  category: ["规格类目", "商品分类", "商品类目", "分类", "category"],
  brand: ["规格品牌", "商品品牌", "品牌", "brand"],
  supplierName: ["供应商", "供应商名称", "supplierName"],
  supplierCode: ["供应商商家编码", "供应商编码", "supplierCode"],
  status: ["商品状态", "规格状态", "状态", "activeStatus"]
};

function text(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function number(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(String(value).replaceAll(",", "").replace(/[¥￥元]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanStatus(value, fallback = true) {
  if (value === 0 || value === "0" || /^(停用|禁用|暂停|inactive|disabled)$/i.test(text(value))) return false;
  if (value === 1 || value === "1" || /^(启用|正常|active|enabled)$/i.test(text(value))) return true;
  return fallback;
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of text(value, 4000)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function sourceKey(value, fallback = "manual") {
  const normalized = text(value || fallback, 40).toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || fallback;
  if (["kuaimai", "kuaimai-file", "kuaimai-api"].includes(normalized)) return "kuaimai";
  return normalized;
}

function listValue(value) {
  if (Array.isArray(value)) return value.map(item => listValue(item)).filter(Boolean).join(" / ");
  if (value && typeof value === "object") return listValue(value.fullName || value.name || value.title || value.value || "");
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return listValue(parsed);
    } catch {
      // Preserve non-JSON category labels as entered by the source system.
    }
  }
  return text(value);
}

function categoryOf(input = {}) {
  const classify = input.classify || input.category || {};
  const classified = listValue(classify.fullName || classify.name || classify);
  if (classified) return classified;
  const sellers = Array.isArray(input.sellerCats) ? input.sellerCats : [];
  return sellers.map(item => listValue(item?.fullName || item?.name)).filter(Boolean).join(" / ");
}

function first(input, keys) {
  for (const key of keys) {
    if (input?.[key] !== undefined && input?.[key] !== null && text(input[key])) return input[key];
  }
  return "";
}

function skuInputsFor(item = {}) {
  for (const key of SKU_ARRAY_KEYS) {
    if (Array.isArray(item[key]) && item[key].length) return item[key];
  }
  return (item.barcode || item.skuOuterId || item.sysSkuId) ? [item] : [];
}

export function catalogBarcodeType(value) {
  const barcode = text(value, 80);
  if (!barcode) return "missing";
  return isSalesBarcode(barcode) ? "sales_barcode" : "non_standard";
}

export function normalizeCatalogSku(input = {}, context = {}) {
  const source = sourceKey(context.source || input.source);
  const productId = text(context.productId || input.productId, 160);
  const sourceSkuId = text(input.sourceSkuId || input.sysSkuId || input.id, 120);
  const merchantSkuCode = text(input.merchantSkuCode || input.skuOuterId || input.outerId, 160);
  const explicitBarcode = text(input.barcode, 80);
  const barcode = explicitBarcode || merchantSkuCode;
  const identity = merchantSkuCode
    ? `${source}:sku-code:${stableHash([productId, merchantSkuCode].join("|"))}`
    : sourceSkuId
      ? `${source}:sku:${sourceSkuId}`
      : `${source}:sku-file:${stableHash([productId, barcode].join("|"))}`;
  return {
    id: identity,
    productId,
    source,
    sourceSkuId,
    merchantSkuCode,
    barcode,
    barcodeSource: explicitBarcode ? "erp_barcode" : merchantSkuCode ? "merchant_sku_code" : "missing",
    barcodeType: catalogBarcodeType(barcode),
    specification: text(input.specification || input.propertiesName, 240),
    specificationAlias: text(input.specificationAlias || input.propertiesAlias, 240),
    shortName: text(input.shortName || input.shortTitle, 160),
    remark: text(input.skuRemark || input.remark, 500),
    imageUrl: text(input.imageUrl || input.skuPicPath || input.picPath, 1000),
    unit: text(input.unit, 40),
    weight: number(input.weight),
    purchasePrice: number(input.purchasePrice),
    salePrice: number(input.salePrice ?? input.priceOutput ?? input.sellingPrice),
    wholesalePrice: number(input.wholesalePrice),
    otherPrice1: number(input.otherPrice1),
    category: text(input.category || context.category, 240),
    brand: text(input.brand || context.brand, 120),
    supplierName: text(input.supplierName, 160),
    supplierCode: text(input.supplierCode, 120),
    hasSupplier: Boolean(Number(input.hasSupplier) || input.supplierName),
    active: booleanStatus(input.active ?? input.activeStatus, context.active ?? true),
    sourceCreatedAt: text(input.sourceCreatedAt || input.created, 80),
    sourceModifiedAt: text(input.sourceModifiedAt || input.modified, 80),
    syncedAt: text(context.syncedAt || input.syncedAt, 80)
  };
}

export function normalizeCatalogItem(input = {}, context = {}) {
  const source = sourceKey(context.source || input.source);
  const sourceProductId = text(input.sourceProductId || input.sysItemId || input.id, 120);
  const merchantCode = text(input.merchantCode || input.outerId, 160);
  const id = merchantCode
    ? `${source}:item-code:${stableHash(merchantCode)}`
    : sourceProductId
      ? `${source}:item:${sourceProductId}`
      : `${source}:item-file:${stableHash(input.name || input.title)}`;
  const category = text(categoryOf(input), 240);
  const brand = text(listValue(input.brand), 120);
  const active = booleanStatus(input.active ?? input.activeStatus, true);
  const skuMap = new Map();
  for (const skuInput of skuInputsFor(input)) {
    const sku = normalizeCatalogSku(skuInput, { source, productId: id, category, brand, active, syncedAt: context.syncedAt });
    const existing = skuMap.get(sku.id);
    skuMap.set(sku.id, existing ? { ...existing, ...Object.fromEntries(Object.entries(sku).filter(([, value]) => value !== "" && value !== null)) } : sku);
  }
  return {
    id,
    source,
    sourceProductId,
    merchantCode,
    name: text(input.name || input.title, 240) || merchantCode || "未命名商品",
    shortName: text(input.shortName || input.shortTitle, 160),
    remark: text(input.remark, 500),
    imageUrl: text(input.imageUrl || input.picPath, 1000),
    type: text(input.type, 80),
    typeTag: text(input.typeTag, 40),
    category,
    brand,
    supplierName: text(input.supplierName, 160),
    supplierCode: text(input.supplierCode, 120),
    hasSupplier: Boolean(Number(input.hasSupplier) || input.supplierName),
    active,
    presentInSource: input.presentInSource !== false,
    sourceCreatedAt: text(input.sourceCreatedAt || input.created, 80),
    sourceModifiedAt: text(input.sourceModifiedAt || input.modified, 80),
    syncedAt: text(context.syncedAt || input.syncedAt, 80),
    skus: [...skuMap.values()]
  };
}

function payloadItems(input = {}) {
  if (Array.isArray(input.items)) return input.items;
  if (typeof input.body === "string") {
    try {
      const parsed = JSON.parse(input.body);
      return Array.isArray(parsed?.items) ? parsed.items : [];
    } catch {
      return [];
    }
  }
  if (Array.isArray(input.body?.items)) return input.body.items;
  return [];
}

export function normalizeCatalogPayload(input = {}) {
  const source = sourceKey(input.source);
  const syncedAt = text(input.syncedAt, 80);
  const items = payloadItems(input).map(item => normalizeCatalogItem(item, { source, syncedAt }));
  const merged = new Map();
  for (const item of items) {
    const existing = merged.get(item.id);
    if (!existing) {
      merged.set(item.id, item);
      continue;
    }
    const skus = new Map([...existing.skus, ...item.skus].map(sku => [sku.id, sku]));
    merged.set(item.id, { ...existing, ...item, skus: [...skus.values()] });
  }
  const normalized = [...merged.values()];
  return {
    source,
    items: normalized,
    counts: {
      products: normalized.length,
      skus: normalized.reduce((sum, item) => sum + item.skus.length, 0),
      salesBarcodes: normalized.flatMap(item => item.skus).filter(sku => sku.barcodeType === "sales_barcode").length,
      nonStandardBarcodes: normalized.flatMap(item => item.skus).filter(sku => sku.barcodeType === "non_standard").length,
      missingBarcodes: normalized.flatMap(item => item.skus).filter(sku => sku.barcodeType === "missing").length
    }
  };
}

function usefulCatalogValue(value) {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function mergeCatalogFields(existing = {}, incoming = {}) {
  const result = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (usefulCatalogValue(value)) result[key] = value;
  }
  return result;
}

export function mergeCatalogRecords(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;
  const skuMap = new Map((existing.skus || []).map(sku => [sku.id, sku]));
  for (const sku of incoming.skus || []) skuMap.set(sku.id, mergeCatalogFields(skuMap.get(sku.id), sku));
  return { ...mergeCatalogFields(existing, incoming), skus: [...skuMap.values()] };
}

export function catalogBarcodesForProduct(items = [], productId = "") {
  const product = items.find(item => item.id === productId);
  if (!product) return [];
  return [...new Set((product.skus || []).filter(sku => sku.barcodeType === "sales_barcode").map(sku => sku.barcode))];
}

function catalogSkuCodes(item, storedCodes = []) {
  const stored = new Map((storedCodes || []).map(entry => {
    const record = typeof entry === "object" ? entry : { code: entry };
    return [text(record.code, 80), record];
  }));
  const byCode = new Map();
  for (const sku of item?.skus || []) {
    if (sku.barcodeType !== "sales_barcode" || !sku.barcode) continue;
    const existing = stored.get(sku.barcode);
    byCode.set(sku.barcode, {
      code: sku.barcode,
      price: existing?.price ?? sku.salePrice ?? ""
    });
  }
  return [...byCode.values()];
}

export function mergeProductCatalogLink(product = {}, catalogItem) {
  if (!catalogItem?.id) return { ...product, catalogProductId: "" };
  return {
    ...product,
    catalogProductId: catalogItem.id,
    skuCodes: catalogSkuCodes(catalogItem, product.skuCodes)
  };
}

export function catalogBackedProduct(product = {}, catalogItems = []) {
  const catalogProductId = text(product.catalogProductId, 160);
  if (!catalogProductId) return product;
  const item = catalogItems.find(candidate => candidate.id === catalogProductId);
  return item ? { ...product, skuCodes: catalogSkuCodes(item, product.skuCodes) } : product;
}

function rowRecord(row = {}) {
  return Object.fromEntries(Object.entries(ROW_FIELDS).map(([field, keys]) => [field, first(row, keys)]));
}

export function parseProductCatalogRows(rows = [], context = {}) {
  const source = sourceKey(context.source || "erp-file");
  const groups = new Map();
  const errors = [];
  rows.forEach((row, index) => {
    const record = rowRecord(row);
    const rowNumber = index + 2;
    const merchantCode = text(record.merchantCode, 160);
    const sourceProductId = text(record.sourceProductId, 120);
    if (!merchantCode && !sourceProductId) {
      errors.push({ rowNumber, field: "merchantCode", message: "缺少主商家编码或系统主商品 ID。" });
      return;
    }
    const groupKey = sourceProductId || merchantCode;
    const current = groups.get(groupKey) || {
      sourceProductId,
      merchantCode,
      name: record.name,
      shortName: record.shortName,
      remark: record.remark,
      category: record.category,
      brand: record.brand,
      supplierName: record.supplierName,
      supplierCode: record.supplierCode,
      active: booleanStatus(record.status, true),
      skus: []
    };
    current.skus.push({
      sourceSkuId: record.sourceSkuId,
      merchantSkuCode: record.merchantSkuCode || merchantCode,
      barcode: record.barcode,
      specification: record.specification,
      specificationAlias: record.specificationAlias,
      skuRemark: record.skuRemark,
      purchasePrice: record.purchasePrice,
      salePrice: record.salePrice,
      wholesalePrice: record.wholesalePrice,
      otherPrice1: record.otherPrice1,
      weight: record.weight,
      category: record.category,
      brand: record.brand,
      supplierName: record.supplierName,
      supplierCode: record.supplierCode,
      active: booleanStatus(record.status, true)
    });
    groups.set(groupKey, current);
  });
  const normalized = normalizeCatalogPayload({ source, items: [...groups.values()], syncedAt: context.syncedAt });
  return { ...normalized, errors, fileName: text(context.fileName, 240), sourceRows: rows.length };
}
