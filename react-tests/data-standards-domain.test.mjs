import test from "node:test";
import assert from "node:assert/strict";
import {
  CORE_DATA_STANDARDS,
  DATA_STANDARD_OWNER_DEPARTMENTS,
  FACT_FIELD_REGISTRY,
  canManageDataStandard,
  collectFormulaDependencies,
  normalizeDataStandardDraft,
  orderMetricDependencies,
  resolveEffectiveVersion,
  validateFormulaAst
} from "../src/domain/dataStandards.js";

test("core data standards publish the exact first eleven metric codes", () => {
  assert.equal(CORE_DATA_STANDARDS.length, 11);
  assert.deepEqual(new Set(CORE_DATA_STANDARDS.map(definition => definition.metricCode)).size, 11);
  assert.deepEqual(DATA_STANDARD_OWNER_DEPARTMENTS, ["运营部", "财务部", "供应链部"]);
  assert.deepEqual(CORE_DATA_STANDARDS.map(definition => definition.metricCode), [
    "sales.net_sales",
    "sales.gross_profit",
    "sales.quantity",
    "sales.refund_rate",
    "sales.gross_margin_rate",
    "goods_flow.inventory_cash",
    "goods_flow.inventory_turnover_days",
    "goods_flow.receivable_days",
    "goods_flow.payable_days",
    "goods_flow.ccc_days",
    "goods_flow.stockout_rate"
  ]);
  assert.ok(Object.isFrozen(CORE_DATA_STANDARDS));
  assert.ok(CORE_DATA_STANDARDS.every(definition => Object.isFrozen(definition)));
  assert.deepEqual(Object.fromEntries(CORE_DATA_STANDARDS.map(definition => [definition.metricCode, [definition.unit, definition.period, definition.ownerDepartment]])), {
    "sales.net_sales": ["CNY", "day", "财务部"],
    "sales.gross_profit": ["CNY", "day", "财务部"],
    "sales.quantity": ["COUNT", "day", "运营部"],
    "sales.refund_rate": ["PERCENT", "day", "财务部"],
    "sales.gross_margin_rate": ["PERCENT", "day", "财务部"],
    "goods_flow.inventory_cash": ["CNY", "day", "财务部"],
    "goods_flow.inventory_turnover_days": ["DAY", "month", "供应链部"],
    "goods_flow.receivable_days": ["DAY", "month", "财务部"],
    "goods_flow.payable_days": ["DAY", "month", "财务部"],
    "goods_flow.ccc_days": ["DAY", "month", "财务部"],
    "goods_flow.stockout_rate": ["PERCENT", "month", "供应链部"]
  });
});

test("sales standards retain the company sales time basis and supported facts", () => {
  const sales = CORE_DATA_STANDARDS.filter(definition => definition.category === "sales");
  assert.equal(sales.length, 5);
  assert.ok(sales.every(definition => definition.timeBasis === "create_time"));
  assert.ok(sales.every(definition => definition.timezone === "Asia/Shanghai"));
  assert.ok(sales.every(definition => definition.excludeOther === true));
  assert.deepEqual(FACT_FIELD_REGISTRY["sales.net_sales"], {
    source: "product_sales_daily",
    column: "net_sales",
    unit: "CNY"
  });
});

test("goods-flow standards are publishable but explicitly uncovered", () => {
  const goodsFlow = CORE_DATA_STANDARDS.filter(definition => definition.category === "goods_flow");
  assert.equal(goodsFlow.length, 6);
  assert.ok(goodsFlow.every(definition => definition.coverageStatus === "DATA_NOT_COVERED"));
  assert.ok(goodsFlow.every(definition => definition.executable === false));
});

test("formula validation rejects unknown nodes and fields", () => {
  assert.deepEqual(validateFormulaAst({ type: "sql", statement: "select 1" }), {
    ok: false,
    code: "DATA_STANDARD_INVALID"
  });
  assert.deepEqual(validateFormulaAst({ type: "field", field: "sales.unknown" }), {
    ok: false,
    code: "DATA_STANDARD_FIELD_UNKNOWN"
  });
});

test("formula validation rejects incompatible units and division without null zero handling", () => {
  assert.deepEqual(validateFormulaAst({
    type: "arithmetic",
    operation: "add",
    left: { type: "field", field: "sales.net_sales" },
    right: { type: "field", field: "sales.quantity" }
  }), {
    ok: false,
    code: "DATA_STANDARD_UNIT_MISMATCH"
  });
  assert.deepEqual(validateFormulaAst({
    type: "arithmetic",
    operation: "divide",
    left: { type: "field", field: "sales.refund" },
    right: { type: "field", field: "sales.gross_sales" }
  }), {
    ok: false,
    code: "DATA_STANDARD_INVALID"
  });
});

test("formula dependencies are deduplicated and topologically ordered", () => {
  const formula = {
    type: "arithmetic",
    operation: "add",
    left: { type: "metric", metricCode: "sales.net_sales" },
    right: { type: "metric", metricCode: "sales.net_sales" }
  };
  assert.deepEqual(collectFormulaDependencies(formula), ["sales.net_sales"]);
  assert.deepEqual(orderMetricDependencies([
    { metricCode: "sales.gross_margin_rate", formulaAst: formula },
    { metricCode: "sales.net_sales", formulaAst: { type: "field", field: "sales.net_sales" } }
  ]), ["sales.net_sales", "sales.gross_margin_rate"]);
  assert.throws(() => orderMetricDependencies([
    { metricCode: "one", formulaAst: { type: "metric", metricCode: "two" } },
    { metricCode: "two", formulaAst: { type: "metric", metricCode: "one" } }
  ]), error => error.code === "DATA_STANDARD_CYCLE");
});

test("versions resolve to the latest definition effective on the requested period", () => {
  const versions = [
    { version: 2, effectiveFrom: "2026-07-01" },
    { version: 1, effectiveFrom: "2026-01-01" },
    { version: 3, effectiveFrom: "2026-08-01" }
  ];
  assert.deepEqual(resolveEffectiveVersion(versions, "2026-07-31"), versions[0]);
  assert.equal(resolveEffectiveVersion(versions, "2025-12-31"), null);
});

test("archived metrics cannot be newly referenced and ownership controls management", () => {
  assert.deepEqual(validateFormulaAst({ type: "metric", metricCode: "sales.net_sales" }, {
    definitionsByMetricCode: new Map([["sales.net_sales", { status: "archived" }]])
  }), {
    ok: false,
    code: "DATA_STANDARD_DEPENDENCY_ARCHIVED"
  });
  assert.equal(canManageDataStandard({ departments: ["财务部"] }, { ownerDepartment: "财务部" }, "publish"), true);
  assert.equal(canManageDataStandard({ departments: ["运营部"] }, { ownerDepartment: "财务部" }, "archive"), false);
  assert.equal(canManageDataStandard({ executive: true }, { ownerDepartment: "财务部" }, "archive"), true);
  assert.equal(canManageDataStandard({ executive: true, readonly: true }, { ownerDepartment: "财务部" }, "archive"), false);
});

test("draft normalization strips server-controlled fields and validates its formula", () => {
  const draft = normalizeDataStandardDraft({
    metricCode: "sales.new_metric",
    name: "新指标",
    category: "sales",
    ownerDepartment: "财务部",
    unit: "CNY",
    period: "day",
    effectiveFrom: "2026-07-20",
    formulaAst: { type: "aggregate", operation: "sum", input: { type: "field", field: "sales.net_sales" }, filters: [] },
    createdBy: "spoofed",
    publishedAt: "2026-01-01"
  });
  assert.equal(draft.createdBy, undefined);
  assert.equal(draft.publishedAt, undefined);
  assert.equal(draft.validation.ok, true);
});

test("draft normalization rejects source fields outside the fact registry", () => {
  const draft = normalizeDataStandardDraft({
    metricCode: "sales.new_metric",
    name: "新指标",
    category: "sales",
    ownerDepartment: "财务部",
    unit: "CNY",
    period: "day",
    formulaAst: { type: "aggregate", operation: "sum", input: { type: "field", field: "sales.net_sales" }, filters: [] },
    sourceFields: ["sales.unregistered"]
  });
  assert.deepEqual(draft.validation, { ok: false, code: "DATA_STANDARD_FIELD_UNKNOWN" });
});
