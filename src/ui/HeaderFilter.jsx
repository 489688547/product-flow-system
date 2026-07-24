import { Check, ChevronDown, Filter } from "lucide-react";
import { useRef, useState } from "react";
import { FloatingMenu } from "./FloatingMenu.jsx";

export function HeaderFilter({ label, value, options, onChange, icon: Icon = Filter, action = "筛选", compact = false }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const selected = options.find(option => option.value === value) || options[0];
  const active = Boolean(selected && options[0] && selected.value !== options[0].value);
  return (
    <div className={`header-filter${compact ? " is-compact" : ""}`}>
      <button
        ref={anchorRef}
        type="button"
        aria-label={`${label}${action}：${selected?.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-active={active ? "true" : "false"}
        title={compact ? `${label}${action}：${selected?.label}` : undefined}
        onClick={() => setOpen(current => !current)}
      >
        <Icon size={15} aria-hidden="true" />
        {compact ? null : <>
          <span>{selected?.label || label}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </>}
      </button>
      <FloatingMenu anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} className="filter-menu" minWidth={180} maxHeight={280} role="listbox" ariaLabel={`${label}${action}`}>
        {options.map(option => (
          <button key={option.value} type="button" role="option" aria-selected={option.value === value} className={option.value === value ? "active" : ""} onClick={() => { onChange(option.value); setOpen(false); }}>
            <span>{option.label}</span>{option.value === value ? <Check size={15} aria-hidden="true" /> : null}
          </button>
        ))}
      </FloatingMenu>
    </div>
  );
}
