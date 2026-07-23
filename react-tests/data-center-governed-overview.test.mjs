import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DATA_CENTER_OVERVIEW_METRICS } from "../src/domain/dataCenter.js";

const root = resolve(new URL("..", import.meta.url).pathname);
const read = path => readFileSync(resolve(root, path), "utf8");

test("overview KPI cards use the five governed metric codes without a legacy summary fallback", () => {
  assert.deepEqual(DATA_CENTER_OVERVIEW_METRICS.map(item => item.metricCode), [
    "sales.net_sales",
    "sales.quantity",
    "sales.gross_profit",
    "sales.refund_rate",
    "sales.gross_margin_rate"
  ]);
  const page = read("src/features/data-center/DataCenterAppPage.jsx");
  assert.doesNotMatch(page, /summarizeDataCenterSales/);
  assert.match(page, /useDataStandards/);
  assert.match(page, /scheduleEnsureResults\(range, overviewMetricCodes\)/);
  assert.match(page, /metricResults=\{legacyOverviewRollback \? legacyMetricResults : results\}/);
  assert.match(page, /retryMetricResults/);
});

test("overview applies one confirmed range and schedules the immediately previous equal period", () => {
  const page = read("src/features/data-center/DataCenterAppPage.jsx");
  const overview = read("src/features/data-center/DataOverview.jsx");
  assert.match(overview, /DateRangePickerField/);
  assert.doesNotMatch(overview, /<input type="date"/);
  assert.match(overview, /近 7 天/);
  assert.match(overview, /近 15 天/);
  assert.match(overview, /近 30 天/);
  assert.match(page, /previousDataCenterRange/);
  assert.match(page, /comparisonTargetVersions/);
  assert.match(page, /scheduleComparisonResults\(comparisonRange, overviewMetricCodes, comparisonTargetVersions\)/);
  assert.match(page, /ensureComparisonResults\(comparisonRange, overviewMetricCodes, targetVersions\)/);
  assert.match(page, /comparisonResults=\{comparisonResults\}/);
});

test("governed cards preserve missing values without repeating version metadata", () => {
  const overview = read("src/features/data-center/DataOverview.jsx");
  assert.match(overview, /暂无结果/);
  assert.match(overview, /coverageRate/);
  assert.doesNotMatch(overview, /版本 v/);
  assert.doesNotMatch(overview, /数据截止/);
  assert.match(overview, /正在更新/);
  assert.match(overview, /重新计算/);
  assert.match(overview, /RESULT_NOT_AVAILABLE/);
  assert.match(overview, /DIVISION_BY_ZERO/);
  assert.doesNotMatch(overview, /value \|\| 0/);
  assert.doesNotMatch(overview, /硬编码/);
});

test("governed cards show readable comparison direction without inventing missing values", () => {
  const overview = read("src/features/data-center/DataOverview.jsx");
  assert.match(overview, /compareDataCenterMetric/);
  assert.match(overview, /环比上升/);
  assert.match(overview, /环比下降/);
  assert.match(overview, /环比持平/);
  assert.match(overview, /个百分点/);
  assert.match(overview, /上期为 0/);
  assert.match(overview, /上期暂无正式结果/);
});

test("overview uses concise GMV trend and platform distribution with accessible details", () => {
  const overview = read("src/features/data-center/DataOverview.jsx");
  assert.match(overview, /<h2>经营趋势<\/h2>/);
  assert.match(overview, /<h2>平台分布<\/h2>/);
  assert.doesNotMatch(overview, /销售事实视图/);
  assert.doesNotMatch(overview, /平台贡献/);
  assert.match(overview, /GMV/);
  assert.match(overview, /销售数量/);
  assert.match(overview, /毛利率/);
  assert.match(overview, /platforms/);
  assert.match(overview, /role="tooltip"/);
  assert.match(overview, /tabIndex=\{0\}/);
  assert.doesNotMatch(overview, /数据健康/);
});

test("trend keeps selected empty dates visible and shows hover details outside the plot", () => {
  const overview = read("src/features/data-center/DataOverview.jsx");
  const styles = read("src/styles.css");
  assert.match(overview, /factViews\.trendByDay/);
  assert.match(overview, /暂无销售数据/);
  assert.match(overview, /data-trend-detail/);
  assert.match(styles, /\.data-trend-detail\s*\{[^}]*pointer-events:\s*none/s);
  assert.doesNotMatch(styles, /\.data-trend-detail\s*\{[^}]*position:\s*absolute/s);
});

test("overview header links freshness health to sync records and removes the identity slogan", () => {
  const page = read("src/features/data-center/DataCenterAppPage.jsx");
  assert.match(page, /href="#data-sync"/);
  assert.match(page, /数据截取到/);
  assert.match(page, /数据同步有/);
  assert.match(page, /数据读取异常/);
  assert.match(page, /error \|\| metricError \|\| comparisonError/);
  assert.match(page, /formatChineseDate/);
  assert.doesNotMatch(page, /统一口径 · 可追溯 · 截止昨天/);
});

test("overview automatically repairs a latest-day completeness warning before escalating it", () => {
  const page = read("src/features/data-center/DataCenterAppPage.jsx");
  const api = read("src/state/dataCenterApi.js");
  assert.match(page, /detectLatestSalesAnomaly/);
  assert.match(page, /requestSalesRepair/);
  assert.match(page, /salesMeta\.latestDailyFacts/);
  assert.match(page, /自动补拉中/);
  assert.match(page, /自动补拉失败/);
  assert.match(page, /repairRun\?\.attempts/);
  assert.match(api, /\/api\/platform\/v1\/data-services\/sales-repair/);
});
