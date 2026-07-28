import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createDingTalkTodoRefreshController } from "../src/state/dingTalkTodoRefresh.js";

const modal = fs.readFileSync(new URL("../src/features/progress/TodoSyncModal.jsx", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../src/features/progress/ProductProgressPage.jsx", import.meta.url), "utf8");
const editor = fs.readFileSync(new URL("../src/ui/RichTextEditor.jsx", import.meta.url), "utf8");
const sharedModal = fs.readFileSync(new URL("../src/ui/Modal.jsx", import.meta.url), "utf8");
const provider = fs.readFileSync(new URL("../src/state/ProductFlowProvider.jsx", import.meta.url), "utf8");
const completion = fs.readFileSync(new URL("../src/features/progress/TaskCompletionProgress.jsx", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

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

test("progress page opens DingTalk todo links without a custom completion action", () => {
  assert.match(app, /parseTaskTodoDeepLink\(window\.location\.href\)/);
  assert.match(app, /if \(!screenAllowed\) showScreen\(defaultScreen\)/);
  assert.doesNotMatch(page, /activeFocus\?\.action === "complete"/);
  assert.doesNotMatch(page, /完成并同步钉钉/);
  assert.doesNotMatch(page, /syncFocusedTaskCompletion/);
  assert.match(page, /document\.getElementById/);
});

test("product flow automatically refreshes remote DingTalk task changes", () => {
  assert.match(provider, /reconcileTaskTodosFromDingTalk/);
  assert.match(provider, /createDingTalkTodoRefreshController/);
  assert.match(provider, /boundDingTalkTodoIdsForUser/);
  assert.match(provider, /todoRefreshController\.refresh\(assignedTodoIds\)/);
  assert.match(provider, /window\.addEventListener\("focus"/);
  assert.match(provider, /todoRefreshController\.invalidate\(\)/);
});

test("task rows show per-person completion and reserve final acceptance for the product manager", () => {
  assert.match(page, /TaskCompletionProgress/);
  assert.match(completion, /taskCompletionProgress/);
  assert.match(completion, /最终验收/);
  assert.match(completion, /disabled=\{!isManager/);
  assert.match(completion, /buildTaskAcceptancePatch/);
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function todoListResponse(todos) {
  return { ok: true, json: async () => ({ synced: true, todos }) };
}

test("todo refresh coalesces overlapping triggers into one DingTalk request", async () => {
  const pending = deferred();
  let fetchCount = 0;
  const applied = [];
  const controller = createDingTalkTodoRefreshController({
    fetchImpl: async () => {
      fetchCount += 1;
      return pending.promise;
    },
    onTodos: todos => applied.push(todos)
  });

  const firstRefresh = controller.refresh();
  const secondRefresh = controller.refresh();
  assert.equal(fetchCount, 1);
  pending.resolve(todoListResponse([{ taskId: "current" }]));
  assert.equal(await firstRefresh, true);
  assert.equal(await secondRefresh, true);
  assert.deepEqual(applied, [[{ taskId: "current" }]]);
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

test("product todo refresh surfaces personal reauthorization without discarding work cards", async () => {
  const warnings = [];
  const applied = [];
  const controller = createDingTalkTodoRefreshController({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        synced: true,
        todos: [{ taskId: "legacy-work-1", isDone: true }],
        warnings: [{ code: "DINGTALK_USER_AUTH_REQUIRED", message: "请重新使用钉钉登录" }]
      })
    }),
    onTodos: todos => applied.push(todos),
    onWarnings: items => warnings.push(items)
  });

  assert.equal(await controller.refresh(), true);
  assert.deepEqual(applied, [[{ taskId: "legacy-work-1", isDone: true }]]);
  assert.equal(warnings[0][0].code, "DINGTALK_USER_AUTH_REQUIRED");
});

test("shared rich text editor supports compact text-only disabled mode", () => {
  assert.match(editor, /allowImages = true/);
  assert.match(editor, /compact = false/);
  assert.match(editor, /editor\.enable\(!disabled\)/);
  assert.match(editor, /querySelectorAll\("button, select"\)/);
});

test("shared modal traps focus and restores the trigger", () => {
  assert.match(sharedModal, /trigger: document\.activeElement/);
  assert.match(sharedModal, /event\.key !== "Tab"/);
  assert.match(sharedModal, /trigger\.focus\(\)/);
});
