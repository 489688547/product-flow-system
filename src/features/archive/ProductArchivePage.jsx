import { BarChart3, Edit3, FolderOpen, GitBranch } from "lucide-react";
import { useMemo, useState } from "react";
import { generateProductCover, PRODUCT_LEVELS, STAGES } from "../../domain/productFlow.js";
import { normalizeSkuCodes } from "../../domain/salesData.js";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { HeaderFilter } from "../../ui/HeaderFilter.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { ProductModal } from "./ProductModal.jsx";
import { ProductPackageModal } from "./ProductPackageModal.jsx";
import { ProductSalesModal } from "./ProductSalesModal.jsx";

export function ProductArchivePage({ onNavigate }) {
  const { state, orgCache, setCurrentProduct, updateProduct } = useProductFlow();
  const [editing, setEditing] = useState(null);
  const [salesProduct, setSalesProduct] = useState(null);
  const [packageProduct, setPackageProduct] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const statusOptions = useMemo(() => [
    { value: "all", label: "全部状态" },
    ...Array.from(new Set(state.products.map(product => product.status).filter(Boolean)))
      .map(status => ({ value: status, label: status }))
  ], [state.products]);
  const products = useMemo(() => state.products
    .filter(product => statusFilter === "all" || product.status === statusFilter)
    .filter(product => levelFilter === "all" || product.level === levelFilter)
    .filter(product => stageFilter === "all" || String(product.stage) === stageFilter), [state.products, statusFilter, levelFilter, stageFilter]);
  function jump(product, screen) {
    setCurrentProduct(product.id);
    onNavigate?.(screen);
  }
  return (
    <section className="page">
      <PageHeader title="产品档案" description="查看产品状态、当前阶段、资料、会议和复盘建议。" />
      <div className="archive-filter-bar">
        <HeaderFilter label="状态" value={statusFilter} onChange={setStatusFilter} options={statusOptions} />
        <HeaderFilter label="等级" value={levelFilter} onChange={setLevelFilter} options={[{ value: "all", label: "全部等级" }, ...PRODUCT_LEVELS.map(level => ({ value: level, label: level }))]} />
        <HeaderFilter label="阶段" value={stageFilter} onChange={setStageFilter} options={[{ value: "all", label: "全部阶段" }, ...STAGES.filter(stage => stage.index > 0).map(stage => ({ value: String(stage.index), label: `${stage.index}. ${stage.title}` }))]} />
      </div>
      <div className="product-list">
        {products.map(product => {
          const hasSkuCodes = normalizeSkuCodes(product.skuCodes).length > 0;
          return (
            <article className="product-card no-review" key={product.id}>
              <img src={product.image || generateProductCover(product.name)} alt={`${product.name}封面`} width="68" height="68" loading="lazy" />
              <div className="product-card-copy">
                <div className="product-card-title"><h2>{product.name}</h2><span className="badge">{product.status || "开发中"}</span></div>
                <p>{product.desc}</p>
                <span>{product.level} · 第 {product.stage} 阶段 {STAGES[product.stage]?.short || "-"} · 提需人 {product.requester || "未记录"} · 产品经理 {product.productManager || "待确定"} · {product.source}</span>
              </div>
              <div className="card-actions">
                <span className={hasSkuCodes ? undefined : "disabled-action-tip"} title={hasSkuCodes ? undefined : "未填写69码，编辑产品后即可查看销售数据"}>
                  <Button
                    data-testid="open-product-sales"
                    disabled={!hasSkuCodes}
                    onClick={() => hasSkuCodes && setSalesProduct(product)}
                  ><BarChart3 size={16} />数据</Button>
                </span>
                <Button data-testid="open-product-progress" onClick={() => jump(product, "progress")}><GitBranch size={16} />进度</Button>
                <Button data-testid="open-product-package" onClick={() => setPackageProduct(product)}><FolderOpen size={16} />资料</Button>
                <Button data-testid="product-edit" onClick={() => setEditing(product)}><Edit3 size={16} />编辑</Button>
              </div>
            </article>
          );
        })}
        {!products.length ? <div className="empty-state">没有符合筛选条件的产品</div> : null}
      </div>
      <ProductSalesModal open={Boolean(salesProduct)} product={salesProduct} onClose={() => setSalesProduct(null)} />
      <ProductPackageModal open={Boolean(packageProduct)} product={packageProduct} onClose={() => setPackageProduct(null)} />
      <ProductModal
        open={Boolean(editing)}
        product={editing}
        orgCache={orgCache}
        onClose={() => setEditing(null)}
        onSave={form => {
          updateProduct(editing.id, { ...form, skuCodes: normalizeSkuCodes(form.skuCodes) });
          setEditing(null);
        }}
      />
    </section>
  );
}
