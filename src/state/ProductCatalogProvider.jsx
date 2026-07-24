import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { productCatalogSalesRange } from "../domain/productCatalogSales.js";
import {
  importProductCatalog,
  loadProductCatalog,
  revokeProductCatalogSalesMapping,
  saveProductCatalogSalesMapping,
  syncKuaimaiProductCatalog
} from "./productCatalogApi.js";
import {
  kuaimaiProductCollectionProgress,
  loadWebCollectionStatus,
  triggerKuaimaiProductCollection
} from "./webCollectionApi.js";

const ProductCatalogContext = createContext(null);

function friendlyMessage(error, fallback) {
  const message = String(error?.message || "").trim();
  return /load failed|failed to fetch/i.test(message) ? fallback : message || fallback;
}

function shanghaiBusinessDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function wait(milliseconds) {
  return new Promise(resolve => window.setTimeout(resolve, milliseconds));
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
  const [collectionProgress, setCollectionProgress] = useState(null);

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
      setNotice(`已导入 ${Number(result.counts?.products || 0)} 个商品、${Number(result.counts?.skus || 0)} 个 SKU，并重新核对当前销售归属。`);
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

  const collectKuaimaiProducts = useCallback(async ({ force = false } = {}) => {
    setBusy("chrome-products");
    setError("");
    setNotice("");
    setCollectionProgress({ status: "running", label: "正在创建 Chrome 采集任务", completed: 0, total: 3, jobs: [] });
    try {
      const result = await triggerKuaimaiProductCollection({ date: shanghaiBusinessDate(), force });
      const jobIds = (result.jobs || []).map(job => job.id).filter(Boolean);
      if (jobIds.length !== 3) throw new Error("商品采集任务创建不完整，请查看数据同步。");

      for (let attempt = 0; attempt < 180; attempt += 1) {
        const progress = kuaimaiProductCollectionProgress(await loadWebCollectionStatus(), jobIds);
        setCollectionProgress(progress);
        if (progress.status === "success") {
          await refresh({ quiet: true, query: salesQueryRef.current });
          setNotice("Chrome 插件已获取普通商品、套件和组合装，并重新核对当前销售归属。");
          return result;
        }
        if (["waiting_human", "schema_changed", "failed"].includes(progress.status)) {
          throw new Error(progress.label);
        }
        await wait(2000);
      }
      throw new Error("等待 Chrome 商品采集超时，请查看数据同步。");
    } catch (collectionError) {
      setError(friendlyMessage(collectionError, "Chrome 商品采集失败。"));
      throw collectionError;
    } finally {
      setBusy("");
    }
  }, [refresh]);

  const saveSalesMapping = useCallback(async input => {
    setBusy(`sales-mapping:${input.code}`); setError(""); setNotice("");
    try {
      const result = await saveProductCatalogSalesMapping(input);
      await refresh({ quiet: true, query: salesQueryRef.current });
      setNotice(`销售编码 ${input.code} 已关联商品。`);
      return result;
    } catch (mappingError) {
      setError(friendlyMessage(mappingError, "销售编码关联失败。"));
      throw mappingError;
    } finally {
      setBusy("");
    }
  }, [refresh]);

  const revokeSalesMapping = useCallback(async input => {
    setBusy(`sales-mapping:${input.code}`); setError(""); setNotice("");
    try {
      const result = await revokeProductCatalogSalesMapping(input);
      await refresh({ quiet: true, query: salesQueryRef.current });
      setNotice(`销售编码 ${input.code} 的人工关联已撤销。`);
      return result;
    } catch (mappingError) {
      setError(friendlyMessage(mappingError, "销售编码关联撤销失败。"));
      throw mappingError;
    } finally {
      setBusy("");
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
    collectionProgress,
    refresh,
    importRows,
    syncKuaimai,
    collectKuaimaiProducts,
    saveSalesMapping,
    revokeSalesMapping
  }), [busy, collectKuaimaiProducts, collectionProgress, error, importRows, items, loading, meta, notice, refresh, revokeSalesMapping, runs, salesLoading, salesQuery, saveSalesMapping, syncKuaimai, syncProgress]);

  return <ProductCatalogContext.Provider value={value}>{children}</ProductCatalogContext.Provider>;
}

export function useProductCatalog() {
  const context = useContext(ProductCatalogContext);
  if (!context) throw new Error("useProductCatalog must be used inside ProductCatalogProvider");
  return context;
}
