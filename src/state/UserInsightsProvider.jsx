import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { normalizeInsightScope } from "../domain/userInsights.js";
import { useDataCenter } from "./DataCenterProvider.jsx";
import {
  loadUserInsights,
  requestInsightRetry,
  saveCategoryMapping,
  saveCompetitor,
  saveInsightRule
} from "./userInsightsApi.js";

const UserInsightsContext = createContext(null);
const EMPTY_DATA = { categoryMappings: [], snapshots: [], entities: [], ruleSets: [], ruleHistory: [], competitors: [], suggestions: [], syncRuns: [] };

function initialScope(viewType, range) {
  return normalizeInsightScope({ viewType, platform: "抖音", from: range.from, to: range.to });
}

function friendlyError(error) {
  if (error?.status === 501) return "用户洞察数据库尚未配置，当前不能读取采集事实。";
  if (error?.status === 403) return "当前身份无权执行该用户洞察操作。";
  if (error?.code === "VERSION_CONFLICT") return "记录已被其他人更新，请刷新后重试。";
  return String(error?.message || "用户洞察处理失败，请稍后重试。");
}

export function UserInsightsProvider({ children }) {
  const { range } = useDataCenter();
  const [viewType, setViewType] = useState("shop");
  const [shopScope, setShopScope] = useState(() => initialScope("shop", range));
  const [productScope, setProductScope] = useState(() => initialScope("product", range));
  const [data, setData] = useState(EMPTY_DATA);
  const [actor, setActor] = useState({ departments: [], readonly: true });
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const scope = viewType === "shop" ? shopScope : productScope;

  const setScope = useCallback(update => {
    const setter = viewType === "shop" ? setShopScope : setProductScope;
    setter(current => normalizeInsightScope({ ...current, ...(typeof update === "function" ? update(current) : update), viewType }));
  }, [viewType]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await loadUserInsights(scope);
      setData({ ...EMPTY_DATA, ...(payload.data || {}) });
      setActor(payload.actor || { departments: [], readonly: true });
      setError("");
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => { refresh(); }, [refresh]);

  const command = useCallback(async action => {
    setPending(true);
    try {
      const result = await action();
      await refresh();
      setError("");
      return result;
    } catch (commandError) {
      setError(friendlyError(commandError));
      throw commandError;
    } finally {
      setPending(false);
    }
  }, [refresh]);

  const actions = useMemo(() => ({
    saveCategoryMapping: input => command(() => saveCategoryMapping(input)),
    saveInsightRule: input => command(() => saveInsightRule(input)),
    saveCompetitor: input => command(() => saveCompetitor(input)),
    requestInsightRetry: () => command(() => requestInsightRetry(scope))
  }), [command, scope]);

  const value = useMemo(() => ({
    viewType,
    setViewType,
    shopScope,
    productScope,
    scope,
    setScope,
    data,
    actor,
    loading,
    pending,
    error,
    refresh,
    ...actions
  }), [actions, actor, data, error, loading, pending, productScope, refresh, scope, setScope, shopScope, viewType]);

  return <UserInsightsContext.Provider value={value}>{children}</UserInsightsContext.Provider>;
}

export function useUserInsights() {
  const context = useContext(UserInsightsContext);
  if (!context) throw new Error("useUserInsights must be used inside UserInsightsProvider");
  return context;
}
