import { Database, PackageCheck, RefreshCw, TrendingUp, WalletCards } from "lucide-react";

const money = value => `¥${Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
const number = value => Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 });

function DateRange({ range, setRange }) {
  return (
    <div className="data-range-controls" aria-label="数据日期范围">
      <label>开始日期<input type="date" value={range.from} max={range.to} onChange={event => setRange(current => ({ ...current, from: event.target.value }))} /></label>
      <span>至</span>
      <label>截止日期<input type="date" value={range.to} min={range.from} onChange={event => setRange(current => ({ ...current, to: event.target.value }))} /></label>
    </div>
  );
}

function Trend({ rows }) {
  const maximum = Math.max(...rows.map(row => row.netSales), 1);
  return (
    <div className="data-mini-trend" role="img" aria-label="按订单创建时间统计的日净销售额趋势">
      {rows.map(row => <div key={row.date} title={`${row.date} · ${money(row.netSales)}`}><i style={{ height: `${Math.max(4, row.netSales / maximum * 100)}%` }} /><span>{row.date.slice(5)}</span></div>)}
    </div>
  );
}

export function DataOverview({ summary, quality, range, setRange, salesMeta }) {
  const totals = summary.totals;
  const metrics = [
    ["净销售额", money(totals.netSales), TrendingUp, "已扣退款"],
    ["销售数量", number(totals.qty), PackageCheck, "件"],
    ["毛利", money(totals.grossProfit), WalletCards, `毛利率 ${number(totals.grossMarginRate)}%`],
    ["退款率", `${number(totals.refundRate)}%`, RefreshCw, `退款 ${money(totals.refund)}`],
    ["数据行", number(summary.rowCount), Database, `排除其它 ${summary.excludedRows} 行`]
  ];
  const topNetSales = summary.byPlatform.reduce((sum, row) => sum + row.netSales, 0);
  return (
    <div className="data-workspace">
      <section className="data-basis-strip">
        <div><strong>订单创建时间</strong><span>Asia/Shanghai · 默认当月至截止昨天 · 日常口径排除“其它”</span></div>
        <DateRange range={range} setRange={setRange} />
      </section>
      <div className="data-kpi-grid">{metrics.map(([label, value, Icon, note]) => <article key={label}><Icon size={18} /><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}</div>
      <div className="data-overview-grid">
        <section className="section-panel data-trend-panel"><div className="section-head"><div><h2>经营趋势</h2><p>{range.from} 至 {range.to}，按日净销售额。</p></div></div>{summary.byDay.length ? <Trend rows={summary.byDay} /> : <div className="empty-state compact-empty">当前日期范围没有销售数据。</div>}</section>
        <section className="section-panel"><div className="section-head"><div><h2>平台贡献</h2><p>用于判断收入集中度，不包含“其它”。</p></div></div><div className="data-contribution-list">{summary.byPlatform.slice(0, 6).map(row => { const share = topNetSales ? row.netSales / topNetSales * 100 : 0; return <div key={row.platform}><span><strong>{row.platform}</strong><small>{number(share)}%</small></span><i><b style={{ width: `${share}%` }} /></i><em>{money(row.netSales)}</em></div>; })}{!summary.byPlatform.length ? <div className="empty-state compact-empty">暂无平台数据。</div> : null}</div></section>
      </div>
      <section className="section-panel data-health-panel"><div className="section-head"><div><h2>数据健康</h2><p>先看数据是否可信，再看经营结论。</p></div><span className={`status-badge ${quality.openIssues ? "warning" : "success"}`}>{quality.openIssues ? `${quality.openIssues} 个待处理问题` : "当前无阻塞问题"}</span></div><div className="data-health-grid"><div><span>最近成功同步</span><strong>{quality.lastSuccessfulSyncAt ? new Date(quality.lastSuccessfulSyncAt).toLocaleString("zh-CN", { hour12: false }) : "尚无记录"}</strong></div><div><span>待确认商品映射</span><strong>{quality.unmappedProducts}</strong></div><div><span>口径排除行</span><strong>{quality.excludedRows}</strong></div><div><span>读取方式</span><strong>{salesMeta.local ? "浏览器本地降级" : "线上数据库"}</strong></div></div></section>
    </div>
  );
}
