import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("dashboard keeps task table readable on laptop widths", () => {
  assert.match(html, /@media \(max-width: 1680px\)/);
  assert.match(html, /#dashboard \.layout-main \{ grid-template-columns: 1fr; \}/);
  assert.match(html, /#dashboard \.task-table \{ min-width: 900px; \}/);
});

test("app shell uses a narrower navigation rail before mobile collapse", () => {
  assert.match(html, /\.app \{\s+min-height: 100vh;\s+display: grid;\s+grid-template-columns: 224px minmax\(0, 1fr\);/);
  assert.match(html, /@media \(max-width: 1680px\)[\s\S]*\.app \{ grid-template-columns: 188px minmax\(0, 1fr\);/);
});

test("sidebar uses a light collaboration-tool tone instead of a dark blue rail", () => {
  assert.match(html, /--sidebar: #ffffff;/);
  assert.match(html, /\.sidebar \{[\s\S]*border: 1px solid var\(--line\);/);
  assert.match(html, /\.nav button\.active \{[\s\S]*background: var\(--blue-soft\);[\s\S]*color: var\(--primary\);/);
  assert.doesNotMatch(html, /--sidebar: #0f172a;/);
});

test("product archive rows do not highlight the current product", () => {
  assert.doesNotMatch(html, /archive-row \$\{p\.id === currentId/);
  assert.doesNotMatch(html, /\.product-row\.active/);
});
