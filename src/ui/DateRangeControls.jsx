import { DatePickerField } from "./DatePickerField.jsx";

export function DateRangeControls({ range, setRange, idPrefix = "data-range", disabled = false }) {
  return (
    <div className="data-range-controls" aria-label="数据日期范围">
      <label>开始日期<DatePickerField value={range.from} ariaLabel={`${idPrefix} 开始日期`} disabled={disabled} onChange={value => setRange(current => ({ ...current, from: value }))} /></label>
      <span aria-hidden="true">至</span>
      <label>截止日期<DatePickerField value={range.to} ariaLabel={`${idPrefix} 截止日期`} disabled={disabled} onChange={value => setRange(current => ({ ...current, to: value }))} /></label>
    </div>
  );
}
