import { useEffect, useState } from "react";
import { Button } from "../../ui/Button.jsx";
import { Modal } from "../../ui/Modal.jsx";
import { OrgSelect } from "../../ui/OrgSelect.jsx";

function initialProject(project, strategies, objectives) {
  return project ? { ...project } : {
    strategyId: strategies[0]?.id || "",
    objectiveId: objectives[0]?.id || "",
    visibility: "company",
    partnerDepartments: [],
    startDate: new Date().toISOString().slice(0, 10),
    endDate: ""
  };
}

export function ProjectEditorModal({ open, project, strategies, objectives, orgCache, onClose, onSave }) {
  const [form, setForm] = useState(() => initialProject(project, strategies, objectives));
  const [error, setError] = useState("");
  useEffect(() => {
    setForm(initialProject(project, strategies, objectives));
    setError("");
  }, [objectives, open, project, strategies]);
  const set = patch => setForm(current => ({ ...current, ...patch }));
  const availableObjectives = objectives.filter(item => !form.strategyId || item.strategyId === form.strategyId);
  const save = () => {
    if (!String(form.name || "").trim()) return setError("请填写项目名称。");
    if (!String(form.goal || "").trim() || !String(form.successStandard || "").trim()) return setError("请填写项目目标和成功标准。");
    if (!form.owner || !form.department) return setError("请选择项目负责人和主责部门。");
    if (!form.strategyId && !form.objectiveId) return setError("重点项目必须关联公司战略或季度目标。");
    if (!form.startDate || !form.endDate || form.endDate < form.startDate) return setError("请填写有效的项目周期。");
    onSave(form);
  };

  return (
    <Modal open={open} title={project ? "编辑重点项目" : "新建重点项目"} size="wide" onClose={onClose} footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={save}>保存项目</Button></>}>
      {error ? <div className="inline-alert" role="alert">{error}</div> : null}
      <div className="form-grid">
        <label>项目名称<input name="key-project-name" autoComplete="off" value={form.name || ""} onChange={event => set({ name: event.target.value })} placeholder="例如：仓鼠冻干零食规模化上市" /></label>
        <label>项目负责人<OrgSelect type="user" value={form.owner || ""} onChange={owner => set({ owner })} orgCache={orgCache} placeholder="选择负责人…" /></label>
        <label>发起人<OrgSelect type="user" value={form.sponsor || ""} onChange={sponsor => set({ sponsor })} orgCache={orgCache} placeholder="选择发起人…" /></label>
        <label>主责部门<OrgSelect type="department" value={form.department || ""} onChange={department => set({ department })} orgCache={orgCache} placeholder="选择主责部门…" /></label>
        <label>协同部门<OrgSelect type="department" multiple searchInMenu value={(form.partnerDepartments || []).join(" / ")} onChange={value => set({ partnerDepartments: value.split(" / ").filter(Boolean) })} orgCache={orgCache} placeholder="选择协同部门…" /></label>
        <label>可见范围<select value={form.visibility || "company"} onChange={event => set({ visibility: event.target.value })}><option value="company">公司公开</option><option value="departments">仅参与部门</option><option value="members">仅指定成员</option></select></label>
        <label>关联年度战略<select value={form.strategyId || ""} onChange={event => set({ strategyId: event.target.value, objectiveId: "" })}><option value="">请选择</option>{strategies.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label>关联季度目标<select value={form.objectiveId || ""} onChange={event => set({ objectiveId: event.target.value })}><option value="">只关联战略</option>{availableObjectives.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
        <label>开始日期<input type="date" value={form.startDate || ""} onChange={event => set({ startDate: event.target.value })} /></label>
        <label>计划结束<input type="date" value={form.endDate || ""} onChange={event => set({ endDate: event.target.value })} /></label>
      </div>
      <label className="full-field">项目目标<textarea value={form.goal || ""} onChange={event => set({ goal: event.target.value })} placeholder="描述项目要解决的问题和预期结果。" /></label>
      <label className="full-field">成功标准<textarea value={form.successStandard || ""} onChange={event => set({ successStandard: event.target.value })} placeholder="填写可以客观验收的结果。" /></label>
    </Modal>
  );
}
