import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  categoryMappingsApiUrl,
  competitorsApiUrl,
  loadUserInsights,
  rulesApiUrl,
  userInsightsApiUrl
} from "../src/state/userInsightsApi.js";

test("user insights API URLs are stable and scope encoded", () => {
  assert.equal(userInsightsApiUrl({ viewType: "product", platform: "抖音", productId: "p-1", categoryId: "cat-1", from: "2026-07-01", to: "2026-07-19" }),
    "/api/platform/v1/user-insights?viewType=product&platform=%E6%8A%96%E9%9F%B3&productId=p-1&categoryId=cat-1&from=2026-07-01&to=2026-07-19");
  assert.equal(categoryMappingsApiUrl(), "/api/platform/v1/user-insights/category-mappings");
  assert.equal(rulesApiUrl(), "/api/platform/v1/user-insights/rules");
  assert.equal(competitorsApiUrl(), "/api/platform/v1/user-insights/competitors");
});

test("insight loader preserves advisory quality metadata", async () => {
  const payload = await loadUserInsights({ platform: "天猫" }, async url => {
    assert.match(url, /platform=%E5%A4%A9%E7%8C%AB/);
    return new Response(JSON.stringify({
      synced: true,
      advisoryOnly: true,
      scope: { platform: "天猫" },
      data: { snapshots: [{ id: "s1", qualityStatus: "partial", coverage: 0.5 }], suggestions: [] }
    }), { status: 200 });
  });
  assert.equal(payload.advisoryOnly, true);
  assert.equal(payload.data.snapshots[0].qualityStatus, "partial");
  assert.equal(payload.data.snapshots[0].coverage, 0.5);
});

test("provider keeps store and product scopes separate and exposes commands", () => {
  const source = fs.readFileSync(new URL("../src/state/UserInsightsProvider.jsx", import.meta.url), "utf8");
  assert.match(source, /shopScope/);
  assert.match(source, /productScope/);
  assert.match(source, /saveCategoryMapping/);
  assert.match(source, /saveInsightRule/);
  assert.match(source, /saveCompetitor/);
  assert.match(source, /requestInsightRetry/);
  assert.doesNotMatch(source, /localStorage\.setItem/);
});
