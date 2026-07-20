import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createDingTalkTodoRefreshController } from "../src/state/dingTalkTodoRefresh.js";

const modal = fs.readFileSync(new URL("../src/features/progress/TodoSyncModal.jsx", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../src/features/progress/ProductProgressPage.jsx", import.meta.url), "utf8");
const editor = fs.readFileSync(new URL("../src/ui/RichTextEditor.jsx", import.meta.url), "utf8");
const sharedModal = fs.readFileSync(new URL("../src/ui/Modal.jsx", import.meta.url), "utf8");
const provider = fs.readFileSync(new URL("../src/state/ProductFlowProvider.jsx", import.meta.url), "utf8");

test("todo composer exposes editable title priority deadline body and preview", () => {
  assert.match(modal, /TodoComposerFields/);
  assert.match(modal, /TodoPreview/);
  assert.match(modal, /createTodoComposerDraft/);
  assert.match(modal, /onSync\(\{ executors: selectedUsers, draft \}\)/);
});

test("progress page allows opening the composer before a deadline exists", () => {
  assert.doesNotMatch(page, /disabled=\{!hasValidDue\}/);
  assert.match(page, /onSync=\{async \(\{ executors, draft \}\)/);
  assert.doesNotMatch(page, /updateTask\(todoTask\.id, \{ due: draft\.dueDate \}\)/);
  assert.match(provider, /applyTaskTodoSyncSuccess/);
  assert.match(provider, /applyTaskTodoSyncFailure/);
});

test("product flow automatically refreshes remote DingTalk task changes", () => {
  assert.match(provider, /reconcileTaskTodosFromDingTalk/);
  assert.match(provider, /createDingTalkTodoRefreshController/);
  assert.match(provider, /window\.addEventListener\("focus"/);
  assert.match(provider, /todoRefreshController\.invalidate\(\)/);
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function todoListResponse(todos) {
  return { ok: true, json: async () => ({ synced: true, todos }) };
}

test("todo refresh accepts only the latest overlapping response", async () => {
  const first = deferred();
  const second = deferred();
  const responses = [first.promise, second.promise];
  const applied = [];
  const controller = createDingTalkTodoRefreshController({
    fetchImpl: async () => responses.shift(),
    onTodos: todos => applied.push(todos)
  });

  const firstRefresh = controller.refresh();
  const secondRefresh = controller.refresh();
  second.resolve(todoListResponse([{ taskId: "new" }]));
  assert.equal(await secondRefresh, true);
  first.resolve(todoListResponse([{ taskId: "old" }]));
  assert.equal(await firstRefresh, false);
  assert.deepEqual(applied, [[{ taskId: "new" }]]);
});

test("successful local sync can invalidate an in-flight todo refresh", async () => {
  const pending = deferred();
  const applied = [];
  const controller = createDingTalkTodoRefreshController({
    fetchImpl: async () => pending.promise,
    onTodos: todos => applied.push(todos)
  });

  const refresh = controller.refresh();
  controller.invalidate();
  pending.resolve(todoListResponse([{ taskId: "stale" }]));
  assert.equal(await refresh, false);
  assert.deepEqual(applied, []);
});

test("shared rich text editor supports compact text-only disabled mode", () => {
  assert.match(editor, /allowImages = true/);
  assert.match(editor, /compact = false/);
  assert.match(editor, /editor\.enable\(!disabled\)/);
  assert.match(editor, /querySelectorAll\("button, select"\)/);
});

test("shared modal traps focus and restores the trigger", () => {
  assert.match(sharedModal, /previousFocusRef/);
  assert.match(sharedModal, /event\.key === "Tab"/);
  assert.match(sharedModal, /previousFocusRef\.current\?\.focus/);
});
