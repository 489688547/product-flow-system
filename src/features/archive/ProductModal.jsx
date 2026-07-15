import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { isSalesBarcode } from "../../domain/salesData.js";
import { Button, IconAction } from "../../ui/Button.jsx";
import { Modal } from "../../ui/Modal.jsx";
import { OrgSelect } from "../../ui/OrgSelect.jsx";
import { RichTextEditor } from "../../ui/RichTextEditor.jsx";

export function ProductModal({ open, product, orgCache, onClose, onSave }) {
  const [form, setForm] = useState(product || {});
  useEffect(() => setForm(product || {}), [product, open]);
  if (!product) return null;
  const set = patch => setForm(current => ({ ...current, ...patch }));
  const readCover = file => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set({ image: reader.result });
    reader.readAsDataURL(file);
  };

  return (
    <Modal
      open={open}
      title="编辑产品档案"
      onClose={onClose}
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={() => onSave(form)}>保存</Button></>}
    >
      <div className="product-modal-layout">
        <div className="cover-field">
          <span>封面图片</span>
          <label className="cover-editable" title="更换封面图片">
            <img src={form.image || product.image} alt={`${form.name || product.name}封面`} width="160" height="160" />
            <span className="cover-edit-overlay" aria-hidden="true"><ImagePlus size={22} /></span>
            <input type="file" accept="image/*" onChange={event => { readCover(event.target.files?.[0]); event.target.value = ""; }} />
          </label>
        </div>
        <div className="form-grid">
          <label>产品名称<input name="product-name" autoComplete="off" value={form.name || ""} onChange={event => set({ name: event.target.value })} /></label>
          <label>产品等级<div className="readonly-field"><strong>{form.level || "待立项确认"}</strong><span>在产品进度的立项评分中确定</span></div></label>
          <label>提需人<OrgSelect type="user" value={form.requester || ""} onChange={requester => set({ requester })} orgCache={orgCache} placeholder="选择提需人…" /></label>
          <label>产品经理<OrgSelect type="user" value={form.productManager || ""} onChange={productManager => set({ productManager })} orgCache={orgCache} departmentFilter="产品" placeholder="选择产品经理…" /></label>
          <label>来源部门<OrgSelect type="department" value={form.source || ""} onChange={source => set({ source })} orgCache={orgCache} /></label>
        </div>
      </div>
      <div className="full-field sku-code-field">
        <span>SKU 69码与定价<small>填写69码后，产品档案里可点击查看销售数据；定价用于计算营销费用（定价×净销量−净销售额）。</small></span>
        {(form.skuCodes || []).map((item, index) => {
          const codeText = String(item.code || "");
          const invalid = codeText && !isSalesBarcode(codeText);
          return (
            <div className="sku-code-row" key={index}>
              <input
                aria-label={`第${index + 1}个69码`}
                placeholder="69开头的商品条码"
                inputMode="numeric"
                value={codeText}
                className={invalid ? "input-invalid" : ""}
                onChange={event => set({ skuCodes: form.skuCodes.map((current, at) => at === index ? { ...current, code: event.target.value.trim() } : current) })}
              />
              <input
                aria-label={`第${index + 1}个69码定价`}
                placeholder="定价（元）"
                type="number"
                min="0"
                step="0.01"
                value={item.price ?? ""}
                onChange={event => set({ skuCodes: form.skuCodes.map((current, at) => at === index ? { ...current, price: event.target.value } : current) })}
              />
              <IconAction label={`删除第${index + 1}个69码`} className="danger" onClick={() => set({ skuCodes: form.skuCodes.filter((current, at) => at !== index) })}><Trash2 size={16} /></IconAction>
              {invalid ? <em className="sku-code-error">69码需为69开头的12-14位数字</em> : null}
            </div>
          );
        })}
        <Button className="compact" onClick={() => set({ skuCodes: [...(form.skuCodes || []), { code: "", price: "" }] })}><Plus size={16} />添加69码</Button>
      </div>
      <label className="full-field">产品描述<RichTextEditor value={form.desc || ""} onChange={desc => set({ desc })} placeholder="产品背景、讨论记录、关键结论…" /></label>
    </Modal>
  );
}
