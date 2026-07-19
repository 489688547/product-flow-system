import { Filter, GitBranch, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { projectHealth } from "../../domain/strategyExecution.js";
import { canManagePermissions } from "../../domain/permissions.js";
import { usePlatform } from "../../state/PlatformProvider.jsx";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { ConfirmDialog } from "../../ui/ConfirmDialog.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { HealthBadge } from "../company/HealthBadge.jsx";
import { ProjectDetailModal } from "./ProjectDetailModal.jsx";
import { ProjectEditorModal } from "./ProjectEditorModal.jsx";

export function KeyProjectsPage() {
  const { state, dispatch, syncDecisionTodo, archiveProject, archiveProjectChild } = usePlatform();
  const { currentUser, orgCache } = useProductFlow();
  const [query, setQuery] = useState("");
  const [healthFilter, setHealthFilter] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [editorProject, setEditorProject] = useState(undefined);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const canCreate = canManagePermissions(currentUser) || /负责人|经理/.test(currentUser?.title || "");
  const projects = useMemo(() => state.projects.filter(item => !item.archived).map(project => ({ project, ...projectHealth(state, project, new Date()) })).filter(item => {
    const matchesQuery = !query.trim() || [item.project.name, item.project.owner, item.project.department].some(value => String(value || "").includes(query.trim()));
    return matchesQuery && (healthFilter === "all" || item.health === healthFilter);
  }), [healthFilter, query, state]);
  const selected = state.projects.find(item => item.id === selectedId);
  const openEditor = project => { setEditorProject(project); setEditorOpen(true); };
  const saveProject = form => {
    dispatch({ type: "upsert_project", record: { ...form, id: form.id || `project-${Date.now()}` } });
    setEditorOpen(false);
  };

  return (
    <section className="page key-projects-page">
      <PageHeader title="重点项目" description="只管理支撑公司战略的关键项目、里程碑、风险与决策。">
        <Button variant="primary" disabled={!canCreate} disabledReason="部门负责人或项目负责人可以创建重点项目" onClick={() => openEditor(null)}><Plus size={16} />新建重点项目</Button>
      </PageHeader>
      <div className="project-toolbar">
        <label className="project-search"><Search size={15} /><input aria-label="搜索重点项目" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索项目、负责人或部门" /></label>
        <label><Filter size={15} /><span>健康度</span><select value={healthFilter} onChange={event => setHealthFilter(event.target.value)}><option value="all">全部</option><option value="off_track">偏离</option><option value="at_risk">风险</option><option value="normal">正常</option><option value="completed">已完成</option></select></label>
      </div>
      <section className="key-project-list" aria-label="重点项目列表">
        <div className="key-project-list-head"><span>重点项目</span><span>战略关联</span><span>负责人</span><span>下一节点</span><span>数据来源</span><span>健康度</span></div>
        {projects.map(({ project, health }) => {
          const strategy = state.strategies.find(item => item.id === project.strategyId);
          const milestone = state.milestones.filter(item => item.projectId === project.id && item.status !== "completed").sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0];
          return <button className="key-project-list-row" key={project.id} onClick={() => setSelectedId(project.id)}><span><GitBranch size={17} /><span><strong>{project.name}</strong><small>{project.goal}</small></span></span><span>{strategy?.name || "未关联"}</span><span>{project.owner}<small>{project.department}</small></span><span>{milestone?.title || "暂无待办节点"}<small>{milestone?.dueDate || project.endDate || "待排期"}</small></span><span>{project.sourceAppId ? "产品全周期" : "项目中心"}<small>{project.sourceProgress != null ? `${project.sourceProgress}%` : "人工确认"}</small></span><HealthBadge health={health} /></button>;
        })}
        {!projects.length ? <div className="empty-state">当前筛选条件下没有重点项目。</div> : null}
      </section>
      <ProjectEditorModal open={editorOpen} project={editorProject} strategies={state.strategies.filter(item => !item.archived)} objectives={state.objectives.filter(item => !item.archived)} orgCache={orgCache} onClose={() => setEditorOpen(false)} onSave={saveProject} />
      <ProjectDetailModal open={Boolean(selected)} project={selected} state={state} orgCache={orgCache} currentUser={currentUser} onClose={() => setSelectedId("")} dispatch={dispatch} archiveProjectChild={archiveProjectChild} onDelete={() => setDeleting(selected)} onEdit={() => { setSelectedId(""); openEditor(selected); }} onSyncDecisionTodo={decision => {
        const users = orgCache?.users || [];
        const creator = users.find(user => user.name === currentUser?.name) || currentUser;
        const executor = users.find(user => user.name === decision.decisionOwner) || {};
        const detailUrl = new URL(window.location.href);
        detailUrl.hash = "projects";
        return syncDecisionTodo?.(decision.id, { creator, executor, detailUrl: detailUrl.toString() });
      }} />
      <ConfirmDialog open={Boolean(deleting)} title="归档重点项目" message={deleting?.name || "该重点项目"} description="项目下的里程碑、风险和待决策会一并归档，历史审计记录会保留。" confirmLabel="确认归档" onClose={() => setDeleting(null)} onConfirm={() => { archiveProject(deleting.id); setDeleting(null); setSelectedId(""); }} />
    </section>
  );
}
