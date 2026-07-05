import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("core pages use shared page sections and empty states", () => {
  assert.match(html, /class="page-section"/);
  assert.match(html, /class="empty-state"/);
  assert.match(html, /emptyStateHtml/);
});

test("demand pool separates workflow rules, board, and sortable record table", () => {
  assert.match(html, /需求看板/);
  assert.match(html, /需求记录/);
  assert.match(html, /class="section-toolbar"/);
  assert.match(html, /class="demand-status-strip"/);
});

test("product archive actions are discoverable without relying only on icons", () => {
  assert.match(html, /class="product-action-menu"/);
  assert.match(html, /<span>进度<\/span>/);
  assert.match(html, /<span>资料<\/span>/);
  assert.match(html, /<span>评审<\/span>/);
});

test("package manager exposes drag and drop affordance and file empty state", () => {
  assert.match(html, /class="package-drop-hint"/);
  assert.match(html, /拖拽文件到这里/);
  assert.match(html, /暂无资料文件/);
});

test("review and lifecycle pages group actions and editable data areas", () => {
  assert.match(html, /class="review-action-group"/);
  assert.match(html, /class="lifecycle-data-panel"/);
  assert.match(html, /class="metric-input"/);
});
