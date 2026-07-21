import { FACT_FIELD_REGISTRY, validateFormulaAst } from "../../../../../src/domain/dataStandards.js";

const OPERATIONAL_EXCLUSIONS = Object.freeze(["", "其它", "其他", "未知", "未知平台"]);

function compilerError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = 400;
  return error;
}

function registeredField(field) {
  if (!Object.hasOwn(FACT_FIELD_REGISTRY, field)) {
    throw compilerError("DATA_STANDARD_FIELD_UNKNOWN", `未知事实字段：${field}`);
  }
  return FACT_FIELD_REGISTRY[field];
}

function compileFilters(filters = []) {
  return filters.map(filter => ({
    column: registeredField(filter.field).column,
    operation: filter.operation,
    value: structuredClone(filter.value)
  }));
}

function compileNode(node) {
  if (node.type === "field") {
    const field = registeredField(node.field);
    return { type: "field", source: field.source, column: field.column, unit: field.unit };
  }
  if (node.type === "constant") return { type: "constant", value: node.value, unit: node.unit };
  if (node.type === "metric") return { type: "metric", metricCode: node.metricCode };
  if (node.type === "aggregate") {
    if (node.operation !== "sum" || node.input?.type !== "field") {
      throw compilerError("DATA_STANDARD_INVALID", "该公式节点尚未开放正式计算。");
    }
    const input = compileNode(node.input);
    return {
      type: "aggregate",
      operation: "sum",
      source: input.source,
      column: input.column,
      unit: input.unit,
      filters: compileFilters(node.filters || []),
      operationalExclusions: [...OPERATIONAL_EXCLUSIONS]
    };
  }
  if (node.type === "arithmetic") {
    return {
      type: "arithmetic",
      operation: node.operation,
      left: compileNode(node.left),
      right: compileNode(node.right),
      ...(node.operation === "divide" ? { onZero: "null" } : {})
    };
  }
  throw compilerError("DATA_STANDARD_INVALID", "公式包含尚未开放的节点。");
}

export function compileDataStandard(version, context = {}) {
  if (!version?.formulaAst || version.executable === false || version.coverageStatus === "DATA_NOT_COVERED") {
    return { type: "uncovered", executable: false, reasonCode: "DATA_NOT_COVERED" };
  }
  const validation = validateFormulaAst(version.formulaAst, context);
  if (!validation.ok) throw compilerError(validation.code || "DATA_STANDARD_INVALID", "数据口径公式无法编译。");
  if (!validation.executable) throw compilerError("DATA_STANDARD_INVALID", "该公式尚未开放正式计算。");
  return compileNode(version.formulaAst);
}

export { OPERATIONAL_EXCLUSIONS };
