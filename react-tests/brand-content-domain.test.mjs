import test from "node:test";
import assert from "node:assert/strict";
import {
  BRAND_PRODUCTION_STATUSES,
  buildBrandTeamMetrics,
  createDefaultBrandContentState,
  deriveContentDataStatus,
  findBrandContentIssues,
  normalizeBrandContentState,
  reduceBrandContentState,
  summarizeBrandOverview,
  transitionBrandContent
} from "../src/domain/brandContent.js";

const NOW = new Date("2026-07-18T12:00:00+08:00");

test("default brand state keeps content, assets, publications, snapshots and decisions separate", () => {
  const state = createDefaultBrandContentState();
  assert.ok(state.contents.length >= 6);
  assert.ok(state.assetVersions.length >= 3);
  assert.ok(state.publications.length >= 4);
  assert.ok(state.performanceSnapshots.length >= 4);
  assert.ok(state.decisions.length >= 2);
  assert.equal(state.settings.learningDays.douyin, 3);
  assert.equal(state.settings.effectiveSpend.douyin, 50);
});

test("published content stays in learning for three complete days", () => {
  const state = createDefaultBrandContentState();
  const item = state.contents.find(content => content.id === "BC-260717-001");
  const status = deriveContentDataStatus(item, state.publications, state.performanceSnapshots, state.settings, NOW);
  assert.equal(status.code, "learning");
  assert.equal(status.ownerRole, "operator");
  assert.match(status.label, /学习中/);
});

test("mature low-spend content is untested instead of content weak", () => {
  const state = createDefaultBrandContentState();
  const item = state.contents.find(content => content.id === "BC-260708-002");
  const status = deriveContentDataStatus(item, state.publications, state.performanceSnapshots, state.settings, NOW);
  assert.equal(status.code, "untested");
  assert.equal(status.ownerRole, "operator");
  assert.match(status.reason, /投放分配/);
});

test("unreconciled snapshots block a content verdict", () => {
  const state = createDefaultBrandContentState();
  const item = state.contents.find(content => content.id === "BC-260706-001");
  const snapshots = state.performanceSnapshots.map(snapshot => snapshot.contentId === item.id
    ? { ...snapshot, reconciliationStatus: "mismatch", coverageRate: 0.82 }
    : snapshot);
  const status = deriveContentDataStatus(item, state.publications, snapshots, state.settings, NOW);
  assert.equal(status.code, "inconsistent");
  assert.equal(status.canJudgeContent, false);
});

test("duplicate material ids block attribution and create a data issue", () => {
  const state = createDefaultBrandContentState();
  const source = state.publications.find(publication => publication.materialIds?.length);
  const issues = findBrandContentIssues({
    ...state,
    publications: [...state.publications, { ...source, id: "pub-copy", contentId: "BC-260708-002" }]
  }, NOW);
  assert.ok(issues.some(issue => issue.type === "duplicate_material_id"));
});

test("content transitions follow the production sequence and retain an audit entry", () => {
  const state = createDefaultBrandContentState();
  const item = state.contents.find(content => content.productionStatus === "brief");
  const next = transitionBrandContent(state, item.id, "scripting", "陈悦桐", NOW);
  assert.equal(next.contents.find(content => content.id === item.id).productionStatus, "scripting");
  assert.equal(next.auditLogs[0].actor, "陈悦桐");
  assert.throws(() => transitionBrandContent(next, item.id, "published", "陈悦桐", NOW), /不能从/);
  assert.deepEqual(BRAND_PRODUCTION_STATUSES, ["brief", "scripting", "editing", "reviewing", "ready", "published", "archived"]);
});

test("normalization keeps null performance values and repairs malformed collections", () => {
  const state = normalizeBrandContentState({
    contents: "bad",
    performanceSnapshots: [{ id: "s1", contentId: "c1", spend: null, gmv: null }],
    settings: { learningDays: { douyin: 4 } }
  });
  assert.ok(Array.isArray(state.contents));
  assert.equal(state.performanceSnapshots[0].spend, null);
  assert.equal(state.performanceSnapshots[0].gmv, null);
  assert.equal(state.settings.learningDays.douyin, 4);
  assert.equal(state.settings.effectiveSpend.douyin, 50);
});

test("overview reports operational breaks and paid contribution without mixing organic growth", () => {
  const state = createDefaultBrandContentState();
  const summary = summarizeBrandOverview(state, NOW);
  assert.ok(summary.focus.missingId >= 1);
  assert.ok(summary.focus.learning >= 1);
  assert.ok(summary.focus.untested >= 1);
  assert.ok(summary.paid.spend > 0);
  assert.ok(summary.organic.views > 0);
  assert.equal("roi" in summary.organic, false);
});

test("team metrics count only primary owners and mark insufficient mature samples", () => {
  const state = createDefaultBrandContentState();
  const metrics = buildBrandTeamMetrics(state, NOW);
  const directorTotal = metrics.directors.reduce((total, row) => total + row.delivered, 0);
  assert.equal(directorTotal, state.contents.length);
  assert.ok(metrics.directors.some(row => row.rankStatus === "insufficient"));
  assert.ok(metrics.editors.every(row => !("score" in row)));
});

test("confirming a decision creates the requested number of traceable content records", () => {
  const state = createDefaultBrandContentState();
  const decision = state.decisions[0];
  const next = reduceBrandContentState(state, {
    type: "confirm_decision",
    id: decision.id,
    input: {
      quantity: 2,
      contentDirection: "复刻高完播开场",
      targetAccount: "官旗-全域",
      directorId: "u-chenyuetong",
      directorName: "陈悦桐",
      editorId: "u-zhangyulei",
      editorName: "张煜雷",
      operatorId: "u-ops",
      operatorName: "运营组",
      dueAt: "2026-07-22",
      reviewAt: "2026-07-26"
    },
    actor: "品牌负责人",
    now: NOW.toISOString()
  });
  const created = next.contents.filter(content => content.decisionId === decision.id);
  assert.equal(created.length, 2);
  assert.ok(created.every(content => content.sourceContentId === decision.sourceContentId));
  assert.equal(next.decisions.find(item => item.id === decision.id).status, "confirmed");
});
