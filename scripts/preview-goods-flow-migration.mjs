import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { projectLegacyGoodsFlow } from "../functions/api/platform/v1/goods-flow/_shared/legacyProjection.js";

function ratio(mapped, total) {
  return total > 0 ? Math.round(mapped / total * 10_000) / 10_000 : 0;
}

function completed(rows = []) {
  return rows.filter(row => ["COMPLETED", "APPROVED", "AGREE"].includes(String(row?.status || "").toUpperCase()));
}

function safeException(row, type) {
  return {
    type,
    code: row.code,
    entityType: row.entityType,
    entityId: row.entityId,
    source: row.source,
    sourceReference: row.sourceReference,
    message: row.message
  };
}

export function buildGoodsFlowMigrationPreview(snapshot = {}) {
  const projection = projectLegacyGoodsFlow(snapshot);
  const events = projection.events || [];
  const inventoryInput = snapshot.supplyState?.inventorySnapshots || [];
  const paymentInput = completed(snapshot.supplyState?.paymentApprovals || []);
  const salesInput = snapshot.salesRows || [];
  const purchasePaid = events.filter(row => row.eventType === "purchase_paid").length;
  const salesConsumed = events.filter(row => row.eventType === "sale_consumed").length;
  const skuExceptions = projection.exceptions.filter(row => row.code === "GOODS_FLOW_SKU_MAPPING_REQUIRED");
  const paymentExceptions = projection.exceptions.filter(row => row.code === "GOODS_FLOW_PURCHASE_LINK_REQUIRED");

  return {
    counts: {
      events: events.length,
      inventoryDaily: projection.inventoryDaily.length,
      exceptions: projection.exceptions.length,
      purchasePaid,
      salesConsumed
    },
    coverage: {
      inventory: ratio(projection.inventoryDaily.length, inventoryInput.length),
      sales: ratio(salesConsumed, salesInput.length),
      payments: ratio(purchasePaid, paymentInput.length)
    },
    unmapped: skuExceptions.map(row => safeException(row, "sku_mapping_required")),
    blockingDifferences: paymentExceptions.map(row => safeException(row, "payment_without_purchase"))
  };
}

async function main() {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath) throw new Error("用法：node scripts/preview-goods-flow-migration.mjs <脱敏输入.json> [输出.json]");
  const snapshot = JSON.parse(await readFile(inputPath, "utf8"));
  const report = buildGoodsFlowMigrationPreview(snapshot);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) await writeFile(outputPath, serialized, "utf8");
  else process.stdout.write(serialized);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
