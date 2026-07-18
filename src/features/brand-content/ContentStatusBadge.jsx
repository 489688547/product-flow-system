import { AlertTriangle, CheckCircle2, CircleDashed, Clock3, FileWarning, Send, Wrench } from "lucide-react";
import { BRAND_DATA_STATUS_LABELS, BRAND_PRODUCTION_STATUS_LABELS } from "../../domain/brandContent.js";

const STATUS_META = {
  brief: { tone: "neutral", Icon: CircleDashed },
  scripting: { tone: "info", Icon: Wrench },
  editing: { tone: "info", Icon: Wrench },
  reviewing: { tone: "warning", Icon: Clock3 },
  ready: { tone: "warning", Icon: Send },
  published: { tone: "success", Icon: CheckCircle2 },
  archived: { tone: "neutral", Icon: CheckCircle2 },
  not_published: { tone: "neutral", Icon: CircleDashed },
  missing_id: { tone: "danger", Icon: FileWarning },
  waiting_sync: { tone: "neutral", Icon: Clock3 },
  learning: { tone: "info", Icon: Clock3 },
  untested: { tone: "warning", Icon: AlertTriangle },
  tested: { tone: "success", Icon: CheckCircle2 },
  inconsistent: { tone: "danger", Icon: AlertTriangle }
};

export function ContentStatusBadge({ status, label = "", kind = "data" }) {
  const code = typeof status === "string" ? status : status?.code || "unknown";
  const meta = STATUS_META[code] || { tone: "neutral", Icon: CircleDashed };
  const Icon = meta.Icon;
  const resolvedLabel = label || (typeof status === "object" ? status.label : "")
    || (kind === "production" ? BRAND_PRODUCTION_STATUS_LABELS[code] : BRAND_DATA_STATUS_LABELS[code])
    || "状态未知";
  return (
    <span className={`content-status-badge ${meta.tone}`} data-status={code} aria-label={`${kind === "production" ? "生产状态" : "数据状态"}：${resolvedLabel}`}>
      <Icon size={13} aria-hidden="true" />
      <span>{resolvedLabel}</span>
    </span>
  );
}
