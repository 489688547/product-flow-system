import { Check, ChevronDown } from "lucide-react";
import { useId, useRef, useState } from "react";
import { normalizeTaskCategory, TASK_CATEGORIES } from "../../domain/productFlow.js";
import { FloatingMenu } from "../../ui/FloatingMenu.jsx";

export function TaskCategorySelect({ value, onChange, label = "选择任务类别", disabled = false }) {
  const anchorRef = useRef(null);
  const optionPrefix = useId();
  const [open, setOpen] = useState(false);
  const normalizedValue = normalizeTaskCategory(value);

  const choose = category => {
    onChange?.(category);
    setOpen(false);
  };

  return (
    <div className="task-category-select">
      <button
        ref={anchorRef}
        type="button"
        className="task-category-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(current => !current)}
      >
        <span>{normalizedValue}</span>
        <ChevronDown size={14} />
      </button>
      <FloatingMenu
        anchorRef={anchorRef}
        open={open}
        onClose={() => setOpen(false)}
        className="task-category-menu"
        minWidth={152}
        maxHeight={220}
        role="listbox"
        ariaLabel={label}
      >
        {TASK_CATEGORIES.map((category, index) => (
          <button
            id={`${optionPrefix}-${index}`}
            key={category}
            type="button"
            role="option"
            aria-selected={category === normalizedValue}
            className={category === normalizedValue ? "active" : ""}
            onClick={() => choose(category)}
          >
            <span>{category}</span>
            {category === normalizedValue ? <Check size={14} /> : null}
          </button>
        ))}
      </FloatingMenu>
    </div>
  );
}
