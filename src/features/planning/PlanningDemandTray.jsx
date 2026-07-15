import { CalendarPlus } from "lucide-react";
import { Button } from "../../ui/Button.jsx";
import { generateProductCover } from "../../domain/productFlow.js";

export const PRODUCT_DEMAND_DRAG_TYPE = "application/x-product-demand-id";

function levelTone(level) {
  const prefix = String(level || "").trim().slice(0, 2).toLowerCase();
  return ["p0", "p1", "p2", "p3"].includes(prefix) ? prefix : "pending";
}

export function PlanningDemandTray({ demands, canEdit, onArrange }) {
  return (
    <section className="planning-demand-tray" aria-label="待规划产品">
      <div className="planning-demand-list">
        {demands.map(demand => (
          <article
            key={demand.id}
            className={`planning-demand-chip ${canEdit ? "is-draggable" : ""}`}
            draggable={canEdit}
            onDragStart={event => {
              if (!canEdit) return;
              event.dataTransfer.effectAllowed = "copy";
              event.dataTransfer.setData(PRODUCT_DEMAND_DRAG_TYPE, demand.id);
            }}
          >
            <img src={demand.image || generateProductCover(demand.name)} alt="" width="40" height="40" />
            <div className="planning-demand-copy">
              <strong title={demand.name}>{demand.name}</strong>
              <span className={`level-badge planning-level-badge level-${levelTone(demand.planningLevel)}`}>
                {demand.planningLevelIsReference ? "参考 " : ""}{demand.planningLevel || "未定级"}
              </span>
            </div>
            <Button
              className="compact planning-arrange-button"
              disabled={!canEdit}
              disabledReason="只有产品部和总经办可以安排产品规划"
              onClick={() => onArrange(demand)}
            >
              <CalendarPlus size={15} aria-hidden="true" />安排
            </Button>
          </article>
        ))}
        {!demands.length ? <div className="planning-tray-empty">暂无可规划产品</div> : null}
      </div>
    </section>
  );
}
