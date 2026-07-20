import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { productCatalogSalesRange } from "../domain/productCatalogSales.js";
import { importProductCatalog, loadProductCatalog, syncKuaimaiProductCatalog } from "./productCatalogApi.js";

const ProductCatalogContext = createContext(null);

function friendlyMessage(error, fallback) {
  const message = String(error?.message || "").trim();
  return /load failed|failed to fetch/i.test(message) ? fallback : message || fallback;
}

export function ProductCatalogProvider({ children }) {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ products: 0, skus: 0, salesBarcodes: 0, nonStandardBarcodes: 0, missingBarcodes: 0, lastSuccessfulSyncAt: "", sales: {} });
  const [runs, setRuns] = useState([]);
  const [salesQuery, setSalesQuery] = useState(() => ({ ...productCatalogSalesRange(), platform: "" }));
  const [loading, setLoading] = useState(true);
  const [salesLoading, setSalesLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestSequence = useRef(0);
  const salesQueryRef = useRef(salesQuery);
  const [syncProgress, setSyncProgress] = useState(null);

  const refresh = useCallback(async ({ quiet = false, query = salesQueryRef.current } = {}) => {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    if (!quiet) setLoading(true);
    setSalesLoading(true);
    try {
      const payload = await loadProductCatalog(query);
      if (requestId !== requestSequence.current) return payload;
      setItems(Array.isArray(payload.items) ? payload.items : []);
      setMeta(current => ({ ...current, ...(payload.meta || {}) }));
      setRuns(Array.isArray(payload.runs) ? payload.runs : []);
      setError("");
      return payload;
    } catch (loadError) {
      if (requestId !== requestSequence.current) throw loadError;
      setError(friendlyMessage(loadError, "商品主数据加载失败，请刷新重试。"));
      throw loadError;
    } finally {
      if (requestId === requestSequence.current) {
        if (!quiet) setLoading(false);
        setSalesLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    salesQueryRef.current = salesQuery;
    refresh({ query: salesQuery }).catch(() => {});
  }, [refresh, salesQuery]);

  const importRows = useCallback(async input => {
    setBusy("import"); setError(""); setNotice("");
    try {
      const result = await importProductCatalog(input);
      await refresh({ quiet: true });
      setNotice(`已导入 ${Number(result.counts?.products || 0)} 个商品、${Number(result.counts?.skus || 0)} 个 SKU。`);
      return result;
    } catch (importError) {
      setError(friendlyMessage(importError, "商品主数据导入失败。"));
      throw importError;
    } finally {
      setBusy("");
    }
  }, [refresh]);

  const syncKuaimai = useCallback(async () => {
    setBusy("kuaimai"); setError(""); setNotice(""); setSyncProgress({ processed: 0, totalCandidates: 0, components: 0, failed: 0 });
    try {
      const result = await syncKuaimaiProductCatalog(undefined, setSyncProgress);
      await refresh({ quiet: true });
      const componentText = `、${Number(result.progress?.components || 0)} 条库存组成`;
      const failureText = result.failures?.length ? `；${result.failures.length} 个组合商品详情待重试` : "";
      setNotice(`快麦同步完成：${Number(result.counts?.products || 0)} 个商品、${Number(result.counts?.skus || 0)} 个库存单位${componentText}${failureText}。`);
      return result;
    } catch (syncError) {
      setError(friendlyMessage(syncError, "快麦商品同步失败。"));
      throw syncError;
    } finally {
      setBusy("");
      setSyncProgress(null);
    }
  }, [refresh]);

  const value = useMemo(() => ({
    items,
    meta,
    runs,
    salesQuery,
    setSalesQuery,
    loading,
    salesLoading,
    busy,
    error,
    notice,
    syncProgress,
    refresh,
    importRows,
    syncKuaimai
  }), [busy, error, importRows, items, loading, meta, notice, refresh, runs, salesLoading, salesQuery, syncKuaimai, syncProgress]);

  return <ProductCatalogContext.Provider value={value}>{children}</ProductCatalogContext.Provider>;
}

export function useProductCatalog() {
  const context = useContext(ProductCatalogContext);
  if (!context) throw new Error("useProductCatalog must be used inside ProductCatalogProvider");
  return context;
}
