import assert from "node:assert/strict";
import test from "node:test";
import { detectSpreadsheetFormat } from "../src/domain/xlsxLite.js";

test("spreadsheet reader detects OOXML content even when Kuaimai names it .csv", () => {
  const zipHeader = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
  assert.equal(detectSpreadsheetFormat(zipHeader.buffer, "快麦导出_库存状态(按sku).csv"), "xlsx");
});

test("spreadsheet reader keeps genuine CSV files as CSV", () => {
  const csv = new TextEncoder().encode("仓库,规格商家编码,实际总库存\n默认仓,SKU-1,10\n");
  assert.equal(detectSpreadsheetFormat(csv.buffer, "库存.csv"), "csv");
});
