import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("company shell exposes strategy execution as first-class workspaces", () => {
  const app = read("src/App.jsx");
  assert.match(app, /公司首页/);
  assert.match(app, /战略中心/);
  assert.match(app, /重点项目/);
  assert.match(app, /经营检查/);
  assert.match(app, /业务 Apps/);
  assert.match(app, /产品全周期/);
});

test("executive cockpit prioritizes decisions and deviations", () => {
  const page = read("src/features/company/CompanyHomePage.jsx");
  assert.match(page, /待决策事项/);
  assert.match(page, /重大异常与风险/);
  assert.match(page, /战略执行地图/);
  assert.match(page, /重点项目组合/);
  assert.match(page, /三分钟/);
});

test("executive home defaults to the personal todo workbench", () => {
  const home = read("src/features/company/CompanyHomePage.jsx");
  const workbench = read("src/features/company/PersonalTodoWorkbench.jsx");
  assert.match(home, /useState\("todos"\)/);
  assert.match(home, /我的待办/);
  assert.match(home, /公司驾驶舱/);
  assert.match(home, /PersonalTodoWorkbench/);
  assert.match(workbench, /已逾期/);
  assert.match(workbench, /今日截止/);
  assert.match(workbench, /未来 7 天/);
  assert.match(workbench, /刷新钉钉状态/);
  assert.match(workbench, /setPersonalTodoDone/);
  assert.match(workbench, /syncPersonalTodo/);
});

test("personal todo workbench exposes filters sync failures and confirmation states", () => {
  const workbench = read("src/features/company/PersonalTodoWorkbench.jsx");
  assert.match(workbench, /来源类型/);
  assert.match(workbench, /关联项目/);
  assert.match(workbench, /同步失败/);
  assert.match(workbench, /重新同步/);
  assert.match(workbench, /待平台确认结论/);
  assert.match(workbench, /待平台确认关闭/);
});

test("local real-data panel is explicitly read-only and development-only", () => {
  const preview = read("src/features/company/DwsTodoPreview.jsx");
  assert.match(preview, /import\.meta\.env\.DEV/);
  assert.match(preview, /线上钉钉待办（只读测试）/);
  assert.match(preview, /\/api\/dev\/dws\/todos/);
  assert.match(preview, /不会导入平台，也不会修改钉钉/);
  assert.doesNotMatch(preview, /method:\s*["']POST/);
});

test("strategy center governs company results and department commitments", () => {
  const page = read("src/features/strategy/StrategyCenterPage.jsx");
  const strategyModal = read("src/features/strategy/StrategyEditorModal.jsx");
  const resultModal = read("src/features/strategy/RequiredResultModal.jsx");
  const commitmentModal = read("src/features/strategy/DepartmentCommitmentModal.jsx");
  assert.match(page, /公司战略/);
  assert.match(page, /必达结果/);
  assert.match(page, /部门承诺/);
  assert.match(resultModal, /验收标准/);
  assert.match(commitmentModal, /月度里程碑/);
  assert.match(page, /总经办审核/);
  assert.match(page, /老板确认/);
  assert.match(page, /新建公司战略/);
  assert.match(page, /StrategyEditorModal/);
  assert.match(page, /saveStrategy/);
  assert.match(page, /archiveStrategy/);
  assert.match(page, /archiveRequiredResult/);
  assert.match(page, /archiveDepartmentCommitment/);
  assert.match(page, /ConfirmDialog/);
  assert.doesNotMatch(page, /attainment-rule/);
  assert.doesNotMatch(page, /达成规则：全部必达结果核验通过/);
  assert.match(strategyModal, /战略意图/);
});

test("key project workspace manages milestones risks and decisions", () => {
  const page = read("src/features/projects/KeyProjectsPage.jsx");
  const detail = read("src/features/projects/ProjectDetailModal.jsx");
  assert.match(page, /重点项目/);
  assert.match(detail, /关键里程碑/);
  assert.match(detail, /风险与阻塞/);
  assert.match(detail, /待决策/);
  assert.match(page, /archiveProject/);
  assert.match(detail, /archiveProjectChild/);
  assert.match(detail, /编辑里程碑/);
  assert.match(detail, /归档风险/);
});

test("operating reviews retain weekly updates and monthly snapshots", () => {
  const page = read("src/features/reviews/OperatingReviewPage.jsx");
  const modal = read("src/features/reviews/StatusUpdateModal.jsx");
  assert.match(page, /月度经营检查/);
  assert.match(page, /历史快照/);
  assert.match(modal, /本周关键变化/);
  assert.match(modal, /当前最大风险/);
  assert.match(modal, /需要协调或决策/);
  assert.match(page, /archiveMonthlyReport/);
  assert.match(page, /archiveStatusUpdate/);
  assert.match(page, /saveStatusUpdate/);
  assert.match(page, /ConfirmDialog/);
});

test("business App center keeps Product Lifecycle as the first connected App", () => {
  const page = read("src/features/platform/AppCenterPage.jsx");
  assert.match(page, /产品全周期/);
  assert.match(page, /数据新鲜度/);
  assert.match(page, /打开 App/);
});

test("the static shell and DingTalk login use the company platform brand", () => {
  const html = read("index.html");
  const login = read("src/features/auth/LoginPage.jsx");

  assert.match(html, /<title>公司战略执行平台<\/title>/);
  assert.match(html, /正在打开经营执行平台/);
  assert.match(login, /经营执行平台/);
  assert.match(login, /战略与业务协同/);
});

test("operating review visualizes immutable month-to-month health history", () => {
  const page = read("src/features/reviews/OperatingReviewPage.jsx");
  const chart = read("src/features/company/StrategyTrendChart.jsx");
  assert.match(page, /StrategyTrendChart/);
  assert.match(chart, /buildMonthlyTrend/);
  assert.match(chart, /offTrack/);
  assert.match(chart, /atRisk/);
});
