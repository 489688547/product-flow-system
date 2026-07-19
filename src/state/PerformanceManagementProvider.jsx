import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createDefaultPerformanceState, normalizePerformanceState } from "../domain/performanceManagement.js";

const Context = createContext(null);

export function PerformanceManagementProvider({ children, enabled = true }) {
  const [state, setState] = useState(createDefaultPerformanceState);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const response = await fetch("/api/performance-management"); const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "绩效数据加载失败。");
      setState(normalizePerformanceState(payload.state)); setError("");
    } catch (loadError) { setError(loadError.message || "绩效数据加载失败。"); }
    finally { setLoading(false); }
  }, [enabled]);
  useEffect(() => { refresh(); }, [refresh]);
  const dispatch = useCallback(async action => {
    const response = await fetch("/api/performance-management/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: state.revision, action }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { if (response.status === 409) refresh(); throw new Error(payload.message || "绩效动作保存失败。"); }
    setState(normalizePerformanceState(payload.state)); setError(""); return payload.state;
  }, [refresh, state.revision]);
  const value = useMemo(() => ({ state, loading, error, dispatch, refresh }), [dispatch, error, loading, refresh, state]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePerformanceManagement() {
  const value = useContext(Context); if (!value) throw new Error("usePerformanceManagement must be used inside provider"); return value;
}
