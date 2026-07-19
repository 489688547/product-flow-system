import { Ban, CheckCircle2, CircleDot, Clock3, RotateCcw, ShieldAlert, TimerReset } from "lucide-react";

const STATUS = {
  pending_acceptance: { label: "待接收", tone: "pending", Icon: Clock3 },
  in_progress: { label: "执行中", tone: "active", Icon: CircleDot },
  blocked: { label: "已阻塞", tone: "danger", Icon: ShieldAlert },
  pending_verification: { label: "待验收", tone: "warning", Icon: TimerReset },
  closed: { label: "已完成", tone: "success", Icon: CheckCircle2 },
  returned: { label: "已退回", tone: "returned", Icon: RotateCcw },
  cancelled: { label: "已取消", tone: "neutral", Icon: Ban }
};

export function CollaborationStatusBadge({ status, archived = false, compact = false }) {
  const meta = archived ? { label: "已归档", tone: "neutral", Icon: Ban } : STATUS[status] || { label: "状态未知", tone: "neutral", Icon: CircleDot };
  const Icon = meta.Icon;
  return <span className={`collaboration-status ${meta.tone} ${compact ? "compact" : ""}`}><Icon size={13} aria-hidden="true" />{meta.label}</span>;
}
