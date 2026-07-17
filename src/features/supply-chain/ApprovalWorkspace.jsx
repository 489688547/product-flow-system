import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useSupplyChain } from "../../state/SupplyChainProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { DataTable } from "../../ui/DataTable.jsx";

const money = value => `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const approved = status => ["COMPLETED", "APPROVED", "AGREE"].includes(String(status || "").toUpperCase());

export function ApprovalWorkspace({ canSync }) {
  const { state, syncApprovals } = useSupplyChain();
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const paymentsByPurchase = useMemo(() => {
    const map = new Map();
    state.paymentApprovals.forEach(payment => {
      const id = payment.purchaseProcessInstanceId || "unmapped";
      map.set(id, [...(map.get(id) || []), payment]);
    });
    return map;
  }, [state.paymentApprovals]);
  async function handleSync() {
    setSyncing(true); setError(""); setNotice("");
    try {
      const result = await syncApprovals();
      setNotice(`同步完成：采购申请 ${result.counts?.purchase || 0} 条，付款申请 ${result.counts?.payment || 0} 条。`);
    } catch (event) { setError(event.message || "同步失败。"); }
    finally { setSyncing(false); }
  }
  const rows = state.purchaseApprovals.map(purchase => {
    const payments = paymentsByPurchase.get(purchase.processInstanceId) || [];
    return { ...purchase, id: purchase.id || purchase.processInstanceId, payments, actualPaid: payments.filter(item => approved(item.status)).reduce((sum, item) => sum + Number(item.amount || 0), 0) };
  });
  const columns = [
    { key: "purchase", header: "采购申请", render: row => <span><strong>{row.title || row.processInstanceId}</strong><small className="table-secondary">{row.processInstanceId}</small></span> },
    { key: "status", header: "采购状态", render: row => <span className={`status-badge ${approved(row.status) ? "success" : "warning"}`}>{approved(row.status) ? "已通过" : row.status || "处理中"}</span> },
    { key: "requested", header: "采购金额", render: row => money(row.approvedAmount || row.requestedAmount) },
    { key: "payment", header: "付款申请", render: row => row.payments.length ? <span><strong>{row.payments.length} 笔</strong><small className="table-secondary">{row.payments.map(item => item.processInstanceId).join("、")}</small></span> : <span className="muted">尚未关联付款</span> },
    { key: "paid", header: "已通过实付", render: row => <strong>{money(row.actualPaid)}</strong> },
    { key: "mapping", header: "映射", render: row => row.mappingStatus === "unmapped" ? <span className="status-badge warning">待映射</span> : <span className="status-badge success">已映射</span> }
  ];
  return <section className="section-panel"><div className="section-head"><div><h2>采购申请与付款申请</h2><p>采购申请由部门提出，付款申请由财务执行；一张采购单可自动关联多张付款单。</p></div>{canSync ? <Button variant="primary" disabled={syncing} onClick={handleSync}><RefreshCw size={16} />{syncing ? "同步中…" : "同步钉钉审批"}</Button> : null}</div>{error ? <p className="supply-message error" role="alert">{error}</p> : null}{notice ? <p className="supply-message success" role="status">{notice}</p> : null}<DataTable columns={columns} rows={rows} minWidth={940} empty={<div className="empty-state compact-empty">还没有审批数据，请先在设置中配置两个流程，再同步钉钉审批。</div>} />{paymentsByPurchase.get("unmapped")?.length ? <p className="supply-message warning">有 {paymentsByPurchase.get("unmapped").length} 张付款申请未从钉钉关联审批字段识别到采购单。</p> : null}</section>;
}
