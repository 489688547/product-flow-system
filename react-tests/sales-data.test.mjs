import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  aggregateSalesRows,
  buildDailySeries,
  detectSalesColumns,
  detectSalesHeader,
  filterRowsByPeriod,
  isSalesBarcode,
  normalizeSalesDate,
  normalizeSkuCodes,
  resolveSalesPeriod,
  salesMonthsFromRows,
  sortPlatformSalesRows,
  summarizeProductSales
} from "../src/domain/salesData.js";
import { normalizeClientState } from "../src/state/stateModel.js";
import { DEFAULT_PERMISSIONS, FEATURE_PERMISSION_ITEMS, canViewFeature } from "../src/domain/permissions.js";
import { onRequest as salesRequest } from "../functions/api/sales.js";

const root = resolve(new URL("..", import.meta.url).pathname);
const read = path => readFileSync(resolve(root, path), "utf8");

const ERP_HEADER = ["序号", "订单商品明细ID", "系统订单号", "平台订单号", "系统商品编码(订单)", "系统商品标题(订单)", "下单时间", "付款时间", "发货时间", "完成时间", "店铺平台", "店铺名称", "订单商品数", "净销量", "订单买家已付金额", "净销售额", "净毛利", "退款金额", "销售成本", "发货前退款率", "发货后退款率"];

function erpRow(overrides = {}) {
  const base = {
    "序号": 1,
    "平台订单号": "3311032692420011684",
    "系统商品编码(订单)": "6977173969783",
    "系统商品标题(订单)": "TIYES 莓果冻干主粮",
    "下单时间": "2026-06-14 09:00:00",
    "付款时间": "2026-06-15 10:00:00",
    "店铺平台": "天猫",
    "净销量": 2,
    "订单买家已付金额": 40,
    "净销售额": 36,
    "净毛利": 20,
    "退款金额": 4,
    "销售成本": 16,
    "发货前退款率": "10.00%",
    "发货后退款率": "5.00%"
  };
  const merged = { ...base, ...overrides };
  return ERP_HEADER.map(column => merged[column] ?? "");
}

test("sales header detection finds the ERP export header below the title row", () => {
  const grid = [["销售统计分析-按订单商品明细(系统)"], ERP_HEADER, erpRow()];
  const headerInfo = detectSalesHeader(grid);
  assert.equal(headerInfo.headerIndex, 1);
  const detection = detectSalesColumns(headerInfo.header);
  assert.equal(detection.complete, true);
  assert.equal(detection.mapping.code, 4);
  // "平台订单号" (index 3) must not shadow the exact "店铺平台" column.
  assert.equal(detection.mapping.platform, 10);
  assert.equal(detection.mapping.qty, 13);
  assert.equal(detection.mapping.netSales, 15);
  assert.equal(detection.mapping.preShipRate, 19);
  assert.equal(detection.mapping.postShipRate, 20);
});

test("sales aggregation groups by code, day and platform, skipping summary rows", () => {
  const mapping = detectSalesColumns(ERP_HEADER).mapping;
  const rows = [
    erpRow(),
    erpRow({ "净销量": 1, "订单买家已付金额": 20, "净销售额": 18, "净毛利": 10, "退款金额": 0 }),
    erpRow({ "店铺平台": "拼多多", "净销量": 3 }),
    erpRow({ "下单时间": "2026-06-16 07:00:00", "付款时间": "", "发货时间": "2026-06-17 08:00:00" }),
    erpRow({ "系统商品编码(订单)": "", "系统商品标题(订单)": "汇总" }),
    erpRow({ "下单时间": "2000-11-30 00:00:00", "付款时间": "2000-11-30 00:00:00", "发货时间": "", "完成时间": "" })
  ];
  const result = aggregateSalesRows(rows, mapping);
  assert.equal(result.rows.length, 3);
  assert.equal(result.skipped, 2);
  assert.deepEqual(result.months, ["2026-06"]);
  assert.equal(result.titles["6977173969783"], "TIYES 莓果冻干主粮");
  const tmall15 = result.rows.find(row => row.platform === "天猫" && row.date === "2026-06-14");
  assert.equal(tmall15.qty, 3);
  assert.equal(tmall15.netSales, 54);
  // 40×10% + 20×10% = 6 pre-ship, 40×5% + 20×5% = 3 post-ship
  assert.equal(tmall15.preShipRefund, 6);
  assert.equal(tmall15.postShipRefund, 3);
});

test("sales aggregation uses order creation time before payment or shipment time", () => {
  const mapping = detectSalesColumns(ERP_HEADER).mapping;
  const result = aggregateSalesRows([
    erpRow({ "下单时间": "2026-06-10 23:59:59", "付款时间": "2026-06-11 00:00:05", "发货时间": "2026-06-12 08:00:00" })
  ], mapping);
  assert.equal(result.rows[0].date, "2026-06-10");
});

test("sales aggregation supports Kuaimai sales-topic exports with derived net metrics", () => {
  const header = [
    "规格商家编码", "主商家编码", "商品名称", "所属平台", "店铺名称", "下单时间",
    "销售数量", "退货数量", "商品买家已付金额", "销售金额", "退款金额", "销售成本", "退货成本", "销售毛利"
  ];
  const detection = detectSalesColumns(header);
  assert.equal(detection.complete, true);
  assert.equal(detection.mapping.code, 0);
  assert.equal(detection.mapping.fallbackCode, 1);
  assert.equal(detection.mapping.platform, 3);
  const result = aggregateSalesRows([
    ["6977173969783", "6977173969000", "TIYES 莓果冻干主粮", "抖音", "TIYES旗舰店", "2026-07-01 08:00:00", 10, 2, 200, 190, 30, 80, 16, 110],
    ["", "6977173969000", "TIYES 主品", "抖音", "TIYES旗舰店", "2026-07-01 09:00:00", 2, 0, 40, 38, 0, 16, 0, 22]
  ], detection.mapping);
  assert.deepEqual(result.rows.find(row => row.code === "6977173969783"), {
    code: "6977173969783", date: "2026-07-01", platform: "抖音",
    qty: 8, sales: 200, netSales: 160, grossProfit: 96, refund: 30, cost: 64,
    preShipRefund: 0, postShipRefund: 0
  });
  assert.equal(result.rows.find(row => row.code === "6977173969000").netSales, 38);
});

test("sales date and barcode normalization handle excel serials and bad values", () => {
  assert.equal(normalizeSalesDate("2026-06-15 10:00:00"), "2026-06-15");
  assert.equal(normalizeSalesDate("2026/6/5"), "2026-06-05");
  assert.equal(normalizeSalesDate(46188), "2026-06-15");
  assert.equal(normalizeSalesDate("2000-11-30"), "");
  assert.equal(isSalesBarcode("6977173969783"), true);
  assert.equal(isSalesBarcode("123456"), false);
  assert.deepEqual(normalizeSkuCodes([{ code: "6977173969783", price: "29.9" }, { code: "internal-test-sku" }, { code: "6978705011352", price: "" }]), [
    { code: "6977173969783", price: 29.9 },
    { code: "internal-test-sku", price: null },
    { code: "6978705011352", price: null }
  ]);
});

test("sales aggregation keeps ERP internal inventory-unit codes", () => {
  const mapping = detectSalesColumns(ERP_HEADER).mapping;
  const result = aggregateSalesRows([
    erpRow({ "系统商品编码(订单)": "1111", "系统商品标题(订单)": "测试库存单位" })
  ], mapping);
  assert.equal(result.skipped, 0);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].code, "1111");
  assert.equal(result.rows[0].qty, 2);
});

test("product sales summary computes margin, refunds and marketing expense from list price", () => {
  const daily = [
    { code: "6977173969783", date: "2026-06-01", platform: "天猫", qty: 10, sales: 200, netSales: 180, grossProfit: 100, refund: 20, cost: 80, preShipRefund: 12, postShipRefund: 8 },
    { code: "6977173969783", date: "2026-06-02", platform: "拼多多", qty: 5, sales: 90, netSales: 85, grossProfit: 45, refund: 5, cost: 40, preShipRefund: 3, postShipRefund: 2 },
    { code: "6900000000000", date: "2026-06-02", platform: "天猫", qty: 99, sales: 999, netSales: 999, grossProfit: 1, refund: 0, cost: 0 }
  ];
  const summary = summarizeProductSales(daily, [{ code: "6977173969783", price: 25 }]);
  assert.equal(summary.totals.qty, 15);
  assert.equal(summary.totals.netSales, 265);
  assert.equal(summary.totals.grossProfit, 145);
  assert.equal(summary.totals.marketingExpense, 25 * 15 - 265);
  // 营销费用率 = 营销费用 / 牌价(定价×销量)，让利比例上限100%
  assert.equal(summary.totals.marketingExpenseRate, Math.round((25 * 15 - 265) / (25 * 15) * 10000) / 100);
  // 发货前/发货后退款率 = 对应退款金额 / 买家已付金额
  assert.equal(summary.totals.preShipRefundRate, Math.round(15 / 290 * 10000) / 100);
  assert.equal(summary.totals.postShipRefundRate, Math.round(10 / 290 * 10000) / 100);
  assert.equal(summary.byPlatform[0].platform, "天猫");
  assert.equal(summary.byPlatform[0].grossMarginRate, Math.round(100 / 180 * 10000) / 100);
  assert.equal(summary.byPlatform[0].marketingExpenseRate, Math.round((250 - 180) / 250 * 10000) / 100);
  assert.equal(summary.byPlatform[0].preShipRefundRate, 6);
  assert.equal(summary.byPlatform[0].postShipRefundRate, 4);
  assert.equal(summary.byDay.length, 2);
  assert.deepEqual(salesMonthsFromRows(daily), ["2026-06"]);
  const unpriced = summarizeProductSales(daily, [{ code: "6977173969783", price: null }]);
  assert.equal(unpriced.totals.marketingExpense, null);
  assert.equal(unpriced.totals.unpricedQty, 15);
});

test("platform sales rows default to sales descending and support column direction", () => {
  const rows = [
    { platform: "天猫", qty: 5, netSales: 90, grossMarginRate: 55 },
    { platform: "拼多多", qty: 12, netSales: 180, grossMarginRate: 48 },
    { platform: "京东", qty: 8, netSales: 120, grossMarginRate: 61 }
  ];

  assert.deepEqual(sortPlatformSalesRows(rows).map(row => row.platform), ["拼多多", "京东", "天猫"]);
  assert.deepEqual(sortPlatformSalesRows(rows, { key: "qty", direction: "asc" }).map(row => row.platform), ["天猫", "京东", "拼多多"]);
  assert.deepEqual(sortPlatformSalesRows(rows, { key: "grossMarginRate", direction: "desc" }).map(row => row.platform), ["京东", "天猫", "拼多多"]);
  assert.deepEqual(rows.map(row => row.platform), ["天猫", "拼多多", "京东"]);
});

test("sales period presets resolve ranges and daily series fills missing days", () => {
  const rows = [
    { code: "6977173969783", date: "2026-06-28", platform: "天猫", qty: 2, sales: 40, netSales: 36, grossProfit: 20, refund: 0 },
    { code: "6977173969783", date: "2026-06-30", platform: "天猫", qty: 4, sales: 80, netSales: 72, grossProfit: 40, refund: 0 }
  ];
  const today = new Date("2026-07-11T09:00:00Z");
  assert.deepEqual(resolveSalesPeriod("15d", rows, {}, today), { start: "2026-06-16", end: "2026-06-30" });
  assert.deepEqual(resolveSalesPeriod("30d", rows, {}, today), { start: "2026-06-01", end: "2026-06-30" });
  assert.deepEqual(resolveSalesPeriod("thisMonth", rows, {}, today), { start: "2026-07-01", end: "2026-07-11" });
  assert.deepEqual(resolveSalesPeriod("lastMonth", rows, {}, today), { start: "2026-06-01", end: "2026-06-30" });
  assert.deepEqual(resolveSalesPeriod("custom", rows, { from: "2026-06-29", to: "2026-06-30" }, today), { start: "2026-06-29", end: "2026-06-30" });
  const period = { start: "2026-06-27", end: "2026-06-30" };
  const series = buildDailySeries(filterRowsByPeriod(rows, period), period);
  assert.equal(series.length, 4);
  assert.deepEqual(series.map(day => day.netSales), [0, 36, 0, 72]);
});

test("client state keeps normalized sku codes on products", () => {
  const state = normalizeClientState({
    products: [{ id: "p1", name: "莓果粮", stage: 2, skuCodes: [{ code: "6977173969783", price: "25" }, { code: "", price: "" }] }]
  });
  const product = state.products.find(item => item.id === "p1");
  assert.deepEqual(product.skuCodes, [{ code: "6977173969783", price: 25 }]);
});

test("sales data feature permission exists with defaults", () => {
  assert.ok(FEATURE_PERMISSION_ITEMS.some(item => item.key === "salesData"));
  assert.ok(DEFAULT_PERMISSIONS.features.salesData.viewDepartments.includes("产品部"));
  assert.equal(canViewFeature({}, { department: "产品部" }, "salesData"), true);
  assert.equal(canViewFeature({}, { department: "仓储部" }, "salesData"), false);
});

function createSalesD1Mock() {
  const rows = new Map();
  const meta = new Map();
  const mock = {
    rows,
    maxBoundParams: 0,
    async batch(statements) {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) {
          statement.values = values;
          mock.maxBoundParams = Math.max(mock.maxBoundParams, values.length);
          return statement;
        },
        async run() {
          if (/insert into product_sales_daily/i.test(sql)) {
            for (let index = 0; index < statement.values.length; index += 11) {
              const [code, date, platform, qty, sales, netSales, grossProfit, refund, cost, preShipRefund, postShipRefund] = statement.values.slice(index, index + 11);
              rows.set(`${code}|${date}|${platform}`, { code, date, platform, qty, sales, net_sales: netSales, gross_profit: grossProfit, refund, cost, pre_ship_refund: preShipRefund, post_ship_refund: postShipRefund });
            }
          }
          if (/delete from product_sales_daily/i.test(sql)) {
            const month = statement.values[0];
            [...rows.keys()].filter(key => key.split("|")[1].startsWith(month)).forEach(key => rows.delete(key));
          }
          if (/insert into product_sales_meta/i.test(sql)) {
            meta.set(statement.values[0], { payload: statement.values[1] });
          }
          return { success: true };
        },
        async first() {
          if (/from product_sales_meta/i.test(sql)) return meta.get(statement.values[0]) || null;
          return null;
        },
        async all() {
          if (/from product_sales_daily/i.test(sql)) {
            const codes = new Set(statement.values);
            return { results: [...rows.values()].filter(row => codes.has(row.code)) };
          }
          return { results: [] };
        }
      };
      return statement;
    }
  };
  return mock;
}

test("sales API stores daily rows per month and serves them by code", async () => {
  const noDb = await salesRequest({ request: new Request("https://flow.example.com/api/sales"), env: {} });
  assert.equal(noDb.status, 501);

  const db = createSalesD1Mock();
  const env = { PRODUCT_FLOW_DB: db };
  const post = await salesRequest({
    request: new Request("https://flow.example.com/api/sales", {
      method: "POST",
      body: JSON.stringify({
        source: "销售统计分析-202606.xlsx",
        importedBy: "周总",
        titles: { "6977173969783": "TIYES 莓果冻干主粮" },
        rows: [
          { code: "6977173969783", date: "2026-06-15", platform: "天猫", qty: 3, sales: 60, netSales: 54, grossProfit: 30, refund: 6, cost: 24 },
          { code: "6977173969783", date: "2026-06-15", platform: "拼多多", qty: 3, sales: 40, netSales: 40, grossProfit: 20, refund: 0, cost: 16 },
          { code: "not-a-code", date: "2026-06-15", platform: "天猫", qty: 1, sales: 1, netSales: 1, grossProfit: 1, refund: 0, cost: 0 }
        ]
      })
    }),
    env
  });
  const postBody = await post.json();
  assert.equal(postBody.synced, true);
  assert.equal(postBody.rows, 2);
  assert.deepEqual(postBody.months, ["2026-06"]);
  assert.ok(db.maxBoundParams <= 100, `D1 allows max 100 bound params, used ${db.maxBoundParams}`);

  const meta = await (await salesRequest({ request: new Request("https://flow.example.com/api/sales"), env })).json();
  assert.equal(meta.imports.length, 1);
  assert.equal(meta.titles["6977173969783"], "TIYES 莓果冻干主粮");

  const get = await salesRequest({ request: new Request("https://flow.example.com/api/sales?codes=6977173969783"), env });
  const getBody = await get.json();
  assert.equal(getBody.rows.length, 2);
  assert.equal(getBody.rows[0].netSales + getBody.rows[1].netSales, 94);

  const del = await salesRequest({ request: new Request("https://flow.example.com/api/sales?month=2026-06", { method: "DELETE" }), env });
  assert.equal((await del.json()).synced, true);
  const after = await (await salesRequest({ request: new Request("https://flow.example.com/api/sales?codes=6977173969783"), env })).json();
  assert.equal(after.rows.length, 0);
});

test("archive and settings wire the sales feature into the UI", () => {
  const archive = read("src/features/archive/ProductArchivePage.jsx");
  assert.match(archive, /ProductSalesModal/);
  assert.match(archive, /open-product-sales/);
  const modal = read("src/features/archive/ProductModal.jsx");
  assert.match(modal, /skuCodes/);
  assert.match(modal, /库存单位编码与定价/);
  assert.doesNotMatch(modal, /69码需为69开头|isSalesBarcode/);
  const settings = read("src/features/settings/SettingsPage.jsx");
  assert.match(settings, /SalesDataSettings/);
  assert.match(settings, /salesData/);
  const importer = read("src/features/settings/SalesDataSettings.jsx");
  assert.match(importer, /streamSpreadsheetRows/);
  assert.match(importer, /dropEdgeMonths/);
  assert.match(importer, /销售主题分析-按订单商品明细/);
  const salesModal = read("src/features/archive/ProductSalesModal.jsx");
  assert.match(salesModal, /SALES_PERIOD_PRESETS/);
  assert.match(salesModal, /SalesTrendChart/);
  // 多69码时可下拉选择单个SKU，默认全部
  assert.match(salesModal, /全部69码/);
  assert.match(salesModal, /selectedCode/);
  assert.match(salesModal, /platformSort/);
  assert.match(salesModal, /sortPlatformSalesRows/);
  assert.match(salesModal, /ArrowUpDown/);
  assert.match(salesModal, /ariaSort/);
  const dataTable = read("src/ui/DataTable.jsx");
  assert.match(dataTable, /aria-sort/);
  const chart = read("src/features/archive/SalesTrendChart.jsx");
  assert.match(chart, /LineChart/);
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.dependencies.xlsx, undefined, "xlsx parsing is dependency-free via xlsxLite");
  assert.ok(pkg.dependencies.recharts, "recharts renders the sales trend line chart");
});

test("xlsxLite streams rows out of a real zip container and parses csv", async () => {
  const { decodeCsvBuffer, streamXlsxRows, streamCsvRows } = await import("../src/domain/xlsxLite.js");
  const { deflateRawSync } = await import("node:zlib");
  const encoder = new TextEncoder();
  const crcTable = [...Array(256)].map((unused, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = bytes => {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };
  function buildZip(files) {
    const chunks = [];
    const central = [];
    let offset = 0;
    for (const [name, text] of files) {
      const nameBytes = encoder.encode(name);
      const raw = encoder.encode(text);
      const data = deflateRawSync(raw);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(8, 8, true);
      local.setUint32(14, crc32(raw), true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, raw.length, true);
      local.setUint16(26, nameBytes.length, true);
      chunks.push(new Uint8Array(local.buffer), nameBytes, data);
      const record = new DataView(new ArrayBuffer(46));
      record.setUint32(0, 0x02014b50, true);
      record.setUint16(10, 8, true);
      record.setUint32(16, crc32(raw), true);
      record.setUint32(20, data.length, true);
      record.setUint32(24, raw.length, true);
      record.setUint16(28, nameBytes.length, true);
      record.setUint32(42, offset, true);
      central.push(new Uint8Array(record.buffer), nameBytes);
      offset += 30 + nameBytes.length + data.length;
    }
    const centralStart = offset;
    const centralBytes = central.reduce((total, part) => total + part.length, 0);
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(8, files.length, true);
    eocd.setUint16(10, files.length, true);
    eocd.setUint32(12, centralBytes, true);
    eocd.setUint32(16, centralStart, true);
    const total = new Uint8Array(offset + centralBytes + 22);
    let cursor = 0;
    for (const part of [...chunks, ...central, new Uint8Array(eocd.buffer)]) {
      total.set(part, cursor);
      cursor += part.length;
    }
    return total.buffer;
  }
  const shared = '<sst><si><t>编码</t></si><si><t>数量</t></si><si><t>6977173969783</t></si><si><r><t>天</t></r><r><t>猫</t></r></si></sst>';
  const sheet = '<worksheet><sheetData>'
    + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'
    + '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>3.5</v></c><c r="C2" t="s"><v>3</v></c></row>'
    + '</sheetData></worksheet>';
  const zip = buildZip([
    ["xl/sharedStrings.xml", shared],
    ["xl/worksheets/sheet1.xml", sheet]
  ]);
  const rows = [];
  await streamXlsxRows(zip, row => rows.push(row));
  assert.deepEqual(rows[0], ["编码", "数量"]);
  assert.deepEqual(rows[1], ["6977173969783", 3.5, "天猫"]);

  const csvRows = [];
  streamCsvRows('编码,数量\n"69771,73969783",5\n', row => csvRows.push(row));
  assert.deepEqual(csvRows[1], ["69771,73969783", "5"]);
  assert.equal(decodeCsvBuffer(new Uint8Array([0xd6, 0xf7, 0xc9, 0xcc, 0xbc, 0xd2, 0xb1, 0xe0, 0xc2, 0xeb]).buffer), "主商家编码");
});
