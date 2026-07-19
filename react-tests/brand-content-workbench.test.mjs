import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("overview exposes operational breaks instead of decorative metrics", () => {
  const page = read("src/features/brand-content/BrandContentOverviewPage.jsx");
  assert.match(page, /未发布/);
  assert.match(page, /缺素材 ID/);
  assert.match(page, /未获有效测试/);
  assert.match(page, /数据中心/);
  assert.match(page, /ContentOperationsTable/);
  assert.match(page, /责任队列/);
  assert.doesNotMatch(page, /hero|gradient/i);
});

test("brief creation requires product and three primary roles", () => {
  const modal = read("src/features/brand-content/ContentBriefModal.jsx");
  assert.match(modal, /ProductPicker/);
  assert.match(modal, /OrgSelect/);
  assert.match(modal, /主编导/);
  assert.match(modal, /主剪辑/);
  assert.match(modal, /主运营/);
  assert.match(modal, /DatePickerField/);
  assert.match(modal, /disabledReason=/);
});

test("workbench groups content by production state and uses explicit actions", () => {
  const page = read("src/features/brand-content/BrandContentWorkbenchPage.jsx");
  assert.match(page, /BRAND_PRODUCTION_STATUSES/);
  assert.match(page, /transition_content/);
  assert.match(page, /推进至/);
  assert.match(page, /退回剪辑/);
  assert.doesNotMatch(page, /draggable|onDrag/);
});

test("content status badge exposes text and icon semantics", () => {
  const badge = read("src/features/brand-content/ContentStatusBadge.jsx");
  assert.match(badge, /aria-label/);
  assert.match(badge, /data-status/);
  assert.match(badge, /Icon/);
});

test("overview and workbench replace their placeholder routes", () => {
  const app = read("src/App.jsx");
  assert.match(app, /BrandContentOverviewPage/);
  assert.match(app, /BrandContentWorkbenchPage/);
  assert.match(app, /"content-overview": <BrandContentOverviewPage/);
  assert.match(app, /"content-workbench": <BrandContentWorkbenchPage/);
});
