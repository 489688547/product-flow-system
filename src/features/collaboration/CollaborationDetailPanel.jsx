import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Check, ChevronRight, Pencil, X } from "lucide-react";
import { collaborationTransitionsFor } from "../../domain/collaboration.js";
import { orgUsers } from "../../domain/productFlow.js";
import { useCollaboration } from "../../state/CollaborationProvider.jsx";
import { Button, IconAction } from "../../ui/Button.jsx";
import { OrgSelect } from "../../ui/OrgSelect.jsx";
import { CollaborationStatusBadge } from "./CollaborationStatusBadge.jsx";

const ACTION_LABELS = {
  accept: "确认接收",
  return: "退回补充",
  resubmit: "重新提交",
  block: "标记阻塞并请求协调",
  resume: "恢复执行",
  submit: "提交发起方验收",
  verify: "验收并关闭",
  reopen: "重新打开",
  cancel: "取消事项",
  escalate: "升级总经办协调",
  decide: "记录决策并关闭"
};
const REASON_ACTIONS = new Set(["return", "block", "resume", "reopen", "cancel", "escalate"]);

function actorFor(user) {
  return {
    userId: user?.userId,
    unionId: user?.unionId,
    name: user?.name,
    departmentIds: [user?.departmentId, ...(user?.departmentIds || [])].filter(Boolean),
    departmentNames: [user?.department, ...(user?.departments || []), ...(user?.departmentNames || [])].filter(Boolean),
    executive: [user?.department, ...(user?.departments || [])].includes("总经办") || user?.role === "executive",
    readonly: user?.role === "readonly"
  };
}

function identityFor(name, orgCache) {
  const user = orgUsers(orgCache).find(candidate => candidate.name === name);
  return name ? { userId: user?.userId || "", unionId: user?.unionId || "", name } : null;
}

function dateTime(value) {
  return value ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short", hour12: false }).format(new Date(value)) : "未设置";
}

export function CollaborationDetailPanel({ item, currentUser, orgCache, onClose, onEdit }) {
  const { activitiesByItem, loadActivities, transitionItem, saving } = useCollaboration();
  const [action, setAction] = useState("");
  const [reason, setReason] = useState("");
  const [ownerName, setOwnerName] = useState(item?.ownerUser?.name || "");
  const [completionSummary, setCompletionSummary] = useState("");
  const [decisionOutcome, setDecisionOutcome] = useState("recommended");
  const [decisionSummary, setDecisionSummary] = useState("");
  const [actionError, setActionError] = useState("");
  const actor = useMemo(() => actorFor(currentUser), [currentUser]);
  const allowed = useMemo(() => item ? collaborationTransitionsFor(item, actor) : [], [actor, item]);
  const activities = item ? activitiesByItem[item.id] || [] : [];

  useEffect(() => {
    if (!item) return;
    setAction("");
    setReason("");
    setOwnerName(item.ownerUser?.name || "");
    setActionError("");
    loadActivities(item.id).catch(() => {});
  }, [item?.id]);

  if (!item) return null;

  async function submitAction() {
    const fields = {};
    if (action === "accept") fields.ownerUser = identityFor(ownerName, orgCache);
    if (action === "submit") fields.completionSummary = completionSummary;
    if (action === "block" || action === "escalate") fields.coordinationNeed = reason;
    if (action === "decide") Object.assign(fields, { decisionOutcome, decisionSummary });
    if (REASON_ACTIONS.has(action) && !reason.trim()) {
      setActionError("请填写执行该动作的原因和需要协调的事实。");
      return;
    }
    try {
      await transitionItem(item.id, { version: item.version, transition: action, idempotencyKey: `ui:${item.id}:${action}:${Date.now()}`, reason: reason.trim(), fields });
      setAction("");
      setReason("");
      setCompletionSummary("");
      setDecisionSummary("");
      setActionError("");
    } catch (error) {
      setActionError(error.message || "状态更新失败。");
    }
  }

  return (
    <aside className="collaboration-detail" aria-label={`协同详情：${item.title}`}>
      <header>
        <div><CollaborationStatusBadge status={item.status} archived={Boolean(item.archivedAt)} /><h2>{item.title}</h2><p>{item.requestedAction}</p></div>
        <span className="collaboration-detail-tools"><IconAction label="编辑协同事项" onClick={() => onEdit(item)}><Pencil size={17} /></IconAction><IconAction label="关闭详情" onClick={onClose}><X size={18} /></IconAction></span>
      </header>

      {allowed.length ? <section className="collaboration-current-action"><span className="eyebrow">当前行动</span><strong>{ACTION_LABELS[allowed[0]]}</strong><p>由当前责任人确认动作后，系统记录状态和活动历史。</p><div className="collaboration-action-buttons">{allowed.map(name => <Button key={name} variant={name === "accept" || name === "verify" || name === "decide" ? "primary" : "secondary"} className="compact" onClick={() => setAction(name)}>{ACTION_LABELS[name]}</Button>)}</div></section> : <section className="collaboration-current-action quiet"><span className="eyebrow">当前行动</span><strong>等待下一责任方处理</strong><p>你仍可查看来源、责任关系和完整活动记录。</p></section>}

      {action ? <section className="collaboration-action-form" aria-label={ACTION_LABELS[action]}>
        <div><strong>{ACTION_LABELS[action]}</strong><button type="button" onClick={() => setAction("")} aria-label="取消当前动作"><X size={15} /></button></div>
        {action === "accept" ? <OrgSelect label="唯一主负责人" value={ownerName} onChange={setOwnerName} orgCache={orgCache} departmentFilter={item.ownerDepartment?.name} searchInMenu /> : null}
        {REASON_ACTIONS.has(action) ? <label><span>原因与协调事实</span><textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="说明原因、影响和下一步" /></label> : null}
        {action === "submit" ? <label><span>完成结果</span><textarea value={completionSummary} onChange={event => setCompletionSummary(event.target.value)} placeholder="说明完成了什么、如何验收" /></label> : null}
        {action === "decide" ? <><label><span>决策结果</span><select value={decisionOutcome} onChange={event => setDecisionOutcome(event.target.value)}><option value="recommended">同意推荐方案</option><option value="alternative">选择备选方案</option><option value="custom">其他决策</option></select></label><label><span>决策说明</span><textarea value={decisionSummary} onChange={event => setDecisionSummary(event.target.value)} /></label></> : null}
        {actionError ? <p className="collaboration-action-error" role="alert">{actionError}</p> : null}
        <Button variant="primary" disabled={saving} onClick={submitAction}><Check size={15} />确认执行</Button>
      </section> : null}

      <section className="collaboration-detail-section"><h3>责任关系</h3><dl><div><dt>发起部门</dt><dd>{item.requesterDepartment?.name || "未识别"}</dd></div><div><dt>主责部门</dt><dd>{item.ownerDepartment?.name || "待指定"}</dd></div><div><dt>主负责人</dt><dd>{item.ownerUser?.name || "待接收时指定"}</dd></div><div><dt>截止时间</dt><dd>{dateTime(item.dueAt)}</dd></div><div><dt>协同部门</dt><dd>{item.partnerDepartments?.map(department => department.name).join("、") || "无"}</dd></div></dl></section>
      <section className="collaboration-detail-section"><h3>业务影响与完成结果</h3><p>{item.businessImpact || "未填写业务影响"}</p>{item.completionSummary ? <div className="collaboration-result"><strong>提交结果</strong><p>{item.completionSummary}</p></div> : null}</section>
      <section className="collaboration-detail-section"><h3>来源与关联</h3><div className="collaboration-source-card"><span><strong>{item.source?.sourceLabel || "协同工作台"}</strong><small>{item.source?.appId || "manual"}</small></span>{item.source?.sourceRoute ? <a href={item.source.sourceRoute}>打开来源 <ArrowUpRight size={14} /></a> : <span className="muted">来源不可进入</span>}</div></section>
      <section className="collaboration-detail-section"><h3>活动记录</h3><ol className="collaboration-timeline">{activities.length ? activities.map(activity => <li key={activity.id}><span /><div><strong>{ACTION_LABELS[activity.action] || (activity.action === "create" ? "创建事项" : activity.action)}</strong><p>{activity.reason || activity.actorUser?.name || "系统记录"}</p><time>{dateTime(activity.createdAt)}</time></div><ChevronRight size={14} aria-hidden="true" /></li>) : <li className="empty"><div><strong>正在等待活动记录</strong><p>状态动作会在这里形成不可删除的审计轨迹。</p></div></li>}</ol></section>
      <section className="collaboration-record-meta"><span>事项 ID {item.id}</span><span>版本 {item.version}</span></section>
    </aside>
  );
}
