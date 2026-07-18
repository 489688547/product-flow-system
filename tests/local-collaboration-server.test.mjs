import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("local helper exposes a persisted collaboration preview without sending real DingTalk todos", () => {
  assert.match(server, /LOCAL_COLLABORATION_PATH/);
  assert.match(server, /handleLocalCollaboration/);
  assert.match(server, /\/api\/platform\/v1\/collaboration-items/);
  assert.match(server, /本地预览不会发送真实钉钉待办/);
  assert.match(server, /normalizeCollaborationDraft/);
  assert.match(server, /applyCollaborationTransition/);
});
