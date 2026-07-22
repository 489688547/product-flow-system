import { AlertCircle, ArrowDown, ArrowRight, ArrowUp, PackageCheck, Percent, RefreshCw, TrendingUp, WalletCards } from "lucide-react";
import { compareDataCenterMetric, dataCenterPresetRange, DATA_CENTER_OVERVIEW_METRICS } from "../../domain/dataCenter.js";
import { Button } from "../../ui/Button.jsx";
import { DateRangePickerField } from "../../ui/DateRangePickerField.jsx";

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

function comparisonReason(code) {
  const reasons = {
    CURRENT_RESULT_NOT_AVAILABLE: "环比等待本期正式结果",
    CURRENT_DATA_NOT_COVERED: "本期覆盖不完整，暂不能环比",
    PREVIOUS_RESULT_NOT_AVAILABLE: "上期暂无正式结果",
    PREVIOUS_DATA_NOT_COVERED: "上期覆盖不完整，暂不能环比",
    PREVIOUS_VALUE_ZERO: "上期为 0，暂无可比比例",
    DATA_STANDARD_CALCULATION_FAILED: "上期计算失败，暂不能环比",
    DATA_STANDARD_CALCULATION_TIMEOUT: "上期计算较慢，请稍后查看环比",
    DATA_STANDARD_STORAGE_UNAVAILABLE: "共享口径暂不可用"
  };
  return reasons[code] || "上期暂无正式结果";
}

function comparisonText(comparison) {
  const direction = comparison.direction === "up" ? "环比上升" : comparison.direction === "down" ? "环比下降" : "环比持平";
  const suffix = comparison.unit === "percentage_point" ? " 个百分点" : "%";
  if (comparison.direction === "flat") return `${direction} 0${suffix}`;
  return `${direction} ${number(comparison.value)}${suffix}`;
}

function MetricComparison({ current, previous, metric, loading, error, compatibilityRollback }) {
  if (compatibilityRollback) return <span className="data-kpi-comparison neutral"><ArrowRight size={13} aria-hidden="true" />环比暂不可用</span>;
  if (loading && !previous) return <span className="data-kpi-comparison neutral"><RefreshCw size={13} className="is-spinning" aria-hidden="true" />环比计算中</span>;
  if (error) return <span className="data-kpi-comparison neutral"><AlertCircle size={13} aria-hidden="true" />{comparisonReason(error.code)}</span>;
  const comparison = compareDataCenterMetric(current, previous, metric);
  if (!comparison.available) return <span className="data-kpi-comparison neutral"><ArrowRight size={13} aria-hidden="true" />{comparisonReason(comparison.reasonCode)}</span>;
  const DirectionIcon = comparison.direction === "up" ? ArrowUp : comparison.direction === "down" ? ArrowDown : ArrowRight;
  const tone = comparison.direction === "flat" ? "neutral" : comparison.favorable ? "favorable" : "unfavorable";
  const text = comparisonText(comparison);
  return <span className={`data-kpi-comparison ${tone}`} aria-label={text}><DirectionIcon size={13} aria-hidden="true" />{text}</span>;
}

function grossMarginRate(row) {
  return row.netSales ? row.grossProfit / row.netSales * 100 : null;
}

function trendDayLabel(row) {
  const rate = grossMarginRate(row);
  const platforms = row.platforms.map(item => `${item.platform} GMV ${money(item.sales)}`).join("，");
  return `${row.date}，GMV ${money(row.sales)}，销售数量 ${number(row.qty)}，毛利率 ${rate == null ? "暂无结果" : `${number(rate)}%`}，${platforms}`;
}

function Trend({ rows }) {
  const maximum = Math.max(...rows.map(row => row.sales), 1);
  return (
    <div className="data-mini-trend" role="list" aria-label="按订单创建时间统计的每日 GMV 趋势">
      {rows.map(row => {
        const rate = grossMarginRate(row);
        const tooltipId = `trend-${row.date}`;
        return <div className="data-trend-day" role="listitem" tabIndex={0} key={row.date} aria-label={trendDayLabel(row)} aria-describedby={tooltipId}>
          <i style={{ height: `${Math.max(4, row.sales / maximum * 100)}%` }} aria-hidden="true" />
          <span>{row.date.slice(5)}</span>
          <div className="data-trend-tooltip" id={tooltipId} role="tooltip">
            <strong>{row.date}</strong>
            <dl>
              <div><dt>GMV</dt><dd>{money(row.sales)}</dd></div>
              <div><dt>销售数量</dt><dd>{number(row.qty)}</dd></div>
              <div><dt>毛利率</dt><dd>{rate == null ? "暂无结果" : `${number(rate)}%`}</dd></div>
            </dl>
            <ul>{row.platforms.map(item => <li key={item.platform}><span>{item.platform}</span><b>{money(item.sales)}</b></li>)}</ul>
          </div>
        </div>;
      })}
    </div>
  );
}

export function DataOverview({ factViews, range, setRange, metricResults = [], metricRun, metricLoading, metricError, comparisonRange, comparisonResults = [], comparisonRun, comparisonLoading, comparisonError, retryMetricResults, compatibilityRollback = false }) {
  const rangeResults = metricResults.filter(result => result.from === range.from && result.to === range.to);
  const byMetricCode = new Map(rangeResults.map(result => [result.metricCode, result]));
  const previousRangeResults = comparisonResults.filter(result => result.from === comparisonRange.from && result.to === comparisonRange.to);
  const previousByMetricCode = new Map(previousRangeResults.map(result => [result.metricCode, result]));
  const runForRange = metricRun?.from === range.from && metricRun?.to === range.to ? metricRun : null;
  const comparisonRunForRange = comparisonRun?.from === comparisonRange.from && comparisonRun?.to === comparisonRange.to ? comparisonRun : null;
  const updating = metricLoading || ["pending", "running"].includes(runForRange?.status);
  const comparisonUpdating = comparisonLoading || ["pending", "running"].includes(comparisonRunForRange?.status);
  const failed = runForRange?.status === "failed";
  const missingCount = DATA_CENTER_OVERVIEW_METRICS.filter(metric => !byMetricCode.has(metric.metricCode)).length;
  const totalGmv = factViews.byPlatform.reduce((sum, row) => sum + row.sales, 0);
  const datePresets = [
    { id: "last7", label: "近 7 天", range: dataCenterPresetRange(7) },
    { id: "last15", label: "近 15 天", range: dataCenterPresetRange(15) },
    { id: "last30", label: "近 30 天", range: dataCenterPresetRange(30) }
  ];
  const maxDate = datePresets[0].range.to;
  return (
    <div className="data-workspace">
      <section className="data-basis-strip">
        <div><strong>订单创建时间</strong><span>Asia/Shanghai</span></div>
        <DateRangePickerField value={range} onConfirm={setRange} presets={datePresets} maxDate={maxDate} maxDays={370} ariaLabel="选择数据总览日期范围" />
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
        const previous = previousByMetricCode.get(metric.metricCode);
        return <article key={metric.metricCode}><Icon size={18} /><span>{metric.label}</span><strong>{formatMetric(result?.value, metric.format)}</strong><MetricComparison current={result} previous={previous} metric={metric} loading={comparisonUpdating} error={comparisonError} compatibilityRollback={compatibilityRollback} />{!result || coverageRate < 1 ? <small className="data-kpi-meta">{result ? <span className="text-warning">覆盖率 {Math.round((coverageRate || 0) * 100)}%</span> : <span>{resultReason(reasonCode)}</span>}</small> : null}</article>;
      })}</div>
      <div className="data-overview-grid">
        <section className="section-panel data-trend-panel"><div className="section-head"><div><h2>经营趋势</h2><p>{range.from} 至 {range.to}，按日 GMV。</p></div></div>{factViews.byDay.length ? <Trend rows={factViews.byDay} /> : <div className="empty-state compact-empty">当前日期范围没有销售数据。</div>}</section>
        <section className="section-panel"><div className="section-head"><div><h2>平台分布</h2><p>按 GMV 查看当前日期范围的平台占比。</p></div></div><div className="data-contribution-list">{factViews.byPlatform.slice(0, 6).map(row => { const share = totalGmv ? row.sales / totalGmv * 100 : 0; return <div key={row.platform}><span><strong>{row.platform}</strong><small>{number(share)}%</small></span><i><b style={{ width: `${share}%` }} /></i><em>{money(row.sales)}</em></div>; })}{!factViews.byPlatform.length ? <div className="empty-state compact-empty">暂无平台数据。</div> : null}</div></section>
      </div>
    </div>
  );
}
