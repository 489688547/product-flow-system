import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const panelPath = resolve("src/features/handbook/EnvironmentReadinessPanel.jsx");
const apiPath = resolve("src/state/environmentReadinessApi.js");
const cssPath = resolve("src/features/handbook/environment-readiness.css");

test("handbook routes the environment document to a dedicated readiness panel", () => {
  assert.equal(existsSync(panelPath), true, "environment readiness panel must exist");
  const handbook = readFileSync(resolve("src/features/handbook/HandbookPage.jsx"), "utf8");
  const panel = readFileSync(panelPath, "utf8");
  assert.match(handbook, /platform\/environment-readiness/);
  assert.match(handbook, /<EnvironmentReadinessPanel sessionUser=\{sessionUser\}/);
  assert.match(panel, /环境与生产数据/);
  assert.match(panel, /生产环境配置完整/);
  assert.match(panel, /生产环境缺少必要配置/);
});

test("readiness UI covers loading, errors, permissions, unlocking, locking, and rollback", () => {
  const panel = readFileSync(panelPath, "utf8");
  assert.match(panel, /aria-busy="true"/);
  assert.match(panel, /role="alert"/);
  assert.match(panel, /解锁 15 分钟生产写入/);
  assert.match(panel, /修改线上真实数据/);
  assert.match(panel, /正在修改线上真实数据/);
  assert.match(panel, /立即锁定/);
  assert.match(panel, /回滚/);
  assert.match(panel, /canManagePermissions/);
});

test("environment API client exposes readiness and production write actions", () => {
  assert.equal(existsSync(apiPath), true, "environment readiness API client must exist");
  const api = readFileSync(apiPath, "utf8");
  assert.match(api, /\/api\/platform\/v1\/environment-readiness/);
  assert.match(api, /\/api\/platform\/v1\/production-write-session/);
  assert.match(api, /\/api\/platform\/v1\/production-data\/rollback/);
  assert.match(api, /method: "DELETE"/);
});

test("environment readiness layout is responsive and preserves focus visibility", () => {
  assert.equal(existsSync(cssPath), true, "environment readiness CSS must exist");
  const css = readFileSync(cssPath, "utf8");
  assert.match(css, /repeat\(auto-fit, minmax\(280px, 1fr\)\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.doesNotMatch(css, /border-(?:left|right):\s*[2-9]/);
});
