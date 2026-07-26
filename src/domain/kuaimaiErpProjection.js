function text(value, max = 320) {
  return String(value ?? "").trim().slice(0, max);
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(String(value).replaceAll(",", "").replace(/[¥￥元]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function firstValue(payload, aliases) {
  for (const alias of aliases) {
    if (payload?.[alias] !== undefined && payload?.[alias] !== null && text(payload[alias])) return payload[alias];
  }
  return "";
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

const SALES_BARCODE = /^69\d{10,12}$/;

function salesProjection(resourceType, records, batchId, now) {
  if (resourceType !== "sales_items") return { rows: [], exceptions: [] };
  const buckets = new Map();
  let unmapped = 0;
  for (const record of records) {
    const payload = record.payload || {};
    const codeCandidates = [
      firstValue(payload, ["barcode", "69码", "规格条形码", "商品条形码", "条码", "条形码"]),
      firstValue(payload, ["skuCode", "规格商家编码", "商家编码", "规格编码", "SKU编码"]),
      firstValue(payload, ["productCode", "主商家编码", "商品编码"])
    ].map(value => text(value, 160));
    const code = codeCandidates.find(value => SALES_BARCODE.test(value)) || "";
    const date = text(record.occurredAt, 40).slice(0, 10);
    if (!code || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      unmapped += 1;
      continue;
    }
    const platform = text(firstValue(payload, ["platform", "所属平台", "平台", "来源平台"]), 120) || "未知平台";
    const key = `${code}|${date}|${platform}`;
    const bucket = buckets.get(key) || {
      code,
      date,
      platform,
      qty: 0,
      sales: 0,
      netSales: 0,
      grossProfit: 0,
      refund: 0,
      cost: 0,
      preShipRefund: 0,
      postShipRefund: 0
    };
    const explicitQuantity = numberOrNull(firstValue(payload, ["netQuantity", "净销量"]));
    const grossQuantity = numberOrNull(firstValue(payload, ["grossQuantity", "销售数量"])) || 0;
    const returnQuantity = numberOrNull(firstValue(payload, ["returnQuantity", "退货数量"])) || 0;
    const refund = numberOrNull(firstValue(payload, ["refundAmount", "退款金额", "退款"])) || 0;
    const explicitNetSales = numberOrNull(firstValue(payload, ["netSales", "净销售额"]));
    const grossSales = numberOrNull(firstValue(payload, ["grossSales", "销售金额"])) || 0;
    const explicitNetCost = numberOrNull(firstValue(payload, ["netCost", "净销售成本"]));
    const salesCost = numberOrNull(firstValue(payload, ["salesCost", "销售成本"])) || 0;
    const returnCost = numberOrNull(firstValue(payload, ["returnCost", "退货成本"])) || 0;
    const netSales = explicitNetSales ?? (grossSales - refund);
    const cost = explicitNetCost ?? (salesCost - returnCost);
    const explicitGrossProfit = numberOrNull(firstValue(payload, ["grossProfit", "净销售毛利", "净毛利"]));
    const paidAmount = numberOrNull(firstValue(payload, ["paidAmount", "商品买家已付金额", "订单买家已付金额", "买家已付金额"])) || 0;
    const preShipRate = numberOrNull(firstValue(payload, ["preShipRefundRate", "发货前退款率"])) || 0;
    const postShipRate = numberOrNull(firstValue(payload, ["postShipRefundRate", "发货后退款率"])) || 0;
    bucket.qty += explicitQuantity ?? (grossQuantity - returnQuantity);
    bucket.sales += paidAmount;
    bucket.netSales += netSales;
    bucket.grossProfit += explicitGrossProfit ?? (netSales - cost);
    bucket.refund += refund;
    bucket.cost += cost;
    bucket.preShipRefund += (preShipRate > 1.5 ? preShipRate / 100 : preShipRate) * paidAmount;
    bucket.postShipRefund += (postShipRate > 1.5 ? postShipRate / 100 : postShipRate) * paidAmount;
    buckets.set(key, bucket);
  }
  const rows = [...buckets.values()]
    .map(row => ({
      ...row,
      qty: Math.round(row.qty),
      sales: round2(row.sales),
      netSales: round2(row.netSales),
      grossProfit: round2(row.grossProfit),
      refund: round2(row.refund),
      cost: round2(row.cost),
      preShipRefund: round2(row.preShipRefund),
      postShipRefund: round2(row.postShipRefund)
    }))
    .sort((left, right) => left.date.localeCompare(right.date) || left.code.localeCompare(right.code) || left.platform.localeCompare(right.platform));
  const exceptions = unmapped ? [{
    id: `kuaimai-sales-unmapped-${stablePart(batchId)}`,
    code: "SALES_CODE_UNMAPPED",
    severity: "warning",
    status: "open",
    ownerDepartment: "数据中心",
    entityType: "erp_collection_batch",
    entityId: batchId,
    source: "kuaimai-erp-file",
    sourceReference: batchId,
    message: `${unmapped} 条销售明细缺少可确认的 69 码，未写入销售事实。`,
    details: { count: unmapped },
    createdAt: now,
    updatedAt: now
  }] : [];
  return { rows, exceptions };
}

function stablePart(value) {
  return text(value, 200).replace(/[^a-zA-Z0-9_-]+/g, "-") || "unknown";
}

function encodedStablePart(value) {
  return encodeURIComponent(text(value, 200)).replaceAll("%", "") || "unknown";
}

function skuId(record) {
  const code = text(firstValue(record.payload, [
    "skuCode", "规格商家编码", "商家编码", "规格编码", "SKU编码",
    "sourceSkuId", "系统规格ID", "规格ID", "SKU ID",
    "barcode", "69码", "规格条形码", "商品条形码", "条码", "条形码"
  ]) || record.sourceKey);
  return `kuaimai:sku:${stablePart(code)}`;
}

function productId(record) {
  const code = text(firstValue(record.payload, [
    "productCode", "主商家编码", "商品编码", "sourceProductId", "系统商品ID", "商品ID"
  ]));
  return code ? `kuaimai:product:${stablePart(code)}` : null;
}

function shanghaiDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const part = type => parts.find(item => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function catalogProjection(resourceType, records, now) {
  if (resourceType === "products") {
    const grouped = new Map();
    for (const record of records) {
      const payload = record.payload || {};
      const merchantCode = text(firstValue(payload, ["productCode", "主商家编码", "商品编码"]));
      const sourceProductId = text(firstValue(payload, ["sourceProductId", "系统商品ID", "商品ID"])) || merchantCode || record.sourceKey;
      const key = merchantCode || sourceProductId;
      const item = grouped.get(key) || {
        sourceProductId,
        merchantCode,
        name: text(firstValue(payload, ["productName", "商品名称"])) || merchantCode || record.sourceKey,
        shortName: text(firstValue(payload, ["shortName", "商品简称"])),
        remark: text(firstValue(payload, ["remark", "商品备注"])),
        category: text(firstValue(payload, ["category", "商品分类", "商品类目"])),
        brand: text(firstValue(payload, ["brand", "品牌"])),
        supplierCode: text(firstValue(payload, ["supplierCode", "供应商编码", "供应商商家编码"])),
        supplierName: text(firstValue(payload, ["supplierName", "供应商", "供应商名称"])),
        activeStatus: text(firstValue(payload, ["status", "商品状态"])),
        sourceModifiedAt: record.modifiedAt,
        skus: []
      };
      const merchantSkuCode = text(firstValue(payload, ["skuCode", "规格商家编码", "SKU编码"]));
      const sourceSkuId = text(firstValue(payload, ["sourceSkuId", "系统规格ID", "规格ID"]));
      const barcode = text(firstValue(payload, ["barcode", "69码", "条形码", "条码"]));
      if (merchantSkuCode || sourceSkuId || barcode) {
        item.skus.push({
          sourceSkuId,
          merchantSkuCode,
          barcode,
          specification: text(firstValue(payload, ["skuName", "规格", "规格名称"])),
          skuRemark: text(firstValue(payload, ["skuRemark", "规格备注"])),
          purchasePrice: numberOrNull(firstValue(payload, ["purchasePrice", "成本价", "采购价"])),
          salePrice: numberOrNull(firstValue(payload, ["salePrice", "销售价", "售价"])),
          wholesalePrice: numberOrNull(firstValue(payload, ["wholesalePrice", "批发价"])),
          weight: numberOrNull(firstValue(payload, ["weight", "重量"])),
          activeStatus: text(firstValue(payload, ["status", "规格状态", "商品状态"])),
          sourceModifiedAt: record.modifiedAt
        });
      }
      grouped.set(key, item);
    }
    return {
      source: "kuaimai-file",
      syncedAt: now,
      items: [...grouped.values()]
    };
  }
  if (["product_kits", "product_combinations"].includes(resourceType)) {
    const grouped = new Map();
    for (const record of records) {
      const payload = record.payload || {};
      const merchantCode = text(firstValue(payload, [
        "productCode", "套件主商家编码", "套件商家编码", "组合装主商家编码", "组合装商家编码", "主商家编码"
      ]));
      if (!merchantCode) continue;
      const item = grouped.get(merchantCode) || {
        sourceProductId: text(firstValue(payload, ["sourceProductId", "系统商品ID", "商品ID"])) || merchantCode,
        merchantCode,
        name: text(firstValue(payload, ["productName", "套件名称", "组合装名称", "商品名称"])) || merchantCode,
        typeTag: resourceType === "product_kits" ? "3" : "4",
        productKind: "bundle",
        category: "组合品",
        skus: [],
        components: []
      };
      const componentCode = text(firstValue(payload, [
        "componentSkuCode", "单品规格商家编码", "子商品规格商家编码", "子商品商家编码", "组成规格商家编码"
      ]));
      if (componentCode) {
        item.components.push({
          skuOuterId: componentCode,
          inventoryUnitCode: componentCode,
          title: text(firstValue(payload, ["componentName", "单品名称", "子商品名称", "组成商品名称"])),
          ratio: numberOrNull(firstValue(payload, ["componentQuantity", "组合比例", "单品数量", "组成数量", "数量"])),
          purchasePrice: numberOrNull(firstValue(payload, ["componentCost", "子商品供应商进价", "单品成本价", "组成成本价"]))
        });
      }
      grouped.set(merchantCode, item);
    }
    return { source: "kuaimai-file", syncedAt: now, items: [...grouped.values()] };
  }
  if (resourceType === "skus") {
    return {
      source: "kuaimai-file",
      syncedAt: now,
      items: records.map(record => ({
        sourceProductId: text(record.payload.productCode) || record.sourceKey,
        merchantCode: text(record.payload.productCode),
        name: text(record.payload.productName) || text(record.payload.productCode) || "未命名商品",
        skus: [{
          sourceSkuId: record.sourceKey,
          merchantSkuCode: text(record.payload.skuCode),
          barcode: text(record.payload.barcode),
          specification: text(record.payload.skuName),
          activeStatus: text(record.payload.status),
          sourceModifiedAt: record.modifiedAt
        }]
      }))
    };
  }
  return { source: "kuaimai-file", syncedAt: now, items: [] };
}

function inventoryProjection(resourceType, records, now, snapshotDate) {
  if (resourceType !== "inventory_snapshot") return [];
  const explicitDate = text(snapshotDate, 80);
  const projectedDate = /^\d{4}-\d{2}-\d{2}$/.test(explicitDate)
    ? explicitDate
    : shanghaiDate(explicitDate || now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(projectedDate)) {
    throw new Error("快麦库存快照日期无效。");
  }
  return records.map(record => {
    const sourceUpdatedAt = text(record.modifiedAt, 80) || null;
    const quantity = numberOrNull(firstValue(record.payload, [
      "quantity", "实际总库存", "库存数量", "实际库存", "库存", "可用库存", "实际可用数", "可售库存", "可销售库存"
    ]));
    const sellableQuantity = numberOrNull(firstValue(record.payload, [
      "sellableQuantity", "实际可用数", "可用库存", "可售库存", "可销售库存"
    ])) ?? quantity;
    const unitCost = numberOrNull(firstValue(record.payload, [
      "unitCost", "成本价", "库存成本价", "采购价"
    ]));
    return {
      id: `kuaimai-inventory-${encodedStablePart(record.sourceKey)}-${projectedDate}`,
      date: projectedDate,
      productId: productId(record),
      skuId: skuId(record),
      skuCode: text(firstValue(record.payload, [
        "skuCode", "规格商家编码", "商家编码", "规格编码", "SKU编码",
        "sourceSkuId", "系统规格ID", "规格ID", "SKU ID",
        "barcode", "69码", "条码", "条形码"
      ])),
      warehouseId: text(record.warehouseId || firstValue(record.payload, [
        "warehouseName", "仓库名称", "仓库", "仓库编号", "仓库ID"
      ])) || "未指定仓库",
      erpQuantity: quantity,
      calibratedQuantity: quantity,
      unitCost,
      sellableQuantity,
      stocktakeStatus: "unverified",
      sourceUpdatedAt,
      confidence: quantity === null ? "insufficient" : "partial",
      createdAt: now
    };
  });
}

function inventoryQuality(resourceType, records, inventoryDaily) {
  if (resourceType !== "inventory_snapshot") return null;
  const sourceRows = records.length;
  const projectedRows = inventoryDaily.length;
  const ratio = predicate => sourceRows
    ? inventoryDaily.filter(predicate).length / sourceRows
    : 0;
  const quantityCoverage = ratio(row => row.erpQuantity !== null);
  const skuCoverage = ratio(row => Boolean(row.skuId && row.skuCode));
  const warehouseCoverage = ratio(row => Boolean(row.warehouseId && row.warehouseId !== "未指定仓库"));
  const sourceUpdatedAt = inventoryDaily
    .map(row => row.sourceUpdatedAt)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
  const complete = sourceRows > 0
    && projectedRows === sourceRows
    && quantityCoverage === 1
    && skuCoverage === 1
    && warehouseCoverage === 1;
  return {
    sourceRows,
    projectedRows,
    snapshotDate: inventoryDaily[0]?.date || null,
    quantityCoverage,
    skuCoverage,
    warehouseCoverage,
    sourceUpdatedAt,
    complete,
    confidence: complete ? "partial" : "insufficient"
  };
}

function eventType(resourceType) {
  return {
    inventory_movements: "inventory_movement",
    purchase_orders: "purchase_order",
    aftersales: "aftersale"
  }[resourceType] || "";
}

function eventProjection(resourceType, records, batchId, now) {
  const type = eventType(resourceType);
  if (!type) return [];
  return records.map(record => ({
    id: `kuaimai-${type}-${stablePart(record.sourceKey)}-${record.contentHash.slice(0, 12)}`,
    eventType: type,
    skuId: text(record.payload.skuCode || record.payload.barcode) ? skuId(record) : null,
    warehouseId: text(record.warehouseId || record.payload.warehouseName) || null,
    supplierId: text(record.payload.supplierCode || record.payload.supplierName) || null,
    purchaseId: resourceType === "purchase_orders" ? record.sourceKey : null,
    occurredAt: record.occurredAt,
    source: "kuaimai-erp-file",
    sourceReference: record.sourceKey,
    sourceVersion: record.contentHash,
    payload: {
      batchId,
      documentNumber: text(record.payload.documentNumber),
      sourceOrderId: text(record.payload.sourceOrderId),
      movementType: text(record.payload.movementType),
      quantity: numberOrNull(record.payload.quantity),
      amount: numberOrNull(record.payload.amount),
      status: text(record.payload.status)
    },
    createdAt: now
  }));
}

export function projectKuaimaiErpRecords(
  resourceType,
  records = [],
  { batchId = "", now = new Date().toISOString(), snapshotDate = "" } = {}
) {
  const sales = salesProjection(resourceType, records, batchId, now);
  const inventoryDaily = inventoryProjection(resourceType, records, now, snapshotDate);
  return {
    catalog: catalogProjection(resourceType, records, now),
    inventoryDaily,
    inventoryQuality: inventoryQuality(resourceType, records, inventoryDaily),
    events: eventProjection(resourceType, records, batchId, now),
    salesDaily: sales.rows,
    exceptions: sales.exceptions
  };
}
