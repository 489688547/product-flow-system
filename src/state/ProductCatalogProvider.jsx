import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { importProductCatalog, loadProductCatalog, syncKuaimaiProductCatalog } from "./productCatalogApi.js";

const ProductCatalogContext = createContext(null);

function friendlyMessage(error, fallback) {
  const message = String(error?.message || "").trim();
  return /load failed|failed to fetch/i.test(message) ? fallback : message || fallback;
}

export function ProductCatalogProvider({ children }) {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ products: 0, skus: 0, salesBarcodes: 0, nonStandardBarcodes: 0, missingBarcodes: 0, lastSuccessfulSyncAt: "" });
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const payload = await loadProductCatalog();
      setItems(Array.isArray(payload.items) ? payload.items : []);
      setMeta(current => ({ ...current, ...(payload.meta || {}) }));
      setRuns(Array.isArray(payload.runs) ? payload.runs : []);
      setError("");
      return payload;
    } catch (loadError) {
      setError(friendlyMessage(loadError, "商品主数据加载失败，请刷新重试。"));
      throw loadError;
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

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
    setBusy("kuaimai"); setError(""); setNotice("");
    try {
      const result = await syncKuaimaiProductCatalog();
      await refresh({ quiet: true });
      setNotice(`快麦同步完成：${Number(result.counts?.products || 0)} 个商品、${Number(result.counts?.skus || 0)} 个 SKU。`);
      return result;
    } catch (syncError) {
      setError(friendlyMessage(syncError, "快麦商品同步失败。"));
      throw syncError;
    } finally {
      setBusy("");
    }
  }, [refresh]);

  const value = useMemo(() => ({
    items,
    meta,
    runs,
    loading,
    busy,
    error,
    notice,
    refresh,
    importRows,
    syncKuaimai
  }), [busy, error, importRows, items, loading, meta, notice, refresh, runs, syncKuaimai]);

  return <ProductCatalogContext.Provider value={value}>{children}</ProductCatalogContext.Provider>;
}

export function useProductCatalog() {
  const context = useContext(ProductCatalogContext);
  if (!context) throw new Error("useProductCatalog must be used inside ProductCatalogProvider");
  return context;
}
