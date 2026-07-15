import { CalendarDays } from "lucide-react";
import { useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { zhCN } from "react-day-picker/locale";
import "react-day-picker/style.css";
import { FloatingMenu } from "./FloatingMenu.jsx";

function parseLocalDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toLocalDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateLabel(value) {
  return value ? value.replaceAll("-", "/") : "年 / 月 / 日";
}

export function DatePickerField({ value = "", onChange, ariaLabel = "选择日期", disabled = false }) {
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const selected = parseLocalDate(value);

  const closeAndFocus = () => {
    setOpen(false);
    window.requestAnimationFrame(() => anchorRef.current?.focus());
  };

  const selectDate = date => {
    if (!date) return;
    onChange(toLocalDateValue(date));
    closeAndFocus();
  };

  return (
    <div className="date-picker-field">
      <button
        ref={anchorRef}
        type="button"
        className={`date-picker-trigger ${value ? "has-value" : ""}`}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(current => !current)}
      >
        <span>{dateLabel(value)}</span>
        <CalendarDays size={16} aria-hidden="true" />
      </button>
      <FloatingMenu
        anchorRef={anchorRef}
        open={open}
        onClose={() => setOpen(false)}
        className="date-picker-menu"
        minWidth={304}
        maxHeight={390}
        role="dialog"
        ariaLabel={ariaLabel}
      >
        <DayPicker
          autoFocus
          fixedWeeks
          locale={zhCN}
          mode="single"
          selected={selected}
          defaultMonth={selected || new Date()}
          onSelect={selectDate}
          showOutsideDays
        />
        <div className="date-picker-footer">
          <button type="button" onClick={() => selectDate(new Date())}>今天</button>
          <button
            type="button"
            disabled={!value}
            onClick={() => {
              onChange("");
              closeAndFocus();
            }}
          >
            清除
          </button>
        </div>
      </FloatingMenu>
    </div>
  );
}
