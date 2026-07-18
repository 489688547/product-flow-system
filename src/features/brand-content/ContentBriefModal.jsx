import { useEffect, useMemo, useState } from "react";
import { DatePickerField } from "../../ui/DatePickerField.jsx";
import { Button } from "../../ui/Button.jsx";
import { Modal } from "../../ui/Modal.jsx";
import { OrgSelect } from "../../ui/OrgSelect.jsx";
import { ProductPicker } from "../../ui/ProductPicker.jsx";

const EMPTY = {
  productId: "",
  purpose: "product_sale",
  title: "",
  contentDirection: "",
  brief: "",
  directorName: "",
  editorName: "",
  operatorName: "",
  dueAt: ""
};

function userRecord(orgCache, name) {
  const user = (orgCache?.users || []).find(item => item.name === name);
  return { id: user?.userid || user?.userId || name, name };
}

export function ContentBriefModal({ open, products, currentUser, orgCache, saving, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY);
  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY, productId: products[0]?.id || "" });
  }, [open, products]);
  const product = useMemo(() => products.find(item => item.id === form.productId), [form.productId, products]);
  const set = patch => setForm(current => ({ ...current, ...patch }));
  const missing = !product || !form.title.trim() || !form.contentDirection.trim() || !form.directorName || !form.editorName || !form.operatorName || !form.dueAt;
  const save = () => {
    const director = userRecord(orgCache, form.directorName);
    const editor = userRecord(orgCache, form.editorName);
    const operator = userRecord(orgCache, form.operatorName);
    onSave({
      ...form,
      productName: product.name,
      directorId: director.id,
      editorId: editor.id,
      operatorId: operator.id
    });
  };

  return (
    <Modal
      open={open}
      title="创建内容 Brief"
      onClose={onClose}
      size="wide"
      footer={<>
        <Button onClick={onClose}>取消</Button>
        <Button variant="primary" disabled={missing || saving} disabledReason="请填写产品、标题、方向、主编导、主剪辑、主运营和截止时间" onClick={save}>{saving ? "正在创建…" : "创建任务"}</Button>
      </>}
    >
      {product ? <ProductPicker products={products} value={form.productId} onChange={productId => set({ productId })} currentUser={currentUser} label="选择内容关联产品" /> : <div className="empty-state">产品全周期暂无可选产品，请先建立产品档案。</div>}
      <div className="form-grid brand-brief-grid">
        <label>内容标题<input value={form.title} onChange={event => set({ title: event.target.value })} placeholder="例如：开袋闻香真实反应" /></label>
        <label>内容目的<select value={form.purpose} onChange={event => set({ purpose: event.target.value })}><option value="product_sale">商品转化</option><option value="live_traffic">直播引流</option><option value="brand_content">品牌内容</option></select></label>
        <label>内容方向<input value={form.contentDirection} onChange={event => set({ contentDirection: event.target.value })} placeholder="例如：实验对比、使用场景" /></label>
        <label>截止时间<DatePickerField value={form.dueAt} onChange={dueAt => set({ dueAt })} ariaLabel="选择内容截止时间" /></label>
        <label>主编导<OrgSelect type="user" value={form.directorName} onChange={directorName => set({ directorName })} orgCache={orgCache} placeholder="选择主编导" label="主编导" departmentFilter="品牌" searchInMenu /></label>
        <label>主剪辑<OrgSelect type="user" value={form.editorName} onChange={editorName => set({ editorName })} orgCache={orgCache} placeholder="选择主剪辑" label="主剪辑" departmentFilter="品牌" searchInMenu /></label>
        <label>主运营<OrgSelect type="user" value={form.operatorName} onChange={operatorName => set({ operatorName })} orgCache={orgCache} placeholder="选择主运营" label="主运营" searchInMenu /></label>
      </div>
      <label className="full-field">Brief<textarea rows="4" value={form.brief} onChange={event => set({ brief: event.target.value })} placeholder="说明目标人群、核心问题、必须表达的卖点和不应出现的承诺。" /></label>
    </Modal>
  );
}
