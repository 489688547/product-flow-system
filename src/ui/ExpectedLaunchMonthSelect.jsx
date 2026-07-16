import { expectedLaunchMonthOptions, isSelectableExpectedLaunchMonth } from "../domain/expectedLaunch.js";

export function ExpectedLaunchMonthSelect({ value, onChange, name = "expected-launch-month" }) {
  const options = expectedLaunchMonthOptions();
  const selected = isSelectableExpectedLaunchMonth(value) ? value : "";

  return (
    <select name={name} value={selected} onChange={event => onChange(event.target.value)}>
      <option value="">选择期望上线月份</option>
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}
