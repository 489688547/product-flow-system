import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useSupplyChain } from "../../state/SupplyChainProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { DataTable, TableActions } from "../../ui/DataTable.jsx";
import { Modal } from "../../ui/Modal.jsx";

const money = value => `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const approved = status => ["COMPLETED", "APPROVED", "AGREE"].includes(String(status || "").toUpperCase());

export function ApprovalWorkspace({ canSync, canEditMapping, products }) {
  const { state, dispatch, syncApprovals } = useSupplyChain();
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [mappingRecord, setMappingRecord] = useState(null);
  const [mappingSelection, setMappingSelection] = useState({ supplierId: "", productId: "" });
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
  function openMapping(record) {
    setMappingRecord(record);
    setMappingSelection({ supplierId: record.supplierId || "", productId: record.productIds?.[0] || "" });
  }
  function saveMapping() {
    if (!mappingRecord || !mappingSelection.supplierId || !mappingSelection.productId) return;
    const purchaseMapping = state.settings.fieldMappings?.purchase || {};
    const supplierValue = mappingRecord.unmappedValues?.supplier;
    const productValue = mappingRecord.unmappedValues?.product;
    dispatch({ type: "batch", actions: [
      { type: "upsert", collection: "purchaseApprovals", record: { ...mappingRecord, supplierId: mappingSelection.supplierId, productIds: [mappingSelection.productId], mappingStatus: "mapped", mappedAt: new Date().toISOString() } },
      { type: "settings", settings: { ...state.settings, fieldMappings: { ...state.settings.fieldMappings, purchase: { ...purchaseMapping, supplierValueMap: { ...(purchaseMapping.supplierValueMap || {}), ...(supplierValue ? { [supplierValue]: mappingSelection.supplierId } : {}) }, productValueMap: { ...(purchaseMapping.productValueMap || {}), ...(productValue ? { [productValue]: mappingSelection.productId } : {}) } } } } }
    ] });
    setMappingRecord(null);
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
    { key: "mapping", header: "映射", render: row => row.mappingStatus === "unmapped" ? <span className="status-badge warning">待映射</span> : <span className="status-badge success">已映射</span> },
    { key: "actions", header: "操作", render: row => canEditMapping && row.mappingStatus === "unmapped" ? <TableActions><Button className="compact" onClick={() => openMapping(row)}>处理映射</Button></TableActions> : "—" }
  ];
  return <section className="section-panel"><div className="section-head"><div><h2>采购申请与付款申请</h2><p>采购申请由部门提出，付款申请由财务执行；一张采购单可自动关联多张付款单。</p></div>{canSync ? <Button variant="primary" disabled={syncing} onClick={handleSync}><RefreshCw size={16} />{syncing ? "同步中…" : "同步钉钉审批"}</Button> : null}</div>{error ? <p className="supply-message error" role="alert">{error}</p> : null}{notice ? <p className="supply-message success" role="status">{notice}</p> : null}<DataTable columns={columns} rows={rows} minWidth={1040} empty={<div className="empty-state compact-empty">还没有审批数据，请先在设置中配置两个流程，再同步钉钉审批。</div>} />{paymentsByPurchase.get("unmapped")?.length ? <p className="supply-message warning">有 {paymentsByPurchase.get("unmapped").length} 张付款申请未从钉钉关联审批字段识别到采购单。</p> : null}<Modal title="处理采购审批映射" open={Boolean(mappingRecord)} onClose={() => setMappingRecord(null)} footer={<><Button onClick={() => setMappingRecord(null)}>取消</Button><Button variant="primary" disabled={!mappingSelection.supplierId || !mappingSelection.productId} onClick={saveMapping}>确认映射</Button></>}><div className="form-grid supply-form-grid"><label>钉钉供应商值<input value={mappingRecord?.unmappedValues?.supplier || "已识别"} disabled /></label><label>系统供应商<select value={mappingSelection.supplierId} onChange={event => setMappingSelection(current => ({ ...current, supplierId: event.target.value }))}><option value="">请选择</option>{state.suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label>钉钉产品值<input value={mappingRecord?.unmappedValues?.product || "已识别"} disabled /></label><label>系统产品<select value={mappingSelection.productId} onChange={event => setMappingSelection(current => ({ ...current, productId: event.target.value }))}><option value="">请选择</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label></div></Modal></section>;
}
