import { Check, ChevronDown, Search } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { normalizeDepartmentSelection, orgDepartments, orgUsers } from "../domain/productFlow.js";
import { FloatingMenu } from "./FloatingMenu.jsx";

export function OrgSelect({ type = "user", value = "", onChange, orgCache, placeholder, label, departmentFilter = "", searchInMenu = false, multiple = false, disabled = false }) {
  const anchorRef = useRef(null);
  const optionIdPrefix = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const items = useMemo(() => {
    if (type === "department") {
      return orgDepartments(orgCache).map(name => ({ value: name, label: name }));
    }
    if (type === "title") {
      return [...new Set(orgUsers(orgCache).map(user => user.title).filter(Boolean))].map(title => ({ value: title, label: title }));
    }
    return orgUsers(orgCache)
      .filter(user => !departmentFilter || [user.department, ...(user.departments || [])].some(department => String(department).includes(departmentFilter)))
      .map(user => ({
      value: user.name,
      label: `${user.name} · ${user.department || "未分组"} / ${user.title || "成员"}`,
      meta: `${user.department || "未分组"} / ${user.title || "成员"}`
    }));
  }, [departmentFilter, orgCache, type]);
  const selectedValues = useMemo(() => multiple
    ? (type === "department" ? normalizeDepartmentSelection(value, orgCache) : String(value || "")).split(" / ").filter(Boolean)
    : [String(value || "").trim()].filter(Boolean), [multiple, orgCache, type, value]);
  const selected = items.find(item => item.value === selectedValues[0]);
  const selectedLabel = multiple ? selectedValues.join(" / ") : selected?.value;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = items
    .filter(item => !normalizedQuery || item.label.toLowerCase().includes(normalizedQuery))
    .sort((left, right) => Number(selectedValues.includes(right.value)) - Number(selectedValues.includes(left.value)))
    .slice(0, 80);
  const inputLabel = label || placeholder || (type === "department" ? "搜索部门" : type === "title" ? "搜索岗位" : "搜索姓名、岗位、部门");
  const closeMenu = () => {
    setQuery("");
    setActiveIndex(-1);
    setOpen(false);
  };
  const chooseSingleItem = item => {
    onChange?.(item.value);
    closeMenu();
  };
  const toggleItem = item => {
    const selectedNow = selectedValues.includes(item.value);
    if (selectedNow && selectedValues.length <= 1) return;
    const next = selectedNow
      ? selectedValues.filter(value => value !== item.value)
      : items.filter(option => selectedValues.includes(option.value) || option.value === item.value).map(option => option.value);
    onChange?.(next.join(" / "));
  };
  const chooseItem = item => multiple ? toggleItem(item) : chooseSingleItem(item);
  const handleKeyDown = event => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(current => Math.min(current + 1, filteredItems.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(current => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && open && activeIndex >= 0) {
      event.preventDefault();
      chooseItem(filteredItems[activeIndex]);
    } else if ((event.key === "Enter" || event.key === " ") && !open) {
      event.preventDefault();
      setOpen(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
    }
  };

  return (
    <div className="org-select">
      {label ? <span>{label}</span> : null}
      {searchInMenu ? (
        <button
          ref={anchorRef}
          type="button"
          className="org-select-trigger"
          aria-label={inputLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen(current => !current)}
          onKeyDown={handleKeyDown}
        >
          <strong className={selectedValues.length ? "" : "placeholder"} title={selectedLabel || undefined}>{selectedLabel || placeholder || "请选择"}</strong>
          <ChevronDown size={15} aria-hidden="true" />
        </button>
      ) : (
        <div className="org-select-control">
          <Search size={14} aria-hidden="true" />
          <input
            ref={anchorRef}
            name={type === "department" ? "department-search" : "organization-user-search"}
            autoComplete="off"
            value={open ? query : value}
            onFocus={() => { setQuery(""); setActiveIndex(Math.max(0, items.findIndex(item => item.value === value))); setOpen(true); }}
            onClick={() => setOpen(true)}
            onChange={event => {
              setQuery(event.target.value);
              setActiveIndex(0);
              setOpen(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || (type === "department" ? "搜索部门" : "搜索姓名、岗位、部门")}
            role="combobox"
            aria-label={inputLabel}
            aria-haspopup="listbox"
            aria-expanded={open}
            disabled={disabled}
            aria-autocomplete="list"
            aria-activedescendant={open && activeIndex >= 0 ? `${optionIdPrefix}-option-${activeIndex}` : undefined}
          />
        </div>
      )}
      <FloatingMenu
        anchorRef={anchorRef}
        open={open}
        onClose={closeMenu}
        className="org-select-menu"
        minWidth={type === "department" ? 180 : 280}
        maxHeight={260}
        role="listbox"
        ariaLabel={type === "department" ? "选择部门" : type === "title" ? "选择岗位" : inputLabel}
      >
        {searchInMenu ? (
          <div className="org-select-menu-search">
            <Search size={14} aria-hidden="true" />
            <input
              name="organization-menu-search"
              autoComplete="off"
              value={query}
              onChange={event => { setQuery(event.target.value); setActiveIndex(0); }}
              onKeyDown={handleKeyDown}
              placeholder={type === "department" ? "搜索部门…" : type === "title" ? "搜索岗位…" : "搜索姓名、岗位、部门…"}
              aria-label={type === "department" ? "搜索部门" : type === "title" ? "搜索岗位" : "搜索组织成员"}
            />
          </div>
        ) : null}
        {filteredItems.length ? filteredItems.map((item, index) => (
          <button
            key={item.value}
            id={`${optionIdPrefix}-option-${index}`}
            type="button"
            role="option"
            aria-selected={selectedValues.includes(item.value)}
            className={`org-select-option ${selectedValues.includes(item.value) ? "active" : ""} ${index === activeIndex ? "highlighted" : ""}`}
            onClick={() => chooseItem(item)}
          >
            <span><strong>{item.value}</strong>{item.meta ? <small>{item.meta}</small> : null}</span>
            {selectedValues.includes(item.value) ? <Check size={14} aria-hidden="true" /> : null}
          </button>
        )) : <div className="org-select-empty">没有匹配的组织成员或部门</div>}
      </FloatingMenu>
      {!searchInMenu && selected?.meta ? <small>{selected.meta}</small> : null}
    </div>
  );
}
