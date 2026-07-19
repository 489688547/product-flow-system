import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const registry = fs.readFileSync(new URL("../src/domain/strategyExecution.js", import.meta.url), "utf8");
const permissions = fs.readFileSync(new URL("../src/domain/permissions.js", import.meta.url), "utf8");

test("ecommerce operations follows data center and performance follows operations", () => {
  assert.ok(app.indexOf('...DATA_CENTER_NAV') < app.indexOf('...ECOMMERCE_OPERATIONS_NAV'));
  assert.ok(app.indexOf('...ECOMMERCE_OPERATIONS_NAV') < app.indexOf('...PERFORMANCE_MANAGEMENT_NAV'));
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
  assert.match(permissions, /key: "performanceManagement", label: "绩效管理"/);
});
