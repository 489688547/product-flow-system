import { Plus, Trash2 } from "lucide-react";
import { FACT_FIELD_REGISTRY } from "../../../domain/dataStandards.js";
import { Button, IconAction } from "../../../ui/Button.jsx";

const FIELD_OPTIONS = Object.entries(FACT_FIELD_REGISTRY).map(([field, definition]) => ({ field, ...definition }));
const DEFAULT_FIELD = FIELD_OPTIONS[0]?.field || "sales.net_sales";

function aggregate(field = DEFAULT_FIELD, filters = []) {
  return { type: "aggregate", operation: "sum", input: { type: "field", field }, filters };
}

function percentage(left = "sales.refund", right = "sales.gross_sales") {
  return {
    type: "arithmetic",
    operation: "multiply",
    left: { type: "arithmetic", operation: "divide", left: aggregate(left), right: aggregate(right), onZero: "null" },
    right: { type: "constant", value: 100, unit: "PERCENT_SCALE" }
  };
}

function formulaMode(value) {
  if (value?.type === "metric") return "metric";
  if (value?.type === "arithmetic") return "percentage";
  return "aggregate";
}

function filterValue(filter) {
  return Array.isArray(filter.value) ? filter.value.join(",") : filter.value ?? "";
}

export function FormulaBuilder({ value, onChange, publishedDefinitions = [], disabled = false }) {
  const mode = formulaMode(value);
  const filters = mode === "aggregate" ? value?.filters || [] : [];
  const changeMode = nextMode => {
    if (nextMode === "metric") onChange({ type: "metric", metricCode: publishedDefinitions[0]?.metricCode || "" });
    else if (nextMode === "percentage") onChange(percentage());
    else onChange(aggregate());
  };
  const ratio = mode === "percentage" ? value : percentage();
  const ratioLeft = ratio.left?.left?.input?.field || "sales.refund";
  const ratioRight = ratio.left?.right?.input?.field || "sales.gross_sales";
  const setRatio = (left, right) => onChange(percentage(left, right));
  const updateFilter = (index, patch) => onChange({
    ...value,
    filters: filters.map((filter, filterIndex) => filterIndex === index ? { ...filter, ...patch } : filter)
  });
  return (
    <fieldset className="formula-builder" disabled={disabled}>
      <legend>受控公式</legend>
      <label>
        计算结构
        <select value={mode} onChange={event => changeMode(event.target.value)}>
          <option value="aggregate">事实字段求和</option>
          <option value="percentage">两个事实字段相除并转百分比</option>
          <option value="metric" disabled={!publishedDefinitions.length}>引用已发布口径</option>
        </select>
      </label>
      {mode === "aggregate" ? <>
        <label>
          求和字段
          <select value={value?.input?.field || DEFAULT_FIELD} onChange={event => onChange(aggregate(event.target.value, filters))}>
            {FIELD_OPTIONS.map(option => <option key={option.field} value={option.field}>{option.field} · {option.unit}</option>)}
          </select>
        </label>
        <div className="formula-filter-list">
          <div className="formula-filter-head"><span>结构化过滤（可选）</span><Button type="button" onClick={() => onChange({ ...value, filters: [...filters, { field: DEFAULT_FIELD, operation: "equals", value: "" }] })}><Plus size={14} />添加条件</Button></div>
          {filters.map((filter, index) => <div className="formula-filter-row" key={`${index}-${filter.field}`}>
            <select aria-label={`过滤字段 ${index + 1}`} value={filter.field} onChange={event => updateFilter(index, { field: event.target.value })}>{FIELD_OPTIONS.map(option => <option key={option.field} value={option.field}>{option.field}</option>)}</select>
            <select aria-label={`过滤关系 ${index + 1}`} value={filter.operation} onChange={event => updateFilter(index, { operation: event.target.value })}><option value="equals">等于</option><option value="contains">包含</option><option value="in">属于列表</option><option value="not_in">不属于列表</option><option value="is_null">为空</option><option value="not_null">不为空</option></select>
            {!['is_null', 'not_null'].includes(filter.operation) ? <input aria-label={`过滤值 ${index + 1}`} value={filterValue(filter)} onChange={event => updateFilter(index, { value: ["in", "not_in"].includes(filter.operation) ? event.target.value.split(",").map(item => item.trim()).filter(Boolean) : event.target.value })} placeholder="多个值用逗号分隔" /> : <span className="formula-filter-empty">无需填写值</span>}
            <IconAction type="button" label="删除过滤条件" onClick={() => onChange({ ...value, filters: filters.filter((_, filterIndex) => filterIndex !== index) })}><Trash2 size={15} /></IconAction>
          </div>)}
          {!filters.length ? <p>当前不增加额外过滤；平台“其它 / 未知”仍由服务端固定排除。</p> : null}
        </div>
      </> : null}
      {mode === "percentage" ? <div className="formula-ratio-grid">
        <label>分子字段<select value={ratioLeft} onChange={event => setRatio(event.target.value, ratioRight)}>{FIELD_OPTIONS.map(option => <option key={option.field} value={option.field}>{option.field}</option>)}</select></label>
        <span>÷</span>
        <label>分母字段<select value={ratioRight} onChange={event => setRatio(ratioLeft, event.target.value)}>{FIELD_OPTIONS.map(option => <option key={option.field} value={option.field}>{option.field}</option>)}</select></label>
        <strong>× 100%</strong>
      </div> : null}
      {mode === "metric" ? <label>已发布口径<select value={value?.metricCode || ""} onChange={event => onChange({ type: "metric", metricCode: event.target.value })}><option value="">请选择</option>{publishedDefinitions.map(definition => <option key={definition.metricCode} value={definition.metricCode}>{definition.name} · {definition.metricCode}</option>)}</select></label> : null}
      <div className="formula-preview-line"><span>服务端执行结构</span><code>{mode === "aggregate" ? "SUM(field)" : mode === "percentage" ? "SUM(numerator) / SUM(denominator) × 100" : "METRIC(metricCode)"}</code></div>
    </fieldset>
  );
}
