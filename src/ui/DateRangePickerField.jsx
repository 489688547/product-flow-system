import { CalendarDays } from "lucide-react";
import { useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { zhCN } from "react-day-picker/locale";
import "react-day-picker/style.css";
import { Button } from "./Button.jsx";
import { FloatingMenu } from "./FloatingMenu.jsx";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;

function toLocalDateValue(date) {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value) {
  if (!DATE_PATTERN.test(String(value || ""))) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return toLocalDateValue(date) === value ? date : undefined;
}

function rangeToDates(value = {}) {
  return { from: parseLocalDate(value.from), to: parseLocalDate(value.to) };
}

function datesToRange(value = {}) {
  return { from: toLocalDateValue(value.from), to: toLocalDateValue(value.to) };
}

function rangeLabel(value = {}) {
  if (!value.from || !value.to) return "选择日期范围";
  return `${value.from.replaceAll("-", "/")} – ${value.to.replaceAll("-", "/")}`;
}

function sameRange(left = {}, right = {}) {
  return left.from === right.from && left.to === right.to;
}

function rangeDays(value = {}) {
  if (!value.from || !value.to) return 0;
  return Math.floor((Date.UTC(value.to.getFullYear(), value.to.getMonth(), value.to.getDate())
    - Date.UTC(value.from.getFullYear(), value.from.getMonth(), value.from.getDate())) / DAY_MS) + 1;
}

function validateDraft(draft, { maxDate, maxDays }) {
  if (!draft?.from) return { valid: false, reason: "请选择开始日期" };
  if (!draft?.to) return { valid: false, reason: "请选择结束日期" };
  if (draft.from > draft.to) return { valid: false, reason: "开始日期不能晚于结束日期" };
  const latest = parseLocalDate(maxDate);
  if (latest && draft.to > latest) return { valid: false, reason: `数据最多查询到 ${maxDate}` };
  if (rangeDays(draft) > maxDays) return { valid: false, reason: `日期范围最多查询 ${maxDays} 天` };
  return { valid: true, reason: "范围完整，确认后更新数据" };
}

export function DateRangePickerField({
  value = { from: "", to: "" },
  onConfirm,
  presets = [],
  maxDate = "",
  maxDays = 370,
  disabled = false,
  disabledReason = "",
  ariaLabel = "选择日期范围"
}) {
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => rangeToDates(value));
  const [month, setMonth] = useState(() => parseLocalDate(value.from) || new Date());
  const validation = validateDraft(draft, { maxDate, maxDays });
  const maxDateValue = parseLocalDate(maxDate);

  function closeAndFocus() {
    setOpen(false);
    window.requestAnimationFrame(() => anchorRef.current?.focus());
  }

  function openPicker() {
    const next = rangeToDates(value);
    setDraft(next);
    setMonth(next.from || new Date());
    setOpen(true);
  }

  function confirm() {
    if (!validation.valid) return;
    const next = datesToRange(draft);
    if (!sameRange(next, value)) onConfirm(next);
    closeAndFocus();
  }

  function selectPreset(preset) {
    const next = rangeToDates(preset.range);
    setDraft(next);
    if (next.from) setMonth(next.from);
  }

  return (
    <div className="date-range-picker-field">
      <button
        ref={anchorRef}
        type="button"
        className="date-picker-trigger date-range-picker-trigger has-value"
        aria-label={disabled && disabledReason ? `${ariaLabel}：${disabledReason}` : ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        onClick={open ? closeAndFocus : openPicker}
      >
        <CalendarDays size={16} aria-hidden="true" />
        <span>{rangeLabel(value)}</span>
      </button>
      <FloatingMenu
        anchorRef={anchorRef}
        open={open}
        onClose={closeAndFocus}
        className="date-picker-menu date-range-picker-menu"
        minWidth={340}
        maxHeight={560}
        role="dialog"
        ariaLabel={ariaLabel}
      >
        <div className="date-range-picker-heading">
          <strong>选择日期范围</strong>
          <span>选择完整范围后确认，页面才会更新。</span>
        </div>
        {presets.length ? <div className="date-range-presets" aria-label="快捷日期范围">
          {presets.map(preset => <button
            key={preset.id}
            type="button"
            aria-pressed={sameRange(datesToRange(draft), preset.range)}
            onClick={() => selectPreset(preset)}
          >{preset.label}</button>)}
        </div> : null}
        <DayPicker
          autoFocus
          fixedWeeks
          locale={zhCN}
          mode="range"
          selected={draft}
          month={month}
          onMonthChange={setMonth}
          onSelect={setDraft}
          disabled={maxDateValue ? { after: maxDateValue } : undefined}
          max={Math.max(0, maxDays - 1)}
          showOutsideDays
        />
        <p className={`date-range-validation ${validation.valid ? "valid" : "invalid"}`} role="status">{validation.reason}</p>
        <div className="date-range-actions">
          <Button type="button" onClick={closeAndFocus}>取消</Button>
          <Button type="button" variant="primary" disabled={!validation.valid} disabledReason={validation.reason} onClick={confirm}>确认</Button>
        </div>
      </FloatingMenu>
    </div>
  );
}
