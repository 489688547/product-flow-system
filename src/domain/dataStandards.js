const METRIC_CODE_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
const UNIT_VALUES = new Set(["CNY", "COUNT", "DAY", "PERCENT", "PERCENT_SCALE", "RATIO"]);
const PERIOD_VALUES = new Set(["day", "month"]);
const CATEGORY_VALUES = new Set(["sales", "goods_flow"]);
const AGGREGATE_OPERATIONS = new Set(["sum", "average", "weighted_average", "count", "count_distinct"]);
const ARITHMETIC_OPERATIONS = new Set(["add", "subtract", "multiply", "divide"]);
const DATE_OPERATIONS = new Set(["difference", "days_in_period", "valid_days"]);
const FILTER_OPERATIONS = new Set(["equals", "contains", "in", "not_in", "between", "is_null", "not_null"]);
const SERVER_CONTROLLED_DRAFT_FIELDS = new Set(["actor", "createdBy", "createdAt", "updatedBy", "updatedAt", "publishedAt", "archivedAt", "archivedBy", "audit"]);

export const DATA_STANDARD_OWNER_DEPARTMENTS = Object.freeze(["运营部", "财务部", "供应链部"]);

export const FACT_FIELD_REGISTRY = Object.freeze({
  "sales.net_sales": Object.freeze({ source: "product_sales_daily", column: "net_sales", unit: "CNY" }),
  "sales.gross_profit": Object.freeze({ source: "product_sales_daily", column: "gross_profit", unit: "CNY" }),
  "sales.quantity": Object.freeze({ source: "product_sales_daily", column: "qty", unit: "COUNT" }),
  "sales.refund": Object.freeze({ source: "product_sales_daily", column: "refund", unit: "CNY" }),
  "sales.gross_sales": Object.freeze({ source: "product_sales_daily", column: "sales", unit: "CNY" })
});

function sum(field) {
  return { type: "aggregate", operation: "sum", input: { type: "field", field }, filters: [] };
}

function percentage(numerator, denominator) {
  return {
    type: "arithmetic",
    operation: "multiply",
    left: { type: "arithmetic", operation: "divide", left: sum(numerator), right: sum(denominator), onZero: "null" },
    right: { type: "constant", value: 100, unit: "PERCENT_SCALE" }
  };
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freeze(nested);
  return Object.freeze(value);
}

const CORE_STANDARD_DEFINITIONS = [
  {
    id: "sales-net-sales", metricCode: "sales.net_sales", name: "净销售额", category: "sales", ownerDepartment: "财务部",
    unit: "CNY", period: "day", version: 1, status: "active", timeBasis: "create_time", timezone: "Asia/Shanghai", excludeOther: true,
    displayFormula: "净销售额按订单创建日汇总", formulaAst: sum("sales.net_sales"), executable: true, coverageStatus: "COMPLETE"
  },
  {
    id: "sales-gross-profit", metricCode: "sales.gross_profit", name: "毛利", category: "sales", ownerDepartment: "财务部",
    unit: "CNY", period: "day", version: 1, status: "active", timeBasis: "create_time", timezone: "Asia/Shanghai", excludeOther: true,
    displayFormula: "毛利按订单创建日汇总", formulaAst: sum("sales.gross_profit"), executable: true, coverageStatus: "COMPLETE"
  },
  {
    id: "sales-quantity", metricCode: "sales.quantity", name: "销量", category: "sales", ownerDepartment: "运营部",
    unit: "COUNT", period: "day", version: 1, status: "active", timeBasis: "create_time", timezone: "Asia/Shanghai", excludeOther: true,
    displayFormula: "有效订单商品数量求和", formulaAst: sum("sales.quantity"), executable: true, coverageStatus: "COMPLETE"
  },
  {
    id: "sales-refund-rate", metricCode: "sales.refund_rate", name: "退款率", category: "sales", ownerDepartment: "财务部",
    unit: "PERCENT", period: "day", version: 1, status: "active", timeBasis: "create_time", timezone: "Asia/Shanghai", excludeOther: true,
    displayFormula: "退款金额 ÷ 销售额 × 100%", formulaAst: percentage("sales.refund", "sales.gross_sales"), executable: true, coverageStatus: "COMPLETE"
  },
  {
    id: "sales-gross-margin-rate", metricCode: "sales.gross_margin_rate", name: "毛利率", category: "sales", ownerDepartment: "财务部",
    unit: "PERCENT", period: "day", version: 1, status: "active", timeBasis: "create_time", timezone: "Asia/Shanghai", excludeOther: true,
    displayFormula: "毛利 ÷ 净销售额 × 100%", formulaAst: percentage("sales.gross_profit", "sales.net_sales"), executable: true, coverageStatus: "COMPLETE"
  },
  {
    id: "goods-flow-inventory-cash", metricCode: "goods_flow.inventory_cash", name: "库存资金", category: "goods_flow", ownerDepartment: "财务部",
    unit: "CNY", period: "day", version: 1, status: "active", displayFormula: "已分摊采购实付 − 累计销售成本 ± 已确认盘点损益",
    formulaAst: null, executable: false, coverageStatus: "DATA_NOT_COVERED"
  },
  {
    id: "goods-flow-inventory-turnover-days", metricCode: "goods_flow.inventory_turnover_days", name: "库存周转天数", category: "goods_flow", ownerDepartment: "供应链部",
    unit: "DAY", period: "month", version: 1, status: "active", displayFormula: "月均校准库存成本 ÷ 当月销售成本 × 当月天数",
    formulaAst: null, executable: false, coverageStatus: "DATA_NOT_COVERED"
  },
  {
    id: "goods-flow-receivable-days", metricCode: "goods_flow.receivable_days", name: "应收天数", category: "goods_flow", ownerDepartment: "财务部",
    unit: "DAY", period: "month", version: 1, status: "active", displayFormula: "按各平台净销售额对财务配置的有效账期加权",
    formulaAst: null, executable: false, coverageStatus: "DATA_NOT_COVERED"
  },
  {
    id: "goods-flow-payable-days", metricCode: "goods_flow.payable_days", name: "应付天数", category: "goods_flow", ownerDepartment: "财务部",
    unit: "DAY", period: "month", version: 1, status: "active", displayFormula: "按采购金额加权计算验收入库日至实际付款日",
    formulaAst: null, executable: false, coverageStatus: "DATA_NOT_COVERED"
  },
  {
    id: "goods-flow-ccc-days", metricCode: "goods_flow.ccc_days", name: "现金循环周期 CCC", category: "goods_flow", ownerDepartment: "财务部",
    unit: "DAY", period: "month", version: 1, status: "active", displayFormula: "库存周转天数 + 应收天数 − 应付天数",
    formulaAst: {
      type: "arithmetic", operation: "subtract",
      left: {
        type: "arithmetic", operation: "add",
        left: { type: "metric", metricCode: "goods_flow.inventory_turnover_days" },
        right: { type: "metric", metricCode: "goods_flow.receivable_days" }
      },
      right: { type: "metric", metricCode: "goods_flow.payable_days" }
    },
    executable: false, coverageStatus: "DATA_NOT_COVERED"
  },
  {
    id: "goods-flow-stockout-rate", metricCode: "goods_flow.stockout_rate", name: "断货率", category: "goods_flow", ownerDepartment: "供应链部",
    unit: "PERCENT", period: "month", version: 1, status: "active", displayFormula: "核心 SKU 断货天数 ÷ 核心 SKU 应售天数",
    formulaAst: null, executable: false, coverageStatus: "DATA_NOT_COVERED"
  }
];

export const CORE_DATA_STANDARDS = freeze(CORE_STANDARD_DEFINITIONS);

function result(ok, extra = {}) {
  return { ok, ...extra };
}

function validationFailure(code) {
  return result(false, { code });
}

function hasOnlyKeys(value, keys) {
  return Object.keys(value).every(key => keys.includes(key));
}

function definitionsByMetricCode(context = {}) {
  const supplied = context.definitionsByMetricCode || context.definitions;
  if (supplied instanceof Map) return supplied;
  if (Array.isArray(supplied)) return new Map(supplied.map(definition => [definition.metricCode, definition]));
  if (supplied && typeof supplied === "object") return new Map(Object.entries(supplied));
  return new Map(CORE_DATA_STANDARDS.map(definition => [definition.metricCode, definition]));
}

function fieldRegistry(context = {}) {
  return context.factFieldRegistry || FACT_FIELD_REGISTRY;
}

function validateFilters(filters, context) {
  if (!Array.isArray(filters)) return validationFailure("DATA_STANDARD_INVALID");
  const registry = fieldRegistry(context);
  for (const filter of filters) {
    if (!filter || typeof filter !== "object" || !hasOnlyKeys(filter, ["field", "operation", "value"])
      || typeof filter.field !== "string" || !registry[filter.field]) {
      return validationFailure("DATA_STANDARD_FIELD_UNKNOWN");
    }
    if (!FILTER_OPERATIONS.has(filter.operation)) return validationFailure("DATA_STANDARD_INVALID");
  }
  return result(true);
}

function combineUnits(operation, left, right) {
  if (["add", "subtract"].includes(operation)) {
    return left === right ? result(true, { unit: left }) : validationFailure("DATA_STANDARD_UNIT_MISMATCH");
  }
  if (operation === "divide") {
    if (left === right) return result(true, { unit: "RATIO" });
    return result(true, { unit: `${left}_PER_${right}` });
  }
  if (left === "PERCENT_SCALE" && right === "RATIO" || left === "RATIO" && right === "PERCENT_SCALE") {
    return result(true, { unit: "PERCENT" });
  }
  return result(true, { unit: `${left}_TIMES_${right}` });
}

function validateNode(ast, context) {
  if (!ast || typeof ast !== "object" || Array.isArray(ast)) return validationFailure("DATA_STANDARD_INVALID");
  if (ast.type === "field") {
    if (!hasOnlyKeys(ast, ["type", "field"])) return validationFailure("DATA_STANDARD_INVALID");
    const field = fieldRegistry(context)[ast.field];
    return field ? result(true, { unit: field.unit, executable: true }) : validationFailure("DATA_STANDARD_FIELD_UNKNOWN");
  }
  if (ast.type === "metric") {
    if (!hasOnlyKeys(ast, ["type", "metricCode"])) return validationFailure("DATA_STANDARD_INVALID");
    const definition = definitionsByMetricCode(context).get(ast.metricCode);
    if (!definition) return validationFailure("DATA_STANDARD_INVALID");
    if (definition.status === "archived") return validationFailure("DATA_STANDARD_DEPENDENCY_ARCHIVED");
    return result(true, { unit: definition.unit, executable: definition.executable !== false });
  }
  if (ast.type === "constant") {
    if (!hasOnlyKeys(ast, ["type", "value", "unit"])) return validationFailure("DATA_STANDARD_INVALID");
    if (!Number.isFinite(ast.value) || !UNIT_VALUES.has(ast.unit)) return validationFailure("DATA_STANDARD_INVALID");
    return result(true, { unit: ast.unit, executable: true });
  }
  if (ast.type === "aggregate") {
    if (!hasOnlyKeys(ast, ["type", "operation", "input", "filters", "weight"])) return validationFailure("DATA_STANDARD_INVALID");
    if (!AGGREGATE_OPERATIONS.has(ast.operation)) return validationFailure("DATA_STANDARD_INVALID");
    const input = validateNode(ast.input, context);
    if (!input.ok) return input;
    const filters = validateFilters(ast.filters || [], context);
    if (!filters.ok) return filters;
    return result(true, {
      unit: ["count", "count_distinct"].includes(ast.operation) ? "COUNT" : input.unit,
      executable: input.executable
    });
  }
  if (ast.type === "arithmetic") {
    if (!hasOnlyKeys(ast, ["type", "operation", "left", "right", "onZero"])) return validationFailure("DATA_STANDARD_INVALID");
    if (!ARITHMETIC_OPERATIONS.has(ast.operation)) return validationFailure("DATA_STANDARD_INVALID");
    const left = validateNode(ast.left, context);
    if (!left.ok) return left;
    const right = validateNode(ast.right, context);
    if (!right.ok) return right;
    if (ast.operation === "divide" && ast.onZero !== "null") return validationFailure("DATA_STANDARD_INVALID");
    const combined = combineUnits(ast.operation, left.unit, right.unit);
    return combined.ok ? result(true, { ...combined, executable: left.executable && right.executable }) : combined;
  }
  if (ast.type === "date") {
    if (!hasOnlyKeys(ast, ["type", "operation", "start", "end", "period"])) return validationFailure("DATA_STANDARD_INVALID");
    return DATE_OPERATIONS.has(ast.operation)
      ? result(true, { unit: "DAY", executable: false })
      : validationFailure("DATA_STANDARD_INVALID");
  }
  return validationFailure("DATA_STANDARD_INVALID");
}

export function validateFormulaAst(ast, context = {}) {
  return validateNode(ast, context);
}

export function collectFormulaDependencies(ast) {
  const dependencies = new Set();
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "metric" && typeof node.metricCode === "string") dependencies.add(node.metricCode);
    for (const [key, value] of Object.entries(node)) {
      if (key !== "metricCode" && value && typeof value === "object") {
        if (Array.isArray(value)) value.forEach(visit);
        else visit(value);
      }
    }
  }
  visit(ast);
  return [...dependencies];
}

export function orderMetricDependencies(definitions = []) {
  const byCode = new Map(definitions.map(definition => [definition.metricCode, definition]));
  const visiting = new Set();
  const visited = new Set();
  const ordered = [];
  function visit(metricCode) {
    if (visited.has(metricCode)) return;
    if (visiting.has(metricCode)) {
      const error = new Error("Metric definitions contain a cycle");
      error.code = "DATA_STANDARD_CYCLE";
      throw error;
    }
    visiting.add(metricCode);
    const definition = byCode.get(metricCode);
    for (const dependency of collectFormulaDependencies(definition?.formulaAst)) {
      if (byCode.has(dependency)) visit(dependency);
    }
    visiting.delete(metricCode);
    visited.add(metricCode);
    ordered.push(metricCode);
  }
  for (const definition of definitions) visit(definition.metricCode);
  return ordered;
}

export function resolveEffectiveVersion(versions = [], periodEnd) {
  const target = String(periodEnd || "").slice(0, 10);
  return versions
    .filter(version => String(version?.effectiveFrom || "").slice(0, 10) <= target)
    .sort((left, right) => String(right.effectiveFrom).localeCompare(String(left.effectiveFrom)))[0] || null;
}

export function canManageDataStandard(actor = {}, definition = {}, action = "manage") {
  if (actor.readonly || !["create", "edit", "update", "publish", "archive", "recalculate", "manage"].includes(action)) return false;
  if (actor.executive) return true;
  const departments = Array.isArray(actor.departments) ? actor.departments : [];
  return DATA_STANDARD_OWNER_DEPARTMENTS.includes(definition.ownerDepartment)
    && departments.includes(definition.ownerDepartment);
}

function cleanText(value, maxLength = 240) {
  return String(value || "").trim().slice(0, maxLength);
}

export function normalizeDataStandardDraft(input = {}) {
  const safeInput = Object.fromEntries(Object.entries(input).filter(([key]) => !SERVER_CONTROLLED_DRAFT_FIELDS.has(key)));
  const formulaAst = safeInput.formulaAst && typeof safeInput.formulaAst === "object" ? safeInput.formulaAst : null;
  const metricCode = cleanText(safeInput.metricCode, 120);
  const ownerDepartment = cleanText(safeInput.ownerDepartment, 40);
  const unit = cleanText(safeInput.unit, 40);
  const period = cleanText(safeInput.period, 20);
  const category = cleanText(safeInput.category, 40);
  const sourceFields = Array.isArray(safeInput.sourceFields) ? safeInput.sourceFields.map(field => cleanText(field, 120)).filter(Boolean) : [];
  const sourceFieldValidation = sourceFields.every(field => fieldRegistry(safeInput.validationContext || {})[field])
    ? null
    : validationFailure("DATA_STANDARD_FIELD_UNKNOWN");
  const validation = !METRIC_CODE_PATTERN.test(metricCode)
    || !DATA_STANDARD_OWNER_DEPARTMENTS.includes(ownerDepartment)
    || !UNIT_VALUES.has(unit)
    || !PERIOD_VALUES.has(period)
    || !CATEGORY_VALUES.has(category)
    || !formulaAst
    ? validationFailure("DATA_STANDARD_INVALID")
    : sourceFieldValidation
      ? sourceFieldValidation
    : validateFormulaAst(formulaAst, safeInput.validationContext || {});
  return {
    metricCode,
    name: cleanText(safeInput.name, 120),
    category,
    ownerDepartment,
    unit,
    period,
    effectiveFrom: cleanText(safeInput.effectiveFrom, 10),
    displayFormula: cleanText(safeInput.displayFormula, 1000),
    formulaAst,
    sourceFields,
    expectedVersion: Number.isInteger(Number(safeInput.expectedVersion)) && Number(safeInput.expectedVersion) > 0 ? Number(safeInput.expectedVersion) : undefined,
    dependencies: formulaAst ? collectFormulaDependencies(formulaAst) : [],
    validation
  };
}
