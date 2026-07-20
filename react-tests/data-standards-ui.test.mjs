import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CORE_DATA_STANDARDS, FACT_FIELD_REGISTRY } from "../src/domain/dataStandards.js";

const workspace = readFileSync(new URL("../src/features/data-center/data-standards/DataStandardsWorkspace.jsx", import.meta.url), "utf8");
const editor = readFileSync(new URL("../src/features/data-center/data-standards/DataStandardEditorDialog.jsx", import.meta.url), "utf8");
const builder = readFileSync(new URL("../src/features/data-center/data-standards/FormulaBuilder.jsx", import.meta.url), "utf8");
const detail = readFileSync(new URL("../src/features/data-center/data-standards/DataStandardDetailDialog.jsx", import.meta.url), "utf8");
const recalculation = readFileSync(new URL("../src/features/data-center/data-standards/DataStandardRecalculationDialog.jsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/features/data-center/DataCenterAppPage.jsx", import.meta.url), "utf8");
const governance = readFileSync(new URL("../src/features/data-center/DataGovernanceWorkspaces.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("data standards workspace governs the complete 11-metric catalog", () => {
  assert.equal(CORE_DATA_STANDARDS.length, 11);
  assert.match(page, /metrics: \["数据口径"/);
  assert.match(workspace, /销售经营口径/);
  assert.match(workspace, /货流与资金口径/);
  assert.match(workspace, /placeholder="搜索名称或 metricCode"/);
  assert.match(workspace, /category/);
  assert.match(workspace, /status/);
  assert.match(workspace, /新增口径/);
  assert.match(workspace, /data_not_covered|DATA_NOT_COVERED/);
  assert.doesNotMatch(governance, /function MetricDefinitionsWorkspace/);
});

test("editor is a five-step structured flow with preview and no arbitrary code input", () => {
  for (const label of ["基本信息", "数据范围", "公式", "样本预览", "发布确认"]) assert.match(editor, new RegExp(label));
  assert.match(editor, /saving/);
  assert.match(editor, /DATA_STANDARD_VERSION_CONFLICT/);
  assert.match(editor, /details\?\.fields/);
  assert.match(editor, /window\.confirm/);
  assert.match(editor, /initialFocusRef/);
  assert.match(builder, /FACT_FIELD_REGISTRY/);
  assert.match(builder, /publishedDefinitions/);
  assert.match(builder, /aggregate/);
  assert.match(builder, /arithmetic/);
  assert.equal(Object.keys(FACT_FIELD_REGISTRY).length, 5);
  assert.doesNotMatch(builder, /<textarea|eval\(|new Function/);
});

test("detail and recalculation expose history impact range and governed permissions", () => {
  assert.match(detail, /版本历史/);
  assert.match(detail, /依赖口径/);
  assert.match(detail, /归档影响/);
  assert.match(detail, /canManageDefinition/);
  assert.match(recalculation, /开始日期/);
  assert.match(recalculation, /结束日期/);
  assert.match(recalculation, /目标版本/);
  assert.match(recalculation, /影响周期/);
  assert.match(recalculation, /saving/);
});

test("responsive standards UI uses cards on narrow screens and full-screen dialogs at 390px", () => {
  assert.match(styles, /\.data-standard-mobile-list/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.data-standard-table/);
  assert.match(styles, /@media \(max-width: 390px\)[\s\S]*\.data-standard-dialog/);
  assert.match(styles, /height: 100dvh/);
  assert.match(styles, /focus-visible/);
});
