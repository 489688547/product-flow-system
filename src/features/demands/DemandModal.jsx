import { ImagePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { generateProductCover } from "../../domain/productFlow.js";
import { Button } from "../../ui/Button.jsx";
import { ExpectedLaunchMonthSelect } from "../../ui/ExpectedLaunchMonthSelect.jsx";
import { Modal } from "../../ui/Modal.jsx";
import { OrgSelect } from "../../ui/OrgSelect.jsx";
import { RichTextEditor } from "../../ui/RichTextEditor.jsx";

const EMPTY = { name: "", expectedLaunchMonth: "", requester: "", source: "", desc: "", discussion: "", image: "" };

export function DemandModal({ open, demand, currentUser, orgCache, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY);
  useEffect(() => {
    setForm(demand ? { ...EMPTY, ...demand, requester: demand.requester || demand.owner || "" } : { ...EMPTY, requester: currentUser?.name || "" });
  }, [currentUser?.name, demand, open]);

  const missing = !form.name.trim() || !form.expectedLaunchMonth || !form.requester.trim() || !form.source.trim() || !form.desc.replace(/<[^>]+>/g, "").trim();
  const set = patch => setForm(current => ({ ...current, ...patch }));
  const previewImage = form.image || generateProductCover(form.name);
  const readImage = file => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set({ image: String(reader.result || "") });
    reader.readAsDataURL(file);
  };

  return (
    <Modal
      open={open}
      title={demand ? "编辑需求机会" : "添加需求机会"}
      onClose={onClose}
      footer={<>
        <Button onClick={onClose}>取消</Button>
        <Button variant="primary" disabled={missing} disabledReason="请填写名称、期望上线、提需人、来源部门和机会描述" onClick={() => onSave(form)}>保存</Button>
      </>}
    >
      <section className="demand-cover-field" aria-label="产品图片">
        <img src={previewImage} alt={`${form.name || "产品"}封面预览`} width="96" height="96" />
        <div>
          <strong>产品图片</strong>
          <p>{form.image ? "已使用上传图片，进入立项后会继续沿用。" : "未上传时，系统会按产品名称自动生成默认封面。"}</p>
          <div className="demand-cover-actions">
            <label className="btn secondary compact">
              <ImagePlus size={16} aria-hidden="true" />
              {form.image ? "更换图片" : "上传图片"}
              <input type="file" accept="image/*" onChange={event => { readImage(event.target.files?.[0]); event.target.value = ""; }} />
            </label>
          </div>
        </div>
      </section>
      <div className="form-grid">
        <label>产品/机会名称<input name="demand-name" autoComplete="off" value={form.name} onChange={event => set({ name: event.target.value })} placeholder="例如：鹦鹉谷物棒升级版…" /></label>
        <label>期望上线<ExpectedLaunchMonthSelect value={form.expectedLaunchMonth} onChange={expectedLaunchMonth => set({ expectedLaunchMonth })} /></label>
        <label>提需人<OrgSelect type="user" value={form.requester} onChange={requester => set({ requester })} orgCache={orgCache} placeholder="选择提需人…" searchInMenu /></label>
        <label>来源部门<OrgSelect type="department" value={form.source} onChange={source => set({ source })} orgCache={orgCache} placeholder="选择来源部门…" searchInMenu /></label>
      </div>
      <label className="full-field">机会描述<RichTextEditor value={form.desc} onChange={desc => set({ desc })} placeholder="看到什么市场机会、用户痛点、供应链可能性…" /></label>
      <label className="full-field">讨论摘要<RichTextEditor value={form.discussion} onChange={discussion => set({ discussion })} placeholder="讨论后的判断、争议点、下一步结论…" /></label>
    </Modal>
  );
}
