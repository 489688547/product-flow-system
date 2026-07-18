import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createDefaultDataCenterState, defaultDataCenterRange, normalizeDataCenterState, reduceDataCenterState } from "../domain/dataCenter.js";
import { normalizeSkuCodes } from "../domain/salesData.js";
import { fetchSalesForCodes } from "./salesStore.js";
import { useProductFlow } from "./ProductFlowProvider.jsx";
import { loadDataCenterSales, loadDataCenterState, saveDataCenterState } from "./dataCenterApi.js";

const DataCenterContext = createContext(null);
const STORAGE_KEY = "dataCenterMetadata";

function loadLocalMetadata() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeDataCenterState(JSON.parse(raw)) : createDefaultDataCenterState();
  } catch {
    return createDefaultDataCenterState();
  }
}

function friendlyMessage(error, fallback) {
  const message = String(error?.message || "").trim();
  return /load failed|failed to fetch/i.test(message) ? fallback : message || fallback;
}

export function DataCenterProvider({ children, enabled = true }) {
  const { state: productState, currentUser } = useProductFlow();
  const [state, setState] = useState(loadLocalMetadata);
  const [range, setRange] = useState(() => defaultDataCenterRange());
  const [salesRows, setSalesRows] = useState([]);
  const [salesMeta, setSalesMeta] = useState({ timeBasis: "create_time", timezone: "Asia/Shanghai", excludeOther: true });
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const dirty = useRef(false);
  const codes = useMemo(() => [...new Set((productState.products || [])
    .flatMap(product => normalizeSkuCodes(product.skuCodes).map(item => item.code)))], [productState.products]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const [metadataResult, salesResult] = await Promise.allSettled([
        loadDataCenterState(),
        loadDataCenterSales({ from: range.from, to: range.to, codes, fallback: fetchSalesForCodes })
      ]);
      if (metadataResult.status === "fulfilled" && metadataResult.value.state) {
        const normalized = normalizeDataCenterState(metadataResult.value.state);
        setState(normalized);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      } else if (metadataResult.reason?.status !== 501) {
        throw metadataResult.reason;
      }
      if (salesResult.status === "rejected") throw salesResult.reason;
      setSalesRows(salesResult.value.rows);
      setSalesMeta({ ...salesResult.value.meta, local: salesResult.value.local });
      setError("");
    } catch (loadError) {
      setError(friendlyMessage(loadError, "数据中心加载失败，当前显示已缓存的元数据。"));
    } finally {
      setLoading(false);
    }
  }, [codes, enabled, range.from, range.to]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (!enabled || !dirty.current) return undefined;
    const timer = setTimeout(async () => {
      try {
        await saveDataCenterState(state);
        dirty.current = false;
        setError("");
      } catch (saveError) {
        if (saveError?.status !== 501) setError(friendlyMessage(saveError, "数据中心元数据同步失败，修改已保存在本机。"));
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [enabled, state]);

  const dispatch = useCallback(action => {
    dirty.current = true;
    setState(current => reduceDataCenterState(current, {
      ...action,
      actor: action.actor || currentUser?.name || "系统"
    }));
  }, [currentUser?.name]);

  const value = useMemo(() => ({
    state,
    range,
    setRange,
    salesRows,
    salesMeta,
    loading,
    error,
    dispatch,
    refresh
  }), [dispatch, error, loading, range, refresh, salesMeta, salesRows, state]);

  return <DataCenterContext.Provider value={value}>{children}</DataCenterContext.Provider>;
}

export function useDataCenter() {
  const context = useContext(DataCenterContext);
  if (!context) throw new Error("useDataCenter must be used inside DataCenterProvider");
  return context;
}
