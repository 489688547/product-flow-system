import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button, IconAction } from "../../ui/Button.jsx";
import { DataTable, TableActions } from "../../ui/DataTable.jsx";
import { Modal } from "../../ui/Modal.jsx";
import { useSupplyChain } from "../../state/SupplyChainProvider.jsx";

const money = value => `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const EMPTY_FORM = { name: "", code: "", category: "原料", contactName: "", contactPhone: "", paymentTerms: "", status: "active" };

export function SupplierWorkspace({ summary, canEdit }) {
  const { state, dispatch } = useSupplyChain();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const summaryBySupplier = new Map(summary.bySupplier.map(item => [item.supplierId, item]));
  function open(record = null) {
    setModalOpen(true);
    setEditing(record);
    setForm(record ? { ...EMPTY_FORM, ...record } : EMPTY_FORM);
  }
  function save() {
    if (!form.name.trim()) return;
    dispatch({ type: "upsert", collection: "suppliers", record: { ...form, id: editing?.id || `supplier-${Date.now()}` } });
    setEditing(null); setModalOpen(false); setForm(EMPTY_FORM);
  }
  const columns = [
    { key: "name", header: "供应商", render: row => <span><strong>{row.name}</strong><small className="table-secondary">{row.code || "未设置编码"}</small></span> },
    { key: "category", header: "类别", render: row => row.category || "—" },
    { key: "contact", header: "联系人", render: row => [row.contactName, row.contactPhone].filter(Boolean).join(" · ") || "—" },
    { key: "payment", header: "账期", render: row => row.paymentTerms || "—" },
    { key: "paid", header: "累计实付", render: row => money(summaryBySupplier.get(row.id)?.actualPaid) },
    { key: "funds", header: "库存资金", render: row => money(summaryBySupplier.get(row.id)?.adjustedInventoryFunds) },
    { key: "status", header: "合作状态", render: row => <span className={`status-badge ${row.status === "inactive" ? "neutral" : "success"}`}>{row.status === "inactive" ? "暂停合作" : "合作中"}</span> },
    { key: "actions", header: "操作", render: row => canEdit ? <TableActions><IconAction label="编辑供应商" onClick={() => open(row)}><Pencil size={15} /></IconAction></TableActions> : "—" }
  ];
  return (
    <section className="section-panel">
      <div className="section-head"><div><h2>供应商档案</h2><p>统一维护类别、联系人、账期、合作状态和资金表现。</p></div>{canEdit ? <Button variant="primary" onClick={() => open()}><Plus size={16} />新增供应商</Button> : null}</div>
      <DataTable columns={columns} rows={state.suppliers} minWidth={980} empty={<div className="empty-state compact-empty">还没有供应商，新增后即可关联产品和采购审批。</div>} />
      <Modal title={editing ? "编辑供应商" : "新增供应商"} open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); setForm(EMPTY_FORM); }} footer={<><Button onClick={() => { setModalOpen(false); setEditing(null); setForm(EMPTY_FORM); }}>取消</Button><Button variant="primary" disabled={!form.name.trim()} onClick={save}>保存</Button></>}>
        <div className="form-grid supply-form-grid">
          <label>供应商名称<input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></label>
          <label>供应商编码<input value={form.code} onChange={event => setForm(current => ({ ...current, code: event.target.value }))} /></label>
          <label>供应商类别<select value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value }))}><option>包材</option><option>里料</option><option>原料</option><option>加工</option></select></label>
          <label>合作状态<select value={form.status} onChange={event => setForm(current => ({ ...current, status: event.target.value }))}><option value="active">合作中</option><option value="inactive">暂停合作</option></select></label>
          <label>联系人<input value={form.contactName} onChange={event => setForm(current => ({ ...current, contactName: event.target.value }))} /></label>
          <label>联系电话<input value={form.contactPhone} onChange={event => setForm(current => ({ ...current, contactPhone: event.target.value }))} /></label>
          <label className="full">账期<input value={form.paymentTerms} placeholder="例如：月结 30 天" onChange={event => setForm(current => ({ ...current, paymentTerms: event.target.value }))} /></label>
        </div>
      </Modal>
    </section>
  );
}
