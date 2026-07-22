import assert from "node:assert/strict";
import test from "node:test";

const adapterUrl = new URL("../chrome-extension/company-data-collector/providers/kuaimai.js", import.meta.url);

test("Kuaimai adapter only allows registered ERP origins", async () => {
  const { classifyKuaimaiPage } = await import(adapterUrl);

  assert.equal(classifyKuaimaiPage({ url: "https://evil.example/index.html#/trade/searchlist/", markers: {} }).state, "blocked_origin");
  assert.notEqual(classifyKuaimaiPage({ url: "https://erpb.superboss.cc/index.html#/trade/searchlist/", markers: {} }).state, "blocked_origin");
  assert.notEqual(classifyKuaimaiPage({ url: "https://erp.superboss.cc/index.html#/trade/searchlist/", markers: {} }).state, "blocked_origin");
});

test("Kuaimai adapter classifies login, human verification, ready and schema change safely", async () => {
  const { classifyKuaimaiPage } = await import(adapterUrl);

  assert.equal(classifyKuaimaiPage({
    url: "https://erpb.superboss.cc/login",
    markers: { loginPage: true }
  }).state, "waiting_login");
  assert.equal(classifyKuaimaiPage({
    url: "https://erpb.superboss.cc/index.html#/trade/searchlist/",
    markers: { humanVerification: true }
  }).state, "waiting_human");
  assert.equal(classifyKuaimaiPage({
    url: "https://erpb.superboss.cc/index.html#/trade/searchlist/",
    markers: { timeBasis: true, startTime: true, endTime: true, queryButton: true, exportOrders: true, exportOrderItems: true }
  }).state, "ready");
  assert.equal(classifyKuaimaiPage({
    url: "https://erpb.superboss.cc/index.html#/trade/searchlist/",
    markers: { timeBasis: true }
  }).state, "schema_changed");
});

test("Kuaimai orders use order creation time and yesterday full Shanghai day", async () => {
  const { buildKuaimaiActionPlan } = await import(adapterUrl);
  const task = { jobId: "job-1", providerId: "kuaimai", resourceType: "orders", businessDate: "2026-07-21" };
  const plan = buildKuaimaiActionPlan(task);

  assert.deepEqual(plan, [
    { action: "select_time_basis", value: "下单时间" },
    { action: "set_start_time", value: "2026-07-21 00:00:00" },
    { action: "set_end_time", value: "2026-07-21 23:59:59" },
    { action: "submit_query" },
    { action: "wait_for_results" },
    { action: "export_orders" }
  ]);
});

test("Kuaimai control matcher tolerates the live leading icon without confusing detail export", async () => {
  const { matchesKuaimaiControlText } = await import(adapterUrl);
  assert.equal(matchesKuaimaiControlText("导出订单", "导出订单"), true);
  assert.equal(matchesKuaimaiControlText("导出订单明细", "导出订单"), false);
  assert.equal(matchesKuaimaiControlText("导出订单明细", "导出订单明细"), true);
});

test("Kuaimai order item task uses the registered detail export", async () => {
  const { buildKuaimaiActionPlan } = await import(adapterUrl);
  const plan = buildKuaimaiActionPlan({
    jobId: "job-2",
    providerId: "kuaimai",
    resourceType: "order_items",
    businessDate: "2026-07-21"
  });

  assert.equal(plan.at(-1).action, "export_order_items");
});
