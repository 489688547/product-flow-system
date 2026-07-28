import { aggregateProductCatalogInventory } from "../../../../../../src/domain/productCatalogInventory.js";
import { queryInventoryDaily } from "../../goods-flow/_shared/storage.js";

const MAX_INVENTORY_PAGES = 20;
const DAY_MS = 86_400_000;

function shanghaiDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

function daysBetween(left, right) {
  return Math.floor((
    Date.parse(`${right}T00:00:00Z`) - Date.parse(`${left}T00:00:00Z`)
  ) / DAY_MS);
}

function inventoryQuality(rows, latestSnapshotDate, now) {
  if (!rows.length || !latestSnapshotDate) {
    return {
      status: "unavailable",
      latestSnapshotDate: latestSnapshotDate || null,
      coverage: 0,
      confidence: "insufficient",
      lastSuccessfulSyncAt: null,
      freshnessDays: null
    };
  }
  const covered = rows.filter(row => row.confidence !== "insufficient").length;
  const coverage = covered / rows.length;
  const freshnessDays = Math.max(0, daysBetween(latestSnapshotDate, shanghaiDate(now)));
  const status = coverage < 1 ? "partial" : freshnessDays > 1 ? "stale" : "trusted";
  const confidence = coverage < 1
    ? covered ? "partial" : "insufficient"
    : rows.every(row => row.confidence === "complete") ? "complete" : "partial";
  return {
    status,
    latestSnapshotDate,
    coverage,
    confidence,
    lastSuccessfulSyncAt: rows
      .map(row => row.updatedAt)
      .filter(Boolean)
      .sort()
      .at(-1) || null,
    freshnessDays
  };
}

function queryLimitError() {
  const error = new Error("当前库存快照超过商品目录安全读取上限。");
  error.status = 503;
  error.code = "PRODUCT_CATALOG_INVENTORY_QUERY_LIMIT";
  error.retryable = false;
  return error;
}

export async function readCatalogInventory(db, items, { now = new Date() } = {}) {
  const rows = [];
  let latestSnapshotDate = "";
  let cursor = "";
  for (let page = 0; page < MAX_INVENTORY_PAGES; page += 1) {
    const result = await queryInventoryDaily(db, {
      mode: "current",
      ...(cursor ? { cursor } : {})
    });
    rows.push(...result.rows);
    latestSnapshotDate = result.latestDate || latestSnapshotDate;
    cursor = result.nextCursor || "";
    if (!cursor) {
      const quality = inventoryQuality(rows, latestSnapshotDate, now);
      return aggregateProductCatalogInventory(items, rows, quality);
    }
  }
  throw queryLimitError();
}
