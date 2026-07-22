import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(new URL("..", import.meta.url).pathname);
const read = path => readFileSync(resolve(root, path), "utf8");

test("shared date range picker keeps a draft until the user confirms", () => {
  const component = read("src/ui/DateRangePickerField.jsx");
  assert.match(component, /FloatingMenu/);
  assert.match(component, /mode="range"/);
  assert.match(component, /selected=\{draft\}/);
  assert.match(component, /onSelect=\{setDraft\}/);
  assert.match(component, /function confirm/);
  assert.match(component, /onConfirm\(next\)/);
  assert.match(component, /确认/);
  assert.match(component, /取消/);
  assert.match(component, /requestAnimationFrame/);
  assert.doesNotMatch(component, /onSelect=\{onConfirm\}/);
});

test("shared date range picker exposes presets, validation and accessible disabled states", () => {
  const component = read("src/ui/DateRangePickerField.jsx");
  assert.match(component, /presets\.map/);
  assert.match(component, /maxDays/);
  assert.match(component, /maxDate/);
  assert.match(component, /aria-haspopup="dialog"/);
  assert.match(component, /aria-expanded=\{open\}/);
  assert.match(component, /disabledReason/);
  assert.match(component, /role="status"/);
});

test("shared component catalog and responsive styles document the range picker contract", () => {
  const catalog = read("docs/platform/components.md");
  const styles = read("src/styles.css");
  assert.match(catalog, /DateRangePickerField[\s\S]*草稿不向父级提交/);
  assert.match(styles, /\.date-range-picker-trigger:focus-visible/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.date-range-picker-menu/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.date-range-picker-menu/);
});
