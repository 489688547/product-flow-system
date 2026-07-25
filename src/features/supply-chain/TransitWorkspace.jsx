import { PackageSearch } from "lucide-react";
import { useMemo, useState } from "react";
import { GoodsFlowProgress } from "./GoodsFlowProgress.jsx";

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

export function TransitWorkspace({ purchases = [], products = [] }) {
  const productById = useMemo(() => new Map(products.map(item => [item.id, item])), [products]);
  const batches = useMemo(() => purchases.map((row, index) => ({
    id: purchaseId(row, index),
    title: productNames(row, productById),
    supplierName: row.supplierName || "供应商待关联",
    expectedAt: row.expectedArrivalAt || row.deliveryDate || null,
    milestones: legacyMilestones(row)
  })), [productById, purchases]);
  const [selectedId, setSelectedId] = useState(() => batches[0]?.id || "");
  const selected = batches.find(item => item.id === selectedId) || batches[0] || null;
  const [selectedStage, setSelectedStage] = useState(null);
  const activeStage = selectedStage;

  function selectBatch(id) {
    setSelectedId(id);
    setSelectedStage(null);
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
