import { useEffect, useMemo, useState } from "react";
import { normalizeSkuCodes } from "../../domain/salesData.js";
import { fetchSalesForCodes } from "../../state/salesStore.js";

export function useProductSalesRows(products = []) {
  const codes = useMemo(() => [...new Set(products.flatMap(product => normalizeSkuCodes(product?.skuCodes).map(item => item.code)))], [products]);
  const codeKey = codes.join(",");
  const [result, setResult] = useState({ rows: [], loading: false, error: "" });

  useEffect(() => {
    let active = true;
    if (!codes.length) {
      setResult({ rows: [], loading: false, error: "" });
      return () => { active = false; };
    }
    setResult(current => ({ ...current, loading: true, error: "" }));
    fetchSalesForCodes(codes)
      .then(rows => active && setResult({ rows, loading: false, error: "" }))
      .catch(error => active && setResult({ rows: [], loading: false, error: error?.message || "销售数据加载失败" }));
    return () => { active = false; };
  }, [codeKey]);

  return result;
}
