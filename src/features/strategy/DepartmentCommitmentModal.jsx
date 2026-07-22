import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, IconAction } from "../../ui/Button.jsx";
import { Modal } from "../../ui/Modal.jsx";
import { OrgSelect } from "../../ui/OrgSelect.jsx";
import { currentQuarterValue, quarterOptionsIncluding } from "./quarterOptions.js";

function defaultForm(record, currentUser, defaults = {}) {
  return record ? { ...record } : {
    title: "",
    strategyId: defaults.strategyId || "",
    requiredResultId: defaults.requiredResultId || "",
    department: currentUser?.department || "",
    owner: currentUser?.name || "",
    reviewerName: "周荣庆",
    executiveOwner: "周荣庆",
    period: currentQuarterValue(),
    successStandard: "",
    dueDate: "",
    status: "draft"
  };
}

function emptyMilestone(owner = "") {
  return { id: "", title: "", month: "", dueDate: "", owner, status: "pending" };
}

export function DepartmentCommitmentModal({ open, record, defaults, milestones = [], strategies, requiredResults = [], currentUser, orgCache, onClose, onSave }) {
  const [form, setForm] = useState(() => defaultForm(record, currentUser, defaults));
  const [items, setItems] = useState(() => milestones.length ? milestones : [emptyMilestone(currentUser?.name)]);
  const [error, setError] = useState("");
  useEffect(() => {
    const nextForm = defaultForm(record, currentUser, defaults);
    setForm(nextForm);
    setItems(milestones.length ? milestones.map(item => ({ ...item })) : [emptyMilestone(nextForm.owner)]);
    setError("");
  }, [currentUser, defaults, milestones, open, record]);
  const set = patch => setForm(current => ({ ...current, ...patch }));
  const availableResults = requiredResults.filter(item => item.strategyId === form.strategyId && !item.archived);
  const periodOptions = quarterOptionsIncluding(form.period);
  const patchMilestone = (index, patch) => setItems(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const save = () => {
    if (!form.title.trim() || !form.strategyId || !form.requiredResultId || !form.department || !form.owner) return setError("请填写承诺名称、关联战略、必达结果、部门和负责人。");
    if (!availableResults.some(item => item.id === form.requiredResultId)) return setError("关联必达结果必须属于当前战略。");
    if (!form.successStandard.trim() || !form.dueDate) return setError("请填写验收标准和最终截止日期。");
    const validMilestones = items.filter(item => item.title.trim() || item.dueDate);
    if (!validMilestones.length || validMilestones.some(item => !item.title.trim() || !item.dueDate || !item.owner)) return setError("请至少填写一个完整的月度里程碑。");
    onSave(form, validMilestones);
  };
  return (
    <Modal open={open} title={`${record ? "编辑" : "新建"}部门承诺`} size="wide" onClose={onClose} footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={save}>保存草稿</Button></>}>
      {error ? <div className="inline-alert" role="alert">{error}</div> : null}
      <div className="form-grid">
        <label>承诺名称<input value={form.title || ""} onChange={event => set({ title: event.target.value })} placeholder="描述部门要交付的关键结果" /></label>
        <label>关联战略<select value={form.strategyId || ""} onChange={event => set({ strategyId: event.target.value, requiredResultId: "" })}><option value="">选择公司战略…</option>{strategies.map(strategy => <option value={strategy.id} key={strategy.id}>{strategy.name}</option>)}</select></label>
        <label>关联必达结果<select value={form.requiredResultId || ""} onChange={event => set({ requiredResultId: event.target.value })} disabled={!form.strategyId}><option value="">选择必达结果…</option>{availableResults.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
        <label>责任部门<OrgSelect type="department" value={form.department || ""} onChange={department => set({ department })} orgCache={orgCache} placeholder="选择部门…" /></label>
        <label>部门负责人<OrgSelect type="user" value={form.owner || ""} onChange={owner => set({ owner })} orgCache={orgCache} placeholder="选择负责人…" /></label>
        <label>承诺周期<select value={form.period || periodOptions[0]} onChange={event => set({ period: event.target.value })}>{periodOptions.map(period => <option key={period}>{period}</option>)}</select></label>
        <label>最终截止<input type="date" value={form.dueDate || ""} onChange={event => set({ dueDate: event.target.value })} /></label>
        <label>总经办审核人<OrgSelect type="user" value={form.reviewerName || ""} onChange={reviewerName => set({ reviewerName })} orgCache={orgCache} placeholder="选择审核人…" /></label>
        <label>老板确认人<OrgSelect type="user" value={form.executiveOwner || ""} onChange={executiveOwner => set({ executiveOwner })} orgCache={orgCache} placeholder="选择确认人…" /></label>
      </div>
      <label className="full-field">成功标准<textarea value={form.successStandard || ""} onChange={event => set({ successStandard: event.target.value })} placeholder="写清什么结果出现时，部门承诺才算真正达成" /></label>
      <section className="milestone-editor">
        <header><div><strong>月度里程碑</strong><small>只拆关键承诺，不承接日常任务</small></div><Button className="compact" onClick={() => setItems(current => [...current, emptyMilestone(form.owner)])}><Plus size={15} />添加里程碑</Button></header>
        {items.map((item, index) => <div className="milestone-editor-row" key={item.id || index}>
          <input aria-label="里程碑名称" value={item.title} onChange={event => patchMilestone(index, { title: event.target.value })} placeholder="本月必须完成的关键结果" />
          <input aria-label="截止日期" type="date" value={item.dueDate} onChange={event => patchMilestone(index, { dueDate: event.target.value, month: event.target.value.slice(0, 7) })} />
          <OrgSelect type="user" value={item.owner || form.owner || ""} onChange={owner => patchMilestone(index, { owner })} orgCache={orgCache} placeholder="负责人…" />
          <IconAction label="删除里程碑" onClick={() => setItems(current => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} /></IconAction>
        </div>)}
      </section>
    </Modal>
  );
}
