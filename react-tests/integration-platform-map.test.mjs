import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("handbook routes the external platform map through authenticated user context", async () => {
  const [app, handbook] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/features/handbook/HandbookPage.jsx", import.meta.url), "utf8")
  ]);

  assert.match(app, /<HandbookPage[^>]*sessionUser=\{sessionUser\}/);
  assert.match(handbook, /platform\/external-platform-map/);
  assert.match(handbook, /<IntegrationPlatformMap sessionUser=\{sessionUser\}/);
});

test("platform map composes the public registry with private API degradation", async () => {
  const source = await readFile(
    new URL("../src/features/handbook/IntegrationPlatformMap.jsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /integration-registry\.json/);
  assert.match(source, /loadIntegrationProfiles/);
  assert.match(source, /内部资料暂不可用/);
  assert.match(source, /公开平台资料仍可正常查看/);
  assert.match(source, /aria-busy/);
});

test("platform map includes search, lifecycle filters, empty state, and relations", async () => {
  const source = await readFile(
    new URL("../src/features/handbook/IntegrationPlatformMap.jsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /搜索平台、能力或问题/);
  assert.match(source, /已连接/);
  assert.match(source, /集成中/);
  assert.match(source, /计划中/);
  assert.match(source, /已停用/);
  assert.match(source, /没有匹配的平台/);
  assert.match(source, /关联关系/);
});

test("platform admin editing has permission, disabled saving, and error states", async () => {
  const source = await readFile(
    new URL("../src/features/handbook/IntegrationPlatformMap.jsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /canManagePermissions\(sessionUser\)/);
  assert.match(source, /saveIntegrationProfile/);
  assert.match(source, /disabled=\{saving\}/);
  assert.match(source, /role="alert"/);
  assert.match(source, /最近验证日期/);
});

test("platform map layout has responsive single-column and focus-visible treatment", async () => {
  const source = await readFile(
    new URL("../src/features/handbook/integration-platform-map.css", import.meta.url),
    "utf8"
  );

  assert.match(source, /@media \(max-width: 900px\)[\s\S]*grid-template-columns: 1fr/);
  assert.match(source, /:focus-visible/);
  assert.match(source, /prefers-reduced-motion/);
});
