import { AlertTriangle } from "lucide-react";
import { formatExpectedLaunchMonth } from "../../domain/expectedLaunch.js";
import { generateProductCover } from "../../domain/productFlow.js";
import { planIntersectsYear } from "../../domain/productPlanning.js";
import { isProductOwnedBy } from "../../domain/productOwnership.js";
import { ProductOwnershipBadge } from "../../ui/ProductOwnershipBadge.jsx";
import { PlanningRangeBar } from "./PlanningRangeBar.jsx";
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

function levelTone(level) {
  const prefix = String(level || "").trim().slice(0, 2).toLowerCase();
  return ["p0", "p1", "p2", "p3"].includes(prefix) ? prefix : "pending";
}

export function AnnualPlanningTimeline({ year, plans, demands, currentUser, canEdit, onDropDemand, onEditPlan, onChangePlanDates }) {
  const demandMap = new Map(demands.map(demand => [demand.id, demand]));
  const visiblePlans = plans.filter(plan => planIntersectsYear(plan, year));

  return (
    <section className="planning-timeline-section" aria-labelledby="planning-timeline-title">
      <div className="planning-section-heading">
        <div>
          <h2 id="planning-timeline-title">{year} 年度规划</h2>
          <p>每个产品保留一条规划，覆盖开发开始至预计上线的完整周期。</p>
        </div>
        <div className="planning-legend" aria-label="时间带图例"><span className="period">开发至上线</span></div>
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
            const levelConfirmed = Boolean(snapshot?.planningLevelConfirmed ?? snapshot?.levelConfirmed);
            const level = snapshot?.planningLevel || snapshot?.level || "未定级";
            return (
              <div className="planning-timeline-row" key={plan.id}>
                <div className="planning-product-column planning-product-info">
                  <img src={snapshot?.image || generateProductCover(snapshot?.name)} alt="" width="36" height="36" />
                  <div>
                    <span className="product-name-line">
                      <strong>{snapshot?.name || "未命名产品"}</strong>
                      <ProductOwnershipBadge owned={isProductOwnedBy(snapshot, currentUser)} />
                    </span>
                    <span className={`level-badge planning-level-badge level-${levelTone(levelConfirmed ? level : "")}`}>
                      {levelConfirmed ? level : `期望上线：${formatExpectedLaunchMonth(snapshot?.expectedLaunchMonth)}`}
                    </span>
                    {!demand ? <small><AlertTriangle size={12} aria-hidden="true" />来源需求已删除</small> : null}
                  </div>
                </div>
                <div className="planning-track">
                  <TimelineDropCells canEdit={canEdit} onDropDemand={onDropDemand} />
                  <PlanningRangeBar
                    plan={plan}
                    year={year}
                    canEdit={canEdit}
                    onEdit={() => onEditPlan(plan)}
                    onChange={dates => onChangePlanDates(plan.id, dates)}
                  />
                </div>
              </div>
            );
          })}
          {!visiblePlans.length ? (
            <div className="planning-timeline-row planning-empty-row">
              <div className="planning-product-column">暂无产品规划</div>
              <div className="planning-track"><TimelineDropCells canEdit={canEdit} onDropDemand={onDropDemand} /><p>{canEdit ? "把上方产品拖到目标月份即可开始安排" : "当前年份暂无产品规划"}</p></div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
