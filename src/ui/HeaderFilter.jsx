import { Check, ChevronDown, Filter } from "lucide-react";
import { useRef, useState } from "react";
import { FloatingMenu } from "./FloatingMenu.jsx";

export function HeaderFilter({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const selected = options.find(option => option.value === value) || options[0];
  return (
    <div className="header-filter">
      <button ref={anchorRef} type="button" aria-label={`${label}筛选：${selected?.label}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(current => !current)}>
        <Filter size={15} aria-hidden="true" />
        <span>{selected?.label || label}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <FloatingMenu anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} className="filter-menu" minWidth={180} maxHeight={280} role="listbox" ariaLabel={`${label}筛选`}>
        {options.map(option => (
          <button key={option.value} type="button" role="option" aria-selected={option.value === value} className={option.value === value ? "active" : ""} onClick={() => { onChange(option.value); setOpen(false); }}>
            <span>{option.label}</span>{option.value === value ? <Check size={15} aria-hidden="true" /> : null}
          </button>
        ))}
      </FloatingMenu>
    </div>
  );
}
