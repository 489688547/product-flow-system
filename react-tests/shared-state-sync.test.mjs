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

test("invalid remote payload keeps shared writes locked", async () => {
  const { createSharedStateSyncSession } = await loadSyncModule();
  assert.equal(typeof createSharedStateSyncSession, "function");

  const session = createSharedStateSyncSession();
  assert.throws(() => session.acceptRemote({ synced: false, state: null }), /尚未初始化/);
  assert.equal(session.canSave(), false);
});
