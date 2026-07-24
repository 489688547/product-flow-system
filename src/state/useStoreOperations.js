import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dataCenterPresetRange } from "../domain/dataCenter.js";
import { buildContentDailySummary, buildProductDailyTop10, buildStoreDailySummary } from "../domain/commerceOperationsView.js";
import { loadWebCollectionStatus } from "./webCollectionApi.js";
import { loadCommerceFacts } from "./commerceFactsApi.js";

const PROVIDER_ID = "douyin-ecommerce";
const EMPTY_DATA = Object.freeze({ storeDaily: null, products: null, content: null });

// 数据总览「店铺经营数据」的取数编排：加载已登记抖店店铺、按选中店铺拉取四类经营事实，
// 并交给纯函数视图构建器汇总。权限不足（403）时优雅降级为 permissionDenied。
export function useStoreOperations({ enabled = true } = {}) {
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState("");
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const [permissionDenied, setPermissionDenied] = useState(false);
  const requestToken = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    (async () => {
      try {
        const status = await loadWebCollectionStatus();
        if (!active) return;
        const connected = (status.stores || [])
          .filter(store => store.providerId === PROVIDER_ID && store.status === "connected" && store.storeId);
        setStores(connected);
        setSelectedStore(current => current || connected[0]?.storeId || "");
        setPermissionDenied(false);
      } catch (loadError) {
        if (!active) return;
        if (loadError?.status === 403) setPermissionDenied(true);
        else setError(loadError?.message || "店铺列表读取失败。");
      }
    })();
    return () => { active = false; };
  }, [enabled]);

  const factsWindow = useMemo(() => dataCenterPresetRange(7), []);

  const loadStore = useCallback(async storeId => {
    if (!storeId) { setData(EMPTY_DATA); return; }
    const token = ++requestToken.current;
    setLoading(true);
    setError("");
    const range = { storeId, providerId: PROVIDER_ID, from: factsWindow.from, to: factsWindow.to };
    const [store, product, live, video] = await Promise.allSettled([
      loadCommerceFacts({ ...range, resourceType: "store_daily" }),
      loadCommerceFacts({ ...range, resourceType: "product_daily" }),
      loadCommerceFacts({ ...range, resourceType: "live_daily" }),
      loadCommerceFacts({ ...range, resourceType: "video_daily" })
    ]);
    if (token !== requestToken.current) return; // 快速切换店铺时丢弃过期结果
    const denied = [store, product, live, video].some(result => result.status === "rejected" && result.reason?.status === 403);
    if (denied) {
      setPermissionDenied(true);
      setData(EMPTY_DATA);
      setLoading(false);
      return;
    }
    const facts = result => result.status === "fulfilled" ? result.value.facts : [];
    setData({
      storeDaily: buildStoreDailySummary(facts(store)),
      products: buildProductDailyTop10(facts(product), 10),
      content: buildContentDailySummary(facts(live), facts(video))
    });
    const hardError = [store, product, live, video].find(result => result.status === "rejected");
    setError(hardError ? (hardError.reason?.message || "部分店铺经营数据读取失败。") : "");
    setLoading(false);
  }, [factsWindow.from, factsWindow.to]);

  useEffect(() => {
    if (!enabled || permissionDenied) return;
    loadStore(selectedStore);
  }, [enabled, permissionDenied, selectedStore, loadStore]);

  return {
    stores,
    selectedStore,
    onSelectStore: setSelectedStore,
    storeDaily: data.storeDaily,
    products: data.products,
    content: data.content,
    loading,
    error,
    permissionDenied
  };
}
