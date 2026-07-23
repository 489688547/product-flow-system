import { useRef, useState } from "react";
import {
  formatPlanningDateRange,
  movePlanningRange,
  planningDaysFromPixels,
  resizePlanningRange,
  timelineSegment
} from "../../domain/productPlanning.js";

const DRAG_THRESHOLD_PX = 4;

function sameDates(first, second) {
  return first?.developmentStart === second?.developmentStart && first?.launchDate === second?.launchDate;
}

function endpointIsInYear(value, year) {
  return String(value || "").startsWith(`${year}-`);
}

export function PlanningRangeBar({ plan, year, canEdit, onEdit, onChange }) {
  const [preview, setPreview] = useState(null);
  const interaction = useRef(null);
  const suppressClickUntil = useRef(0);
  const dates = preview || {
    developmentStart: plan.developmentStart,
    launchDate: plan.launchDate
  };
  const segment = timelineSegment(dates.developmentStart, dates.launchDate, year);

  if (!segment.visible) return null;

  const dateLabel = formatPlanningDateRange(dates.developmentStart, dates.launchDate);
  const labelAlignsEnd = segment.left + segment.width > 90;
  const fullDescription = `开发至上线：${dates.developmentStart} 至 ${dates.launchDate}`;
  const editDescription = canEdit
    ? "拖动中部移动时间段，拖动两端调整日期；点击精确编辑。"
    : "点击查看日期详情。";

  const releasePointer = (target, pointerId) => {
    if (!target?.hasPointerCapture?.(pointerId)) return;
    try {
      target.releasePointerCapture(pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
  };

  const cancelInteraction = (target, pointerId, suppressClick = true) => {
    const active = interaction.current;
    if (!active || (pointerId != null && active.pointerId !== pointerId)) return;
    interaction.current = null;
    setPreview(null);
    if (suppressClick) suppressClickUntil.current = Date.now() + 500;
    releasePointer(target, active.pointerId);
  };

  const handlePointerDown = event => {
    if (!canEdit || event.button !== 0) return;
    const trackWidth = event.currentTarget.parentElement?.getBoundingClientRect().width || 0;
    if (!trackWidth) return;
    const edge = event.target?.dataset?.rangeEdge;
    interaction.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      trackWidth,
      mode: edge === "start" || edge === "end" ? edge : "move",
      originalDates: {
        developmentStart: plan.developmentStart,
        launchDate: plan.launchDate
      },
      nextDates: {
        developmentStart: plan.developmentStart,
        launchDate: plan.launchDate
      },
      dragging: false
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // In-place dragging still works when a WebView declines capture.
    }
  };

  const handlePointerMove = event => {
    const active = interaction.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const pixelDelta = event.clientX - active.startX;
    if (!active.dragging && Math.abs(pixelDelta) < DRAG_THRESHOLD_PX) return;
    active.dragging = true;
    const dayDelta = planningDaysFromPixels(pixelDelta, active.trackWidth, year);
    const nextDates = active.mode === "move"
      ? movePlanningRange(active.originalDates.developmentStart, active.originalDates.launchDate, dayDelta, year)
      : resizePlanningRange(active.originalDates.developmentStart, active.originalDates.launchDate, active.mode, dayDelta, year);
    active.nextDates = nextDates;
    setPreview(current => sameDates(current, nextDates) ? current : nextDates);
    event.preventDefault();
  };

  const handlePointerUp = event => {
    const active = interaction.current;
    if (!active || active.pointerId !== event.pointerId) return;
    interaction.current = null;
    releasePointer(event.currentTarget, active.pointerId);
    setPreview(null);
    if (!active.dragging) return;
    suppressClickUntil.current = Date.now() + 500;
    const nextDates = active.nextDates;
    if (!sameDates(active.originalDates, nextDates)) onChange(nextDates);
  };

  const handleKeyDown = event => {
    if (event.key === "Escape" && interaction.current) {
      event.preventDefault();
      cancelInteraction(event.currentTarget, interaction.current.pointerId);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onEdit();
    }
  };

  return (
    <button
      type="button"
      className={`planning-bar period planning-range-bar${canEdit ? " is-editable" : ""}${preview ? " is-dragging" : ""}${labelAlignsEnd ? " label-align-end" : ""}`}
      style={{ left: `${segment.left}%`, width: `${segment.width}%` }}
      title={`${fullDescription}。${editDescription}`}
      aria-label={`${fullDescription}。${editDescription}`}
      onClick={event => {
        if (Date.now() < suppressClickUntil.current) {
          event.preventDefault();
          return;
        }
        onEdit();
      }}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={event => cancelInteraction(event.currentTarget, event.pointerId)}
      onLostPointerCapture={event => cancelInteraction(event.currentTarget, event.pointerId, interaction.current?.dragging)}
    >
      {canEdit && endpointIsInYear(dates.developmentStart, year)
        ? <span className="planning-range-handle start" data-range-edge="start" aria-hidden="true" />
        : null}
      <span className="planning-range-label">{dateLabel}</span>
      {canEdit && endpointIsInYear(dates.launchDate, year)
        ? <span className="planning-range-handle end" data-range-edge="end" aria-hidden="true" />
        : null}
    </button>
  );
}
