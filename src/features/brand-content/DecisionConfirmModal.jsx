import { useEffect, useState } from "react";
import { Button } from "../../ui/Button.jsx";
import { DatePickerField } from "../../ui/DatePickerField.jsx";
import { Modal } from "../../ui/Modal.jsx";
import { OrgSelect } from "../../ui/OrgSelect.jsx";

function userRecord(orgCache, name) {
  const user = (orgCache?.users || []).find(item => item.name === name);
  return { id: user?.userid || user?.userId || name, name };
}

export function DecisionConfirmModal({ open, decision, accounts, orgCache, saving, onClose, dispatch }) {
  const [form, setForm] = useState({ quantity: 1, contentDirection: "", targetAccount: "", directorName: "", editorName: "", operatorName: "", dueAt: "", reviewAt: "" });
  useEffect(() => {
    if (!open || !decision) return;
    setForm({ quantity: Math.max(1, Number(decision.quantity || 1)), contentDirection: decision.contentDirection || "", targetAccount: decision.targetAccount || accounts[0]?.name || "", directorName: "", editorName: "", operatorName: "", dueAt: "", reviewAt: decision.reviewAt || "" });
  }, [accounts, decision, open]);
  if (!decision) return null;
  const set = patch => setForm(current => ({ ...current, ...patch }));
  const missing = Number(form.quantity) < 1 || !form.contentDirection.trim() || !form.targetAccount || !form.directorName || !form.editorName || !form.operatorName || !form.dueAt || !form.reviewAt;
  const confirm = async () => {
    const director = userRecord(orgCache, form.directorName);
    const editor = userRecord(orgCache, form.editorName);
    const operator = userRecord(orgCache, form.operatorName);
    await dispatch({
      type: "confirm_decision",
      id: decision.id,
      input: {
        ...form,
        quantity: Number(form.quantity),
        directorId: director.id,
        editorId: editor.id,
        operatorId: operator.id
      }
    });
    onClose();
  };
  return (
    <Modal open={open} title={`确认补充 · ${decision.productName}`} onClose={onClose} size="wide" footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" disabled={missing || saving} disabledReason="请填写数量、内容方向、目标账户、三名主责任人、截止时间和复盘日期" onClick={confirm}>{saving ? "正在创建…" : `确认并创建 ${form.quantity} 条任务`}</Button></>}>
      <section className="decision-evidence-panel"><strong>决策证据</strong><p>{decision.evidence}</p><small>数据版本 {decision.evidenceVersion || "未提供"} · 来源内容 {decision.sourceContentId || "无"}</small></section>
      <div className="form-grid decision-confirm-grid">
        <label>数量<input type="number" min="1" max="20" value={form.quantity} onChange={event => set({ quantity: event.target.value })} /></label>
        <label>内容方向<input value={form.contentDirection} onChange={event => set({ contentDirection: event.target.value })} /></label>
        <label>目标账户<select value={form.targetAccount} onChange={event => set({ targetAccount: event.target.value })}>{accounts.map(account => <option key={account.id} value={account.name}>{account.platformLabel} · {account.name}</option>)}</select></label>
        <label>主编导<OrgSelect type="user" value={form.directorName} onChange={directorName => set({ directorName })} orgCache={orgCache} placeholder="选择主编导" label="主编导" departmentFilter="品牌" searchInMenu /></label>
        <label>主剪辑<OrgSelect type="user" value={form.editorName} onChange={editorName => set({ editorName })} orgCache={orgCache} placeholder="选择主剪辑" label="主剪辑" departmentFilter="品牌" searchInMenu /></label>
        <label>运营<OrgSelect type="user" value={form.operatorName} onChange={operatorName => set({ operatorName })} orgCache={orgCache} placeholder="选择主运营" label="运营" searchInMenu /></label>
        <label>截止时间<DatePickerField value={form.dueAt} onChange={dueAt => set({ dueAt })} ariaLabel="选择内容截止时间" /></label>
        <label>复盘日期<DatePickerField value={form.reviewAt} onChange={reviewAt => set({ reviewAt })} ariaLabel="选择内容复盘日期" /></label>
      </div>
    </Modal>
  );
}
