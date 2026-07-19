import { useEffect, useMemo, useState } from "react";
import { Link2, Search, Trash2 } from "lucide-react";
import { useSupplyChain } from "../../state/SupplyChainProvider.jsx";
import { Button, IconAction } from "../../ui/Button.jsx";
import { DataTable, TableActions } from "../../ui/DataTable.jsx";
import { HeaderFilter } from "../../ui/HeaderFilter.jsx";
import { Modal } from "../../ui/Modal.jsx";
import { ProductCatalogSelect } from "../product-catalog/ProductCatalogSelect.jsx";
import { TablePagination } from "../../ui/TablePagination.jsx";

const EMPTY = { catalogProductId: "", catalogSkuId: "", productId: "", supplierId: "", category: "原料", materialName: "", unitCost: "", consumptionPerSale: "1", supplyRole: "primary", status: "active" };
const PAGE_SIZE = 50;

function rowMatches(row, query) {
  if (!query) return true;
  return [row.name, row.merchantCode, row.category, row.brand, ...(row.skus || []).flatMap(sku => [sku.barcode, sku.merchantSkuCode, sku.specification])].join(" ").toLowerCase().includes(query.toLowerCase());
}

function relationCatalogId(relation, lifecycleMap) {
  return relation.catalogProductId || lifecycleMap.get(relation.productId)?.catalogProductId || "";
}

function skuCodes(row) {
  const skus = row.skus || [];
  if (!skus.length) return <span className="table-secondary">暂无 SKU</span>;
  return <span className="supply-product-codes">{skus.slice(0, 3).map(sku => <span key={sku.id}><b className="catalog-code">{sku.barcode || "无条码"}</b><small>规格商家编码 {sku.merchantSkuCode || "—"}{sku.specification ? ` · ${sku.specification}` : ""}</small></span>)}{skus.length > 3 ? <small>另有 {skus.length - 3} 个 SKU</small> : null}</span>;
}

export function ProductSupplyWorkspace({ catalogItems = [], lifecycleProducts = [], canEdit }) {
  const { state, dispatch } = useSupplyChain();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [query, setQuery] = useState("");
  const [erpStatus, setErpStatus] = useState("all");
  const [supplyStatus, setSupplyStatus] = useState("all");
  const [page, setPage] = useState(1);
  const lifecycleMap = useMemo(() => new Map(lifecycleProducts.map(item => [item.id, item])), [lifecycleProducts]);
  const lifecycleByCatalog = useMemo(() => new Map(lifecycleProducts.filter(item => item.catalogProductId).map(item => [item.catalogProductId, item])), [lifecycleProducts]);
  const supplierMap = useMemo(() => new Map(state.suppliers.map(item => [item.id, item])), [state.suppliers]);
  const relationsByCatalog = useMemo(() => {
    const result = new Map();
    for (const relation of state.productSupplierLinks) {
      const catalogProductId = relationCatalogId(relation, lifecycleMap);
      if (!catalogProductId) continue;
      result.set(catalogProductId, [...(result.get(catalogProductId) || []), relation]);
    }
    return result;
  }, [lifecycleMap, state.productSupplierLinks]);
  const legacyRows = useMemo(() => lifecycleProducts
    .filter(product => !product.catalogProductId && state.productSupplierLinks.some(relation => relation.productId === product.id))
    .map(product => ({ id: `legacy:${product.id}`, productId: product.id, name: product.name, merchantCode: "未关联 ERP", category: "产品全周期旧记录", brand: "", active: true, presentInSource: true, skus: (product.skuCodes || []).map((sku, index) => ({ id: `${product.id}:${index}`, barcode: typeof sku === "object" ? sku.code : sku, merchantSkuCode: "" })), legacy: true })), [lifecycleProducts, state.productSupplierLinks]);
  const rows = useMemo(() => [...catalogItems, ...legacyRows].filter(row => {
    const relations = row.legacy ? state.productSupplierLinks.filter(relation => relation.productId === row.productId) : relationsByCatalog.get(row.id) || [];
    return rowMatches(row, query.trim())
      && (erpStatus === "all" || (erpStatus === "active" ? row.active && row.presentInSource !== false : !row.active || row.presentInSource === false))
      && (supplyStatus === "all" || (supplyStatus === "linked" ? relations.length > 0 : relations.length === 0));
  }), [catalogItems, erpStatus, legacyRows, query, relationsByCatalog, state.productSupplierLinks, supplyStatus]);
  useEffect(() => setPage(1), [erpStatus, query, supplyStatus]);
  const visibleRows = useMemo(() => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [page, rows]);
  const selectedCatalog = catalogItems.find(item => item.id === form.catalogProductId);

  function openLink(row = null) {
    setForm(row ? { ...EMPTY, catalogProductId: row.legacy ? "" : row.id, productId: row.productId || lifecycleByCatalog.get(row.id)?.id || "" } : EMPTY);
    setOpen(true);
  }

  function save() {
    if ((!form.catalogProductId && !form.productId) || !form.supplierId) return;
    const lifecycle = lifecycleByCatalog.get(form.catalogProductId);
    dispatch({
      type: "upsert",
      collection: "productSupplierLinks",
      record: {
        ...form,
        id: `product-supplier-${Date.now()}`,
        productId: form.productId || lifecycle?.id || form.catalogProductId,
        unitCost: Number(form.unitCost || 0),
        consumptionPerSale: Number(form.consumptionPerSale || 0)
      }
    });
    setOpen(false); setForm(EMPTY);
  }

  const columns = [
    { key: "product", header: "ERP 商品", render: row => <span className="catalog-product-cell"><strong>{row.name}</strong><small>主商家编码 <b className="catalog-code">{row.merchantCode || "—"}</b></small></span> },
    { key: "codes", header: "SKU / 69 码", render: skuCodes },
    { key: "classify", header: "分类 / 品牌", render: row => <span><strong>{row.category || "未分类"}</strong><small className="table-secondary">{row.brand || "未设置品牌"}</small></span> },
    { key: "suppliers", header: "供应商与成本", render: row => {
      const relations = row.legacy ? state.productSupplierLinks.filter(relation => relation.productId === row.productId) : relationsByCatalog.get(row.id) || [];
      if (!relations.length) return <span className="status-badge warning">未关联供应商</span>;
      return <span className="supply-relation-list">{relations.map(relation => <span key={relation.id}><span><strong>{supplierMap.get(relation.supplierId)?.name || "待映射供应商"}</strong><small>{relation.category || "供应"} · {relation.materialName || "未设置物料"} · ¥{Number(relation.unitCost || 0).toFixed(2)} × {Number(relation.consumptionPerSale || 0)}</small></span>{canEdit ? <IconAction className="danger" label="删除供应关系" onClick={() => dispatch({ type: "remove", collection: "productSupplierLinks", id: relation.id })}><Trash2 size={14} /></IconAction> : null}</span>)}</span>;
    } },
    { key: "lifecycle", header: "产品全周期", render: row => {
      const product = row.legacy ? lifecycleMap.get(row.productId) : lifecycleByCatalog.get(row.id);
      return <span><strong>{product?.name || "未关联产品"}</strong><small className="table-secondary">{product ? `第 ${product.stage || 1} 阶段` : "可在产品档案关联"}</small></span>;
    } },
    { key: "status", header: "ERP 状态", render: row => <span className={`status-badge ${row.presentInSource === false ? "warning" : row.active ? "success" : "neutral"}`}>{row.legacy ? "旧产品记录" : row.presentInSource === false ? "来源已缺失" : row.active ? "启用" : "停用"}</span> },
    { key: "actions", header: "操作", render: row => canEdit ? <TableActions><Button className="compact" onClick={() => openLink(row)}><Link2 size={15} />关联供应商</Button></TableActions> : "—" }
  ];

  const empty = !catalogItems.length && !legacyRows.length
    ? <div className="empty-state compact-empty">还没有 ERP 商品主数据，请先在数据中心同步快麦商品或导入商品档案。</div>
    : <div className="empty-state compact-empty">没有符合当前筛选条件的商品。</div>;

  return <section className="supply-flat-workspace product-supply-workspace">
    <div className="product-supply-toolbar">
      <label className="product-catalog-search"><Search size={16} aria-hidden="true" /><span className="sr-only">搜索产品供应链</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索商品、69 码或商家编码" /></label>
      <div className="product-catalog-filters"><HeaderFilter label="ERP 商品" value={erpStatus} onChange={setErpStatus} options={[{ value: "all", label: "全部 ERP 商品" }, { value: "active", label: "ERP 启用" }, { value: "inactive", label: "停用或缺失" }]} /><HeaderFilter label="供应关系" value={supplyStatus} onChange={setSupplyStatus} options={[{ value: "all", label: "全部供应状态" }, { value: "linked", label: "已关联供应商" }, { value: "unlinked", label: "未关联供应商" }]} /></div>
      {canEdit ? <Button variant="primary" onClick={() => openLink()}><Link2 size={16} />关联供应商</Button> : null}
    </div>
    <DataTable className="product-supply-table" columns={columns} rows={visibleRows} minWidth={1420} empty={empty} />
    {rows.length ? <TablePagination total={rows.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} /> : null}
    <Modal title="关联商品供应商" open={open} onClose={() => setOpen(false)} footer={<><Button onClick={() => setOpen(false)}>取消</Button><Button variant="primary" disabled={(!form.catalogProductId && !form.productId) || !form.supplierId} onClick={save}>保存</Button></>}>
      <div className="form-grid supply-form-grid">
        <label className="full">ERP 商品<ProductCatalogSelect items={catalogItems} value={form.catalogProductId} onChange={catalogProductId => setForm(current => ({ ...current, catalogProductId, productId: lifecycleByCatalog.get(catalogProductId)?.id || "", catalogSkuId: "" }))} /></label>
        <label>SKU / 规格商家编码<select value={form.catalogSkuId} disabled={!selectedCatalog} onChange={event => {
          const catalogSkuId = event.target.value;
          const sku = selectedCatalog?.skus?.find(item => item.id === catalogSkuId);
          setForm(current => ({ ...current, catalogSkuId, unitCost: current.unitCost || (sku?.purchasePrice ?? "") }));
        }}><option value="">全部 SKU / 款级关系</option>{(selectedCatalog?.skus || []).map(sku => <option key={sku.id} value={sku.id}>{sku.merchantSkuCode || "无规格商家编码"} · {sku.barcode || "无条码"}</option>)}</select></label>
        <label>供应商<select value={form.supplierId} onChange={event => setForm(current => ({ ...current, supplierId: event.target.value }))}><option value="">请选择</option>{state.suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
        <label>供应类别<select value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value }))}><option>原料</option><option>包材</option><option>里料</option><option>耗材</option><option>加工</option><option>成品</option></select></label>
        <label>供货角色<select value={form.supplyRole} onChange={event => setForm(current => ({ ...current, supplyRole: event.target.value }))}><option value="primary">主供</option><option value="backup">备选</option></select></label>
        <label className="full">物料名称<input value={form.materialName} onChange={event => setForm(current => ({ ...current, materialName: event.target.value }))} /></label>
        <label>单位成本<input type="number" min="0" step="0.01" value={form.unitCost} onChange={event => setForm(current => ({ ...current, unitCost: event.target.value }))} /></label>
        <label>每销售一件用量<input type="number" min="0" step="0.001" value={form.consumptionPerSale} onChange={event => setForm(current => ({ ...current, consumptionPerSale: event.target.value }))} /></label>
      </div>
    </Modal>
  </section>;
}
