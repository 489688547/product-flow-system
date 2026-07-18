import { useDataCenter } from "../../state/DataCenterProvider.jsx";

const SECTION_META = {
  overview: ["数据总览", "统一查看公司经营数据和数据健康状态。"],
  analysis: ["数据分析", "按时间、平台和商品下钻经营表现。"],
  sources: ["数据接入", "管理店铺、广告平台和 ERP 数据源。"],
  metrics: ["指标管理", "维护指标口径、负责人和版本。"],
  quality: ["数据质量", "定位缺失、重复、延迟和映射异常。"],
  sync: ["同步记录", "查看每日采集和导入结果。"],
  services: ["数据服务", "管理各业务 App 的数据订阅。"],
  settings: ["设置", "维护时区、截止时间和保留策略。"]
};

export function DataCenterAppPage({ section = "overview" }) {
  const { loading, error } = useDataCenter();
  const [title, description] = SECTION_META[section] || SECTION_META.overview;
  return (
    <section className="page data-center-page">
      <header className="page-header">
        <div><span className="eyebrow">数据中心</span><h1>{title}</h1><p>{description}</p></div>
      </header>
      {error ? <div className="section-panel" role="status">{error}</div> : null}
      <div className="section-panel empty-state">{loading ? "正在加载数据…" : "工作区已接入，详细内容正在装配。"}</div>
    </section>
  );
}
