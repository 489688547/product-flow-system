import { useDataCenter } from "../../state/DataCenterProvider.jsx";
import { useMemo } from "react";
import { buildDataQualitySummary, summarizeDataCenterSales } from "../../domain/dataCenter.js";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { DataAnalysis } from "./DataAnalysis.jsx";
import { DataOverview } from "./DataOverview.jsx";
import { useAuth } from "../../state/AuthProvider.jsx";
import { canAccessCompanyPlatform, canManagePermissions } from "../../domain/permissions.js";
import { DataCenterSettingsWorkspace, DataQualityWorkspace, DataServicesWorkspace, DataSourcesWorkspace, MetricDefinitionsWorkspace, SyncRunsWorkspace } from "./DataGovernanceWorkspaces.jsx";
import { PlatformConnectionsWorkspace } from "./PlatformConnectionsWorkspace.jsx";

const SECTION_META = {
  overview: ["数据总览", "统一查看公司经营数据和数据健康状态。"],
  analysis: ["数据分析", "按时间、平台和商品下钻经营表现。"],
  sources: ["数据接入", "管理店铺、广告平台和 ERP 数据源。"],
  connections: ["平台连接", "统一维护公司业务平台的安全连接，保存后自动验证。"],
  metrics: ["指标管理", "维护指标口径、负责人和版本。"],
  quality: ["数据质量", "定位缺失、重复、延迟和映射异常。"],
  sync: ["同步记录", "查看每日采集和导入结果。"],
  services: ["数据服务", "管理各业务 App 的数据订阅。"],
  settings: ["设置", "维护时区、截止时间和保留策略。"]
};

export function DataCenterAppPage({ section = "overview" }) {
  const { user } = useAuth();
  const { state: productState } = useProductFlow();
  const { state, range, setRange, salesRows, salesMeta, loading, error } = useDataCenter();
  const [title, description] = SECTION_META[section] || SECTION_META.overview;
  const summary = useMemo(() => summarizeDataCenterSales(salesRows, range), [range, salesRows]);
  const quality = useMemo(() => buildDataQualitySummary({ state, salesMeta, salesRows }), [salesMeta, salesRows, state]);
  const productNames = useMemo(() => new Map((productState.products || []).flatMap(product => (product.skuCodes || []).map(item => [typeof item === "object" ? item.code : item, product.name]))), [productState.products]);
  const canEdit = user?.role !== "readonly" && (canAccessCompanyPlatform(user) || String(user?.department || "") === "运营部");
  const canManageConnections = user?.role !== "readonly" && canManagePermissions(user);
  const content = {
    overview: <DataOverview summary={summary} quality={quality} range={range} setRange={setRange} salesMeta={salesMeta} />,
    analysis: <DataAnalysis rows={salesRows} range={range} productNames={productNames} />,
    sources: <DataSourcesWorkspace canEdit={canEdit} />,
    connections: <PlatformConnectionsWorkspace canManage={canManageConnections} />,
    metrics: <MetricDefinitionsWorkspace />,
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
