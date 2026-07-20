-- Preserve the generic payload table for compatibility reads. Governance writes
-- use the normalized append-only tables below.
ALTER TABLE data_metric_definitions RENAME TO data_metric_definitions_legacy;

CREATE TABLE data_metric_definitions (
  id TEXT PRIMARY KEY,
  metric_code TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  owner_department TEXT NOT NULL,
  unit TEXT NOT NULL,
  period TEXT NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
  archived_at TEXT,
  archived_by TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE data_metric_definition_versions (
  definition_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  owner_department TEXT NOT NULL,
  unit TEXT NOT NULL,
  period TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  display_formula TEXT NOT NULL,
  formula_ast TEXT,
  source_fields TEXT NOT NULL,
  dependencies TEXT NOT NULL,
  executable INTEGER NOT NULL DEFAULT 1,
  coverage_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  PRIMARY KEY (definition_id, version),
  UNIQUE (definition_id, effective_from)
);

CREATE TABLE data_metric_results (
  id TEXT PRIMARY KEY,
  definition_id TEXT NOT NULL,
  definition_version INTEGER NOT NULL,
  metric_code TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  dimensions_json TEXT NOT NULL,
  value REAL,
  unit TEXT NOT NULL,
  coverage_rate REAL,
  confidence TEXT NOT NULL,
  estimated INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  reason TEXT,
  data_cutoff_at TEXT,
  calculation_run_id TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (calculation_run_id, definition_id, definition_version, period_start, period_end, dimensions_json)
);

CREATE TABLE data_metric_calculation_runs (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  definition_ids TEXT NOT NULL,
  range_start TEXT NOT NULL,
  range_end TEXT NOT NULL,
  target_version INTEGER,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  requested_by TEXT NOT NULL,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE data_metric_audit_logs (
  id TEXT PRIMARY KEY,
  definition_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  definition_version INTEGER,
  changed_fields TEXT NOT NULL,
  range_start TEXT,
  range_end TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX data_metric_definitions_filter
  ON data_metric_definitions(category, owner_department, status);
CREATE INDEX data_metric_versions_effective
  ON data_metric_definition_versions(definition_id, effective_from DESC);
CREATE INDEX data_metric_results_current
  ON data_metric_results(metric_code, period_start, period_end, is_current);
CREATE INDEX data_metric_audit_definition
  ON data_metric_audit_logs(definition_id, created_at DESC);

-- Retain the two old data-center definitions as v1, including their visible name
-- and display formula. IDs and executable ASTs use the governed domain contract.
WITH ranked_legacy AS (
  SELECT *, ROW_NUMBER() OVER (
    PARTITION BY json_extract(payload, '$.metricCode')
    ORDER BY updated_at DESC, id ASC
  ) AS legacy_rank
  FROM data_metric_definitions_legacy
  WHERE entity_type = 'metricDefinitions'
    AND json_valid(payload)
    AND json_extract(payload, '$.metricCode') IN ('sales.net_sales', 'sales.gross_profit')
)
INSERT INTO data_metric_definitions (
  id, metric_code, category, name, owner_department, unit, period, current_version,
  status, archived_at, archived_by, created_at, created_by, updated_at, updated_by
)
SELECT
  CASE json_extract(payload, '$.metricCode')
    WHEN 'sales.net_sales' THEN 'sales-net-sales'
    ELSE 'sales-gross-profit'
  END,
  json_extract(payload, '$.metricCode'),
  'sales',
  COALESCE(NULLIF(json_extract(payload, '$.name'), ''),
    CASE json_extract(payload, '$.metricCode') WHEN 'sales.net_sales' THEN '净销售额' ELSE '毛利' END),
  '财务部',
  'CNY',
  'day',
  1,
  'active',
  NULL,
  NULL,
  updated_at,
  COALESCE(NULLIF(updated_by, ''), 'migration-0004'),
  updated_at,
  COALESCE(NULLIF(updated_by, ''), 'migration-0004')
FROM ranked_legacy
WHERE legacy_rank = 1
ON CONFLICT(metric_code) DO NOTHING;

-- Fixed built-ins also make a fresh database deterministic. Existing migrated
-- net-sales/gross-profit rows win on metric_code; the other nine always use the
-- immutable IDs from CORE_DATA_STANDARDS.
WITH definitions(
  id, metric_code, category, name, owner_department, unit, period
) AS (
  VALUES
    ('sales-net-sales', 'sales.net_sales', 'sales', '净销售额', '财务部', 'CNY', 'day'),
    ('sales-gross-profit', 'sales.gross_profit', 'sales', '毛利', '财务部', 'CNY', 'day'),
    ('sales-quantity', 'sales.quantity', 'sales', '销量', '运营部', 'COUNT', 'day'),
    ('sales-refund-rate', 'sales.refund_rate', 'sales', '退款率', '财务部', 'PERCENT', 'day'),
    ('sales-gross-margin-rate', 'sales.gross_margin_rate', 'sales', '毛利率', '财务部', 'PERCENT', 'day'),
    ('goods-flow-inventory-cash', 'goods_flow.inventory_cash', 'goods_flow', '库存资金', '财务部', 'CNY', 'day'),
    ('goods-flow-inventory-turnover-days', 'goods_flow.inventory_turnover_days', 'goods_flow', '库存周转天数', '供应链部', 'DAY', 'month'),
    ('goods-flow-receivable-days', 'goods_flow.receivable_days', 'goods_flow', '应收天数', '财务部', 'DAY', 'month'),
    ('goods-flow-payable-days', 'goods_flow.payable_days', 'goods_flow', '应付天数', '财务部', 'DAY', 'month'),
    ('goods-flow-ccc-days', 'goods_flow.ccc_days', 'goods_flow', '现金循环周期 CCC', '财务部', 'DAY', 'month'),
    ('goods-flow-stockout-rate', 'goods_flow.stockout_rate', 'goods_flow', '断货率', '供应链部', 'PERCENT', 'month')
)
INSERT OR IGNORE INTO data_metric_definitions (
  id, metric_code, category, name, owner_department, unit, period, current_version,
  status, archived_at, archived_by, created_at, created_by, updated_at, updated_by
)
SELECT id, metric_code, category, name, owner_department, unit, period, 1,
  'active', NULL, NULL, '2026-07-20T00:00:00.000Z', 'migration-0004',
  '2026-07-20T00:00:00.000Z', 'migration-0004'
FROM definitions;

WITH ranked_legacy AS (
  SELECT *, ROW_NUMBER() OVER (
    PARTITION BY json_extract(payload, '$.metricCode')
    ORDER BY updated_at DESC, id ASC
  ) AS legacy_rank
  FROM data_metric_definitions_legacy
  WHERE entity_type = 'metricDefinitions'
    AND json_valid(payload)
    AND json_extract(payload, '$.metricCode') IN ('sales.net_sales', 'sales.gross_profit')
)
INSERT INTO data_metric_definition_versions (
  definition_id, version, name, category, owner_department, unit, period,
  effective_from, display_formula, formula_ast,
  source_fields, dependencies, executable, coverage_status, created_at, created_by
)
SELECT
  definition.id,
  1,
  definition.name,
  definition.category,
  definition.owner_department,
  definition.unit,
  definition.period,
  COALESCE(NULLIF(json_extract(legacy.payload, '$.effectiveFrom'), ''), '2026-07-01'),
  COALESCE(NULLIF(json_extract(legacy.payload, '$.formula'), ''),
    CASE definition.metric_code WHEN 'sales.net_sales' THEN '净销售额按订单创建日汇总' ELSE '毛利按订单创建日汇总' END),
  CASE definition.metric_code
    WHEN 'sales.net_sales' THEN '{"type":"aggregate","operation":"sum","input":{"type":"field","field":"sales.net_sales"},"filters":[]}'
    ELSE '{"type":"aggregate","operation":"sum","input":{"type":"field","field":"sales.gross_profit"},"filters":[]}'
  END,
  CASE definition.metric_code WHEN 'sales.net_sales' THEN '["sales.net_sales"]' ELSE '["sales.gross_profit"]' END,
  '[]',
  1,
  'COMPLETE',
  legacy.updated_at,
  COALESCE(NULLIF(legacy.updated_by, ''), 'migration-0004')
FROM ranked_legacy AS legacy
JOIN data_metric_definitions AS definition
  ON definition.metric_code = json_extract(legacy.payload, '$.metricCode')
WHERE legacy.legacy_rank = 1
ON CONFLICT(definition_id, version) DO NOTHING;

WITH versions(
  metric_code, display_formula, formula_ast, source_fields, dependencies, executable, coverage_status
) AS (
  VALUES
    ('sales.net_sales', '净销售额按订单创建日汇总',
      '{"type":"aggregate","operation":"sum","input":{"type":"field","field":"sales.net_sales"},"filters":[]}',
      '["sales.net_sales"]', '[]', 1, 'COMPLETE'),
    ('sales.gross_profit', '毛利按订单创建日汇总',
      '{"type":"aggregate","operation":"sum","input":{"type":"field","field":"sales.gross_profit"},"filters":[]}',
      '["sales.gross_profit"]', '[]', 1, 'COMPLETE'),
    ('sales.quantity', '有效订单商品数量求和',
      '{"type":"aggregate","operation":"sum","input":{"type":"field","field":"sales.quantity"},"filters":[]}',
      '["sales.quantity"]', '[]', 1, 'COMPLETE'),
    ('sales.refund_rate', '退款金额 ÷ 销售额 × 100%',
      '{"type":"arithmetic","operation":"multiply","left":{"type":"arithmetic","operation":"divide","left":{"type":"aggregate","operation":"sum","input":{"type":"field","field":"sales.refund"},"filters":[]},"right":{"type":"aggregate","operation":"sum","input":{"type":"field","field":"sales.gross_sales"},"filters":[]},"onZero":"null"},"right":{"type":"constant","value":100,"unit":"PERCENT_SCALE"}}',
      '["sales.refund","sales.gross_sales"]', '[]', 1, 'COMPLETE'),
    ('sales.gross_margin_rate', '毛利 ÷ 净销售额 × 100%',
      '{"type":"arithmetic","operation":"multiply","left":{"type":"arithmetic","operation":"divide","left":{"type":"aggregate","operation":"sum","input":{"type":"field","field":"sales.gross_profit"},"filters":[]},"right":{"type":"aggregate","operation":"sum","input":{"type":"field","field":"sales.net_sales"},"filters":[]},"onZero":"null"},"right":{"type":"constant","value":100,"unit":"PERCENT_SCALE"}}',
      '["sales.gross_profit","sales.net_sales"]', '[]', 1, 'COMPLETE'),
    ('goods_flow.inventory_cash', '已分摊采购实付 − 累计销售成本 ± 已确认盘点损益', NULL, '[]', '[]', 0, 'DATA_NOT_COVERED'),
    ('goods_flow.inventory_turnover_days', '月均校准库存成本 ÷ 当月销售成本 × 当月天数', NULL, '[]', '[]', 0, 'DATA_NOT_COVERED'),
    ('goods_flow.receivable_days', '按各平台净销售额对财务配置的有效账期加权', NULL, '[]', '[]', 0, 'DATA_NOT_COVERED'),
    ('goods_flow.payable_days', '按采购金额加权计算验收入库日至实际付款日', NULL, '[]', '[]', 0, 'DATA_NOT_COVERED'),
    ('goods_flow.ccc_days', '库存周转天数 + 应收天数 − 应付天数',
      '{"type":"arithmetic","operation":"subtract","left":{"type":"arithmetic","operation":"add","left":{"type":"metric","metricCode":"goods_flow.inventory_turnover_days"},"right":{"type":"metric","metricCode":"goods_flow.receivable_days"}},"right":{"type":"metric","metricCode":"goods_flow.payable_days"}}',
      '[]', '["goods_flow.inventory_turnover_days","goods_flow.receivable_days","goods_flow.payable_days"]', 0, 'DATA_NOT_COVERED'),
    ('goods_flow.stockout_rate', '核心 SKU 断货天数 ÷ 核心 SKU 应售天数', NULL, '[]', '[]', 0, 'DATA_NOT_COVERED')
)
INSERT OR IGNORE INTO data_metric_definition_versions (
  definition_id, version, name, category, owner_department, unit, period,
  effective_from, display_formula, formula_ast,
  source_fields, dependencies, executable, coverage_status, created_at, created_by
)
SELECT definition.id, 1, definition.name, definition.category, definition.owner_department,
  definition.unit, definition.period, '2026-07-01', versions.display_formula, versions.formula_ast,
  versions.source_fields, versions.dependencies, versions.executable, versions.coverage_status,
  '2026-07-20T00:00:00.000Z', 'migration-0004'
FROM versions
JOIN data_metric_definitions AS definition ON definition.metric_code = versions.metric_code;
