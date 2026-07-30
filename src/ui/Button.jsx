export function Button({
  variant = "secondary",
  className = "",
  type = "button",
  disabled = false,
  disabledReason = "",
  loading = false,
  loadingLabel = "处理中…",
  children,
  ...props
}) {
  const unavailable = disabled || loading;
  const button = (
    <button
      className={`btn ${variant} ${className}`.trim()}
      type={type}
      disabled={unavailable}
      aria-busy={loading || undefined}
      data-state={loading ? "loading" : undefined}
      {...props}
    >
      {loading ? loadingLabel : children}
    </button>
  );
  if (!disabled || !disabledReason) return button;
  return <span className="disabled-action-tip" tabIndex="0" role="note" data-disabled-reason={disabledReason} aria-label={disabledReason}>{button}</span>;
}

export function IconAction({ label, children, className = "", disabled = false, disabledReason = "", ...props }) {
  const button = <button className={`icon-action ${className}`.trim()} title={disabled && disabledReason ? undefined : label} aria-label={label} disabled={disabled} {...props}>{children}</button>;
  if (!disabled || !disabledReason) return button;
  return <span className="disabled-action-tip" tabIndex="0" role="note" data-disabled-reason={disabledReason} aria-label={disabledReason}>{button}</span>;
}
