import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const picker = fs.readFileSync(new URL("../src/features/progress/GroupExecutorPicker.jsx", import.meta.url), "utf8");
const modal = fs.readFileSync(new URL("../src/features/progress/TodoSyncModal.jsx", import.meta.url), "utf8");

test("todo sync offers person and group modes", () => {
  assert.match(picker, /按人员/);
  assert.match(picker, /按群聊/);
  assert.match(picker, /搜索群名称/);
});

test("selected groups load members and report skipped people", () => {
  assert.match(picker, /loadDingTalkGroupMembers/);
  assert.match(picker, /skippedCount/);
  assert.match(picker, /带入/);
});

test("todo submission still sends only people", () => {
  assert.match(modal, /onSync\(\{ executors: selectedUsers \}\)/);
  assert.doesNotMatch(modal, /onSync\(\{[^}]*groups/);
});
