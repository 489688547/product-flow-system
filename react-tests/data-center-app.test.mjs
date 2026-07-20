import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDefaultPlatformState } from "../src/domain/strategyExecution.js";
import { canAccessDataCenter, DEFAULT_PERMISSIONS, FEATURE_PERMISSION_ITEMS, NAV_PERMISSION_ITEMS } from "../src/domain/permissions.js";

const root = resolve(new URL("..", import.meta.url).pathname);
const read = path => readFileSync(resolve(root, path), "utf8");

test("data center remains registered alongside every independently delivered business app", () => {
  const registry = createDefaultPlatformState().appRegistry;
  assert.deepEqual(registry.map(app => app.id), ["product-flow", "supply-chain", "data-center", "ecommerce-operations", "performance-management", "brand-content"]);
  const dataCenter = registry.find(app => app.id === "data-center");
  assert.equal(dataCenter.route, "data-center");
  assert.equal(dataCenter.status, "connected");
});

test("data center has navigation and feature permission defaults", () => {
  assert.ok(NAV_PERMISSION_ITEMS.some(item => item.key === "data-center"));
  assert.ok(FEATURE_PERMISSION_ITEMS.some(item => item.key === "dataCenter"));
  assert.deepEqual(DEFAULT_PERMISSIONS.features.dataCenter.editDepartments, ["总经办", "运营部"]);
  assert.equal(canAccessDataCenter({ department: "运营部" }), true);
  assert.equal(canAccessDataCenter({ department: "财务部" }), true);
  assert.equal(canAccessDataCenter({ department: "品牌部" }), false);
});

test("data center navigation sits after product lifecycle with nine routes", () => {
  const app = read("src/App.jsx");
  assert.match(app, /const DATA_CENTER_NAV = \[[\s\S]*data-overview[\s\S]*data-analysis[\s\S]*data-sources[\s\S]*data-connections[\s\S]*data-metrics[\s\S]*data-quality[\s\S]*data-sync[\s\S]*data-services[\s\S]*data-settings/);
  assert.match(app, /\["archive", "产品档案"[\s\S]*\.\.\.DATA_CENTER_NAV[\s\S]*\["handbook", "说明书"/);
  assert.match(app, /screen === "data-center" \? "data-overview"/);
  assert.match(app, /DATA_CENTER_SCREEN_TO_SECTION\.has\(screen\) \? "data-center"/);
  assert.match(app, /<DataCenterAppPage section=\{dataSection\}/);
  assert.match(app, /window\.scrollTo\(\{ top: 0, behavior: "auto" \}\)/);
  assert.match(app, /document\.body\.scrollTo\(\{ top: 0, behavior: "auto" \}\)/);
});

test("main mounts data center provider inside product state with access gating", () => {
  const main = read("src/main.jsx");
  assert.match(main, /DataCenterProvider/);
  assert.match(main, /canAccessDataCenter/);
  assert.match(main, /<ProductFlowProvider>[\s\S]*<DataCenterProvider enabled=\{hasDataCenterAccess\}>[\s\S]*<SupplyChainProvider/);
});

test("overview and analysis expose the operating time basis and drilldowns", () => {
  const page = read("src/features/data-center/DataCenterAppPage.jsx");
  const overview = read("src/features/data-center/DataOverview.jsx");
  const analysis = read("src/features/data-center/DataAnalysis.jsx");
  assert.match(page, /summarizeDataCenterSales/);
  assert.match(page, /buildDataQualitySummary/);
  assert.match(page, /overview: <DataOverview/);
  assert.match(page, /analysis: <DataAnalysis/);
  assert.match(overview, /净销售额/);
  assert.match(overview, /订单创建时间/);
  assert.match(overview, /截止昨天/);
  assert.match(overview, /退款率/);
  assert.match(overview, /毛利率/);
  assert.match(overview, /平台贡献/);
  assert.match(overview, /数据健康/);
  assert.match(analysis, /按日趋势/);
  assert.match(analysis, /平台筛选/);
  assert.match(analysis, /商品筛选/);
  assert.match(analysis, /DataTable/);
});

test("governance workspaces cover safe sources metrics quality sync services and settings", () => {
  const page = read("src/features/data-center/DataCenterAppPage.jsx");
  const workspaces = read("src/features/data-center/DataGovernanceWorkspaces.jsx");
  assert.match(page, /DataSourcesWorkspace/);
  assert.match(page, /MetricDefinitionsWorkspace/);
  assert.match(page, /DataQualityWorkspace/);
  assert.match(page, /SyncRunsWorkspace/);
  assert.match(page, /DataServicesWorkspace/);
  assert.match(page, /DataCenterSettingsWorkspace/);
  assert.match(workspaces, /不保存账号密码、Cookie、验证码或 Token/);
  assert.doesNotMatch(workspaces, /type="password"/);
  assert.match(workspaces, /抖音店铺/);
  assert.match(workspaces, /快手店铺/);
  assert.match(workspaces, /天猫店铺/);
  assert.match(workspaces, /快麦 ERP/);
  assert.match(workspaces, /巨量引擎/);
  assert.match(workspaces, /待验证/);
  assert.match(workspaces, /订单创建时间/);
  assert.match(workspaces, /Asia\/Shanghai/);
  assert.match(workspaces, /应用订阅/);
  assert.match(workspaces, /原始数据保留天数/);
});

test("data center has restrained responsive layouts and visible focus states", () => {
  const styles = read("src/styles.css");
  assert.match(styles, /\.data-basis-strip/);
  assert.match(styles, /\.data-workspace \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /\.data-workspace > \* \{ min-width: 0; \}/);
  assert.match(styles, /\.data-kpi-grid/);
  assert.match(styles, /\.data-overview-grid/);
  assert.match(styles, /\.data-source-grid/);
  assert.match(styles, /\.data-settings-workspace/);
  assert.match(styles, /\.data-center-page[\s\S]*:focus-visible/);
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*\.data-overview-grid/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.data-range-controls/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.data-mini-trend/);
});
