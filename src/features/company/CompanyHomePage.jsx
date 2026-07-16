import { AlertTriangle, ArrowRight, CircleHelp, Flag, GitBranch, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { personalTodosForUser } from "../../domain/personalTodos.js";
import { buildExecutiveSummary } from "../../domain/strategyExecution.js";
import { canManagePermissions } from "../../domain/permissions.js";
import { usePlatform } from "../../state/PlatformProvider.jsx";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { HealthBadge } from "./HealthBadge.jsx";
import { PersonalTodoWorkbench } from "./PersonalTodoWorkbench.jsx";

function MetricStrip({ summary }) {
  const items = [
    [summary.counts.offTrack, "偏离目标", "danger"],
    [summary.counts.atRisk, "风险目标", "warning"],
    [summary.offTrackProjects.length + summary.atRiskProjects.length, "异常项目", "warning"],
    [summary.pendingDecisions.length, "待决策", "info"],
    [summary.openRisks.filter(risk => ["critical", "high"].includes(risk.severity)).length, "重大风险", "danger"]
  ];
  return <div className="company-status-strip">{items.map(([value, label, tone]) => <div key={label} className={`company-status-item ${tone}`}><strong>{value}</strong><span>{label}</span></div>)}</div>;
}

function CompanyCockpit({ summary, state, onNavigate }) {
  return <>
    <MetricStrip summary={summary} />
    <div className="executive-priority-grid">
      <section className="company-work-section executive-decisions">
        <div className="panel-title"><CircleHelp size={18} /><h2>待决策事项</h2><button type="button" onClick={() => onNavigate("projects")}>查看全部</button></div>
        {summary.pendingDecisions.slice(0, 5).map(decision => {
          const project = state.projects.find(item => item.id === decision.projectId);
          return <button key={decision.id} className="decision-priority-row" onClick={() => onNavigate("projects")}><span className="decision-date">{decision.dueDate?.slice(5) || "待定"}</span><span><strong>{decision.title}</strong><small>{project?.name || "未关联项目"} · {decision.recommendation || "等待补充建议"}</small></span><ArrowRight size={16} /></button>;
        })}
        {!summary.pendingDecisions.length ? <div className="empty-state">当前没有待管理层处理的事项。</div> : null}
      </section>
      <section className="company-work-section">
        <div className="panel-title"><AlertTriangle size={18} /><h2>重大异常与风险</h2></div>
        {[...summary.offTrackObjectives, ...summary.offTrackProjects].slice(0, 5).map((item, index) => <button key={item.objective?.id || item.project?.id || index} className="company-work-row" onClick={() => onNavigate(item.objective ? "strategy" : "projects")}><span><strong>{item.objective?.title || item.project?.name}</strong><small>{item.project?.owner || item.objective?.owner || "待指定负责人"} · {item.reasons?.[0] || "关键事实已突破容忍线"}</small></span><HealthBadge health="off_track" /></button>)}
        {!summary.offTrackObjectives.length && !summary.offTrackProjects.length ? <div className="empty-state">当前没有偏离事项。</div> : null}
      </section>
    </div>
    <section className="company-work-section strategy-map-section">
      <div className="panel-title"><Target size={18} /><h2>战略执行地图</h2><button type="button" onClick={() => onNavigate("strategy")}>进入战略中心</button></div>
      {summary.strategies.map(item => <div className="strategy-map-row" key={item.strategy.id}><div className="strategy-map-title"><span><strong>{item.strategy.name}</strong><small>{item.strategy.owner} · {item.strategy.year}</small></span><HealthBadge health={item.health} /></div><div className="strategy-objective-rail">{item.objectiveResults.map(result => <button key={result.objective.id} onClick={() => onNavigate("strategy")}><span><strong>{result.objective.title}</strong><small>{result.objective.quarter} · 信心 {result.objective.confidence ?? "—"}%</small></span><HealthBadge health={result.health} /></button>)}</div></div>)}
    </section>
    <section className="company-work-section">
      <div className="panel-title"><GitBranch size={18} /><h2>重点项目组合</h2><button type="button" onClick={() => onNavigate("projects")}>进入项目中心</button></div>
      <div className="project-portfolio-table" role="table" aria-label="重点项目组合">
        <div className="project-portfolio-head" role="row"><span>项目</span><span>负责人</span><span>计划结束</span><span>来源</span><span>健康度</span></div>
        {summary.projects.map(item => <button key={item.project.id} role="row" onClick={() => onNavigate("projects")}><span><strong>{item.project.name}</strong><small>{item.project.goal}</small></span><span>{item.project.owner}</span><span>{item.project.endDate || "待排期"}</span><span>{item.project.sourceAppId ? "产品全周期" : "项目中心"}</span><HealthBadge health={item.health} /></button>)}
      </div>
    </section>
  </>;
}

export function CompanyHomePage({ onNavigate }) {
  const { state, error } = usePlatform();
  const { state: productState, currentUser } = useProductFlow();
  const executive = canManagePermissions(currentUser);
  const summary = useMemo(() => buildExecutiveSummary(state, { currentUser, productState, today: new Date() }), [currentUser, productState, state]);
  const [executiveView, setExecutiveView] = useState("todos");
  const myTodos = useMemo(() => personalTodosForUser(state.personalTodos, currentUser), [currentUser, state.personalTodos]);
  const ownedProjects = summary.projects.filter(item => [item.project.owner, item.project.sponsor].includes(currentUser?.name));
  const ownedObjectives = summary.objectives.filter(item => item.objective.owner === currentUser?.name);

  if (!executive) {
    const myTasks = productState.tasks.filter(task => !task.done && String(task.ownerDept || "").includes(currentUser?.department || "__none__"));
    return (
      <section className="page company-home">
        <PageHeader title="我的工作台" description="只展示与你直接相关的目标、重点项目和产品任务。" />
        {error ? <div className="inline-alert" role="status">{error}</div> : null}
        <section className="company-work-section">
          <div className="panel-title"><Target size={18} /><h2>我负责的季度目标</h2></div>
          {ownedObjectives.map(item => <button key={item.objective.id} className="company-work-row" onClick={() => onNavigate("strategy")}><span><strong>{item.objective.title}</strong><small>{item.objective.quarter} · {item.objective.successStandard}</small></span><HealthBadge health={item.health} /></button>)}
          {!ownedObjectives.length ? <div className="empty-state">当前没有由你负责的季度目标。</div> : null}
        </section>
        <section className="company-work-section">
          <div className="panel-title"><GitBranch size={18} /><h2>我负责的重点项目</h2></div>
          {ownedProjects.map(item => <button key={item.project.id} className="company-work-row" onClick={() => onNavigate("projects")}><span><strong>{item.project.name}</strong><small>{item.project.department} · 下一节点 {item.project.endDate || "待排期"}</small></span><HealthBadge health={item.health} /></button>)}
          {!ownedProjects.length ? <div className="empty-state">当前没有由你负责的重点项目。</div> : null}
        </section>
        <section className="company-work-section">
          <div className="panel-title"><Flag size={18} /><h2>产品任务</h2></div>
          {myTasks.slice(0, 8).map(task => <button key={task.id} className="company-work-row" onClick={() => onNavigate("progress")}><span><strong>{task.title}</strong><small>{task.ownerDept} · 截止 {task.due || "未设置"}</small></span><ArrowRight size={16} /></button>)}
          {!myTasks.length ? <div className="empty-state">当前没有未完成的本部门产品任务。</div> : null}
        </section>
      </section>
    );
  }

  return (
    <section className="page company-home">
      <PageHeader title="公司首页" description={executiveView === "todos" ? "先处理明确分配给你的责任事项，再查看全公司的战略执行状态。" : "三分钟内看清偏离、重大风险和需要管理层拍板的事项。"} />
      {error ? <div className="inline-alert" role="status">{error}</div> : null}
      <div className="company-view-switch" role="tablist" aria-label="公司首页视图">
        <button type="button" role="tab" aria-selected={executiveView === "todos"} className={executiveView === "todos" ? "active" : ""} onClick={() => setExecutiveView("todos")}>我的待办<span>{myTodos.filter(todo => todo.status === "pending").length}</span></button>
        <button type="button" role="tab" aria-selected={executiveView === "cockpit"} className={executiveView === "cockpit" ? "active" : ""} onClick={() => setExecutiveView("cockpit")}>公司驾驶舱</button>
      </div>
      {executiveView === "todos"
        ? <PersonalTodoWorkbench todos={myTodos} onNavigate={onNavigate} />
        : <CompanyCockpit summary={summary} state={state} onNavigate={onNavigate} />}
    </section>
  );
}
