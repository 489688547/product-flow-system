import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Search } from "lucide-react";
import { useCollaboration } from "../../state/CollaborationProvider.jsx";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { CollaborationDetailPanel } from "./CollaborationDetailPanel.jsx";
import { CollaborationEditor } from "./CollaborationEditor.jsx";
import { CollaborationTable } from "./CollaborationTable.jsx";

const VIEWS = [
  ["pending_acceptance", "待我部门接收"],
  ["in_progress", "执行中"],
  ["waiting_others", "等待其他部门"],
  ["pending_verification", "待我验收"],
  ["participating", "我参与的"],
  ["completed", "已完成"]
];

export function CollaborationPage() {
  const { items, loading, saving, error, conflict, loadItems } = useCollaboration();
  const { currentUser, orgCache } = useProductFlow();
  const [view, setView] = useState("pending_acceptance");
  const [filters, setFilters] = useState({ query: "", appId: "", kind: "", impactLevel: "" });
  const [selectedId, setSelectedId] = useState("");
  const [editor, setEditor] = useState({ open: false, item: null });
  const selected = useMemo(() => items.find(item => item.id === selectedId) || null, [items, selectedId]);

  useEffect(() => {
    loadItems({ view: "pending_acceptance" }).catch(() => {});
  }, []);

  async function apply(nextView = view, nextFilters = filters) {
    await loadItems({ view: nextView, ...nextFilters }).catch(() => {});
  }
  function changeView(nextView) {
    setView(nextView);
    setSelectedId("");
    apply(nextView, filters);
  }

  return (
    <section className="page collaboration-page">
      <PageHeader title="部门协同" description="跨 App 接住责任、推进执行，并保留可验收的部门协同记录。" identity={<span>{currentUser?.name || "当前员工"} · {currentUser?.department || "组织信息待同步"}</span>}>
        <Button variant="primary" onClick={() => setEditor({ open: true, item: null })}><Plus size={16} />发起协同</Button>
      </PageHeader>

      {error ? <div className="collaboration-alert danger" role="alert"><span><strong>{error.code === "COLLABORATION_STORAGE_UNAVAILABLE" ? "共享协同暂不可用" : "协同数据加载失败"}</strong><small>{error.message}</small></span><Button className="compact" onClick={() => apply()}><RefreshCw size={14} />重试</Button></div> : null}
      {conflict ? <div className="collaboration-alert warning" role="alert"><strong>事项已被其他同事更新，你的输入尚未丢失。</strong><span>请刷新详情比较最新内容后重新提交。</span></div> : null}

      <div className="collaboration-tabs" role="tablist" aria-label="协同责任视图">
        {VIEWS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={view === key} tabIndex={view === key ? 0 : -1} onClick={() => changeView(key)}>{label}</button>)}
      </div>

      <section className="collaboration-filters" aria-label="筛选协同事项">
        <label className="collaboration-search"><span className="sr-only">搜索协同事项</span><Search size={15} aria-hidden="true" /><input value={filters.query} onChange={event => setFilters(current => ({ ...current, query: event.target.value }))} onKeyDown={event => event.key === "Enter" && apply()} placeholder="搜索事项、来源或负责人" /></label>
        <label><span>来源 App</span><select value={filters.appId} onChange={event => setFilters(current => ({ ...current, appId: event.target.value }))}><option value="">全部来源</option><option value="product-flow">产品全周期</option><option value="supply-chain">供应链</option><option value="data-center">数据中心</option><option value="brand-content">品牌内容</option><option value="collaboration">协同工作台</option></select></label>
        <label><span>类型</span><select value={filters.kind} onChange={event => setFilters(current => ({ ...current, kind: event.target.value }))}><option value="">全部类型</option><option value="handoff">部门交接</option><option value="risk">经营风险</option><option value="decision">待决策</option><option value="data_issue">数据问题</option><option value="task">协同任务</option></select></label>
        <label><span>影响</span><select value={filters.impactLevel} onChange={event => setFilters(current => ({ ...current, impactLevel: event.target.value }))}><option value="">全部影响</option><option value="high">高影响</option><option value="medium">中影响</option><option value="low">低影响</option></select></label>
        <Button onClick={() => apply()} disabled={loading}>{loading ? "正在加载…" : "应用筛选"}</Button>
      </section>

      <div className={`collaboration-workspace ${selected ? "has-detail" : ""}`} role="tabpanel">
        <section className="collaboration-list-panel" aria-busy={loading}>
          <div className="collaboration-list-meta"><span><strong>{items.length}</strong> 项当前责任范围</span><button type="button" onClick={() => apply()} disabled={loading}><RefreshCw size={14} />刷新</button></div>
          <CollaborationTable items={items} selectedId={selectedId} onOpen={item => setSelectedId(item.id)} />
        </section>
        {selected ? <CollaborationDetailPanel item={selected} currentUser={currentUser} orgCache={orgCache} onClose={() => setSelectedId("")} onEdit={item => setEditor({ open: true, item })} /> : null}
      </div>

      <CollaborationEditor open={editor.open} item={editor.item} orgCache={orgCache} onClose={() => setEditor({ open: false, item: null })} saving={saving} />
    </section>
  );
}
