import test from "node:test";
import assert from "node:assert/strict";
import { persistLocalState } from "../src/state/resilientLocalStorage.js";

test("local cache quota failures do not escape product-flow state updates", () => {
  const storage = {
    setItem() {
      const error = new Error("Quota exceeded");
      error.name = "QuotaExceededError";
      throw error;
    }
  };
  const state = {
    productPlans: [{
      id: "plan-large-cover",
      demandSnapshot: { image: `data:image/png;base64,${"A".repeat(400_000)}` },
      developmentStart: "2026-07-22",
      launchDate: "2026-08-25"
    }]
  };

  assert.doesNotThrow(() => persistLocalState(storage, "productFlowState", state));
  assert.equal(persistLocalState(storage, "productFlowState", state), false);
});

test("local cache persistence returns the exact serialized snapshot when storage succeeds", () => {
  const entries = new Map();
  const storage = {
    setItem(key, value) {
      entries.set(key, value);
    }
  };
  const state = { productPlans: [{ id: "plan-1", launchDate: "2026-08-26" }] };

  assert.equal(persistLocalState(storage, "productFlowState", state), true);
  assert.equal(entries.get("productFlowState"), JSON.stringify(state));
});
