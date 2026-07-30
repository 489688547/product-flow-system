import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const workspace = await readFile(
  new URL("../src/features/data-center/DataGovernanceWorkspaces.jsx", import.meta.url),
  "utf8"
);

test("统一口径补数必须补销售主题报表，而不是只补订单明细", () => {
  // 线上曾把统一口径的补数写死为 order_items：任务次次成功、覆盖却纹丝不动，
  // 用户反复点「补这天」也没有任何效果——补的根本是另一个资源。
  // 统一口径的销售事实来自 sales_items，缺了它补多少次订单明细都无用。
  assert.match(workspace, /UNIFIED_CALIBER_RESOURCES\s*=\s*Object\.freeze\(\["sales_items"/);
  assert.match(workspace, /for \(const resourceType of UNIFIED_CALIBER_RESOURCES\)/);
  assert.doesNotMatch(
    workspace,
    /triggerKuaimaiSalesCollection\(\{ date: row\.businessDate, resourceType: "order_items"/,
    "统一口径不得只触发 order_items"
  );
});

test("sales_items 排在 order_items 之前", () => {
  // 采集器一次只处理一个任务，先补真正决定覆盖判定的那个，
  // 用户才能尽快看到页面上的红色消失。
  const match = workspace.match(/UNIFIED_CALIBER_RESOURCES\s*=\s*Object\.freeze\(\[([^\]]+)\]/);
  assert.ok(match, "未找到统一口径资源清单");
  const order = match[1].split(",").map(item => item.trim().replace(/"/g, ""));
  assert.deepEqual(order, ["sales_items", "order_items"]);
});
