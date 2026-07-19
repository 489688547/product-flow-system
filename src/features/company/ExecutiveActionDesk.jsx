import { AlertTriangle, ArrowRight, CircleCheck, CircleHelp, Clock3, Sparkles } from "lucide-react";
import { Button } from "../../ui/Button.jsx";
import { CollaborationStatusBadge } from "../collaboration/CollaborationStatusBadge.jsx";

const COORDINATION_REASONS = new Set(["explicit_escalation", "high_impact_blocked", "overdue", "blocked_over_24h", "strategy_execution_gap"]);

function deadline(value) {
  if (!value) return "截止待补充";
  return `截止 ${new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value))}`;
}

function ActionRow({ action, onNavigate }) {
  return <article className="executive-action-row"><span className={`executive-action-reason ${action.reason}`}>{action.label}</span><div><strong>{action.title}</strong><p>{action.item.coordinationNeed || action.item.businessImpact || action.item.requestedAction}</p><small>{action.ownerDepartment?.name || "主责待确认"} · {action.ownerUser?.name || "负责人待指定"} · {deadline(action.dueAt)}</small></div><span className="executive-action-source">{action.source?.sourceLabel || action.source?.appId || "协同工作台"}</span><Button variant="primary" className="compact" onClick={() => onNavigate("collaboration")}>立即处理 <ArrowRight size={14} /></Button></article>;
}

export function ExecutiveActionDesk({ actions, items, loading, onNavigate }) {
  const decisions = actions.filter(action => action.reason === "decision_required");
  const coordination = actions.filter(action => COORDINATION_REASONS.has(action.reason));
  const recentThreshold = Date.now() - 7 * 86400000;
  const changes = items.filter(item => item.impactLevel === "high" && Date.parse(item.updatedAt) >= recentThreshold)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 6);
  return <section className="executive-action-desk" aria-label="老板行动台">
    <section className="company-work-section executive-action-main">
      <div className="panel-title"><CircleHelp size={18} /><h2>今天需要处理</h2><button type="button" onClick={() => onNavigate("collaboration")}>进入部门协同</button></div>
      {loading ? <div className="empty-state">正在加载公司协同行动…</div> : null}
      {decisions.length ? <div className="executive-action-group"><h3><CircleHelp size={15} />待拍板</h3>{decisions.map(action => <ActionRow key={action.id} action={action} onNavigate={onNavigate} />)}</div> : null}
      {coordination.length ? <div className="executive-action-group"><h3><AlertTriangle size={15} />需要协调</h3>{coordination.map(action => <ActionRow key={action.id} action={action} onNavigate={onNavigate} />)}</div> : null}
      {!loading && !actions.length ? <div className="executive-action-empty"><CircleCheck size={24} /><strong>当前没有需要总经办处理的升级事项</strong><p>普通执行任务由主责部门继续推进，出现待拍板、高影响阻塞或跨部门逾期时会进入这里。</p><Button onClick={() => onNavigate("strategy")}>查看战略执行</Button></div> : null}
    </section>
    <aside className="company-work-section executive-change-list">
      <div className="panel-title"><Sparkles size={18} /><h2>重要变化</h2></div>
      {changes.map(item => <button type="button" key={item.id} onClick={() => onNavigate("collaboration")}><span><strong>{item.title}</strong><small>{item.source?.sourceLabel || item.ownerDepartment?.name || "协同工作台"}</small></span><span><CollaborationStatusBadge status={item.status} compact /><time><Clock3 size={12} />{item.updatedAt.slice(5, 16).replace("T", " ")}</time></span></button>)}
      {!changes.length ? <div className="empty-state compact-empty">最近 7 天没有新的高影响变化。</div> : null}
    </aside>
  </section>;
}
