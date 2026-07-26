import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useSupplyChain } from "../../state/SupplyChainProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { DataTable, TableActions } from "../../ui/DataTable.jsx";
import { Modal } from "../../ui/Modal.jsx";
import { TablePagination } from "../../ui/TablePagination.jsx";

const money = value => `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PAGE_SIZE = 30;
const approved = status => ["COMPLETED", "APPROVED", "AGREE"].includes(String(status || "").toUpperCase());
const mappingStatus = row => {
  const supplierMapped = Boolean(row.supplierId);
  const productMapped = Boolean(row.productIds?.length);
  if (supplierMapped && productMapped) return { label: "已映射", tone: "success" };
  if (supplierMapped) return { label: "供应商已关联 · 产品待关联", tone: "warning" };
  if (productMapped) return { label: "产品已关联 · 供应商待关联", tone: "warning" };
  return { label: "供应商与产品待关联", tone: "warning" };
};

export function ApprovalWorkspace({ canSync, canEditMapping, products, purchases = [], payments = [], workflow }) {
  const { state, dispatch, syncApprovals } = useSupplyChain();
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [mappingRecord, setMappingRecord] = useState(null);
  const [page, setPage] = useState(1);
  const [mappingSelection, setMappingSelection] = useState({ supplierId: "", productId: "" });
  const [linkingPayment, setLinkingPayment] = useState(null);
  const [linkPurchaseId, setLinkPurchaseId] = useState("");
  const effectivePurchases = purchases.length ? purchases : state.purchaseApprovals;
  const effectivePayments = payments.length ? payments : state.paymentApprovals;
  const paymentLinkAvailable = workflow?.resourceAvailable?.("purchase-payment-links") === true;
  const workflowLinks = workflow?.workflows?.["purchase-payment-links"]?.items || [];
  const paymentsByPurchase = useMemo(() => {
    const map = new Map();
    effectivePayments.forEach(payment => {
      const id = payment.purchaseId || payment.purchaseProcessInstanceId || "unmapped";
      map.set(id, [...(map.get(id) || []), payment]);
    });
    return map;
  }, [effectivePayments]);
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
  const rows = effectivePurchases.map(purchase => {
    const purchaseId = purchase.purchaseId || purchase.processInstanceId || purchase.id;
    const linkedPayments = paymentsByPurchase.get(purchaseId) || [];
    const actualPaid = linkedPayments.filter(item => approved(item.status)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const requestedAmount = Number(purchase.approvedAmount || purchase.requestedAmount || 0);
    return { ...purchase, id: purchaseId, payments: linkedPayments, actualPaid, requestedAmount, overpaid: requestedAmount > 0 && actualPaid > requestedAmount + 0.01 };
  });
  const overpaidCount = rows.filter(row => row.overpaid).length;
  const visibleRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const columns = [
    { key: "purchase", header: "采购申请", render: row => <span><strong>{row.reason || row.title || "未填写事由"}</strong><small className="table-secondary">{row.businessCategory || row.processInstanceId}</small></span> },
    { key: "status", header: "采购状态", render: row => <span className={`status-badge ${approved(row.status) ? "success" : "warning"}`}>{approved(row.status) ? "已通过" : row.status || "处理中"}</span> },
    { key: "requested", header: <span className="num">申请金额</span>, render: row => <span className="num">{money(row.requestedAmount)}</span> },
    { key: "payment", header: "付款审批", render: row => row.payments.length ? <span><strong>{row.payments.filter(item => approved(item.status)).length} / {row.payments.length} 笔通过</strong><small className="table-secondary">{row.payments.some(item => item.amountSource === "related-purchase") ? "金额读取自关联采购单" : "金额读取自付款表单"}</small></span> : <span className="muted">尚未关联付款</span> },
    { key: "paid", header: <span className="num">审批实付</span>, render: row => <span className="num"><strong>{money(row.actualPaid)}</strong>{row.overpaid ? <small className="table-secondary text-warning">付款超申请</small> : null}</span> },
    { key: "mapping", header: "映射", render: row => { const status = mappingStatus(row); return <span className={`status-badge ${status.tone}`}>{status.label}</span>; } },
    { key: "actions", header: "操作", render: row => canEditMapping && row.mappingStatus === "unmapped" ? <TableActions><Button className="compact" onClick={() => openMapping(row)}>处理映射</Button></TableActions> : "—" }
  ];
  const unmappedPayments = paymentsByPurchase.get("unmapped") || [];

  async function savePaymentLink() {
    if (!linkingPayment || !linkPurchaseId) return;
    const paymentId = linkingPayment.paymentId || linkingPayment.processInstanceId || linkingPayment.id;
    try {
      const existing = workflowLinks.find(entity => String(entity.fields?.paymentId || "") === String(paymentId));
      let entity = existing;
      if (!entity) {
        const created = await workflow.create({
          resource: "purchase-payment-links",
          id: `purchase-payment-link:${paymentId}`,
          fields: {
            purchaseId: linkPurchaseId,
            paymentId,
            purchaseApprovalInstanceId: effectivePurchases.find(item => String(item.purchaseId || item.processInstanceId || item.id) === String(linkPurchaseId))?.processInstanceId || null,
            paymentApprovalInstanceId: linkingPayment.processInstanceId || null
          }
        });
        entity = created.entity;
      }
      if (entity.status === "unlinked") {
        await workflow.act({
          resource: "purchase-payment-links",
          id: entity.id,
          action: "link",
          expectedVersion: entity.version,
          reason: "财务确认采购与付款关联",
          fields: { purchaseId: linkPurchaseId, paymentId }
        });
      }
      setLinkingPayment(null);
      setLinkPurchaseId("");
    } catch {
      // The page-level workflow notice presents the safe error and request ID.
    }
  }
  return (
    <section className="supply-flat-workspace">
      {canSync ? (
        <div className="supply-workspace-toolbar">
          <Button variant="primary" disabled={syncing} onClick={handleSync}>
            <RefreshCw size={16} />
            {syncing ? "同步中…" : "同步钉钉审批"}
          </Button>
        </div>
      ) : null}
      {error ? <p className="supply-message error" role="alert">{error}</p> : null}
      {notice ? <p className="supply-message success" role="status">{notice}</p> : null}
      <DataTable columns={columns} rows={visibleRows} minWidth={1080} empty={<div className="empty-state compact-empty">还没有审批数据。已预置真实采购申请和付款审批流程，可直接同步最近 30 天。</div>} />
      {rows.length > PAGE_SIZE ? <TablePagination total={rows.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} /> : null}
      {overpaidCount ? <p className="supply-message warning">有 {overpaidCount} 张采购申请出现付款超申请，请财务核对是否为重复关联或分次付款口径。</p> : null}
      {paymentsByPurchase.get("unmapped")?.length ? <p className="supply-message warning">有 {paymentsByPurchase.get("unmapped").length} 张付款审批未从钉钉关联审批字段识别到采购单。</p> : null}
      {unmappedPayments.length ? <section className="supply-coverage-notice is-partial" role="status"><span><strong>{unmappedPayments.length} 张付款待关联采购单</strong><small>采购与付款保持独立，财务确认后以稳定 purchaseId / paymentId 建立关联。</small></span>{canEditMapping ? <Button disabled={!paymentLinkAvailable} disabledReason="采购付款关联服务暂不可用" onClick={() => { setLinkingPayment(unmappedPayments[0]); setLinkPurchaseId(""); }}>处理第一张</Button> : null}</section> : null}
      <Modal
        title="处理采购审批映射"
        open={Boolean(mappingRecord)}
        onClose={() => setMappingRecord(null)}
        footer={<>
          <Button onClick={() => setMappingRecord(null)}>取消</Button>
          <Button variant="primary" disabled={!mappingSelection.supplierId || !mappingSelection.productId} onClick={saveMapping}>确认映射</Button>
        </>}
      >
        <div className="form-grid supply-form-grid">
          <label>采购事由<input value={mappingRecord?.reason || mappingRecord?.title || "—"} disabled /></label>
          <label>系统供应商<select value={mappingSelection.supplierId} onChange={event => setMappingSelection(current => ({ ...current, supplierId: event.target.value }))}><option value="">请选择</option>{state.suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
          <label>钉钉产品值<input value={mappingRecord?.unmappedValues?.product || "未在审批中指定"} disabled /></label>
          <label>系统产品<select value={mappingSelection.productId} onChange={event => setMappingSelection(current => ({ ...current, productId: event.target.value }))}><option value="">请选择</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
        </div>
      </Modal>
      <Modal
        title="关联采购与付款"
        open={Boolean(linkingPayment)}
        onClose={() => setLinkingPayment(null)}
        footer={<><Button onClick={() => setLinkingPayment(null)}>取消</Button><Button variant="primary" disabled={!linkPurchaseId || Boolean(workflow?.busy)} onClick={savePaymentLink}>{workflow?.busy ? "保存中…" : "确认关联"}</Button></>}
      >
        <div className="form-grid supply-form-grid">
          <label>付款单<input value={linkingPayment?.title || linkingPayment?.processInstanceId || linkingPayment?.id || "—"} disabled /></label>
          <label>采购单<select value={linkPurchaseId} onChange={event => setLinkPurchaseId(event.target.value)}><option value="">请选择采购单</option>{effectivePurchases.map(purchase => { const id = purchase.purchaseId || purchase.processInstanceId || purchase.id; return <option key={id} value={id}>{purchase.title || purchase.reason || id}</option>; })}</select></label>
        </div>
      </Modal>
    </section>
  );
}
