import { useEffect, useState } from "react";
import { Button } from "../../ui/Button.jsx";
import { Modal } from "../../ui/Modal.jsx";
import { OrgSelect } from "../../ui/OrgSelect.jsx";

function initialForm(record, strategyId) {
  return record ? { ...record } : {
    strategyId,
    title: "",
    acceptanceStandard: "",
    owner: "",
    dueDate: "",
    status: "active"
  };
}

export function RequiredResultModal({ open, record, strategyId, orgCache, onClose, onSave }) {
  const [form, setForm] = useState(() => initialForm(record, strategyId));
  const [error, setError] = useState("");
  useEffect(() => {
    setForm(initialForm(record, strategyId));
    setError("");
  }, [open, record, strategyId]);
  const set = patch => setForm(current => ({ ...current, ...patch }));
  const save = () => {
    if (!form.title.trim()) return setError("请填写必达结果。");
    if (!form.acceptanceStandard.trim()) return setError("请填写可核验的验收标准。");
    if (!form.owner) return setError("请选择责任部门。");
    if (!form.dueDate) return setError("请选择截止日期。");
    onSave(form);
  };
  return (
    <Modal open={open} title={`${record ? "编辑" : "新增"}必达结果`} onClose={onClose} footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={save}>保存</Button></>}>
      {error ? <div className="inline-alert" role="alert">{error}</div> : null}
      <label className="full-field">必达结果<input value={form.title || ""} onChange={event => set({ title: event.target.value })} placeholder="描述年底必须实现的结果" /></label>
      <label className="full-field">验收标准<textarea value={form.acceptanceStandard || ""} onChange={event => set({ acceptanceStandard: event.target.value })} placeholder="写清数据口径、验收证据和通过条件" /></label>
      <div className="form-grid">
        <label>责任部门<OrgSelect type="department" value={form.owner || ""} onChange={owner => set({ owner })} orgCache={orgCache} placeholder="选择部门…" /></label>
        <label>截止日期<input type="date" value={form.dueDate || ""} onChange={event => set({ dueDate: event.target.value })} /></label>
        <label>执行状态<select value={form.status || "active"} onChange={event => set({ status: event.target.value })}><option value="active">推进中</option><option value="at_risk">有风险</option><option value="off_track">已偏离</option><option value="verified">已核验</option></select></label>
      </div>
    </Modal>
  );
}
