import { useMemo, useState } from "react";
import { classifyFinancialPosition, reconcileFreightCharge } from "../../domain/supplyChainWorkflow.js";
import { useSupplyChain } from "../../state/SupplyChainProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { DataTable } from "../../ui/DataTable.jsx";
import { Modal } from "../../ui/Modal.jsx";
import { TablePagination } from "../../ui/TablePagination.jsx";
import { CashCycleWorkspace } from "./CashCycleWorkspace.jsx";

const TABS = [
  ["cycle", "现金循环"],
  ["payables", "应收应付"],
  ["cost", "报价与成本"],
  ["freight", "快递费核对"]
];

const money = value => value === null || value === undefined
  ? "待数据"
  : `¥${Number(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const approved = status => ["COMPLETED", "APPROVED", "AGREE"].includes(String(status || "").toUpperCase());
const PAGE_SIZE = 30;

export function CostFinanceWorkspace({
  dashboard,
  terms = [],
  summary,
  purchases = [],
  payments = [],
  canEditTerms = false,
  canRecalculateCcc = false,
  canFreezeCcc = false,
  onSaveTerm,
  onRecalculate,
  onFreeze,
  workflow
}) {
  const { state } = useSupplyChain();
  const [activeTab, setActiveTab] = useState("cycle");
  const [page, setPage] = useState(1);
  const [freightOpen, setFreightOpen] = useState(false);
  const [freightForm, setFreightForm] = useState({ month: "", providerName: "", theoreticalAmount: "", billedAmount: "" });
  const workflowAvailable = workflow?.resourceAvailable?.("freight-reconciliations") === true;
  const effectivePurchases = purchases.length ? purchases : state.purchaseApprovals;
  const effectivePayments = payments.length ? payments : state.paymentApprovals;
  const workflowFreight = workflow?.workflows?.["freight-reconciliations"]?.items || [];
  const paymentsByPurchase = useMemo(() => {
    const result = new Map();
    effectivePayments.forEach(payment => {
      const key = payment.purchaseId || payment.purchaseProcessInstanceId || "";
      if (!key || !approved(payment.status)) return;
      result.set(key, (result.get(key) || 0) + Number(payment.amount || 0));
    });
    return result;
  }, [effectivePayments]);
  const financeRows = useMemo(() => effectivePurchases.map(purchase => {
    const purchaseId = purchase.purchaseId || purchase.processInstanceId || purchase.id;
    const paidAmount = paymentsByPurchase.has(purchaseId) ? paymentsByPurchase.get(purchaseId) : null;
    return {
      ...purchase,
      id: purchaseId,
      position: classifyFinancialPosition({
        orderedAmount: purchase.approvedAmount ?? purchase.requestedAmount,
        paidAmount,
        receivedAmount: purchase.receivedAmount
      })
    };
  }), [effectivePurchases, paymentsByPurchase]);
  const financeColumns = [
    { key: "purchase", header: "采购单", render: row => <span><strong>{row.title || row.reason || row.id}</strong><small className="table-secondary">{row.id}</small></span> },
    { key: "ordered", header: <span className="num">采购金额</span>, render: row => <span className="num">{money(row.position.orderedAmount)}</span> },
    { key: "paid", header: <span className="num">已付</span>, render: row => <span className="num">{money(row.position.paidAmount)}</span> },
    { key: "received", header: <span className="num">已收货</span>, render: row => <span className="num">{money(row.position.receivedAmount)}</span> },
    { key: "receivable", header: <span className="num">已付款未交货</span>, render: row => <span className="num"><strong>{money(row.position.inTransitAsset)}</strong><small className="table-secondary">在途资产</small></span> },
    { key: "payable", header: <span className="num">已下单未付款</span>, render: row => <span className="num"><strong>{money(row.position.payable)}</strong><small className="table-secondary">应付负债</small></span> },
    { key: "coverage", header: "核对状态", render: row => row.position.status === "complete"
      ? <span className="status-badge success">事实完整</span>
      : <span><span className="status-badge warning">待核对</span><small className="table-secondary">{row.position.missing.join("、")}</small></span> }
  ];
  const costRows = summary?.byProduct || [];
  const costColumns = [
    { key: "product", header: "产品", render: row => <strong>{row.productName || row.name || row.productId}</strong> },
    { key: "bom", header: <span className="num">BOM 成本</span>, render: row => <span className="num">{row.hasBomCostEvidence ? money(row.bomUnitCost) : "成本待补齐"}</span> },
    { key: "sales", header: <span className="num">销售成本</span>, render: row => <span className="num">{row.hasSalesCostEvidence ? money(row.consumedSalesCost) : "待销售成本"}</span> },
    { key: "funds", header: <span className="num">库存资金</span>, render: row => <span className="num">{row.hasInventoryFundsEvidence ? money(row.adjustedInventoryFunds) : "待库存事实"}</span> },
    { key: "history", header: "历史价格", render: () => <span><strong>待数据中心补齐</strong><small className="table-secondary">价格版本、比价与涨价幅度不从当前价猜测</small></span> }
  ];
  const freightRows = [
    ...(state.freightReconciliations || []),
    ...workflowFreight.map(entity => ({ id: entity.id, ...entity.fields, status: entity.status, workflowEntity: entity }))
  ].map(row => ({
    ...row,
    result: reconcileFreightCharge(row)
  }));
  const freightColumns = [
    { key: "month", header: "账单月份", render: row => row.month || row.period || "—" },
    { key: "provider", header: "快递公司", render: row => row.providerName || "待关联供应商" },
    { key: "theoretical", header: <span className="num">理论运费</span>, render: row => <span className="num">{money(row.result.theoreticalAmount)}</span> },
    { key: "billed", header: <span className="num">结算运费</span>, render: row => <span className="num">{money(row.result.billedAmount)}</span> },
    { key: "difference", header: <span className="num">差异</span>, render: row => <span className="num">{money(row.result.differenceAmount)}</span> },
    { key: "status", header: "结论", render: row => <span className={`status-badge ${row.result.status === "matched" ? "success" : "warning"}`}>{row.result.status === "dispute" ? "建议申诉" : row.result.status === "review" ? "需复核" : "核对一致"}</span> },
    { key: "action", header: "申诉", render: row => <Button className="compact" disabled={!workflowAvailable || !row.workflowEntity || !["pending", "reconciled"].includes(row.workflowEntity.status) || Boolean(workflow?.busy)} disabledReason={!workflowAvailable ? "运费核对服务暂不可用" : !row.workflowEntity ? "旧记录需先迁移为版本化核对单" : "当前状态不能发起申诉"} onClick={() => disputeFreight(row)}>发起申诉</Button> }
  ];
  const rowsForActiveTab = activeTab === "payables" ? financeRows : activeTab === "cost" ? costRows : activeTab === "freight" ? freightRows : [];
  const visibleRows = rowsForActiveTab.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  function selectTab(key) {
    setActiveTab(key);
    setPage(1);
  }

  async function saveFreight() {
    if (!freightForm.month || !freightForm.providerName.trim()) return;
    try {
      await workflow.create({
        resource: "freight-reconciliations",
        id: `freight-reconciliation:${freightForm.month}:${Date.now()}`,
        fields: {
          month: freightForm.month,
          providerName: freightForm.providerName.trim(),
          theoreticalAmount: freightForm.theoreticalAmount === "" ? null : Number(freightForm.theoreticalAmount),
          billedAmount: freightForm.billedAmount === "" ? null : Number(freightForm.billedAmount)
        }
      });
      setFreightOpen(false);
      setFreightForm({ month: "", providerName: "", theoreticalAmount: "", billedAmount: "" });
    } catch {
      // The page-level workflow notice presents the safe error and request ID.
    }
  }

  async function disputeFreight(row) {
    try {
      await workflow.act({
        resource: "freight-reconciliations",
        id: row.workflowEntity.id,
        action: "dispute",
        expectedVersion: row.workflowEntity.version,
        reason: `理论运费与结算运费差异 ${row.result.differenceAmount ?? "待核对"}`
      });
    } catch {
      // The page-level workflow notice presents the safe error and request ID.
    }
  }

  return (
    <div className="supply-cost-finance">
      <div className="supply-workspace-tabs" role="tablist" aria-label="成本与财务工作区">
        {TABS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={activeTab === key} className={activeTab === key ? "is-active" : ""} onClick={() => selectTab(key)}>{label}</button>)}
      </div>
      {activeTab === "cycle" ? (
        <CashCycleWorkspace dashboard={dashboard} terms={terms} canEditTerms={canEditTerms} canRecalculateCcc={canRecalculateCcc} canFreezeCcc={canFreezeCcc} onSaveTerm={onSaveTerm} onRecalculate={onRecalculate} onFreeze={onFreeze} />
      ) : null}
      {activeTab === "payables" ? <section className="section-panel">
        <div className="section-head"><div><h2>采购应收应付</h2><p>采购与付款保持独立，以采购单稳定关联；已付款未交货计在途资产，已下单未付款计应付负债。</p></div></div>
        <DataTable minWidth={1120} columns={financeColumns} rows={visibleRows} empty={<div className="empty-state compact-empty">还没有可核对的采购付款事实。</div>} />
      </section> : null}
      {activeTab === "cost" ? <section className="section-panel">
        <div className="section-head"><div><h2>报价与成本</h2><p>历史价格、供应商报价、BOM 成本与利润预警分开保留；缺成本时不按 0 计算。</p></div></div>
        <DataTable minWidth={920} columns={costColumns} rows={visibleRows} empty={<div className="empty-state compact-empty">没有可展示的产品成本事实。</div>} />
      </section> : null}
      {activeTab === "freight" ? <section className="section-panel">
        <div className="section-head">
          <div><h2>快递费核对</h2><p>按版本化报价规则计算理论运费，与月度结算运费逐单比较并保留差异证据。</p></div>
          <Button variant="primary" disabled={!workflowAvailable} disabledReason="运费核对服务暂不可用" onClick={() => setFreightOpen(true)}>新增月度账单</Button>
        </div>
        <div className="supply-coverage-notice is-partial" role="status"><span><strong>运费规则按版本保存，差异按月核对</strong><small>没有理论运费、结算运费和运单证据时不生成“无差异”结论。</small></span></div>
        <DataTable minWidth={920} columns={freightColumns} rows={visibleRows} empty={<div className="empty-state compact-empty">还没有可核对的快递费账单。</div>} />
      </section> : null}
      {rowsForActiveTab.length > PAGE_SIZE ? <TablePagination total={rowsForActiveTab.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} /> : null}
      <Modal
        open={freightOpen}
        title="新增月度快递账单"
        onClose={() => setFreightOpen(false)}
        footer={<><Button onClick={() => setFreightOpen(false)}>取消</Button><Button variant="primary" disabled={!freightForm.month || !freightForm.providerName.trim() || Boolean(workflow?.busy)} onClick={saveFreight}>{workflow?.busy ? "保存中…" : "保存账单"}</Button></>}
      >
        <div className="form-grid supply-form-grid">
          <label>账单月份<input type="month" value={freightForm.month} onChange={event => setFreightForm(current => ({ ...current, month: event.target.value }))} /></label>
          <label>快递公司<input value={freightForm.providerName} onChange={event => setFreightForm(current => ({ ...current, providerName: event.target.value }))} /></label>
          <label>理论运费<input type="number" min="0" step="0.01" value={freightForm.theoreticalAmount} onChange={event => setFreightForm(current => ({ ...current, theoreticalAmount: event.target.value }))} /></label>
          <label>结算运费<input type="number" min="0" step="0.01" value={freightForm.billedAmount} onChange={event => setFreightForm(current => ({ ...current, billedAmount: event.target.value }))} /></label>
        </div>
      </Modal>
    </div>
  );
}
