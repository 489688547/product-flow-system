import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("App renders permission-filtered navigation through the shared two-level workspace shell", () => {
  const app = read("src/App.jsx");
  assert.match(app, /groupSidebarNavigation\(visibleNavigation\)/);
  assert.match(app, /activeNavigationGroup\(sidebarNavigationGroups, activeScreen\)/);
  assert.match(app, /<WorkspaceNavigation/);
  assert.match(app, /groups=\{sidebarNavigationGroups\}/);
  assert.match(app, /activeScreen=\{activeScreen\}/);
  assert.doesNotMatch(app, /SIDEBAR_EXPANDED_GROUPS_KEY/);
  assert.doesNotMatch(app, /expandedAppGroups/);
});

test("desktop separates App and page navigation while mobile keeps both as 44px scrollable bands", () => {
  const css = read("src/styles.css");
  assert.match(css, /\.app-shell\s*\{[^}]*grid-template-columns:\s*72px 220px minmax\(0, 1fr\)/s);
  assert.match(css, /\.workspace-app-rail\s*\{[^}]*height:\s*100dvh/s);
  assert.match(css, /\.workspace-context-sidebar\s*\{[^}]*height:\s*100dvh/s);
  assert.match(css, /\.workspace-app-button\.active/);
  assert.match(css, /\.workspace-context-button\.active/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.workspace-app-button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.workspace-context-button\s*\{[^}]*min-height:\s*44px/s);
});
