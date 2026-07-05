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
  assert.match(html, /\.app \{\s+min-height: 100vh;\s+display: grid;\s+grid-template-columns: 172px minmax\(0, 1fr\);/);
  assert.match(html, /@media \(max-width: 1680px\)[\s\S]*\.app \{ grid-template-columns: 164px minmax\(0, 1fr\);/);
  assert.match(html, /\.nav button \{[\s\S]*white-space: nowrap;/);
});

test("product archive header and rows share laptop column widths", () => {
  assert.match(html, /@media \(max-width: 1680px\)[\s\S]*\.product-list-head,\s+\.product-row\.archive-row \{ grid-template-columns: minmax\(320px, 1fr\) 104px 64px 92px 486px; \}/);
});

test("sidebar uses a light collaboration-tool tone instead of a dark blue rail", () => {
  assert.match(html, /--sidebar: #ffffff;/);
  assert.match(html, /\.sidebar \{[\s\S]*border: 1px solid var\(--line\);/);
  assert.match(html, /\.nav button\.active \{[\s\S]*background: var\(--blue-soft\);[\s\S]*color: var\(--primary\);/);
  assert.doesNotMatch(html, /--sidebar: #0f172a;/);
});

test("dashboard metric cards expose color as a card-level surface", () => {
  assert.match(html, /\.metric \{[\s\S]*--metric-accent: var\(--blue\);[\s\S]*background: linear-gradient\(90deg, var\(--metric-accent-soft\) 0, #fff 62%\);/);
  assert.match(html, /\.metric\.blue \{ --metric-accent: #1d4ed8; --metric-accent-soft: var\(--blue-soft\);/);
  assert.match(html, /\.metric\.green \{ --metric-accent: #15803d; --metric-accent-soft: var\(--green-soft\);/);
  assert.match(html, /\["在流程中产品", inProcess, "覆盖 7 个产品阶段", "green", "git-branch", "products"\]/);
  assert.doesNotMatch(html, /border-left: 0;/);
});

test("product archive rows do not highlight the current product", () => {
  assert.doesNotMatch(html, /archive-row \$\{p\.id === currentId/);
  assert.doesNotMatch(html, /\.product-row\.active/);
});

test("top bar user identity allows full department and title text", () => {
  assert.match(html, /\.user-pill span \{[\s\S]*max-width: min\(360px, 42vw\);/);
  assert.doesNotMatch(html, /\.user-pill span \{[\s\S]*max-width: 150px;/);
});

test("demand table keeps Chinese headers, dates, and actions readable", () => {
  assert.match(html, /\.task-table th \{[\s\S]*white-space: nowrap;[\s\S]*word-break: keep-all;/);
  assert.match(html, /\.demand-table \{[\s\S]*min-width: 1248px;[\s\S]*table-layout: fixed;/);
  assert.match(html, /<col class="demand-col-source">/);
  assert.match(html, /\.demand-col-created \{ width: 96px; \}/);
  assert.match(html, /\.demand-col-actions \{ width: 172px; \}/);
  assert.match(html, /\.demand-table td:nth-child\(5\),\s+\.demand-table td:nth-child\(6\),\s+\.demand-table td:nth-child\(7\) \{[\s\S]*white-space: nowrap;/);
  assert.doesNotMatch(html, /来\s*<br|负\s*<br|创建时\s*<br/);
});
