export function Button({ variant = "secondary", className = "", ...props }) {
  return <button className={`btn ${variant} ${className}`.trim()} {...props} />;
}

export function IconAction({ label, children, className = "", ...props }) {
  return (
    <button className={`icon-action ${className}`.trim()} title={label} aria-label={label} {...props}>
      {children}
    </button>
  );
}
