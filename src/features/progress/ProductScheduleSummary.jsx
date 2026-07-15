import { CalendarRange } from "lucide-react";
import { Button } from "../../ui/Button.jsx";

const STATE_LABELS = {
  scheduled: "尚未开始",
  active: "按计划推进",
  upcoming: "临近上线",
  overdue: "已逾期",
  complete: "已进入上市"
};

function displayDate(value) {
  return value ? value.replaceAll("-", ".") : "未设置";
}

export function ProductScheduleSummary({ schedule, onOpenPlanning }) {
  const unplanned = schedule.state === "unplanned";
  const progress = schedule.percent ?? 0;
  const progressLabel = unplanned ? "未设置排期" : `时间进度 ${progress}%`;

  return (
    <section className={`product-schedule-summary ${schedule.state}`} aria-label="产品开发至上线排期">
      <div className="schedule-summary-heading">
        <span
          className={`schedule-progress-ring ${schedule.state}`}
          style={{ "--schedule-progress": `${progress}%` }}
          role="img"
          aria-label={progressLabel}
        >
          <span>{unplanned ? "—" : `${progress}%`}</span>
        </span>
        <div>
          <span>开发至上线</span>
          <strong>{unplanned ? "未设置排期" : STATE_LABELS[schedule.state]}</strong>
        </div>
      </div>

      {unplanned ? (
        <div className="schedule-unplanned-copy">
          <strong>这个产品还没有开发周期</strong>
          <small>历史产品可以补充排期，不影响当前阶段和任务。</small>
        </div>
      ) : (
        <div className="schedule-date-range">
          <div><span>开发开始</span><strong>{displayDate(schedule.developmentStart)}</strong></div>
          <span className="schedule-range-track" aria-hidden="true"><i style={{ width: `${progress}%` }} /></span>
          <div><span>预计上线</span><strong>{displayDate(schedule.launchDate)}</strong></div>
        </div>
      )}

      <div className="schedule-summary-status">
        <span>{unplanned ? "排期状态" : "当前状态"}</span>
        <strong>{unplanned ? "待补充" : schedule.label}</strong>
      </div>

      {unplanned ? (
        <Button className="compact schedule-planning-action" onClick={onOpenPlanning}>
          <CalendarRange size={16} />前往产品规划
        </Button>
      ) : null}
    </section>
  );
}
