import test from "node:test";
import assert from "node:assert/strict";
import { persistLocalState } from "../src/state/resilientLocalStorage.js";
import * as browserStorage from "../src/state/resilientLocalStorage.js";

function createStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    entries,
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    setItem(key, value) {
      entries.set(key, value);
    },
    removeItem(key) {
      entries.delete(key);
    }
  };
}

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

test("local cache serialization failures remain a non-fatal cache miss", () => {
  const state = {};
  state.self = state;

  assert.doesNotThrow(() => persistLocalState(createStorage(), "productFlowState", state));
  assert.equal(persistLocalState(createStorage(), "productFlowState", state), false);
});

test("safe storage reads and removals never escape restricted browser storage", () => {
  assert.equal(typeof browserStorage.tryGetStorageItem, "function");
  const restrictedStorage = {
    getItem() {
      throw new DOMException("Blocked", "SecurityError");
    },
    removeItem() {
      throw new DOMException("Blocked", "SecurityError");
    }
  };

  assert.doesNotThrow(() => browserStorage.tryGetStorageItem(restrictedStorage, "productFlowState"));
  assert.equal(browserStorage.tryGetStorageItem(restrictedStorage, "productFlowState"), null);
  assert.doesNotThrow(() => browserStorage.tryRemoveStorageItem(restrictedStorage, "productFlowState"));
  assert.equal(browserStorage.tryRemoveStorageItem(restrictedStorage, "productFlowState"), false);
});

test("browser storage access remains safe when a restricted WebView blocks the storage getter", () => {
  assert.equal(typeof browserStorage.getBrowserStorage, "function");
  const restrictedWindow = {};
  Object.defineProperty(restrictedWindow, "localStorage", {
    get() {
      throw new DOMException("Blocked", "SecurityError");
    }
  });

  assert.doesNotThrow(() => browserStorage.getBrowserStorage("localStorage", restrictedWindow));
  assert.equal(browserStorage.getBrowserStorage("localStorage", restrictedWindow), null);
  assert.equal(browserStorage.getBrowserStorage("sessionStorage", restrictedWindow), null);
});

test("application recovery clears only registered business caches", () => {
  assert.equal(typeof browserStorage.clearApplicationBrowserCaches, "function");
  const localStorage = createStorage({
    productFlowState: "large",
    dataCenterMetadata: "cached",
    authenticationSession: "keep"
  });
  const sessionStorage = createStorage({
    companyAiAssistantSessionV1: "conversation",
    "product-flow:deployment-reload-at": "123",
    csrfToken: "keep"
  });

  assert.deepEqual(browserStorage.clearApplicationBrowserCaches({ localStorage, sessionStorage }), {
    local: true,
    session: true
  });
  assert.equal(localStorage.getItem("productFlowState"), null);
  assert.equal(localStorage.getItem("dataCenterMetadata"), null);
  assert.equal(localStorage.getItem("authenticationSession"), "keep");
  assert.equal(sessionStorage.getItem("companyAiAssistantSessionV1"), null);
  assert.equal(sessionStorage.getItem("product-flow:deployment-reload-at"), null);
  assert.equal(sessionStorage.getItem("csrfToken"), "keep");
});

test("application recovery continues after one cache key cannot be removed", () => {
  assert.equal(typeof browserStorage.clearApplicationBrowserCaches, "function");
  const localStorage = createStorage({
    productFlowState: "blocked",
    dataCenterMetadata: "removable"
  });
  const removeItem = localStorage.removeItem.bind(localStorage);
  localStorage.removeItem = key => {
    if (key === "productFlowState") throw new DOMException("Blocked", "SecurityError");
    removeItem(key);
  };

  assert.deepEqual(browserStorage.clearApplicationBrowserCaches({
    localStorage,
    sessionStorage: createStorage()
  }), {
    local: false,
    session: true
  });
  assert.equal(localStorage.getItem("dataCenterMetadata"), null);
});
