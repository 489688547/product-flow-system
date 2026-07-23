import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Barcode, CircleAlert, FileSpreadsheet, PackageCheck, PackageSearch, RefreshCw, Search, Upload } from "lucide-react";
import { parseProductCatalogRows } from "../../domain/productCatalog.js";
import { productCatalogSalesRange, sortProductCatalogBySales } from "../../domain/productCatalogSales.js";
import { streamSpreadsheetRows } from "../../domain/xlsxLite.js";
import { useProductCatalog } from "../../state/ProductCatalogProvider.jsx";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { useSupplyChain } from "../../state/SupplyChainProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { DataTable } from "../../ui/DataTable.jsx";
import { DateRangePickerField } from "../../ui/DateRangePickerField.jsx";
import { HeaderFilter } from "../../ui/HeaderFilter.jsx";
import { TablePagination } from "../../ui/TablePagination.jsx";
import { ProductCatalogDetailDialog } from "./ProductCatalogDetailDialog.jsx";

const PAGE_SIZE = 50;

const DATE_OPTIONS = [
  { value: "last7", label: "最近 7 天" },
  { value: "last30", label: "最近 30 天" },
  { value: "thisMonth", label: "本月" },
  { value: "lastMonth", label: "上月" },
  { value: "custom", label: "自定义" }
];

const VIEW_OPTIONS = [
  { value: "all", label: "全部商品" },
  { value: "attention", label: "待完善" },
  { value: "bundle", label: "组合商品" },
  { value: "unsold", label: "未售商品" },
  { value: "unlinked", label: "未关联产品" }
];

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

function quantity(value) {
  return Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function money(value) {
  return `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function priceRange(item) {
  const costs = (item.skus || []).map(sku => sku.purchasePrice).filter(hasValue);
  const components = item.components || [];
  if (!costs.length && components.length && components.every(component => hasValue(component.purchasePrice) && Number.isInteger(component.ratio))) {
    const bundleCost = components.reduce((sum, component) => sum + Number(component.purchasePrice) * component.ratio, 0);
    return `¥${bundleCost.toFixed(2)}`;
  }
  if (!costs.length) return "—";
  const min = Math.min(...costs);
  const max = Math.max(...costs);
  return min === max ? `¥${min.toFixed(2)}` : `¥${min.toFixed(2)}–${max.toFixed(2)}`;
}

function catalogIssues(item) {
  const issues = [];
  const skus = item.skus || [];
  if (!skus.length) issues.push("缺少 SKU");
  else if (skus.some(sku => !String(sku.barcode || "").trim())) issues.push("缺少库存单位编码");
  if (item.productKind === "bundle" && !(item.components || []).length) issues.push("组合关系待补齐");
  if (!String(item.category || "").trim()) issues.push("未分类");
  if (!String(item.brand || "").trim()) issues.push("未设置品牌");
  return issues;
}

function skuSummary(item) {
  const skus = item.skus || [];
  const primary = skus.find(sku => sku.barcode)?.barcode || "";
  if (!skus.length) return <span className="catalog-summary-cell warning"><strong>暂无 SKU</strong><small>需要 ERP 商品文件补齐</small></span>;
  return <span className="catalog-summary-cell"><strong className="catalog-code">{primary || "缺少库存单位编码"}</strong><small>{quantity(skus.length)} 个库存单位{skus.length > 1 ? " · 详情查看全部" : ` · 规格商家编码 ${skus[0].merchantSkuCode || "—"}`}</small></span>;
}

function typeSummary(item) {
  const components = item.components || [];
  if (item.productKind === "bundle") return <span className={`catalog-summary-cell ${components.length ? "" : "warning"}`}><strong>组合商品</strong><small>{components.length ? `${quantity(components.length)} 项组成` : "组合关系待补齐"}</small></span>;
  return <span className="catalog-summary-cell"><strong>单品</strong><small>{quantity((item.skus || []).length)} 个库存单位</small></span>;
}

function salesSummary(item) {
  const sales = item.sales || { quantity: 0, netSales: 0 };
  return <span className={`product-catalog-sales-cell ${sales.quantity || sales.netSales ? "has-sales" : "no-sales"}`}>
    <strong>{quantity(sales.quantity)}</strong>
    <small>{sales.quantity || sales.netSales ? money(sales.netSales) : "该范围暂无销售"}</small>
  </span>;
}

function matchesView(item, view, productLinks) {
  if (view === "attention") return catalogIssues(item).length > 0;
  if (view === "bundle") return item.productKind === "bundle";
  if (view === "unsold") return !(Number(item.sales?.quantity) || Number(item.sales?.netSales));
  if (view === "unlinked") return !productLinks.has(item.id);
  return true;
}

export function ProductCatalogWorkspace({ canEdit }) {
  const { items, meta, loading, salesLoading, salesQuery, setSalesQuery, busy, error, notice, refresh, importRows } = useProductCatalog();
  const { state: productState } = useProductFlow();
  const { state: supplyState } = useSupplyChain();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [kind, setKind] = useState("all");
  const [linked, setLinked] = useState("all");
  const [view, setView] = useState("all");
  const [salesDraft, setSalesDraft] = useState(() => ({ from: salesQuery.from, to: salesQuery.to, platform: salesQuery.platform || "" }));
  const [rangeError, setRangeError] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [pending, setPending] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
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
  const salesMeta = meta.sales || {};
  const categories = useMemo(() => [...new Set(items.map(item => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN")), [items]);
  const platforms = useMemo(() => {
    const values = new Set(salesMeta.availablePlatforms || []);
    if (salesDraft.platform) values.add(salesDraft.platform);
    return [...values].sort((left, right) => left.localeCompare(right, "zh-CN"));
  }, [salesDraft.platform, salesMeta.availablePlatforms]);
  const datePresets = useMemo(() => DATE_OPTIONS
    .filter(option => option.value !== "custom")
    .map(option => ({ id: option.value, label: option.label, range: productCatalogSalesRange(option.value) })), []);

  useEffect(() => {
    setSalesDraft({ from: salesQuery.from, to: salesQuery.to, platform: salesQuery.platform || "" });
  }, [salesQuery.from, salesQuery.platform, salesQuery.to]);

  const viewCounts = useMemo(() => ({
    all: items.length,
    attention: items.filter(item => catalogIssues(item).length).length,
    bundle: items.filter(item => item.productKind === "bundle").length,
    unsold: items.filter(item => !(Number(item.sales?.quantity) || Number(item.sales?.netSales))).length,
    unlinked: items.filter(item => !productLinks.has(item.id)).length
  }), [items, productLinks]);
  const filtered = useMemo(() => sortProductCatalogBySales(items
    .filter(item => matchesView(item, view, productLinks))
    .filter(item => includesQuery(item, deferredQuery))
    .filter(item => category === "all" || item.category === category)
    .filter(item => kind === "all" || item.productKind === kind)
    .filter(item => linked === "all" || (linked === "linked" ? productLinks.has(item.id) : !productLinks.has(item.id)))), [category, deferredQuery, items, kind, linked, productLinks, view]);
  useEffect(() => setPage(1), [category, kind, linked, query, salesQuery.from, salesQuery.platform, salesQuery.to, view]);
  const visible = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
  const totals = useMemo(() => ({
    products: items.length,
    inventoryUnits: new Set(items.flatMap(item => [...(item.skus || []).map(sku => sku.barcode).filter(Boolean), ...(item.components || []).map(component => component.inventoryUnitCode).filter(Boolean)])).size,
    coveredProducts: Number(salesMeta.coveredProducts) || 0,
    catalogIssueCount: items.filter(item => catalogIssues(item).length).length,
    unmatchedRowCount: Number(salesMeta.unmatchedRowCount) || 0
  }), [items, salesMeta.coveredProducts, salesMeta.unmatchedRowCount]);
  const coverageStale = Boolean(!salesLoading && salesMeta.latestDataDate && salesMeta.latestDataDate < salesQuery.to);
  const salesDraftChanged = salesDraft.from !== salesQuery.from || salesDraft.to !== salesQuery.to || salesDraft.platform !== (salesQuery.platform || "");

  function applySalesQuery(event) {
    event.preventDefault();
    try {
      const range = productCatalogSalesRange("custom", salesDraft);
      setRangeError("");
      setSalesQuery(current => ({ ...current, ...range, ...salesDraft, preset: "custom" }));
    } catch (queryError) {
      setRangeError(queryError.message || "日期范围无效。");
    }
  }

  function clearFilters() {
    setQuery("");
    setCategory("all");
    setKind("all");
    setLinked("all");
    setView("all");
  }

  async function handleFile(file) {
    if (!file) return;
    setParsing(true); setParseError(""); setPending(null);
    try {
      const rows = await rowsFromSpreadsheet(file);
      const parsed = parseProductCatalogRows(rows, { source: "kuaimai-file", fileName: file.name });
      if (!parsed.items.length) throw new Error("文件中没有找到可导入的商品，请检查主商家编码和商品名称表头。");
      setPending(parsed);
    } catch (parseFailure) {
      setParseError(parseFailure.message || "ERP 商品文件解析失败。");
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
    { key: "codes", header: "SKU / 库存单位", render: skuSummary },
    { key: "type", header: "类型 / 组成", render: typeSummary },
    { key: "classification", header: "分类 / 品牌", render: item => <span className={`catalog-summary-cell ${item.category && item.brand ? "" : "warning"}`}><strong>{item.category || "未分类"}</strong><small>{item.brand || "未设置品牌"}</small></span> },
    { key: "sales", header: "销量 / 净销售额", render: salesSummary },
    { key: "cost", header: "ERP 成本", render: item => <span className="catalog-summary-cell"><strong>{priceRange(item)}</strong><small>来源于 ERP 商品档案</small></span> },
    { key: "status", header: "状态 / 操作", render: item => {
      const issues = catalogIssues(item);
      const linkedProduct = productLinks.get(item.id);
      return <span className="product-catalog-status-cell">
        <span className={issues.length ? "warning" : "success"}>{issues.length ? `资料待完善 · ${issues.length} 项` : "档案完整"}</span>
        <small>{linkedProduct ? `已关联 ${linkedProduct.name}` : "未关联产品全周期"}</small>
        <Button className="compact" onClick={() => setSelectedProduct(item)} aria-label={`查看 ${item.name} 商品详情`}>查看详情</Button>
      </span>;
    } }
  ];

  if (loading && !items.length) return <div className="product-catalog-loading" aria-label="正在加载商品主数据"><span /><span /><span /></div>;
  const empty = !items.length
    ? <div className="empty-state compact-empty">还没有商品主数据。请导入 ERP 商品档案 XLSX / CSV；快麦开放平台 API 暂未打通。</div>
    : <div className="empty-state compact-empty"><span>没有符合当前条件的商品。</span><Button onClick={clearFilters}>清除筛选</Button></div>;

  return <div className="data-workspace product-catalog-workspace">
    <section className="product-catalog-metrics" aria-label="商品主数据概况">
      {[
        [PackageSearch, "商品", quantity(totals.products), "ERP 主商品"],
        [Barcode, "库存单位", quantity(totals.inventoryUnits), "69 码与内部唯一码"],
        [PackageCheck, "有销量商品", quantity(totals.coveredProducts), `共 ${quantity(totals.products)} 个商品`],
        [AlertTriangle, "商品档案待完善", quantity(totals.catalogIssueCount), "编码、分类、品牌或组合关系"]
      ].map(([Icon, label, value, detail]) => <div key={label}><Icon size={18} aria-hidden="true" /><span>{label}<strong>{value}</strong><small>{detail}</small></span></div>)}
      <small className="product-catalog-sources"><span>商品档案 {dateTime(meta.lastSuccessfulSyncAt)}</span><span>销售事实至 {salesMeta.latestDataDate || "—"}</span><span>当前查询 {salesQuery.from} 至 {salesQuery.to}</span></small>
    </section>

    {coverageStale || totals.unmatchedRowCount > 0 ? <section className="product-catalog-alert" role="alert">
      <CircleAlert size={20} aria-hidden="true" />
      <div>
        <strong>{totals.unmatchedRowCount > 0 ? `${quantity(totals.unmatchedRowCount)} 条销售汇总未匹配商品` : "销售事实覆盖不足"}</strong>
        <span>{coverageStale ? `销售事实仅更新至 ${salesMeta.latestDataDate}；` : ""}{totals.unmatchedRowCount > 0 ? "未匹配数据不会猜测归属，相关商品销量可能不完整。" : "当前商品档案仍可查看，请前往数据同步补齐经营事实。"}</span>
      </div>
      <a href="#data-sync">{totals.unmatchedRowCount > 0 ? "去处理未匹配数据" : "查看数据同步"}</a>
    </section> : null}

    <section className="product-catalog-toolbar" aria-label="商品搜索与操作">
      <div className="product-catalog-view-tabs" aria-label="商品任务视图">
        {VIEW_OPTIONS.map(option => <button key={option.value} type="button" aria-pressed={view === option.value} onClick={() => setView(option.value)}><span>{option.label}</span><small>{quantity(viewCounts[option.value])}</small></button>)}
      </div>
      <div className="product-catalog-toolbar-main">
        <label className="product-catalog-search"><Search size={16} aria-hidden="true" /><span className="sr-only">搜索商品</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索商品、69 码、内部唯一码或商家编码" /></label>
        <div className="product-catalog-filters">
          <HeaderFilter label="类型" value={kind} onChange={setKind} options={[{ value: "all", label: "全部类型" }, { value: "single", label: "单品" }, { value: "bundle", label: "组合商品" }]} />
          <HeaderFilter label="分类" value={category} onChange={setCategory} options={[{ value: "all", label: "全部分类" }, ...categories.map(value => ({ value, label: value }))]} />
          <HeaderFilter label="关联" value={linked} onChange={setLinked} options={[{ value: "all", label: "全部关联状态" }, { value: "linked", label: "已关联产品" }, { value: "unlinked", label: "未关联产品" }]} />
        </div>
      </div>
      <form className="product-catalog-sales-query" onSubmit={applySalesQuery}>
        <div><strong>经营数据范围</strong><small>修改条件不会自动读取，点击查询后更新销量。</small></div>
        <HeaderFilter label="平台" value={salesDraft.platform} onChange={platform => setSalesDraft(current => ({ ...current, platform }))} options={[{ value: "", label: "全部平台" }, ...platforms.map(value => ({ value, label: value }))]} />
        <DateRangePickerField value={{ from: salesDraft.from, to: salesDraft.to }} onConfirm={range => setSalesDraft(current => ({ ...current, ...range }))} presets={datePresets} maxDate={datePresets.find(preset => preset.id === "last30")?.range.to || salesQuery.to} maxDays={370} ariaLabel="选择商品经营日期范围" />
        <Button type="submit" variant="primary" disabled={salesLoading} disabledReason="经营数据正在读取"><Search size={16} />{salesLoading ? "查询中…" : salesDraftChanged ? "查询数据" : "重新查询"}</Button>
      </form>
      <div className="product-catalog-actions">
        <span className="product-catalog-query-state" role="status">{salesLoading ? <><RefreshCw size={14} className="is-spinning" />经营数据更新中</> : `已应用 ${salesQuery.from} 至 ${salesQuery.to} · ${salesQuery.platform || "全部平台"}`}</span>
        {canEdit ? <label className={`upload-field ${parsing || busy === "import" ? "is-busy" : ""}`}><Upload size={16} />{parsing ? "正在解析…" : busy === "import" ? "正在导入…" : "导入 ERP 商品文件"}<input type="file" accept=".xlsx,.csv" disabled={parsing || Boolean(busy)} onChange={event => { handleFile(event.target.files?.[0]); event.target.value = ""; }} /></label> : null}
        <span className="product-catalog-provider-state" title="快麦开放平台 API 暂未打通，请使用 ERP 商品文件导入"><CircleAlert size={14} />快麦 API 未打通</span>
      </div>
    </section>

    {rangeError ? <p className="supply-message error" role="alert">{rangeError}</p> : null}
    {error ? <div className="supply-message error product-catalog-error" role="alert"><span>{error}</span><Button disabled={loading} onClick={() => refresh().catch(() => {})}><RefreshCw size={15} className={loading ? "is-spinning" : ""} />{loading ? "正在重新加载…" : "重新加载"}</Button></div> : null}
    {parseError ? <p className="supply-message error" role="alert">{parseError}</p> : null}
    {notice ? <p className="supply-message success" role="status">{notice}</p> : null}
    {pending ? <section className="supply-import-preview product-catalog-preview"><FileSpreadsheet size={20} /><div><strong>{pending.fileName}</strong><span>识别 {pending.items.length} 个商品、{pending.counts.skus} 个 SKU · 异常 {pending.errors.length} 行</span>{pending.errors.slice(0, 3).map(item => <small key={`${item.rowNumber}-${item.field}`}>第 {item.rowNumber} 行：{item.message}</small>)}</div><div className="supply-import-actions"><Button onClick={() => setPending(null)}>取消</Button><Button variant="primary" disabled={!pending.items.length || Boolean(busy)} onClick={confirmImport}>确认导入</Button></div></section> : null}

    <div className="product-catalog-results-heading"><span>显示 {quantity(filtered.length)} 个商品</span><small>销量按已应用日期范围排序</small></div>
    <DataTable className="product-catalog-table" columns={columns} rows={visible} minWidth={1180} empty={empty} />
    {filtered.length ? <TablePagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} /> : null}

    <ProductCatalogDetailDialog
      product={selectedProduct}
      linkedProduct={selectedProduct ? productLinks.get(selectedProduct.id) : null}
      supplierCount={selectedProduct ? supplierCounts.get(selectedProduct.id) || 0 : 0}
      catalogUpdatedAt={dateTime(meta.lastSuccessfulSyncAt)}
      salesUpdatedAt={salesMeta.latestDataDate ? `${salesMeta.latestDataDate} · 入库 ${dateTime(salesMeta.lastSuccessfulSyncAt)}` : "尚未同步"}
      onClose={() => setSelectedProduct(null)}
    />
  </div>;
}
