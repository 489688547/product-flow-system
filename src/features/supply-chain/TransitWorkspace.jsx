import { PackageSearch } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../../ui/Button.jsx";
import { GoodsFlowProgress } from "./GoodsFlowProgress.jsx";

const WORKFLOW_STAGE_ORDER = Object.freeze([
  "purchase_request",
  "approval",
  "purchase_order",
  "production",
  "shipment",
  "arrival",
  "inspection",
  "receipt",
  "closed"
]);
const STATUS_STAGE = Object.freeze({
  draft: "purchase_request",
  applied: "purchase_request",
  approved: "approval",
  ordered: "purchase_order",
  producing: "production",
  shipped: "shipment",
  arrived: "arrival",
  inspecting: "inspection",
  received: "receipt",
  closed: "closed"
});

const NEXT_ACTION = Object.freeze({
  draft: ["apply", "提交采购申请"],
  applied: ["approve", "确认审批通过"],
  approved: ["order", "登记 ERP 下单"],
  ordered: ["start_production", "开始生产 / 备货"],
  producing: ["ship", "确认发运"],
  shipped: ["arrive", "确认到仓"],
  arrived: ["inspect", "开始质检"],
  inspecting: ["receive", "确认收货入库"],
  received: ["close", "结案"]
});

function purchaseId(row, index) {
  return String(row.id || row.purchaseId || row.processInstanceId || `purchase-${index}`);
}

function purchaseStatus(row) {
  return String(row.status || "").toUpperCase();
}

function legacyMilestones(row) {
  const status = purchaseStatus(row);
  const createdAt = row.createdAt || row.startedAt || row.approvedAt || null;
  const completed = ["COMPLETED", "APPROVED"].includes(status);
  const milestones = [{
    stage: "purchase_request",
    status: "complete",
    actualAt: createdAt,
    source: "legacy_purchase"
  }];
  milestones.push({
    stage: "approval",
    status: completed ? "complete" : status === "RUNNING" ? "active" : "waiting_data",
    actualAt: completed ? row.approvedAt || row.completedAt || null : null,
    plannedAt: row.approvalDueAt || null,
    ownerName: row.approverName || ""
  });
  if (row.erpOrderId) {
    milestones.push({
      stage: "purchase_order",
      status: "complete",
      actualAt: row.erpOrderedAt || null,
      source: "erp"
    });
  }
  return milestones;
}

function productNames(row, productById) {
  const ids = Array.isArray(row.productIds) ? row.productIds : [row.productId].filter(Boolean);
  const names = ids.map(id => productById.get(id)?.name || id).filter(Boolean);
  return names.length ? names.join("、") : row.title || row.purpose || "产品待关联";
}

function workflowMilestones(entity) {
  const currentStage = STATUS_STAGE[entity.status] || "purchase_request";
  const currentIndex = WORKFLOW_STAGE_ORDER.indexOf(currentStage);
  return WORKFLOW_STAGE_ORDER.map((stage, index) => ({
    stage,
    status: index < currentIndex || entity.status === "closed"
      ? "complete"
      : index === currentIndex
        ? "active"
        : "waiting_data",
    actualAt: entity.fields?.milestones?.find(item => item.stage === stage)?.actualAt || null,
    plannedAt: entity.fields?.milestones?.find(item => item.stage === stage)?.plannedAt || null,
    source: "supply_chain_workflow"
  }));
}

export function TransitWorkspace({ purchases = [], products = [], workflow }) {
  const productById = useMemo(() => new Map(products.map(item => [item.id, item])), [products]);
  const workflowBatches = workflow?.workflows?.["purchase-batches"]?.items || [];
  const legacyBatches = useMemo(() => purchases.map((row, index) => ({
    id: purchaseId(row, index),
    title: productNames(row, productById),
    supplierName: row.supplierName || "供应商待关联",
    expectedAt: row.expectedArrivalAt || row.deliveryDate || null,
    milestones: legacyMilestones(row),
    entity: null
  })), [productById, purchases]);
  const batches = useMemo(() => {
    const result = new Map(legacyBatches.map(row => [row.id, row]));
    workflowBatches.forEach(entity => {
      const fields = entity.fields || {};
      result.set(String(entity.id), {
        ...(result.get(String(entity.id)) || {}),
        id: String(entity.id),
        title: fields.productName || productNames(fields, productById),
        supplierName: fields.supplierName || "供应商待关联",
        expectedAt: fields.expectedArrivalAt || null,
        milestones: workflowMilestones(entity),
        entity
      });
    });
    return [...result.values()];
  }, [legacyBatches, productById, workflowBatches]);
  const [selectedId, setSelectedId] = useState(() => batches[0]?.id || "");
  const selected = batches.find(item => item.id === selectedId) || batches[0] || null;
  const [selectedStage, setSelectedStage] = useState(null);
  const activeStage = selectedStage;

  function selectBatch(id) {
    setSelectedId(id);
    setSelectedStage(null);
  }

  async function advanceBatch() {
    const entity = selected?.entity;
    const next = entity ? NEXT_ACTION[entity.status] : null;
    if (!next) return;
    try {
      await workflow.act({
        resource: "purchase-batches",
        id: entity.id,
        action: next[0],
        expectedVersion: entity.version,
        fields: {
          milestoneEvidence: {
            stage: next[0],
            recordedAt: new Date().toISOString()
          }
        }
      });
    } catch {
      // The page-level workflow notice owns the safe error presentation.
    }
  }

  return (
    <div className="transit-workspace">
      <header className="transit-workspace-heading">
        <div>
          <h2>产品货流</h2>
          <p>先看产品下有哪些活跃采购批次，再核对每个节点的来源证据。</p>
        </div>
        <span>{batches.length} 个采购批次</span>
      </header>
      {batches.length ? (
        <div className="transit-workspace-layout">
          <aside aria-label="采购批次">
            <ul>
              {batches.map(batch => (
                <li key={batch.id}>
                  <button type="button" className={batch.id === selected?.id ? "is-selected" : ""} onClick={() => selectBatch(batch.id)}>
                    <strong>{batch.title}</strong>
                    <span>{batch.supplierName}</span>
                    <small>{batch.expectedAt ? `预计 ${batch.expectedAt} 到货` : "到货时间待确认"}</small>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          <section className="transit-batch-detail" aria-labelledby="transit-batch-title">
            <div>
              <h3 id="transit-batch-title">{selected.title}</h3>
              <p>{selected.supplierName} · 批次 {selected.id}</p>
            </div>
            {selected.entity && NEXT_ACTION[selected.entity.status] ? (
              <Button variant="primary" disabled={Boolean(workflow?.busy)} onClick={advanceBatch}>
                {workflow?.busy ? "正在更新…" : NEXT_ACTION[selected.entity.status][1]}
              </Button>
            ) : null}
            <GoodsFlowProgress milestones={selected.milestones} onSelectStage={setSelectedStage} />
            {activeStage ? (
              <div className="transit-stage-detail" role="status">
                <strong>{activeStage.label}</strong>
                <span>{activeStage.ownerName ? `负责人：${activeStage.ownerName}` : "负责人待确认"}</span>
                <small>
                  {activeStage.actualAt
                    ? `实际完成：${activeStage.actualAt}`
                    : activeStage.plannedAt
                      ? `计划时间：${activeStage.plannedAt}`
                      : "节点时间与证据待接入"}
                </small>
              </div>
            ) : null}
            <p className="transit-evidence-note">没有来源证据的节点显示“等待数据”，不会根据后续节点反推完成。</p>
          </section>
        </div>
      ) : (
        <div className="supply-workbench-empty">
          <PackageSearch size={22} aria-hidden="true" />
          <strong>暂无采购批次</strong>
          <span>采购申请或 ERP 采购单接入后，将在这里显示连续货流进度。</span>
        </div>
      )}
    </div>
  );
}
