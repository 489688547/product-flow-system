import {
  isErpInventorySource,
  isPhysicalInventorySource,
  normalizeSupplyChainState
} from "../../../../../../src/domain/supplyChain.js";
import { buildInventoryDailyRows } from "../../../../../../src/domain/goodsFlow.js";
import { flattenCatalogConsumption } from "../../../../../../src/domain/productCatalogGraph.js";

const APPROVED_STATUSES = new Set(["COMPLETED", "APPROVED", "AGREE"]);

function clean(value) {
  return String(value ?? "").trim();
}

function number(value, fallback = 0) {
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isoDate(value, fallback) {
  const source = clean(value || fallback);
  if (!source) return "";
  const parsed = Date.parse(source);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : `${source.slice(0, 10)}T00:00:00.000Z`;
}

function codesForProduct(product) {
  const values = product?.skuCodes || product?.skus || [];
  return values.map(value => clean(typeof value === "object" ? value?.code : value)).filter(Boolean);
}

function productIndexes(products = [], catalogItems = []) {
  const byId = new Map();
  const bySku = new Map();
  for (const product of products) {
    const productId = clean(product?.id);
    if (!productId) continue;
    byId.set(productId, product);
    for (const skuCode of codesForProduct(product)) {
      bySku.set(skuCode, { product, productId, skuCode, skuId: `${productId}::${skuCode}` });
    }
  }
  for (const item of catalogItems) {
    const productId = clean(item?.id);
    if (!productId) continue;
    if (!byId.has(productId)) byId.set(productId, item);
    const merchantCode = clean(item?.merchantCode);
    if (merchantCode && !bySku.has(merchantCode)) {
      bySku.set(merchantCode, { product: item, catalogItem: item, productId, skuCode: merchantCode, skuId: null });
    }
    for (const sku of item?.skus || []) {
      const skuCode = clean(sku?.barcode || sku?.merchantSkuCode);
      if (!skuCode || bySku.has(skuCode)) continue;
      bySku.set(skuCode, { product: item, catalogItem: item, productId, skuCode, skuId: clean(sku.id) || `${productId}::${skuCode}` });
    }
  }
  return { byId, bySku };
}

function stableId(prefix, ...parts) {
  return [prefix, ...parts.map(part => clean(part).replace(/[^a-zA-Z0-9_-]+/g, "-") || "unknown")].join("-");
}

function exception({ code, entityType, entityId, source, sourceReference, message, details, asOf }) {
  return {
    id: stableId("exception", code, sourceReference || entityId),
    code,
    severity: "warning",
    status: "open",
    ownerDepartment: code === "GOODS_FLOW_PURCHASE_LINK_REQUIRED" ? "财务" : "供应链",
    entityType,
    entityId: clean(entityId),
    source,
    sourceReference: clean(sourceReference),
    message,
    details,
    createdAt: isoDate(asOf, new Date().toISOString()),
    updatedAt: isoDate(asOf, new Date().toISOString())
  };
}

function sourceVersion(row) {
  return clean(row?.sourceVersion || row?.version || row?.updatedAt || row?.modifiedAt) || "1";
}

function approved(row) {
  return APPROVED_STATUSES.has(clean(row?.status).toUpperCase());
}

export function projectLegacyGoodsFlow({ supplyState = {}, products = [], catalogItems = [], salesRows = [], asOf = "" } = {}) {
  const state = normalizeSupplyChainState(supplyState);
  const indexes = productIndexes(products, catalogItems);
  const events = [];
  const exceptions = [];
  const purchasesByProcess = new Map();

  for (const purchase of state.purchaseApprovals) {
    if (!approved(purchase)) continue;
    const reference = clean(purchase.processInstanceId || purchase.id);
    if (!reference) continue;
    purchasesByProcess.set(reference, purchase);
    events.push({
      id: stableId("purchase-approved", reference, sourceVersion(purchase)),
      eventType: "purchase_approved",
      supplierId: clean(purchase.supplierId) || null,
      purchaseId: clean(purchase.id || reference),
      occurredAt: isoDate(purchase.completedAt || purchase.approvedAt || purchase.createTime, asOf),
      source: "dingtalk-approval",
      sourceReference: reference,
      sourceVersion: sourceVersion(purchase),
      payload: {
        approvedAmount: number(purchase.approvedAmount ?? purchase.amount),
        productIds: Array.isArray(purchase.productIds) ? purchase.productIds.filter(Boolean) : [],
        processInstanceId: reference,
        receivedAt: purchase.receivedAt ? isoDate(purchase.receivedAt, asOf) : null,
        payableDateBasis: purchase.receivedAt ? "received_at" : "approval_fallback"
      },
      createdAt: isoDate(asOf, new Date().toISOString())
    });
  }

  for (const payment of state.paymentApprovals) {
    if (!approved(payment)) continue;
    const paymentReference = clean(payment.processInstanceId || payment.id);
    const purchaseReference = clean(payment.purchaseProcessInstanceId || payment.relatedPurchaseProcessInstanceId);
    const purchase = purchasesByProcess.get(purchaseReference);
    if (!purchase) {
      exceptions.push(exception({
        code: "GOODS_FLOW_PURCHASE_LINK_REQUIRED",
        entityType: "payment_approval",
        entityId: payment.id || paymentReference,
        source: "dingtalk-approval",
        sourceReference: paymentReference,
        message: "付款单未关联可识别的采购申请，未计入货流实付。",
        details: { purchaseReference },
        asOf
      }));
      continue;
    }
    events.push({
      id: stableId("purchase-paid", paymentReference, sourceVersion(payment)),
      eventType: "purchase_paid",
      supplierId: clean(purchase.supplierId) || null,
      purchaseId: clean(purchase.id || purchaseReference),
      occurredAt: isoDate(payment.completedAt || payment.paidAt || payment.createTime, asOf),
      source: "dingtalk-approval",
      sourceReference: paymentReference,
      sourceVersion: sourceVersion(payment),
      payload: {
        amount: number(payment.amount ?? payment.paidAmount),
        purchaseProcessInstanceId: purchaseReference,
        paymentProcessInstanceId: paymentReference
      },
      createdAt: isoDate(asOf, new Date().toISOString())
    });
  }

  for (const [index, sale] of salesRows.entries()) {
    const skuCode = clean(sale.skuCode || sale.code || sale.barcode || sale["69码"]);
    const mapping = indexes.bySku.get(skuCode);
    const reference = clean(sale.id || sale.orderId || sale.orderNo) || `${skuCode || "unknown"}-${sale.date || asOf}-${index}`;
    if (!mapping) {
      exceptions.push(exception({
        code: "GOODS_FLOW_SKU_MAPPING_REQUIRED",
        entityType: "sale",
        entityId: reference,
        source: clean(sale.source) || "kuaimai-sales",
        sourceReference: reference,
        message: `销量记录的库存单位编码 ${skuCode || "为空"} 未匹配商品主数据。`,
        details: { skuCode },
        asOf
      }));
      continue;
    }
    let components = null;
    let graphCost = 0;
    if (mapping.catalogItem) {
      if (mapping.catalogItem.productKind === "bundle" && !(mapping.catalogItem.components || []).length) {
        exceptions.push(exception({
          code: "GOODS_FLOW_COMPONENT_MAPPING_REQUIRED",
          entityType: "sale",
          entityId: reference,
          source: clean(sale.source) || "kuaimai-sales",
          sourceReference: reference,
          message: `组合商品 ${skuCode} 尚未同步库存组成，未计入库存消耗。`,
          details: { skuCode, catalogProductId: mapping.productId },
          asOf
        }));
        continue;
      }
      const consumption = flattenCatalogConsumption({
        items: catalogItems,
        itemId: mapping.catalogItem.id,
        skuId: mapping.skuId || "",
        quantity: number(sale.qty ?? sale.quantity)
      });
      if (consumption.issues.length || !consumption.components.length) {
        exceptions.push(exception({
          code: "GOODS_FLOW_COMPONENT_MAPPING_REQUIRED",
          entityType: "sale",
          entityId: reference,
          source: clean(sale.source) || "kuaimai-sales",
          sourceReference: reference,
          message: `商品 ${skuCode} 的库存组成不完整，未计入库存消耗。`,
          details: { skuCode, catalogProductId: mapping.productId, issueCodes: consumption.issues.map(item => item.code) },
          asOf
        }));
        continue;
      }
      components = consumption.components;
      graphCost = consumption.totalCost;
    }
    const suppliedCost = sale.cost ?? sale.salesCost;
    const cost = suppliedCost === null || suppliedCost === undefined || clean(suppliedCost) === ""
      ? graphCost
      : number(suppliedCost);
    events.push({
      id: stableId("sale-consumed", reference, sourceVersion(sale)),
      eventType: "sale_consumed",
      skuId: mapping.skuId || null,
      occurredAt: isoDate(sale.date || sale.occurredAt, asOf),
      source: clean(sale.source) || "kuaimai-sales",
      sourceReference: reference,
      sourceVersion: sourceVersion(sale),
      payload: {
        productId: mapping.productId,
        skuCode,
        platform: clean(sale.platform),
        quantity: number(sale.qty ?? sale.quantity),
        cost,
        netSales: number(sale.netSales ?? sale.salesAmount ?? sale.amount),
        components
      },
      createdAt: isoDate(asOf, new Date().toISOString())
    });
  }

  const erpSnapshots = [];
  const stocktakes = [];
  for (const snapshot of state.inventorySnapshots) {
    const skuCode = clean(snapshot.skuCode || snapshot.code || snapshot.barcode || snapshot["69码"]);
    const mapping = indexes.bySku.get(skuCode);
    const source = clean(snapshot.sourceType) || "inventory-file";
    const reference = clean(snapshot.id) || `${skuCode || "unknown"}-${snapshot.stocktakeDate || asOf}`;
    if (!mapping) {
      exceptions.push(exception({
        code: "GOODS_FLOW_SKU_MAPPING_REQUIRED",
        entityType: "inventory_snapshot",
        entityId: reference,
        source,
        sourceReference: reference,
        message: `库存记录的库存单位编码 ${skuCode || "为空"} 未匹配商品主数据。`,
        details: { skuCode, warehouse: snapshot.warehouse },
        asOf
      }));
      continue;
    }
    const warehouseId = clean(snapshot.warehouseId || snapshot.warehouse) || "未指定仓库";
    const snapshotDate = clean(snapshot.snapshotDate || snapshot.stocktakeDate || snapshot.date || snapshot.importedAt).slice(0, 10) || clean(asOf).slice(0, 10);
    const erpQuantity = number(snapshot.erpQuantity ?? snapshot.quantity ?? snapshot.stockQuantity);
    if (isErpInventorySource(source)) {
      erpSnapshots.push({
        productId: mapping.productId,
        skuId: mapping.skuId,
        skuCode,
        warehouseId,
        erpQuantity,
        quantity: erpQuantity,
        unitCost: number(snapshot.unitCost ?? snapshot.costPrice),
        sellableQuantity: number(snapshot.sellableQuantity ?? erpQuantity),
        date: snapshotDate
      });
      events.push({
        id: stableId("inventory-snapshot", reference, sourceVersion(snapshot)),
        eventType: "inventory_snapshot",
        skuId: mapping.skuId,
        warehouseId,
        occurredAt: isoDate(snapshotDate, asOf),
        source,
        sourceReference: reference,
        sourceVersion: sourceVersion(snapshot),
        payload: { productId: mapping.productId, skuCode, erpQuantity },
        createdAt: isoDate(asOf, new Date().toISOString())
      });
    }
    if (isPhysicalInventorySource(source)) {
      const countedQuantity = number(snapshot.countedQuantity ?? snapshot.physicalQuantity ?? snapshot.quantity);
      stocktakes.push({
        id: stableId("legacy-stocktake", reference),
        countedAt: snapshotDate,
        status: "confirmed",
        lines: [{ skuId: mapping.skuId, warehouseId, erpQuantity, countedQuantity }]
      });
    }
  }

  const inventoryDaily = buildInventoryDailyRows({ asOf, erpSnapshots, stocktakes }).map(row => {
    const [productId] = row.skuId.split("::");
    return {
      ...row,
      id: stableId("inventory-daily", row.date, row.skuId, row.warehouseId),
      productId,
      sellableQuantity: erpSnapshots.find(snapshot => snapshot.skuId === row.skuId && snapshot.warehouseId === row.warehouseId)?.sellableQuantity ?? null,
      confidence: row.stocktakeStatus === "calibrated" ? "complete" : "partial"
    };
  });

  return { asOf: clean(asOf).slice(0, 10), events, inventoryDaily, exceptions };
}
