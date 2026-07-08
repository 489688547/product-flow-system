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
  assert.match(html, /@media \(max-width: 1680px\)[\s\S]*\.product-list-head,\s+\.product-row\.archive-row \{ grid-template-columns: minmax\(320px, 1fr\) 104px 64px 92px max-content; \}/);
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
  assert.match(html, /\.demand-col-actions \{ width: 168px; \}/);
  assert.match(html, /\.demand-table td:nth-child\(5\),\s+\.demand-table td:nth-child\(6\),\s+\.demand-table td:nth-child\(7\) \{[\s\S]*white-space: nowrap;/);
  assert.doesNotMatch(html, /来\s*<br|负\s*<br|创建时\s*<br/);
});

test("demand level filter lives in the table header as a compact icon menu", () => {
  assert.doesNotMatch(html, /\.demand-filter-bar/);
  assert.match(html, /\.table-filter-trigger \{[\s\S]*width: 22px;[\s\S]*height: 22px;/);
  assert.match(html, /\.table-filter-trigger i,\s+\.table-filter-trigger svg \{[\s\S]*width: 13px;[\s\S]*height: 13px;/);
  assert.match(html, /<i data-lucide="filter"><\/i>/);
  assert.match(html, /\.table-filter-popover \{[\s\S]*position: fixed;[\s\S]*width: 178px;/);
  assert.match(html, /data-demand-level-filter-toggle aria-label="筛选等级"/);
  assert.match(html, /id="demandLevelFilterMenu" role="menu" aria-label="筛选需求等级"/);
  assert.match(html, /function positionTableFilterMenu\(trigger, menu\)/);
});

test("workflow editor keeps task actions on one line at laptop widths", () => {
  assert.match(html, /\.task-row-actions \{[\s\S]*min-width: 0;[\s\S]*flex-wrap: nowrap;/);
  assert.match(html, /@media \(max-width: 720px\)[\s\S]*\.task-edit-row \{ grid-template-columns: 104px 360px 168px 180px 142px 268px; min-width: 1266px; \}/);
  assert.match(html, /\.task-row-actions \.mini-action \{[\s\S]*min-height: 32px;/);
});

test("workflow stage cards align progress bars and use an inline product switcher", () => {
  assert.match(html, /\.stage \{[\s\S]*grid-template-rows: 24px 18px 38px 8px 18px;/);
  assert.match(html, /\.stage-meta \{[\s\S]*min-height: 38px;[\s\S]*-webkit-line-clamp: 2;/);
  assert.doesNotMatch(html, /id="productSelect"/);
  assert.doesNotMatch(html, /每个阶段都拆成会前准备、会议\/决策、会后交付、下一阶段准入/);
  assert.match(html, /\.workflow-product-card \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) 30px;/);
  assert.match(html, /data-workflow-product-toggle aria-label="切换产品"/);
  assert.match(html, /id="workflowProductMenu" role="listbox" aria-label="切换产品"/);
  assert.match(html, /function positionWorkflowProductMenu\(trigger, menu\)/);
});
