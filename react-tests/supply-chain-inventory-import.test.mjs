import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeImportedRecords,
  parseFinishedInventoryCsv,
  parseInventoryRiskCsv,
  parseMaterialInventoryCsv,
  parseSupplierCsv,
  parseStocktakeCsv
} from "../scripts/lib/dingtalkSupplyInventory.mjs";

test("supplier CSV imports only operational fields and inherits source categories", () => {
  const result = parseSupplierCsv([
    "[row=1] 类别,供应商名称（简称或联系人）,采购产品、耗材、服务,开票主体,,,,,,,,,收款人银行账号,收款人资料",
    "[row=2] 原料、成品,临沂火火,爱心冻干、纸棉,某开票主体,,,,,,,,,622200001234,身份证附件.jpg",
    "[row=3] ,山东金久,蓝袋粮、奶酪,另一开票主体,,,,,,,,,621700009876,银行卡附件.jpg",
    "[row=4] 快递、服务,德尚青柏对接供应商,,,,,,,,,,,,",
    "[row=5] ,临沂智派,兰山云仓发货仓,仓储公司,,,,,,,,,623100001111,"
  ].join("\n"), {
    nodeId: "supplier-node",
    sheetId: "s1",
    documentName: "供应商清单（开票情况）",
    importedAt: "2026-07-19T00:00:00.000Z"
  });

  assert.equal(result.records.length, 3);
  assert.deepEqual(result.records.map(row => row.name), ["临沂火火", "山东金久", "临沂智派"]);
  assert.deepEqual(result.records.map(row => row.category), ["原料", "原料", "加工"]);
  assert.equal(result.records[1].sourceCategory, "原料、成品");
  assert.equal(result.records[2].supplyScope, "兰山云仓发货仓");
  assert.equal(result.records[0].sourceRow, 2);
  assert.equal("bankAccount" in result.records[0], false);
  assert.equal("contactPhone" in result.records[0], false);
  assert.equal(JSON.stringify(result.records).includes("622200001234"), false);
  assert.equal(JSON.stringify(result.records).includes("身份证附件"), false);
});

test("stocktake CSV keeps source evidence and converts Excel dates", () => {
  const result = parseStocktakeCsv([
    "[row=1] 说明,,,,,,,",
    "[row=2] 序号,盘点日期,盘点次数,产品名称（规格）,条形码,erp数量,盘点数量,差值",
    "[row=3] 案例,46113,第一次,示例,6970000000000,10,12,2",
    "[row=4] 1,46113,第一次,莓果粮,6977173969783,10916,12500,1584"
  ].join("\n"), { nodeId: "stocktake-node", sheetId: "s1", documentName: "库存盘点表（2026年4月）", warehouse: "兰山仓" });

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].stocktakeDate, "2026-04-01");
  assert.equal(result.records[0].productName, "莓果粮");
  assert.equal(result.records[0].skuCode, "6977173969783");
  assert.equal(result.records[0].erpQuantity, 10916);
  assert.equal(result.records[0].countedQuantity, 12500);
  assert.equal(result.records[0].quantityVariance, 1584);
  assert.equal(result.records[0].sourceRow, 4);
  assert.match(result.records[0].id, /stocktake-node-s1-4/);
});

test("finished inventory maps two-level headers without trusting rounded barcodes", () => {
  const result = parseFinishedInventoryCsv([
    "[row=1] 商品进销存报表-按SKU,,,,,,,,,",
    "[row=2] 规格别名,规格商家编码,采购价,期末库存,,,,,,",
    "[row=3] ,,,数量,盘库差额,库存差额金额,实际库存,总金额,退货重新入库数量,金额",
    "[row=4] 白袋粮,6977170000000,11.98,3019,0,0,3019,36167.62,254,3042.92"
  ].join("\n"), { nodeId: "finished-node", sheetId: "s1", documentName: "2026 年 5 月库存", warehouse: "兰山仓", snapshotDate: "2026-05-31" });

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].erpQuantity, 3019);
  assert.equal(result.records[0].countedQuantity, 3019);
  assert.equal(result.records[0].inventoryAmount, 36167.62);
  assert.equal(result.records[0].unitCost, 11.98);
  assert.equal(result.records[0].skuMatchStatus, "source-rounded");
});

test("material inventory inherits product context and keeps components separate", () => {
  const result = parseMaterialInventoryCsv([
    "[row=1] 产品大类,条形码,产品名称,名称,数量,单价,总价,备注",
    "[row=2] 仓鼠粮食&零食,6977173969783,莓果粮420g,粮食原料,,,,",
    "[row=3] ,,,莓果粮袋子,35289,0.7552,26650.2528,",
    "[row=4] ,,,爱心冻干,120,52.5,6300,用于正品"
  ].join("\n"), { nodeId: "material-node", sheetId: "s1", documentName: "两仓原料金额", warehouse: "兰山仓", snapshotDate: "2026-07-14" });

  assert.equal(result.records.length, 2);
  assert.deepEqual(result.records.map(row => row.materialName), ["莓果粮袋子", "爱心冻干"]);
  assert.equal(result.records[0].productName, "莓果粮420g");
  assert.equal(result.records[0].productSkuCode, "6977173969783");
  assert.equal(result.records[0].inventoryAmount, 26650.2528);
});

test("inventory risk import preserves active and resolved history", () => {
  const result = parseInventoryRiskCsv([
    "[row=1] 规则,,,,,,",
    "[row=2] 产品名称（规格）,条形码,采购预估实际可售天数,下一批预估到仓时间,下一批次预估到仓数量,异常情况,备注",
    "[row=3] 木丝绒1kg,6978705011352,7,7月20日,3200,异常中,供应商延迟",
    "[row=4] 木丝绒300g,6978705011345,10,7月10日,1200,异常解除,"
  ].join("\n"), { nodeId: "risk-node", sheetId: "s1", documentName: "异常库存统计表", year: 2026 });

  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].status, "active");
  assert.equal(result.records[0].estimatedArrivalDate, "2026-07-20");
  assert.equal(result.records[1].status, "resolved");
});

test("import merge is idempotent and refreshes records from the same source", () => {
  const current = [{ id: "manual-1", dataSource: "manual" }, { id: "source-1", dataSource: "dingtalk-supply-folder", quantity: 1 }];
  const imported = [{ id: "source-1", dataSource: "dingtalk-supply-folder", quantity: 2 }, { id: "source-2", dataSource: "dingtalk-supply-folder", quantity: 3 }];
  const first = mergeImportedRecords(current, imported);
  const second = mergeImportedRecords(first, imported);
  assert.equal(first.length, 3);
  assert.equal(second.length, 3);
  assert.equal(second.find(row => row.id === "source-1").quantity, 2);
  assert.ok(second.some(row => row.id === "manual-1"));
});
