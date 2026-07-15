import { CalendarPlus } from "lucide-react";
import { Button } from "../../ui/Button.jsx";
import { generateProductCover } from "../../domain/productFlow.js";

export const PRODUCT_DEMAND_DRAG_TYPE = "application/x-product-demand-id";

export function PlanningDemandTray({ demands, canEdit, onArrange }) {
  return (
    <section className="planning-demand-tray" aria-labelledby="planning-demand-title">
      <div className="planning-section-heading">
        <div>
          <h2 id="planning-demand-title">需求池产品</h2>
          <p>拖入下方月份安排开发和上线时间，安排后仍保留在需求池。</p>
        </div>
        <span>{demands.length} 个产品</span>
      </div>
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
            <strong title={demand.name}>{demand.name}</strong>
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
        {!demands.length ? <div className="planning-tray-empty">需求池暂无可规划产品</div> : null}
      </div>
    </section>
  );
}
