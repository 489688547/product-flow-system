import { useDataCenter } from "../../state/DataCenterProvider.jsx";
import { useEffect, useMemo } from "react";
import { buildDataCenterSalesFactViews, buildDataQualitySummary, buildLegacyDataCenterMetricResults, DATA_CENTER_OVERVIEW_METRICS } from "../../domain/dataCenter.js";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { DataAnalysis } from "./DataAnalysis.jsx";
import { DataOverview } from "./DataOverview.jsx";
import { useAuth } from "../../state/AuthProvider.jsx";
import { canAccessCompanyPlatform, canManagePlatformConnections } from "../../domain/permissions.js";
import { DataCenterSettingsWorkspace, DataQualityWorkspace, DataServicesWorkspace, DataSourcesWorkspace, SyncRunsWorkspace } from "./DataGovernanceWorkspaces.jsx";
import { PlatformConnectionsWorkspace } from "./PlatformConnectionsWorkspace.jsx";
import { UserInsightsProvider } from "../../state/UserInsightsProvider.jsx";
import { UserInsightsWorkspace } from "./UserInsightsWorkspace.jsx";
import { ProductCatalogWorkspace } from "./ProductCatalogWorkspace.jsx";
import { useDataStandards } from "../../state/DataStandardsProvider.jsx";
import { DataStandardsWorkspace } from "./data-standards/DataStandardsWorkspace.jsx";

const SECTION_META = {
  overview: ["数据总览", "统一查看公司经营数据和数据健康状态。"],
  insights: ["用户洞察", "按平台、店铺和产品查看用户市场与竞品参考。"],
  analysis: ["数据分析", "按时间、平台和商品下钻经营表现。"],
  products: ["商品主数据", "统一维护 ERP 商品、SKU、69 码及跨 App 关联。"],
  sources: ["数据接入", "管理店铺、广告平台和 ERP 数据源。"],
  connections: ["平台连接", "统一维护公司业务平台的安全连接，保存后自动验证。"],
  metrics: ["数据口径", "维护公司统一的定义、公式、版本和责任部门。"],
  quality: ["数据质量", "定位缺失、重复、延迟和映射异常。"],
  sync: ["同步记录", "查看每日采集和导入结果。"],
  services: ["数据服务", "管理各业务 App 的数据订阅。"],
  settings: ["设置", "维护时区、截止时间和保留策略。"]
};

const overviewMetricCodes = DATA_CENTER_OVERVIEW_METRICS.map(metric => metric.metricCode);
const legacyOverviewRollback = import.meta.env.VITE_DATA_CENTER_LEGACY_OVERVIEW_ROLLBACK === "1";

export function DataCenterAppPage({ section = "overview" }) {
  const { user } = useAuth();
  const { state: productState } = useProductFlow();
  const { state, range, setRange, salesRows, salesMeta, loading, error } = useDataCenter();
  const { results, run, resultLoading, error: metricError, ensureResults, scheduleEnsureResults } = useDataStandards();
  const [title, description] = SECTION_META[section] || SECTION_META.overview;
  const factViews = useMemo(() => buildDataCenterSalesFactViews(salesRows, range), [range, salesRows]);
  const legacyMetricResults = useMemo(() => legacyOverviewRollback ? buildLegacyDataCenterMetricResults(salesRows, range) : [], [range, salesRows]);
  const quality = useMemo(() => buildDataQualitySummary({ state, salesMeta, salesRows }), [salesMeta, salesRows, state]);
  const productNames = useMemo(() => new Map((productState.products || []).flatMap(product => (product.skuCodes || []).map(item => [typeof item === "object" ? item.code : item, product.name]))), [productState.products]);
  useEffect(() => {
    if (section === "overview" && !legacyOverviewRollback) scheduleEnsureResults(range, overviewMetricCodes);
  }, [range.from, range.to, scheduleEnsureResults, section]);
  const retryMetricResults = () => ensureResults(range, overviewMetricCodes).catch(() => {});
  const canEdit = user?.role !== "readonly" && (canAccessCompanyPlatform(user) || String(user?.department || "") === "运营部");
  const canManageConnections = canManagePlatformConnections(user);
  const canManage = user?.role !== "readonly" && canAccessCompanyPlatform(user);
  const content = {
    overview: <DataOverview factViews={factViews} quality={quality} range={range} setRange={setRange} salesMeta={salesMeta} metricResults={legacyOverviewRollback ? legacyMetricResults : results} metricRun={legacyOverviewRollback ? null : run} metricLoading={!legacyOverviewRollback && resultLoading} metricError={legacyOverviewRollback ? null : metricError} retryMetricResults={retryMetricResults} compatibilityRollback={legacyOverviewRollback} />,
    insights: <UserInsightsProvider><UserInsightsWorkspace /></UserInsightsProvider>,
    analysis: <DataAnalysis rows={salesRows} range={range} productNames={productNames} />,
    products: <ProductCatalogWorkspace canEdit={canEdit} />,
    sources: <DataSourcesWorkspace canEdit={canEdit} canManage={canManage} />,
    connections: <PlatformConnectionsWorkspace canManage={canManageConnections} />,
    metrics: <DataStandardsWorkspace />,
    quality: <DataQualityWorkspace quality={quality} />,
    sync: <SyncRunsWorkspace />,
    services: <DataServicesWorkspace />,
    settings: <DataCenterSettingsWorkspace canEdit={canEdit} />
  };
  return (
    <section className="page data-center-page">
      <PageHeader title={title} description={description} identity="统一口径 · 可追溯 · 截止昨天" />
      {error ? <div className="section-panel" role="status">{error}</div> : null}
      {loading ? <div className="section-panel empty-state">正在加载数据…</div> : content[section] || <div className="section-panel empty-state">工作区已接入，详细内容正在装配。</div>}
    </section>
  );
}
