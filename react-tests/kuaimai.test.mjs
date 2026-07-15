import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createOrderAggregator,
  gmt8Timestamp,
  kuaimaiConfigFromEnv,
  pullKuaimaiDay,
  signKuaimaiParams
} from "../functions/api/kuaimai/_shared/kuaimai.js";

const root = resolve(new URL("..", import.meta.url).pathname);
const read = path => readFileSync(resolve(root, path), "utf8");

test("kuaimai signature matches the official hmac-sha256 example from the API docs", async () => {
  // 官方文档示例：secret=helloworld，期望签名 7905D5EF...
  const params = {
    method: "open.system.time.get",
    appKey: "123456",
    timestamp: "2020-09-21 16:58:00",
    sign_method: "hmac-sha256",
    session: "test",
    format: "json",
    version: "1.0"
  };
  const sign = await signKuaimaiParams(params, "helloworld");
  assert.equal(sign, "7905D5EF37CA177B9219DBFA603F773A7616F424D545E731AAFBB992408F6CEE");
});

test("kuaimai config reads env vars and reports readiness", () => {
  assert.equal(kuaimaiConfigFromEnv({}).ready, false);
  const config = kuaimaiConfigFromEnv({ KUAIMAI_APP_KEY: "1", KUAIMAI_APP_SECRET: "2", KUAIMAI_ACCESS_TOKEN: "3", KUAIMAI_REFRESH_TOKEN: "4" });
  assert.equal(config.ready, true);
  assert.equal(config.refreshToken, "4");
});

test("gmt8 timestamp is formatted as yyyy-MM-dd HH:mm:ss in Asia/Shanghai", () => {
  assert.equal(gmt8Timestamp(new Date("2026-07-13T16:00:00Z")), "2026-07-14 00:00:00");
});

test("order aggregator groups child orders into daily product rows", () => {
  const shopMap = new Map([["101", "天猫"], ["102", "拼多多"]]);
  const aggregator = createOrderAggregator(shopMap);
  const payTime = new Date("2026-07-12T04:00:00Z").getTime(); // 上海时间 7-12 12:00
  aggregator.addOrder({
    userId: 101,
    payTime,
    orders: [
      { sysOuterId: "6977173969783", sysTitle: "莓果冻干主粮", num: 2, payment: "42.00", cost: 16, payTime },
      { sysOuterId: "6977173969783", num: 1, payment: "21.00", cost: 8, payTime },
      { sysOuterId: "not-a-code", num: 1, payment: "9.9", payTime },
      { sysOuterId: "6978705011352", num: 1, payment: "28.00", cost: 10, payTime, isCancel: 1 }
    ]
  });
  aggregator.addOrder({ userId: 102, payTime, orders: [{ sysOuterId: "6977173969783", num: 3, payment: "51.00", cost: 24, payTime }] });
  const result = aggregator.finish();
  assert.equal(result.orders, 2);
  assert.equal(result.skippedItems, 1);
  assert.equal(result.rows.length, 2);
  const tmall = result.rows.find(row => row.platform === "天猫");
  assert.equal(tmall.date, "2026-07-12");
  assert.equal(tmall.qty, 3);
  assert.equal(tmall.sales, 63);
  assert.equal(tmall.grossProfit, 39);
  assert.equal(result.titles["6977173969783"], "莓果冻干主粮");
});

test("pullKuaimaiDay paginates orders and reports continuation page", async () => {
  const config = { appKey: "k", appSecret: "s", accessToken: "t" };
  const calls = [];
  const fetchMock = async (url, options) => {
    const params = new URLSearchParams(options.body);
    calls.push(params.get("method"));
    const respond = payload => new Response(JSON.stringify({ success: true, ...payload }));
    if (params.get("method") === "erp.shop.list.query") {
      return respond({ list: [{ userId: 101, source: "tm", name: "旗舰店" }] });
    }
    const pageNo = Number(params.get("pageNo"));
    assert.equal(params.get("timeType"), "pay_time");
    assert.equal(params.get("startTime"), "2026-07-12 00:00:00");
    return respond({
      hasNext: pageNo < 3,
      list: [{ userId: 101, payTime: new Date("2026-07-12T04:00:00Z").getTime(), orders: [{ sysOuterId: "6977173969783", num: 1, payment: "20.00", cost: 8 }] }]
    });
  };
  const partial = await pullKuaimaiDay(config, { date: "2026-07-12", pageNo: 1, maxPages: 2 }, fetchMock);
  assert.equal(partial.nextPage, 3);
  assert.equal(partial.rows[0].qty, 2);
  const finished = await pullKuaimaiDay(config, { date: "2026-07-12", pageNo: 3, maxPages: 2 }, fetchMock);
  assert.equal(finished.nextPage, null);
  assert.equal(finished.rows[0].qty, 1);
  assert.ok(calls.filter(method => method === "erp.shop.list.query").length >= 1);
});

test("kuaimai endpoints and settings panel are wired in", () => {
  assert.match(read("functions/api/kuaimai/status.js"), /open\.system\.time\.get/);
  assert.match(read("functions/api/kuaimai/refresh.js"), /refreshKuaimaiSession/);
  assert.match(read("functions/api/kuaimai/pull.js"), /pullKuaimaiDay/);
  const panel = read("src/features/settings/KuaimaiSyncSettings.jsx");
  assert.match(panel, /\/api\/kuaimai\/status/);
  assert.match(panel, /replaceScope: "dates"/);
  const settings = read("src/features/settings/SettingsPage.jsx");
  assert.match(settings, /KuaimaiSyncSettings/);
  const store = read("src/state/salesStore.js");
  assert.match(store, /replaceScope/);
});
