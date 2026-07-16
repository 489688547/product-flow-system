import { TrendingUp } from "lucide-react";

function currency(value) {
  if (value == null) return "—";
  return `¥${Math.round(value).toLocaleString("zh-CN")}`;
}

function percent(value) {
  return value == null ? "—" : `${value.toLocaleString("zh-CN", { maximumFractionDigits: 1 })}%`;
}

function stateCopy(summary) {
  if (!summary || summary.state === "missing-target") return "待设置平均月 GMV";
  if (summary.state === "missing-sku") return "待绑定销售商品";
  return "";
}

function Metric({ label, metric, fallback }) {
  if (!metric || metric.state === "missing-schedule") return <div className="gmv-metric empty"><span>{label}</span><strong>{fallback || "待补充预计上线时间"}</strong></div>;
  if (metric.state === "not-launched") return <div className="gmv-metric empty"><span>{label}</span><strong>预计上线后开始累计</strong></div>;
  const width = Math.min(100, Math.max(0, metric.percent || 0));
  return (
    <div className={`gmv-metric ${(metric.percent || 0) >= 100 ? "achieved" : ""}`}>
      <span>{label}</span>
      <strong>{percent(metric.percent)}</strong>
      <small>{currency(metric.actual)} / {currency(metric.target)}</small>
      <i aria-hidden="true"><b style={{ width: `${width}%` }} /></i>
    </div>
  );
}

export function ProductGmvSummary({ summary, loading = false, error = "", compact = false }) {
  if (loading) return <section className={`product-gmv-summary ${compact ? "compact" : ""}`}><TrendingUp size={16} /><span>正在读取 GMV…</span></section>;
  if (error) return <section className={`product-gmv-summary error ${compact ? "compact" : ""}`} title={error}><TrendingUp size={16} /><span>GMV 数据加载失败</span></section>;
  const unavailable = stateCopy(summary);
  if (unavailable) return <section className={`product-gmv-summary empty ${compact ? "compact" : ""}`}><TrendingUp size={16} /><span>{unavailable}</span></section>;

  if (compact) {
    return <section className="product-gmv-summary compact"><TrendingUp size={15} /><span>本月 GMV</span><strong>{percent(summary.current.percent)}</strong><small>{currency(summary.current.actual)} / {currency(summary.current.target)}</small></section>;
  }

  return (
    <section className="product-gmv-summary" aria-label="产品 GMV 达成进度">
      <div className="gmv-summary-title"><TrendingUp size={17} /><span>GMV 达成</span>{summary.salesState === "empty" ? <em>暂无销售数据</em> : null}</div>
      <Metric label="本月 GMV" metric={summary.current} />
      <Metric label="累计 GMV" metric={summary.cumulative} />
    </section>
  );
}
