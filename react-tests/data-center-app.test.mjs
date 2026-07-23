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
  assert.deepEqual(DEFAULT_PERMISSIONS.features.dataCenter.editDepartments, ["总经办", "运营部", "财务部", "供应链部", "供应链", "供应链团队", "采购部"]);
  assert.equal(canAccessDataCenter({ department: "运营部" }), true);
  assert.equal(canAccessDataCenter({ department: "财务部" }), true);
  assert.equal(canAccessDataCenter({ department: "品牌部" }), false);
});

test("data center navigation keeps all governed workspaces", () => {
  const app = read("src/App.jsx");
  const navBlock = app.match(/const DATA_CENTER_NAV = \[([\s\S]*?)\];/)?.[1] || "";
  assert.match(navBlock, /data-overview[\s\S]*data-insights[\s\S]*data-products[\s\S]*data-sources[\s\S]*data-metrics[\s\S]*data-sync[\s\S]*data-services[\s\S]*data-settings/);
  assert.doesNotMatch(navBlock, /data-analysis/);
  assert.doesNotMatch(navBlock, /data-quality/);
  assert.doesNotMatch(navBlock, /data-connections/);
  assert.match(app, /\["data-metrics", "数据口径"/);
  assert.match(app, /\["data-sync", "数据同步"/);
  assert.match(app, /if \(screen === "data-quality"\) return "data-sync";/);
  assert.match(app, /\["archive", "产品档案"[\s\S]*\.\.\.DATA_CENTER_NAV[\s\S]*\["handbook", "说明书"/);
  assert.match(app, /screen === "data-center" \? "data-overview"/);
  assert.match(app, /DATA_CENTER_SCREEN_TO_SECTION\.has\(screen\) \? "data-center"/);
  assert.match(app, /<DataCenterAppPage section=\{dataSection\} dataAccessCategory=/);
  assert.match(app, /window\.scrollTo\(\{ top: 0, behavior: "auto" \}\)/);
  assert.match(app, /document\.body\.scrollTo\(\{ top: 0, behavior: "auto" \}\)/);
});

test("main mounts data center provider inside product state with access gating", () => {
  const main = read("src/main.jsx");
  assert.match(main, /DataCenterProvider/);
  assert.match(main, /canAccessDataCenter/);
  assert.match(main, /<ProductFlowProvider>[\s\S]*<DataCenterProvider enabled=\{hasDataCenterAccess\}>[\s\S]*<SupplyChainProvider/);
});

test("overview exposes governed metrics without restoring the deleted analysis workspace", () => {
  const page = read("src/features/data-center/DataCenterAppPage.jsx");
  const overview = read("src/features/data-center/DataOverview.jsx");
  const domain = read("src/domain/dataCenter.js");
  assert.doesNotMatch(page, /summarizeDataCenterSales/);
  assert.match(page, /useDataStandards/);
  assert.match(page, /buildDataQualitySummary/);
  assert.match(page, /overview: <DataOverview/);
  assert.doesNotMatch(page, /DataAnalysis/);
  assert.doesNotMatch(page, /analysis: <DataAnalysis/);
  assert.match(domain, /净销售额/);
  assert.match(overview, /订单创建时间/);
  assert.match(domain, /退款率/);
  assert.match(domain, /毛利率/);
  assert.match(overview, /平台分布/);
  assert.doesNotMatch(overview, /数据健康/);
  assert.match(overview, /DateRangePickerField/);
  assert.match(overview, /环比/);
  assert.match(page, /scheduleComparisonResults/);
});

test("governance workspaces merge quality into sync and use the focused AI model workspace", () => {
  const page = read("src/features/data-center/DataCenterAppPage.jsx");
  const workspaces = read("src/features/data-center/DataGovernanceWorkspaces.jsx");
  assert.match(page, /sync: \["数据同步"/);
  const standards = read("src/features/data-center/data-standards/DataStandardsWorkspace.jsx");
  assert.match(page, /DataSourcesWorkspace/);
  assert.match(page, /DataStandardsWorkspace/);
  assert.doesNotMatch(page, /DataQualityWorkspace/);
  assert.doesNotMatch(page, /quality:\s*</);
  assert.match(page, /sync: <SyncRunsWorkspace quality=\{quality\} focusTarget=\{syncFocus\} canTrigger=\{canEdit\} \/>/);
  assert.match(workspaces, /export function SyncRunsWorkspace\(\{ quality, focusTarget = "", canTrigger = false \}\)/);
  assert.match(workspaces, /待处理问题[\s\S]*执行记录[\s\S]*待处理数据问题/);
  assert.match(workspaces, /quality\.latestSalesAnomaly/);
  assert.match(workspaces, /SALES_TARGET_DAY_MISSING/);
  assert.match(workspaces, /销售数据尚未同步/);
  assert.match(workspaces, /系统已自动排队 Chrome 采集任务/);
  assert.match(workspaces, /loadWebCollectionStatus/);
  assert.match(workspaces, /buildDataSyncRunRows/);
  assert.match(workspaces, /webCollection\.runs/);
  assert.match(workspaces, /primaryAction\.label/);
  assert.match(workspaces, /showKuaimaiLogin/);
  assert.match(workspaces, /打开快麦 ERP/);
  assert.match(workspaces, /primaryAction\.type === "retrigger"/);
  assert.match(workspaces, /triggerKuaimaiSalesCollection/);
  assert.match(workspaces, /导入官方销售报表/);
  assert.match(workspaces, /#data-sources\/erp/);
  assert.match(workspaces, /#settings\/sales-data/);
  assert.doesNotMatch(workspaces, /<h2>同步记录<\/h2>/);
  assert.match(workspaces, /collaborationDraftFromDataIssue/);
  assert.match(workspaces, /refresh/);
  assert.match(page, /AiModelWorkspace/);
  assert.match(page, /DataCenterSettingsWorkspace/);
  assert.match(workspaces, /DataConnectionsWorkspace/);
  assert.match(workspaces, /敏感信息加密保存/);
  assert.doesNotMatch(workspaces, /function SourceForm/);
  assert.match(standards, /订单创建时间/);
  assert.match(workspaces, /Asia\/Shanghai/);
  assert.doesNotMatch(page, /DataServicesWorkspace/);
  assert.doesNotMatch(workspaces, /export function DataServicesWorkspace/);
  assert.doesNotMatch(workspaces, /销售数据服务|应用订阅/);
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
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.date-range-picker-field/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.date-range-picker-menu/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.data-mini-trend/);
  assert.match(styles, /\.data-trend-detail/);
  assert.match(styles, /\.data-trend-day:focus/);
  assert.doesNotMatch(styles, /\.data-analysis-toolbar/);
  assert.doesNotMatch(styles, /\.data-analysis-series/);
  assert.match(styles, /\.data-sync-status-bar/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.data-sync-status-bar/);
});
