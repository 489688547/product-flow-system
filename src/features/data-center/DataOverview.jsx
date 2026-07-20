import { AlertCircle, PackageCheck, Percent, RefreshCw, TrendingUp, WalletCards } from "lucide-react";
import { DATA_CENTER_OVERVIEW_METRICS } from "../../domain/dataCenter.js";
import { Button } from "../../ui/Button.jsx";

const money = value => value == null ? "暂无结果" : `¥${Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
const number = value => value == null ? "暂无结果" : Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
const ICONS = {
  "sales.net_sales": TrendingUp,
  "sales.quantity": PackageCheck,
  "sales.gross_profit": WalletCards,
  "sales.refund_rate": RefreshCw,
  "sales.gross_margin_rate": Percent
};
const RESULT_REASONS = {
  RESULT_NOT_AVAILABLE: "当前范围还没有正式计算结果",
  CALCULATION_PENDING: "计算任务正在排队",
  DATA_NOT_COVERED: "当前事实数据尚未覆盖",
  DIVISION_BY_ZERO: "分母为零，不能生成有效比例",
  DATA_STANDARD_CALCULATION_FAILED: "计算失败，请重新计算",
  DATA_STANDARD_CALCULATION_TIMEOUT: "计算时间较长，请稍后重试",
  DATA_STANDARD_STORAGE_UNAVAILABLE: "共享口径数据库暂不可用"
};

function formatMetric(value, format) {
  if (value == null) return "暂无结果";
  if (format === "money") return money(value);
  if (format === "percent") return `${number(value)}%`;
  return number(value);
}

function resultReason(code) {
  return RESULT_REASONS[code] || "当前范围暂无可用结果";
}

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

export function DataOverview({ factViews, quality, range, setRange, salesMeta, metricResults = [], metricRun, metricLoading, metricError, retryMetricResults, compatibilityRollback = false }) {
  const rangeResults = metricResults.filter(result => result.from === range.from && result.to === range.to);
  const byMetricCode = new Map(rangeResults.map(result => [result.metricCode, result]));
  const runForRange = metricRun?.from === range.from && metricRun?.to === range.to ? metricRun : null;
  const updating = metricLoading || ["pending", "running"].includes(runForRange?.status);
  const failed = runForRange?.status === "failed";
  const missingCount = DATA_CENTER_OVERVIEW_METRICS.filter(metric => !byMetricCode.has(metric.metricCode)).length;
  const topNetSales = factViews.byPlatform.reduce((sum, row) => sum + row.netSales, 0);
  return (
    <div className="data-workspace">
      <section className="data-basis-strip">
        <div><strong>订单创建时间</strong><span>Asia/Shanghai · 默认当月至截止昨天 · 日常口径排除“其它”</span></div>
        <DateRange range={range} setRange={setRange} />
      </section>
      {compatibilityRollback ? <section className="data-metric-state updating" role="alert"><AlertCircle size={17} /><span><strong>兼容回滚口径</strong><small>当前仅临时读取旧销售事实摘要；共享口径定义、结果、版本和审计均未删除。</small></span><span className="status-badge warning">临时模式</span></section> : updating || failed || metricError || missingCount ? <section className={`data-metric-state ${failed || metricError ? "danger" : updating ? "updating" : "neutral"}`} role={failed || metricError ? "alert" : "status"}>
        <AlertCircle size={17} /><span><strong>{updating ? "统一口径正在更新" : failed || metricError ? "统一口径结果读取失败" : `还有 ${missingCount} 项口径暂无结果`}</strong><small>{updating ? "旧批次结果继续保留；新批次完整成功后才会切换。" : resultReason(metricError?.code || runForRange?.errorCode || "RESULT_NOT_AVAILABLE")}</small></span>
        {!updating ? <Button type="button" onClick={retryMetricResults}>重新计算</Button> : <span className="status-badge warning">正在更新 {runForRange?.progress || 0}%</span>}
      </section> : null}
      <div className="data-kpi-grid">{DATA_CENTER_OVERVIEW_METRICS.map(metric => {
        const result = byMetricCode.get(metric.metricCode);
        const Icon = ICONS[metric.metricCode];
        const coverageRate = result?.coverageRate;
        const reasonCode = result?.reasonCode || metricError?.code || "RESULT_NOT_AVAILABLE";
        return <article key={metric.metricCode}><Icon size={18} /><span>{metric.label}</span><strong>{formatMetric(result?.value, metric.format)}</strong><small className="data-kpi-meta">{result ? <><span>版本 v{result.version} · 数据截止 {result.cutoffAt || "—"}</span>{coverageRate < 1 ? <span className="text-warning">覆盖率 {Math.round((coverageRate || 0) * 100)}%</span> : null}</> : <span>{resultReason(reasonCode)}</span>}</small></article>;
      })}</div>
      <div className="data-overview-grid">
        <section className="section-panel data-trend-panel"><div className="section-head"><div><h2>销售事实视图 · 经营趋势</h2><p>{range.from} 至 {range.to}，按日净销售额。</p></div></div>{factViews.byDay.length ? <Trend rows={factViews.byDay} /> : <div className="empty-state compact-empty">当前日期范围没有销售数据。</div>}</section>
        <section className="section-panel"><div className="section-head"><div><h2>销售事实视图 · 平台贡献</h2><p>用于判断收入集中度，不包含“其它”。</p></div></div><div className="data-contribution-list">{factViews.byPlatform.slice(0, 6).map(row => { const share = topNetSales ? row.netSales / topNetSales * 100 : 0; return <div key={row.platform}><span><strong>{row.platform}</strong><small>{number(share)}%</small></span><i><b style={{ width: `${share}%` }} /></i><em>{money(row.netSales)}</em></div>; })}{!factViews.byPlatform.length ? <div className="empty-state compact-empty">暂无平台数据。</div> : null}</div></section>
      </div>
      <section className="section-panel data-health-panel"><div className="section-head"><div><h2>数据健康</h2><p>先看数据是否可信，再看经营结论。</p></div><span className={`status-badge ${quality.openIssues ? "warning" : "success"}`}>{quality.openIssues ? `${quality.openIssues} 个待处理问题` : "当前无阻塞问题"}</span></div><div className="data-health-grid"><div><span>最近成功同步</span><strong>{quality.lastSuccessfulSyncAt ? new Date(quality.lastSuccessfulSyncAt).toLocaleString("zh-CN", { hour12: false }) : "尚无记录"}</strong></div><div><span>待确认商品映射</span><strong>{quality.unmappedProducts}</strong></div><div><span>口径排除行</span><strong>{quality.excludedRows}</strong></div><div><span>读取方式</span><strong>{salesMeta.local ? "浏览器本地降级" : "线上数据库"}</strong></div></div></section>
    </div>
  );
}
