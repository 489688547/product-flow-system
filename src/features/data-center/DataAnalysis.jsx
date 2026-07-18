import { useMemo, useState } from "react";
import { summarizeDataCenterSales } from "../../domain/dataCenter.js";
import { DataTable } from "../../ui/DataTable.jsx";

const money = value => `¥${Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
const number = value => Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 });

export function DataAnalysis({ rows, range, productNames }) {
  const [platform, setPlatform] = useState("all");
  const [code, setCode] = useState("all");
  const platforms = useMemo(() => [...new Set(rows.map(row => row.platform).filter(Boolean))].sort(), [rows]);
  const products = useMemo(() => [...new Set(rows.map(row => row.code).filter(Boolean))].sort(), [rows]);
  const selected = useMemo(() => rows.filter(row => (platform === "all" || row.platform === platform) && (code === "all" || row.code === code)), [code, platform, rows]);
  const summary = useMemo(() => summarizeDataCenterSales(selected, range), [range, selected]);
  const columns = [
    { key: "date", header: "订单创建日", render: row => row.date },
    { key: "platform", header: "平台", render: row => row.platform },
    { key: "product", header: "商品", render: row => <span className="data-product-cell"><strong>{productNames.get(row.code) || "未映射商品"}</strong><small>{row.code}</small></span> },
    { key: "qty", header: "销售数量", render: row => number(row.qty) },
    { key: "netSales", header: "净销售额", render: row => money(row.netSales) },
    { key: "refund", header: "退款", render: row => money(row.refund) },
    { key: "grossProfit", header: "毛利", render: row => money(row.grossProfit) }
  ];
  const tableRows = selected.filter(row => row.date >= range.from && row.date <= range.to).map((row, index) => ({ ...row, id: `${row.code}-${row.date}-${row.platform}-${index}` }));
  return (
    <div className="data-workspace">
      <section className="data-analysis-toolbar" aria-label="分析筛选">
        <label>平台筛选<select value={platform} onChange={event => setPlatform(event.target.value)}><option value="all">全部平台</option>{platforms.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>商品筛选<select value={code} onChange={event => setCode(event.target.value)}><option value="all">全部商品</option>{products.map(value => <option key={value} value={value}>{productNames.get(value) || value}</option>)}</select></label>
        <div><span>当前净销售额</span><strong>{money(summary.totals.netSales)}</strong></div>
        <div><span>毛利率</span><strong>{number(summary.totals.grossMarginRate)}%</strong></div>
      </section>
      <section className="section-panel"><div className="section-head"><div><h2>按日趋势</h2><p>按订单创建时间拆分，支持平台和商品交叉筛选。</p></div></div><div className="data-analysis-series">{summary.byDay.map(day => <div key={day.date}><span>{day.date}</span><i><b style={{ width: `${summary.totals.netSales ? day.netSales / Math.max(...summary.byDay.map(item => item.netSales), 1) * 100 : 0}%` }} /></i><strong>{money(day.netSales)}</strong></div>)}{!summary.byDay.length ? <div className="empty-state compact-empty">筛选范围内暂无数据。</div> : null}</div></section>
      <section className="section-panel"><div className="section-head"><div><h2>销售明细</h2><p>{range.from} 至 {range.to} · 已排除“其它” · 共 {tableRows.length} 行。</p></div></div><DataTable minWidth={820} columns={columns} rows={tableRows} empty={<div className="empty-state compact-empty">暂无销售明细。</div>} /></section>
    </div>
  );
}
