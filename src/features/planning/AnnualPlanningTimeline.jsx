import { AlertTriangle } from "lucide-react";
import { generateProductCover } from "../../domain/productFlow.js";
import { planIntersectsYear, timelineSegment } from "../../domain/productPlanning.js";
import { PRODUCT_DEMAND_DRAG_TYPE } from "./PlanningDemandTray.jsx";

const MONTHS = Array.from({ length: 12 }, (_, index) => `${index + 1}月`);

function TimelineDropCells({ canEdit, onDropDemand }) {
  return (
    <div className="planning-month-cells" aria-hidden={!canEdit}>
      {Array.from({ length: 12 }, (_, monthIndex) => (
        <div
          key={monthIndex}
          className="planning-month-drop"
          onDragOver={event => {
            if (!canEdit || !event.dataTransfer.types.includes(PRODUCT_DEMAND_DRAG_TYPE)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={event => {
            if (!canEdit) return;
            const demandId = event.dataTransfer.getData(PRODUCT_DEMAND_DRAG_TYPE);
            if (!demandId) return;
            event.preventDefault();
            onDropDemand(demandId, monthIndex);
          }}
        />
      ))}
    </div>
  );
}

function PlanningBar({ type, label, segment, onClick, canEdit }) {
  if (!segment.visible) return null;
  return (
    <button
      type="button"
      className={`planning-bar ${type}`}
      style={{ left: `${segment.left}%`, width: `${segment.width}%` }}
      title={`${label}：${segment.start} 至 ${segment.end}${canEdit ? "，点击编辑" : ""}`}
      onClick={onClick}
    >
      <span>{label}</span>
      <small>{segment.start.slice(5).replace("-", "/")} - {segment.end.slice(5).replace("-", "/")}</small>
    </button>
  );
}

export function AnnualPlanningTimeline({ year, plans, demands, canEdit, onDropDemand, onEditPlan }) {
  const demandMap = new Map(demands.map(demand => [demand.id, demand]));
  const visiblePlans = plans.filter(plan => planIntersectsYear(plan, year));

  return (
    <section className="planning-timeline-section" aria-labelledby="planning-timeline-title">
      <div className="planning-section-heading">
        <div>
          <h2 id="planning-timeline-title">{year} 年度规划</h2>
          <p>每条记录独立安排，支持跨月和重复规划。</p>
        </div>
        <div className="planning-legend" aria-label="时间带图例"><span className="development">开发</span><span className="launch">上线</span></div>
      </div>
      <div className="planning-timeline-scroll">
        <div className="planning-timeline">
          <div className="planning-timeline-header">
            <div className="planning-product-column">产品</div>
            <div className="planning-month-header">{MONTHS.map(month => <span key={month}>{month}</span>)}</div>
          </div>
          {visiblePlans.map(plan => {
            const demand = demandMap.get(plan.demandId);
            const snapshot = demand || plan.demandSnapshot;
            return (
              <div className="planning-timeline-row" key={plan.id}>
                <div className="planning-product-column planning-product-info">
                  <img src={snapshot?.image || generateProductCover(snapshot?.name)} alt="" width="36" height="36" />
                  <div>
                    <strong>{snapshot?.name || "未命名产品"}</strong>
                    {!demand ? <small><AlertTriangle size={12} aria-hidden="true" />来源需求已删除</small> : null}
                  </div>
                </div>
                <div className="planning-track">
                  <TimelineDropCells canEdit={canEdit} onDropDemand={onDropDemand} />
                  <PlanningBar type="development" label="开发" segment={timelineSegment(plan.developmentStart, plan.developmentEnd, year)} canEdit={canEdit} onClick={() => onEditPlan(plan)} />
                  <PlanningBar type="launch" label="上线" segment={timelineSegment(plan.launchStart, plan.launchEnd, year)} canEdit={canEdit} onClick={() => onEditPlan(plan)} />
                </div>
              </div>
            );
          })}
          {!visiblePlans.length ? (
            <div className="planning-timeline-row planning-empty-row">
              <div className="planning-product-column">拖入需求开始安排</div>
              <div className="planning-track"><TimelineDropCells canEdit={canEdit} onDropDemand={onDropDemand} /><p>{canEdit ? "把上方产品拖到目标月份" : "当前年份暂无规划"}</p></div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
