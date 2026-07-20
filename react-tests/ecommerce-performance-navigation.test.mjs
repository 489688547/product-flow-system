import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizePlatformState } from "../src/domain/strategyExecution.js";

const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const registry = fs.readFileSync(new URL("../src/domain/strategyExecution.js", import.meta.url), "utf8");
const permissions = fs.readFileSync(new URL("../src/domain/permissions.js", import.meta.url), "utf8");

test("ecommerce operations follows product lifecycle while data center stays last", () => {
  assert.ok(app.indexOf('["archive", "产品档案"') < app.indexOf('...ECOMMERCE_OPERATIONS_NAV'));
  assert.ok(app.indexOf('...ECOMMERCE_OPERATIONS_NAV') < app.indexOf('...PERFORMANCE_MANAGEMENT_NAV'));
  assert.ok(app.indexOf('...PERFORMANCE_MANAGEMENT_NAV') < app.indexOf('...DATA_CENTER_NAV'));
  assert.match(app, /重点产品经营/);
  assert.match(app, /我的绩效/);
});

test("both providers wrap the app and both apps are registered", () => {
  assert.match(main, /EcommerceOperationsProvider/);
  assert.match(main, /PerformanceManagementProvider/);
  assert.match(registry, /id: "ecommerce-operations"/);
  assert.match(registry, /id: "performance-management"/);
});

test("performance work is presented as the Human Resources app", () => {
  assert.match(app, /\["performance-overview", "绩效总览", BarChart3, "人事管理", "overview"\]/);
  assert.match(app, /\["performance-mine", "我的绩效", ClipboardCheck, "人事管理", "mine"\]/);
  assert.match(registry, /id: "performance-management",\s+name: "人事管理"/);
  assert.match(permissions, /key: "performance-management", label: "人事管理"/);
  assert.match(permissions, /key: "performanceManagement", label: "人事管理"/);
});

test("legacy persisted app registry names normalize to Human Resources", () => {
  const state = normalizePlatformState({
    appRegistry: [{
      id: "performance-management",
      name: "绩效管理",
      description: "旧的绩效应用说明",
      route: "performance-management",
      enabled: true,
      status: "connected"
    }]
  });
  const hrApp = state.appRegistry.find(item => item.id === "performance-management");
  assert.equal(hrApp.name, "人事管理");
  assert.match(hrApp.description, /员工关系/);
  assert.equal(hrApp.status, "connected");
});
