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
  const { buildKuaimaiActionPlan, buildKuaimaiTaskUrl } = await import(adapterUrl);
  const task = { jobId: "job-1", providerId: "kuaimai", resourceType: "orders", businessDate: "2026-07-21" };
  const plan = buildKuaimaiActionPlan(task);

  assert.equal(
    buildKuaimaiTaskUrl("https://erpb.superboss.cc/index.html#/trade/searchlist/", task),
    "https://erpb.superboss.cc/index.html#/trade/searchlist/?pageNo=1&timeType=created&startTime=1784563200000&endTime=1784649599000&field=created&_emitFrom=search"
  );
  assert.deepEqual(plan, [
    {
      action: "verify_time_range",
      timeBasis: "下单时间",
      startValue: "2026-07-21 00:00:00",
      endValue: "2026-07-21 23:59:59"
    },
    { action: "wait_for_results" },
    { action: "export_orders" },
    { action: "confirm_export" },
    { action: "download_from_center", resourceType: "orders" }
  ]);
});

test("Kuaimai task URL rejects unregistered origins and invalid business dates", async () => {
  const { buildKuaimaiTaskUrl } = await import(adapterUrl);
  const task = { jobId: "job-1", providerId: "kuaimai", resourceType: "orders", businessDate: "2026-07-21" };

  assert.throws(
    () => buildKuaimaiTaskUrl("https://evil.example/index.html#/trade/searchlist/", task),
    error => error?.code === "KUAIMAI_ORIGIN_BLOCKED"
  );
  assert.throws(
    () => buildKuaimaiTaskUrl("https://erpb.superboss.cc/index.html#/trade/searchlist/", {
      ...task,
      businessDate: "2026-02-30"
    }),
    error => error?.code === "EXTENSION_TASK_BUSINESS_DATE_INVALID"
  );
});

test("Kuaimai control matcher tolerates the live leading icon without confusing detail export", async () => {
  const { matchesKuaimaiControlText } = await import(adapterUrl);
  assert.equal(matchesKuaimaiControlText("导出订单", "导出订单"), true);
  assert.equal(matchesKuaimaiControlText("导出订单明细", "导出订单"), false);
  assert.equal(matchesKuaimaiControlText("导出订单明细", "导出订单明细"), true);
});

test("Kuaimai order item task uses the registered detail export", async () => {
  const { buildKuaimaiActionPlan, kuaimaiResources } = await import(adapterUrl);
  const plan = buildKuaimaiActionPlan({
    jobId: "job-2",
    providerId: "kuaimai",
    resourceType: "order_items",
    businessDate: "2026-07-21"
  });

  assert.equal(plan.at(-3).action, "export_order_items");
  assert.equal(plan.at(-2).action, "confirm_export");
  assert.deepEqual(plan.at(-1), { action: "download_from_center", resourceType: "order_items" });
  assert.deepEqual(kuaimaiResources.orders.downloadFilePrefixes, ["快麦ERP交易订单导出"]);
  assert.deepEqual(kuaimaiResources.order_items.downloadFilePrefixes, ["快麦ERP交易订单明细导出"]);
  assert.deepEqual(kuaimaiResources.orders.downloadOrigins, [
    "https://erp-tmp-new.oss-cn-zhangjiakou.aliyuncs.com"
  ]);
  assert.deepEqual(kuaimaiResources.order_items.downloadOrigins, [
    "https://erp-tmp-new.oss-cn-zhangjiakou.aliyuncs.com"
  ]);
});

test("Kuaimai sales-item task uses the rich sales report and creation-time controls", async () => {
  const { buildKuaimaiActionPlan, buildKuaimaiTaskUrl, kuaimaiResources } = await import(adapterUrl);
  const task = {
    jobId: "job-sales",
    providerId: "kuaimai",
    resourceType: "sales_items",
    businessDate: "2026-07-22"
  };

  assert.equal(
    buildKuaimaiTaskUrl("https://erpb.superboss.cc/index.html#/report/sale_multidimension_next/", task),
    "https://erpb.superboss.cc/index.html#/report/sale_multidimension_next/"
  );
  assert.deepEqual(buildKuaimaiActionPlan(task), [
    {
      action: "prepare_sales_report",
      timeBasis: "创建时间",
      businessDate: "2026-07-22",
      dimension: "按订单商品明细"
    },
    { action: "calculate_sales_report" },
    { action: "export_sales_items" },
    { action: "confirm_sales_export" },
    { action: "download_from_center", resourceType: "sales_items" }
  ]);
  assert.equal(kuaimaiResources.sales_items.route, "/index.html#/report/sale_multidimension_next/");
  assert.deepEqual(kuaimaiResources.sales_items.downloadFilePrefixes, ["销售主题分析-按订单商品明细-"]);
});

test("Kuaimai download center selects only the current task resource and time window", async () => {
  const {
    KUAIMAI_DOWNLOAD_CENTER_ROUTE,
    KUAIMAI_DOWNLOAD_CENTER_SELECTORS,
    selectKuaimaiDownloadRow
  } = await import(adapterUrl);
  const startedAt = Date.parse("2026-07-23T07:07:25.000Z");
  const rows = [
    {
      exportTime: "2026-07-23 15:07:39",
      content: "快麦ERP交易订单明细导出20260723150745_269021_3tS1kT.xlsx",
      status: "导出完成"
    },
    {
      exportTime: "2026-07-23 15:07:36",
      content: "快麦ERP交易订单导出20260723150742_269021_ab12Cd.xlsx",
      status: "导出完成"
    },
    {
      exportTime: "2026-07-22 20:52:55",
      content: "快麦ERP交易订单明细导出20260722205305_269021_W4k3pA.xlsx",
      status: "导出完成"
    },
    {
      exportTime: "2026-07-23 15:07:40",
      content: "销售主题分析-按订单商品明细-20260723150740_a01a2c7ba370217f",
      status: "导出完成"
    }
  ];

  assert.equal(KUAIMAI_DOWNLOAD_CENTER_ROUTE, "/index.html#/index/download_center/");
  assert.deepEqual(KUAIMAI_DOWNLOAD_CENTER_SELECTORS, {
    row: ".m-data-item",
    exportTime: ".exportTime",
    content: ".content",
    status: ".schedule",
    refresh: ".j-search",
    download: ".J-download"
  });
  assert.deepEqual(selectKuaimaiDownloadRow({ resourceType: "order_items", startedAt, rows }), {
    state: "ready",
    rowIndex: 0
  });
  assert.deepEqual(selectKuaimaiDownloadRow({ resourceType: "orders", startedAt, rows }), {
    state: "ready",
    rowIndex: 1
  });
  assert.deepEqual(selectKuaimaiDownloadRow({ resourceType: "sales_items", startedAt, rows }), {
    state: "ready",
    rowIndex: 3
  });
});

test("Kuaimai download center distinguishes pending, failed and missing exports", async () => {
  const { selectKuaimaiDownloadRow } = await import(adapterUrl);
  const startedAt = Date.parse("2026-07-23T07:07:25.000Z");

  assert.deepEqual(selectKuaimaiDownloadRow({
    resourceType: "order_items",
    startedAt,
    rows: [{
      exportTime: "2026-07-23 15:07:39",
      content: "快麦ERP交易订单明细导出20260723150745_269021_3tS1kT.xlsx",
      status: "生成中"
    }]
  }), { state: "pending", rowIndex: 0 });
  assert.deepEqual(selectKuaimaiDownloadRow({
    resourceType: "order_items",
    startedAt,
    rows: [{
      exportTime: "2026-07-23 15:07:39",
      content: "快麦ERP交易订单明细导出20260723150745_269021_3tS1kT.xlsx",
      status: "失败"
    }]
  }), {
    state: "failed",
    rowIndex: 0,
    errorCode: "KUAIMAI_EXPORT_GENERATION_FAILED"
  });
  assert.deepEqual(selectKuaimaiDownloadRow({
    resourceType: "order_items",
    startedAt,
    rows: [{
      exportTime: "2026-07-23 15:06:50",
      content: "快麦ERP交易订单明细导出20260723150655_269021_W4k3pA.xlsx",
      status: "导出完成"
    }]
  }), { state: "missing", rowIndex: null });
});
