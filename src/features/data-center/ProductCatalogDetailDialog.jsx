import { Button } from "../../ui/Button.jsx";
import { Modal } from "../../ui/Modal.jsx";

function quantity(value) {
  return Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function money(value) {
  return `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function skuCost(value) {
  return value === null || value === undefined || value === "" || !Number.isFinite(Number(value))
    ? "成本未提供或无权限"
    : money(value);
}

export function ProductCatalogDetailDialog({
  product,
  linkedProduct,
  supplierCount = 0,
  catalogUpdatedAt = "尚未同步",
  salesUpdatedAt = "尚未同步",
  onClose
}) {
  if (!product) return null;
  const skus = product.skus || [];
  const components = product.components || [];
  const sales = product.sales || { quantity: 0, netSales: 0, matchedCodeCount: 0, platforms: [] };

  return (
    <Modal
      open
      title={product.name || "商品详情"}
      size="large"
      className="product-catalog-detail-dialog"
      onClose={onClose}
      footer={<Button onClick={onClose}>关闭</Button>}
    >
      <div className="product-catalog-detail-grid">
        <section>
          <header><h3>商品档案</h3><span>{product.productKind === "bundle" ? "组合商品" : "单品"}</span></header>
          <dl>
            <div><dt>主商家编码</dt><dd className="catalog-code">{product.merchantCode || "未提供"}</dd></div>
            <div><dt>分类</dt><dd>{product.category || "未分类"}</dd></div>
            <div><dt>品牌</dt><dd>{product.brand || "未设置品牌"}</dd></div>
            <div><dt>来源</dt><dd>{product.source || "快麦 ERP"}</dd></div>
          </dl>
        </section>

        <section>
          <header><h3>SKU 与库存单位</h3><span>{quantity(skus.length)} 个</span></header>
          {skus.length ? <div className="product-catalog-detail-list">
            {skus.map(sku => <article key={sku.id || `${sku.merchantSkuCode}-${sku.barcode}`}>
              <div><strong className="catalog-code">{sku.barcode || "缺少库存单位编码"}</strong><small>{sku.barcodeType === "sales_barcode" ? "标准商品条码" : sku.barcodeType === "missing" ? "编码待补齐" : "内部唯一码"}</small></div>
              <div><strong>{sku.specificationAlias || sku.specification || "默认规格"}</strong><small>规格商家编码 {sku.merchantSkuCode || "—"}</small></div>
              <div><strong>{skuCost(sku.purchasePrice)}</strong><small>ERP 成本</small></div>
            </article>)}
          </div> : <p className="product-catalog-detail-empty">尚未读取到 SKU，请通过 ERP 商品文件补齐。</p>}
        </section>

        <section>
          <header><h3>组合关系</h3><span>{product.productKind === "bundle" ? `${quantity(components.length)} 项组成` : "非组合商品"}</span></header>
          {components.length ? <div className="product-catalog-detail-list compact">
            {components.map(component => <article key={component.id || `${component.inventoryUnitCode}-${component.ratio}`}>
              <div><strong className="catalog-code">{component.inventoryUnitCode || "缺少库存单位编码"}</strong><small>组件库存单位</small></div>
              <div><strong>× {quantity(component.ratio)}</strong><small>组合比例</small></div>
            </article>)}
          </div> : <p className="product-catalog-detail-empty">{product.productKind === "bundle" ? "组合关系待补齐，当前不能可靠计算组件消耗。" : "单品直接使用自身库存单位，不需要组合关系。"}</p>}
        </section>

        <section>
          <header><h3>经营数据</h3><span>按当前已应用范围</span></header>
          <dl>
            <div><dt>销量</dt><dd>{quantity(sales.quantity)}</dd></div>
            <div><dt>净销售额</dt><dd>{money(sales.netSales)}</dd></div>
            <div><dt>匹配编码</dt><dd>{quantity(sales.matchedCodeCount)} 个</dd></div>
          </dl>
          {(sales.platforms || []).length ? <div className="product-catalog-platform-list">
            {sales.platforms.map(entry => <div key={entry.platform}><span>{entry.platform}</span><strong>{quantity(entry.quantity)}</strong><small>{money(entry.netSales)}</small></div>)}
          </div> : <p className="product-catalog-detail-empty">当前范围暂无销售。</p>}
        </section>

        <section>
          <header><h3>业务关联</h3><span>跨 App 只读关系</span></header>
          <dl>
            <div><dt>产品全周期</dt><dd>{linkedProduct?.name || "尚未关联产品"}</dd></div>
            <div><dt>关联供应商</dt><dd>{quantity(supplierCount)} 家</dd></div>
          </dl>
        </section>

        <section>
          <header><h3>数据来源</h3><span>档案与经营事实独立更新</span></header>
          <dl>
            <div><dt>商品档案</dt><dd>{catalogUpdatedAt}</dd></div>
            <div><dt>销售事实</dt><dd>{salesUpdatedAt}</dd></div>
          </dl>
        </section>
      </div>
    </Modal>
  );
}
