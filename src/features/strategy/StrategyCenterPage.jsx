import { AlertTriangle, Building2, CheckCircle2, CircleDashed, ClipboardCheck, Pencil, Plus, ShieldCheck, Target, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { strategyAttainment } from "../../domain/executionGovernance.js";
import { canManagePermissions } from "../../domain/permissions.js";
import { usePlatform } from "../../state/PlatformProvider.jsx";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { Button, IconAction } from "../../ui/Button.jsx";
import { ConfirmDialog } from "../../ui/ConfirmDialog.jsx";
import { Modal } from "../../ui/Modal.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { DepartmentCommitmentModal } from "./DepartmentCommitmentModal.jsx";
import { RequiredResultModal } from "./RequiredResultModal.jsx";
import { StrategyEditorModal } from "./StrategyEditorModal.jsx";

const RESULT_STATUS = {
  active: ["推进中", "info"],
  at_risk: ["有风险", "warning"],
  off_track: ["已偏离", "danger"],
  verified: ["已核验", "success"]
};

const COMMITMENT_STATUS = {
  draft: ["草稿", "neutral"],
  office_review: ["总经办审核", "info"],
  executive_review: ["老板确认", "warning"],
  returned: ["已退回", "danger"],
  active: ["执行中", "success"],
  at_risk: ["有风险", "warning"],
  off_track: ["已偏离", "danger"],
  completed: ["已完成", "success"],
  cancelled: ["已取消", "neutral"]
};

function StatusPill({ meta = ["未知", "neutral"] }) {
  return <span className={`execution-status ${meta[1]}`}><i />{meta[0]}</span>;
}

function ReturnModal({ open, target, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  return (
    <Modal open={open} title="退回修改" onClose={onClose} footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" disabled={!reason.trim()} onClick={() => { onConfirm(reason.trim()); setReason(""); }}>确认退回</Button></>}>
      <p className="modal-guidance">请写清需要修改的内容，原因会保留在审计记录中。</p>
      <label className="full-field">退回原因<textarea autoFocus value={reason} onChange={event => setReason(event.target.value)} placeholder={`例如：${target?.title || "该承诺"}的验收口径需要明确数据来源`} /></label>
    </Modal>
  );
}

function CompanyStrategyView({ state, canManage, onEditStrategy, onDeleteStrategy, onEditResult, onDeleteResult }) {
  return (
    <div className="strategy-list execution-strategy-list">
      {state.strategies.filter(item => !item.archived).map(strategy => {
        const attainment = strategyAttainment(state, strategy.id);
        return (
          <section className="strategy-block" key={strategy.id}>
            <header className="strategy-block-header execution-strategy-header">
              <span className="strategy-icon"><Target size={19} /></span>
              <span className="strategy-block-copy"><strong>{strategy.name}</strong><small>{strategy.intent}</small></span>
              <div className="attainment-count"><strong>{attainment.completed}/{attainment.total}</strong><small>必达结果已核验</small></div>
              <StatusPill meta={attainment.attained ? ["战略达成", "success"] : ["尚未达成", "warning"]} />
              {canManage ? <span className="strategy-record-actions"><IconAction label="编辑公司战略" onClick={() => onEditStrategy(strategy)}><Pencil size={16} /></IconAction><IconAction label="归档公司战略" className="danger" onClick={() => onDeleteStrategy(strategy)}><Trash2 size={16} /></IconAction></span> : null}
            </header>
            <div className="attainment-rule"><ShieldCheck size={16} /><span><strong>达成规则：全部必达结果核验通过</strong><small>{strategy.successStandard}</small></span></div>
            <div className="required-result-list">
              {attainment.results.map(result => (
                <article className="required-result-row" key={result.id}>
                  {result.status === "verified" ? <CheckCircle2 size={18} /> : result.status === "off_track" ? <AlertTriangle size={18} /> : <CircleDashed size={18} />}
                  <span><strong>{result.title}</strong><small>{result.acceptanceStandard}</small></span>
                  <span className="result-owner"><strong>{result.owner}</strong><small>截止 {result.dueDate || "待排期"}</small></span>
                  <StatusPill meta={RESULT_STATUS[result.status]} />
                  {canManage ? <span className="strategy-record-actions"><IconAction label="编辑必达结果" onClick={() => onEditResult(result, strategy.id)}><Pencil size={15} /></IconAction><IconAction label="归档必达结果" className="danger" onClick={() => onDeleteResult(result)}><Trash2 size={15} /></IconAction></span> : null}
                </article>
              ))}
              {attainment.results.length < 6 && canManage ? <button type="button" className="add-inline-row" onClick={() => onEditResult(null, strategy.id)}><Plus size={16} />添加必达结果（每项战略 2–6 项）</button> : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function CommitmentActions({ commitment, canManage, onEdit, onDelete, onTransition, onReturn }) {
  const status = commitment.status || "draft";
  return <div className="commitment-actions">
    {["draft", "returned"].includes(status) ? <><Button className="compact" onClick={onEdit}>编辑</Button><Button className="compact" variant="primary" onClick={() => onTransition("submit")}>提交审核</Button><IconAction label="归档部门承诺" className="danger" onClick={onDelete}><Trash2 size={15} /></IconAction></> : null}
    {canManage && !["draft", "returned", "completed", "cancelled"].includes(status) ? <Button className="compact" onClick={onEdit}>编辑</Button> : null}
    {status === "office_review" && canManage ? <><Button className="compact" onClick={onReturn}>退回</Button><Button className="compact" variant="primary" onClick={() => onTransition("office_approve")}>审核通过</Button></> : null}
    {status === "executive_review" && canManage ? <><Button className="compact" onClick={onReturn}>退回</Button><Button className="compact" variant="primary" onClick={() => onTransition("executive_confirm")}>老板确认</Button></> : null}
    {["active", "at_risk", "off_track"].includes(status) ? <>
      {status !== "active" ? <Button className="compact" onClick={() => onTransition("resume")}>恢复正常</Button> : <Button className="compact" onClick={() => onTransition("mark_at_risk")}>标记风险</Button>}
      {status !== "off_track" ? <Button className="compact" onClick={() => onTransition("mark_off_track")}>标记偏离</Button> : null}
      <Button className="compact" variant="primary" onClick={() => onTransition("complete")}>确认完成</Button>
    </> : null}
  </div>;
}

function DepartmentCommitmentView({ state, canManage, onEdit, onDelete, onTransition, onReturn }) {
  const active = state.departmentCommitments.filter(item => !item.archived && !["completed", "cancelled"].includes(item.status)).length;
  const waiting = state.departmentCommitments.filter(item => ["office_review", "executive_review"].includes(item.status)).length;
  const abnormal = state.departmentCommitments.filter(item => ["returned", "at_risk", "off_track"].includes(item.status)).length;
  return <>
    <div className="execution-summary-strip"><span><strong>{state.departmentCommitments.length}</strong><small>部门承诺</small></span><span><strong>{active}</strong><small>执行与流转中</small></span><span><strong>{waiting}</strong><small>待审核确认</small></span><span className={abnormal ? "danger" : ""}><strong>{abnormal}</strong><small>风险与退回</small></span></div>
    <section className="commitment-table" aria-label="部门承诺列表">
      <div className="commitment-table-head"><span>部门承诺</span><span>关联战略</span><span>负责人</span><span>下一里程碑</span><span>状态</span><span>操作</span></div>
      {state.departmentCommitments.filter(item => !item.archived).map(commitment => {
        const strategy = state.strategies.find(item => item.id === commitment.strategyId);
        const milestones = state.commitmentMilestones.filter(item => item.commitmentId === commitment.id && !item.archived);
        const next = milestones.filter(item => item.status !== "completed").sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0];
        return <article className="commitment-table-row" key={commitment.id}>
          <span><Building2 size={17} /><span><strong>{commitment.title}</strong><small>{commitment.period} · {commitment.successStandard}</small></span></span>
          <span>{strategy?.name || "未关联"}</span>
          <span>{commitment.owner}<small>{commitment.department}</small></span>
          <span>{next?.title || "里程碑已完成"}<small>{next?.dueDate || commitment.dueDate || "待排期"}</small></span>
          <StatusPill meta={COMMITMENT_STATUS[commitment.status]} />
          <CommitmentActions commitment={commitment} canManage={canManage} onEdit={() => onEdit(commitment)} onDelete={() => onDelete(commitment)} onTransition={transition => onTransition(commitment.id, transition)} onReturn={() => onReturn(commitment)} />
          {commitment.statusReason ? <p className="commitment-reason"><AlertTriangle size={14} />{commitment.statusReason}</p> : null}
        </article>;
      })}
      {!state.departmentCommitments.length ? <div className="empty-state">尚未建立部门承诺。部门负责人可从公司战略拆出季度承诺，并设置月度里程碑。</div> : null}
    </section>
  </>;
}

export function StrategyCenterPage() {
  const { state, saveStrategy, saveRequiredResult, saveDepartmentCommitment, saveCommitmentMilestone, transitionCommitment, archiveStrategy, archiveRequiredResult, archiveDepartmentCommitment, archiveCommitmentMilestone } = usePlatform();
  const { currentUser, orgCache } = useProductFlow();
  const [view, setView] = useState("strategy");
  const [resultEditor, setResultEditor] = useState(null);
  const [strategyEditor, setStrategyEditor] = useState(null);
  const [commitmentEditor, setCommitmentEditor] = useState(null);
  const [returning, setReturning] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const canManage = canManagePermissions(currentUser);
  const canCreateCommitment = canManage || /负责人|经理|总监/.test(currentUser?.title || "");
  const editorMilestones = useMemo(() => commitmentEditor?.record ? state.commitmentMilestones.filter(item => item.commitmentId === commitmentEditor.record.id && !item.archived) : [], [commitmentEditor, state.commitmentMilestones]);
  const saveCommitment = (form, milestones) => {
    const id = form.id || `commitment-${Date.now()}`;
    saveDepartmentCommitment({ ...form, id });
    milestones.forEach((milestone, index) => saveCommitmentMilestone({ ...milestone, id: milestone.id || `commitment-milestone-${Date.now()}-${index}`, commitmentId: id }));
    editorMilestones.filter(existing => !milestones.some(item => item.id === existing.id)).forEach(existing => archiveCommitmentMilestone(existing.id));
    setCommitmentEditor(null);
  };
  const requestStrategyArchive = strategy => {
    const commitmentCount = state.departmentCommitments.filter(item => item.strategyId === strategy.id && !item.archived && !["completed", "cancelled"].includes(item.status)).length;
    const projectCount = state.projects.filter(item => item.strategyId === strategy.id && !item.archived && !["completed", "cancelled"].includes(item.status)).length;
    setDeleting({ kind: "strategy", record: strategy, blocked: commitmentCount || projectCount ? `当前仍有关联的 ${commitmentCount} 个部门承诺和 ${projectCount} 个重点项目，请先完成或取消后再归档。` : "关联的必达结果会一并归档，历史审计记录会保留。" });
  };
  const confirmArchive = () => {
    if (deleting.blocked?.startsWith("当前仍有")) return setDeleting(null);
    if (deleting.kind === "strategy") archiveStrategy(deleting.record.id);
    if (deleting.kind === "result") archiveRequiredResult(deleting.record.id);
    if (deleting.kind === "commitment") archiveDepartmentCommitment(deleting.record.id);
    setDeleting(null);
  };
  return (
    <section className="page strategy-center-page">
      <PageHeader title="战略中心" description={view === "strategy" ? "老板定义公司必须达成的结果；只有全部核验通过，战略才算达成。" : "部门负责人从公司战略拆出季度承诺，以月度里程碑推进并经过两级确认。"}>
        {view === "strategy" ? <Button variant="primary" disabled={!canManage} disabledReason="总经办可以维护公司战略" onClick={() => setStrategyEditor({ record: null })}><Plus size={16} />新建公司战略</Button> : <Button variant="primary" disabled={!canCreateCommitment} disabledReason="部门负责人可以创建部门承诺" onClick={() => setCommitmentEditor({ record: null })}><Plus size={16} />新建部门承诺</Button>}
      </PageHeader>
      <div className="company-view-switch" role="tablist" aria-label="战略工作区">
        <button type="button" role="tab" aria-selected={view === "strategy"} className={view === "strategy" ? "active" : ""} onClick={() => setView("strategy")}><Target size={15} />公司战略<span>{state.strategies.length}</span></button>
        <button type="button" role="tab" aria-selected={view === "commitments"} className={view === "commitments" ? "active" : ""} onClick={() => setView("commitments")}><ClipboardCheck size={15} />部门承诺<span>{state.departmentCommitments.length}</span></button>
      </div>
      {view === "strategy" ? <CompanyStrategyView state={state} canManage={canManage} onEditStrategy={record => setStrategyEditor({ record })} onDeleteStrategy={requestStrategyArchive} onEditResult={(record, strategyId) => setResultEditor({ record, strategyId })} onDeleteResult={record => setDeleting({ kind: "result", record, blocked: "该必达结果会从战略达成计算中移除，历史审计记录会保留。" })} /> : <DepartmentCommitmentView state={state} canManage={canManage} onEdit={record => setCommitmentEditor({ record })} onDelete={record => setDeleting({ kind: "commitment", record, blocked: "该承诺及其月度里程碑会一并归档，历史审计记录会保留。" })} onTransition={transitionCommitment} onReturn={setReturning} />}
      <StrategyEditorModal open={Boolean(strategyEditor)} kind="strategy" record={strategyEditor?.record} orgCache={orgCache} onClose={() => setStrategyEditor(null)} onSave={form => { saveStrategy({ ...form, id: form.id || `strategy-${Date.now()}` }); setStrategyEditor(null); }} />
      <RequiredResultModal open={Boolean(resultEditor)} record={resultEditor?.record} strategyId={resultEditor?.strategyId} orgCache={orgCache} onClose={() => setResultEditor(null)} onSave={form => { saveRequiredResult({ ...form, id: form.id || `required-result-${Date.now()}` }); setResultEditor(null); }} />
      <DepartmentCommitmentModal open={Boolean(commitmentEditor)} record={commitmentEditor?.record} milestones={editorMilestones} strategies={state.strategies.filter(item => !item.archived)} currentUser={currentUser} orgCache={orgCache} onClose={() => setCommitmentEditor(null)} onSave={saveCommitment} />
      <ReturnModal open={Boolean(returning)} target={returning} onClose={() => setReturning(null)} onConfirm={reason => { transitionCommitment(returning.id, "return", reason); setReturning(null); }} />
      <ConfirmDialog open={Boolean(deleting)} title={deleting?.blocked?.startsWith("当前仍有") ? "暂时不能归档" : "确认归档"} message={deleting?.record?.name || deleting?.record?.title || "该记录"} description={deleting?.blocked} confirmLabel={deleting?.blocked?.startsWith("当前仍有") ? "知道了" : "确认归档"} onClose={() => setDeleting(null)} onConfirm={confirmArchive} />
    </section>
  );
}
