import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createEmptyBrandContentState, normalizeBrandContentState, reduceBrandContentState } from "../domain/brandContent.js";
import { useAuth } from "./AuthProvider.jsx";
import { brandContentApiUrl } from "./brandContentApi.js";
import { environmentStorageKey, migrateLegacyProductionCache } from "./dataEnvironmentClient.js";
import { getBrowserStorage, persistLocalState, tryGetStorageItem } from "./resilientLocalStorage.js";

const BrandContentContext = createContext(null);
const STORAGE_KEY = "brandContentState:v1";
const localCache = getBrowserStorage("localStorage");

function localStorageKey() {
  migrateLegacyProductionCache(localCache, STORAGE_KEY);
  return environmentStorageKey(STORAGE_KEY);
}

function loadCachedState() {
  try {
    const cached = tryGetStorageItem(localCache, localStorageKey());
    if (cached) return normalizeBrandContentState(JSON.parse(cached));
  } catch {
    // A malformed local cache falls through to a safe state.
  }
  return createEmptyBrandContentState();
}

function messageOf(error, fallback) {
  const message = String(error?.message || "").trim();
  return /load failed|failed to fetch/i.test(message) ? fallback : message || fallback;
}

export function BrandContentProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState(loadCachedState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const stateRef = useRef(state);
  const apiUrl = brandContentApiUrl(window.location.hostname);

  useEffect(() => {
    stateRef.current = state;
    persistLocalState(localCache, localStorageKey(), state);
  }, [state]);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(apiUrl);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "品牌内容数据加载失败。");
      const next = payload.synced && payload.state
        ? normalizeBrandContentState({ ...payload.state, version: payload.version })
        : createEmptyBrandContentState();
      stateRef.current = next;
      setState(next);
      setError("");
      return next;
    } catch (loadError) {
      setError(messageOf(loadError, "品牌内容共享数据加载失败，当前显示本机缓存。"));
      return stateRef.current;
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const dispatch = useCallback(async action => {
    const enrichedAction = { ...action, actor: user?.name || "当前用户", now: action.now || new Date().toISOString() };
    const previous = stateRef.current;
    const optimistic = reduceBrandContentState(previous, enrichedAction);
    stateRef.current = optimistic;
    setState(current => reduceBrandContentState(current, enrichedAction));
    setError("");

    setSaving(true);
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: Number(previous.version || 0), action })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const syncError = new Error(payload.message || "品牌内容修改同步失败。");
        syncError.code = payload.error?.code || "";
        throw syncError;
      }
      const saved = normalizeBrandContentState({ ...payload.state, version: payload.version });
      stateRef.current = saved;
      setState(saved);
      setError("");
      return saved;
    } catch (saveError) {
      if (saveError.code === "BRAND_CONTENT_VERSION_CONFLICT") {
        await refresh({ silent: true });
        setError("内容已被其他同事更新，已刷新到最新版本，请重新执行刚才的操作。");
      } else {
        setError(messageOf(saveError, "修改尚未同步，已保留在本机，请稍后重试。"));
      }
      throw saveError;
    } finally {
      setSaving(false);
    }
  }, [apiUrl, refresh, user?.name]);

  const value = useMemo(() => ({
    state,
    loading,
    saving,
    error,
    currentUser: user,
    dispatch,
    refresh
  }), [dispatch, error, loading, refresh, saving, state, user]);

  return <BrandContentContext.Provider value={value}>{children}</BrandContentContext.Provider>;
}

export function useBrandContent() {
  const context = useContext(BrandContentContext);
  if (!context) throw new Error("useBrandContent must be used inside BrandContentProvider");
  return context;
}
