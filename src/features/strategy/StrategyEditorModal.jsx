import { useEffect, useState } from "react";
import { Button } from "../../ui/Button.jsx";
import { Modal } from "../../ui/Modal.jsx";
import { OrgSelect } from "../../ui/OrgSelect.jsx";

const TITLES = {
  strategy: "年度战略",
  objective: "季度目标",
  metric: "关键指标"
};

function initialForm(kind, record, context) {
  if (record) return { ...record };
  if (kind === "strategy") return { year: new Date().getFullYear(), status: "active" };
  if (kind === "objective") return { strategyId: context.strategyId || "", quarter: `${new Date().getFullYear()}-Q3`, confidence: 70, departments: [] };
  return { objectiveId: context.objectiveId || "", direction: "increase", unit: "%", baseline: 0, current: 0, target: 100, warningLine: 70, offTrackLine: 50, sourceType: "manual", sourceName: "负责人确认", frequencyDays: 7 };
}

export function StrategyEditorModal({ open, kind, record, context = {}, orgCache, onClose, onSave }) {
  const [form, setForm] = useState(() => initialForm(kind, record, context));
  const [error, setError] = useState("");
  useEffect(() => {
    setForm(initialForm(kind, record, context));
    setError("");
  }, [context.objectiveId, context.strategyId, kind, open, record]);
  const set = patch => setForm(current => ({ ...current, ...patch }));
  const save = () => {
    const name = kind === "strategy" ? form.name : kind === "objective" ? form.title : form.name;
    if (!String(name || "").trim()) return setError(`请填写${TITLES[kind]}名称。`);
    if (!String(form.owner || "").trim()) return setError("请选择负责人。");
    if (kind !== "metric" && !String(form.successStandard || "").trim()) return setError("请填写成功标准。");
    if (kind === "objective" && !form.strategyId) return setError("季度目标必须归属一项年度战略。");
    if (kind === "metric" && !form.objectiveId) return setError("关键指标必须归属一项季度目标。");
    onSave(form);
  };

  return (
    <Modal open={open} title={`${record ? "编辑" : "新建"}${TITLES[kind]}`} size="wide" onClose={onClose} footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={save}>保存</Button></>}>
      {error ? <div className="inline-alert" role="alert">{error}</div> : null}
      {kind === "strategy" ? (
        <>
          <div className="form-grid">
            <label>年度战略名称<input name="strategy-name" autoComplete="off" value={form.name || ""} onChange={event => set({ name: event.target.value })} placeholder="例如：建立可持续的品类增长引擎" /></label>
            <label>战略负责人<OrgSelect type="user" value={form.owner || ""} onChange={owner => set({ owner })} orgCache={orgCache} placeholder="选择负责人…" /></label>
            <label>年度<input type="number" min="2020" max="2100" value={form.year || ""} onChange={event => set({ year: Number(event.target.value) })} /></label>
            <label>状态<select value={form.status || "active"} onChange={event => set({ status: event.target.value })}><option value="active">执行中</option><option value="completed">已完成</option><option value="archived">已归档</option></select></label>
          </div>
          <label className="full-field">战略意图<textarea value={form.intent || ""} onChange={event => set({ intent: event.target.value })} placeholder="说明为什么要做、希望形成什么长期能力。" /></label>
          <label className="full-field">成功标准<textarea value={form.successStandard || ""} onChange={event => set({ successStandard: event.target.value })} placeholder="描述年底能够客观判断是否实现的结果。" /></label>
        </>
      ) : null}
      {kind === "objective" ? (
        <>
          <div className="form-grid">
            <label>季度目标<input name="objective-title" autoComplete="off" value={form.title || ""} onChange={event => set({ title: event.target.value })} placeholder="描述要实现的结果，而不是任务" /></label>
            <label>负责人<OrgSelect type="user" value={form.owner || ""} onChange={owner => set({ owner })} orgCache={orgCache} placeholder="选择负责人…" /></label>
            <label>所属季度<select value={form.quarter || "2026-Q3"} onChange={event => set({ quarter: event.target.value })}>{["2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4", "2027-Q1"].map(value => <option key={value}>{value}</option>)}</select></label>
            <label>负责人信心<input type="number" min="0" max="100" value={form.confidence ?? ""} onChange={event => set({ confidence: Number(event.target.value) })} /></label>
            <label>参与部门<OrgSelect type="department" multiple searchInMenu value={(form.departments || []).join(" / ")} onChange={value => set({ departments: value.split(" / ").filter(Boolean) })} orgCache={orgCache} placeholder="选择参与部门…" /></label>
          </div>
          <label className="full-field">成功标准<textarea value={form.successStandard || ""} onChange={event => set({ successStandard: event.target.value })} placeholder="至少关联一项关键指标或重点项目，并写清验收结果。" /></label>
        </>
      ) : null}
      {kind === "metric" ? (
        <>
          <div className="form-grid">
            <label>关键指标名称<input name="metric-name" autoComplete="off" value={form.name || ""} onChange={event => set({ name: event.target.value })} placeholder="例如：重点项目按期完成率" /></label>
            <label>指标负责人<OrgSelect type="user" value={form.owner || ""} onChange={owner => set({ owner })} orgCache={orgCache} placeholder="选择负责人…" /></label>
            <label>方向<select value={form.direction || "increase"} onChange={event => set({ direction: event.target.value })}><option value="increase">越高越好</option><option value="decrease">越低越好</option><option value="range">保持区间</option></select></label>
            <label>单位<input value={form.unit || ""} onChange={event => set({ unit: event.target.value })} placeholder="%、万元、个" /></label>
            <label>基准值<input type="number" value={form.baseline ?? ""} onChange={event => set({ baseline: Number(event.target.value) })} /></label>
            <label>当前值<input type="number" value={form.current ?? ""} onChange={event => set({ current: Number(event.target.value) })} /></label>
            <label>目标值<input type="number" value={form.target ?? ""} onChange={event => set({ target: Number(event.target.value) })} /></label>
            <label>预警线<input type="number" value={form.warningLine ?? ""} onChange={event => set({ warningLine: Number(event.target.value) })} /></label>
            <label>偏离线<input type="number" value={form.offTrackLine ?? ""} onChange={event => set({ offTrackLine: Number(event.target.value) })} /></label>
            <label>更新频率<select value={form.frequencyDays || 7} onChange={event => set({ frequencyDays: Number(event.target.value) })}><option value="1">每天</option><option value="7">每周</option><option value="30">每月</option></select></label>
            <label>数据来源<select value={form.sourceType || "manual"} onChange={event => set({ sourceType: event.target.value })}><option value="manual">人工确认</option><option value="app">业务 App</option><option value="api">数据接口</option><option value="sheet">表格导入</option></select></label>
            <label>来源名称<input value={form.sourceName || ""} onChange={event => set({ sourceName: event.target.value })} placeholder="例如：产品全周期" /></label>
          </div>
        </>
      ) : null}
    </Modal>
  );
}
