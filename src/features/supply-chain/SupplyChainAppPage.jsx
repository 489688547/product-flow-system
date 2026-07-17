import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { buildSupplyChainSummary } from "../../domain/supplyChain.js";
import { canAccessCompanyPlatform } from "../../domain/permissions.js";
import { fetchSalesForCodes } from "../../state/salesStore.js";
import { useAuth } from "../../state/AuthProvider.jsx";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { useSupplyChain } from "../../state/SupplyChainProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { DataTable } from "../../ui/DataTable.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { ApprovalWorkspace } from "./ApprovalWorkspace.jsx";
import { InventoryWorkspace } from "./InventoryWorkspace.jsx";
import { ProductSupplyWorkspace } from "./ProductSupplyWorkspace.jsx";
import { QualityWorkspace } from "./QualityWorkspace.jsx";
import { SupplierWorkspace } from "./SupplierWorkspace.jsx";
import { SupplyChainOverview } from "./SupplyChainOverview.jsx";
import { SupplyChainSectionNav } from "./SupplyChainSectionNav.jsx";

function departmentOf(user) {
  return String(user?.department || "").trim();
}

function SyncRecordsWorkspace() {
  const { state } = useSupplyChain();
  const columns = [
    { key: "time", header: "执行时间", render: row => row.completedAt ? new Date(row.completedAt).toLocaleString("zh-CN", { hour12: false }) : "—" },
    { key: "type", header: "类型", render: () => "钉钉采购/付款审批" },
    { key: "status", header: "状态", render: row => <span className={`status-badge ${row.status === "success" ? "success" : "danger"}`}>{row.status === "success" ? "成功" : "失败"}</span> },
    { key: "counts", header: "结果", render: row => row.status === "success" ? `采购 ${row.counts?.purchase || 0} · 付款 ${row.counts?.payment || 0} · 待映射 ${row.counts?.unmapped || 0}` : row.message || "同步失败" }
  ];
  return <section className="section-panel"><div className="section-head"><div><h2>同步记录</h2><p>保留每次钉钉读取结果，失败不覆盖上次成功数据。</p></div></div><DataTable minWidth={680} columns={columns} rows={state.syncRuns} empty={<div className="empty-state compact-empty">还没有执行过审批同步。</div>} /></section>;
}

function SupplySettingsWorkspace({ canEdit }) {
  const { state, dispatch } = useSupplyChain();
  const [draft, setDraft] = useState(state.settings);
  useEffect(() => setDraft(state.settings), [state.settings]);
  const updateMapping = (kind, key, value) => setDraft(current => ({ ...current, fieldMappings: { ...current.fieldMappings, [kind]: { ...(current.fieldMappings?.[kind] || {}), [key]: value } } }));
  return <section className="section-panel"><div className="section-head"><div><h2>钉钉审批流程映射</h2><p>分别配置采购申请和付款申请流程；付款关系只读取钉钉“关联审批”组件。</p></div>{canEdit ? <Button variant="primary" onClick={() => dispatch({ type: "settings", settings: draft })}>保存设置</Button> : null}</div><div className="supply-settings-matrix"><fieldset disabled={!canEdit}><legend>采购申请</legend><label>processCode<input value={draft.purchaseProcessCode || ""} onChange={event => setDraft(current => ({ ...current, purchaseProcessCode: event.target.value }))} /></label><label>供应商字段 ID<input value={draft.fieldMappings?.purchase?.supplierFieldId || ""} onChange={event => updateMapping("purchase", "supplierFieldId", event.target.value)} /></label><label>产品字段 ID<input value={draft.fieldMappings?.purchase?.productFieldId || ""} onChange={event => updateMapping("purchase", "productFieldId", event.target.value)} /></label><label>金额字段 ID<input value={draft.fieldMappings?.purchase?.amountFieldId || ""} onChange={event => updateMapping("purchase", "amountFieldId", event.target.value)} /></label></fieldset><fieldset disabled={!canEdit}><legend>付款申请</legend><label>processCode<input value={draft.paymentProcessCode || ""} onChange={event => setDraft(current => ({ ...current, paymentProcessCode: event.target.value }))} /></label><label>实付金额字段 ID<input value={draft.fieldMappings?.payment?.amountFieldId || ""} onChange={event => updateMapping("payment", "amountFieldId", event.target.value)} /></label><label>关联采购审批字段 ID<input value={draft.fieldMappings?.payment?.relatedPurchaseFieldId || ""} onChange={event => updateMapping("payment", "relatedPurchaseFieldId", event.target.value)} /></label></fieldset></div></section>;
}

export function SupplyChainAppPage({ onNavigate }) {
  const [section, setSection] = useState("overview");
  const [salesRows, setSalesRows] = useState([]);
  const { user } = useAuth();
  const { state: productState } = useProductFlow();
  const { state, loading, error } = useSupplyChain();
  const products = productState.products || [];
  const codes = useMemo(() => [...new Set(products.flatMap(product => (product.skuCodes || []).map(value => typeof value === "object" ? value.code : value).filter(Boolean)))], [products]);
  useEffect(() => { let active = true; fetchSalesForCodes(codes).then(rows => { if (active) setSalesRows(rows); }).catch(() => { if (active) setSalesRows([]); }); return () => { active = false; }; }, [codes]);
  const summary = useMemo(() => buildSupplyChainSummary({ supplyState: state, products, salesRows }), [products, salesRows, state]);
  const dept = departmentOf(user);
  const executive = canAccessCompanyPlatform(user);
  const supplyEditor = executive || ["供应链", "供应链部", "供应链团队", "采购部"].includes(dept);
  const financeEditor = executive || supplyEditor || dept === "财务部";
  const qualityEditor = executive || dept === "质量管理部";
  const content = {
    overview: <SupplyChainOverview summary={summary} />,
    suppliers: <SupplierWorkspace summary={summary} canEdit={supplyEditor} />,
    approvals: <ApprovalWorkspace canSync={financeEditor} canEditMapping={supplyEditor} products={products} />,
    products: <ProductSupplyWorkspace products={products} canEdit={supplyEditor} />,
    inventory: <InventoryWorkspace products={products} summary={summary} canEdit={supplyEditor} />,
    quality: <QualityWorkspace products={products} canEdit={qualityEditor} />,
    records: <SyncRecordsWorkspace />,
    settings: <SupplySettingsWorkspace canEdit={supplyEditor || executive} />
  };
  return (
    <section className="page supply-chain-app">
      <PageHeader title="供应链管理" description="供应商、采购付款、库存资金与质量问题的统一工作台。"><Button onClick={() => onNavigate?.("apps")}><ArrowLeft size={16} />返回业务 Apps</Button></PageHeader>
      <div className="supply-chain-layout">
        <SupplyChainSectionNav section={section} onChange={setSection} />
        <div className="supply-chain-content">
          {error ? <p className="supply-message error" role="alert">{error}</p> : null}
          {loading ? <div className="supply-loading" aria-label="正在加载供应链数据"><span /><span /><span /></div> : content[section]}
        </div>
      </div>
    </section>
  );
}
