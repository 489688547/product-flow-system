import test from "node:test";
import assert from "node:assert/strict";

async function loadSyncModule() {
  return import("../src/state/sharedStateSync.js").catch(() => ({}));
}

test("shared state sync cannot write before a server baseline is loaded", async () => {
  const { createSharedStateSyncSession } = await loadSyncModule();
  assert.equal(typeof createSharedStateSyncSession, "function");

  const session = createSharedStateSyncSession();
  assert.equal(session.canSave(), false);
  assert.throws(() => session.buildWrite({ products: [] }), /线上数据基线/);
});

test("shared state sync writes against the accepted baseline and advances after save", async () => {
  const { createSharedStateSyncSession } = await loadSyncModule();
  assert.equal(typeof createSharedStateSyncSession, "function");

  const session = createSharedStateSyncSession();
  session.acceptRemote({ synced: true, state: { products: [] }, updatedAt: "2026-07-20T06:44:47.806Z" });

  assert.equal(session.canSave(), true);
  assert.deepEqual(session.buildWrite({ products: [{ id: "p1" }] }), {
    state: { products: [{ id: "p1" }] },
    baseUpdatedAt: "2026-07-20T06:44:47.806Z"
  });

  session.acceptSaved({ synced: true, updatedAt: "2026-07-21T12:00:00.000Z" });
  assert.equal(session.buildWrite({ products: [] }).baseUpdatedAt, "2026-07-21T12:00:00.000Z");
});

test("shared state sync skips states that are unchanged from the accepted or saved baseline", async () => {
  const { createSharedStateSyncSession } = await loadSyncModule();
  const session = createSharedStateSyncSession();
  const remoteState = { products: [{ id: "p1", name: "产品一" }] };

  session.acceptRemote({ synced: true, state: remoteState, updatedAt: "2026-07-21T12:00:00.000Z" });
  assert.equal(session.buildWrite(structuredClone(remoteState)), null);

  const changedState = { products: [{ id: "p1", name: "产品一（新）" }] };
  assert.deepEqual(session.buildWrite(changedState), {
    state: changedState,
    baseUpdatedAt: "2026-07-21T12:00:00.000Z"
  });
  session.acceptSaved({ synced: true, updatedAt: "2026-07-21T12:01:00.000Z" }, changedState);
  assert.equal(session.buildWrite(structuredClone(changedState)), null);
});

test("product flow fingerprints ignore organization refresh timestamps but keep business changes", async () => {
  const module = await import("../src/state/productFlowStateFingerprint.js").catch(() => ({}));
  assert.equal(typeof module.productFlowStateFingerprint, "function");
  const state = {
    products: [{ id: "p1", name: "产品一" }],
    orgCache: { users: [{ userid: "u1", name: "周总" }], syncedAt: "2026-07-21T12:00:00.000Z", expiresAt: "2026-07-22T12:00:00.000Z" }
  };

  const refreshed = structuredClone(state);
  refreshed.orgCache.syncedAt = "2026-07-21T12:05:00.000Z";
  refreshed.orgCache.expiresAt = "2026-07-22T12:05:00.000Z";
  assert.equal(module.productFlowStateFingerprint(refreshed), module.productFlowStateFingerprint(state));

  refreshed.orgCache.users[0].name = "周荣庆";
  assert.notEqual(module.productFlowStateFingerprint(refreshed), module.productFlowStateFingerprint(state));
});

test("invalid remote payload keeps shared writes locked", async () => {
  const { createSharedStateSyncSession } = await loadSyncModule();
  assert.equal(typeof createSharedStateSyncSession, "function");

  const session = createSharedStateSyncSession();
  assert.throws(() => session.acceptRemote({ synced: false, state: null }), /尚未初始化/);
  assert.equal(session.canSave(), false);
});
