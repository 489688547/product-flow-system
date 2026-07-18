import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createDefaultEcommerceOperationsState, normalizeEcommerceOperationsState } from "../domain/ecommerceOperations.js";

const Context = createContext(null);

export function EcommerceOperationsProvider({ children, enabled = true }) {
  const [state, setState] = useState(createDefaultEcommerceOperationsState);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const response = await fetch("/api/ecommerce-operations");
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "店铺经营数据加载失败。");
      setState(normalizeEcommerceOperationsState(payload.state)); setError("");
    } catch (loadError) { setError(loadError.message || "店铺经营数据加载失败。"); }
    finally { setLoading(false); }
  }, [enabled]);

  useEffect(() => { refresh(); }, [refresh]);

  const dispatch = useCallback(async action => {
    const response = await fetch("/api/ecommerce-operations/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: state.revision, action }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { if (response.status === 409) refresh(); throw new Error(payload.message || "经营动作保存失败。"); }
    setState(normalizeEcommerceOperationsState(payload.state)); setError(""); return payload.state;
  }, [refresh, state.revision]);

  const reviewWithAi = useCallback(async plan => {
    const response = await fetch("/api/ecommerce-operations/ai-review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "智能点评失败。");
    await dispatch({ type: "record_ai_review", record: { planId: plan.id, mode: payload.mode, summary: payload.summary, suggestions: payload.suggestions } });
    return payload;
  }, [dispatch]);

  const value = useMemo(() => ({ state, loading, error, dispatch, refresh, reviewWithAi }), [dispatch, error, loading, refresh, reviewWithAi, state]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useEcommerceOperations() {
  const value = useContext(Context); if (!value) throw new Error("useEcommerceOperations must be used inside provider"); return value;
}
