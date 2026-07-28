import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowUpDown, CircleAlert, FileSpreadsheet, PackageCheck, PackageSearch, RefreshCw, Search, Upload } from "lucide-react";
import { parseProductCatalogRows } from "../../domain/productCatalog.js";
import { catalogDisplayCategory, catalogProductCost } from "../../domain/productCatalogGraph.js";
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
import { ProductCatalogSalesMappingDialog } from "./ProductCatalogSalesMappingDialog.jsx";

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
  { value: "attention", label: "资料待补充" },
  { value: "bundle", label: "组合品" },
  { value: "unsold", label: "未售商品" },
  { value: "unlinked", label: "未关联产品" }
];

const SALES_SORT_OPTIONS = [
  { value: "netSales_desc", label: "销售额 高→低" },
  { value: "netSales_asc", label: "销售额 低→高" },
  { value: "quantity_desc", label: "销量 高→低" },
  { value: "quantity_asc", label: "销量 低→高" }
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

function catalogIssues(item) {
  const issues = [];
  const skus = item.skus || [];
  const components = item.components || [];
  if (item.productKind === "bundle") {
    if (!components.length) issues.push("缺少组成关系");
    else if (components.some(component => !String(component.inventoryUnitCode || "").trim())) issues.push("缺少子 SKU 编码");
  } else if (!skus.length) {
    issues.push("缺少规格");
  } else if (skus.some(sku => !String(sku.barcode || sku.merchantSkuCode || "").trim())) {
    issues.push("缺少规格编码");
  }
  if (item.productKind !== "bundle" && !String(item.category || "").trim()) issues.push("未分类");
  if (!String(item.brand || "").trim()) issues.push("未设置品牌");
  return issues;
}

function structureSummary(item) {
  const skus = item.skus || [];
  const components = item.components || [];
  if (item.productKind === "bundle") {
    const first = components[0];
    if (!components.length) return <span className="catalog-summary-cell warning"><strong>组成待补齐</strong><small>尚未读取到子 SKU</small></span>;
    return <span className="catalog-summary-cell">
      <strong className="catalog-code">{first?.inventoryUnitCode || "缺少子 SKU 编码"}{first?.ratio ? ` × ${quantity(first.ratio)}` : ""}</strong>
      <small>{quantity(components.length)} 个子 SKU{components.length > 1 ? " · 详情查看全部" : ""}</small>
    </span>;
  }
  const primary = skus.find(sku => sku.barcode)?.barcode || "";
  if (!skus.length) return <span className="catalog-summary-cell warning"><strong>暂无规格</strong><small>需要 ERP 商品档案补齐</small></span>;
  return <span className="catalog-summary-cell"><strong className="catalog-code">{primary || skus[0].merchantSkuCode || "缺少规格编码"}</strong><small>{quantity(skus.length)} 个规格{skus.length > 1 ? " · 详情查看全部" : ` · 规格商家编码 ${skus[0].merchantSkuCode || "—"}`}</small></span>;
}

function typeSummary(item) {
  const components = item.components || [];
  if (item.productKind === "bundle") return <span className={`catalog-summary-cell ${components.length ? "" : "warning"}`}><strong>组合品</strong><small>{components.length ? `${quantity(components.length)} 个子 SKU` : "SKU 组成待补齐"}</small></span>;
  return <span className="catalog-summary-cell"><strong>单品</strong><small>独立销售与库存</small></span>;
}

function costSummary(item, items) {
  const result = catalogProductCost({ items, itemId: item.id });
  const value = result.kind === "bundle"
    ? result.complete ? money(result.total) : "—"
    : result.complete && result.min === result.max
      ? money(result.min)
      : result.complete ? `${money(result.min)}–${money(result.max)}` : "—";
  if (value !== "—") return <span className="catalog-summary-cell"><strong>{value}</strong><small>{item.productKind === "bundle" ? "子 SKU 成本 × 数量汇总" : "来源于 ERP 商品档案"}</small></span>;
  return <span className="catalog-summary-cell warning"><strong>成本待补齐</strong><small>{item.productKind === "bundle" ? "组件成本不完整或无查看权限" : "规格成本未提供或无查看权限"}</small></span>;
}

function salesSummary(item) {
  const sales = item.sales || { quantity: 0, netSales: 0 };
  return <span className={`product-catalog-sales-cell ${sales.quantity || sales.netSales ? "has-sales" : "no-sales"}`}>
    <strong>{quantity(sales.quantity)}</strong>
    <small>{sales.quantity || sales.netSales ? money(sales.netSales) : "该范围暂无销售"}</small>
  </span>;
}

function inventorySummary(item) {
  const inventory = item.inventory || {};
  if (inventory.status === "available") {
    return <span className="product-catalog-inventory-cell has-stock">
      <strong>{quantity(inventory.quantity)}</strong>
      <small>最新快照 {inventory.snapshotDate || "待同步"}</small>
    </span>;
  }
  if (inventory.status === "zero") {
    return <span className="product-catalog-inventory-cell no-stock">
      <strong>0</strong>
      <small>已匹配，当前无库存</small>
    </span>;
  }
  const reason = inventory.status === "unmatched"
    ? "库存待匹配"
    : inventory.status === "incomplete"
      ? "组件或 SKU 关系不完整"
      : "库存暂不可用";
  return <span className="product-catalog-inventory-cell warning">
    <strong>—</strong>
    <small>{reason}</small>
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
  const {
    items,
    meta,
    loading,
    salesLoading,
    salesQuery,
    setSalesQuery,
    busy,
    error,
    notice,
    collectionProgress,
    refresh,
    importRows,
    collectKuaimaiProducts,
    saveSalesMapping,
    revokeSalesMapping
  } = useProductCatalog();
  const { state: productState } = useProductFlow();
  const { state: supplyState } = useSupplyChain();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [kind, setKind] = useState("all");
  const [linked, setLinked] = useState("all");
  const [view, setView] = useState("all");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [pending, setPending] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [salesSort, setSalesSort] = useState("netSales_desc");
  const [page, setPage] = useState(1);
  const fileInputRef = useRef(null);
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
  const inventoryMeta = meta.inventory || {};
  const categories = useMemo(() => [...new Set(items.map(catalogDisplayCategory).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN")), [items]);
  const platforms = useMemo(() => {
    const values = new Set(salesMeta.availablePlatforms || []);
    if (salesQuery.platform) values.add(salesQuery.platform);
    return [...values].sort((left, right) => left.localeCompare(right, "zh-CN"));
  }, [salesQuery.platform, salesMeta.availablePlatforms]);
  const datePresets = useMemo(() => DATE_OPTIONS
    .filter(option => option.value !== "custom")
    .map(option => ({ id: option.value, label: option.label, range: productCatalogSalesRange(option.value) })), []);

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
    .filter(item => category === "all" || catalogDisplayCategory(item) === category)
    .filter(item => kind === "all" || item.productKind === kind)
    .filter(item => linked === "all" || (linked === "linked" ? productLinks.has(item.id) : !productLinks.has(item.id))), salesSort), [category, deferredQuery, items, kind, linked, productLinks, salesSort, view]);
  useEffect(() => setPage(1), [category, kind, linked, query, salesQuery.from, salesQuery.platform, salesQuery.to, salesSort, view]);
  const visible = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
  const totals = useMemo(() => ({
    products: items.length,
    coveredProducts: Number(salesMeta.coveredProducts) || 0,
    catalogIssueCount: items.filter(item => catalogIssues(item).length).length,
    unmatchedCodeCount: Number(salesMeta.unmatchedCodeCount) || 0,
    unmatchedRowCount: Number(salesMeta.unmatchedRowCount) || 0,
    inventoryUnmatchedProducts: Number(inventoryMeta.unmatchedProducts) || 0
  }), [inventoryMeta.unmatchedProducts, items, salesMeta.coveredProducts, salesMeta.unmatchedCodeCount, salesMeta.unmatchedRowCount]);
  const coverageStale = Boolean(!salesLoading && salesMeta.latestDataDate && salesMeta.latestDataDate < salesQuery.to);

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
    { key: "codes", header: "SKU / 组成", render: structureSummary },
    {
      key: "type",
      header: <div className="product-catalog-column-header"><span>类型 / 组成</span><HeaderFilter compact label="类型" value={kind} onChange={setKind} options={[{ value: "all", label: "全部类型" }, { value: "single", label: "单品" }, { value: "bundle", label: "组合品" }]} /></div>,
      render: typeSummary
    },
    {
      key: "classification",
      header: <div className="product-catalog-column-header"><span>分类 / 品牌</span><HeaderFilter compact label="分类" value={category} onChange={setCategory} options={[{ value: "all", label: "全部分类" }, ...categories.map(value => ({ value, label: value }))]} /></div>,
      render: item => {
        const displayCategory = catalogDisplayCategory(item);
        return <span className={`catalog-summary-cell ${(displayCategory !== "未分类") && item.brand ? "" : "warning"}`}><strong>{displayCategory}</strong><small>{item.brand || "未设置品牌"}</small></span>;
      }
    },
    {
      key: "sales",
      header: <div className="product-catalog-column-header align-end"><span>销量 / 净销售额</span><HeaderFilter compact label="销量与销售额" action="排序" icon={ArrowUpDown} value={salesSort} onChange={setSalesSort} options={SALES_SORT_OPTIONS} /></div>,
      ariaSort: salesSort.endsWith("_asc") ? "ascending" : "descending",
      render: salesSummary
    },
    { key: "cost", header: "成本", render: item => costSummary(item, items) },
    { key: "inventory", header: "库存", render: inventorySummary },
    { key: "status", header: <div className="product-catalog-column-header"><span>状态 / 操作</span><HeaderFilter compact label="关联" value={linked} onChange={setLinked} options={[{ value: "all", label: "全部关联状态" }, { value: "linked", label: "已关联产品" }, { value: "unlinked", label: "未关联产品" }]} /></div>, render: item => {
      const issues = catalogIssues(item);
      const linkedProduct = productLinks.get(item.id);
      return <span className="product-catalog-status-cell">
        <span className={issues.length ? "warning" : "success"} title={issues.join("、")}>{issues.length ? `待补充：${issues.join("、")}` : "资料完整"}</span>
        <small>{linkedProduct ? `已关联 ${linkedProduct.name}` : "未关联产品全周期"}</small>
        <Button className="compact" onClick={() => setSelectedProduct(item)} aria-label={`查看 ${item.name} 商品详情`}>查看详情</Button>
      </span>;
    } }
  ];

  if (loading && !items.length) return <div className="product-catalog-loading" aria-label="正在加载商品主数据"><span /><span /><span /></div>;
  const empty = !items.length
    ? <div className="empty-state compact-empty">还没有商品主数据。请通过 Chrome 插件获取快麦 ERP 商品，或导入 ERP 商品档案 XLSX / CSV。</div>
    : <div className="empty-state compact-empty"><span>没有符合当前条件的商品。</span><Button onClick={clearFilters}>清除筛选</Button></div>;

  return <div className="data-workspace product-catalog-workspace">
    <section className="product-catalog-metrics" aria-label="商品主数据概况">
      <div><PackageSearch size={18} aria-hidden="true" /><span>商品<strong>{quantity(totals.products)}</strong><small>ERP 主商品</small></span></div>
      <div><PackageCheck size={18} aria-hidden="true" /><span>有销量商品<strong>{quantity(totals.coveredProducts)}</strong><small>当前经营范围</small></span></div>
      <button type="button" className="product-catalog-metric-action" onClick={() => setMappingOpen(true)}>
        <AlertTriangle size={18} aria-hidden="true" />
        <span>ERP 商品数据可能不完整<strong>{quantity(totals.unmatchedCodeCount)}</strong><small>{quantity(totals.unmatchedRowCount)} 条编码 × 平台汇总</small></span>
      </button>
      <div><RefreshCw size={18} aria-hidden="true" /><span>最近同步状态<strong>{salesMeta.latestDataDate || "待同步"}</strong><small>商品档案 {dateTime(meta.lastSuccessfulSyncAt)}</small></span></div>
      <div><PackageCheck size={18} aria-hidden="true" /><span>库存待匹配商品<strong>{quantity(totals.inventoryUnmatchedProducts)}</strong><small>{inventoryMeta.snapshotDate ? `最新快照 ${inventoryMeta.snapshotDate}` : "库存暂不可用"}</small></span></div>
    </section>

    {coverageStale || totals.unmatchedCodeCount > 0 ? <section className="product-catalog-alert" role="alert">
      <CircleAlert size={20} aria-hidden="true" />
      <div>
        <strong>{totals.unmatchedCodeCount > 0 ? "ERP 商品数据可能不完整" : "销售事实覆盖不足"}</strong>
        <span>{coverageStale ? `销售事实仅更新至 ${salesMeta.latestDataDate}；` : ""}{totals.unmatchedCodeCount > 0 ? `${quantity(totals.unmatchedCodeCount)} 个销售编码没有对应商品。请先获取完整的 ERP 商品、SKU 和组合关系，导入后自动重新核对当前销售归属。` : "当前商品档案仍可查看，请补齐经营事实。"}</span>
      </div>
      <Button onClick={() => {
        if (totals.unmatchedCodeCount > 0 && canEdit) collectKuaimaiProducts().catch(() => {});
        else if (totals.unmatchedCodeCount > 0) setMappingOpen(true);
        else window.location.hash = "#data-sync";
      }} disabled={busy === "chrome-products"}>{totals.unmatchedCodeCount > 0 ? canEdit ? collectionProgress?.label || "从 Chrome 重新获取商品" : "查看异常明细" : "查看数据同步"}</Button>
    </section> : null}

    <section className="product-catalog-toolbar" aria-label="商品搜索与操作">
      <div className="product-catalog-view-tabs" aria-label="商品任务视图">
        {VIEW_OPTIONS.map(option => <button key={option.value} type="button" aria-pressed={view === option.value} onClick={() => setView(option.value)}><span>{option.label}</span><small>{quantity(viewCounts[option.value])}</small></button>)}
      </div>
      <div className="product-catalog-toolbar-main">
        <label className="product-catalog-search"><Search size={16} aria-hidden="true" /><span className="sr-only">搜索商品</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索商品、69 码、内部唯一码或商家编码" /></label>
      </div>
      <div className="product-catalog-actions">
        {canEdit ? <Button variant="primary" disabled={Boolean(busy)} disabledReason="正在处理商品数据" onClick={() => collectKuaimaiProducts().catch(() => {})}><RefreshCw size={16} className={busy === "chrome-products" ? "is-spinning" : ""} />{busy === "chrome-products" ? collectionProgress?.label || "Chrome 采集中…" : "从 Chrome 获取 ERP 商品"}</Button> : null}
        {canEdit ? <label className={`upload-field ${parsing || busy === "import" ? "is-busy" : ""}`}><Upload size={16} />{parsing ? "正在解析…" : busy === "import" ? "正在导入…" : "导入 ERP 商品文件"}<input ref={fileInputRef} type="file" accept=".xlsx,.csv" disabled={parsing || Boolean(busy)} onChange={event => { handleFile(event.target.files?.[0]); event.target.value = ""; }} /></label> : null}
        <span className="product-catalog-provider-state" title="Chrome 插件会依次采集普通商品、套件和组合装"><PackageCheck size={14} />Chrome 插件 · 普通商品、套件和组合装</span>
      </div>
    </section>

    {error ? <div className="supply-message error product-catalog-error" role="alert"><span>{error}</span><Button disabled={loading} onClick={() => refresh().catch(() => {})}><RefreshCw size={15} className={loading ? "is-spinning" : ""} />{loading ? "正在重新加载…" : "重新加载"}</Button></div> : null}
    {parseError ? <p className="supply-message error" role="alert">{parseError}</p> : null}
    {notice ? <p className="supply-message success" role="status">{notice}</p> : null}
    {pending ? <section className="supply-import-preview product-catalog-preview"><FileSpreadsheet size={20} /><div><strong>{pending.fileName}</strong><span>识别 {pending.items.length} 个商品、{pending.counts.skus} 个 SKU · 异常 {pending.errors.length} 行</span>{pending.errors.slice(0, 3).map(item => <small key={`${item.rowNumber}-${item.field}`}>第 {item.rowNumber} 行：{item.message}</small>)}</div><div className="supply-import-actions"><Button onClick={() => setPending(null)}>取消</Button><Button variant="primary" disabled={!pending.items.length || Boolean(busy)} onClick={confirmImport}>确认导入</Button></div></section> : null}

    <div className="product-catalog-results-heading">
      <span>显示 {quantity(filtered.length)} 个商品<small>{SALES_SORT_OPTIONS.find(option => option.value === salesSort)?.label}</small></span>
      <div className="product-catalog-results-controls">
        <span className="product-catalog-query-state" role="status">{salesLoading ? <><RefreshCw size={14} className="is-spinning" />经营数据更新中</> : `销量与销售额：${salesQuery.platform || "全部平台"}`}</span>
        <HeaderFilter label="平台" value={salesQuery.platform} onChange={platform => setSalesQuery(current => ({ ...current, platform }))} options={[{ value: "", label: "全部平台" }, ...platforms.map(value => ({ value, label: value }))]} />
        <DateRangePickerField value={{ from: salesQuery.from, to: salesQuery.to }} onConfirm={range => setSalesQuery(current => ({ ...current, ...range, preset: "custom" }))} presets={datePresets} maxDate={datePresets.find(preset => preset.id === "last30")?.range.to || salesQuery.to} maxDays={370} ariaLabel="选择商品经营日期范围" />
      </div>
    </div>
    <DataTable className="product-catalog-table" columns={columns} rows={visible} minWidth={1320} empty={empty} />
    {filtered.length ? <TablePagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} /> : null}

    <ProductCatalogDetailDialog
      product={selectedProduct}
      catalogItems={items}
      linkedProduct={selectedProduct ? productLinks.get(selectedProduct.id) : null}
      supplierCount={selectedProduct ? supplierCounts.get(selectedProduct.id) || 0 : 0}
      catalogUpdatedAt={dateTime(meta.lastSuccessfulSyncAt)}
      salesUpdatedAt={salesMeta.latestDataDate ? `${salesMeta.latestDataDate} · 入库 ${dateTime(salesMeta.lastSuccessfulSyncAt)}` : "尚未同步"}
      onClose={() => setSelectedProduct(null)}
    />
    <ProductCatalogSalesMappingDialog
      open={mappingOpen}
      items={salesMeta.unmatchedItems || []}
      mappings={salesMeta.mappings || []}
      products={items.filter(item => item.active !== false && item.presentInSource !== false)}
      range={salesQuery}
      canEdit={canEdit}
      busy={busy}
      onRequestCatalogImport={() => {
        setMappingOpen(false);
        fileInputRef.current?.click();
      }}
      onRequestCatalogCollection={() => {
        setMappingOpen(false);
        collectKuaimaiProducts().catch(() => {});
      }}
      onSave={saveSalesMapping}
      onRevoke={revokeSalesMapping}
      onClose={() => setMappingOpen(false)}
    />
  </div>;
}
