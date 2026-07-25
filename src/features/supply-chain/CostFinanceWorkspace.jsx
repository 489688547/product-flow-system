import { useMemo, useState } from "react";
import { classifyFinancialPosition, reconcileFreightCharge } from "../../domain/supplyChainWorkflow.js";
import { useSupplyChain } from "../../state/SupplyChainProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { DataTable } from "../../ui/DataTable.jsx";
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
  canEditTerms = false,
  canRecalculateCcc = false,
  canFreezeCcc = false,
  onSaveTerm,
  onRecalculate,
  onFreeze,
  workflowAvailable = false
}) {
  const { state } = useSupplyChain();
  const [activeTab, setActiveTab] = useState("cycle");
  const [page, setPage] = useState(1);
  const paymentsByPurchase = useMemo(() => {
    const result = new Map();
    state.paymentApprovals.forEach(payment => {
      const key = payment.purchaseProcessInstanceId || "";
      if (!key || !approved(payment.status)) return;
      result.set(key, (result.get(key) || 0) + Number(payment.amount || 0));
    });
    return result;
  }, [state.paymentApprovals]);
  const financeRows = useMemo(() => state.purchaseApprovals.map(purchase => {
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
  }), [paymentsByPurchase, state.purchaseApprovals]);
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
  const freightRows = (state.freightReconciliations || []).map(row => ({
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
    { key: "action", header: "申诉", render: () => <Button className="compact" disabled={!workflowAvailable} disabledReason="DEV-000006 交付后可生成申诉与财务确认记录">发起申诉</Button> }
  ];
  const rowsForActiveTab = activeTab === "payables" ? financeRows : activeTab === "cost" ? costRows : activeTab === "freight" ? freightRows : [];
  const visibleRows = rowsForActiveTab.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  function selectTab(key) {
    setActiveTab(key);
    setPage(1);
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
          <Button variant="primary" disabled={!workflowAvailable} disabledReason="DEV-000006 交付后可上传报价规则和月度结算单">上传报价或账单</Button>
        </div>
        <div className="supply-coverage-notice is-partial" role="status"><span><strong>运费规则与结算事实尚未接通</strong><small>没有理论运费、结算运费和运单证据时不生成“无差异”结论。</small></span></div>
        <DataTable minWidth={920} columns={freightColumns} rows={visibleRows} empty={<div className="empty-state compact-empty">还没有可核对的快递费账单。</div>} />
      </section> : null}
      {rowsForActiveTab.length > PAGE_SIZE ? <TablePagination total={rowsForActiveTab.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} /> : null}
    </div>
  );
}
