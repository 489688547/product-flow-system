import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("asset library keeps NAS metadata read-only and visible while offline", () => {
  const page = read("src/features/brand-content/BrandAssetLibraryPage.jsx");
  const detail = read("src/features/brand-content/NasAssetDetail.jsx");
  assert.match(page, /NAS/);
  assert.match(page, /相对路径/);
  assert.match(page, /索引/);
  assert.match(detail, /复制路径/);
  assert.match(detail, /版本历史/);
  assert.doesNotMatch(`${page}\n${detail}`, /type="password"|上传原视频/);
});

test("advertising review blocks content verdict while data is unreconciled", () => {
  const page = read("src/features/brand-content/BrandAdvertisingReviewPage.jsx");
  assert.match(page, /DataQualityGate/);
  assert.match(page, /确认内容问题/);
  assert.match(page, /disabled=/);
  assert.match(page, /产品链接/);
  assert.match(page, /素材归因/);
});

test("data quality gate explains coverage difference and disabled action", () => {
  const gate = read("src/features/brand-content/DataQualityGate.jsx");
  assert.match(gate, /coverageRate/);
  assert.match(gate, /difference/);
  assert.match(gate, /暂不能确认内容问题/);
  assert.match(gate, /role="status"/);
});

test("brand accounts keep organic metrics separate from paid ROI", () => {
  const page = read("src/features/brand-content/BrandAccountPage.jsx");
  assert.match(page, /完播/);
  assert.match(page, /收藏/);
  assert.match(page, /涨粉/);
  assert.match(page, /付费放大/);
  assert.doesNotMatch(page, /自然内容 ROI/);
});

test("analysis pages replace placeholder routes", () => {
  const app = read("src/App.jsx");
  assert.match(app, /"content-assets": <BrandAssetLibraryPage/);
  assert.match(app, /"content-review": <BrandAdvertisingReviewPage/);
  assert.match(app, /"brand-accounts": <BrandAccountPage/);
});
