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
  assert.match(page, /scheduleComparisonResults\(comparisonRange, overviewMetricCodes\)/);
  assert.match(page, /comparisonResults=\{comparisonResults\}/);
});

test("governed cards preserve missing values and show result provenance and calculation states", () => {
  const overview = read("src/features/data-center/DataOverview.jsx");
  assert.match(overview, /暂无结果/);
  assert.match(overview, /coverageRate/);
  assert.match(overview, /版本 v/);
  assert.match(overview, /数据截止/);
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

test("trend and platform contribution remain explicitly labelled sales fact views", () => {
  const overview = read("src/features/data-center/DataOverview.jsx");
  assert.match(overview, /销售事实视图/);
  assert.match(overview, /经营趋势/);
  assert.match(overview, /平台贡献/);
});
