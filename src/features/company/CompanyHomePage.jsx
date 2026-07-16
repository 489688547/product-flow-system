import { AlertTriangle, ArrowRight, BadgeDollarSign, CircleHelp, Flag, GitBranch, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { personalTodosForUser } from "../../domain/personalTodos.js";
import { buildExecutiveSummary } from "../../domain/strategyExecution.js";
import { strategyAttainment } from "../../domain/executionGovernance.js";
import { canManagePermissions } from "../../domain/permissions.js";
import { usePlatform } from "../../state/PlatformProvider.jsx";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { HealthBadge } from "./HealthBadge.jsx";
import { PersonalTodoWorkbench } from "./PersonalTodoWorkbench.jsx";

function MetricStrip({ summary, state }) {
  const attained = state.strategies.filter(strategy => strategyAttainment(state, strategy.id).attained).length;
  const items = [
    [`${attained}/${state.strategies.length}`, "战略达成", attained === state.strategies.length ? "" : "warning"],
    [state.departmentCommitments.filter(item => ["returned", "at_risk", "off_track"].includes(item.status)).length, "部门承诺异常", "danger"],
    [summary.offTrackProjects.length + summary.atRiskProjects.length, "异常项目", "warning"],
    [summary.pendingDecisions.length, "待决策", "info"],
    [state.incentiveProjects.filter(item => !["closed", "cancelled"].includes(item.status)).length, "激励项目", "info"],
    [state.monthlyReports.filter(item => item.status !== "frozen").length, "月报待处理", "warning"]
  ];
  return <div className="company-status-strip">{items.map(([value, label, tone]) => <div key={label} className={`company-status-item ${tone}`}><strong>{value}</strong><span>{label}</span></div>)}</div>;
}

function CompanyCockpit({ summary, state, onNavigate }) {
  const governedStrategies = state.strategies.filter(item => !item.archived).map(strategy => ({
    strategy,
    attainment: strategyAttainment(state, strategy.id),
    commitments: state.departmentCommitments.filter(item => item.strategyId === strategy.id && !item.archived)
  }));
  return <>
    <MetricStrip summary={summary} state={state} />
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
      <div className="panel-title"><Target size={18} /><h2>三大战略达成 · 战略执行地图</h2><button type="button" onClick={() => onNavigate("strategy")}>进入战略中心</button></div>
      <div className="cockpit-strategy-list">
        {governedStrategies.map(({ strategy, attainment, commitments }) => {
          const abnormal = commitments.filter(item => ["returned", "at_risk", "off_track"].includes(item.status)).length;
          const percentage = attainment.total ? Math.round(attainment.completed / attainment.total * 100) : 0;
          return <button type="button" className="cockpit-strategy-row" key={strategy.id} onClick={() => onNavigate("strategy")}>
            <span><strong>{strategy.name}</strong><small>{strategy.successStandard}</small></span>
            <span className="cockpit-strategy-progress"><span><i style={{ width: `${percentage}%` }} /></span><small>{attainment.completed}/{attainment.total} 必达结果已核验</small></span>
            <span className="cockpit-strategy-support"><strong>{commitments.length}</strong><small>部门承诺{abnormal ? ` · ${abnormal} 项异常` : ""}</small></span>
            <HealthBadge health={attainment.attained ? "completed" : abnormal ? "off_track" : "at_risk"} />
          </button>;
        })}
      </div>
    </section>
    <div className="executive-priority-grid">
      <section className="company-work-section">
        <div className="panel-title"><BadgeDollarSign size={18} /><h2>部门激励项目</h2><button type="button" onClick={() => onNavigate("incentives")}>进入激励中心</button></div>
        {state.incentiveProjects.slice(0, 5).map(project => <button key={project.id} className="company-work-row" onClick={() => onNavigate("incentives")}><span><strong>{project.name}</strong><small>{project.department} · {project.owner} · 奖金上限 ¥{Number(project.rewardCap || 0).toLocaleString("zh-CN")}</small></span><span className={`execution-status ${project.status === "closed" ? "success" : project.status === "pending_approval" ? "warning" : "info"}`}><i />{project.status === "closed" ? "已结项" : project.status === "pending_approval" ? "待审批" : "执行中"}</span></button>)}
        {!state.incentiveProjects.length ? <div className="empty-state">当前没有激励项目。</div> : null}
      </section>
      <section className="company-work-section">
        <div className="panel-title"><Target size={18} /><h2>部门月报进度</h2><button type="button" onClick={() => onNavigate("reviews")}>进入经营检查</button></div>
        {state.monthlyReports.filter(item => item.status !== "frozen").slice(0, 5).map(report => <button key={report.id} className="company-work-row" onClick={() => onNavigate("reviews")}><span><strong>{report.department} · {report.month}</strong><small>{report.owner || "待指定负责人"} · {report.status === "submitted" ? "待总经办审核" : report.status === "approved" ? "待会议冻结" : report.status === "returned" ? "已退回修改" : "待填写"}</small></span><ArrowRight size={16} /></button>)}
        {!state.monthlyReports.some(item => item.status !== "frozen") ? <div className="empty-state">本期月报已全部冻结。</div> : null}
      </section>
    </div>
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
