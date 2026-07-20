import { DataTable } from "../../ui/DataTable.jsx";

function metric(value, unit = "天") {
  return value === null || value === undefined ? "—" : `${Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 1 })}${unit}`;
}

export function CashCycleWorkspace({ dashboard, terms = [] }) {
  const metrics = dashboard?.metrics || {};
  const columns = [
    { key: "platform", header: "平台", render: row => <strong>{row.platform}</strong> },
    { key: "days", header: "固定应收账期", render: row => `${row.days} 天` },
    { key: "from", header: "生效日期", render: row => row.effectiveFrom },
    { key: "to", header: "结束日期", render: row => row.effectiveTo || "长期有效" },
    { key: "reason", header: "制定依据", render: row => row.reason }
  ];
  return (
    <div className="goods-flow-workspace">
      <div className="cash-cycle-scroll">
        <section className="cash-cycle-equation" aria-label="现金循环构成">
          <div><span>库存周转</span><strong>{metric(metrics.inventoryDays)}</strong></div>
          <b>+</b>
          <div><span>应收</span><strong>{metric(metrics.receivableDays)}</strong></div>
          <b>−</b>
          <div><span>应付</span><strong>{metric(metrics.payableDays)}</strong></div>
          <b>=</b>
          <div className="cash-cycle-result"><span>CCC</span><strong>{metric(metrics.cccDays)}</strong></div>
        </section>
      </div>
      <section className="section-panel">
        <div className="section-head"><div><h2>平台应收账期</h2><p>由财务按平台和生效日期维护；历史月份使用当期有效版本。</p></div></div>
        <DataTable minWidth={720} columns={columns} rows={terms} empty={<div className="empty-state compact-empty">尚未维护平台账期，CCC 的应收天数暂不可计算。</div>} />
      </section>
    </div>
  );
}
