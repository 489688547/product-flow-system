import { AlertTriangle, BellRing, Factory, PackageCheck, UsersRound } from "lucide-react";
import { useMemo } from "react";
import {
  buildProductionMaterialPlan,
  buildPurchaseReminderPlan,
  evaluateRollingReplenishmentRecovery,
  resolveProcurementResponsibility
} from "../../domain/supplyChainWorkflow.js";
import { Button } from "../../ui/Button.jsx";
import { DataTable } from "../../ui/DataTable.jsx";

const FACTORY_LABELS = Object.freeze([
  { id: "lanshan", label: "兰山厂" },
  { id: "shanxi", label: "山西厂" }
]);

function sourceProductId(product) {
  return String(product?.catalogProductId || product?.id || "");
}

function productComponents(products) {
  return products.flatMap(product => (product.components || []).map(component => ({
    productId: sourceProductId(product),
    inventoryUnitId: String(component.inventoryUnitId
      || component.inventoryUnitCode
      || component.skuId
      || component.sourceSkuId
      || component.id
      || ""),
    title: component.title || component.name || component.specification || "未命名物料",
    ratio: component.ratio,
    providedByUs: component.providedByUs
  })).filter(component => component.inventoryUnitId));
}

function responsibilityRules(supplyLinks) {
  return supplyLinks
    .filter(link => link.ownerId || link.responsibleUserId)
    .map((link, index) => ({
      id: String(link.responsibilityRuleId || link.id || `legacy-rule-${index}`),
      inventoryUnitId: link.inventoryUnitId || link.catalogSkuId || null,
      productId: link.productId || link.catalogProductId || null,
      supplierId: link.supplierId || null,
      materialType: link.materialType || null,
      category: link.category || null,
      ownerId: String(link.ownerId || link.responsibleUserId || ""),
      ownerName: String(link.ownerName || link.responsibleUserName || "")
    }));
}

function purchaseQuantity(row) {
  return row.quantity ?? row.purchaseQuantity ?? row.approvedQuantity ?? null;
}

function factoryId(row) {
  const value = String(row.factoryId || row.factoryName || row.warehouseName || "").toLowerCase();
  if (value.includes("兰山") || value.includes("lanshan")) return "lanshan";
  if (value.includes("山西") || value.includes("shanxi")) return "shanxi";
  return "";
}

function productionPlans(purchases) {
  return purchases
    .map(row => ({
      id: String(row.purchaseId || row.processInstanceId || row.id || ""),
      productId: String(row.productId || row.catalogProductId || ""),
      factoryId: factoryId(row),
      quantity: purchaseQuantity(row)
    }))
    .filter(row => row.productId && Number(row.quantity) > 0);
}

function purchaseLabel(row, index) {
  return String(row.title || row.purpose || row.purchaseOrderNo || row.processInstanceId || `采购单 ${index + 1}`);
}

function closeReadiness(row) {
  const missing = [];
  if (!row.erpOrderId && !row.purchaseOrderNo) missing.push("ERP采购单");
  if (!row.receivedAt && !row.receiptId && !row.receivedQuantity) missing.push("收货证据");
  if (!row.inspectedAt && !row.inspectionRecordId && !row.inspectionStatus) missing.push("质检结果");
  return {
    status: missing.length ? "partial" : "ready",
    missing
  };
}

function statusLabel(value) {
  if (value === "assigned") return "已分配";
  if (value === "conflict") return "责任冲突";
  return "无人负责";
}

export function ProcurementOperationsWorkspace({
  products = [],
  purchases = [],
  supplyLinks = [],
  workflowAvailable = false
}) {
  const rules = useMemo(() => responsibilityRules(supplyLinks), [supplyLinks]);
  const purchasers = useMemo(() => [...new Map(
    rules.filter(rule => rule.ownerId).map(rule => [rule.ownerId, { id: rule.ownerId, name: rule.ownerName }])
  ).values()], [rules]);
  const responsibilities = useMemo(() => products.map(product => {
    const productId = sourceProductId(product);
    const link = supplyLinks.find(row => String(row.productId || row.catalogProductId || "") === productId);
    return {
      id: productId,
      productName: product.name || "未命名产品",
      category: product.category || "未分类",
      ...resolveProcurementResponsibility({
        item: {
          productId,
          category: product.category || "",
          supplierId: link?.supplierId || ""
        },
        rules,
        availablePurchasers: purchasers
      })
    };
  }), [products, purchasers, rules, supplyLinks]);
  const materialPlan = useMemo(() => buildProductionMaterialPlan({
    plans: productionPlans(purchases),
    bom: productComponents(products)
  }), [products, purchases]);
  const reminderRows = useMemo(() => purchases.map((row, index) => {
    const plan = buildPurchaseReminderPlan({
      expectedArrivalAt: row.expectedArrivalAt || row.deliveryDate,
      logisticsDays: row.logisticsDays,
      customDaysBefore: row.customReminderDays || row.followUpReminderDays || []
    });
    return {
      id: String(row.purchaseId || row.processInstanceId || row.id || `purchase-${index}`),
      title: purchaseLabel(row, index),
      supplierName: row.supplierName || "供应商待关联",
      plan
    };
  }), [purchases]);
  const rollingRows = useMemo(() => purchases
    .filter(row => Array.isArray(row.dailySales) || row.safetyInventory !== undefined)
    .map((row, index) => ({
      id: String(row.purchaseId || row.processInstanceId || row.id || `rolling-${index}`),
      title: purchaseLabel(row, index),
      result: evaluateRollingReplenishmentRecovery({
        dailySales: row.dailySales || [],
        currentInventory: row.currentInventory,
        safetyInventory: row.safetyInventory
      })
    })), [purchases]);
  const closingRows = useMemo(() => purchases.map((row, index) => ({
    id: String(row.purchaseId || row.processInstanceId || row.id || `closing-${index}`),
    title: purchaseLabel(row, index),
    supplierName: row.supplierName || "供应商待关联",
    readiness: closeReadiness(row)
  })), [purchases]);

  const responsibilityColumns = [
    { key: "product", header: "产品", render: row => <span><strong>{row.productName}</strong><small className="table-secondary">{row.category}</small></span> },
    { key: "owner", header: "采购责任", render: row => <span><strong>{row.ownerName || statusLabel(row.status)}</strong><small className="table-secondary">{row.specificity ? `依据：${row.specificity}` : "等待主管指派或责任规则"}</small></span> },
    { key: "status", header: "状态", render: row => <span className={`status-badge ${row.status === "assigned" ? "success" : row.status === "conflict" ? "danger" : "warning"}`}>{statusLabel(row.status)}</span> }
  ];
  const materialColumns = [
    { key: "material", header: "原料 / 包材", render: row => <span><strong>{row.title}</strong><small className="table-secondary">{row.inventoryUnitId}</small></span> },
    { key: "factory", header: "工厂", render: row => row.factoryIds.length ? row.factoryIds.map(id => FACTORY_LABELS.find(item => item.id === id)?.label || id).join("、") : "工厂待确认" },
    { key: "quantity", header: <span className="num">需求量</span>, render: row => <span className="num">{row.requiredQuantity.toLocaleString("zh-CN")}</span> },
    { key: "ownership", header: "供料责任", render: row => <span className={`status-badge ${row.inventoryManaged ? "success" : "neutral"}`}>{row.inventoryManaged ? "我方建库存" : "供应商自带"}</span> }
  ];
  const reminderColumns = [
    { key: "purchase", header: "采购批次", render: row => <span><strong>{row.title}</strong><small className="table-secondary">{row.supplierName}</small></span> },
    { key: "arrival", header: "预计到货", render: row => row.plan.expectedArrivalAt || "到货时间待补" },
    { key: "shipment", header: "最晚发运", render: row => row.plan.shipmentDueAt || "物流时间待补" },
    { key: "reminders", header: "交期提醒", render: row => row.plan.reminders.length ? row.plan.reminders.map(item => item.label).join("、") : "等待到货日期" }
  ];

  const assignedCount = responsibilities.filter(row => row.status === "assigned").length;
  const conflictCount = responsibilities.filter(row => row.status === "conflict").length;
  const unassignedCount = responsibilities.filter(row => row.status === "unassigned").length;

  return (
    <div className="procurement-operations">
      <section className="section-panel">
        <div className="section-head">
          <div><h2><UsersRound size={18} aria-hidden="true" />采购责任</h2><p>按 SKU、产品、供应商、物料类型和品类的优先级归属；只有一名采购时可默认全部归属。</p></div>
          <Button variant="secondary" disabled={!workflowAvailable} disabledReason="责任规则工作流尚未接入">维护责任规则</Button>
        </div>
        <div className="procurement-operation-summary" aria-label="采购责任覆盖">
          <span><strong>{assignedCount}</strong>已分配</span>
          <span><strong>{unassignedCount}</strong>无人负责</span>
          <span><strong>{conflictCount}</strong>责任冲突</span>
        </div>
        <DataTable minWidth={680} columns={responsibilityColumns} rows={responsibilities.slice(0, 30)} empty={<div className="empty-state compact-empty">商品主数据接入后显示采购责任。</div>} />
        {responsibilities.length > 30 ? <p className="table-footnote">当前显示前 30 条；完整责任规则分页由 DEV-000006 提供。</p> : null}
      </section>

      <section className="section-panel">
        <div className="section-head">
          <div><h2><Factory size={18} aria-hidden="true" />生产与原料计划</h2><p>品牌采购需求按兰山厂、山西厂分别下达；我方物料汇总库存，供应商自带物料只保留责任信息。</p></div>
          <Button variant="secondary" disabled={!workflowAvailable} disabledReason="生产计划工作流尚未接入">确认生产计划</Button>
        </div>
        <div className="procurement-factory-lanes">
          {FACTORY_LABELS.map(factory => {
            const plans = materialPlan.plans.filter(row => row.factoryIds.includes(factory.id));
            return <article key={factory.id}><strong>{factory.label}</strong><span>{plans.length ? `${plans.length} 个产品计划` : "生产计划待接入"}</span></article>;
          })}
        </div>
        <DataTable minWidth={700} columns={materialColumns} rows={materialPlan.materials.slice(0, 30)} empty={<div className="empty-state compact-empty">采购数量或原料 BOM 尚未完整，不能生成原料需求。</div>} />
      </section>

      <section className="section-panel">
        <div className="section-head">
          <div><h2><BellRing size={18} aria-hidden="true" />交期提醒</h2><p>通用到货前 3 天、到货前 1 天提醒，叠加产品专属节点；物流时间单独决定最晚发运日期。</p></div>
        </div>
        <DataTable minWidth={760} columns={reminderColumns} rows={reminderRows.slice(0, 30)} empty={<div className="empty-state compact-empty">采购批次接入后生成交期提醒。</div>} />
      </section>

      <section className="section-panel procurement-recovery-grid">
        <article>
          <AlertTriangle size={19} aria-hidden="true" />
          <div><h2>滚动补货</h2><p>结合供应商单批产能安排批次与频次；仅在连续 5 天销量平稳且库存达到安全库存后解除异常。</p></div>
          <strong>{rollingRows.filter(row => row.result.status === "recovered").length} 个已满足解除条件</strong>
          <small>{rollingRows.length ? `${rollingRows.length} 个批次具备恢复判断数据` : "销量序列与安全库存待数据中心补齐"}</small>
        </article>
        <article>
          <PackageCheck size={19} aria-hidden="true" />
          <div><h2>收货结案</h2><p>发货仓确认数量后，ERP 收货、质检结果和采购批次证据齐全才允许结案。</p></div>
          <strong>{closingRows.filter(row => row.readiness.status === "ready").length} 个批次可结案</strong>
          <small>{closingRows.length ? `${closingRows.filter(row => row.readiness.status !== "ready").length} 个批次仍缺证据` : "采购批次待接入"}</small>
          <Button variant="secondary" disabled={!workflowAvailable} disabledReason="采购批次工作流尚未接入">处理收货结案</Button>
        </article>
      </section>
    </div>
  );
}
