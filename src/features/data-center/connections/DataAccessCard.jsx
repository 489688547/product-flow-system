import { AlertTriangle, CheckCircle2, ChevronRight, CircleMinus } from "lucide-react";

function StatusIcon({ tone }) {
  if (tone === "success") return <CheckCircle2 size={13} aria-hidden="true" />;
  if (["warning", "danger"].includes(tone)) return <AlertTriangle size={13} aria-hidden="true" />;
  return <CircleMinus size={13} aria-hidden="true" />;
}

export function DataAccessCard({
  mark,
  markClassName = "",
  title,
  description,
  status,
  statusTone = "neutral",
  meta = [],
  disabled = false,
  disabledReason = "",
  onOpen,
  actionLabel = "查看详情",
  children
}) {
  const buttonLabel = disabled ? disabledReason : actionLabel;
  return (
    <article className="data-access-card">
      <header>
        <span className={`data-access-mark ${markClassName}`.trim()} aria-hidden="true">{mark}</span>
        <span className="data-access-card-title"><strong>{title}</strong><small>{description}</small></span>
        <em className={`status-badge ${statusTone}`}><StatusIcon tone={statusTone} />{status}</em>
      </header>
      {meta.length ? <div className="data-access-card-meta">{meta.map(item => <span key={item}>{item}</span>)}</div> : null}
      <div className="data-access-card-content">{children}</div>
      <button
        type="button"
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        aria-label={`${buttonLabel}${title}`}
        onClick={onOpen}
      >
        {buttonLabel}{!disabled ? <ChevronRight size={16} aria-hidden="true" /> : null}
      </button>
    </article>
  );
}
