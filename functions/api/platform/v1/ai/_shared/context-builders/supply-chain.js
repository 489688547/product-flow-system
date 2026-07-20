import { readSupplyState } from "../../../../../supply-chain/_shared/storage.js";

function select(record = {}, keys = []) {
  return Object.fromEntries(keys.filter(key => record[key] !== undefined).map(key => [key, record[key]]));
}

export async function buildSupplyChainContext(db) {
  const stored = await readSupplyState(db);
  const state = stored?.state || {};
  return {
    records: {
      suppliers: (state.suppliers || []).slice(0, 60)
        .map(item => select(item, ["id", "name", "status", "category", "leadTimeDays", "updatedAt"])),
      inventory: (state.inventory || state.inventorySnapshots || []).slice(0, 80)
        .map(item => select(item, ["id", "productId", "sku", "quantity", "availableQuantity", "daysOfStock", "status", "updatedAt"])),
      qualityIssues: (state.qualityIssues || []).filter(item => item.status !== "resolved").slice(0, 60)
        .map(item => select(item, ["id", "title", "status", "severity", "productId", "supplierId", "owner", "dueDate", "updatedAt"])),
      approvals: (state.purchaseApprovals || []).slice(0, 60)
        .map(item => select(item, ["id", "supplierId", "productId", "status", "dueDate", "quantity", "updatedAt"]))
    },
    updatedAt: stored?.updatedAt || ""
  };
}
