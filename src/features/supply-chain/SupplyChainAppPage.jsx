import { useEffect, useMemo, useState } from "react";
import { Upload } from "lucide-react";
import { buildSupplyChainSummary, isErpInventorySource, isPhysicalInventorySource } from "../../domain/supplyChain.js";
import { buildSupplySnapshotActions } from "../../domain/supplyChainSnapshot.js";
import { canAccessCompanyPlatform } from "../../domain/permissions.js";
import { fetchSalesForCodes } from "../../state/salesStore.js";
import { useAuth } from "../../state/AuthProvider.jsx";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { useSupplyChain } from "../../state/SupplyChainProvider.jsx";
import { useGoodsFlow } from "../../state/GoodsFlowProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { DataTable } from "../../ui/DataTable.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { ApprovalWorkspace } from "./ApprovalWorkspace.jsx";
import { CashCycleWorkspace } from "./CashCycleWorkspace.jsx";
import { ComingPhaseWorkspace } from "./ComingPhaseWorkspace.jsx";
import { GoodsFlowOverview } from "./GoodsFlowOverview.jsx";
import { InventoryWorkspace } from "./InventoryWorkspace.jsx";
import { ProductSupplyWorkspace } from "./ProductSupplyWorkspace.jsx";
import { QualityWorkspace } from "./QualityWorkspace.jsx";
import { SupplierWorkspace } from "./SupplierWorkspace.jsx";

function departmentOf(user) {
  return String(user?.department || "").trim();
}

function latestDate(rows, keys) {
  const timestamps = rows.flatMap(row => keys.map(key => Date.parse(row?.[key] || 0))).filter(Number.isFinite);
  return timestamps.length ? new Date(Math.max(...timestamps)).toLocaleString("zh-CN", { hour12: false }) : "尚未同步";
}

function syncRunType(row) {
  if (row.type === "dingtalk-supply-folder") return "钉钉供应链文件";
  return row.type === "dingtalk-inventory-docs" ? "钉钉库存文件" : "钉钉采购/付款审批";
}

function syncRunResult(row) {
  if (row.status !== "success") return row.message || "同步失败";
  if (["dingtalk-supply-folder", "dingtalk-inventory-docs"].includes(row.type)) {
    const finished = Number(row.counts?.stocktake || 0) + Number(row.counts?.["finished-lanshan"] || 0) + Number(row.counts?.["finished-shanxi"] || 0);
    const materials = Number(row.counts?.["materials-lanshan"] || 0) + Number(row.counts?.["materials-shanxi"] || 0);
    const suppliers = Number(row.counts?.suppliers || 0);
    return `${suppliers ? `供应商 ${suppliers} · ` : ""}成品 ${finished} · 原辅料 ${materials} · 异常 ${Number(row.counts?.risks || 0)}`;
  }
  return `采购 ${row.counts?.purchase || 0} · 付款 ${row.counts?.payment || 0} · 待映射 ${row.counts?.unmapped || 0} · 过滤 ${row.counts?.skipped || 0}`;
}

function SyncRecordsWorkspace({ salesRows, canEdit }) {
  const { state, dispatch } = useSupplyChain();
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importNotice, setImportNotice] = useState("");
  async function importSnapshot(file) {
    if (!file) return;
    setImporting(true); setImportError(""); setImportNotice("");
    try {
      const result = buildSupplySnapshotActions(JSON.parse(await file.text()));
      dispatch({ type: "batch", actions: result.actions });
      setImportNotice(`已导入供应商 ${result.counts.suppliers || 0} 家、成品及盘点 ${result.counts.inventorySnapshots || 0} 条、原辅料 ${result.counts.materialInventorySnapshots || 0} 条、异常库存 ${result.counts.inventoryRisks || 0} 条。`);
    } catch (event) {
      setImportError(event instanceof SyntaxError ? "快照文件不是有效的 JSON。" : event.message || "供应链快照导入失败。");
    } finally {
      setImporting(false);
    }
  }
  const successfulApprovals = state.syncRuns.filter(row => row.type === "dingtalk-approvals" && row.status === "success");
  const erpSnapshots = state.inventorySnapshots.filter(row => isErpInventorySource(row.sourceType));
  const stocktakes = state.inventorySnapshots.filter(row => isPhysicalInventorySource(row.sourceType) && row.countedQuantity !== null && row.countedQuantity !== undefined);
  const sources = [
    { name: "供应商档案", role: "钉钉供应链文件夹的名称、类别与供货范围", status: state.suppliers.length ? "文件快照" : "待导入", count: `${state.suppliers.length} 家供应商`, updatedAt: latestDate(state.suppliers, ["importedAt", "updatedAt"]) },
    { name: "钉钉审批", role: "采购申请、付款审批与关联关系", status: successfulApprovals.length ? "已连接" : "待首次同步", count: `${state.purchaseApprovals.length} 张采购 · ${state.paymentApprovals.length} 张付款`, updatedAt: latestDate(successfulApprovals, ["completedAt"]) },
    { name: "快麦销售成本", role: "SKU 销量与库存消耗", status: salesRows.length ? "已读取" : "待导入 / 同步", count: `${salesRows.length} 条成本记录`, updatedAt: salesRows.length ? "随销售数据刷新" : "尚无数据" },
    { name: "ERP库存快照", role: "SKU × 仓库当前库存", status: erpSnapshots.length ? "文件快照" : "待导入", count: `${erpSnapshots.length} 条库存记录`, updatedAt: latestDate(erpSnapshots, ["stocktakeDate", "importedAt"]) },
    { name: "盘点导入", role: "ERP 与实盘数量及金额校准", status: stocktakes.length ? "已校准" : "待盘点", count: `${stocktakes.length} 条盘点记录`, updatedAt: latestDate(stocktakes, ["stocktakeDate", "importedAt"]) },
    { name: "原辅料库存", role: "产品 × 物料 × 仓库的数量与金额", status: state.materialInventorySnapshots.length ? "文件快照" : "待导入", count: `${state.materialInventorySnapshots.length} 条物料记录`, updatedAt: latestDate(state.materialInventorySnapshots, ["snapshotDate", "importedAt"]) },
    { name: "异常库存", role: "可售天数、预计到货与异常处理", status: state.inventoryRisks.some(row => row.status === "active") ? "有待处理" : state.inventoryRisks.length ? "已记录" : "待导入", count: `${state.inventoryRisks.filter(row => row.status === "active").length} 条处理中`, updatedAt: latestDate(state.inventoryRisks, ["importedAt"]) },
    { name: "质量导入", role: "差评、抽检、整改与验证", status: state.qualityImportBatches.length ? "文件快照" : "待导入", count: `${state.qualityIssues.length} 个质量事件`, updatedAt: latestDate(state.qualityImportBatches, ["importedAt"]) }
  ];
  const columns = [
    { key: "time", header: "执行时间", render: row => row.completedAt ? new Date(row.completedAt).toLocaleString("zh-CN", { hour12: false }) : "—" },
    { key: "type", header: "类型", render: row => syncRunType(row) },
    { key: "status", header: "状态", render: row => <span className={`status-badge ${row.status === "success" ? "success" : "danger"}`}>{row.status === "success" ? "成功" : "失败"}</span> },
    { key: "counts", header: "结果", render: row => syncRunResult(row) }
  ];
  return <div className="supply-work-grid"><section className="section-panel"><div className="section-head"><div><h2>数据源中心</h2><p>每个数字都标明来源和新鲜度；快麦库存接口验证前只显示文件快照，不伪装自动同步。</p></div>{canEdit ? <label className={`upload-field ${importing ? "is-busy" : ""}`}><Upload size={16} />{importing ? "正在导入…" : "导入钉钉供应链快照"}<input type="file" accept=".json" disabled={importing} onChange={event => { importSnapshot(event.target.files?.[0]); event.target.value = ""; }} /></label> : null}</div>{importError ? <p className="supply-message error" role="alert">{importError}</p> : null}{importNotice ? <p className="supply-message success" role="status">{importNotice}</p> : null}<div className="supply-source-grid">{sources.map(source => <article key={source.name}><div><strong>{source.name}</strong><span className="status-badge neutral">{source.status}</span></div><p>{source.role}</p><b>{source.count}</b><small>最近更新：{source.updatedAt}</small></article>)}</div></section><section className="section-panel"><div className="section-head"><div><h2>钉钉同步记录</h2><p>保留审批和库存文件的读取结果，失败不覆盖上次成功数据。</p></div></div><DataTable minWidth={680} columns={columns} rows={state.syncRuns} empty={<div className="empty-state compact-empty">还没有执行过数据同步。</div>} /></section></div>;
}

function SupplySettingsWorkspace({ canEdit }) {
  const { state, dispatch } = useSupplyChain();
  const [draft, setDraft] = useState(state.settings);
  useEffect(() => setDraft(state.settings), [state.settings]);
  const updateMapping = (kind, key, value) => setDraft(current => ({ ...current, fieldMappings: { ...current.fieldMappings, [kind]: { ...(current.fieldMappings?.[kind] || {}), [key]: value } } }));
  return <section className="supply-flat-workspace">{canEdit ? <div className="supply-workspace-toolbar"><Button variant="primary" onClick={() => dispatch({ type: "settings", settings: draft })}>保存设置</Button></div> : null}<div className="supply-settings-matrix"><fieldset disabled={!canEdit}><legend>采购申请单</legend><label>processCode<input value={draft.purchaseProcessCode || ""} onChange={event => setDraft(current => ({ ...current, purchaseProcessCode: event.target.value }))} /></label><label>金额字段<input value={draft.fieldMappings?.purchase?.amountFieldId || ""} onChange={event => updateMapping("purchase", "amountFieldId", event.target.value)} /></label><label>事由字段<input value={draft.fieldMappings?.purchase?.purposeFieldId || ""} onChange={event => updateMapping("purchase", "purposeFieldId", event.target.value)} /></label><label>业务分类字段<input value={draft.fieldMappings?.purchase?.businessCategoryFieldId || ""} onChange={event => updateMapping("purchase", "businessCategoryFieldId", event.target.value)} /></label><label>供应商字段（可选）<input value={draft.fieldMappings?.purchase?.supplierFieldId || ""} onChange={event => updateMapping("purchase", "supplierFieldId", event.target.value)} /></label><label>产品字段（可选）<input value={draft.fieldMappings?.purchase?.productFieldId || ""} onChange={event => updateMapping("purchase", "productFieldId", event.target.value)} /></label></fieldset><fieldset disabled={!canEdit}><legend>付款审批</legend><label>processCode<input value={draft.paymentProcessCode || ""} onChange={event => setDraft(current => ({ ...current, paymentProcessCode: event.target.value }))} /></label><label>付款金额字段（无则读取关联采购）<input value={draft.fieldMappings?.payment?.amountFieldId || ""} onChange={event => updateMapping("payment", "amountFieldId", event.target.value)} /></label><label>关联采购审批字段<input value={draft.fieldMappings?.payment?.relatedPurchaseFieldId || ""} onChange={event => updateMapping("payment", "relatedPurchaseFieldId", event.target.value)} /></label><p className="supply-settings-note">安全规则：不保存收款账号、身份证、详细地址或完整审批原文；只保留金额、事由、分类、状态和关联实例 ID。</p></fieldset></div></section>;
}

function ProcurementWorkspace({ summary, products, supplyEditor, financeEditor }) {
  const [view, setView] = useState("suppliers");
  const views = [
    ["suppliers", "供应商档案"],
    ["approvals", "采购与付款"],
    ["products", "产品供应关系"]
  ];
  return (
    <div className="supply-flat-workspace">
      <div className="supply-procurement-switcher" role="tablist" aria-label="采购与供应商功能">
        {views.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={view === key} className={view === key ? "active" : ""} onClick={() => setView(key)}>{label}</button>
        ))}
      </div>
      {view === "suppliers" ? <SupplierWorkspace summary={summary} canEdit={supplyEditor} /> : null}
      {view === "approvals" ? <ApprovalWorkspace canSync={financeEditor} canEditMapping={supplyEditor} products={products} /> : null}
      {view === "products" ? <ProductSupplyWorkspace products={products} canEdit={supplyEditor} /> : null}
    </div>
  );
}

export function SupplyChainAppPage({ section = "overview" }) {
  const [salesRows, setSalesRows] = useState([]);
  const { user } = useAuth();
  const { state: productState } = useProductFlow();
  const { state, loading, error } = useSupplyChain();
  const goodsFlow = useGoodsFlow();
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
    overview: <GoodsFlowOverview dashboard={goodsFlow.dashboard} legacySummary={summary} stale={goodsFlow.stale} loading={goodsFlow.loading} error={goodsFlow.error} onRefresh={goodsFlow.refresh} />,
    demand: <ComingPhaseWorkspace title="需求计划" phase="Phase 1" description="形成 SKU × 周的 13 周滚动预测，先从核心 SKU 开始。" availableEvidence={[`${products.length} 个商品主档`, `${salesRows.length} 条销售成本记录`]} requiredSources={["近 104 周 SKU 销量", "投放计划与大促日历", "内容排期和新品首单判断"]} />,
    procurement: <ProcurementWorkspace summary={summary} products={products} supplyEditor={supplyEditor} financeEditor={financeEditor} />,
    transit: <ComingPhaseWorkspace title="生产与在途" phase="Phase 2" description="把采购单从下单、排产、产完、发运到到仓串成可跟催的节点链。" availableEvidence={[`${state.purchaseApprovals.length} 张采购申请`, `${state.suppliers.length} 家供应商`]} requiredSources={["每笔 PO 的承诺交期", "五个节点的实际时间", "延误后的可售天数影响"]} />,
    inventory: <InventoryWorkspace products={products} summary={summary} canEdit={supplyEditor} />,
    fulfillment: <ComingPhaseWorkspace title="履约物流" phase="Phase 2" description="核对 48 小时发货、快递费用和破损对包装的影响。" availableEvidence={[`${products.length} 个商品主档`, `${state.inventorySnapshots.length} 条库存快照`]} requiredSources={["仓配发货时间", "快递账单与运单", "破损和包装复审记录"]} />,
    quality: <QualityWorkspace products={products} canEdit={qualityEditor} />,
    cash: <CashCycleWorkspace dashboard={goodsFlow.dashboard} terms={goodsFlow.terms} />,
    records: <SyncRecordsWorkspace salesRows={salesRows} canEdit={supplyEditor} />,
    settings: <SupplySettingsWorkspace canEdit={supplyEditor || executive} />
  };
  return (
    <section className="page supply-chain-app">
      <PageHeader title="供应链管理" description="用现金循环连接需求、采购、库存、履约与质量判断。" />
      {error ? <p className="supply-message error" role="alert">{error}</p> : null}
      {section !== "overview" && goodsFlow.error ? <p className="supply-message warning" role="status">{goodsFlow.error}</p> : null}
      {loading ? <div className="supply-loading" aria-label="正在加载供应链数据"><span /><span /><span /></div> : content[section]}
    </section>
  );
}
