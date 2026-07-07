import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("settings page exposes editable flow and rule configuration", () => {
  assert.match(html, /id="stageConfigRows"/);
  assert.match(html, /id="meetingConfigRows"/);
  assert.match(html, /id="lifecycleConfigRows"/);
  assert.match(html, /id="resetConfigBtn"/);
  assert.match(html, /function renderStageConfig\(/);
  assert.match(html, /function renderMeetingConfig\(/);
  assert.match(html, /function renderLifecycleConfig\(/);
});

test("config overrides are persisted and applied on load", () => {
  assert.match(html, /const CONFIG_DEFAULTS = \{/);
  assert.match(html, /function applyConfigOverrides\(/);
  assert.match(html, /function resetConfigToDefaults\(/);
  assert.match(html, /applyConfigOverrides\(state\.config\);/);
  assert.match(html, /function updateConfig\(/);
});

test("meeting rules keep at least one applicable product level", () => {
  assert.match(html, /每个评审会议至少要适用一个产品等级/);
  assert.match(html, /const PRODUCT_LEVELS = \[/);
});
