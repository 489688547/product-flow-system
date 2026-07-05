import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("destructive actions use the in-app confirm dialog instead of native confirm", () => {
  assert.match(html, /id="confirmDialog"/);
  assert.match(html, /function requestConfirm\(/);
  assert.match(html, /function closeConfirmDialog\(/);
  assert.doesNotMatch(html, /confirm\(`确认删除/);
});

test("document deletion waits for in-app confirmation before mutating deliverables", () => {
  assert.match(html, /async function deleteDoc\(id\)/);
  assert.match(html, /await requestConfirm\(\{[\s\S]*title: "删除文件"[\s\S]*confirmText: "删除"/);
  assert.match(html, /state\.deliverables = state\.deliverables\.filter\(d => d\.id !== id\)/);
});
