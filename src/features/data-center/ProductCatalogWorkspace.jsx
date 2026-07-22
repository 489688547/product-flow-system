import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Banknote, Barcode, Boxes, CircleAlert, FileSpreadsheet, PackageSearch, RefreshCw, Search, ShoppingBasket, Upload } from "lucide-react";
import { parseProductCatalogRows } from "../../domain/productCatalog.js";
import { productCatalogSalesRange, sortProductCatalogBySales } from "../../domain/productCatalogSales.js";
import { streamSpreadsheetRows } from "../../domain/xlsxLite.js";
import { useProductCatalog } from "../../state/ProductCatalogProvider.jsx";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { useSupplyChain } from "../../state/SupplyChainProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { DataTable } from "../../ui/DataTable.jsx";
import { HeaderFilter } from "../../ui/HeaderFilter.jsx";
import { TablePagination } from "../../ui/TablePagination.jsx";

const PAGE_SIZE = 50;

async function rowsFromSpreadsheet(file) {
  let headers = null;
  const rows = [];
  await streamSpreadsheetRows(file, row => {
    if (!headers) {
      headers = row.map(value => String(value || "").trim());
      return;
    }
    if (!row.some(value => String(value ?? "").trim())) return;
    rows.push(Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
  });
  return rows;
}

function includesQuery(item, query) {
  if (!query) return true;
  const search = [
    item.name,
    item.shortName,
    item.merchantCode,
    item.category,
    item.brand,
    ...(item.skus || []).flatMap(sku => [sku.barcode, sku.merchantSkuCode, sku.specification, sku.specificationAlias]),
    ...(item.components || []).map(component => component.inventoryUnitCode)
  ].join(" ").toLowerCase();
  return search.includes(query.toLowerCase());
}

function dateTime(value) {
  if (!value) return "尚未同步";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString("zh-CN", { hour12: false });
}

function codeList(item) {
  const skus = item.skus || [];
  if (!skus.length) return <span className="table-secondary">暂无 SKU</span>;
  return <span className="catalog-code-list">{skus.slice(0, 3).map(sku => <span key={sku.id}><b className="catalog-code">{sku.barcode || "无编码"}</b><small>{sku.barcodeType === "sales_barcode" ? "标准商品条码" : sku.barcodeType === "missing" ? "缺少库存单位编码" : "内部唯一码"} · 规格商家编码 {sku.merchantSkuCode || "—"}</small></span>)}{skus.length > 3 ? <em>另有 {skus.length - 3} 个库存单位</em> : null}</span>;
}

function componentList(item) {
  const components = item.components || [];
  if (components.length) return <span className="catalog-component-list">{components.slice(0, 4).map(component => <span key={component.id}><b className="catalog-code">{component.inventoryUnitCode || "缺少编码"}</b><small>× {component.ratio} 个库存单位</small></span>)}{components.length > 4 ? <em>另有 {components.length - 4} 项组成</em> : null}</span>;
  if (item.productKind === "bundle") return <span className="catalog-component-list pending"><strong>组合商品</strong><small>库存组成待同步</small></span>;
  return <span className="catalog-component-list"><strong>单品</strong><small>销量直接消耗当前库存单位</small></span>;
}

function priceRange(item) {
  const hasPrice = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  const costs = (item.skus || []).map(sku => sku.purchasePrice).filter(hasPrice);
  const components = item.components || [];
  if (!costs.length && components.length && components.every(component => hasPrice(component.purchasePrice) && Number.isInteger(component.ratio))) {
    const bundleCost = components.reduce((sum, component) => sum + Number(component.purchasePrice) * component.ratio, 0);
    return `¥${bundleCost.toFixed(2)}`;
  }
  if (!costs.length) return "—";
  const min = Math.min(...costs);
  const max = Math.max(...costs);
  return min === max ? `¥${min.toFixed(2)}` : `¥${min.toFixed(2)}–${max.toFixed(2)}`;
}

function quantity(value) {
  return Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function money(value) {
  return `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function salesCell(item) {
  const sales = item.sales || { quantity: 0, netSales: 0, platforms: [], matchedCodeCount: 0 };
  const platforms = (sales.platforms || []).slice(0, 2).map(entry => `${entry.platform} ${quantity(entry.quantity)}`).join(" · ");
  return <span className={`product-catalog-sales-cell ${sales.quantity ? "has-sales" : "no-sales"}`}>
    <strong>{quantity(sales.quantity)}</strong>
    <small>{sales.quantity ? `${money(sales.netSales)} · ${sales.matchedCodeCount} 个匹配编码` : "该范围暂无销售"}</small>
    {platforms ? <em>{platforms}</em> : null}
  </span>;
}

const DATE_OPTIONS = [
  { value: "last7", label: "最近 7 天" },
  { value: "last30", label: "最近 30 天" },
  { value: "thisMonth", label: "本月" },
  { value: "lastMonth", label: "上月" },
  { value: "custom", label: "自定义" }
];

export function ProductCatalogWorkspace({ canEdit }) {
  const { items, meta, loading, salesLoading, salesQuery, setSalesQuery, busy, error, notice, syncProgress, refresh, importRows, syncKuaimai } = useProductCatalog();
  const { state: productState } = useProductFlow();
  const { state: supplyState } = useSupplyChain();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [kind, setKind] = useState("all");
  const [linked, setLinked] = useState("all");
  const [customRange, setCustomRange] = useState(() => ({ from: salesQuery.from, to: salesQuery.to }));
  const [rangeError, setRangeError] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [pending, setPending] = useState(null);
  const [page, setPage] = useState(1);
  const deferredQuery = useDeferredValue(query.trim());

  const productLinks = useMemo(() => new Map((productState.products || []).filter(product => product.catalogProductId).map(product => [product.catalogProductId, product])), [productState.products]);
  const supplierCounts = useMemo(() => {
    const counts = new Map();
    for (const relation of supplyState.productSupplierLinks || []) {
      const id = relation.catalogProductId;
      if (id) counts.set(id, (counts.get(id) || 0) + 1);
    }
    return counts;
  }, [supplyState.productSupplierLinks]);
  const categories = useMemo(() => [...new Set(items.map(item => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN")), [items]);
  const salesMeta = meta.sales || {};
  const platforms = useMemo(() => {
    const values = new Set(salesMeta.availablePlatforms || []);
    if (salesQuery.platform) values.add(salesQuery.platform);
    return [...values].sort((left, right) => left.localeCompare(right, "zh-CN"));
  }, [salesMeta.availablePlatforms, salesQuery.platform]);
  const filtered = useMemo(() => sortProductCatalogBySales(items
    .filter(item => includesQuery(item, deferredQuery))
    .filter(item => category === "all" || item.category === category)
    .filter(item => kind === "all" || item.productKind === kind)
    .filter(item => linked === "all" || (linked === "linked" ? productLinks.has(item.id) : !productLinks.has(item.id))), [category, deferredQuery, items, kind, linked, productLinks]);
  useEffect(() => setPage(1), [category, kind, linked, query, salesQuery.from, salesQuery.platform, salesQuery.to]);
  const visible = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
  const totals = useMemo(() => ({
    products: items.length,
    skus: items.reduce((sum, item) => sum + (item.skus || []).length, 0),
    inventoryUnits: new Set(items.flatMap(item => [...(item.skus || []).map(sku => sku.barcode).filter(Boolean), ...(item.components || []).map(component => component.inventoryUnitCode).filter(Boolean)])).size,
    bundles: items.filter(item => item.productKind === "bundle").length,
    components: items.reduce((sum, item) => sum + (item.components || []).length, 0),
    quantity: Number(salesMeta.totalQuantity) || 0,
    netSales: Number(salesMeta.totalNetSales) || 0,
    coveredProducts: Number(salesMeta.coveredProducts) || 0
  }), [items, salesMeta.coveredProducts, salesMeta.totalNetSales, salesMeta.totalQuantity]);

  function selectPlatform(value) {
    setSalesQuery(current => ({ ...current, platform: value }));
  }

  function selectDatePreset(preset) {
    try {
      const range = productCatalogSalesRange(preset, customRange);
      setRangeError("");
      setCustomRange({ from: range.from, to: range.to });
      setSalesQuery(current => ({ ...current, ...range }));
    } catch (event) {
      setRangeError(event.message || "日期范围无效。");
    }
  }

  function changeCustomDate(field, value) {
    const next = { ...customRange, [field]: value };
    setCustomRange(next);
    try {
      const range = productCatalogSalesRange("custom", next);
      setRangeError("");
      setSalesQuery(current => ({ ...current, ...range }));
    } catch (event) {
      setRangeError(event.message || "日期范围无效。");
    }
  }
  async function handleFile(file) {
    if (!file) return;
    setParsing(true); setParseError(""); setPending(null);
    try {
      const rows = await rowsFromSpreadsheet(file);
      const parsed = parseProductCatalogRows(rows, { source: "kuaimai-file", fileName: file.name });
      if (!parsed.items.length) throw new Error("文件中没有找到可导入的商品，请检查主商家编码和商品名称表头。");
      setPending(parsed);
    } catch (event) {
      setParseError(event.message || "ERP 商品文件解析失败。");
    } finally {
      setParsing(false);
    }
  }

  async function confirmImport() {
    if (!pending?.items.length) return;
    try {
      await importRows({ source: "kuaimai-file", fileName: pending.fileName, items: pending.items, errors: pending.errors });
      setPending(null);
    } catch {
      // Provider keeps the actionable server error while the preview stays available.
    }
  }

  const columns = [
    { key: "product", header: "商品", render: item => <span className="catalog-product-cell"><strong>{item.name}</strong><small>主商家编码 <b className="catalog-code">{item.merchantCode || "—"}</b></small></span> },
    { key: "codes", header: "库存单位编码", render: codeList },
    { key: "components", header: "库存组成", render: componentList },
    { key: "classification", header: "分类 / 品牌", render: item => <span><strong>{item.category || "未分类"}</strong><small className="table-secondary">{item.brand || "未设置品牌"}</small></span> },
    { key: "sales", header: "销量", render: salesCell },
    { key: "cost", header: "ERP 成本", render: item => <span><strong>{priceRange(item)}</strong><small className="table-secondary">{item.productKind === "bundle" ? `${(item.components || []).length} 项组成` : `${(item.skus || []).length} 个库存单位`}</small></span> },
    { key: "link", header: "业务关联", render: item => {
      const product = productLinks.get(item.id);
      return <span><strong>{product ? `已关联产品：${product.name}` : "未关联产品"}</strong><small className="table-secondary">{supplierCounts.get(item.id) || 0} 家关联供应商</small></span>;
    } }
  ];

  if (loading && !items.length) return <div className="product-catalog-loading" aria-label="正在加载商品主数据"><span /><span /><span /></div>;
  const empty = !items.length
    ? <div className="empty-state compact-empty">还没有商品主数据。可以同步快麦商品，或导入 ERP 商品档案 XLSX / CSV。</div>
    : <div className="empty-state compact-empty">没有符合当前筛选条件的商品，请调整搜索或筛选。</div>;

  return <div className="data-workspace product-catalog-workspace">
    <section className="product-catalog-metrics" aria-label="商品主数据概况">
      {[
        [PackageSearch, "商品", quantity(totals.products), "ERP 主商品"],
        [Barcode, "库存单位", quantity(totals.inventoryUnits), `${quantity(totals.bundles)} 个组合商品 · ${quantity(totals.components)} 条组成`],
        [ShoppingBasket, "销量", quantity(totals.quantity), totals.quantity ? `${salesQuery.from} 至 ${salesQuery.to}` : "当前范围暂无销售"],
        [Banknote, "净销售额", money(totals.netSales), salesQuery.platform || "全部正常平台"],
        [Boxes, "已售商品", quantity(totals.coveredProducts), `共 ${quantity(totals.products)} 个商品`]
      ].map(([Icon, label, value, detail]) => <div key={label}><Icon size={18} aria-hidden="true" /><span>{label}<strong>{value}</strong><small>{detail}</small></span></div>)}
      <small className="product-catalog-sources"><span>商品档案 {dateTime(meta.lastSuccessfulSyncAt)}</span><span>销售数据至 {salesMeta.latestDataDate || "—"} · 入库 {dateTime(salesMeta.lastSuccessfulSyncAt)}</span></small>
    </section>

    <section className="product-catalog-toolbar" aria-label="商品搜索与操作">
      <label className="product-catalog-search"><Search size={16} aria-hidden="true" /><span className="sr-only">搜索商品</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索商品、69 码、内部唯一码或商家编码" /></label>
      <div className="product-catalog-filters">
        <HeaderFilter label="平台" value={salesQuery.platform} onChange={selectPlatform} options={[{ value: "", label: "全部平台" }, ...platforms.map(value => ({ value, label: value }))]} />
        <HeaderFilter label="日期" value={salesQuery.preset} onChange={selectDatePreset} options={DATE_OPTIONS} />
        <HeaderFilter label="类型" value={kind} onChange={setKind} options={[{ value: "all", label: "全部类型" }, { value: "single", label: "单品" }, { value: "bundle", label: "组合商品" }]} />
        <HeaderFilter label="分类" value={category} onChange={setCategory} options={[{ value: "all", label: "全部分类" }, ...categories.map(value => ({ value, label: value }))]} />
        <HeaderFilter label="关联" value={linked} onChange={setLinked} options={[{ value: "all", label: "全部关联状态" }, { value: "linked", label: "已关联产品" }, { value: "unlinked", label: "未关联产品" }]} />
      </div>
      <div className="product-catalog-actions">
        {canEdit ? <label className={`upload-field ${parsing || busy === "import" ? "is-busy" : ""}`}><Upload size={16} />{parsing ? "正在解析…" : busy === "import" ? "正在导入…" : "导入 ERP 商品文件"}<input type="file" accept=".xlsx,.csv" disabled={parsing || Boolean(busy)} onChange={event => { handleFile(event.target.files?.[0]); event.target.value = ""; }} /></label> : null}
        <Button variant="primary" disabled={!canEdit || Boolean(busy)} disabledReason="仅总经办和运营部可同步商品主数据" onClick={() => syncKuaimai().catch(() => {})}><RefreshCw size={16} className={busy === "kuaimai" ? "is-spinning" : ""} />{busy === "kuaimai" ? `同步组合关系 ${Number(syncProgress?.processed || 0)}/${Number(syncProgress?.totalCandidates || 0)}` : "同步快麦商品"}</Button>
      </div>
      {salesQuery.preset === "custom" ? <div className="product-catalog-date-range" aria-label="自定义销量日期范围">
        <label><span>开始日期</span><input type="date" value={customRange.from} onChange={event => changeCustomDate("from", event.target.value)} /></label>
        <span aria-hidden="true">至</span>
        <label><span>结束日期</span><input type="date" value={customRange.to} onChange={event => changeCustomDate("to", event.target.value)} /></label>
      </div> : null}
      <div className="product-catalog-query-state" role="status">
        <span>{salesLoading ? <><RefreshCw size={14} className="is-spinning" />销量更新中</> : `${salesQuery.from} 至 ${salesQuery.to} · ${salesQuery.platform || "全部平台"}`}</span>
        {!salesLoading && salesMeta.latestDataDate && salesMeta.latestDataDate < salesQuery.to ? <span className="product-catalog-coverage-warning"><CircleAlert size={14} />销售事实仅更新至 {salesMeta.latestDataDate}</span> : null}
        {Number(salesMeta.unmatchedRowCount) > 0 ? <span className="product-catalog-coverage-warning"><CircleAlert size={14} />{quantity(salesMeta.unmatchedRowCount)} 条销售汇总未匹配商品</span> : null}
      </div>
    </section>

    {rangeError ? <p className="supply-message error" role="alert">{rangeError}</p> : null}
    {error ? <div className="supply-message error product-catalog-error" role="alert"><span>{error}</span><Button disabled={loading} onClick={() => refresh().catch(() => {})}><RefreshCw size={15} className={loading ? "is-spinning" : ""} />{loading ? "正在重新加载…" : "重新加载"}</Button></div> : null}
    {parseError ? <p className="supply-message error" role="alert">{parseError}</p> : null}
    {notice ? <p className="supply-message success" role="status">{notice}</p> : null}
    {pending ? <section className="supply-import-preview product-catalog-preview"><FileSpreadsheet size={20} /><div><strong>{pending.fileName}</strong><span>识别 {pending.items.length} 个商品、{pending.counts.skus} 个 SKU · 异常 {pending.errors.length} 行</span>{pending.errors.slice(0, 3).map(item => <small key={`${item.rowNumber}-${item.field}`}>第 {item.rowNumber} 行：{item.message}</small>)}</div><div className="supply-import-actions"><Button onClick={() => setPending(null)}>取消</Button><Button variant="primary" disabled={!pending.items.length || Boolean(busy)} onClick={confirmImport}>确认导入</Button></div></section> : null}

    <DataTable className="product-catalog-table" columns={columns} rows={visible} minWidth={1380} empty={empty} />
    {filtered.length ? <TablePagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} /> : null}
  </div>;
}
