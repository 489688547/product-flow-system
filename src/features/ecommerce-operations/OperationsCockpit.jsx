import { AlertTriangle, ArrowRight, BarChart3, Boxes, CircleDollarSign, Megaphone, PackageSearch, Search } from "lucide-react";
import { Button } from "../../ui/Button.jsx";
import { DataTable } from "../../ui/DataTable.jsx";
import { DateRangeControls } from "../../ui/DateRangeControls.jsx";

function money(value) {
  return value === null || value === undefined ? "暂无数据" : `¥${Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
}

function number(value) {
  return value === null || value === undefined ? "暂无数据" : Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function percent(value) {
  return value === null || value === undefined ? "暂无数据" : `${Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 1 })}%`;
}

function qualityCopy(quality) {
  if (quality.status === "ready") return ["数据可用", "success"];
  if (quality.status === "stale") return ["数据未更新到截止日", "warning"];
  return ["经营事实暂不可用", "danger"];
}

const ACTION_LABELS = Object.freeze({
  review_plan: "审批方案",
  review_execution: "验收复盘",
  resolve_collaboration: "处理协同",
  data_quality: "核对数据",
  revise_plan: "修改方案",
  execute_plan: "推进执行"
});

export function OperationsCockpit({ snapshot, cockpit, summary, manager, metricLoading = false, draftRange, setDraftRange, applyRange }) {
  const [qualityLabel, qualityTone] = qualityCopy(snapshot.quality);
  const metrics = [
    ["净销售额", money(snapshot.metrics.netSales), `截止 ${snapshot.quality.latestDataDate || "暂无"}`, CircleDollarSign],
    ["商品毛利", money(snapshot.metrics.grossProfit), `毛利率 ${percent(snapshot.metrics.grossMarginRate)}`, BarChart3],
    ["退款率", percent(snapshot.metrics.refundRate), "按创建订单口径", AlertTriangle],
    [manager ? "待主管决策" : "待我处理", cockpit.actions.length, manager ? `${summary.pendingReviews} 个方案待审批` : "按优先级推进", PackageSearch]
  ];
  return <div className="ops-cockpit">
    <form className="ops-data-query" onSubmit={event => { event.preventDefault(); applyRange(); }}><div><strong>经营数据范围</strong><small>修改条件不会自动读取，点击查询后更新页面。</small></div><DateRangeControls range={draftRange} setRange={setDraftRange} idPrefix="operations-range" /><Button type="submit" variant="primary"><Search size={16} />查询经营数据</Button></form>
    <section className="ops-data-basis" aria-label="经营数据依据"><div><span>数据截止</span><strong>{snapshot.quality.latestDataDate || "暂无可用日期"}</strong></div><div><span>数据质量</span><strong className={qualityTone}>{metricLoading ? "正在按数据口径计算" : qualityLabel}</strong></div><div><span>统计口径</span><strong>订单创建时间 · 截止昨天 · 不含其它</strong></div><div><span>最近入库</span><strong>{snapshot.quality.lastSuccessfulSyncAt ? new Date(snapshot.quality.lastSuccessfulSyncAt).toLocaleString("zh-CN", { hour12: false }) : "暂无记录"}</strong></div></section>

    <div className="ops-metric-grid">{metrics.map(([label, value, note, Icon]) => <article key={label}><Icon size={18} aria-hidden="true" /><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}</div>

    <div className="ops-cockpit-grid">
      <section className="section-panel ops-action-panel"><div className="section-head"><div><h2>待我处理</h2><p>{manager ? "先处理审批、验收、协同和数据阻塞。" : "只显示本人需要推进的方案和动作。"}</p></div><span className={`status-badge ${cockpit.actions.length ? "warning" : "success"}`}>{cockpit.actions.length ? `${cockpit.actions.length} 项` : "已清空"}</span></div>{cockpit.actions.length ? <div className="ops-action-list">{cockpit.actions.map(action => <article key={action.id}><span>{ACTION_LABELS[action.type] || "经营动作"}</span><div><strong>{action.title}</strong><small>{action.detail}</small></div><ArrowRight size={16} aria-hidden="true" /></article>)}</div> : <div className="empty-state compact-empty">当前没有需要立即处理的经营事项。</div>}</section>

      <section className="section-panel ops-data-gap"><div className="section-head"><div><h2>数据能力</h2><p>只展示已接通能力；缺失数据不按 0 计算。</p></div></div><div className="ops-capability-list"><article className={snapshot.availability.sales ? "ready" : "missing"}><CircleDollarSign size={17} /><span><strong>销售经营</strong><small>{snapshot.availability.sales ? "净销售额、销量、退款与商品毛利已可用" : "暂无销售事实"}</small></span></article><article className={snapshot.availability.advertising ? "ready" : "missing"}><Megaphone size={17} /><span><strong>投放效率</strong><small>{snapshot.availability.advertising ? "投放消耗与 ROI 已可用" : "暂无投放数据，不能判断广告后 ROI"}</small></span></article><article className={snapshot.availability.inventory ? "ready" : "missing"}><Boxes size={17} /><span><strong>库存与供给</strong><small>{snapshot.availability.inventory ? `可售库存 ${number(snapshot.inventory.sellableQuantity)} · 最低库存覆盖天数 ${number(snapshot.inventory.minimumDaysOfSupply)}` : "暂无库存与供给事实"}</small></span></article></div></section>
    </div>

    <div className="ops-cockpit-grid ops-ranking-grid">
      <section className="section-panel"><div className="section-head"><div><h2>平台经营</h2><p>按净销售额排序，结合毛利率和退款率判断质量。</p></div></div><DataTable minWidth={560} columns={[
        { key: "platform", header: "平台", render: row => row.platform },
        { key: "sales", header: "净销售额", render: row => money(row.metrics.netSales) },
        { key: "profit", header: "商品毛利", render: row => money(row.metrics.grossProfit) },
        { key: "margin", header: "毛利率", render: row => percent(row.metrics.grossMarginRate) },
        { key: "refund", header: "退款率", render: row => percent(row.metrics.refundRate) }
      ]} rows={snapshot.platforms} empty={<div className="empty-state compact-empty">当前范围没有可用的平台经营数据。</div>} /></section>

      <section className="section-panel"><div className="section-head"><div><h2>重点产品</h2><p>基于商品主数据与 69 码映射，不用自由文本拼接商品。</p></div></div><DataTable minWidth={520} columns={[
        { key: "product", header: "商品", render: row => <span>{row.name}<small>{row.brand || row.category || "商品主数据"}</small></span> },
        { key: "sales", header: "净销售额", render: row => money(row.metrics.netSales) },
        { key: "qty", header: "销量", render: row => number(row.metrics.quantity) },
        { key: "status", header: "映射", render: row => <span className={`status-badge ${row.mappingStatus === "mapped" ? "success" : "warning"}`}>{row.mappingStatus === "mapped" ? "已映射" : "待映射"}</span> }
      ]} rows={snapshot.products.filter(item => item.metrics.netSales !== null).slice(0, 8)} empty={<div className="empty-state compact-empty">当前范围没有已映射的商品经营数据。</div>} /></section>
    </div>
  </div>;
}
