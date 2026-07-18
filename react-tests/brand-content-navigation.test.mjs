import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canViewNavigation, DEFAULT_PERMISSIONS } from "../src/domain/permissions.js";
import { createDefaultPlatformState } from "../src/domain/strategyExecution.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const BRAND_ROUTES = [
  "content-overview",
  "content-workbench",
  "content-assets",
  "content-review",
  "brand-accounts",
  "content-decisions",
  "content-team",
  "content-issues",
  "content-settings"
];

test("brand content uses nine left routes and no top subnavigation", () => {
  const app = read("src/App.jsx");
  assert.match(app, /品牌内容协同/);
  for (const route of BRAND_ROUTES) assert.match(app, new RegExp(route));
  const page = read("src/features/brand-content/BrandContentPlaceholderPage.jsx");
  assert.doesNotMatch(page, /role="tablist"|brand-content-tabs|顶部导航/);
  assert.match(app, /sidebar-section-label/);
});

test("brand and operations employees can see brand routes through permission defaults", () => {
  const brandUser = { department: "品牌部", title: "编导" };
  const operator = { department: "运营部", title: "运营" };
  for (const route of BRAND_ROUTES) {
    assert.equal(canViewNavigation(DEFAULT_PERMISSIONS, brandUser, route), true);
    assert.equal(canViewNavigation(DEFAULT_PERMISSIONS, operator, route), true);
  }
});

test("brand content is registered as a business App", () => {
  const state = createDefaultPlatformState();
  const app = state.appRegistry.find(item => item.id === "brand-content");
  assert.equal(app.route, "content-overview");
  assert.equal(app.enabled, true);
  assert.match(app.description, /内容/);
});

test("all brand routes are lazy loaded instead of joining the initial bundle", () => {
  const app = read("src/App.jsx");
  assert.match(app, /import\("\.\/features\/brand-content\/BrandContentPlaceholderPage\.jsx"\)/);
  assert.doesNotMatch(app, /^import .*BrandContentPlaceholderPage/m);
});
