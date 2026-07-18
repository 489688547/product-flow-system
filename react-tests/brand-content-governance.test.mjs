import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("decision confirmation includes quantity direction account owners and review date", () => {
  const modal = read("src/features/brand-content/DecisionConfirmModal.jsx");
  for (const text of ["数量", "内容方向", "目标账户", "主编导", "主剪辑", "运营", "截止时间", "复盘日期"]) {
    assert.match(modal, new RegExp(text));
  }
  assert.match(modal, /confirm_decision/);
  assert.match(modal, /disabledReason=/);
});

test("team page separates roles and refuses a mixed score", () => {
  const page = read("src/features/brand-content/BrandTeamPage.jsx");
  assert.match(page, /编导/);
  assert.match(page, /剪辑/);
  assert.match(page, /运营/);
  assert.match(page, /暂不排名/);
  assert.doesNotMatch(page, /综合得分/);
});

test("data issues expose severity ownership scope and recovery action", () => {
  const page = read("src/features/brand-content/BrandDataIssuesPage.jsx");
  assert.match(page, /严重度/);
  assert.match(page, /责任角色/);
  assert.match(page, /影响范围/);
  assert.match(page, /恢复动作/);
  assert.match(page, /findBrandContentIssues/);
});

test("brand settings contain thresholds and connection states but no credentials", () => {
  const page = read("src/features/brand-content/BrandContentSettingsPage.jsx");
  assert.match(page, /学习期/);
  assert.match(page, /有效测试阈值/);
  assert.match(page, /NAS/);
  assert.match(page, /数据中心/);
  assert.match(page, /update_settings/);
  assert.doesNotMatch(page, /type="password"|Cookie|验证码|保存密码/);
});

test("governance pages replace every remaining placeholder route", () => {
  const app = read("src/App.jsx");
  assert.match(app, /"content-decisions": <BrandDecisionPage/);
  assert.match(app, /"content-team": <BrandTeamPage/);
  assert.match(app, /"content-issues": <BrandDataIssuesPage/);
  assert.match(app, /"content-settings": <BrandContentSettingsPage/);
  assert.doesNotMatch(app, /BrandContentPlaceholderPage/);
});
