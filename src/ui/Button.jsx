export function Button({ variant = "secondary", className = "", disabled = false, disabledReason = "", ...props }) {
  const button = <button className={`btn ${variant} ${className}`.trim()} disabled={disabled} {...props} />;
  if (!disabled || !disabledReason) return button;
  return <span className="disabled-action-tip" title={disabledReason} aria-label={disabledReason}>{button}</span>;
}

export function IconAction({ label, children, className = "", ...props }) {
  return (
    <button className={`icon-action ${className}`.trim()} title={label} aria-label={label} {...props}>
      {children}
    </button>
  );
}
