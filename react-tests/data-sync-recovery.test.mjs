import assert from "node:assert/strict";
import test from "node:test";
import { buildKuaimaiSalesRecovery } from "../src/domain/dataSyncRecovery.js";
import { loadWebCollectionStatus, triggerKuaimaiSalesCollection, webCollectionStatusApiUrl } from "../src/state/webCollectionApi.js";

const now = new Date("2026-07-23T01:05:00.000Z");
const runner = {
  id: "runner-1",
  name: "公司 Mac",
  status: "active",
  chromeStatus: "ready",
  lastSeenAt: "2026-07-23T01:04:00.000Z"
};

test("web collection status client reads the existing safe control-plane payload", async () => {
  assert.equal(webCollectionStatusApiUrl(), "/api/platform/v1/web-collection/jobs?limit=100");
  const status = await loadWebCollectionStatus(async url => {
    assert.equal(url, webCollectionStatusApiUrl());
    return new Response(JSON.stringify({ data: { runners: [runner], jobs: [], runs: [], cursors: [], notifications: [] } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  });
  assert.equal(status.runners[0].name, "公司 Mac");
  assert.deepEqual(status.jobs, []);
});

test("sales recovery client can auto-enqueue and manually requeue the exact Chrome resource", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({
      data: { created: calls.length === 1 ? 1 : 0, requeued: calls.length === 2, job: { id: "job-1", status: "queued" } }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  await triggerKuaimaiSalesCollection({ date: "2026-07-22" }, fetchImpl);
  await triggerKuaimaiSalesCollection({ date: "2026-07-22", resourceType: "sales_items", force: true }, fetchImpl);
  assert.equal(calls[0].url, "/api/platform/v1/web-collection/jobs");
  assert.equal(calls[0].options.credentials, "include");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    action: "trigger",
    providerId: "kuaimai",
    resourceType: "order_items",
    businessDate: "2026-07-22",
    force: false
  });
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    action: "trigger",
    providerId: "kuaimai",
    resourceType: "sales_items",
    businessDate: "2026-07-22",
    force: true
  });
});

test("sales recovery selects the exact Kuaimai order-item job and reports Chrome progress", () => {
  const recovery = buildKuaimaiSalesRecovery({
    date: "2026-07-22",
    runners: [runner],
    jobs: [
      { id: "orders", providerId: "kuaimai", resourceType: "orders", businessDate: "2026-07-22", status: "success", updatedAt: "2026-07-23T00:50:00.000Z" },
      { id: "items", providerId: "kuaimai", resourceType: "order_items", businessDate: "2026-07-22", status: "downloading", runnerId: "runner-1", attempt: 2, updatedAt: "2026-07-23T01:03:00.000Z" }
    ],
    now
  });
  assert.equal(recovery.job.id, "items");
  assert.equal(recovery.runner.id, "runner-1");
  assert.equal(recovery.label, "Chrome 采集中");
  assert.equal(recovery.tone, "warning");
  assert.deepEqual(recovery.primaryAction, { type: "refresh", label: "刷新采集进度" });
  assert.equal(recovery.showKuaimaiLogin, false);
  assert.match(recovery.instruction, /公司 Mac/);
});

test("sales recovery turns login, schema and offline states into named actions", () => {
  const login = buildKuaimaiSalesRecovery({
    date: "2026-07-22",
    runners: [runner],
    jobs: [{ id: "items", providerId: "kuaimai", resourceType: "order_items", businessDate: "2026-07-22", status: "waiting_human", errorCode: "KUAIMAI_LOGIN_REQUIRED", runnerId: "runner-1" }],
    now
  });
  assert.equal(login.label, "需要登录");
  assert.deepEqual(login.primaryAction, { type: "retrigger", label: "我已登录，重新触发" });
  assert.equal(login.showKuaimaiLogin, true);
  assert.match(login.instruction, /Chrome.*快麦.*登录/);

  const changed = buildKuaimaiSalesRecovery({
    date: "2026-07-22",
    runners: [runner],
    jobs: [{ id: "items", providerId: "kuaimai", resourceType: "order_items", businessDate: "2026-07-22", status: "schema_changed", errorCode: "KUAIMAI_ORDER_PAGE_SCHEMA_CHANGED", runnerId: "runner-1" }],
    now
  });
  assert.equal(changed.label, "页面结构变化");

  const offline = buildKuaimaiSalesRecovery({
    date: "2026-07-22",
    runners: [{ ...runner, lastSeenAt: "2026-07-22T23:00:00.000Z" }],
    jobs: [],
    now
  });
  assert.equal(offline.label, "采集器离线");
  assert.deepEqual(offline.primaryAction, { type: "refresh", label: "重新检测采集器" });
  assert.equal(offline.showConnectorLink, false);
  assert.match(offline.instruction, /公司 Mac.*后台采集服务.*心跳/);
});

test("queued work does not pretend to be collecting when the company Mac is offline", () => {
  const recovery = buildKuaimaiSalesRecovery({
    date: "2026-07-22",
    runners: [],
    jobs: [{ id: "items", providerId: "kuaimai", resourceType: "order_items", businessDate: "2026-07-22", status: "queued", stage: "queued" }],
    now
  });
  assert.equal(recovery.label, "采集器离线");
  assert.deepEqual(recovery.primaryAction, { type: "refresh", label: "重新检测采集器" });
  assert.equal(recovery.showConnectorLink, false);
  assert.match(recovery.title, /任务已排队/);
  assert.match(recovery.instruction, /后台采集服务.*自动领取任务/);
});

test("sales recovery keeps file import available when status cannot be read", () => {
  const recovery = buildKuaimaiSalesRecovery({
    date: "2026-07-22",
    error: "网络错误",
    now
  });
  assert.equal(recovery.label, "采集状态读取失败");
  assert.equal(recovery.canImportFile, true);
});
