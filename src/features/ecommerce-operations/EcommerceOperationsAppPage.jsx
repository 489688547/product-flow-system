import { useMemo, useState } from "react";
import { summarizeDataCenterSales } from "../../domain/dataCenter.js";
import { summarizeEcommerceOperations } from "../../domain/ecommerceOperations.js";
import { useDataCenter } from "../../state/DataCenterProvider.jsx";
import { useEcommerceOperations } from "../../state/EcommerceOperationsProvider.jsx";
import { useAuth } from "../../state/AuthProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { DataTable } from "../../ui/DataTable.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";

const META = {
  dashboard: ["经营驾驶舱", "用数据识别差距，推动重点产品从方案走向结果。"],
  focus: ["重点产品经营", "主管定重点，运营按“现状—目标—问题—对策—监测—复盘”推进。"],
  collaboration: ["跨部门协同", "把供应链、产品、品牌和财务依赖变成有负责人、有期限的协同事项。"],
  team: ["团队管理", "明确店铺与产品责任、工作负荷和主管辅导动作，不在这里评分。"],
  playbooks: ["经营方法库", "沉淀可复用的打品方法、失败条件和复盘结论。"]
};

const split = value => String(value || "").split(/\n|；|;/).map(item => item.trim()).filter(Boolean);
const money = value => `¥${Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;

function Notice({ message, tone = "" }) { return message ? <div className={`ops-notice ${tone}`} role="status">{message}</div> : null; }

export function EcommerceOperationsAppPage({ section = "dashboard" }) {
  const { user } = useAuth();
  const { state, loading, error, dispatch, reviewWithAi } = useEcommerceOperations();
  const { salesRows, range } = useDataCenter();
  const [feedback, setFeedback] = useState("");
  const [focusDefinition, setFocusDefinition] = useState({ month: new Date().toISOString().slice(0, 7), product: "", ownerId: "", ownerName: "", goal: "" });
  const [form, setForm] = useState({ cycleId: "", platform: "抖音", store: "", evidence: "", goal: "", issue: "", countermeasure: "", monitor: "" });
  const [execution, setExecution] = useState({ progress: "", monitorData: "", issue: "", nextAction: "", review: "" });
  const [collab, setCollab] = useState({ title: "", targetDepartment: "供应链部", dueDate: "" });
  const [team, setTeam] = useState({ memberName: "", platform: "", store: "", focusProduct: "" });
  const [playbook, setPlaybook] = useState({ title: "", scenario: "", method: "" });
  const business = useMemo(() => summarizeDataCenterSales(salesRows, range), [range, salesRows]);
  const summary = useMemo(() => summarizeEcommerceOperations(state), [state]);
  const manager = String(user?.department || "") === "运营部" && /主管|经理|总监|负责人/.test(String(user?.title || ""));
  const currentDepartment = String(user?.department || user?.departmentName || "");
  const departmentManager = manager || /主管|经理|总监|负责人/.test(String(user?.title || ""));
  const [title, description] = META[section] || META.dashboard;

  async function act(action, success) {
    try { await dispatch(action); setFeedback(success); } catch (actionError) { setFeedback(actionError.message); }
  }

  async function createPlan(event) {
    event.preventDefault();
    const cycle = state.cycles.find(item => item.id === form.cycleId);
    if (!cycle) { setFeedback("请先选择主管指定的重点产品。"); return; }
    await act({ type: "upsert_plan", record: { cycleId: cycle.id, product: cycle.product, platform: form.platform, store: form.store, ownerId: cycle.ownerId, ownerName: cycle.ownerName, evidence: split(form.evidence), goals: split(form.goal), issues: split(form.issue).slice(0, 3), countermeasures: split(form.countermeasure), monitors: split(form.monitor) } }, "方案草稿已保存，可先请智能教练点评。定稿后再提交主管。 ");
  }

  const dashboard = (
    <>
      <div className="ops-metric-grid">
        <article><span>本期净销售额</span><strong>{money(business.totals.netSales)}</strong><small>数据中心 · 截止 {range.to}</small></article>
        <article><span>重点产品方案</span><strong>{summary.activePlans}</strong><small>{summary.pendingReviews} 个待主管审批</small></article>
        <article><span>执行推进</span><strong>{state.executions.filter(item => item.status !== "accepted").length}</strong><small>待完成或待验收</small></article>
        <article><span>协同阻塞</span><strong>{summary.blockedCollaborations}</strong><small>需跨部门处理</small></article>
      </div>
      <div className="ops-two-column">
        <section className="section-panel"><h2>本月经营闭环</h2><ol className="ops-loop"><li>数据中心识别现状与差距</li><li>主管确定重点产品和目标</li><li>运营收敛关键问题并制定对策</li><li>按领先指标执行、检查、调整</li><li>月末复盘并沉淀方法</li></ol></section>
        <section className="section-panel"><h2>主管今日关注</h2><p>{summary.pendingReviews ? `有 ${summary.pendingReviews} 个方案等待审批。` : "暂无待审批方案。"}</p><p>{summary.blockedCollaborations ? `有 ${summary.blockedCollaborations} 个跨部门事项阻塞。` : "跨部门事项暂无阻塞。"}</p><p className="muted">“运营团队”用于责任分配、负荷和辅导，不进行绩效打分。</p></section>
      </div>
    </>
  );

  const focus = (
    <>
    {manager ? <form className="section-panel ops-inline-form ops-focus-definition" onSubmit={e => { e.preventDefault(); act({ type: "create_cycle", record: { ...focusDefinition, status: "active" } }, "本月重点产品已指定，运营可开始制定方案。" ); }}><h2>主管指定月度重点产品</h2><div className="ops-field-row"><label>月份<input type="month" required value={focusDefinition.month} onChange={e => setFocusDefinition({ ...focusDefinition, month: e.target.value })} /></label><label>重点产品<input required value={focusDefinition.product} onChange={e => setFocusDefinition({ ...focusDefinition, product: e.target.value })} /></label></div><div className="ops-field-row"><label>运营员工 ID<input required value={focusDefinition.ownerId} onChange={e => setFocusDefinition({ ...focusDefinition, ownerId: e.target.value })} /></label><label>运营姓名<input required value={focusDefinition.ownerName} onChange={e => setFocusDefinition({ ...focusDefinition, ownerName: e.target.value })} /></label></div><label>主管目标与边界<textarea required value={focusDefinition.goal} onChange={e => setFocusDefinition({ ...focusDefinition, goal: e.target.value })} placeholder="写清结果目标、资源边界和截止日" /></label><Button variant="primary">确认重点产品</Button></form> : null}
    <div className="ops-workspace-grid">
      <form className="section-panel ops-form" onSubmit={createPlan}>
        <h2>新建打品方案</h2>
        <label>主管指定的重点产品<select value={form.cycleId} onChange={e => setForm({ ...form, cycleId: e.target.value })} required><option value="">请选择</option>{state.cycles.filter(item => item.status === "active").map(item => <option key={item.id} value={item.id}>{item.month} · {item.product} · {item.ownerName}</option>)}</select></label>
        <div className="ops-field-row"><label>平台<select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })}><option>抖音</option><option>天猫</option><option>拼多多</option><option>快手</option><option>小红书</option></select></label><label>店铺<input value={form.store} onChange={e => setForm({ ...form, store: e.target.value })} required /></label></div>
        <label>现状数据与情况<textarea value={form.evidence} onChange={e => setForm({ ...form, evidence: e.target.value })} placeholder="一行一条，写清基线、趋势和异常" required /></label>
        <label>目标<textarea value={form.goal} onChange={e => setForm({ ...form, goal: e.target.value })} placeholder="量化结果、截止时间" required /></label>
        <label>最重要的问题（1–3个）<textarea value={form.issue} onChange={e => setForm({ ...form, issue: e.target.value })} required /></label>
        <label>问题对应的对策<textarea value={form.countermeasure} onChange={e => setForm({ ...form, countermeasure: e.target.value })} required /></label>
        <label>每项对策的检测数据<textarea value={form.monitor} onChange={e => setForm({ ...form, monitor: e.target.value })} required /></label>
        <Button variant="primary" type="submit" disabled={!state.cycles.length} disabledReason="需由主管先指定月度重点产品。">保存方案草稿</Button>
      </form>
      <section className="section-panel"><h2>方案推进</h2><div className="ops-card-list">{state.plans.length ? state.plans.map(plan => {
        const review = state.aiReviews.find(item => item.planId === plan.id);
        const planExecutions = state.executions.filter(item => item.planId === plan.id);
        return <article className="ops-plan-card" key={plan.id}><div className="ops-card-heading"><div><strong>{plan.product || "未命名重点产品"}</strong><small>{plan.platform} · {plan.store} · {plan.ownerName}</small></div><span className={`status-badge ${plan.status}`}>{plan.status === "draft" ? "草稿" : plan.status === "submitted" ? "待审批" : plan.status === "approved" ? "执行中" : "已退回"}</span></div><p><b>目标：</b>{plan.goals?.join("；") || "—"}</p><p><b>关键问题：</b>{plan.issues?.join("；") || "—"}</p>{review ? <div className="ai-review"><b>{review.mode === "ai" ? "AI 点评" : "智能规则检查"}</b><p>{review.summary}</p>{review.suggestions?.map(item => <p key={item}>· {item}</p>)}</div> : null}<div className="table-actions"><Button type="button" onClick={() => reviewWithAi(plan).then(() => setFeedback("点评已生成，建议由运营优化后再提交。" )).catch(err => setFeedback(err.message))}>智能点评</Button>{plan.status === "draft" || plan.status === "returned" ? <Button type="button" onClick={() => act({ type: "submit_plan", id: plan.id }, "已提交主管审批。")}>提交主管</Button> : null}{manager && plan.status === "submitted" ? <><Button type="button" variant="primary" onClick={() => act({ type: "review_plan", id: plan.id, decision: "approved", reason: "主管确认方案逻辑和资源匹配" }, "方案已批准，进入执行。")}>批准</Button><Button type="button" onClick={() => act({ type: "review_plan", id: plan.id, decision: "returned", reason: "请补充数据基线和止损线" }, "方案已退回优化。")}>退回</Button></> : null}</div>{plan.status === "approved" ? <form className="ops-execution-form" onSubmit={e => { e.preventDefault(); act({ type: "append_execution", record: { ...execution, planId: plan.id, ownerId: plan.ownerId, ownerName: plan.ownerName } }, "执行与复盘记录已提交主管验收。" ); }}><h3>执行检查与复盘</h3><label>本次执行<textarea required value={execution.progress} onChange={e => setExecution({ ...execution, progress: e.target.value })} /></label><label>检测数据<input required value={execution.monitorData} onChange={e => setExecution({ ...execution, monitorData: e.target.value })} /></label><label>新问题与原因<input value={execution.issue} onChange={e => setExecution({ ...execution, issue: e.target.value })} /></label><label>下一步调整<input required value={execution.nextAction} onChange={e => setExecution({ ...execution, nextAction: e.target.value })} /></label><label>阶段复盘<textarea value={execution.review} onChange={e => setExecution({ ...execution, review: e.target.value })} /></label><Button variant="primary">提交执行记录</Button></form> : null}{planExecutions.map(item => <div className="ops-execution-item" key={item.id}><p><b>执行：</b>{item.progress}；<b>数据：</b>{item.monitorData}</p><p><b>下一步：</b>{item.nextAction}</p><span className="status-badge">{item.status}</span>{manager && item.status === "submitted" ? <div className="table-actions"><Button onClick={() => act({ type: "review_execution", id: item.id, decision: "accepted", reason: "执行结果和证据已核验" }, "执行记录已验收，可作为绩效证据。")}>验收</Button><Button onClick={() => act({ type: "review_execution", id: item.id, decision: "returned", reason: "检测数据或复盘不足" }, "执行记录已退回补充。")}>退回</Button></div> : null}</div>)}</article>;
      }) : <div className="empty-state">还没有重点产品方案。先把现状、目标和关键问题写清楚。</div>}</div></section>
    </div>
    </>
  );

  const collaboration = <><form className="section-panel ops-inline-form" onSubmit={e => { e.preventDefault(); act({ type: "upsert_collaboration", record: { ...collab, status: "pending", ownerId: user?.userId || user?.name } }, "协同事项已发起。" ); }}><h2>发起跨部门协同</h2><label>协同事项<input required value={collab.title} onChange={e => setCollab({ ...collab, title: e.target.value })} /></label><label>责任部门<select value={collab.targetDepartment} onChange={e => setCollab({ ...collab, targetDepartment: e.target.value })}><option>供应链部</option><option>产品部</option><option>品牌部</option><option>财务部</option></select></label><label>截止日<input type="date" required value={collab.dueDate} onChange={e => setCollab({ ...collab, dueDate: e.target.value })} /></label><Button variant="primary">发起协同</Button></form><section className="section-panel"><DataTable minWidth={760} columns={[{ key: "title", header: "事项", render: row => row.title }, { key: "department", header: "责任部门", render: row => row.targetDepartment }, { key: "due", header: "截止日", render: row => row.dueDate }, { key: "status", header: "状态", render: row => row.status }, { key: "action", header: "处理", render: row => row.status === "pending" && row.targetDepartment === currentDepartment && departmentManager ? <div className="table-actions"><Button onClick={() => act({ type: "respond_collaboration", id: row.id, record: { id: row.id, status: "accepted", reason: "责任部门已确认承接" } }, "协同事项已接受。")}>接受</Button><Button onClick={() => act({ type: "respond_collaboration", id: row.id, record: { id: row.id, status: "returned", reason: "当前信息或资源不足，请运营补充" } }, "协同事项已退回补充。")}>退回</Button></div> : "—" }]} rows={state.collaborations} empty="暂无协同事项。" /></section></>;

  const teamWorkspace = <><form className="section-panel ops-inline-form" onSubmit={e => { e.preventDefault(); act({ type: "upsert_responsibility", record: team }, "团队责任已更新。" ); }}><h2>运营团队责任</h2><label>成员<input required value={team.memberName} onChange={e => setTeam({ ...team, memberName: e.target.value })} /></label><label>平台/店铺<input required value={`${team.platform}${team.store ? ` / ${team.store}` : ""}`} onChange={e => setTeam({ ...team, platform: e.target.value, store: "" })} /></label><label>重点产品<input value={team.focusProduct} onChange={e => setTeam({ ...team, focusProduct: e.target.value })} /></label><Button variant="primary">保存责任</Button></form><section className="section-panel"><DataTable minWidth={680} columns={[{ key: "member", header: "成员", render: row => row.memberName }, { key: "scope", header: "负责范围", render: row => [row.platform, row.store].filter(Boolean).join(" / ") }, { key: "product", header: "重点产品", render: row => row.focusProduct || "—" }, { key: "coach", header: "主管辅导", render: row => row.coachingNote || "待安排" }]} rows={state.responsibilities} empty="尚未配置团队责任。这里用于分工和辅导，不显示绩效分。" /></section></>;

  const playbooks = <><form className="section-panel ops-inline-form" onSubmit={e => { e.preventDefault(); act({ type: "upsert_playbook", record: playbook }, "经营方法已沉淀。" ); }}><h2>沉淀经营方法</h2><label>方法名称<input required value={playbook.title} onChange={e => setPlaybook({ ...playbook, title: e.target.value })} /></label><label>适用场景<input required value={playbook.scenario} onChange={e => setPlaybook({ ...playbook, scenario: e.target.value })} /></label><label>方法与止损条件<textarea required value={playbook.method} onChange={e => setPlaybook({ ...playbook, method: e.target.value })} /></label><Button variant="primary">保存方法</Button></form><section className="ops-card-list">{state.playbooks.map(item => <article className="section-panel" key={item.id}><h2>{item.title}</h2><p><b>适用：</b>{item.scenario}</p><p>{item.method}</p></article>)}</section></>;

  const content = { dashboard, focus, collaboration, team: teamWorkspace, playbooks }[section] || dashboard;
  return <section className="page operations-page"><PageHeader title={title} description={description} identity="创建时间口径 · 截止昨天 · 默认不含其它" /><Notice message={error || feedback} tone={error ? "danger" : ""} />{loading ? <div className="section-panel empty-state">正在加载店铺经营数据…</div> : content}</section>;
}
