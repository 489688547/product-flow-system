import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("company shell exposes the three governed execution workspaces", () => {
  const app = read("src/App.jsx");
  assert.match(app, /部门激励/);
  assert.match(app, /IncentiveProjectsPage/);
  assert.match(app, /incentives/);
  const permissions = read("src/domain/permissions.js");
  assert.match(permissions, /key: "incentives"/);
});

test("strategy center separates company attainment from department commitments", () => {
  const strategy = read("src/features/strategy/StrategyCenterPage.jsx");
  assert.match(strategy, /公司战略/);
  assert.match(strategy, /部门承诺/);
  assert.match(strategy, /strategyAttainment/);
  assert.match(strategy, /saveRequiredResult/);
  assert.match(strategy, /transitionCommitment/);
  assert.doesNotMatch(strategy, /attainment-rule/);
  assert.match(strategy, /aria-expanded=\{expandedResultId === result\.id\}/);
  assert.match(strategy, /role="progressbar"/);
  assert.match(strategy, /commitmentProgress/);
  assert.match(strategy, /saveCommitmentMilestone/);
  assert.match(strategy, /添加部门任务/);
});

test("incentive workspace enforces budget visibility and recorded settlement", () => {
  const incentives = read("src/features/incentives/IncentiveProjectsPage.jsx");
  assert.match(incentives, /incentiveBudgetCheck/);
  assert.match(incentives, /奖金上限/);
  assert.match(incentives, /结项定奖/);
  assert.match(incentives, /settleIncentive/);
  assert.match(incentives, /archiveIncentiveProject/);
  assert.match(incentives, /取消项目/);
  assert.match(incentives, /ConfirmDialog/);
});

test("operating review collects manual department reports with freeze workflow", () => {
  const reviews = read("src/features/reviews/OperatingReviewPage.jsx");
  assert.match(reviews, /部门月报/);
  assert.match(reviews, /重点成果/);
  assert.match(reviews, /下月重点/);
  assert.match(reviews, /transitionReport/);
  assert.match(reviews, /appendReportCorrection/);
  assert.match(reviews, /冻结/);
});

test("personal todos route governed responsibilities to their workspaces", () => {
  const workbench = read("src/features/company/PersonalTodoWorkbench.jsx");
  assert.match(workbench, /commitment_milestone/);
  assert.match(workbench, /incentive_project/);
  assert.match(workbench, /monthly_report/);
  assert.match(workbench, /reward_payout/);
});

test("boss action desk leads governed execution and retains the three operating modules", () => {
  const home = read("src/features/company/CompanyHomePage.jsx");
  assert.match(home, /strategyAttainment/);
  assert.match(home, /三大战略达成/);
  assert.match(home, /ExecutiveActionDesk/);
  assert.match(home, /激励项目/);
  assert.match(home, /部门月报进度/);
});
