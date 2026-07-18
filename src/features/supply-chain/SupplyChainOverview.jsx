import { AlertTriangle, Banknote, Boxes, CircleDollarSign, Database, ShieldAlert } from "lucide-react";
import { DataTable } from "../../ui/DataTable.jsx";

const money = value => `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const quantity = (value, available) => available ? Number(value || 0).toLocaleString("zh-CN") : "—";

export function SupplyChainOverview({ summary }) {
  const productColumns = [
    { key: "product", header: "产品", render: row => <span><strong>{row.productName}</strong><small className="table-secondary">BOM {money(row.bomUnitCost)} / 件</small></span> },
    { key: "paid", header: "审批实付", render: row => money(row.actualPaid) },
    { key: "cost", header: "销量消耗成本", render: row => money(row.consumedSalesCost) },
    { key: "funds", header: "库存资金", render: row => <strong>{money(row.adjustedInventoryFunds)}</strong> },
    { key: "erp", header: "ERP库存", render: row => <span><strong>{quantity(row.erpInventoryQuantity, row.hasErpSnapshot)}</strong><small className="table-secondary">{row.hasErpSnapshot ? money(row.erpInventoryValue) : "暂无快照"}</small></span> },
    { key: "physical", header: "实盘库存", render: row => <span><strong>{quantity(row.physicalInventoryQuantity, row.hasPhysicalSnapshot)}</strong><small className="table-secondary">{row.hasPhysicalSnapshot ? money(row.physicalInventoryValue) : "尚未盘点"}</small></span> },
    { key: "variance", header: "盘点差异", render: row => row.hasErpSnapshot && row.hasPhysicalSnapshot ? <strong className={row.quantityVariance ? "text-warning" : ""}>{row.quantityVariance > 0 ? "+" : ""}{row.quantityVariance}</strong> : "—" }
  ];
  const alerts = [
    { label: "待映射采购", value: summary.exceptions.unmappedApprovals, Icon: AlertTriangle },
    { label: "未关联付款", value: summary.exceptions.unmappedPayments, Icon: Banknote },
    { label: "付款超申请", value: summary.exceptions.overpaidPurchases, Icon: AlertTriangle },
    { label: "付款金额缺失", value: summary.exceptions.missingPaymentAmounts, Icon: Banknote },
    { label: "待关闭质量问题", value: summary.exceptions.openQualityIssues, Icon: ShieldAlert },
    { label: "待确认盘点调整", value: summary.exceptions.pendingAdjustments, Icon: Boxes }
  ];
  return (
    <div className="supply-work-grid">
      <section className="supply-metric-strip" aria-label="供应链核心金额">
        <div><CircleDollarSign size={18} /><span>审批实付<strong>{money(summary.actualPaid)}</strong></span></div>
        <div><Banknote size={18} /><span>按销量消耗成本<strong>{money(summary.consumedSalesCost)}</strong></span></div>
        <div><Boxes size={18} /><span>盘点后库存资金<strong>{money(summary.adjustedInventoryFunds)}</strong></span></div>
        <div><Database size={18} /><span>ERP库存价值<strong>{money(summary.erpInventoryValue)}</strong></span></div>
        <div><Boxes size={18} /><span>实盘库存价值<strong>{money(summary.physicalInventoryValue)}</strong></span></div>
      </section>
      <section className="supply-basis-note">
        <div><strong>现金口径</strong><span>库存资金 = 已通过付款审批实付 − 快麦销量消耗成本 + 已确认盘点调整</span></div>
        <div><strong>货物口径</strong><span>ERP / 实盘库存价值 = 最新数量 × 当前主供 BOM 成本，两套口径并列核对</span></div>
      </section>
      <section className="section-panel supply-alert-panel">
        <div className="section-head"><div><h2>优先处理</h2><p>先处理会导致实付、库存和供应商判断失真的异常。</p></div></div>
        <div className="supply-alert-list">
          {alerts.map(({ label, value, Icon }) => <div key={label} className={value ? "has-alert" : ""}><Icon size={17} /><span>{label}</span><strong>{value}</strong></div>)}
        </div>
      </section>
      <section className="section-panel supply-overview-table">
        <div className="section-head"><div><h2>产品资金与库存核对</h2><p>审批实付回答钱花了多少；ERP库存与实盘库存回答货还剩多少。</p></div></div>
        <DataTable minWidth={1040} columns={productColumns} rows={summary.byProduct} empty={<div className="empty-state compact-empty">还没有可计算的产品数据，请先同步审批并导入快麦销售和库存快照。</div>} />
      </section>
    </div>
  );
}
