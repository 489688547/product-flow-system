import { AlertTriangle, ArrowRight, Building2, CheckCircle2, CircleDashed, ClipboardCheck, Plus, ShieldCheck, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { strategyAttainment } from "../../domain/executionGovernance.js";
import { canManagePermissions } from "../../domain/permissions.js";
import { usePlatform } from "../../state/PlatformProvider.jsx";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { Modal } from "../../ui/Modal.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { DepartmentCommitmentModal } from "./DepartmentCommitmentModal.jsx";
import { RequiredResultModal } from "./RequiredResultModal.jsx";

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

function CompanyStrategyView({ state, canManage, onEditResult }) {
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
            </header>
            <div className="attainment-rule"><ShieldCheck size={16} /><span><strong>达成规则：全部必达结果核验通过</strong><small>{strategy.successStandard}</small></span></div>
            <div className="required-result-list">
              {attainment.results.map(result => (
                <button type="button" className="required-result-row" key={result.id} onClick={() => canManage && onEditResult(result, strategy.id)}>
                  {result.status === "verified" ? <CheckCircle2 size={18} /> : result.status === "off_track" ? <AlertTriangle size={18} /> : <CircleDashed size={18} />}
                  <span><strong>{result.title}</strong><small>{result.acceptanceStandard}</small></span>
                  <span className="result-owner"><strong>{result.owner}</strong><small>截止 {result.dueDate || "待排期"}</small></span>
                  <StatusPill meta={RESULT_STATUS[result.status]} />
                </button>
              ))}
              {attainment.results.length < 6 && canManage ? <button type="button" className="add-inline-row" onClick={() => onEditResult(null, strategy.id)}><Plus size={16} />添加必达结果（每项战略 2–6 项）</button> : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function CommitmentActions({ commitment, canManage, onEdit, onTransition, onReturn }) {
  const status = commitment.status || "draft";
  return <div className="commitment-actions">
    {["draft", "returned"].includes(status) ? <><Button className="compact" onClick={onEdit}>编辑</Button><Button className="compact" variant="primary" onClick={() => onTransition("submit")}>提交审核</Button></> : null}
    {status === "office_review" && canManage ? <><Button className="compact" onClick={onReturn}>退回</Button><Button className="compact" variant="primary" onClick={() => onTransition("office_approve")}>审核通过</Button></> : null}
    {status === "executive_review" && canManage ? <><Button className="compact" onClick={onReturn}>退回</Button><Button className="compact" variant="primary" onClick={() => onTransition("executive_confirm")}>老板确认</Button></> : null}
    {["active", "at_risk", "off_track"].includes(status) ? <>
      {status !== "active" ? <Button className="compact" onClick={() => onTransition("resume")}>恢复正常</Button> : <Button className="compact" onClick={() => onTransition("mark_at_risk")}>标记风险</Button>}
      {status !== "off_track" ? <Button className="compact" onClick={() => onTransition("mark_off_track")}>标记偏离</Button> : null}
      <Button className="compact" variant="primary" onClick={() => onTransition("complete")}>确认完成</Button>
    </> : null}
  </div>;
}

function DepartmentCommitmentView({ state, canManage, onEdit, onTransition, onReturn }) {
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
          <CommitmentActions commitment={commitment} canManage={canManage} onEdit={() => onEdit(commitment)} onTransition={transition => onTransition(commitment.id, transition)} onReturn={() => onReturn(commitment)} />
          {commitment.statusReason ? <p className="commitment-reason"><AlertTriangle size={14} />{commitment.statusReason}</p> : null}
        </article>;
      })}
      {!state.departmentCommitments.length ? <div className="empty-state">尚未建立部门承诺。部门负责人可从公司战略拆出季度承诺，并设置月度里程碑。</div> : null}
    </section>
  </>;
}

export function StrategyCenterPage() {
  const { state, saveRequiredResult, saveDepartmentCommitment, saveCommitmentMilestone, transitionCommitment } = usePlatform();
  const { currentUser, orgCache } = useProductFlow();
  const [view, setView] = useState("strategy");
  const [resultEditor, setResultEditor] = useState(null);
  const [commitmentEditor, setCommitmentEditor] = useState(null);
  const [returning, setReturning] = useState(null);
  const canManage = canManagePermissions(currentUser);
  const canCreateCommitment = canManage || /负责人|经理|总监/.test(currentUser?.title || "");
  const editorMilestones = useMemo(() => commitmentEditor?.record ? state.commitmentMilestones.filter(item => item.commitmentId === commitmentEditor.record.id && !item.archived) : [], [commitmentEditor, state.commitmentMilestones]);
  const saveCommitment = (form, milestones) => {
    const id = form.id || `commitment-${Date.now()}`;
    saveDepartmentCommitment({ ...form, id });
    milestones.forEach((milestone, index) => saveCommitmentMilestone({ ...milestone, id: milestone.id || `commitment-milestone-${Date.now()}-${index}`, commitmentId: id }));
    setCommitmentEditor(null);
  };
  return (
    <section className="page strategy-center-page">
      <PageHeader title="战略中心" description={view === "strategy" ? "老板定义公司必须达成的结果；只有全部核验通过，战略才算达成。" : "部门负责人从公司战略拆出季度承诺，以月度里程碑推进并经过两级确认。"}>
        {view === "commitments" ? <Button variant="primary" disabled={!canCreateCommitment} disabledReason="部门负责人可以创建部门承诺" onClick={() => setCommitmentEditor({ record: null })}><Plus size={16} />新建部门承诺</Button> : null}
      </PageHeader>
      <div className="company-view-switch" role="tablist" aria-label="战略工作区">
        <button type="button" role="tab" aria-selected={view === "strategy"} className={view === "strategy" ? "active" : ""} onClick={() => setView("strategy")}><Target size={15} />公司战略<span>{state.strategies.length}</span></button>
        <button type="button" role="tab" aria-selected={view === "commitments"} className={view === "commitments" ? "active" : ""} onClick={() => setView("commitments")}><ClipboardCheck size={15} />部门承诺<span>{state.departmentCommitments.length}</span></button>
      </div>
      {view === "strategy" ? <CompanyStrategyView state={state} canManage={canManage} onEditResult={(record, strategyId) => setResultEditor({ record, strategyId })} /> : <DepartmentCommitmentView state={state} canManage={canManage} onEdit={record => setCommitmentEditor({ record })} onTransition={transitionCommitment} onReturn={setReturning} />}
      <RequiredResultModal open={Boolean(resultEditor)} record={resultEditor?.record} strategyId={resultEditor?.strategyId} orgCache={orgCache} onClose={() => setResultEditor(null)} onSave={form => { saveRequiredResult({ ...form, id: form.id || `required-result-${Date.now()}` }); setResultEditor(null); }} />
      <DepartmentCommitmentModal open={Boolean(commitmentEditor)} record={commitmentEditor?.record} milestones={editorMilestones} strategies={state.strategies.filter(item => !item.archived)} currentUser={currentUser} orgCache={orgCache} onClose={() => setCommitmentEditor(null)} onSave={saveCommitment} />
      <ReturnModal open={Boolean(returning)} target={returning} onClose={() => setReturning(null)} onConfirm={reason => { transitionCommitment(returning.id, "return", reason); setReturning(null); }} />
    </section>
  );
}
