import { useMemo, useState } from "react";
import { FileSpreadsheet, Link2, RefreshCw, Search, Unlink } from "lucide-react";
import { Button } from "../../ui/Button.jsx";
import { Modal } from "../../ui/Modal.jsx";
import { ProductCatalogSelect } from "../product-catalog/ProductCatalogSelect.jsx";

function quantity(value) {
  return Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function money(value) {
  return `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function productLabel(product) {
  return `${product.name || "未命名商品"} · ${product.merchantCode || "无主商家编码"}`;
}

export function ProductCatalogSalesMappingDialog({
  open,
  items = [],
  mappings = [],
  products = [],
  range,
  canEdit,
  busy = "",
  onRequestCatalogCollection,
  onRequestCatalogImport,
  onSave,
  onRevoke,
  onClose
}) {
  const [query, setQuery] = useState("");
  const [targets, setTargets] = useState({});
  const [actionError, setActionError] = useState("");
  const productById = useMemo(() => new Map(products.map(product => [product.id, product])), [products]);
  const mappingByCode = useMemo(() => new Map(mappings.map(mapping => [mapping.code, mapping])), [mappings]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(item => [
      item.code,
      item.title,
      ...(item.platforms || []).map(platform => platform.platform)
    ].join(" ").toLowerCase().includes(needle));
  }, [items, query]);
  const activeMappings = useMemo(() => mappings.filter(mapping => mapping.active && productById.has(mapping.productId)), [mappings, productById]);

  async function save(item) {
    const productId = targets[item.code] || "";
    if (!productId) return;
    setActionError("");
    try {
      await onSave({
        code: item.code,
        productId,
        expectedVersion: Number(mappingByCode.get(item.code)?.version) || 0
      });
      setTargets(current => ({ ...current, [item.code]: "" }));
    } catch (error) {
      setActionError(error.message || "销售编码归属确认失败，请重试。");
    }
  }

  async function revoke(mapping) {
    setActionError("");
    try {
      await onRevoke({ code: mapping.code, expectedVersion: mapping.version });
    } catch (error) {
      setActionError(error.message || "销售编码关联撤销失败，请重试。");
    }
  }

  return (
    <Modal
      open={open}
      title="ERP 商品数据可能不完整"
      size="large"
      className="product-catalog-mapping-dialog"
      onClose={onClose}
      footer={<Button onClick={onClose}>关闭</Button>}
    >
      <section className="product-catalog-source-first">
        <RefreshCw size={20} aria-hidden="true" />
        <div>
          <strong>先更新 ERP 商品档案</strong>
          <span>通过 Chrome 插件重新获取普通商品、套件和组合装后，系统会自动重新核对当前日期范围内的销售归属。</span>
        </div>
        {canEdit ? <div className="product-catalog-source-actions">
          <Button variant="primary" disabled={Boolean(busy)} disabledReason="正在处理商品数据" onClick={onRequestCatalogCollection}><RefreshCw size={15} />通过 Chrome 插件重新获取</Button>
          <Button disabled={Boolean(busy)} disabledReason="正在处理商品数据" onClick={onRequestCatalogImport}><FileSpreadsheet size={15} />导入 ERP 商品文件</Button>
        </div> : null}
      </section>
      <div className="product-catalog-mapping-intro">
        <div>
          <strong>{quantity(items.length)} 个销售编码没有对应商品</strong>
          <span>{range?.from || "—"} 至 {range?.to || "—"} · 已有同码会自动归属，这里只显示商品档案未收录或编码冲突的数据。</span>
        </div>
        <label className="product-catalog-mapping-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">搜索未归属销售编码</span>
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索编码、标题或平台" />
        </label>
      </div>

      {actionError ? <p className="supply-message error" role="alert">{actionError}</p> : null}

      {filtered.length ? <div className="product-catalog-mapping-list">
        {filtered.map(item => {
          const actionBusy = busy === `sales-mapping:${item.code}`;
          return <article key={item.code}>
            <div className="product-catalog-mapping-identity">
              <strong>{item.title || "未提供销售标题"}</strong>
              <span className="catalog-code">{item.code}</span>
              {item.reason === "catalog_code_conflict" ? <small className="warning">目录中有多个商品使用此编码，请先处理编码冲突。</small> : null}
              {item.reason === "catalog_component_only" ? <small className="warning">这个 69 码只出现在组合品的子 SKU 中，没有自己的单品档案；请先补齐商品档案，不会自动归到组合品。</small> : null}
              {!item.reason ? <small>商品档案中未找到这个编码。请先导入最新商品档案；仅在确认它是已有商品的历史别名时人工关联。</small> : null}
            </div>
            <dl>
              <div><dt>平台</dt><dd>{(item.platforms || []).map(platform => platform.platform).join("、") || "—"}</dd></div>
              <div><dt>销售数量</dt><dd>{quantity(item.quantity)}</dd></div>
              <div><dt>净销售额</dt><dd>{money(item.netSales)}</dd></div>
              <div><dt>最新日期</dt><dd>{item.latestDataDate || "—"}</dd></div>
            </dl>
            <details className="product-catalog-mapping-manual">
              <summary>确认是历史销售别名后再手工关联</summary>
              <div className="product-catalog-mapping-action">
                <ProductCatalogSelect
                  items={products}
                  value={targets[item.code] || ""}
                  placeholder="确认属于哪个已有商品"
                  disabled={!canEdit || actionBusy || item.reason === "catalog_code_conflict"}
                  onChange={productId => setTargets(current => ({ ...current, [item.code]: productId }))}
                />
                <Button
                  variant="primary"
                  disabled={!canEdit || !targets[item.code] || actionBusy || item.reason === "catalog_code_conflict"}
                  disabledReason={!canEdit ? "当前账号只有查看权限" : item.reason === "catalog_code_conflict" ? "请先处理目录编码冲突" : "请先选择商品"}
                  onClick={() => save(item)}
                >
                  <Link2 size={15} />{actionBusy ? "确认中…" : "确认关联"}
                </Button>
              </div>
            </details>
          </article>;
        })}
      </div> : <div className="empty-state compact-empty">{items.length ? "没有符合搜索条件的销售编码。" : "当前日期范围内没有未归属销售编码。"}</div>}

      {activeMappings.length ? <section className="product-catalog-active-mappings">
        <header><strong>已确认的销售别名</strong><span>撤销后，相关编码会重新进入未归属列表。</span></header>
        {activeMappings.map(mapping => {
          const product = productById.get(mapping.productId);
          const actionBusy = busy === `sales-mapping:${mapping.code}`;
          return <div key={mapping.code}>
            <span className="catalog-code">{mapping.code}</span>
            <strong>{product ? productLabel(product) : "目标商品不存在"}</strong>
            {canEdit ? <Button className="compact" disabled={actionBusy} onClick={() => revoke(mapping)}><Unlink size={14} />{actionBusy ? "撤销中…" : "撤销"}</Button> : null}
          </div>;
        })}
      </section> : null}
    </Modal>
  );
}
