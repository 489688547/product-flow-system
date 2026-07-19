import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mergeImportedRecords,
  parseFinishedInventoryCsv,
  parseInventoryRiskCsv,
  parseMaterialInventoryCsv,
  parseStocktakeCsv
} from "./lib/dingtalkSupplyInventory.mjs";

const execFileAsync = promisify(execFile);
const importedAt = new Date().toISOString();

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const apiUrl = argument("--api", "http://127.0.0.1:8127/api/supply-chain");

async function readSheet({ nodeId, sheetId, range, raw = true }) {
  const args = ["sheet", "csv-get", "--node", nodeId, "--sheet-id", sheetId, "--range", range];
  if (raw) args.push("--value-render-option", "raw_value");
  args.push("--format", "json");
  const { stdout } = await execFileAsync("dws", args, { maxBuffer: 16 * 1024 * 1024 });
  const payload = JSON.parse(stdout);
  if (!payload.success || typeof payload.csv !== "string") throw new Error(payload?.error?.message || `读取钉钉表格失败：${nodeId}/${sheetId}`);
  return payload.csv;
}

const sources = [
  {
    kind: "stocktake",
    collection: "inventorySnapshots",
    nodeId: "NkDwLng8ZL2pLkaLcan3dDGGVKMEvZBY",
    sheetId: "s1",
    sheetName: "4月",
    range: "A1:H136",
    documentName: "库存盘点表（2026年4月）",
    warehouse: "全仓汇总",
    parse: parseStocktakeCsv
  },
  {
    kind: "finished-lanshan",
    collection: "inventorySnapshots",
    nodeId: "np9zOoBVBYBkYnDYhPvq6Mp0W1DK0g6l",
    sheetId: "s1",
    sheetName: "兰山仓",
    range: "A1:J224",
    documentName: "2026 年 5 月库存",
    warehouse: "兰山仓",
    snapshotDate: "2026-05-31",
    parse: parseFinishedInventoryCsv
  },
  {
    kind: "finished-shanxi",
    collection: "inventorySnapshots",
    nodeId: "np9zOoBVBYBkYnDYhPvq6Mp0W1DK0g6l",
    sheetId: "st-c513677f-85396",
    sheetName: "山西仓",
    range: "A1:J58",
    documentName: "2026 年 5 月库存",
    warehouse: "山西仓",
    snapshotDate: "2026-05-31",
    parse: parseFinishedInventoryCsv
  },
  {
    kind: "materials-lanshan",
    collection: "materialInventorySnapshots",
    nodeId: "y20BglGWO24K2qx2sgE2Ngpk8A7depqY",
    sheetId: "s1",
    sheetName: "提野星-兰山仓",
    range: "A1:H279",
    documentName: "提野星---两仓原料金额",
    warehouse: "兰山仓",
    snapshotDate: "2026-07-14",
    parse: parseMaterialInventoryCsv
  },
  {
    kind: "materials-shanxi",
    collection: "materialInventorySnapshots",
    nodeId: "y20BglGWO24K2qx2sgE2Ngpk8A7depqY",
    sheetId: "st-2346d670-4453",
    sheetName: "提野星---山西仓",
    range: "A1:H279",
    documentName: "提野星---两仓原料金额",
    warehouse: "山西仓",
    snapshotDate: "2026-07-14",
    parse: parseMaterialInventoryCsv
  },
  {
    kind: "risks",
    collection: "inventoryRisks",
    nodeId: "PwkYGxZV3ZAELqgmi97beQGLWAgozOKL",
    sheetId: "kgqie6hm",
    sheetName: "Sheet1",
    range: "A1:G17",
    documentName: "异常库存统计表（采购-运营用）",
    year: 2026,
    parse: parseInventoryRiskCsv
  }
];

async function main() {
  const response = await fetch(apiUrl);
  const currentPayload = await response.json().catch(() => ({}));
  if (!response.ok || !currentPayload.state) throw new Error(currentPayload.message || `读取供应链状态失败：${response.status}`);

  const results = await Promise.all(sources.map(async source => {
    const csv = await readSheet(source);
    const parsed = source.parse(csv, { ...source, importedAt });
    return { source, ...parsed };
  }));

  const state = { ...currentPayload.state };
  for (const collection of ["inventorySnapshots", "materialInventorySnapshots", "inventoryRisks"]) {
    const imported = results.filter(result => result.source.collection === collection).flatMap(result => result.records);
    state[collection] = mergeImportedRecords(state[collection], imported);
  }
  const batches = results.map(result => ({
    id: `dingtalk-inventory-batch-${result.source.kind}`,
    fileName: result.source.documentName,
    stocktakeDate: result.source.snapshotDate || result.records[0]?.stocktakeDate || "",
    warehouse: result.source.warehouse || "",
    sourceType: "dingtalk-supply-folder",
    sourceNodeId: result.source.nodeId,
    sourceSheet: result.source.sheetName,
    rows: result.records.length,
    skippedRows: result.skipped,
    status: "confirmed",
    importedAt
  }));
  state.inventoryBatches = mergeImportedRecords(state.inventoryBatches, batches);
  const counts = Object.fromEntries(results.map(result => [result.source.kind, result.records.length]));
  state.syncRuns = mergeImportedRecords(state.syncRuns, [{
    id: "sync-dingtalk-inventory-docs",
    type: "dingtalk-inventory-docs",
    status: "success",
    counts,
    completedAt: importedAt,
    message: "已读取钉钉成品盘点、原辅料库存与异常库存文件快照。"
  }]);

  const saved = await fetch(apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state, updatedBy: "钉钉供应链库存导入" })
  });
  const savedPayload = await saved.json().catch(() => ({}));
  if (!saved.ok || savedPayload.synced === false) throw new Error(savedPayload.message || `写入供应链状态失败：${saved.status}`);
  process.stdout.write(`${JSON.stringify({ synced: true, counts, skipped: Object.fromEntries(results.map(result => [result.source.kind, result.skipped])), updatedAt: savedPayload.updatedAt }, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.message || error}\n`);
  process.exitCode = 1;
});
