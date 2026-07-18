import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

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
