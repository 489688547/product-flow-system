import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDefaultPlatformState } from "../src/domain/strategyExecution.js";
import { canAccessDataCenter, DEFAULT_PERMISSIONS, FEATURE_PERMISSION_ITEMS, NAV_PERMISSION_ITEMS } from "../src/domain/permissions.js";

const root = resolve(new URL("..", import.meta.url).pathname);
const read = path => readFileSync(resolve(root, path), "utf8");

test("data center is the third registered business app", () => {
  const registry = createDefaultPlatformState().appRegistry;
  assert.deepEqual(registry.slice(0, 3).map(app => app.id), ["product-flow", "supply-chain", "data-center"]);
  assert.equal(registry[2].route, "data-center");
  assert.equal(registry[2].status, "connected");
});

test("data center has navigation and feature permission defaults", () => {
  assert.ok(NAV_PERMISSION_ITEMS.some(item => item.key === "data-center"));
  assert.ok(FEATURE_PERMISSION_ITEMS.some(item => item.key === "dataCenter"));
  assert.deepEqual(DEFAULT_PERMISSIONS.features.dataCenter.editDepartments, ["总经办", "运营部"]);
  assert.equal(canAccessDataCenter({ department: "运营部" }), true);
  assert.equal(canAccessDataCenter({ department: "财务部" }), true);
  assert.equal(canAccessDataCenter({ department: "品牌部" }), false);
});

test("data center navigation sits after product lifecycle with eight routes", () => {
  const app = read("src/App.jsx");
  assert.match(app, /const DATA_CENTER_NAV = \[[\s\S]*data-overview[\s\S]*data-analysis[\s\S]*data-sources[\s\S]*data-metrics[\s\S]*data-quality[\s\S]*data-sync[\s\S]*data-services[\s\S]*data-settings/);
  assert.match(app, /\["archive", "产品档案"[\s\S]*\.\.\.DATA_CENTER_NAV[\s\S]*\["handbook", "说明书"/);
  assert.match(app, /screen === "data-center" \? "data-overview"/);
  assert.match(app, /DATA_CENTER_SCREEN_TO_SECTION\.has\(screen\) \? "data-center"/);
  assert.match(app, /<DataCenterAppPage section=\{dataSection\}/);
});

test("main mounts data center provider inside product state with access gating", () => {
  const main = read("src/main.jsx");
  assert.match(main, /DataCenterProvider/);
  assert.match(main, /canAccessDataCenter/);
  assert.match(main, /<ProductFlowProvider>[\s\S]*<DataCenterProvider enabled=\{hasDataCenterAccess\}>[\s\S]*<SupplyChainProvider/);
});
