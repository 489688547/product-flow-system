import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("local helper persists standard user insight data and exposes preview routes", () => {
  assert.match(server, /LOCAL_USER_INSIGHTS_PATH/);
  assert.match(server, /normalizeUserInsightsState/);
  assert.match(server, /readLocalUserInsights/);
  assert.match(server, /writeLocalUserInsights/);
  assert.match(server, /handleLocalUserInsights/);
  assert.match(server, /\/api\/platform\/v1\/user-insights/);
  assert.match(server, /category-mappings/);
  assert.match(server, /competitors/);
  assert.match(server, /rules/);
});

test("local user insight storage has no credential or browser session fields", () => {
  assert.doesNotMatch(server, /LOCAL_USER_INSIGHTS_(?:COOKIE|PASSWORD|TOKEN|SESSION)/);
  assert.match(server, /不保存浏览器凭证/);
});
