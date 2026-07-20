import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInsightSuggestion,
  buildRuleSuggestions,
  comparableMetricSummary,
  confirmCategoryMapping,
  copyInsightRuleSet,
  createDefaultUserInsightsState,
  discoverCompetitorCandidates,
  normalizeMarketSnapshot,
  transitionCompetitorCandidate
} from "../src/domain/userInsights.js";

test("user insights defaults are advisory and keep platforms separate", () => {
  const state = createDefaultUserInsightsState();
  assert.equal(state.advisoryOnly, true);
  assert.equal(state.viewType, "shop");
  assert.equal(state.activeTab, "audience");
  assert.deepEqual(state.platforms, []);
});

test("category collection requires an explicit human confirmation", () => {
  const suggested = {
    id: "mapping-1",
    platform: "抖音",
    categoryId: "cat-100",
    categoryName: "宠物用品 / 仓鼠用品",
    status: "suggested",
    recommendationReason: "店铺主营商品与类目关键词匹配"
  };
  const confirmed = confirmCategoryMapping(suggested, {
    name: "产品负责人",
    department: "产品部",
    now: "2026-07-20T08:00:00.000Z"
  });
  assert.equal(confirmed.status, "confirmed");
  assert.equal(confirmed.confirmedBy, "产品负责人");
  assert.equal(confirmed.confirmedDepartment, "产品部");
  assert.equal(confirmed.confirmedAt, "2026-07-20T08:00:00.000Z");
  assert.equal(confirmed.version, 1);
});

test("copying another app rule creates an independent draft version", () => {
  const source = {
    id: "rule-product-1",
    consumerAppId: "product-flow",
    ownerDepartment: "产品部",
    platform: "抖音",
    name: "产品机会规则",
    status: "published",
    version: 4,
    competitorConditions: [{ field: "salesRank", operator: "lte", value: 20 }]
  };
  const copied = copyInsightRuleSet(source, {
    id: "rule-ops-1",
    consumerAppId: "ecommerce-operations",
    ownerDepartment: "运营部",
    actor: "运营主管",
    now: "2026-07-20T08:05:00.000Z"
  });
  assert.notEqual(copied, source);
  assert.equal(copied.id, "rule-ops-1");
  assert.equal(copied.sourceRuleId, source.id);
  assert.equal(copied.sourceRuleVersion, 4);
  assert.equal(copied.consumerAppId, "ecommerce-operations");
  assert.equal(copied.ownerDepartment, "运营部");
  assert.equal(copied.status, "draft");
  assert.equal(copied.version, 1);
  assert.equal(source.consumerAppId, "product-flow");
});

test("a discovered competitor remains a candidate until a person confirms it", () => {
  const candidate = {
    id: "competitor-1",
    status: "candidate",
    platform: "抖音",
    evidenceRefs: ["entity-1"],
    matchedRules: ["近30日销量前20"]
  };
  const confirmed = transitionCompetitorCandidate(candidate, "core", {
    actor: "运营主管",
    department: "运营部",
    reason: "与当前主卖款价格带和用户一致",
    now: "2026-07-20T08:10:00.000Z"
  });
  assert.equal(candidate.status, "candidate");
  assert.equal(confirmed.status, "core");
  assert.equal(confirmed.confirmedBy, "运营主管");
  assert.equal(confirmed.confirmationReason, "与当前主卖款价格带和用户一致");
  assert.throws(() => transitionCompetitorCandidate(candidate, "core", { actor: "运营主管" }), /确认原因/);
});

test("cross-platform summaries aggregate only explicitly comparable metrics", () => {
  const summary = comparableMetricSummary([
    { platform: "抖音", metrics: { productCount: 10, medianPrice: 20, liveHeat: 900 } },
    { platform: "天猫", metrics: { productCount: 30, medianPrice: 40, searchPopularity: 800 } }
  ], ["productCount", "medianPrice"]);
  assert.deepEqual(summary.productCount, { total: 40, byPlatform: { 抖音: 10, 天猫: 30 } });
  assert.deepEqual(summary.medianPrice, { byPlatform: { 抖音: 20, 天猫: 40 } });
  assert.equal(summary.liveHeat, undefined);
  assert.equal(summary.searchPopularity, undefined);
});

test("partial or stale evidence lowers confidence and keeps advice conditional", () => {
  const suggestion = buildInsightSuggestion({
    category: "product",
    title: "关注年轻用户的便携需求",
    conclusion: "可以扩大便携卖点测试",
    evidenceRefs: ["snapshot-1"],
    ruleSetId: "rule-1",
    ruleVersion: 2,
    coverage: 0.55,
    freshness: "stale",
    requestedConfidence: "high"
  });
  assert.equal(suggestion.advisoryOnly, true);
  assert.equal(suggestion.confidence, "low");
  assert.match(suggestion.conclusion, /^在当前数据覆盖范围内，/);
  assert.match(suggestion.limitations.join(" "), /覆盖率|过期/);
});

test("normalizing a saved suggestion preserves its explicit confidence", () => {
  const saved = buildInsightSuggestion({
    id: "suggestion-saved",
    title: "保持谨慎",
    conclusion: "继续观察",
    coverage: 1,
    freshness: "fresh",
    confidence: "low"
  });
  assert.equal(saved.confidence, "low");
});

test("market snapshots strip browser secrets and preserve missing values", () => {
  const snapshot = normalizeMarketSnapshot({
    id: "snapshot-1",
    platform: "抖音",
    dimension: "video",
    capturedAt: "2026-07-20T07:30:00.000Z",
    coverage: 0.8,
    metrics: { videoCount: 20, conversionRate: null },
    cookie: "sid=secret",
    requestHeaders: { authorization: "Bearer secret", accept: "application/json" },
    rawHtml: "<html>secret</html>"
  });
  assert.equal(snapshot.cookie, undefined);
  assert.equal(snapshot.rawHtml, undefined);
  assert.deepEqual(snapshot.requestHeaders, { accept: "application/json" });
  assert.equal(snapshot.metrics.conversionRate, null);
  assert.equal(snapshot.qualityStatus, "partial");
});

test("published app rules discover candidates without promoting them", () => {
  const candidates = discoverCompetitorCandidates({
    entities: [
      { id: "entity-a", platform: "抖音", categoryId: "cat-1", dimension: "product", name: "竞品 A", metrics: { salesVolume: 1200, price: 29.9 } },
      { id: "entity-b", platform: "抖音", categoryId: "cat-1", dimension: "product", name: "竞品 B", metrics: { salesVolume: 80, price: 69 } }
    ],
    ruleSets: [{
      id: "rule-1", name: "同价格带高销量", status: "published", version: 2,
      platform: "抖音", categoryId: "cat-1", consumerAppId: "ecommerce-operations", ownerDepartment: "运营部",
      competitorConditions: [
        { field: "salesVolume", operator: "gte", value: 1000 },
        { field: "price", operator: "between", value: [20, 40] }
      ]
    }],
    existing: []
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].name, "竞品 A");
  assert.equal(candidates[0].status, "candidate");
  assert.equal(candidates[0].ruleVersion, 2);
  assert.deepEqual(candidates[0].evidenceRefs, ["entity-a"]);
});

test("rule suggestion templates inherit snapshot coverage and advisory limits", () => {
  const suggestions = buildRuleSuggestions({
    snapshots: [{ id: "snapshot-1", platform: "抖音", categoryId: "cat-1", dimension: "audience", coverage: 0.6, qualityStatus: "partial", capturedAt: "2026-07-20T07:30:00.000Z" }],
    ruleSets: [{
      id: "rule-1", status: "published", version: 3, platform: "抖音", categoryId: "cat-1",
      suggestionTemplates: [{ id: "young-portable", category: "product", title: "便携需求测试", conclusion: "可以验证便携卖点", dimension: "audience" }]
    }]
  });
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].confidence, "low");
  assert.equal(suggestions[0].advisoryOnly, true);
  assert.match(suggestions[0].conclusion, /^在当前数据覆盖范围内，/);
});
