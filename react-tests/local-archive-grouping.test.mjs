import assert from "node:assert/strict";
import test from "node:test";
import { ARCHIVE_STATE, groupLocalArchives } from "../src/domain/localArchive.js";

const archives = [
  {
    id: "a1", resourceType: "order_items", fileName: "订单明细A.xlsx", sizeBytes: 9_000_000,
    relativePath: "原始归档/order_items/2026-07/hashA__订单明细A.xlsx", status: "processed",
    archivedAt: "2026-07-27T09:30:00.000Z", processedAt: "2026-07-27T09:37:00.000Z"
  },
  {
    id: "a2", resourceType: "order_items", fileName: "订单明细B.xlsx", sizeBytes: 8_000_000,
    relativePath: "原始归档/order_items/2026-07/hashB__订单明细B.xlsx", status: "archived",
    archivedAt: "2026-07-26T09:30:00.000Z", processedAt: null
  },
  {
    id: "a3", resourceType: "inventory_snapshot", fileName: "库存.csv", sizeBytes: 600_000,
    relativePath: "原始归档/inventory_snapshot/2026-06/hashC__库存.csv", status: "archived",
    archivedAt: "2026-06-30T09:30:00.000Z", processedAt: null
  },
  {
    id: "a4", resourceType: "orders", fileName: "订单.xlsx", sizeBytes: 1_000_000,
    relativePath: "原始归档/orders/2026-07/hashD__订单.xlsx", status: "processing",
    archivedAt: "2026-07-28T01:00:00.000Z", processedAt: null
  }
];

test("已下载未入库的文件单独成组并置顶，因为线上数字并不包含它们", () => {
  const grouped = groupLocalArchives(archives);
  assert.equal(grouped.pending.count, 2);
  assert.equal(grouped.pending.items.map(item => item.id).sort().join(","), "a2,a3");
  assert.match(grouped.pending.warning, /未入库/);
  assert.match(grouped.pending.warning, /不含/);
});

test("按资源类型分组并给出各组占用空间，便于判断保留期该清哪些", () => {
  const grouped = groupLocalArchives(archives);
  const orderItems = grouped.groups.find(group => group.resourceType === "order_items");
  assert.equal(orderItems.label, "订单明细");
  assert.equal(orderItems.count, 2);
  assert.equal(orderItems.bytes, 17_000_000);
  assert.equal(grouped.totalBytes, 18_600_000);
  assert.equal(grouped.totalCount, 4);
});

test("组内按月份归类，与公司 Mac 上的目录结构一致", () => {
  const grouped = groupLocalArchives(archives);
  const inventory = grouped.groups.find(group => group.resourceType === "inventory_snapshot");
  assert.deepEqual(inventory.months.map(month => month.month), ["2026-06"]);
  const orderItems = grouped.groups.find(group => group.resourceType === "order_items");
  assert.deepEqual(orderItems.months.map(month => month.month), ["2026-07"]);
});

test("状态区分已入库、已下载未入库与处理中，三者含义不同不得混为一谈", () => {
  const grouped = groupLocalArchives(archives);
  const byId = new Map(grouped.groups.flatMap(group => group.months).flatMap(month => month.items).map(item => [item.id, item]));
  assert.equal(byId.get("a1").state, ARCHIVE_STATE.ingested);
  assert.equal(byId.get("a2").state, ARCHIVE_STATE.pending);
  assert.equal(byId.get("a4").state, ARCHIVE_STATE.processing);
  assert.equal(byId.get("a1").stateLabel, "已入库");
  assert.equal(byId.get("a2").stateLabel, "已下载未入库");
});

test("给出相对路径供在 Finder 定位，且不构造任何绝对路径", () => {
  const grouped = groupLocalArchives(archives);
  const item = grouped.groups.flatMap(group => group.months).flatMap(month => month.items).find(row => row.id === "a1");
  assert.equal(item.relativePath, "原始归档/order_items/2026-07/hashA__订单明细A.xlsx");
  assert.equal(JSON.stringify(grouped).includes("/Users/"), false, "不得出现任何绝对路径");
});

test("空归档不构造伪造分组", () => {
  const grouped = groupLocalArchives([]);
  assert.equal(grouped.groups.length, 0);
  assert.equal(grouped.pending.count, 0);
  assert.equal(grouped.totalCount, 0);
});
