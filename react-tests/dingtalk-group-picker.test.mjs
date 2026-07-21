import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const picker = fs.readFileSync(new URL("../src/features/progress/GroupExecutorPicker.jsx", import.meta.url), "utf8");
const modal = fs.readFileSync(new URL("../src/features/progress/TodoSyncModal.jsx", import.meta.url), "utf8");

test("todo sync offers person and group modes", () => {
  assert.match(picker, /按人员/);
  assert.match(picker, /按群聊/);
  assert.match(picker, /搜索群名称/);
  assert.match(picker, /loadMyDingTalkGroups/);
  assert.match(picker, /我的群聊/);
});

test("selected groups load members and report skipped people", () => {
  assert.match(picker, /loadDingTalkGroupMembers/);
  assert.match(picker, /skippedCount/);
  assert.match(picker, /skippedMembers/);
  assert.match(picker, /带入/);
  assert.match(picker, /重新加载/);
});

test("todo submission sends people and the edited draft but never raw group ids", () => {
  assert.match(modal, /onSync\(\{ executors: selectedUsers, draft \}\)/);
  assert.doesNotMatch(modal, /onSync\(\{[^}]*groups/);
});

test("group member loading disables all selection controls", () => {
  assert.match(picker, /const interactionDisabled = disabled \|\| Boolean\(loadingGroupId\)/);
  assert.match(picker, /disabled=\{interactionDisabled\}/);
});
