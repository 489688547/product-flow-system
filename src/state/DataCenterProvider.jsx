import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createDefaultDataCenterState, defaultDataCenterRange, normalizeDataCenterState, reduceDataCenterState } from "../domain/dataCenter.js";
import { normalizeSkuCodes } from "../domain/salesData.js";
import { fetchSalesForCodes } from "./salesStore.js";
import { useProductFlow } from "./ProductFlowProvider.jsx";
import { dataCenterRangeFromSearch, loadDataCenterSales, loadDataCenterState, saveDataCenterState } from "./dataCenterApi.js";
import {
  loadCredentialMetadata,
  loadDataCenterConnections,
  persistConnectorConnection,
  persistInternalVaultConnection,
  revealCredential
} from "./dataCenterConnectionsApi.js";
import { environmentStorageKey, migrateLegacyProductionCache } from "./dataEnvironmentClient.js";

const DataCenterContext = createContext(null);
const STORAGE_KEY = "dataCenterMetadata";

function localStorageKey() {
  migrateLegacyProductionCache(localStorage, STORAGE_KEY);
  return environmentStorageKey(STORAGE_KEY);
}

function loadLocalMetadata() {
  try {
    const raw = localStorage.getItem(localStorageKey());
    return raw ? normalizeDataCenterState(JSON.parse(raw)) : createDefaultDataCenterState();
  } catch {
    return createDefaultDataCenterState();
  }
}

function persistableMetadata(state) {
  const { metricDefinitions: _governedByDataStandards, ...metadata } = state;
  return metadata;
}

function friendlyMessage(error, fallback) {
  const message = String(error?.message || "").trim();
  return /load failed|failed to fetch/i.test(message) ? fallback : message || fallback;
}

export function DataCenterProvider({ children, enabled = true }) {
  const { state: productState, currentUser } = useProductFlow();
  const [state, setState] = useState(loadLocalMetadata);
  const [range, setRange] = useState(() => dataCenterRangeFromSearch(window.location.search, defaultDataCenterRange()));
  const [salesRows, setSalesRows] = useState([]);
  const [salesMeta, setSalesMeta] = useState({ timeBasis: "create_time", timezone: "Asia/Shanghai", excludeOther: true });
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const [connections, setConnections] = useState([]);
  const [vaultItems, setVaultItems] = useState([]);
  const [vaultEntries, setVaultEntries] = useState([]);
  const [connectionsLoading, setConnectionsLoading] = useState(enabled);
  const [connectionsError, setConnectionsError] = useState("");
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
        localStorage.setItem(localStorageKey(), JSON.stringify(persistableMetadata(normalized)));
      } else if (![404, 405, 501].includes(metadataResult.reason?.status)) {
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

  const refreshConnections = useCallback(async () => {
    if (!enabled) return;
    setConnectionsLoading(true);
    try {
      const [recordsResult, credentialsResult] = await Promise.allSettled([
        loadDataCenterConnections(),
        loadCredentialMetadata()
      ]);
      if (recordsResult.status === "rejected") throw recordsResult.reason;
      setConnections(recordsResult.value.connectors);
      setVaultItems(recordsResult.value.vaultItems);
      if (credentialsResult.status === "fulfilled") setVaultEntries(credentialsResult.value.entries);
      else if (credentialsResult.reason?.status !== 403) throw credentialsResult.reason;
      else setVaultEntries([]);
      setConnectionsError("");
    } catch (loadError) {
      setConnectionsError(friendlyMessage(loadError, "数据连接加载失败。"));
    } finally {
      setConnectionsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refreshConnections();
  }, [refreshConnections]);

  useEffect(() => {
    localStorage.setItem(localStorageKey(), JSON.stringify(persistableMetadata(state)));
    if (!enabled || !dirty.current) return undefined;
    const timer = setTimeout(async () => {
      try {
        await saveDataCenterState(persistableMetadata(state));
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

  const saveConnection = useCallback(async ({ instance, secretPayload = {} }) => {
    const saved = await persistConnectorConnection({ instance, secretPayload, vaultEntries });
    await refreshConnections();
    return saved;
  }, [refreshConnections, vaultEntries]);

  const saveVaultItem = useCallback(async ({ item, secretPayload = {} }) => {
    const saved = await persistInternalVaultConnection({ item, secretPayload, vaultEntries });
    await refreshConnections();
    return saved;
  }, [refreshConnections, vaultEntries]);

  const revealConnectionCredential = useCallback((id, purpose, confirmation) => (
    revealCredential(id, purpose, confirmation)
  ), []);

  const value = useMemo(() => ({
    state,
    range,
    setRange,
    salesRows,
    salesMeta,
    loading,
    error,
    connections,
    vaultItems,
    vaultEntries,
    connectionsLoading,
    connectionsError,
    dispatch,
    refresh,
    refreshConnections,
    saveConnection,
    saveVaultItem,
    revealConnectionCredential
  }), [connections, connectionsError, connectionsLoading, dispatch, error, loading, range, refresh, refreshConnections, revealConnectionCredential, salesMeta, salesRows, saveConnection, saveVaultItem, state, vaultEntries, vaultItems]);

  return <DataCenterContext.Provider value={value}>{children}</DataCenterContext.Provider>;
}

export function useDataCenter() {
  const context = useContext(DataCenterContext);
  if (!context) throw new Error("useDataCenter must be used inside DataCenterProvider");
  return context;
}
