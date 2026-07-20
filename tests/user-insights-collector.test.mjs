import assert from "node:assert/strict";
import test from "node:test";
import {
  buildIngestBatch,
  classifyCapturedPage,
  collectRegisteredTasks,
  contentHash,
  extractMarketDimension,
  shouldRunScheduledCollection
} from "../scripts/user-insights-collector/core.mjs";

const task = {
  id: "mapping-1",
  platform: "抖音",
  shopId: "shop-1",
  categoryId: "cat-1",
  categoryName: "宠物用品",
  pageUrl: "https://compass.jinritemai.com/market/cat-1",
  dimensions: ["product"],
  schemaVersion: "v1",
  collectorConfig: {
    requiredColumns: { product: ["商品", "价格", "销量"] },
    fieldMap: { product: { 商品: "name", 价格: "price", 销量: "salesVolume" } }
  }
};

test("scheduled browser collection runs on Shanghai workdays and skips weekends", () => {
  assert.equal(shouldRunScheduledCollection(new Date("2026-07-20T00:00:00.000Z")), true);
  assert.equal(shouldRunScheduledCollection(new Date("2026-07-19T00:00:00.000Z")), false);
});

test("captured login and risk pages stop without exposing page content", () => {
  assert.deepEqual(classifyCapturedPage({ url: "https://login.example.com", title: "账号登录", text: "验证码登录" }), {
    status: "login_required",
    message: "平台登录已失效，请人工完成登录后重试。"
  });
  assert.equal(classifyCapturedPage({ url: task.pageUrl, title: "市场", text: "请完成安全验证" }).status, "login_required");
});

test("market extraction maps registered columns and marks missing fields partial", () => {
  const complete = extractMarketDimension(task, "product", {
    url: task.pageUrl,
    title: "类目市场",
    text: "商品市场",
    tables: [{ headers: ["商品", "价格", "销量"], rows: [["竞品 A", "29.9", "1200"]] }]
  });
  assert.equal(complete.status, "healthy");
  assert.equal(complete.entities[0].name, "竞品 A");
  assert.equal(complete.entities[0].metrics.price, 29.9);
  assert.equal(complete.entities[0].metrics.salesVolume, 1200);
  assert.equal(complete.snapshot.coverage, 1);

  const partial = extractMarketDimension(task, "product", {
    url: task.pageUrl,
    title: "类目市场",
    text: "商品市场",
    tables: [{ headers: ["商品", "价格"], rows: [["竞品 A", "29.9"]] }]
  });
  assert.equal(partial.status, "schema_changed");
  assert.match(partial.message, /销量/);
  assert.equal(partial.entities.length, 0);
});

test("ingest batches are deterministic, idempotent and contain no raw page or credentials", async () => {
  const extracted = extractMarketDimension(task, "product", {
    url: task.pageUrl,
    title: "类目市场",
    text: "商品市场",
    tables: [{ headers: ["商品", "价格", "销量"], rows: [["竞品 A", "29.9", "1200"]] }]
  }, "2026-07-20T07:30:00.000Z");
  const first = await buildIngestBatch(task, "product", extracted, "2026-07-20T07:30:00.000Z");
  const second = await buildIngestBatch(task, "product", extracted, "2026-07-20T07:30:00.000Z");
  assert.equal(first.idempotencyKey, second.idempotencyKey);
  assert.equal(first.snapshot.id, second.snapshot.id);
  assert.doesNotMatch(JSON.stringify(first), /rawHtml|cookie|authorization|验证码登录/);
  assert.equal(await contentHash({ b: 2, a: 1 }), await contentHash({ a: 1, b: 2 }));
});

test("collector visits only server-registered pages and reports each dimension", async () => {
  const visited = [];
  const posted = [];
  const browser = {
    async capture(url) {
      visited.push(url);
      return {
        url,
        title: "类目市场",
        text: "商品市场",
        tables: [{ headers: ["商品", "价格", "销量"], rows: [["竞品 A", "29.9", "1200"]] }]
      };
    }
  };
  const api = { async post(batch) { posted.push(batch); return { synced: true }; } };
  const result = await collectRegisteredTasks([task], { browser, api, now: new Date("2026-07-20T07:30:00.000Z") });
  assert.deepEqual(visited, [task.pageUrl]);
  assert.equal(posted.length, 1);
  assert.equal(posted[0].run.dimension, "product");
  assert.equal(result.completed, 1);
  assert.equal(result.failed, 0);
});
