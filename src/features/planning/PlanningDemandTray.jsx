import { CalendarPlus } from "lucide-react";
import { Button } from "../../ui/Button.jsx";
import { generateProductCover } from "../../domain/productFlow.js";
import { formatExpectedLaunchMonth } from "../../domain/expectedLaunch.js";
import { isProductOwnedBy } from "../../domain/productOwnership.js";
import { ProductOwnershipBadge } from "../../ui/ProductOwnershipBadge.jsx";

export const PRODUCT_DEMAND_DRAG_TYPE = "application/x-product-demand-id";

function levelTone(level) {
  const prefix = String(level || "").trim().slice(0, 2).toLowerCase();
  return ["p0", "p1", "p2", "p3"].includes(prefix) ? prefix : "pending";
}

export function PlanningDemandTray({ demands, currentUser, canEdit, onArrange, onOpenProgress }) {
  return (
    <section className="planning-demand-tray" aria-label="待规划产品">
      <div className="planning-demand-list">
        {demands.map(demand => {
          const canOpenProgress = Boolean(demand.productId);
          return (
            <article
              key={demand.id}
              className={`planning-demand-chip ${canEdit ? "is-draggable" : ""} ${canOpenProgress ? "is-progress-link" : ""}`}
              draggable={canEdit}
              role={canOpenProgress ? "link" : undefined}
              tabIndex={canOpenProgress ? 0 : undefined}
              aria-label={canOpenProgress ? `查看${demand.name}的产品进度` : undefined}
              onClick={event => {
                if (!canOpenProgress || event.target.closest(".planning-arrange-button, .disabled-action-tip")) return;
                onOpenProgress?.(demand.productId);
              }}
              onKeyDown={event => {
                if (!canOpenProgress || event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenProgress?.(demand.productId);
                }
              }}
              onDragStart={event => {
                if (!canEdit) return;
                event.dataTransfer.effectAllowed = "copy";
                event.dataTransfer.setData(PRODUCT_DEMAND_DRAG_TYPE, demand.id);
              }}
            >
              <img src={demand.image || generateProductCover(demand.name)} alt="" width="40" height="40" />
              <div className="planning-demand-copy">
                <span className="product-name-line">
                  <strong title={demand.name}>{demand.name}</strong>
                  <ProductOwnershipBadge owned={isProductOwnedBy(demand, currentUser)} />
                </span>
                <span className={`level-badge planning-level-badge level-${levelTone(demand.planningLevelConfirmed ? demand.planningLevel : "")}`}>
                  {demand.planningLevelConfirmed ? demand.planningLevel : `期望上线：${formatExpectedLaunchMonth(demand.expectedLaunchMonth)}`}
                </span>
              </div>
              <Button
                className="compact planning-arrange-button"
                disabled={!canEdit}
                disabledReason="只有产品部和总经办可以安排产品规划"
                onClick={event => {
                  event.stopPropagation();
                  onArrange(demand);
                }}
              >
                <CalendarPlus size={15} aria-hidden="true" />安排
              </Button>
            </article>
          );
        })}
        {!demands.length ? <div className="planning-tray-empty">暂无可规划产品</div> : null}
      </div>
    </section>
  );
}
