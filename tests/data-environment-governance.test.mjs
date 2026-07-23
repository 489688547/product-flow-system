import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { findDirectProductionDbReferences } from "../scripts/check-data-environment-routing.mjs";

test("business routes do not resolve PRODUCT_FLOW_DB directly", () => {
  const violations = findDirectProductionDbReferences({ root: resolve(".") });
  assert.deepEqual(violations, []);
});
