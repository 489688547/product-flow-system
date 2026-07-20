import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DATA_CENTER_PERSISTED_COLLECTIONS } from "../src/domain/dataCenter.js";
import { onRequest as dataStandardsRequest } from "../functions/api/platform/v1/data-standards.js";

const root = resolve(new URL("..", import.meta.url).pathname);
const read = path => readFileSync(resolve(root, path), "utf8");

test("legacy metadata cannot overwrite shared definitions in storage or browser cache", () => {
  assert.equal(DATA_CENTER_PERSISTED_COLLECTIONS.includes("metricDefinitions"), false);
  const provider = read("src/state/DataCenterProvider.jsx");
  assert.match(provider, /const \{ metricDefinitions: _governedByDataStandards, \.\.\.metadata \} = state/);
  const storage = read("functions/api/data-center/_shared/storage.js");
  assert.match(storage, /DATA_CENTER_PERSISTED_COLLECTIONS/);
  assert.doesNotMatch(storage, /TABLES = \{[\s\S]*metricDefinitions:/);
});

test("shared data standards return a structured 501 when D1 is unavailable", async () => {
  const response = await dataStandardsRequest({
    request: new Request("https://flow.example.com/api/platform/v1/data-standards"),
    env: {},
    data: { session: { userId: "exec-1", name: "总经理", department: "总经办" } }
  });
  const payload = await response.json();
  assert.equal(response.status, 501);
  assert.equal(payload.error.code, "DATA_STANDARD_STORAGE_UNAVAILABLE");
  assert.equal(payload.error.retryable, true);
});

test("local provider exposes builtin standards as read-only without inventing shared results", () => {
  const provider = read("src/state/DataStandardsProvider.jsx");
  assert.match(provider, /CORE_DATA_STANDARDS/);
  assert.match(provider, /storageUnavailable/);
  assert.match(provider, /本地测试模式没有 D1/);
  assert.doesNotMatch(provider, /setResults\(.*CORE_DATA_STANDARDS/);
});

test("the historical data-metrics hash still routes to the data standards workspace", () => {
  const app = read("src/App.jsx");
  const page = read("src/features/data-center/DataCenterAppPage.jsx");
  assert.match(app, /\["data-metrics", "数据口径",[^\]]+"metrics"\]/);
  assert.match(app, /DATA_CENTER_SCREEN_TO_SECTION = new Map/);
  assert.match(page, /metrics: <DataStandardsWorkspace/);
});

test("legacy KPI rollback is explicit, off by default and never mutates governed history", () => {
  const page = read("src/features/data-center/DataCenterAppPage.jsx");
  const overview = read("src/features/data-center/DataOverview.jsx");
  const environment = read(".env.example");
  assert.match(page, /VITE_DATA_CENTER_LEGACY_OVERVIEW_ROLLBACK/);
  assert.match(page, /buildLegacyDataCenterMetricResults/);
  assert.match(overview, /兼容回滚口径/);
  assert.match(environment, /VITE_DATA_CENTER_LEGACY_OVERVIEW_ROLLBACK=0/);
  assert.doesNotMatch(page, /archiveDefinition|recalculate/);
});
