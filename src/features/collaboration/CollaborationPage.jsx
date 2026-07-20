import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, RefreshCw, Search } from "lucide-react";
import { useCollaboration } from "../../state/CollaborationProvider.jsx";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { FloatingMenu } from "../../ui/FloatingMenu.jsx";
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

const APP_FILTER_OPTIONS = [
  { value: "", label: "全部来源" },
  { value: "product-flow", label: "产品全周期" },
  { value: "supply-chain", label: "供应链" },
  { value: "data-center", label: "数据中心" },
  { value: "brand-content", label: "品牌内容" },
  { value: "collaboration", label: "协同工作台" }
];
const KIND_FILTER_OPTIONS = [
  { value: "", label: "全部类型" },
  { value: "handoff", label: "部门交接" },
  { value: "risk", label: "经营风险" },
  { value: "decision", label: "待决策" },
  { value: "data_issue", label: "数据问题" },
  { value: "task", label: "协同任务" }
];
const IMPACT_FILTER_OPTIONS = [
  { value: "", label: "全部影响" },
  { value: "high", label: "高影响" },
  { value: "medium", label: "中影响" },
  { value: "low", label: "低影响" }
];

// 与 HeaderFilter 一致的浮层筛选：触发按钮复用 .org-select-trigger，
// 选项浮层复用 .filter-menu，保持与全站下拉一致的选中态和 40px 触控目标。
function FilterSelect({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const selected = options.find(option => option.value === value) || options[0];
  return (
    <label>
      <span>{label}</span>
      <button
        ref={anchorRef}
        type="button"
        className="org-select-trigger"
        aria-label={`${label}筛选：${selected.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
      >
        <strong>{selected.label}</strong>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <FloatingMenu
        anchorRef={anchorRef}
        open={open}
        onClose={() => setOpen(false)}
        className="filter-menu"
        minWidth={180}
        maxHeight={280}
        role="listbox"
        ariaLabel={`${label}筛选`}
        focusOnOpen
        enableArrowNavigation
      >
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={option.value === value}
            className={option.value === value ? "active" : ""}
            onClick={() => { onChange(option.value); setOpen(false); }}
          >
            <span>{option.label}</span>
            {option.value === value ? <Check size={15} aria-hidden="true" /> : null}
          </button>
        ))}
      </FloatingMenu>
    </label>
  );
}

export function CollaborationPage() {
  const { items, loading, error, conflict, loadItems } = useCollaboration();
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
        <FilterSelect label="来源 App" value={filters.appId} options={APP_FILTER_OPTIONS} onChange={appId => setFilters(current => ({ ...current, appId }))} />
        <FilterSelect label="类型" value={filters.kind} options={KIND_FILTER_OPTIONS} onChange={kind => setFilters(current => ({ ...current, kind }))} />
        <FilterSelect label="影响" value={filters.impactLevel} options={IMPACT_FILTER_OPTIONS} onChange={impactLevel => setFilters(current => ({ ...current, impactLevel }))} />
        <Button onClick={() => apply()} disabled={loading}>{loading ? "正在加载…" : "应用筛选"}</Button>
      </section>

      <div className={`collaboration-workspace ${selected ? "has-detail" : ""}`} role="tabpanel">
        <section className="collaboration-list-panel" aria-busy={loading}>
          <div className="collaboration-list-meta"><span><strong>{items.length}</strong> 项当前责任范围</span><button type="button" onClick={() => apply()} disabled={loading}><RefreshCw size={14} />刷新</button></div>
          <CollaborationTable items={items} selectedId={selectedId} onOpen={item => setSelectedId(item.id)} />
        </section>
        {selected ? <CollaborationDetailPanel item={selected} currentUser={currentUser} orgCache={orgCache} onClose={() => setSelectedId("")} onEdit={item => setEditor({ open: true, item })} /> : null}
      </div>

      <CollaborationEditor open={editor.open} item={editor.item} orgCache={orgCache} onClose={() => setEditor({ open: false, item: null })} />
    </section>
  );
}
