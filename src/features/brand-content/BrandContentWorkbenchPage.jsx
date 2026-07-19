import { ArrowRight, Plus, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { BRAND_PRODUCTION_STATUSES, BRAND_PRODUCTION_STATUS_LABELS, deriveContentDataStatus } from "../../domain/brandContent.js";
import { useBrandContent } from "../../state/BrandContentProvider.jsx";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { ContentBriefModal } from "./ContentBriefModal.jsx";
import { ContentStatusBadge } from "./ContentStatusBadge.jsx";

export function BrandContentWorkbenchPage() {
  const { state, saving, currentUser, dispatch } = useBrandContent();
  const { state: productState, orgCache } = useProductFlow();
  const [briefOpen, setBriefOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const visibleContents = useMemo(() => state.contents.filter(content => {
    const matchesStatus = statusFilter === "all" || content.productionStatus === statusFilter;
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery = !normalizedQuery || [content.id, content.title, content.productName, content.directorName, content.editorName, content.operatorName].some(value => String(value || "").toLowerCase().includes(normalizedQuery));
    return matchesStatus && matchesQuery;
  }), [query, state.contents, statusFilter]);

  const advance = async content => {
    const index = BRAND_PRODUCTION_STATUSES.indexOf(content.productionStatus);
    const nextStatus = BRAND_PRODUCTION_STATUSES[index + 1];
    if (!nextStatus) return;
    await dispatch({ type: "transition_content", id: content.id, nextStatus });
  };
  const returnToEditing = async content => {
    const reason = window.prompt("请填写退回剪辑的具体原因");
    if (!reason?.trim()) return;
    await dispatch({ type: "transition_content", id: content.id, nextStatus: "editing", reason: reason.trim() });
  };
  const createBrief = async record => {
    await dispatch({ type: "create_content", record });
    setBriefOpen(false);
  };

  return (
    <section className="page brand-content-page brand-workbench-page">
      <PageHeader title="内容作战台" description="按明确状态动作推进 Brief、脚本、剪辑、审核与发布，不使用拖拽改变责任状态。">
        <Button variant="primary" onClick={() => setBriefOpen(true)}><Plus size={16} aria-hidden="true" />创建 Brief</Button>
      </PageHeader>
      <section className="brand-workbench-controls" aria-label="内容筛选">
        <div className="status-strip">
          <button className={statusFilter === "all" ? "active" : ""} type="button" onClick={() => setStatusFilter("all")}><strong>{state.contents.length}</strong><span>全部</span></button>
          {BRAND_PRODUCTION_STATUSES.map(status => <button key={status} className={statusFilter === status ? "active" : ""} type="button" onClick={() => setStatusFilter(status)}><strong>{state.contents.filter(content => content.productionStatus === status).length}</strong><span>{BRAND_PRODUCTION_STATUS_LABELS[status]}</span></button>)}
        </div>
        <label className="brand-search-field"><span>搜索内容</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="内容 ID、产品、标题或责任人" /></label>
      </section>
      <section className="brand-content-list" aria-label="内容任务列表">
        {visibleContents.length ? visibleContents.map(content => {
          const dataStatus = deriveContentDataStatus(content, state.publications, state.performanceSnapshots, state.settings, new Date());
          const index = BRAND_PRODUCTION_STATUSES.indexOf(content.productionStatus);
          const nextStatus = BRAND_PRODUCTION_STATUSES[index + 1];
          return (
            <article className="brand-content-row" key={content.id}>
              <div className="brand-content-identity"><strong>{content.title}</strong><small>{content.id} · {content.productName} · {content.contentDirection}</small></div>
              <div className="brand-content-owners"><span><small>编导</small><strong>{content.directorName}</strong></span><span><small>剪辑</small><strong>{content.editorName}</strong></span><span><small>运营</small><strong>{content.operatorName}</strong></span></div>
              <div className="brand-content-due"><small>截止</small><strong>{content.dueAt || "待安排"}</strong></div>
              <div className="brand-content-statuses"><ContentStatusBadge status={content.productionStatus} kind="production" /><ContentStatusBadge status={dataStatus} /></div>
              <div className="brand-content-actions">
                {content.productionStatus === "reviewing" ? <Button onClick={() => returnToEditing(content)} disabled={saving} disabledReason="正在同步上一项修改"><RotateCcw size={14} aria-hidden="true" />退回剪辑</Button> : null}
                {nextStatus ? <Button variant="primary" onClick={() => advance(content)} disabled={saving} disabledReason="正在同步上一项修改">推进至{BRAND_PRODUCTION_STATUS_LABELS[nextStatus]}<ArrowRight size={14} aria-hidden="true" /></Button> : <span className="muted-copy">流程已完成</span>}
              </div>
            </article>
          );
        }) : <div className="section-panel empty-state">当前筛选没有内容。可以清除筛选或创建新的 Brief。</div>}
      </section>
      <ContentBriefModal open={briefOpen} products={productState.products} currentUser={currentUser} orgCache={orgCache} saving={saving} onClose={() => setBriefOpen(false)} onSave={createBrief} />
    </section>
  );
}
