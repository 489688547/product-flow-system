import assert from "node:assert/strict";
import test from "node:test";
import registry from "../docs/platform/integration-registry.json" with { type: "json" };
import {
  countIntegrationStatuses,
  filterIntegrations,
  isIntegrationProfileStale,
  mergeIntegrationProfiles,
  resolveIntegrationRelations
} from "../src/domain/integrations.js";

test("public registry merges with private profiles by platform id", () => {
  const merged = mergeIntegrationProfiles(registry, [{
    platformId: "dingtalk",
    owner: "平台管理员",
    consoleUrl: "https://open-dev.dingtalk.com/"
  }]);

  const dingtalk = merged.find(platform => platform.id === "dingtalk");
  const kuaimai = merged.find(platform => platform.id === "kuaimai");
  assert.equal(dingtalk.internal.owner, "平台管理员");
  assert.equal(kuaimai.internal, null);
});

test("integration search covers names, capabilities, questions, and keywords", () => {
  const platforms = mergeIntegrationProfiles(registry, []);
  assert.deepEqual(filterIntegrations(platforms, { query: "免登" }).map(item => item.id), ["dingtalk"]);
  assert.ok(filterIntegrations(platforms, { query: "商品数据" }).some(item => item.id === "taobao-open-platform"));
  assert.ok(filterIntegrations(platforms, { query: "数据只在本地可见" }).some(item => item.id === "cloudflare-d1"));
});

test("integration filters and counts use lifecycle status", () => {
  const platforms = mergeIntegrationProfiles(registry, []);
  const planned = filterIntegrations(platforms, { status: "planned" });
  const counts = countIntegrationStatuses(platforms);

  assert.equal(planned.length, 7);
  assert.ok(platforms.some(item => item.id === "browser-market-collector" && item.status === "connected"));
  assert.ok(platforms.some(item => item.id === "douyin-ecommerce" && item.status === "integrating"));
  assert.deepEqual(counts, { all: 17, connected: 6, integrating: 4, planned: 7, retired: 0 });
});

test("relations resolve to public platform records", () => {
  const platforms = mergeIntegrationProfiles(registry, []);
  const kuaimai = platforms.find(platform => platform.id === "kuaimai");
  const relations = resolveIntegrationRelations(platforms, kuaimai);

  assert.ok(relations.some(relation => relation.platform.id === "cloudflare-d1"));
  assert.ok(relations.every(relation => relation.description));
});

test("profile verification becomes stale after 180 days", () => {
  const now = new Date("2026-07-17T00:00:00Z");
  assert.equal(isIntegrationProfileStale({ verifiedAt: "2026-01-18" }, { now }), false);
  assert.equal(isIntegrationProfileStale({ verifiedAt: "2026-01-17" }, { now }), true);
  assert.equal(isIntegrationProfileStale({}, { now }), true);
});
