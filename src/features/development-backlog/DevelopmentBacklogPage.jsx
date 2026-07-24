import { Bot, Plus, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BACKLOG_MODULES, BACKLOG_STATUS_LABELS } from "../../domain/developmentBacklog.js";
import {
  createDevelopmentBacklogItem,
  draftDevelopmentBacklog,
  isAiConfigurationError,
  loadDevelopmentBacklog,
  loadDevelopmentBacklogItem,
  runDevelopmentBacklogAction,
  updateDevelopmentBacklogItem
} from "../../state/developmentBacklogApi.js";
import { Button } from "../../ui/Button.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { DevelopmentBacklogDetail } from "./DevelopmentBacklogDetail.jsx";
import { DevelopmentBacklogEditor } from "./DevelopmentBacklogEditor.jsx";
import { DevelopmentBacklogTable } from "./DevelopmentBacklogTable.jsx";

export const BACKLOG_DRAFT_KEY = "development-backlog:unsent-description:v1";

const INITIAL_FILTERS = Object.freeze({
  query: "",
  status: "",
  priority: "",
  moduleId: "",
  ownerId: "",
  includeClosed: false,
  page: 1,
  pageSize: 30
});

const EMPTY_PAYLOAD = Object.freeze({
  items: [],
  summary: { clarification: 0, ready: 0, inProgress: 0, review: 0, blocked: 0 },
  pagination: { page: 1, pageSize: 30, total: 0, totalPages: 1 }
});

function departments(user = {}) {
  return [user.department, user.departmentName, ...(user.departments || []), ...(user.departmentNames || [])]
    .flatMap(value => String(value || "").split(/\s*(?:\/|、|,|，|;|；|\|)\s*/))
    .map(value => value.trim())
    .filter(Boolean);
}

function executiveUser(user) {
  return Boolean(user && user.role !== "readonly" && (
    departments(user).includes("总经办")
    || ["executive", "admin"].includes(String(user.role || ""))
  ));
}

function restoredDescription() {
  try {
    return sessionStorage.getItem(BACKLOG_DRAFT_KEY) || "";
  } catch {
    return "";
  }
}

export function DevelopmentBacklogPage({ sessionUser, onNavigate }) {
  const canManage = executiveUser(sessionUser);
  const [payload, setPayload] = useState(EMPTY_PAYLOAD);
  const [filterDraft, setFilterDraft] = useState(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(INITIAL_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState({ item: null, events: [], loading: false, error: null });
  const [actionState, setActionState] = useState({ loading: false, error: null });
  const [editor, setEditor] = useState({
    open: false,
    mode: "manual",
    item: null,
    aiDraft: null,
    description: restoredDescription(),
    aiLoading: false,
    aiError: null,
    saving: false
  });

  const loadList = useCallback(async filters => {
    setLoading(true);
    setError(null);
    try {
      const next = await loadDevelopmentBacklog(filters);
      setPayload(next);
    } catch (cause) {
      setError(cause);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async itemId => {
    if (!itemId) return;
    setDetail(current => ({ ...current, loading: true, error: null }));
    try {
      const next = await loadDevelopmentBacklogItem(itemId);
      setDetail({ item: next.item, events: next.events || [], loading: false, error: null });
    } catch (cause) {
      setDetail(current => ({ ...current, loading: false, error: cause }));
    }
  }, []);

  useEffect(() => {
    loadList(INITIAL_FILTERS);
  }, [loadList]);

  const summaryCards = useMemo(() => [
    ["clarification", "待澄清", payload.summary?.clarification || 0],
    ["ready", "待开发", payload.summary?.ready || 0],
    ["in_progress", "开发中", payload.summary?.inProgress || 0],
    ["review", "待验收", payload.summary?.review || 0],
    ["blocked", "已阻塞", payload.summary?.blocked || 0]
  ], [payload.summary]);

  function applyFilters(page = 1) {
    const next = { ...filterDraft, page };
    setAppliedFilters(next);
    setFilterDraft(next);
    setSelectedId("");
    setDetail({ item: null, events: [], loading: false, error: null });
    loadList(next);
  }

  function refresh() {
    loadList(appliedFilters);
    if (selectedId) loadDetail(selectedId);
  }

  function openItem(item) {
    setSelectedId(item.id);
    setDetail({ item, events: [], loading: true, error: null });
    loadDetail(item.id);
  }

  function openEditor(mode, item = null) {
    setEditor(current => ({
      ...current,
      open: true,
      mode,
      item,
      aiDraft: null,
      aiError: null,
      description: mode === "ai" ? current.description || restoredDescription() : ""
    }));
  }

  function closeEditor() {
    setEditor(current => ({ ...current, open: false, item: null, aiDraft: null, aiError: null, saving: false }));
  }

  async function generateDraft(description) {
    setEditor(current => ({ ...current, description, aiLoading: true, aiError: null }));
    try {
      const result = await draftDevelopmentBacklog(description);
      setEditor(current => ({ ...current, aiDraft: result.draft, aiLoading: false }));
    } catch (cause) {
      if (isAiConfigurationError(cause)) {
        try {
          sessionStorage.setItem(BACKLOG_DRAFT_KEY, description);
        } catch {
          // Storage-disabled browsers still receive the same configuration route.
        }
        setEditor(current => ({ ...current, open: false, aiLoading: false, aiError: cause }));
        onNavigate("data-services", "development-backlog");
        return;
      }
      setEditor(current => ({ ...current, aiLoading: false, aiError: cause }));
    }
  }

  async function saveDraft(draft) {
    setEditor(current => ({ ...current, saving: true, aiError: null }));
    try {
      if (editor.item) {
        await updateDevelopmentBacklogItem(editor.item.id, editor.item.version, draft);
      } else {
        await createDevelopmentBacklogItem(draft);
      }
      try {
        sessionStorage.removeItem(BACKLOG_DRAFT_KEY);
      } catch {
        // The saved server record is authoritative even when session storage is unavailable.
      }
      closeEditor();
      await loadList(appliedFilters);
      if (editor.item?.id) await loadDetail(editor.item.id);
    } catch (cause) {
      setEditor(current => ({ ...current, saving: false, aiError: cause }));
    }
  }

  async function runAction(action, expectedVersion, input) {
    if (!detail.item) return;
    setActionState({ loading: true, error: null });
    try {
      await runDevelopmentBacklogAction(detail.item.id, action, expectedVersion, input);
      await Promise.all([loadList(appliedFilters), loadDetail(detail.item.id)]);
      setActionState({ loading: false, error: null });
    } catch (cause) {
      setActionState({ loading: false, error: cause });
    }
  }

  function changePage(page) {
    const next = { ...appliedFilters, page };
    setAppliedFilters(next);
    setFilterDraft(next);
    loadList(next);
  }

  return (
    <section className="page development-backlog-page">
      <PageHeader title="研发待办" description="统一记录已确认需求、开发占用、冲突和验收结果。">
        {canManage ? <Button onClick={() => openEditor("manual")}><Plus size={16} />手工新增</Button> : null}
        <Button variant="primary" onClick={() => openEditor("ai")}><Bot size={16} />和 AI 总助讨论新增</Button>
      </PageHeader>

      <section className="backlog-summary" aria-label="研发待办状态总览">
        {summaryCards.map(([status, label, count]) => <button key={status} type="button" className={filterDraft.status === status ? "active" : ""} onClick={() => setFilterDraft(current => ({ ...current, status }))}><span>{label}</span><strong>{count}</strong></button>)}
      </section>

      <section className="backlog-filters section-panel" aria-label="筛选研发待办">
        <label className="backlog-search"><span>关键词</span><div><Search size={15} aria-hidden="true" /><input value={filterDraft.query} onChange={event => setFilterDraft(current => ({ ...current, query: event.target.value }))} onKeyDown={event => event.key === "Enter" && applyFilters()} placeholder="编号、标题或负责人" /></div></label>
        <label><span>状态</span><select value={filterDraft.status} onChange={event => setFilterDraft(current => ({ ...current, status: event.target.value }))}><option value="">活跃事项</option>{Object.entries(BACKLOG_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>优先级</span><select value={filterDraft.priority} onChange={event => setFilterDraft(current => ({ ...current, priority: event.target.value }))}><option value="">全部优先级</option><option value="p0">P0</option><option value="p1">P1</option><option value="p2">P2</option><option value="p3">P3</option></select></label>
        <label><span>模块</span><select value={filterDraft.moduleId} onChange={event => setFilterDraft(current => ({ ...current, moduleId: event.target.value }))}><option value="">全部模块</option>{BACKLOG_MODULES.map(module => <option key={module.id} value={module.id}>{module.name}</option>)}</select></label>
        <label className="backlog-closed-toggle"><input type="checkbox" checked={filterDraft.includeClosed} onChange={event => setFilterDraft(current => ({ ...current, includeClosed: event.target.checked }))} /><span>包含已完成/已取消</span></label>
        <div className="backlog-filter-actions"><Button variant="primary" disabled={loading} onClick={() => applyFilters()}>查询</Button><Button disabled={loading} onClick={refresh}><RefreshCw size={15} />刷新</Button></div>
      </section>

      {error ? <div className="backlog-page-alert" role="alert"><span><strong>研发待办加载失败</strong><small>{error.message}</small></span><Button onClick={refresh}>重试</Button></div> : null}
      <div className={`development-backlog-workspace ${selectedId ? "has-detail" : ""}`}>
        <section className="development-backlog-list" aria-busy={loading}>
          <div className="backlog-list-meta"><span>{loading ? "正在加载…" : `共 ${payload.pagination?.total || 0} 项`}</span><small>异常与阻塞优先</small></div>
          {!loading && !payload.items?.length ? <div className="backlog-empty"><strong>暂无研发待办</strong><span>当前筛选下没有记录，可清除筛选后查询。</span></div> : <DevelopmentBacklogTable items={payload.items || []} selectedId={selectedId} onOpen={openItem} />}
          {(payload.pagination?.totalPages || 1) > 1 ? <nav className="backlog-pagination" aria-label="研发待办分页"><Button disabled={loading || payload.pagination.page <= 1} onClick={() => changePage(payload.pagination.page - 1)}>上一页</Button><span>第 {payload.pagination.page} / {payload.pagination.totalPages} 页</span><Button disabled={loading || payload.pagination.page >= payload.pagination.totalPages} onClick={() => changePage(payload.pagination.page + 1)}>下一页</Button></nav> : null}
        </section>
        {selectedId ? <DevelopmentBacklogDetail item={detail.item} events={detail.events} loading={detail.loading} currentUser={sessionUser} canManage={canManage} actionLoading={actionState.loading} actionError={actionState.error || detail.error} onAction={runAction} onEdit={item => openEditor("manual", item)} onClose={() => { setSelectedId(""); setDetail({ item: null, events: [], loading: false, error: null }); }} /> : null}
      </div>

      <DevelopmentBacklogEditor
        open={editor.open}
        mode={editor.mode}
        initialItem={editor.item}
        initialDescription={editor.description}
        aiDraft={editor.aiDraft}
        aiLoading={editor.aiLoading}
        aiError={editor.aiError}
        canManage={canManage}
        saving={editor.saving}
        onGenerate={generateDraft}
        onSubmit={saveDraft}
        onClose={closeEditor}
      />
    </section>
  );
}
