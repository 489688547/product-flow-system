import { useRef } from "react";
import { DATA_ACCESS_CATEGORIES } from "../../../domain/dataAccessCatalog.js";

export function DataAccessTabs({ value, onChange }) {
  const buttonRefs = useRef(new Map());

  function moveFocus(event, index) {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const offset = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (index + offset + DATA_ACCESS_CATEGORIES.length) % DATA_ACCESS_CATEGORIES.length;
    const nextCategory = DATA_ACCESS_CATEGORIES[nextIndex];
    onChange(nextCategory.id);
    requestAnimationFrame(() => buttonRefs.current.get(nextCategory.id)?.focus());
  }

  return (
    <div className="data-access-tabs" role="tablist" aria-label="数据接入分类">
      {DATA_ACCESS_CATEGORIES.map((category, index) => (
        <button
          key={category.id}
          id={`data-access-tab-${category.id}`}
          ref={node => {
            if (node) buttonRefs.current.set(category.id, node);
            else buttonRefs.current.delete(category.id);
          }}
          type="button"
          role="tab"
          aria-selected={value === category.id}
          aria-controls={`data-access-panel-${category.id}`}
          tabIndex={value === category.id ? 0 : -1}
          onKeyDown={event => moveFocus(event, index)}
          onClick={() => onChange(category.id)}
        >
          {category.label}
        </button>
      ))}
    </div>
  );
}
