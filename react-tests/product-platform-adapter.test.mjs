import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDefaultState } from "../src/domain/productFlow.js";
import { buildProductPlatformEvents, productAppLink } from "../src/domain/productPlatformAdapter.js";

test("Product Lifecycle emits stable progress owner and milestone facts", () => {
  const state = createDefaultState();
  const first = buildProductPlatformEvents(state, "2026-07-16");
  const second = buildProductPlatformEvents(state, "2026-07-16");
  assert.ok(first.some(event => event.kind === "progress_changed"));
  assert.ok(first.some(event => event.kind === "milestone_changed"));
  assert.ok(first.some(event => event.kind === "owner_changed"));
  assert.ok(first.every(event => event.appId === "product-flow" && event.idempotencyKey));
  assert.deepEqual(first.map(event => event.idempotencyKey), second.map(event => event.idempotencyKey));
});

test("overdue product tasks emit risk facts without duplicating source identity", () => {
  const state = createDefaultState();
  state.tasks = [{ id: "late-task", productId: "p1", stage: 2, title: "包装确认", due: "2026-07-10", done: false, ownerDept: "品牌" }];
  const events = buildProductPlatformEvents(state, "2026-07-16");
  const risk = events.find(event => event.kind === "risk_opened" && event.sourceRecordId === "late-task");
  assert.equal(risk.health, "off_track");
  assert.match(risk.summary, /逾期/);
});

test("Product Lifecycle deep links preserve the product identity", () => {
  assert.deepEqual(productAppLink({ id: "p1", name: "新品" }), {
    appId: "product-flow",
    entityType: "product",
    entityId: "p1",
    label: "新品",
    route: "progress",
    href: "#progress"
  });
});

test("the mounted bridge forwards Product Lifecycle facts to the platform", () => {
  const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const bridge = readFileSync(new URL("../src/features/platform/ProductFlowPlatformBridge.jsx", import.meta.url), "utf8");
  assert.match(main, /ProductFlowPlatformBridge/);
  assert.match(bridge, /buildProductPlatformEvents/);
  assert.match(bridge, /ingest_app_events/);
});
