import { requestBusinessDatabase } from "../../../_shared/dataEnvironment.js";

function text(value) {
  return String(value ?? "").trim();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseObject(value) {
  if (value && typeof value === "object") return { value, malformed: false };
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return { value: parsed && typeof parsed === "object" ? parsed : {}, malformed: false };
  } catch {
    return { value: {}, malformed: true };
  }
}

function storageError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function resultRows(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

export function goodsFlowDatabase(env = {}, data = {}) {
  return requestBusinessDatabase({ env, data });
}

export async function appendGoodsFlowEvents(db, events = []) {
  const statements = events.filter(Boolean).map(event => db.prepare(`INSERT INTO goods_flow_events
    (id, event_type, sku_id, warehouse_id, supplier_id, purchase_id, occurred_at, source,
      source_reference, source_version, payload, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source, source_reference, source_version) DO NOTHING`).bind(
    event.id,
    event.eventType,
    event.skuId || null,
    event.warehouseId || null,
    event.supplierId || null,
    event.purchaseId || null,
    event.occurredAt,
    event.source,
    event.sourceReference,
    text(event.sourceVersion) || "1",
    JSON.stringify(event.payload || {}),
    event.createdAt,
    event.createdBy || null
  ));
  return statements.length ? db.batch(statements) : [];
}

function projectEvent(row) {
  const payload = parseObject(row.payload);
  return {
    id: row.id,
    eventType: row.event_type,
    skuId: row.sku_id || null,
    warehouseId: row.warehouse_id || null,
    supplierId: row.supplier_id || null,
    purchaseId: row.purchase_id || null,
    occurredAt: row.occurred_at,
    source: row.source,
    sourceReference: row.source_reference,
    sourceVersion: row.source_version,
    payload: payload.value,
    payloadMalformed: payload.malformed,
    createdAt: row.created_at,
    createdBy: row.created_by || ""
  };
}

export async function listGoodsFlowEvents(db) {
  const result = await db.prepare("SELECT * FROM goods_flow_events ORDER BY occurred_at DESC").all();
  return resultRows(result).map(projectEvent);
}

export async function saveInventoryDaily(db, rows = [], now = new Date().toISOString()) {
  const statements = rows.filter(Boolean).map(row => db.prepare(`INSERT INTO goods_flow_inventory_daily
    (id, snapshot_date, product_id, sku_id, sku_code, warehouse_id, erp_quantity, counted_quantity,
      calibrated_quantity, unit_cost, calibrated_inventory_value, sellable_quantity, days_of_supply,
      age_bucket, inventory_cash_tied, stocktake_id, stocktake_status, source_updated_at, confidence,
      created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(snapshot_date, sku_id, warehouse_id) DO UPDATE SET
      product_id = excluded.product_id, sku_code = excluded.sku_code,
      erp_quantity = excluded.erp_quantity, counted_quantity = excluded.counted_quantity,
      calibrated_quantity = excluded.calibrated_quantity, unit_cost = excluded.unit_cost,
      calibrated_inventory_value = excluded.calibrated_inventory_value,
      sellable_quantity = excluded.sellable_quantity, days_of_supply = excluded.days_of_supply,
      age_bucket = excluded.age_bucket, inventory_cash_tied = excluded.inventory_cash_tied,
      stocktake_id = excluded.stocktake_id, stocktake_status = excluded.stocktake_status,
      source_updated_at = excluded.source_updated_at, confidence = excluded.confidence,
      updated_at = excluded.updated_at`).bind(
    row.id, row.date || row.snapshotDate, row.productId || null, row.skuId, row.skuCode || null,
    row.warehouseId, numberOrNull(row.erpQuantity) ?? 0, numberOrNull(row.countedQuantity),
    numberOrNull(row.calibratedQuantity) ?? 0, numberOrNull(row.unitCost) ?? 0,
    numberOrNull(row.calibratedInventoryValue) ?? 0, numberOrNull(row.sellableQuantity),
    numberOrNull(row.daysOfSupply), row.ageBucket || null, numberOrNull(row.inventoryCashTied),
    row.stocktakeId || null, row.stocktakeStatus || "unverified", row.sourceUpdatedAt || null,
    row.confidence || "insufficient", row.createdAt || now, now
  ));
  return statements.length ? db.batch(statements) : [];
}

export async function listInventoryDaily(db, { through } = {}) {
  const statement = through
    ? db.prepare("SELECT * FROM goods_flow_inventory_daily WHERE snapshot_date <= ? ORDER BY snapshot_date DESC").bind(through)
    : db.prepare("SELECT * FROM goods_flow_inventory_daily ORDER BY snapshot_date DESC");
  const result = await statement.all();
  return resultRows(result).map(row => ({
    id: row.id,
    date: row.snapshot_date,
    productId: row.product_id || null,
    skuId: row.sku_id,
    skuCode: row.sku_code || "",
    warehouseId: row.warehouse_id,
    erpQuantity: numberOrNull(row.erp_quantity) ?? 0,
    countedQuantity: numberOrNull(row.counted_quantity),
    calibratedQuantity: numberOrNull(row.calibrated_quantity) ?? 0,
    unitCost: numberOrNull(row.unit_cost) ?? 0,
    calibratedInventoryValue: numberOrNull(row.calibrated_inventory_value) ?? 0,
    sellableQuantity: numberOrNull(row.sellable_quantity),
    daysOfSupply: numberOrNull(row.days_of_supply),
    ageBucket: row.age_bucket || "",
    inventoryCashTied: numberOrNull(row.inventory_cash_tied),
    stocktakeId: row.stocktake_id || null,
    stocktakeStatus: row.stocktake_status,
    sourceUpdatedAt: row.source_updated_at || null,
    confidence: row.confidence
  }));
}

function projectTerm(row) {
  return {
    id: row.id,
    platform: row.platform,
    days: Number(row.days),
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to || null,
    reason: row.reason,
    version: Number(row.version),
    createdAt: row.created_at,
    createdBy: row.created_by
  };
}

export async function listReceivableTerms(db, { platform } = {}) {
  const statement = platform
    ? db.prepare("SELECT * FROM goods_flow_receivable_terms WHERE platform = ? ORDER BY effective_from DESC").bind(platform)
    : db.prepare("SELECT * FROM goods_flow_receivable_terms ORDER BY platform, effective_from DESC");
  const result = await statement.all();
  return resultRows(result).map(projectTerm);
}

function rangesOverlap(left, right) {
  const leftEnd = left.effectiveTo || "9999-12-31";
  const rightEnd = right.effectiveTo || "9999-12-31";
  return left.effectiveFrom <= rightEnd && right.effectiveFrom <= leftEnd;
}

export async function upsertReceivableTerm(db, term, actor, now = new Date().toISOString()) {
  const normalized = {
    ...term,
    platform: text(term?.platform),
    effectiveFrom: text(term?.effectiveFrom).slice(0, 10),
    effectiveTo: text(term?.effectiveTo).slice(0, 10) || null
  };
  if (!normalized.id || !normalized.platform || !normalized.effectiveFrom || !Number.isInteger(Number(normalized.days)) || Number(normalized.days) < 0) {
    throw storageError("GOODS_FLOW_TERM_INVALID", "平台账期字段不完整");
  }
  if (normalized.effectiveTo && normalized.effectiveTo < normalized.effectiveFrom) {
    throw storageError("GOODS_FLOW_TERM_INVALID", "账期结束日期不能早于开始日期");
  }
  const existing = await listReceivableTerms(db, { platform: normalized.platform });
  if (existing.some(row => row.id !== normalized.id && rangesOverlap(row, normalized))) {
    throw storageError("GOODS_FLOW_TERM_OVERLAP", "同一平台的账期生效区间不能重叠", 409);
  }
  await db.prepare(`INSERT INTO goods_flow_receivable_terms
    (id, platform, days, effective_from, effective_to, reason, version, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET platform = excluded.platform, days = excluded.days,
      effective_from = excluded.effective_from, effective_to = excluded.effective_to,
      reason = excluded.reason, version = excluded.version,
      created_at = excluded.created_at, created_by = excluded.created_by`).bind(
    normalized.id, normalized.platform, Number(normalized.days), normalized.effectiveFrom,
    normalized.effectiveTo, text(normalized.reason), Number(normalized.version || 1), now, actor
  ).run();
  return { ...normalized, days: Number(normalized.days), version: Number(normalized.version || 1), createdAt: now, createdBy: actor };
}

export async function saveStocktake(db, stocktake, lines = [], actor = "", now = new Date().toISOString()) {
  const statements = [db.prepare(`INSERT INTO goods_flow_stocktakes
    (id, warehouse_id, counted_at, status, version, source, source_reference, submitted_by,
      difference_confirmed_by, amount_confirmed_by, corrected_from_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET warehouse_id = excluded.warehouse_id,
      counted_at = excluded.counted_at, status = excluded.status, version = excluded.version,
      source = excluded.source, source_reference = excluded.source_reference,
      submitted_by = excluded.submitted_by,
      difference_confirmed_by = excluded.difference_confirmed_by,
      amount_confirmed_by = excluded.amount_confirmed_by,
      corrected_from_id = excluded.corrected_from_id, updated_at = excluded.updated_at`).bind(
    stocktake.id, stocktake.warehouseId, stocktake.countedAt, stocktake.status,
    Number(stocktake.version || 1), stocktake.source, stocktake.sourceReference || null,
    stocktake.submittedBy || actor || null, stocktake.differenceConfirmedBy || null,
    stocktake.amountConfirmedBy || null, stocktake.correctedFromId || null,
    stocktake.createdAt || now, now
  )];
  for (const line of lines) {
    statements.push(db.prepare(`INSERT INTO goods_flow_stocktake_lines
      (stocktake_id, sku_id, warehouse_id, erp_quantity, counted_quantity, quantity_variance,
        unit_cost, amount_variance, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(stocktake_id, sku_id, warehouse_id) DO UPDATE SET
        erp_quantity = excluded.erp_quantity, counted_quantity = excluded.counted_quantity,
        quantity_variance = excluded.quantity_variance, unit_cost = excluded.unit_cost,
        amount_variance = excluded.amount_variance, reason = excluded.reason`).bind(
      stocktake.id, line.skuId, line.warehouseId || stocktake.warehouseId,
      numberOrNull(line.erpQuantity) ?? 0, numberOrNull(line.countedQuantity) ?? 0,
      numberOrNull(line.quantityVariance) ?? ((numberOrNull(line.countedQuantity) ?? 0) - (numberOrNull(line.erpQuantity) ?? 0)),
      numberOrNull(line.unitCost), numberOrNull(line.amountVariance), line.reason || null
    ));
  }
  return db.batch(statements);
}

export async function listStocktakes(db, { id } = {}) {
  const stocktakeResult = await (id
    ? db.prepare("SELECT * FROM goods_flow_stocktakes WHERE id = ?").bind(id)
    : db.prepare("SELECT * FROM goods_flow_stocktakes ORDER BY counted_at DESC")).all();
  const lineResult = await (id
    ? db.prepare("SELECT * FROM goods_flow_stocktake_lines WHERE stocktake_id = ?").bind(id)
    : db.prepare("SELECT * FROM goods_flow_stocktake_lines")).all();
  const linesByStocktake = new Map();
  for (const row of resultRows(lineResult)) {
    const rows = linesByStocktake.get(row.stocktake_id) || [];
    rows.push({
      skuId: row.sku_id,
      warehouseId: row.warehouse_id,
      erpQuantity: numberOrNull(row.erp_quantity) ?? 0,
      countedQuantity: numberOrNull(row.counted_quantity) ?? 0,
      quantityVariance: numberOrNull(row.quantity_variance) ?? 0,
      unitCost: numberOrNull(row.unit_cost),
      amountVariance: numberOrNull(row.amount_variance),
      reason: row.reason || ""
    });
    linesByStocktake.set(row.stocktake_id, rows);
  }
  return resultRows(stocktakeResult).map(row => ({
    id: row.id,
    warehouseId: row.warehouse_id,
    countedAt: row.counted_at,
    status: row.status,
    version: Number(row.version),
    source: row.source,
    sourceReference: row.source_reference || null,
    submittedBy: row.submitted_by || "",
    differenceConfirmedBy: row.difference_confirmed_by || "",
    amountConfirmedBy: row.amount_confirmed_by || "",
    correctedFromId: row.corrected_from_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lines: linesByStocktake.get(row.id) || []
  }));
}

export async function saveGoodsFlowExceptions(db, exceptions = []) {
  const statements = exceptions.filter(Boolean).map(row => db.prepare(`INSERT INTO goods_flow_exceptions
    (id, code, severity, status, owner_department, entity_type, entity_id, source, source_reference,
      message, details, created_at, updated_at, resolved_at, resolved_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET severity = excluded.severity, status = excluded.status,
      owner_department = excluded.owner_department, message = excluded.message,
      details = excluded.details, updated_at = excluded.updated_at,
      resolved_at = excluded.resolved_at, resolved_by = excluded.resolved_by`).bind(
    row.id, row.code, row.severity || "warning", row.status || "open", row.ownerDepartment || null,
    row.entityType || null, row.entityId || null, row.source || null, row.sourceReference || null,
    row.message, JSON.stringify(row.details || {}), row.createdAt, row.updatedAt || row.createdAt,
    row.resolvedAt || null, row.resolvedBy || null
  ));
  return statements.length ? db.batch(statements) : [];
}

export async function listGoodsFlowExceptions(db) {
  const result = await db.prepare("SELECT * FROM goods_flow_exceptions ORDER BY created_at DESC").all();
  return resultRows(result).map(row => {
    const details = parseObject(row.details);
    return {
      id: row.id,
      code: row.code,
      severity: row.severity,
      status: row.status,
      ownerDepartment: row.owner_department || "",
      entityType: row.entity_type || "",
      entityId: row.entity_id || "",
      source: row.source || "",
      sourceReference: row.source_reference || "",
      message: row.message,
      details: details.value,
      detailsMalformed: details.malformed,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      resolvedAt: row.resolved_at || null,
      resolvedBy: row.resolved_by || ""
    };
  });
}

function projectMonthlyMetric(row) {
  const coverage = parseObject(row.coverage);
  return {
    id: row.id,
    month: row.month,
    version: Number(row.version),
    formulaVersion: row.formula_version,
    cccDays: numberOrNull(row.ccc_days),
    inventoryDays: numberOrNull(row.inventory_days),
    receivableDays: numberOrNull(row.receivable_days),
    payableDays: numberOrNull(row.payable_days),
    stockoutRate: numberOrNull(row.stockout_rate),
    inventoryCashTied: numberOrNull(row.inventory_cash_tied),
    coverage: coverage.value,
    coverageMalformed: coverage.malformed,
    confidence: row.confidence,
    status: row.status,
    sourceUpdatedAt: row.source_updated_at || null,
    calculatedAt: row.calculated_at,
    calculatedBy: row.calculated_by || "",
    frozenAt: row.frozen_at || null,
    frozenBy: row.frozen_by || ""
  };
}

export async function saveMonthlyMetrics(db, metrics, actor = "", now = new Date().toISOString()) {
  await db.prepare(`INSERT INTO goods_flow_ccc_monthly
    (id, month, version, formula_version, ccc_days, inventory_days, receivable_days, payable_days,
      stockout_rate, inventory_cash_tied, coverage, confidence, status, source_updated_at,
      calculated_at, calculated_by, frozen_at, frozen_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(month, version) DO NOTHING`).bind(
    metrics.id, metrics.month, Number(metrics.version), metrics.formulaVersion,
    numberOrNull(metrics.cccDays), numberOrNull(metrics.inventoryDays), numberOrNull(metrics.receivableDays),
    numberOrNull(metrics.payableDays), numberOrNull(metrics.stockoutRate), numberOrNull(metrics.inventoryCashTied),
    JSON.stringify(metrics.coverage || {}), metrics.confidence, metrics.status || "draft",
    metrics.sourceUpdatedAt || null, metrics.calculatedAt || now, metrics.calculatedBy || actor || null,
    metrics.frozenAt || (metrics.status === "frozen" ? now : null), metrics.frozenBy || (metrics.status === "frozen" ? actor : null)
  ).run();
  return { ...metrics, calculatedAt: metrics.calculatedAt || now, calculatedBy: metrics.calculatedBy || actor };
}

export async function listMonthlyMetrics(db, { month } = {}) {
  const statement = month
    ? db.prepare("SELECT * FROM goods_flow_ccc_monthly WHERE month = ? ORDER BY version DESC").bind(month)
    : db.prepare("SELECT * FROM goods_flow_ccc_monthly ORDER BY month DESC, version DESC");
  const result = await statement.all();
  return resultRows(result).map(projectMonthlyMetric).sort((left, right) =>
    right.month.localeCompare(left.month) || right.version - left.version);
}

export { storageError as goodsFlowStorageError };
