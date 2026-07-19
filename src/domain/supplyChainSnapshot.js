const COLLECTION_RULES = {
  suppliers: {
    sourceKey: "dataSource",
    sources: new Set(["dingtalk-supply-folder"]),
    fields: ["id", "code", "name", "category", "sourceCategory", "supplyScope", "status", "dataSource", "sourceDocument", "sourceNodeId", "sourceSheet", "sourceRow", "importedAt"]
  },
  inventorySnapshots: {
    sourceKey: "sourceType",
    sources: new Set(["dingtalk-stocktake-import", "dingtalk-finished-inventory"]),
    fields: ["id", "productId", "productName", "skuCode", "skuMatchStatus", "warehouse", "stocktakeDate", "stocktakeRound", "erpQuantity", "countedQuantity", "quantityVariance", "inventoryVarianceAmount", "inventoryAmount", "unitCost", "returnQuantity", "returnAmount", "sourceType", "dataSource", "sourceDocument", "sourceNodeId", "sourceSheet", "sourceRow", "importedAt"]
  },
  materialInventorySnapshots: {
    sourceKey: "sourceType",
    sources: new Set(["dingtalk-material-inventory"]),
    fields: ["id", "productId", "productCategory", "productSkuCode", "productName", "materialName", "quantity", "unitCost", "inventoryAmount", "warehouse", "snapshotDate", "note", "sourceType", "dataSource", "sourceDocument", "sourceNodeId", "sourceSheet", "sourceRow", "importedAt"]
  },
  inventoryRisks: {
    sourceKey: "sourceType",
    sources: new Set(["dingtalk-inventory-risk"]),
    fields: ["id", "productId", "productName", "skuCode", "skuMatchStatus", "sellableDays", "estimatedArrivalDate", "estimatedArrivalQuantity", "sourceStatus", "status", "note", "sourceType", "dataSource", "sourceDocument", "sourceNodeId", "sourceSheet", "sourceRow", "importedAt"]
  },
  inventoryBatches: {
    sourceKey: "sourceType",
    sources: new Set(["dingtalk-supply-folder"]),
    fields: ["id", "fileName", "stocktakeDate", "warehouse", "sourceType", "sourceNodeId", "sourceSheet", "rows", "skippedRows", "status", "importedAt"]
  },
  syncRuns: {
    sourceKey: "type",
    sources: new Set(["dingtalk-supply-folder"]),
    fields: ["id", "type", "status", "counts", "completedAt", "message"]
  }
};

function safeRecord(record, rule) {
  if (!record || typeof record !== "object" || !String(record.id || "").trim()) return null;
  if (!rule.sources.has(String(record[rule.sourceKey] || "").trim())) return null;
  return Object.fromEntries(rule.fields.filter(field => record[field] !== undefined).map(field => [field, record[field]]));
}

export function buildSupplySnapshotActions(input = {}) {
  const snapshot = input?.state && typeof input.state === "object" ? input.state : input;
  const actions = [];
  const counts = {};
  for (const [collection, rule] of Object.entries(COLLECTION_RULES)) {
    const records = Array.isArray(snapshot?.[collection]) ? snapshot[collection] : [];
    const safeRecords = records.map(record => safeRecord(record, rule)).filter(Boolean);
    counts[collection] = safeRecords.length;
    for (const record of safeRecords) actions.push({ type: "upsert", collection, record });
  }
  if (!actions.length) throw new Error("没有可导入的钉钉供应链文件数据。");
  if (actions.length > 5000) throw new Error("供应链快照超过 5000 条，请拆分后导入。");
  return { actions, counts };
}
