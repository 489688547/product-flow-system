import { useDataCenter } from "../../state/DataCenterProvider.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildDataCenterSalesFactViews, buildDataQualitySummary, buildLegacyDataCenterMetricResults, DATA_CENTER_OVERVIEW_METRICS, detectLatestSalesAnomaly, previousDataCenterRange } from "../../domain/dataCenter.js";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { DataOverview } from "./DataOverview.jsx";
import { useAuth } from "../../state/AuthProvider.jsx";
import { canAccessCompanyPlatform, canManagePlatformConnections } from "../../domain/permissions.js";
import { DataCenterSettingsWorkspace, DataSourcesWorkspace, SyncRunsWorkspace } from "./DataGovernanceWorkspaces.jsx";
import { UserInsightsProvider } from "../../state/UserInsightsProvider.jsx";
import { UserInsightsWorkspace } from "./UserInsightsWorkspace.jsx";
import { ProductCatalogWorkspace } from "./ProductCatalogWorkspace.jsx";
import { useDataStandards } from "../../state/DataStandardsProvider.jsx";
import { DataStandardsWorkspace } from "./data-standards/DataStandardsWorkspace.jsx";
import { AiModelWorkspace } from "./AiModelWorkspace.jsx";
import { requestSalesRepair } from "../../state/dataCenterApi.js";

const SECTION_META = {
  overview: ["数据总览", "统一查看公司经营数据、趋势和平台分布。"],
  insights: ["用户洞察", "按平台、店铺和产品查看用户市场与竞品参考。"],
  products: ["商品主数据", "统一维护 ERP 商品、SKU、69 码及跨 App 关联。"],
  sources: ["数据接入", "统一管理电商平台、ERP 与公司数据。"],
  metrics: ["数据口径", "维护公司统一的定义、公式、版本和责任部门。"],
  sync: ["同步记录", "查看采集结果、数据质量和待处理异常。"],
  services: ["AI 大模型", "查看各业务 App 的模型与 Skill 使用情况，统一管理公司 AI 服务。"],
  settings: ["设置", "维护时区、截止时间和保留策略。"]
};

const overviewMetricCodes = DATA_CENTER_OVERVIEW_METRICS.map(metric => metric.metricCode);
const legacyOverviewRollback = import.meta.env.VITE_DATA_CENTER_LEGACY_OVERVIEW_ROLLBACK === "1";

function formatChineseDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[1]}年${Number(match[2])}月${Number(match[3])}日` : "";
}

export function DataCenterAppPage({ section = "overview", dataAccessCategory = "" }) {
  const { user } = useAuth();
  const { state, range, setRange, salesRows, salesMeta, loading, error, refresh } = useDataCenter();
  const [repairRunState, setRepairRunState] = useState(null);
  const repairTracking = useRef({ date: "", requests: 0, polls: 0 });
  const {
    results,
    run,
    resultLoading,
    error: metricError,
    comparisonResults,
    comparisonRun,
    comparisonLoading,
    comparisonError,
    ensureResults,
    scheduleEnsureResults,
    ensureComparisonResults,
    scheduleComparisonResults
  } = useDataStandards();
  const [title, description] = SECTION_META[section] || SECTION_META.overview;
  const factViews = useMemo(() => buildDataCenterSalesFactViews(salesRows, range), [range, salesRows]);
  const legacyMetricResults = useMemo(() => legacyOverviewRollback ? buildLegacyDataCenterMetricResults(salesRows, range) : [], [range, salesRows]);
  const comparisonRange = useMemo(() => previousDataCenterRange(range), [range.from, range.to]);
  const comparisonTargetVersions = useMemo(() => Object.fromEntries(results
    .filter(result => result.from === range.from && result.to === range.to && overviewMetricCodes.includes(result.metricCode) && Number.isInteger(Number(result.version)))
    .map(result => [result.metricCode, Number(result.version)])), [range.from, range.to, results]);
  const comparisonVersionsReady = overviewMetricCodes.every(metricCode => comparisonTargetVersions[metricCode] >= 1);
  const comparisonVersionKey = overviewMetricCodes.map(metricCode => `${metricCode}:${comparisonTargetVersions[metricCode] || ""}`).join("|");
  const latestSalesAnomaly = useMemo(() => detectLatestSalesAnomaly(salesMeta.latestDailyFacts || []), [salesMeta.latestDailyFacts]);
  const persistedRepairRun = useMemo(() => state.syncRuns
    .filter(item => item.id === `kuaimai-sales-repair:${latestSalesAnomaly.date}:sales-completeness-v1`)
    .sort((left, right) => String(right.updatedAt || right.completedAt || right.startedAt || "").localeCompare(String(left.updatedAt || left.completedAt || left.startedAt || "")))[0] || null,
  [latestSalesAnomaly.date, state.syncRuns]);
  const repairRun = useMemo(() => [persistedRepairRun, repairRunState].filter(Boolean)
    .sort((left, right) => String(right.updatedAt || right.completedAt || right.startedAt || "").localeCompare(String(left.updatedAt || left.completedAt || left.startedAt || "")))[0] || null,
  [persistedRepairRun, repairRunState]);
  const canRepairSales = user?.role !== "readonly" && (user?.role === "executive" || String(user?.department || user?.departmentName || "")
    .split(/\s*(?:\/|、|,|，|;|；|\|)\s*/).some(item => ["总经办", "运营部", "运营"].includes(item)));
  const quality = useMemo(() => ({
    ...buildDataQualitySummary({ state, salesMeta, salesRows }),
    latestSalesAnomaly,
    repairRun
  }), [latestSalesAnomaly, repairRun, salesMeta, salesRows, state]);
  const dataHealthIssueCount = quality.openIssues + quality.unmappedProducts + quality.syncAttentionCount;
  const latestDataDate = formatChineseDate(quality.latestDataDate);
  const dataHealthUnavailable = Boolean(error || metricError || comparisonError);
  const repairRunning = latestSalesAnomaly.status === "anomaly" && repairRun?.status === "running";
  const repairExhausted = latestSalesAnomaly.status === "anomaly" && (repairRun?.status === "manual_required" || repairRun?.status === "success" || Number(repairRun?.attempts) >= 2);
  const completenessVerified = latestSalesAnomaly.status === "healthy";
  const dataHealthOkay = Boolean(latestDataDate) && completenessVerified && !dataHealthUnavailable && dataHealthIssueCount === 0;
  const dataHealthLabel = latestSalesAnomaly.status === "anomaly"
    ? repairRunning
      ? `⚠️ ${formatChineseDate(latestSalesAnomaly.date)}数据异常 · 自动补拉中`
      : repairExhausted
        ? `⚠️ ${formatChineseDate(latestSalesAnomaly.date)}自动补拉失败 · 处理数据异常`
        : `⚠️ ${formatChineseDate(latestSalesAnomaly.date)}数据疑似不完整 · 正在自动处理`
    : dataHealthOkay
      ? `✅ 数据截取到 ${latestDataDate}`
      : dataHealthUnavailable
      ? `⚠️ 数据读取异常${latestDataDate ? ` · 截取到 ${latestDataDate}` : ""}`
      : !completenessVerified && latestDataDate
        ? `⚠️ 数据截取到 ${latestDataDate} · 完整性待校验`
        : dataHealthIssueCount
        ? `⚠️ 数据同步有 ${dataHealthIssueCount} 项待处理${latestDataDate ? ` · 截取到 ${latestDataDate}` : ""}`
        : "⚠️ 暂无可用数据";
  useEffect(() => {
    if (section !== "overview" || legacyOverviewRollback) return;
    scheduleEnsureResults(range, overviewMetricCodes);
    if (comparisonVersionsReady) scheduleComparisonResults(comparisonRange, overviewMetricCodes, comparisonTargetVersions);
  }, [comparisonRange.from, comparisonRange.to, comparisonVersionKey, comparisonVersionsReady, range.from, range.to, scheduleComparisonResults, scheduleEnsureResults, section]);
  useEffect(() => {
    const date = latestSalesAnomaly.date;
    if (repairTracking.current.date !== date) repairTracking.current = { date, requests: 0, polls: 0 };
    if (section !== "overview" || legacyOverviewRollback || !canRepairSales || salesMeta.local || latestSalesAnomaly.status !== "anomaly") return undefined;
    if (repairRun?.status === "manual_required" || repairRun?.status === "success" || Number(repairRun?.attempts) >= 2) return undefined;
    if (repairRun?.status === "running") {
      if (repairTracking.current.polls >= 12) return undefined;
      const timer = setTimeout(() => {
        repairTracking.current.polls += 1;
        refresh();
      }, 2000);
      return () => clearTimeout(timer);
    }
    if (repairTracking.current.requests >= 2) return undefined;
    let active = true;
    repairTracking.current.requests += 1;
    requestSalesRepair(date).then(payload => {
      if (!active) return;
      if (payload.run) setRepairRunState({ ...payload.run, updatedAt: payload.run.updatedAt || new Date().toISOString() });
      const timer = setTimeout(refresh, 2000);
      repairTracking.current.refreshTimer = timer;
    }).catch(requestError => {
      if (!active) return;
      setRepairRunState({ date, status: "failed", attempts: repairTracking.current.requests, message: requestError.message, updatedAt: new Date().toISOString() });
    });
    return () => {
      active = false;
      if (repairTracking.current.refreshTimer) clearTimeout(repairTracking.current.refreshTimer);
    };
  }, [canRepairSales, latestSalesAnomaly.date, latestSalesAnomaly.status, refresh, repairRun?.attempts, repairRun?.status, salesMeta.local, section]);
  const retryMetricResults = async () => {
    try {
      const current = await ensureResults(range, overviewMetricCodes);
      const targetVersions = Object.fromEntries((current.results || [])
        .filter(result => overviewMetricCodes.includes(result.metricCode) && Number.isInteger(Number(result.version)))
        .map(result => [result.metricCode, Number(result.version)]));
      await ensureComparisonResults(comparisonRange, overviewMetricCodes, targetVersions);
    } catch {
      // Errors stay visible through the provider state and can be retried from the cards.
    }
  };
  const canEdit = user?.role !== "readonly" && (canAccessCompanyPlatform(user) || String(user?.department || "") === "运营部");
  const canManageConnections = canManagePlatformConnections(user);
  const canManage = user?.role !== "readonly" && canAccessCompanyPlatform(user);
  const content = {
    overview: <DataOverview factViews={factViews} range={range} setRange={setRange} metricResults={legacyOverviewRollback ? legacyMetricResults : results} metricRun={legacyOverviewRollback ? null : run} metricLoading={!legacyOverviewRollback && resultLoading} metricError={legacyOverviewRollback ? null : metricError} comparisonRange={comparisonRange} comparisonResults={comparisonResults} comparisonRun={comparisonRun} comparisonLoading={!legacyOverviewRollback && comparisonLoading} comparisonError={legacyOverviewRollback ? null : comparisonError} retryMetricResults={retryMetricResults} compatibilityRollback={legacyOverviewRollback} />,
    insights: <UserInsightsProvider><UserInsightsWorkspace /></UserInsightsProvider>,
    products: <ProductCatalogWorkspace canEdit={canEdit} />,
    sources: <DataSourcesWorkspace canEdit={canEdit} canManage={canManage} canManagePlatform={canManageConnections} initialCategory={dataAccessCategory} />,
    metrics: <DataStandardsWorkspace />,
    sync: <SyncRunsWorkspace quality={quality} />,
    services: <AiModelWorkspace />,
    settings: <DataCenterSettingsWorkspace canEdit={canEdit} />
  };
  return (
    <section className="page data-center-page">
      <PageHeader title={title} description={description} identity={section === "services" ? "服务端统一调用 · 不展示个人排行 · 内容不入审计" : section === "products" ? "快麦已落库 · 订单创建时间 · 默认不含其它" : undefined}>
        {section === "overview" ? <a className={`data-health-link ${dataHealthOkay ? "success" : "warning"}`} href="#data-sync" aria-label={`${dataHealthLabel}，查看同步记录`}>{dataHealthLabel}</a> : null}
      </PageHeader>
      {section !== "services" && error ? <div className="section-panel" role="status">{error}</div> : null}
      {section !== "services" && loading ? <div className="section-panel empty-state">正在加载数据…</div> : content[section] || <div className="section-panel empty-state">工作区已接入，详细内容正在装配。</div>}
    </section>
  );
}
