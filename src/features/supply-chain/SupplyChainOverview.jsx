import { AlertTriangle, Banknote, Boxes, CircleDollarSign, ShieldAlert } from "lucide-react";
import { DataTable } from "../../ui/DataTable.jsx";

const money = value => `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function SupplyChainOverview({ summary }) {
  const productColumns = [
    { key: "product", header: "产品", render: row => <strong>{row.productName}</strong> },
    { key: "paid", header: "采购实付", render: row => money(row.actualPaid) },
    { key: "cost", header: "已售成本", render: row => money(row.consumedSalesCost) },
    { key: "funds", header: "库存资金", render: row => <strong>{money(row.adjustedInventoryFunds)}</strong> }
  ];
  const alerts = [
    { label: "待映射审批", value: summary.exceptions.unmappedApprovals, Icon: AlertTriangle },
    { label: "待关闭质量问题", value: summary.exceptions.openQualityIssues, Icon: ShieldAlert },
    { label: "待确认盘点调整", value: summary.exceptions.pendingAdjustments, Icon: Boxes }
  ];
  return (
    <div className="supply-work-grid">
      <section className="supply-metric-strip" aria-label="供应链核心金额">
        <div><CircleDollarSign size={18} /><span>采购实付<strong>{money(summary.actualPaid)}</strong></span></div>
        <div><Banknote size={18} /><span>按销量消耗成本<strong>{money(summary.consumedSalesCost)}</strong></span></div>
        <div><Boxes size={18} /><span>原始库存资金<strong>{money(summary.rawInventoryFunds)}</strong></span></div>
        <div><Boxes size={18} /><span>盘点后库存资金<strong>{money(summary.adjustedInventoryFunds)}</strong></span></div>
      </section>
      <section className="section-panel supply-alert-panel">
        <div className="section-head"><div><h2>优先处理</h2><p>先处理影响金额完整性和供应链判断的异常。</p></div></div>
        <div className="supply-alert-list">
          {alerts.map(({ label, value, Icon }) => <div key={label} className={value ? "has-alert" : ""}><Icon size={17} /><span>{label}</span><strong>{value}</strong></div>)}
        </div>
      </section>
      <section className="section-panel supply-overview-table">
        <div className="section-head"><div><h2>产品库存资金</h2><p>库存资金 = 已通过付款实付 − ERP 销售成本 + 已确认盘点调整。</p></div></div>
        <DataTable minWidth={620} columns={productColumns} rows={summary.byProduct} empty={<div className="empty-state compact-empty">还没有可计算的产品数据，请先同步审批并导入销售数据。</div>} />
      </section>
    </div>
  );
}
