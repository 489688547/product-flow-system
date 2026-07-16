import { BellRing, Check, CircleHelp, Plus, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { projectHealth } from "../../domain/strategyExecution.js";
import { Button } from "../../ui/Button.jsx";
import { Modal } from "../../ui/Modal.jsx";
import { OrgSelect } from "../../ui/OrgSelect.jsx";
import { HealthBadge } from "../company/HealthBadge.jsx";

export function ProjectDetailModal({ open, project, state, orgCache, currentUser, onClose, dispatch, onEdit, onSyncDecisionTodo }) {
  const [adding, setAdding] = useState("");
  const [form, setForm] = useState({});
  const [syncError, setSyncError] = useState("");
  const result = useMemo(() => project ? projectHealth(state, project, new Date()) : null, [project, state]);
  if (!project) return null;
  const milestones = state.milestones.filter(item => item.projectId === project.id && !item.archived);
  const risks = state.risks.filter(item => item.projectId === project.id && !item.archived);
  const decisions = state.decisionRequests.filter(item => item.projectId === project.id && !item.archived);
  const set = patch => setForm(current => ({ ...current, ...patch }));
  const startAdding = type => { setAdding(type); setForm(type === "milestone" ? { critical: true, status: "pending" } : type === "risk" ? { severity: "high", status: "open" } : { status: "pending", decisionOwner: "周荣庆" }); };
  const saveSubrecord = () => {
    if (adding === "milestone" && form.title && form.owner && form.dueDate) dispatch({ type: "upsert_milestone", record: { ...form, id: `milestone-${Date.now()}`, projectId: project.id } });
    if (adding === "risk" && form.title && form.owner && form.response) dispatch({ type: "upsert_risk", record: { ...form, id: `risk-${Date.now()}`, projectId: project.id } });
    if (adding === "decision" && form.title && form.decisionOwner && form.recommendation) dispatch({ type: "upsert_decision", record: { ...form, id: `decision-${Date.now()}`, projectId: project.id, requester: currentUser?.name || "" } });
    setAdding("");
    setForm({});
  };
  const syncDecision = async decision => {
    setSyncError("");
    try {
      await onSyncDecisionTodo(decision);
    } catch (error) {
      setSyncError(error.message || "钉钉待办同步失败。");
    }
  };

  return (
    <Modal open={open} title={project.name} size="wide" onClose={onClose} footer={<><Button onClick={onEdit}>编辑项目</Button><Button variant="primary" onClick={onClose}>完成</Button></>}>
      <div className="project-detail-summary"><span><small>整体健康度</small><HealthBadge health={result.health} /></span><span><small>负责人</small><strong>{project.owner}</strong></span><span><small>主责部门</small><strong>{project.department}</strong></span><span><small>计划结束</small><strong>{project.endDate || "待排期"}</strong></span><span><small>数据来源</small><strong>{project.sourceAppId ? "产品全周期" : "项目中心"}</strong></span></div>
      {result.reasons.length ? <div className="project-health-reasons">{result.reasons.map(reason => <span key={reason}><ShieldAlert size={15} />{reason}</span>)}</div> : null}

      <section className="project-detail-section">
        <header><h3>关键里程碑</h3><Button className="compact" onClick={() => startAdding("milestone")}><Plus size={15} />添加</Button></header>
        {milestones.map(item => <div className="project-detail-row" key={item.id}><button className={`milestone-check ${item.status === "completed" ? "done" : ""}`} type="button" aria-label={item.status === "completed" ? "标记为未完成" : "标记为已完成"} onClick={() => dispatch({ type: "upsert_milestone", record: { ...item, status: item.status === "completed" ? "pending" : "completed" } })}>{item.status === "completed" ? <Check size={15} /> : null}</button><span><strong>{item.title}</strong><small>{item.owner} · 截止 {item.dueDate} · {item.critical ? "关键节点" : "普通节点"}</small></span></div>)}
        {!milestones.length ? <div className="empty-state">尚未设置关键里程碑。</div> : null}
      </section>

      <section className="project-detail-section">
        <header><h3>风险与阻塞</h3><Button className="compact" onClick={() => startAdding("risk")}><Plus size={15} />登记风险</Button></header>
        {risks.map(item => <div className="project-detail-row" key={item.id}><span className={`risk-severity ${item.severity}`}>{item.severity === "critical" ? "重大" : item.severity === "high" ? "高" : item.severity === "medium" ? "中" : "低"}</span><span><strong>{item.title}</strong><small>{item.owner} · 承诺 {item.promisedAt || "待补充"} · {item.response}</small></span>{item.status !== "closed" ? <button type="button" onClick={() => dispatch({ type: "upsert_risk", record: { ...item, status: "closed", closedResult: "已完成应对动作" }, reason: "风险关闭" })}>关闭</button> : <HealthBadge health="completed" />}</div>)}
        {!risks.length ? <div className="empty-state">当前没有登记风险。</div> : null}
      </section>

      <section className="project-detail-section">
        <header><h3>待决策</h3><Button className="compact" onClick={() => startAdding("decision")}><Plus size={15} />发起决策</Button></header>
        {syncError ? <div className="inline-alert" role="alert">{syncError}</div> : null}
        {decisions.map(item => <div className="project-detail-row decision" key={item.id}><CircleHelp size={17} /><span><strong>{item.title}</strong><small>{item.recommendation} · 最晚 {item.dueDate || "待补充"}{item.dingTodo?.syncedAt ? " · 已同步钉钉" : ""}</small></span>{item.status === "pending" ? <div className="row-actions"><button type="button" title="同步钉钉待办" onClick={() => syncDecision(item)}><BellRing size={15} /></button><button type="button" onClick={() => dispatch({ type: "resolve_decision", id: item.id, status: "approved", resolution: "同意推荐方案" })}>同意</button><button type="button" onClick={() => dispatch({ type: "resolve_decision", id: item.id, status: "returned", resolution: "退回补充信息" })}>退回</button></div> : <span className="decision-resolved">{item.status === "approved" ? "已同意" : "已退回"}</span>}</div>)}
        {!decisions.length ? <div className="empty-state">当前没有待决策事项。</div> : null}
      </section>

      {adding ? (
        <section className="project-subrecord-form">
          <h3>{adding === "milestone" ? "添加关键里程碑" : adding === "risk" ? "登记风险" : "发起待决策事项"}</h3>
          <div className="form-grid">
            <label>名称<input value={form.title || ""} onChange={event => set({ title: event.target.value })} autoComplete="off" /></label>
            {adding !== "decision" ? <label>负责人<OrgSelect type="user" value={form.owner || ""} onChange={owner => set({ owner })} orgCache={orgCache} placeholder="选择负责人…" /></label> : <label>决策人<OrgSelect type="user" value={form.decisionOwner || ""} onChange={decisionOwner => set({ decisionOwner })} orgCache={orgCache} placeholder="选择决策人…" /></label>}
            {adding === "milestone" ? <><label>截止日期<input type="date" value={form.dueDate || ""} onChange={event => set({ dueDate: event.target.value })} /></label><label>节点级别<select value={form.critical ? "critical" : "normal"} onChange={event => set({ critical: event.target.value === "critical" })}><option value="critical">关键节点</option><option value="normal">普通节点</option></select></label></> : null}
            {adding === "risk" ? <><label>风险等级<select value={form.severity || "high"} onChange={event => set({ severity: event.target.value })}><option value="critical">重大</option><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select></label><label>承诺解决时间<input type="date" value={form.promisedAt || ""} onChange={event => set({ promisedAt: event.target.value })} /></label></> : null}
            {adding === "decision" ? <label>最晚决策日期<input type="date" value={form.dueDate || ""} onChange={event => set({ dueDate: event.target.value })} /></label> : null}
          </div>
          {adding === "risk" ? <label className="full-field">应对动作<textarea value={form.response || ""} onChange={event => set({ response: event.target.value })} /></label> : null}
          {adding === "decision" ? <><label className="full-field">影响<textarea value={form.impact || ""} onChange={event => set({ impact: event.target.value })} /></label><label className="full-field">推荐方案<textarea value={form.recommendation || ""} onChange={event => set({ recommendation: event.target.value })} /></label><label className="full-field">备选方案<textarea value={form.alternatives || ""} onChange={event => set({ alternatives: event.target.value })} /></label></> : null}
          <div className="project-subrecord-actions"><Button onClick={() => setAdding("")}>取消</Button><Button variant="primary" onClick={saveSubrecord}>保存</Button></div>
        </section>
      ) : null}
    </Modal>
  );
}
