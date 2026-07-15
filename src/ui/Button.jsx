export function Button({ variant = "secondary", className = "", disabled = false, disabledReason = "", ...props }) {
  const button = <button className={`btn ${variant} ${className}`.trim()} disabled={disabled} {...props} />;
  if (!disabled || !disabledReason) return button;
  return <span className="disabled-action-tip" tabIndex="0" role="note" title={disabledReason} data-disabled-reason={disabledReason} aria-label={disabledReason}>{button}</span>;
}

export function IconAction({ label, children, className = "", disabled = false, disabledReason = "", ...props }) {
  const button = <button className={`icon-action ${className}`.trim()} title={disabled && disabledReason ? undefined : label} aria-label={label} disabled={disabled} {...props}>{children}</button>;
  if (!disabled || !disabledReason) return button;
  return <span className="disabled-action-tip" tabIndex="0" role="note" title={disabledReason} data-disabled-reason={disabledReason} aria-label={disabledReason}>{button}</span>;
}
