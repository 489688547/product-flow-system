import { Check, CircleAlert, CircleDashed, CircleDot } from "lucide-react";
import { buildGoodsFlowProgress } from "../../domain/supplyChainWorkflow.js";

const STATUS_LABELS = Object.freeze({
  complete: "已完成",
  active: "进行中",
  overdue: "已逾期",
  waiting_data: "等待数据",
  not_applicable: "不适用"
});

function StageIcon({ status }) {
  if (status === "complete") return <Check size={14} aria-hidden="true" />;
  if (status === "overdue") return <CircleAlert size={15} aria-hidden="true" />;
  if (status === "active") return <CircleDot size={15} aria-hidden="true" />;
  return <CircleDashed size={15} aria-hidden="true" />;
}

export function GoodsFlowProgress({ milestones = [], now, onSelectStage }) {
  const progress = buildGoodsFlowProgress({ milestones, now });
  return (
    <ol className="goods-flow-progress" aria-label="采购批次货流进度">
      {progress.stages.map(stage => {
        const current = stage.key === progress.currentStage?.key;
        return (
          <li key={stage.key} className={`goods-flow-progress-node is-${stage.status}`}>
            <button
              type="button"
              aria-current={current ? "step" : undefined}
              aria-label={`${stage.label}，${STATUS_LABELS[stage.status]}`}
              onClick={() => onSelectStage?.(stage)}
            >
              <span className="goods-flow-progress-dot"><StageIcon status={stage.status} /></span>
              <span className="goods-flow-progress-copy">
                <strong>{stage.label}</strong>
                <small>{STATUS_LABELS[stage.status]}</small>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
