import { useEffect, useMemo, useState } from "react";
import { Barcode, Boxes, FileSpreadsheet, Link2, PackageSearch, RefreshCw, Search, Upload } from "lucide-react";
import { parseProductCatalogRows } from "../../domain/productCatalog.js";
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
    ...(item.skus || []).flatMap(sku => [sku.barcode, sku.merchantSkuCode, sku.specification, sku.specificationAlias])
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
  return <span className="catalog-code-list">{skus.slice(0, 3).map(sku => <span key={sku.id}><b className="catalog-code">{sku.barcode || "无条码"}</b><small>{sku.barcodeType === "sales_barcode" ? "标准 69 码" : sku.barcodeType === "missing" ? "缺少条码" : "非标准条码"} · 规格商家编码 {sku.merchantSkuCode || "—"}</small></span>)}{skus.length > 3 ? <em>另有 {skus.length - 3} 个 SKU</em> : null}</span>;
}

function priceRange(item) {
  const costs = (item.skus || []).map(sku => sku.purchasePrice).filter(value => Number.isFinite(Number(value)));
  if (!costs.length) return "—";
  const min = Math.min(...costs);
  const max = Math.max(...costs);
  return min === max ? `¥${min.toFixed(2)}` : `¥${min.toFixed(2)}–${max.toFixed(2)}`;
}

export function ProductCatalogWorkspace({ canEdit }) {
  const { items, meta, loading, busy, error, notice, importRows, syncKuaimai } = useProductCatalog();
  const { state: productState } = useProductFlow();
  const { state: supplyState } = useSupplyChain();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [linked, setLinked] = useState("all");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [pending, setPending] = useState(null);
  const [page, setPage] = useState(1);

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
  const filtered = useMemo(() => items
    .filter(item => includesQuery(item, query.trim()))
    .filter(item => status === "all" || (status === "active" ? item.active && item.presentInSource !== false : status === "inactive" ? !item.active : item.presentInSource === false))
    .filter(item => category === "all" || item.category === category)
    .filter(item => linked === "all" || (linked === "linked" ? productLinks.has(item.id) : !productLinks.has(item.id))), [category, items, linked, productLinks, query, status]);
  useEffect(() => setPage(1), [category, linked, query, status]);
  const visible = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
  const totals = useMemo(() => ({
    products: items.length,
    skus: items.reduce((sum, item) => sum + (item.skus || []).length, 0),
    barcodes: items.flatMap(item => item.skus || []).filter(sku => sku.barcodeType === "sales_barcode").length,
    exceptions: items.flatMap(item => item.skus || []).filter(sku => sku.barcodeType !== "sales_barcode").length,
    linked: productLinks.size
  }), [items, productLinks.size]);

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
    { key: "codes", header: "SKU / 69 码", render: codeList },
    { key: "classification", header: "分类 / 品牌", render: item => <span><strong>{item.category || "未分类"}</strong><small className="table-secondary">{item.brand || "未设置品牌"}</small></span> },
    { key: "cost", header: "ERP 成本", render: item => <span><strong>{priceRange(item)}</strong><small className="table-secondary">{(item.skus || []).length} 个 SKU</small></span> },
    { key: "status", header: "ERP 状态", render: item => <span className={`status-badge ${item.presentInSource === false ? "warning" : item.active ? "success" : "neutral"}`}>{item.presentInSource === false ? "来源已缺失" : item.active ? "启用" : "停用"}</span> },
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
        [PackageSearch, "商品", totals.products],
        [Boxes, "SKU", totals.skus],
        [Barcode, "标准 69 码", totals.barcodes],
        [FileSpreadsheet, "条码异常", totals.exceptions],
        [Link2, "已关联产品", totals.linked]
      ].map(([Icon, label, value]) => <div key={label}><Icon size={18} aria-hidden="true" /><span>{label}<strong>{Number(value || 0).toLocaleString("zh-CN")}</strong></span></div>)}
      <small>最近同步：{dateTime(meta.lastSuccessfulSyncAt)}</small>
    </section>

    <section className="product-catalog-toolbar" aria-label="商品搜索与操作">
      <label className="product-catalog-search"><Search size={16} aria-hidden="true" /><span className="sr-only">搜索商品</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索商品、69 码或商家编码" /></label>
      <div className="product-catalog-filters">
        <HeaderFilter label="状态" value={status} onChange={setStatus} options={[{ value: "all", label: "全部状态" }, { value: "active", label: "启用" }, { value: "inactive", label: "停用" }, { value: "missing", label: "来源已缺失" }]} />
        <HeaderFilter label="分类" value={category} onChange={setCategory} options={[{ value: "all", label: "全部分类" }, ...categories.map(value => ({ value, label: value }))]} />
        <HeaderFilter label="关联" value={linked} onChange={setLinked} options={[{ value: "all", label: "全部关联状态" }, { value: "linked", label: "已关联产品" }, { value: "unlinked", label: "未关联产品" }]} />
      </div>
      <div className="product-catalog-actions">
        {canEdit ? <label className={`upload-field ${parsing || busy === "import" ? "is-busy" : ""}`}><Upload size={16} />{parsing ? "正在解析…" : busy === "import" ? "正在导入…" : "导入 ERP 商品文件"}<input type="file" accept=".xlsx,.csv" disabled={parsing || Boolean(busy)} onChange={event => { handleFile(event.target.files?.[0]); event.target.value = ""; }} /></label> : null}
        <Button variant="primary" disabled={!canEdit || Boolean(busy)} disabledReason="仅总经办和运营部可同步商品主数据" onClick={() => syncKuaimai().catch(() => {})}><RefreshCw size={16} className={busy === "kuaimai" ? "is-spinning" : ""} />{busy === "kuaimai" ? "正在同步…" : "同步快麦商品"}</Button>
      </div>
    </section>

    {error ? <p className="supply-message error" role="alert">{error}</p> : null}
    {parseError ? <p className="supply-message error" role="alert">{parseError}</p> : null}
    {notice ? <p className="supply-message success" role="status">{notice}</p> : null}
    {pending ? <section className="supply-import-preview product-catalog-preview"><FileSpreadsheet size={20} /><div><strong>{pending.fileName}</strong><span>识别 {pending.items.length} 个商品、{pending.counts.skus} 个 SKU · 异常 {pending.errors.length} 行</span>{pending.errors.slice(0, 3).map(item => <small key={`${item.rowNumber}-${item.field}`}>第 {item.rowNumber} 行：{item.message}</small>)}</div><div className="supply-import-actions"><Button onClick={() => setPending(null)}>取消</Button><Button variant="primary" disabled={!pending.items.length || Boolean(busy)} onClick={confirmImport}>确认导入</Button></div></section> : null}

    <DataTable className="product-catalog-table" columns={columns} rows={visible} minWidth={1180} empty={empty} />
    {filtered.length ? <TablePagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} /> : null}
  </div>;
}
