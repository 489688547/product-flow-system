function text(value, max = 320) {
  return String(value ?? "").trim().slice(0, max);
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(String(value).replaceAll(",", "").replace(/[¥￥元]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
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
  return {
    catalog: catalogProjection(resourceType, records, now),
    inventoryDaily: inventoryProjection(resourceType, records, now),
    events: eventProjection(resourceType, records, batchId, now),
    exceptions: []
  };
}

