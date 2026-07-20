import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL("../migrations/0005_goods_flow_core.sql", import.meta.url);

test("goods-flow migration creates the seven durable Phase 0 tables", () => {
  assert.equal(existsSync(migrationUrl), true);
  const sql = readFileSync(migrationUrl, "utf8");
  for (const table of [
    "goods_flow_events",
    "goods_flow_inventory_daily",
    "goods_flow_stocktakes",
    "goods_flow_stocktake_lines",
    "goods_flow_receivable_terms",
    "goods_flow_ccc_monthly",
    "goods_flow_exceptions"
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, "i"));
  }
  assert.match(sql, /UNIQUE\s*\(source, source_reference, source_version\)/i);
  assert.match(sql, /UNIQUE\s*\(snapshot_date, sku_id, warehouse_id\)/i);
  assert.match(sql, /UNIQUE\s*\(month, version\)/i);
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM/i);
});

test("goods-flow migration indexes source, inventory, term and exception lookups", () => {
  const sql = readFileSync(migrationUrl, "utf8");
  for (const index of [
    "idx_goods_flow_events_source",
    "idx_goods_flow_inventory_sku_date",
    "idx_goods_flow_terms_platform_date",
    "idx_goods_flow_exceptions_status"
  ]) {
    assert.match(sql, new RegExp(`CREATE INDEX IF NOT EXISTS ${index}`, "i"));
  }
});
