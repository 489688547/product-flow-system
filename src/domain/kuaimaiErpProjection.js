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

function skuId(record) {
  const code = text(record.payload?.skuCode || record.payload?.barcode || record.sourceKey);
  return `kuaimai:sku:${stablePart(code)}`;
}

function productId(record) {
  const code = text(record.payload?.productCode || record.sourceKey);
  return `kuaimai:product:${stablePart(code)}`;
}

function catalogProjection(resourceType, records, now) {
  if (resourceType === "products") {
    return {
      source: "kuaimai-file",
      syncedAt: now,
      items: records.map(record => ({
        sourceProductId: record.sourceKey,
        merchantCode: text(record.payload.productCode),
        name: text(record.payload.productName) || text(record.payload.productCode) || record.sourceKey,
        supplierCode: text(record.payload.supplierCode),
        supplierName: text(record.payload.supplierName),
        activeStatus: text(record.payload.status),
        sourceModifiedAt: record.modifiedAt,
        skus: []
      }))
    };
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

function inventoryProjection(resourceType, records, now) {
  if (resourceType !== "inventory_snapshot") return [];
  return records.map(record => {
    const updatedAt = text(record.modifiedAt || now);
    const quantity = numberOrNull(record.payload.quantity);
    return {
      id: `kuaimai-inventory-${stablePart(record.sourceKey)}-${updatedAt.slice(0, 10)}`,
      date: updatedAt.slice(0, 10),
      productId: productId(record),
      skuId: skuId(record),
      skuCode: text(record.payload.skuCode || record.payload.barcode),
      warehouseId: text(record.warehouseId || record.payload.warehouseName) || "未指定仓库",
      erpQuantity: quantity ?? 0,
      calibratedQuantity: quantity ?? 0,
      unitCost: null,
      sellableQuantity: quantity,
      stocktakeStatus: "unverified",
      sourceUpdatedAt: updatedAt,
      confidence: quantity === null ? "insufficient" : "partial",
      createdAt: now
    };
  });
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

export function projectKuaimaiErpRecords(resourceType, records = [], { batchId = "", now = new Date().toISOString() } = {}) {
  const sales = salesProjection(resourceType, records, batchId, now);
  return {
    catalog: catalogProjection(resourceType, records, now),
    inventoryDaily: inventoryProjection(resourceType, records, now),
    events: eventProjection(resourceType, records, batchId, now),
    salesDaily: sales.rows,
    exceptions: sales.exceptions
  };
}
