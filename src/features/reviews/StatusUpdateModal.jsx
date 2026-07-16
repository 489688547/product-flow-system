import { useEffect, useState } from "react";
import { Button } from "../../ui/Button.jsx";
import { Modal } from "../../ui/Modal.jsx";

export function StatusUpdateModal({ open, projects, currentUser, onClose, onSave }) {
  const [form, setForm] = useState({});
  const [error, setError] = useState("");
  useEffect(() => {
    setForm({ projectId: projects[0]?.id || "", owner: currentUser?.name || "", needsCoordination: false, needsDecision: false });
    setError("");
  }, [currentUser?.name, open, projects]);
  const set = patch => setForm(current => ({ ...current, ...patch }));
  const save = () => {
    if (!form.projectId) return setError("请选择需要确认的重点项目。");
    if (!String(form.change || "").trim()) return setError("请填写本周关键变化。");
    if (!String(form.largestRisk || "").trim()) return setError("请填写当前最大风险；没有风险时填写“暂无”。");
    onSave(form);
  };
  return (
    <Modal open={open} title="确认本周项目状态" onClose={onClose} footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={save}>提交确认</Button></>}>
      {error ? <div className="inline-alert" role="alert">{error}</div> : null}
      <div className="form-grid">
        <label>重点项目<select value={form.projectId || ""} onChange={event => set({ projectId: event.target.value })}>{projects.map(project => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
        <label>状态信心<input type="number" min="0" max="100" value={form.confidence ?? 70} onChange={event => set({ confidence: Number(event.target.value) })} /></label>
      </div>
      <label className="full-field">本周关键变化<textarea value={form.change || ""} onChange={event => set({ change: event.target.value })} placeholder="只记录影响结果、节点或资源的变化。" /></label>
      <label className="full-field">当前最大风险<textarea value={form.largestRisk || ""} onChange={event => set({ largestRisk: event.target.value })} placeholder="说明风险、影响和恢复动作。" /></label>
      <fieldset className="status-update-flags">
        <legend>需要协调或决策</legend>
        <label><input type="checkbox" checked={Boolean(form.needsCoordination)} onChange={event => set({ needsCoordination: event.target.checked })} />需要跨部门协调</label>
        <label><input type="checkbox" checked={Boolean(form.needsDecision)} onChange={event => set({ needsDecision: event.target.checked })} />需要管理层决策</label>
      </fieldset>
      {form.needsCoordination || form.needsDecision ? <label className="full-field">具体请求<textarea value={form.request || ""} onChange={event => set({ request: event.target.value })} placeholder="说明希望谁在什么时间前提供什么支持。" /></label> : null}
    </Modal>
  );
}
