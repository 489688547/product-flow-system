import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const design = readFileSync(new URL("../DESIGN.md", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("design guidelines define compact table header filters", () => {
  assert.match(design, /Table header filters:/);
  assert.match(design, /22px ghost icon/);
  assert.match(design, /fixed-position menu/);
  assert.match(design, /never clipped by table scroll containers/);
});

test("app shell defines shared elevation, radius, and layer tokens", () => {
  assert.match(html, /--shadow-panel: 0 1px 2px rgba\(15, 23, 42, \.04\);/);
  assert.match(html, /--shadow-popover: 0 12px 26px rgba\(15, 23, 42, \.14\);/);
  assert.match(html, /--radius-panel: 10px;/);
  assert.match(html, /--z-dropdown: 30;/);
  assert.match(html, /--z-modal: 50;/);
});

test("dialogs use a sticky header and footer with a scrollable body", () => {
  assert.match(html, /\.dialog \{[\s\S]*overflow: hidden;[\s\S]*grid-template-rows: auto minmax\(0, 1fr\) auto;/);
  assert.match(html, /\.dialog-head, \.dialog-foot \{[\s\S]*position: sticky;[\s\S]*backdrop-filter: blur\(10px\);/);
  assert.match(html, /\.dialog-body \{ padding: 18px; overflow: auto; \}/);
});

test("shared controls use one restrained hover vocabulary", () => {
  assert.match(html, /\.btn, \.icon-btn, \.mini-action \{[\s\S]*border: 1px solid var\(--control-border\);[\s\S]*box-shadow: none;/);
  assert.match(html, /\.btn:hover, \.icon-btn:hover, \.mini-action:hover \{ background: var\(--control-hover\); border-color: var\(--line-strong\); color: var\(--ink\); \}/);
  assert.match(html, /\.panel, \.card \{[\s\S]*border-radius: var\(--radius-panel\);[\s\S]*box-shadow: var\(--shadow-panel\);/);
});

test("app respects reduced motion and embedded webview viewports", () => {
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(html, /@supports \(height: 100dvh\)/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /overscroll-behavior-y: none;/);
  assert.match(html, /env\(safe-area-inset-bottom\)/);
});

test("modals close on overlay click and Escape", () => {
  assert.match(html, /const modalCloseActions = \{/);
  assert.match(html, /if \(e\.key !== "Escape"\) return;/);
  assert.match(html, /if \(e\.target\.id === "syncModal"\) closeSyncModal\(\);/);
});

test("table row actions use compact non-wrapping button groups", () => {
  assert.match(html, /\.task-table \.table-actions \{[\s\S]*width: 100%;[\s\S]*justify-content: flex-end;[\s\S]*flex-wrap: nowrap;/);
  assert.match(html, /\.task-table \.mini-action \{[\s\S]*height: 30px;[\s\S]*white-space: nowrap;/);
  assert.match(html, /\.task-table \.mini-action\.icon-only \{[\s\S]*width: 30px;[\s\S]*min-width: 30px;/);
  assert.match(design, /Table row actions: keep row actions inside a single `\.table-actions` group/);
});
