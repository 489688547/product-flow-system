import { CalendarCheck, CheckCircle2, Clock3, FileText, History, LockKeyhole, Plus } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { canManagePermissions } from "../../domain/permissions.js";
import { usePlatform } from "../../state/PlatformProvider.jsx";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { Modal } from "../../ui/Modal.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { HealthBadge } from "../company/HealthBadge.jsx";
import { StatusUpdateModal } from "./StatusUpdateModal.jsx";

const StrategyTrendChart = lazy(() => import("../company/StrategyTrendChart.jsx"));

const REPORT_STATUS = {
  draft: ["待填写", "neutral"],
  returned: ["已退回", "danger"],
  submitted: ["待总经办审核", "info"],
  approved: ["待会议冻结", "warning"],
  frozen: ["已冻结", "success"]
};

function previousMonth() {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - 1);
  return date.toISOString().slice(0, 7);
}

function reportStatus(status) {
  const meta = REPORT_STATUS[status] || REPORT_STATUS.draft;
  return <span className={`execution-status ${meta[1]}`}><i />{meta[0]}</span>;
}

function reportForm(record) {
  return {
    ...record,
    keyResults: record?.keyResults || "",
    incompleteItems: record?.incompleteItems || "",
    nextMonthPriorities: record?.nextMonthPriorities || "",
    risks: record?.risks || "",
    coordinationNeeds: record?.coordinationNeeds || "",
    decisionNeeds: record?.decisionNeeds || ""
  };
}

function MonthlyReportEditor({ open, report, onClose, onSave }) {
  const [form, setForm] = useState(() => reportForm(report));
  const [error, setError] = useState("");
  useEffect(() => {
    setForm(reportForm(report));
    setError("");
  }, [open, report]);
  const set = patch => setForm(current => ({ ...current, ...patch }));
  const save = () => {
    if (!form.keyResults.trim() || !form.nextMonthPriorities.trim()) return setError("请至少填写本月重点成果和下月重点。");
    onSave(form);
  };
  return (
    <Modal open={open} title={`${report?.department || "部门"} · ${report?.month || ""} 月度汇报`} size="wide" onClose={onClose} footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={save}>保存月报</Button></>}>
      {error ? <div className="inline-alert" role="alert">{error}</div> : null}
      {report?.returnReason ? <div className="report-return-reason">退回原因：{report.returnReason}</div> : null}
      <p className="modal-guidance">全部内容由部门负责人手工填写，系统只负责收集、流转和冻结，不自动生成汇报文字。</p>
      <div className="monthly-report-fields">
        <label><span>重点成果<strong>必填</strong></span><textarea value={form.keyResults} onChange={event => set({ keyResults: event.target.value })} placeholder="本月最重要的结果、数据和证据" /></label>
        <label><span>未完成事项</span><textarea value={form.incompleteItems} onChange={event => set({ incompleteItems: event.target.value })} placeholder="没有完成什么，原因是什么" /></label>
        <label><span>下月重点<strong>必填</strong></span><textarea value={form.nextMonthPriorities} onChange={event => set({ nextMonthPriorities: event.target.value })} placeholder="下月必须推进的 1–3 项重点" /></label>
        <label><span>风险</span><textarea value={form.risks} onChange={event => set({ risks: event.target.value })} placeholder="可能影响结果的风险" /></label>
        <label><span>需协调事项</span><textarea value={form.coordinationNeeds} onChange={event => set({ coordinationNeeds: event.target.value })} placeholder="需要其他部门或总经办协调什么" /></label>
        <label><span>需决策事项</span><textarea value={form.decisionNeeds} onChange={event => set({ decisionNeeds: event.target.value })} placeholder="需要老板拍板的事项和建议" /></label>
      </div>
    </Modal>
  );
}

function ReportActionModal({ action, onClose, onConfirm }) {
  const [text, setText] = useState("");
  const title = action?.type === "freeze" ? "冻结月报" : action?.type === "correction" ? "追加更正" : "退回月报";
  const label = action?.type === "freeze" ? "月度会议结论" : action?.type === "correction" ? "更正说明" : "退回原因";
  useEffect(() => setText(""), [action]);
  return (
    <Modal open={Boolean(action)} title={title} onClose={onClose} footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" disabled={!text.trim()} onClick={() => onConfirm(text.trim())}>{action?.type === "freeze" ? "确认冻结" : "确认提交"}</Button></>}>
      <p className="modal-guidance">{action?.type === "freeze" ? "冻结后原文不可覆盖，只能追加有时间和责任人的更正记录。" : "这段说明会永久保留在月报记录中。"}</p>
      <label className="full-field">{label}<textarea autoFocus value={text} onChange={event => setText(event.target.value)} /></label>
    </Modal>
  );
}

function MonthlyReportWorkspace({ state, currentUser, orgCache, executive, ensureReports, saveMonthlyReport, transitionReport, appendReportCorrection }) {
  const [month, setMonth] = useState(previousMonth);
  const [editor, setEditor] = useState(null);
  const [action, setAction] = useState(null);
  const departments = useMemo(() => (orgCache?.departments || []).map(item => typeof item === "string" ? item : item?.name).filter(Boolean), [orgCache?.departments]);
  useEffect(() => {
    if (executive && departments.length) ensureReports(month, departments);
  }, [departments, ensureReports, executive, month]);
  const reports = state.monthlyReports.filter(report => report.month === month);
  const visible = executive ? reports : reports.filter(report => report.department === currentUser?.department || report.owner === currentUser?.name);
  const counts = Object.fromEntries(Object.keys(REPORT_STATUS).map(status => [status, reports.filter(item => item.status === status).length]));
  const confirmAction = text => {
    if (action.type === "return") transitionReport(action.report.id, "return", { reason: text });
    if (action.type === "freeze") transitionReport(action.report.id, "freeze", { meetingConclusion: text });
    if (action.type === "correction") appendReportCorrection(action.report.id, text);
    setAction(null);
  };
  return <>
    <div className="monthly-report-toolbar">
      <div className="execution-summary-strip"><span><strong>{reports.length}</strong><small>应汇报部门</small></span><span><strong>{counts.submitted + counts.approved + counts.frozen}</strong><small>已提交</small></span><span><strong>{counts.returned}</strong><small>已退回</small></span><span><strong>{counts.frozen}</strong><small>已冻结</small></span></div>
      <label>汇报月份<input type="month" value={month} onChange={event => setMonth(event.target.value)} /></label>
    </div>
    <section className="monthly-report-list" aria-label="部门月报列表">
      <div className="monthly-report-head"><span>部门</span><span>重点成果</span><span>下月重点</span><span>负责人</span><span>状态</span><span>操作</span></div>
      {visible.map(report => <article className="monthly-report-row" key={report.id}>
        <span><FileText size={17} /><span><strong>{report.department}</strong><small>{report.month} 月度汇报</small></span></span>
        <span>{report.keyResults || "尚未填写"}</span>
        <span>{report.nextMonthPriorities || "尚未填写"}</span>
        <span>{report.owner || "待指定"}</span>
        {reportStatus(report.status)}
        <div className="commitment-actions">
          {["draft", "returned"].includes(report.status) ? <><Button className="compact" onClick={() => setEditor(report)}>填写</Button><Button className="compact" variant="primary" disabled={!report.keyResults || !report.nextMonthPriorities} onClick={() => transitionReport(report.id, "submit")}>提交</Button></> : null}
          {report.status === "submitted" && executive ? <><Button className="compact" onClick={() => setAction({ type: "return", report })}>退回</Button><Button className="compact" variant="primary" onClick={() => transitionReport(report.id, "approve")}>审核通过</Button></> : null}
          {report.status === "approved" && executive ? <><Button className="compact" onClick={() => setAction({ type: "return", report })}>退回</Button><Button className="compact" variant="primary" onClick={() => setAction({ type: "freeze", report })}><LockKeyhole size={14} />冻结</Button></> : null}
          {report.status === "frozen" ? <Button className="compact" onClick={() => setAction({ type: "correction", report })}>追加更正</Button> : null}
        </div>
        {report.meetingConclusion ? <p className="report-meeting-conclusion"><CheckCircle2 size={14} />会议结论：{report.meetingConclusion}</p> : null}
        {(report.corrections || []).map(correction => <p className="report-correction" key={correction.id}>更正：{correction.text} · {correction.actor} · {correction.createdAt?.slice(0, 16).replace("T", " ")}</p>)}
      </article>)}
      {!visible.length ? <div className="empty-state">当前月份没有需要你处理的部门月报。</div> : null}
    </section>
    <MonthlyReportEditor open={Boolean(editor)} report={editor} onClose={() => setEditor(null)} onSave={form => { saveMonthlyReport({ ...form, owner: form.owner || currentUser?.name || "", ownerUnionId: form.ownerUnionId || currentUser?.unionId || currentUser?.unionid || "", reviewerName: form.reviewerName || "周荣庆", freezerName: form.freezerName || "周荣庆", dueDate: form.dueDate || `${month}-05` }); setEditor(null); }} />
    <ReportActionModal action={action} onClose={() => setAction(null)} onConfirm={confirmAction} />
  </>;
}

function WeeklyReviewWorkspace({ state, currentUser, executive, dispatch }) {
  const [updateOpen, setUpdateOpen] = useState(false);
  const ownedProjects = state.projects.filter(project => executive || [project.owner, project.sponsor].includes(currentUser?.name));
  return <>
    <div className="review-cadence-strip"><span><Clock3 size={18} /><strong>每周</strong><small>负责人确认变化、风险与协调请求</small></span><span><CalendarCheck size={18} /><strong>每月</strong><small>部门手工汇报，总经办审核后会议冻结</small></span><span><History size={18} /><strong>长期</strong><small>冻结内容不可覆盖，仅可追加更正</small></span></div>
    <section className="company-work-section">
      <div className="panel-title"><CheckCircle2 size={18} /><h2>本周确认记录</h2><Button className="compact" variant="primary" onClick={() => setUpdateOpen(true)}><Plus size={15} />提交状态</Button></div>
      {state.statusUpdates.slice(0, 20).map(update => { const project = state.projects.find(item => item.id === update.projectId); return <div className="review-update-row" key={update.id}><span className="review-update-date">{update.week?.slice(5) || "本周"}</span><span><strong>{project?.name || "未关联项目"}</strong><small>{update.owner} · {update.change}</small><em>{update.largestRisk}</em></span>{update.needsDecision ? <span className="review-request">需决策</span> : update.needsCoordination ? <span className="review-request">需协调</span> : null}</div>; })}
      {!state.statusUpdates.length ? <div className="empty-state">尚未提交周度状态确认。</div> : null}
    </section>
    <StatusUpdateModal open={updateOpen} projects={ownedProjects} currentUser={currentUser} onClose={() => setUpdateOpen(false)} onSave={form => { dispatch({ type: "append_status_update", record: { ...form, id: `status-${Date.now()}`, week: new Date().toISOString().slice(0, 10) } }); setUpdateOpen(false); }} />
  </>;
}

function HistoryWorkspace({ state }) {
  return <>
    <section className="company-work-section"><div className="panel-title"><History size={18} /><h2>战略健康度趋势</h2></div><Suspense fallback={<div className="strategy-trend-empty">正在加载趋势…</div>}><StrategyTrendChart snapshots={state.monthlySnapshots} /></Suspense></section>
    <section className="company-work-section"><div className="panel-title"><History size={18} /><h2>历史快照</h2></div><div className="snapshot-history-list">{[...state.monthlySnapshots].sort((a, b) => String(b.month).localeCompare(String(a.month))).map(snapshot => <div key={snapshot.id}><span><strong>{snapshot.month}</strong><small>{snapshot.conclusion}</small></span><span className="snapshot-health-counts"><HealthBadge health={snapshot.summary?.offTrack ? "off_track" : snapshot.summary?.atRisk ? "at_risk" : "normal"} /><small>正常 {snapshot.summary?.normal || 0} · 风险 {snapshot.summary?.atRisk || 0} · 偏离 {snapshot.summary?.offTrack || 0}</small></span></div>)}{!state.monthlySnapshots.length ? <div className="empty-state">完成首次月度经营检查后，这里会保留不可覆盖的历史。</div> : null}</div></section>
  </>;
}

export function OperatingReviewPage() {
  const { state, dispatch, ensureReports, saveMonthlyReport, transitionReport, appendReportCorrection } = usePlatform();
  const { currentUser, orgCache } = useProductFlow();
  const [view, setView] = useState("reports");
  const executive = canManagePermissions(currentUser);
  return (
    <section className="page operating-review-page">
      <PageHeader title="经营检查" description={view === "reports" ? "每月初由部门负责人手工汇报上月重点，总经办审核，月度会议后冻结。" : "持续确认经营事实，并保留不可覆盖的历史记录。"} />
      <div className="company-view-switch" role="tablist" aria-label="经营检查视图">
        <button type="button" role="tab" aria-selected={view === "reports"} className={view === "reports" ? "active" : ""} onClick={() => setView("reports")}><FileText size={15} />部门月报<span>{state.monthlyReports.filter(item => item.status !== "frozen").length}</span></button>
        <button type="button" role="tab" aria-selected={view === "weekly"} className={view === "weekly" ? "active" : ""} onClick={() => setView("weekly")}><Clock3 size={15} />周度确认</button>
        <button type="button" role="tab" aria-selected={view === "history"} className={view === "history" ? "active" : ""} onClick={() => setView("history")}><History size={15} />历史快照</button>
      </div>
      {view === "reports" ? <MonthlyReportWorkspace state={state} currentUser={currentUser} orgCache={orgCache} executive={executive} ensureReports={ensureReports} saveMonthlyReport={saveMonthlyReport} transitionReport={transitionReport} appendReportCorrection={appendReportCorrection} /> : view === "weekly" ? <WeeklyReviewWorkspace state={state} currentUser={currentUser} executive={executive} dispatch={dispatch} /> : <HistoryWorkspace state={state} />}
    </section>
  );
}
