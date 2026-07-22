import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { formatExpectedLaunchMonth } from "../../domain/expectedLaunch.js";
import { productManagerAssignment } from "../../domain/productOwnership.js";
import { Button, IconAction } from "../../ui/Button.jsx";
import { Modal } from "../../ui/Modal.jsx";
import { OrgSelect } from "../../ui/OrgSelect.jsx";
import { RichTextEditor } from "../../ui/RichTextEditor.jsx";
import { mergeProductCatalogLink } from "../../domain/productCatalog.js";
import { ProductCatalogSelect } from "../product-catalog/ProductCatalogSelect.jsx";

export function ProductModal({ open, product, orgCache, catalogItems = [], onClose, onSave }) {
  const [form, setForm] = useState(product || {});
  useEffect(() => setForm(product || {}), [product, open]);
  if (!product) return null;
  const set = patch => setForm(current => ({ ...current, ...patch }));
  const catalogItem = catalogItems.find(item => item.id === form.catalogProductId);
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
          <label>期望上线<div className="readonly-field"><strong>{formatExpectedLaunchMonth(form.expectedLaunchMonth)}</strong><span>来自需求池的期望上线月份</span></div></label>
          <label>产品等级<div className="readonly-field"><strong>{form.levelConfirmed ? form.level : "待立项确认"}</strong><span>在产品进度的立项评分中确定</span></div></label>
          <label>提需人<OrgSelect type="user" value={form.requester || ""} onChange={requester => set({ requester })} orgCache={orgCache} placeholder="选择提需人…" /></label>
          <label>产品经理<OrgSelect type="user" value={form.productManager || ""} onChange={productManager => set(productManagerAssignment(productManager, orgCache))} orgCache={orgCache} departmentFilter="产品" placeholder="选择产品经理…" /></label>
          <label>来源部门<OrgSelect type="department" value={form.source || ""} onChange={source => set({ source })} orgCache={orgCache} /></label>
        </div>
      </div>
      <div className="full-field product-catalog-link-field">
        <span>ERP 商品关联<small>商品、库存单位编码和组合关系来自数据中心；产品阶段、负责人和资料仍由产品全周期维护。</small></span>
        <ProductCatalogSelect items={catalogItems} value={form.catalogProductId || ""} onChange={catalogProductId => {
          if (!catalogProductId) set({ catalogProductId: "" });
          else set(mergeProductCatalogLink(form, catalogItems.find(item => item.id === catalogProductId)));
        }} />
        {catalogItem ? <p className="product-catalog-link-summary">主商家编码 <b>{catalogItem.merchantCode || "—"}</b> · {(catalogItem.skus || []).length} 个库存单位 · {(catalogItem.components || []).length} 条组合关系</p> : null}
      </div>
      <div className="full-field sku-code-field">
        <span>库存单位编码与定价<small>未关联 ERP 商品时可兼容手工维护；标准商品条码和内部唯一码都可用于匹配销售数据。</small></span>
        {(form.skuCodes || []).map((item, index) => {
          const codeText = String(item.code || "");
          return (
            <div className="sku-code-row" key={index}>
              <input
                aria-label={`第${index + 1}个库存单位编码`}
                placeholder="商品条码或内部唯一码"
                value={codeText}
                onChange={event => set({ skuCodes: form.skuCodes.map((current, at) => at === index ? { ...current, code: event.target.value.trim() } : current) })}
              />
              <input
                aria-label={`第${index + 1}个库存单位定价`}
                placeholder="定价（元）"
                type="number"
                min="0"
                step="0.01"
                value={item.price ?? ""}
                onChange={event => set({ skuCodes: form.skuCodes.map((current, at) => at === index ? { ...current, price: event.target.value } : current) })}
              />
              <IconAction label={`删除第${index + 1}个库存单位编码`} className="danger" onClick={() => set({ skuCodes: form.skuCodes.filter((current, at) => at !== index) })}><Trash2 size={16} /></IconAction>
            </div>
          );
        })}
        <Button className="compact" onClick={() => set({ skuCodes: [...(form.skuCodes || []), { code: "", price: "" }] })}><Plus size={16} />添加库存单位</Button>
      </div>
      <label className="full-field">产品描述<RichTextEditor value={form.desc || ""} onChange={desc => set({ desc })} placeholder="产品背景、讨论记录、关键结论…" /></label>
    </Modal>
  );
}
