import { useDataCenter } from "../../state/DataCenterProvider.jsx";
import { useMemo } from "react";
import { buildDataQualitySummary, summarizeDataCenterSales } from "../../domain/dataCenter.js";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { DataOverview } from "./DataOverview.jsx";
import { useAuth } from "../../state/AuthProvider.jsx";
import { canAccessCompanyPlatform } from "../../domain/permissions.js";
import { DataCenterSettingsWorkspace, DataQualityWorkspace, DataServicesWorkspace, DataSourcesWorkspace, SyncRunsWorkspace } from "./DataGovernanceWorkspaces.jsx";
import { DataStandardsWorkspace } from "./data-standards/DataStandardsWorkspace.jsx";

const SECTION_META = {
  overview: ["数据总览", "统一查看公司经营数据和数据健康状态。"],
  sources: ["数据接入", "管理店铺、广告平台和 ERP 数据源。"],
  metrics: ["数据口径", "维护公司统一的定义、公式、版本和责任部门。"],
  quality: ["数据质量", "定位缺失、重复、延迟和映射异常。"],
  sync: ["同步记录", "查看每日采集和导入结果。"],
  services: ["数据服务", "管理各业务 App 的数据订阅。"],
  settings: ["设置", "维护时区、截止时间和保留策略。"]
};

export function DataCenterAppPage({ section = "overview" }) {
  const { user } = useAuth();
  const { state, range, setRange, salesRows, salesMeta, loading, error } = useDataCenter();
  const [title, description] = SECTION_META[section] || SECTION_META.overview;
  const summary = useMemo(() => summarizeDataCenterSales(salesRows, range), [range, salesRows]);
  const quality = useMemo(() => buildDataQualitySummary({ state, salesMeta, salesRows }), [salesMeta, salesRows, state]);
  const canEdit = user?.role !== "readonly" && (canAccessCompanyPlatform(user) || String(user?.department || "") === "运营部");
  const canManage = user?.role !== "readonly" && canAccessCompanyPlatform(user);
  const content = {
    overview: <DataOverview summary={summary} quality={quality} range={range} setRange={setRange} salesMeta={salesMeta} />,
    sources: <DataSourcesWorkspace canEdit={canEdit} canManage={canManage} />,
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
