import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createDefaultSupplyChainState, normalizeSupplyChainState, reduceSupplyChainState } from "../domain/supplyChain.js";
import { useAuth } from "./AuthProvider.jsx";
import { supplyChainApiUrl, supplyChainApprovalSyncUrl } from "./supplyChainApi.js";

const SupplyChainContext = createContext(null);
const STORAGE_KEY = "supplyChainState";

function loadLocalState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeSupplyChainState(JSON.parse(raw)) : createDefaultSupplyChainState();
  } catch {
    return createDefaultSupplyChainState();
  }
}

function messageFor(error, fallback) {
  const message = String(error?.message || "").trim();
  return /load failed|failed to fetch/i.test(message) ? fallback : message || fallback;
}

export function SupplyChainProvider({ children, enabled = true }) {
  const { user } = useAuth();
  const [state, setState] = useState(loadLocalState);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const firstSave = useRef(true);
  const apiUrl = supplyChainApiUrl(window.location.hostname);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return undefined;
    }
    let active = true;
    async function load() {
      try {
        const response = await fetch(apiUrl);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || "供应链数据加载失败。");
        if (active && payload.state) {
          const normalized = normalizeSupplyChainState(payload.state);
          setState(normalized);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
          setError("");
        }
      } catch (loadError) {
        if (active) setError(messageFor(loadError, "供应链数据加载失败，当前显示本地缓存。"));
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [apiUrl, enabled]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (!enabled) return undefined;
    if (firstSave.current) {
      firstSave.current = false;
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ state })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.synced === false) throw new Error(payload.message || "供应链数据保存失败。");
        setError("");
      } catch (saveError) {
        setError(messageFor(saveError, "供应链数据同步失败，修改已保存在本机。"));
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [apiUrl, enabled, state]);

  const dispatch = useCallback(action => {
    setState(current => reduceSupplyChainState(current, {
      ...action,
      actor: action.actor || user?.name || "系统"
    }));
  }, [user?.name]);

  const syncApprovals = useCallback(async input => {
    const response = await fetch(supplyChainApprovalSyncUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input || {})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.synced === false) throw new Error(payload.message || "钉钉审批同步失败。");
    const refreshed = await fetch(apiUrl);
    const refreshedPayload = await refreshed.json().catch(() => ({}));
    if (refreshed.ok && refreshedPayload.state) setState(normalizeSupplyChainState(refreshedPayload.state));
    return payload;
  }, [apiUrl]);

  const value = useMemo(() => ({ state, loading, error, dispatch, syncApprovals }), [dispatch, error, loading, state, syncApprovals]);
  return <SupplyChainContext.Provider value={value}>{children}</SupplyChainContext.Provider>;
}

export function useSupplyChain() {
  const context = useContext(SupplyChainContext);
  if (!context) throw new Error("useSupplyChain must be used inside SupplyChainProvider");
  return context;
}
