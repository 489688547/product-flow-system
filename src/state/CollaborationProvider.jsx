import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  createCollaborationItem,
  getCollaborationItem,
  listCollaborationActivities,
  listCollaborationItems,
  syncCollaborationDingTodo,
  transitionCollaborationItem,
  updateCollaborationItem
} from "./collaborationApi.js";

const CollaborationContext = createContext(null);

function replaceItem(items, next) {
  const index = items.findIndex(item => item.id === next.id);
  if (index < 0) return [next, ...items];
  return items.map(item => item.id === next.id ? next : item);
}

function errorState(error) {
  return {
    message: error?.message || "协同事项暂不可用。",
    code: error?.code || "INTERNAL_UNEXPECTED",
    status: error?.status || 0,
    retryable: Boolean(error?.retryable)
  };
}

export function CollaborationProvider({ children, enabled = true }) {
  const [items, setItems] = useState([]);
  const [activitiesByItem, setActivitiesByItem] = useState({});
  const [scope, setScope] = useState({ mode: "department", departmentIds: [] });
  const [query, setQuery] = useState({ view: "pending_acceptance" });
  const [loading, setLoading] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [conflict, setConflict] = useState(null);
  const requestRef = useRef(null);

  const loadItems = useCallback(async (nextQuery = query) => {
    if (!enabled) return { items: [], nextCursor: "" };
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    try {
      const payload = await listCollaborationItems(nextQuery, fetch, controller.signal);
      setItems(payload.items || []);
      setScope(payload.scope || { mode: "department", departmentIds: [] });
      setQuery(nextQuery);
      setError(null);
      return payload;
    } catch (loadError) {
      if (loadError?.name !== "AbortError") setError(errorState(loadError));
      throw loadError;
    } finally {
      if (requestRef.current === controller) setLoading(false);
    }
  }, [enabled, query]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return undefined;
    }
    loadItems({ view: "pending_acceptance" }).catch(() => {});
    return () => requestRef.current?.abort();
  }, [enabled]);

  const loadItem = useCallback(async id => {
    const payload = await getCollaborationItem(id);
    setItems(current => replaceItem(current, payload.item));
    return payload.item;
  }, []);

  const loadActivities = useCallback(async id => {
    const payload = await listCollaborationActivities(id);
    setActivitiesByItem(current => ({ ...current, [id]: payload.activities || [] }));
    return payload.activities || [];
  }, []);

  const runWrite = useCallback(async operation => {
    setSaving(true);
    setError(null);
    try {
      const payload = await operation();
      if (payload.item) setItems(current => replaceItem(current, payload.item));
      setConflict(null);
      return payload;
    } catch (writeError) {
      if (writeError?.code === "COLLABORATION_VERSION_CONFLICT") {
        setConflict({ code: writeError.code, details: writeError.details, message: writeError.message });
      }
      setError(errorState(writeError));
      throw writeError;
    } finally {
      setSaving(false);
    }
  }, []);

  const createItem = useCallback(input => runWrite(() => createCollaborationItem(input)), [runWrite]);
  const updateItem = useCallback((id, input) => runWrite(() => updateCollaborationItem(id, input)), [runWrite]);
  const transitionItem = useCallback((id, input) => runWrite(async () => {
    const payload = await transitionCollaborationItem(id, input);
    await loadActivities(id).catch(() => {});
    return payload;
  }), [loadActivities, runWrite]);
  const syncDingTodo = useCallback((id, input) => runWrite(async () => {
    const payload = await syncCollaborationDingTodo(id, input);
    await loadActivities(id).catch(() => {});
    return payload;
  }), [loadActivities, runWrite]);

  const value = useMemo(() => ({
    items,
    activitiesByItem,
    scope,
    query,
    loading,
    saving,
    error,
    conflict,
    loadItems,
    loadItem,
    loadActivities,
    createItem,
    updateItem,
    transitionItem,
    syncDingTodo,
    clearError: () => setError(null),
    clearConflict: () => setConflict(null)
  }), [activitiesByItem, conflict, createItem, error, items, loadActivities, loadItem, loadItems, loading, query, saving, scope, syncDingTodo, transitionItem, updateItem]);

  return <CollaborationContext.Provider value={value}>{children}</CollaborationContext.Provider>;
}

export function useCollaboration() {
  const context = useContext(CollaborationContext);
  if (!context) throw new Error("useCollaboration must be used inside CollaborationProvider");
  return context;
}
