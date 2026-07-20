import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("App renders permission-filtered navigation through accessible accordion groups", () => {
  const app = read("src/App.jsx");
  assert.match(app, /groupSidebarNavigation\(visibleNavigation\)/);
  assert.match(app, /expandedGroupForScreen\(visibleNavigation, activeScreen\)/);
  assert.match(app, /className="sidebar-group-toggle"/);
  assert.match(app, /aria-expanded=\{isExpanded\}/);
  assert.match(app, /aria-controls=\{groupId\}/);
  assert.match(app, /setExpandedAppGroup\(current => current === group\.label \? "" : group\.label\)/);
  assert.match(app, /group\.items\.map/);
});

test("desktop collapses App children while mobile restores the flat authorized navigation", () => {
  const css = read("src/styles.css");
  assert.match(css, /\.sidebar-app-group\.collapsible:not\(\.expanded\) \.sidebar-nav-item:not\(:first-child\)\s*\{[^}]*display:\s*none/s);
  assert.match(css, /\.sidebar-group-toggle:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.sidebar-group-toggle svg/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.sidebar-app-group\s*,\s*\.sidebar-group-items\s*\{[^}]*display:\s*contents/s);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.sidebar-app-group\.collapsible:not\(\.expanded\) \.sidebar-nav-item:not\(:first-child\)\s*\{[^}]*display:\s*grid/s);
});
