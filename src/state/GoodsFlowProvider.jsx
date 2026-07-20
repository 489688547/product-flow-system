import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  createGoodsFlowStocktake,
  fetchGoodsFlowDashboard,
  fetchGoodsFlowInventory,
  fetchGoodsFlowStocktakes,
  fetchGoodsFlowTerms,
  freezeGoodsFlowCcc,
  importGoodsFlowFacts,
  recalculateGoodsFlowCcc,
  saveGoodsFlowTerm,
  transitionGoodsFlowStocktake
} from "./goodsFlowApi.js";

const GoodsFlowContext = createContext(null);

function messageFor(error) {
  return String(error?.message || "货流数据加载失败，当前保留上次成功数据。");
}

export function GoodsFlowProvider({ children, enabled = true }) {
  const [dashboard, setDashboard] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [terms, setTerms] = useState([]);
  const [stocktakes, setStocktakes] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return null;
    }
    setLoading(true);
    try {
      const [dashboardPayload, inventoryPayload, termsPayload, stocktakesPayload] = await Promise.all([
        fetchGoodsFlowDashboard(),
        fetchGoodsFlowInventory(),
        fetchGoodsFlowTerms(),
        fetchGoodsFlowStocktakes()
      ]);
      setDashboard(dashboardPayload.data || null);
      setInventory(inventoryPayload.data || []);
      setTerms(termsPayload.data || []);
      setStocktakes(stocktakesPayload.data || []);
      setStale(false);
      setError("");
      return dashboardPayload.data || null;
    } catch (loadError) {
      setStale(true);
      setError(messageFor(loadError));
      return null;
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const runAndRefresh = useCallback(async operation => {
    try {
      const result = await operation();
      await refresh();
      return result;
    } catch (actionError) {
      setStale(true);
      setError(messageFor(actionError));
      throw actionError;
    }
  }, [refresh]);

  const saveTerm = useCallback((term, options = {}) => runAndRefresh(() => saveGoodsFlowTerm({ term, ...options })), [runAndRefresh]);
  const createStocktake = useCallback((stocktake, options = {}) => runAndRefresh(() => createGoodsFlowStocktake({ stocktake, ...options })), [runAndRefresh]);
  const transitionStocktake = useCallback((id, action, expectedVersion, options = {}) => runAndRefresh(() => transitionGoodsFlowStocktake({ id, action, expectedVersion, ...options })), [runAndRefresh]);
  const recalculateCcc = useCallback((month, input, options = {}) => runAndRefresh(() => recalculateGoodsFlowCcc({ month, input, ...options })), [runAndRefresh]);
  const freezeCcc = useCallback((month, expectedVersion, options = {}) => runAndRefresh(() => freezeGoodsFlowCcc({ month, expectedVersion, ...options })), [runAndRefresh]);
  const importFacts = useCallback((input, options = {}) => runAndRefresh(() => importGoodsFlowFacts({ input, ...options })), [runAndRefresh]);

  const value = useMemo(() => ({
    dashboard,
    inventory,
    terms,
    stocktakes,
    loading,
    stale,
    error,
    refresh,
    saveTerm,
    createStocktake,
    transitionStocktake,
    recalculateCcc,
    freezeCcc,
    importFacts
  }), [
    createStocktake, dashboard, error, freezeCcc, importFacts, inventory, loading,
    recalculateCcc, refresh, saveTerm, stale, stocktakes, terms, transitionStocktake
  ]);

  return <GoodsFlowContext.Provider value={value}>{children}</GoodsFlowContext.Provider>;
}

export function useGoodsFlow() {
  const context = useContext(GoodsFlowContext);
  if (!context) throw new Error("useGoodsFlow must be used inside GoodsFlowProvider");
  return context;
}
