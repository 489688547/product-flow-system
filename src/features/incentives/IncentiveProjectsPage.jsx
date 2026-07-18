import { AlertTriangle, BadgeDollarSign, CheckCircle2, Coins, Plus, Sparkles, Trash2, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { incentiveBudgetCheck } from "../../domain/executionGovernance.js";
import { canManagePermissions } from "../../domain/permissions.js";
import { usePlatform } from "../../state/PlatformProvider.jsx";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { ConfirmDialog } from "../../ui/ConfirmDialog.jsx";
import { Modal } from "../../ui/Modal.jsx";
import { OrgSelect } from "../../ui/OrgSelect.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";

const STATUS = {
  draft: ["草稿", "neutral"],
  pending_approval: ["待升级审批", "warning"],
  active: ["执行中", "info"],
  closing: ["待结项", "warning"],
  closed: ["已结项", "success"],
  cancelled: ["已取消", "neutral"]
};

function money(value) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function IncentiveStatus({ status }) {
  const meta = STATUS[status] || STATUS.draft;
  return <span className={`execution-status ${meta[1]}`}><i />{meta[0]}</span>;
}

function initialForm(record, currentUser) {
  return record ? { ...record } : {
    name: "",
    goal: "",
    department: currentUser?.department || "",
    owner: currentUser?.name || "",
    partnerDepartments: [],
    strategyId: "",
    year: new Date().getFullYear(),
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    rewardCap: 3000,
    evaluationStandard: "",
    payoutOwner: "",
    payoutDueDate: ""
  };
}

function IncentiveEditor({ open, record, state, currentUser, orgCache, onClose, onSave }) {
  const [form, setForm] = useState(() => initialForm(record, currentUser));
  const [error, setError] = useState("");
  useEffect(() => {
    setForm(initialForm(record, currentUser));
    setError("");
  }, [currentUser, open, record]);
  const set = patch => setForm(current => ({ ...current, ...patch }));
  const budget = incentiveBudgetCheck(state, form);
  const save = () => {
    if (!form.name.trim() || !form.goal.trim()) return setError("请填写项目名称和要优化的业务结果。");
    if (!form.department || !form.owner || !form.endDate) return setError("请选择责任部门、负责人和结束日期。");
    if (!form.evaluationStandard.trim()) return setError("请填写结项验收和奖金判断标准。");
    onSave({ ...form, status: form.status || (budget.requiresApproval ? "pending_approval" : "active") });
  };
  return (
    <Modal open={open} title={`${record ? "编辑" : "发起"}激励项目`} size="wide" onClose={onClose} footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={save}>{budget.requiresApproval ? "提交升级审批" : "直接立项"}</Button></>}>
      {error ? <div className="inline-alert" role="alert">{error}</div> : null}
      <div className={`budget-decision ${budget.requiresApproval ? "warning" : "success"}`}>
        {budget.requiresApproval ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
        <span><strong>{budget.requiresApproval ? "需要升级审批" : "部门预算内，可直接立项"}</strong><small>年度预算 {money(budget.budget)} · 已承诺 {money(budget.committed)} · 本次申请 {money(budget.requested)}</small></span>
      </div>
      <div className="form-grid">
        <label>项目名称<input value={form.name || ""} onChange={event => set({ name: event.target.value })} placeholder="例如：优化抖音投流效率" /></label>
        <label>关联战略<select value={form.strategyId || ""} onChange={event => set({ strategyId: event.target.value })}><option value="">额外改善项目，不关联战略</option>{state.strategies.map(strategy => <option key={strategy.id} value={strategy.id}>{strategy.name}</option>)}</select></label>
        <label>责任部门<OrgSelect type="department" value={form.department || ""} onChange={department => set({ department })} orgCache={orgCache} placeholder="选择部门…" /></label>
        <label>项目负责人<OrgSelect type="user" value={form.owner || ""} onChange={owner => set({ owner })} orgCache={orgCache} placeholder="选择负责人…" /></label>
        <label>协作部门<OrgSelect type="department" multiple searchInMenu value={(form.partnerDepartments || []).join(" / ")} onChange={value => set({ partnerDepartments: value.split(" / ").filter(Boolean) })} orgCache={orgCache} placeholder="可不选；跨部门将升级审批" /></label>
        <label>奖金上限（元）<input type="number" min="0" step="100" value={form.rewardCap ?? ""} onChange={event => set({ rewardCap: Number(event.target.value) })} /></label>
        <label>开始日期<input type="date" value={form.startDate || ""} onChange={event => set({ startDate: event.target.value })} /></label>
        <label>结束日期<input type="date" value={form.endDate || ""} onChange={event => set({ endDate: event.target.value })} /></label>
        <label>奖金发放人<OrgSelect type="user" value={form.payoutOwner || ""} onChange={payoutOwner => set({ payoutOwner })} orgCache={orgCache} placeholder="通常选择财务负责人" /></label>
        <label>奖金发放截止<input type="date" value={form.payoutDueDate || ""} onChange={event => set({ payoutDueDate: event.target.value })} /></label>
      </div>
      <label className="full-field">要改善的业务结果<textarea value={form.goal || ""} onChange={event => set({ goal: event.target.value })} placeholder="描述希望改变的业务指标或执行问题" /></label>
      <label className="full-field">结项与奖金判断标准<textarea value={form.evaluationStandard || ""} onChange={event => set({ evaluationStandard: event.target.value })} placeholder="写清如何验收，以及部门负责人依据什么决定最终奖金" /></label>
    </Modal>
  );
}

function SettlementModal({ open, project, currentUser, onClose, onSettle }) {
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setAmount(project?.rewardCap || 0);
    setReason("");
    setError("");
  }, [open, project]);
  const settle = () => {
    if (!reason.trim()) return setError("请填写最终奖金决定理由。");
    if (Number(amount) > Number(project?.rewardCap || 0)) return setError("最终奖金不能超过奖金上限。");
    onSettle({ amount: Number(amount), reason: reason.trim(), decidedBy: currentUser?.name || "" });
  };
  return (
    <Modal open={open} title="结项定奖" onClose={onClose} footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={settle}>确认结项并留痕</Button></>}>
      {error ? <div className="inline-alert" role="alert">{error}</div> : null}
      <div className="settlement-project"><strong>{project?.name}</strong><small>奖金上限 {money(project?.rewardCap)}</small></div>
      <label className="full-field">最终奖金（元）<input type="number" min="0" max={project?.rewardCap || 0} step="100" value={amount} onChange={event => setAmount(event.target.value)} /></label>
      <label className="full-field">决定理由<textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="说明结果达成情况、贡献判断和最终奖金依据" /></label>
    </Modal>
  );
}

export function IncentiveProjectsPage() {
  const { state, saveIncentiveProject, settleIncentive, archiveIncentiveProject } = usePlatform();
  const { currentUser, orgCache } = useProductFlow();
  const [editor, setEditor] = useState(null);
  const [settling, setSettling] = useState(null);
  const [filter, setFilter] = useState("active");
  const [confirming, setConfirming] = useState(null);
  const canManage = canManagePermissions(currentUser);
  const canCreate = canManage || /负责人|经理|总监/.test(currentUser?.title || "");
  const visible = useMemo(() => state.incentiveProjects.filter(project => !project.archived && (filter === "all" || (filter === "active" ? !["closed", "cancelled"].includes(project.status) : project.status === filter))), [filter, state.incentiveProjects]);
  const budgets = state.departmentRewardBudgets.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const committed = state.incentiveProjects.filter(item => !item.archived && !["closed", "cancelled"].includes(item.status)).reduce((sum, item) => sum + Number(item.rewardCap || 0), 0);
  const paid = state.incentiveProjects.filter(item => !item.archived).reduce((sum, item) => sum + Number(item.finalReward || 0), 0);
  return (
    <section className="page incentive-projects-page">
      <PageHeader title="部门激励" description="用短周期、有奖金的改善项目解决额外重要事项；预算内部门直接立项，结项后由部门负责人定奖并留痕。">
        <Button variant="primary" disabled={!canCreate} disabledReason="部门负责人可以发起激励项目" onClick={() => setEditor({ record: null })}><Plus size={16} />发起激励项目</Button>
      </PageHeader>
      <div className="incentive-budget-strip"><span><Coins size={18} /><small>年度部门奖金池</small><strong>{money(budgets)}</strong></span><span><BadgeDollarSign size={18} /><small>在途奖金上限</small><strong>{money(committed)}</strong></span><span><Sparkles size={18} /><small>已决定奖金</small><strong>{money(paid)}</strong></span><label>项目状态<select value={filter} onChange={event => setFilter(event.target.value)}><option value="active">进行中</option><option value="pending_approval">待审批</option><option value="closed">已结项</option><option value="all">全部</option></select></label></div>
      <section className="incentive-list" aria-label="激励项目列表">
        <div className="incentive-list-head"><span>改善项目</span><span>责任部门</span><span>奖金上限</span><span>周期</span><span>状态</span><span>操作</span></div>
        {visible.map(project => {
          const check = incentiveBudgetCheck(state, project);
          return <article className="incentive-list-row" key={project.id}>
            <span><strong>{project.name}</strong><small>{project.goal}</small></span>
            <span><strong>{project.department}</strong><small>{project.owner}</small></span>
            <span><strong>{money(project.rewardCap)}</strong><small>{project.finalReward != null ? `最终 ${money(project.finalReward)}` : check.requiresApproval ? "需升级审批" : "预算内"}</small></span>
            <span>{project.startDate || "待排期"}<small>至 {project.endDate || "待排期"}</small></span>
            <IncentiveStatus status={project.status} />
            <div className="commitment-actions">
              {project.status === "pending_approval" && canManage ? <Button className="compact" variant="primary" onClick={() => saveIncentiveProject({ ...project, status: "active" }, "批准跨部门或超预算激励项目")}>批准立项</Button> : null}
              {!['closed', 'cancelled'].includes(project.status) ? <><Button className="compact" onClick={() => setEditor({ record: project })}>编辑</Button><Button className="compact" variant="primary" onClick={() => setSettling(project)}>结项定奖</Button></> : null}
              {!['closed', 'cancelled', 'draft'].includes(project.status) ? <Button className="compact" onClick={() => setConfirming({ type: "cancel", project })}><XCircle size={14} />取消项目</Button> : null}
              {['draft', 'cancelled'].includes(project.status) ? <Button className="compact" variant="danger" onClick={() => setConfirming({ type: "archive", project })}><Trash2 size={14} />归档</Button> : null}
              {project.status === "closed" ? <span className="settled-note">{project.rewardReason}</span> : null}
            </div>
          </article>;
        })}
        {!visible.length ? <div className="empty-state">当前没有符合筛选条件的激励项目。可以从“优化抖音投流”等额外改善事项开始。</div> : null}
      </section>
      <IncentiveEditor open={Boolean(editor)} record={editor?.record} state={state} currentUser={currentUser} orgCache={orgCache} onClose={() => setEditor(null)} onSave={form => { saveIncentiveProject({ ...form, id: form.id || `incentive-${Date.now()}` }); setEditor(null); }} />
      <SettlementModal open={Boolean(settling)} project={settling} currentUser={currentUser} onClose={() => setSettling(null)} onSettle={award => { settleIncentive(settling.id, award); setSettling(null); }} />
      <ConfirmDialog open={Boolean(confirming)} title={confirming?.type === "cancel" ? "取消激励项目" : "归档激励项目"} message={confirming?.project?.name || "该激励项目"} description={confirming?.type === "cancel" ? "取消后项目停止执行，奖金承诺释放；之后仍可归档。" : "归档后不再出现在项目列表中，历史审计记录会保留。"} confirmLabel={confirming?.type === "cancel" ? "确认取消" : "确认归档"} onClose={() => setConfirming(null)} onConfirm={() => { if (confirming.type === "cancel") saveIncentiveProject({ ...confirming.project, status: "cancelled" }, "取消激励项目"); else archiveIncentiveProject(confirming.project.id); setConfirming(null); }} />
    </section>
  );
}
