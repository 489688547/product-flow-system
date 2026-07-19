import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSupplySnapshotActions } from "../src/domain/supplyChainSnapshot.js";

test("supply snapshot accepts only DingTalk source collections and strips supplier secrets", () => {
  const result = buildSupplySnapshotActions({
    suppliers: [{
      id: "supplier-1",
      name: "供应商 A",
      category: "原料",
      supplyScope: "冻干",
      dataSource: "dingtalk-supply-folder",
      bankAccount: "622200001234",
      contactPhone: "13800000000"
    }],
    inventorySnapshots: [{ id: "stock-1", sourceType: "dingtalk-stocktake-import", productName: "莓果粮" }],
    purchaseApprovals: [{ id: "purchase-should-not-import" }]
  });

  assert.equal(result.counts.suppliers, 1);
  assert.equal(result.counts.inventorySnapshots, 1);
  assert.equal(result.actions.some(action => action.collection === "purchaseApprovals"), false);
  const supplier = result.actions.find(action => action.collection === "suppliers").record;
  assert.equal(supplier.name, "供应商 A");
  assert.equal("bankAccount" in supplier, false);
  assert.equal("contactPhone" in supplier, false);
  assert.equal(JSON.stringify(result).includes("622200001234"), false);
});

test("supply snapshot rejects unrelated or empty payloads", () => {
  assert.throws(() => buildSupplySnapshotActions({ suppliers: [{ id: "manual", name: "手工供应商", dataSource: "manual" }] }), /没有可导入的钉钉供应链文件数据/);
  assert.throws(() => buildSupplySnapshotActions({}), /没有可导入的钉钉供应链文件数据/);
});

test("sync records exposes the governed DingTalk snapshot import control", () => {
  const page = readFileSync(new URL("../src/features/supply-chain/SupplyChainAppPage.jsx", import.meta.url), "utf8");
  assert.match(page, /导入钉钉供应链快照/);
  assert.match(page, /buildSupplySnapshotActions/);
  assert.match(page, /accept="\.json"/);
});
