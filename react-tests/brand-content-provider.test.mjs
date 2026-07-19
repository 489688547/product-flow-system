import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { brandContentApiUrl } from "../src/state/brandContentApi.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("brand content API URL uses production data during local preview", () => {
  assert.equal(brandContentApiUrl("localhost"), "https://product-flow-system.pages.dev/api/brand-content");
  assert.equal(brandContentApiUrl("127.0.0.1"), "https://product-flow-system.pages.dev/api/brand-content");
  assert.equal(brandContentApiUrl("product-flow-system.pages.dev"), "/api/brand-content");
});

test("brand content client keeps calls behind one state boundary", () => {
  const provider = read("src/state/BrandContentProvider.jsx");
  assert.match(provider, /export function BrandContentProvider/);
  assert.match(provider, /export function useBrandContent/);
  assert.match(provider, /brandContentApiUrl/);
  assert.match(provider, /createDefaultBrandContentState/);
  assert.match(provider, /reduceBrandContentState/);
  assert.doesNotMatch(provider, /business\.oceanengine|xiaohongshu\.com|smb:\/\//i);
});

test("provider preserves optimistic edits, reports conflicts and exposes refresh", () => {
  const provider = read("src/state/BrandContentProvider.jsx");
  assert.match(provider, /const dispatch = useCallback/);
  assert.match(provider, /setState\(current => reduceBrandContentState/);
  assert.match(provider, /BRAND_CONTENT_VERSION_CONFLICT/);
  assert.match(provider, /修改尚未同步/);
  assert.match(provider, /refresh/);
  assert.match(provider, /saving/);
});

test("authenticated app mounts brand content provider inside the auth boundary", () => {
  const main = read("src/main.jsx");
  assert.match(main, /import \{ BrandContentProvider \}/);
  assert.match(main, /<BrandContentProvider>/);
  assert.match(main, /<App \/>/);
  assert.match(main, /<\/BrandContentProvider>/);
});
