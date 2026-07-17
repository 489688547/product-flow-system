import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useSupplyChain } from "../../state/SupplyChainProvider.jsx";
import { Button, IconAction } from "../../ui/Button.jsx";
import { DataTable, TableActions } from "../../ui/DataTable.jsx";
import { Modal } from "../../ui/Modal.jsx";

const EMPTY = { productId: "", supplierId: "", category: "包材", materialName: "", unitCost: "", consumptionPerSale: "1", status: "active" };

export function ProductSupplyWorkspace({ products, canEdit }) {
  const { state, dispatch } = useSupplyChain();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const productMap = useMemo(() => new Map(products.map(item => [item.id, item])), [products]);
  const supplierMap = useMemo(() => new Map(state.suppliers.map(item => [item.id, item])), [state.suppliers]);
  function save() {
    if (!form.productId || !form.supplierId) return;
    dispatch({ type: "upsert", collection: "productSupplierLinks", record: { ...form, id: `product-supplier-${Date.now()}`, unitCost: Number(form.unitCost || 0), consumptionPerSale: Number(form.consumptionPerSale || 0) } });
    setOpen(false); setForm(EMPTY);
  }
  const columns = [
    { key: "product", header: "产品", render: row => <strong>{productMap.get(row.productId)?.name || "未找到产品"}</strong> },
    { key: "category", header: "供应类别", render: row => row.category },
    { key: "material", header: "物料", render: row => row.materialName || "—" },
    { key: "supplier", header: "供应商", render: row => supplierMap.get(row.supplierId)?.name || "待映射" },
    { key: "cost", header: "单位成本", render: row => `¥${Number(row.unitCost || 0).toFixed(2)}` },
    { key: "usage", header: "单件用量", render: row => Number(row.consumptionPerSale || 0).toLocaleString("zh-CN") },
    { key: "actions", header: "操作", render: row => canEdit ? <TableActions><IconAction className="danger" label="删除供应关系" onClick={() => dispatch({ type: "remove", collection: "productSupplierLinks", id: row.id })}><Trash2 size={15} /></IconAction></TableActions> : "—" }
  ];
  return <section className="section-panel"><div className="section-head"><div><h2>产品供应链</h2><p>按产品维护包材、里料、原料和加工供应商，用于成本分摊与质量追溯。</p></div>{canEdit ? <Button variant="primary" onClick={() => setOpen(true)}><Plus size={16} />关联供应商</Button> : null}</div><DataTable columns={columns} rows={state.productSupplierLinks} minWidth={860} empty={<div className="empty-state compact-empty">还没有产品供应关系。</div>} /><Modal title="关联产品供应商" open={open} onClose={() => setOpen(false)} footer={<><Button onClick={() => setOpen(false)}>取消</Button><Button variant="primary" disabled={!form.productId || !form.supplierId} onClick={save}>保存</Button></>}><div className="form-grid supply-form-grid"><label>产品<select value={form.productId} onChange={event => setForm(current => ({ ...current, productId: event.target.value }))}><option value="">请选择</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label>供应商<select value={form.supplierId} onChange={event => setForm(current => ({ ...current, supplierId: event.target.value }))}><option value="">请选择</option>{state.suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label>类别<select value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value }))}><option>包材</option><option>里料</option><option>原料</option><option>加工</option></select></label><label>物料名称<input value={form.materialName} onChange={event => setForm(current => ({ ...current, materialName: event.target.value }))} /></label><label>单位成本<input type="number" min="0" step="0.01" value={form.unitCost} onChange={event => setForm(current => ({ ...current, unitCost: event.target.value }))} /></label><label>每销售一件用量<input type="number" min="0" step="0.001" value={form.consumptionPerSale} onChange={event => setForm(current => ({ ...current, consumptionPerSale: event.target.value }))} /></label></div></Modal></section>;
}
