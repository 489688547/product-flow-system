import { ClipboardCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { ApprovalWorkspace } from "./ApprovalWorkspace.jsx";
import { PlanningWorkspace } from "./PlanningWorkspace.jsx";
import { ProcurementOperationsWorkspace } from "./ProcurementOperationsWorkspace.jsx";

const TABS = Object.freeze([
  { key: "planning", label: "库存风险与建议" },
  { key: "approvals", label: "采购与付款" },
  { key: "operations", label: "责任与生产" }
]);

export function PlanningProcurementWorkspace({
  products = [],
  summary,
  salesRows = [],
  risks = [],
  supplyLinks = [],
  purchases = [],
  payments = [],
  inventoryCoverage,
  inventoryReadError = "",
  workflow,
  canSyncApprovals = false,
  canEditApprovalMapping = false
}) {
  const [activeTab, setActiveTab] = useState("planning");
  const procurementAvailable = ["purchase-plans", "purchase-batches", "purchase-payment-links"]
    .every(resource => workflow?.resourceAvailable?.(resource) === true);
  return (
    <div className="supply-planning-procurement">
      <div className="supply-workspace-tabs" role="tablist" aria-label="计划与采购工作区">
        {TABS.map(tab => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls={`supply-${tab.key}-panel`}
            className={activeTab === tab.key ? "is-active" : ""}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === "planning" ? (
        <div id="supply-planning-panel" role="tabpanel">
          <PlanningWorkspace
            products={products}
            summary={summary}
            salesRows={salesRows}
            risks={risks}
            supplyLinks={supplyLinks}
            inventoryCoverage={inventoryCoverage}
            inventoryReadError={inventoryReadError}
            workflow={workflow}
          />
        </div>
      ) : activeTab === "approvals" ? (
        <div id="supply-approvals-panel" role="tabpanel">
          {!procurementAvailable ? (
            <div className="supply-coverage-notice is-partial" role="status">
              <TriangleAlert size={17} aria-hidden="true" />
              <span>
                <strong>版本化采购工作流尚未启用</strong>
                <small>采购计划、批次或付款关联暂不可写；现有钉钉审批同步与映射仍可继续使用。</small>
              </span>
            </div>
          ) : (
            <div className="supply-coverage-notice is-trusted" role="status">
              <ClipboardCheck size={17} aria-hidden="true" />
              <span>
                <strong>采购工作流已接通</strong>
                <small>采购计划、付款关联和里程碑动作均按版本与幂等规则执行。</small>
              </span>
            </div>
          )}
          <ApprovalWorkspace
            canSync={canSyncApprovals}
            canEditMapping={canEditApprovalMapping}
            products={products}
            purchases={purchases}
            payments={payments}
            workflow={workflow}
          />
        </div>
      ) : (
        <div id="supply-operations-panel" role="tabpanel">
          <ProcurementOperationsWorkspace
            products={products}
            purchases={purchases}
            supplyLinks={supplyLinks}
            workflow={workflow}
          />
        </div>
      )}
    </div>
  );
}
