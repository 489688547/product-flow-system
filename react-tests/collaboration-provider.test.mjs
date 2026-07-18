import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  createCollaborationItem,
  listCollaborationItems,
  syncCollaborationDingTodo,
  transitionCollaborationItem,
  updateCollaborationItem
} from "../src/state/collaborationApi.js";

function response(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("collaboration client preserves server error codes and conflict details", async () => {
  await assert.rejects(
    () => updateCollaborationItem("c1", { version: 1, patch: {} }, async () => response(409, {
      synced: false,
      message: "事项已被其他同事更新，请刷新后重试。",
      error: { code: "COLLABORATION_VERSION_CONFLICT", details: { currentVersion: 4 } }
    })),
    error => error.code === "COLLABORATION_VERSION_CONFLICT" && error.status === 409 && error.details.currentVersion === 4
  );
});

test("collaboration client sends scoped queries and governed writes", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    return response(options.method === "POST" ? 201 : 200, options.method === "POST"
      ? { synced: true, item: { id: "c1", version: 1 } }
      : { synced: true, items: [], nextCursor: "", scope: { mode: "department" } });
  };

  await listCollaborationItems({ view: "pending_acceptance", status: ["pending_acceptance", "returned"], query: "包装" }, fetchImpl);
  await createCollaborationItem({ title: "确认包装" }, fetchImpl);
  await transitionCollaborationItem("c1", { version: 1, transition: "accept", idempotencyKey: "accept-1" }, fetchImpl);
  await syncCollaborationDingTodo("c1", { version: 2, detailUrl: "https://flow.example.com/#/collaboration/c1" }, fetchImpl);

  assert.match(calls[0].url, /view=pending_acceptance/);
  assert.match(calls[0].url, /status=pending_acceptance/);
  assert.match(calls[0].url, /status=returned/);
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[2].options.method, "POST");
  assert.match(calls[2].url, /\/c1\/transitions$/);
  assert.match(calls[3].url, /\/c1\/dingtalk$/);
});

test("collaboration provider is mounted for all authenticated employees outside the executive platform provider", () => {
  const provider = fs.readFileSync(new URL("../src/state/CollaborationProvider.jsx", import.meta.url), "utf8");
  const main = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(provider, /export function CollaborationProvider/);
  assert.match(provider, /COLLABORATION_VERSION_CONFLICT/);
  assert.match(provider, /loadActivities/);
  assert.match(provider, /syncDingTodo/);
  assert.match(provider, /useCollaboration/);
  assert.match(main, /<CollaborationProvider>/);
  assert.match(main, /<CollaborationProvider>[\s\S]*<PlatformProvider enabled=\{hasCompanyAccess\}>/);
});
