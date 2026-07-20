import { createHash } from "node:crypto";

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

function numeric(value) {
  const text = String(value ?? "").trim().replace(/[,，￥¥%]/g, "");
  if (!text) return null;
  const unit = text.endsWith("万") ? 10000 : text.endsWith("亿") ? 100000000 : 1;
  const number = Number(text.replace(/[万亿]$/, ""));
  return Number.isFinite(number) ? number * unit : value;
}

function localShanghaiDay(date) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", weekday: "short" }).format(date);
}

export function shouldRunScheduledCollection(now = new Date()) {
  return !["Sat", "Sun"].includes(localShanghaiDay(now));
}

export function classifyCapturedPage(page = {}) {
  const text = `${page.url || ""} ${page.title || ""} ${page.text || ""}`.toLowerCase();
  if (/(?:登录|验证码|安全验证|扫码登录|login|sign in|verify)/i.test(text)) {
    return { status: "login_required", message: "平台登录已失效，请人工完成登录后重试。" };
  }
  if (!page.url || !Array.isArray(page.tables)) {
    return { status: "failed", message: "浏览器页面读取失败。" };
  }
  return { status: "healthy", message: "" };
}

function matchingTable(page, requiredColumns) {
  return (page.tables || []).find(table => requiredColumns.every(column => (table.headers || []).includes(column)));
}

function missingColumns(page, requiredColumns) {
  const available = new Set((page.tables || []).flatMap(table => table.headers || []));
  return requiredColumns.filter(column => !available.has(column));
}

function entityId(task, dimension, name, index) {
  return createHash("sha256").update(`${task.platform}|${task.shopId || ""}|${task.categoryId}|${dimension}|${name}|${index}`).digest("hex").slice(0, 24);
}

export function extractMarketDimension(task, dimension, page, capturedAt = new Date().toISOString()) {
  const pageState = classifyCapturedPage(page);
  if (pageState.status !== "healthy") return { ...pageState, entities: [], snapshot: null };
  const config = task.collectorConfig || {};
  const requiredColumns = config.requiredColumns?.[dimension] || [];
  const fieldMap = config.fieldMap?.[dimension] || {};
  const table = matchingTable(page, requiredColumns);
  if (!table) {
    const missing = missingColumns(page, requiredColumns);
    return {
      status: "schema_changed",
      message: `页面结构已变化，缺少字段：${missing.join("、") || "登记表格"}。`,
      entities: [],
      snapshot: null
    };
  }
  const entities = (table.rows || []).map((row, index) => {
    const values = Object.fromEntries((table.headers || []).map((header, columnIndex) => [header, row[columnIndex] ?? null]));
    const mapped = Object.fromEntries(Object.entries(fieldMap).map(([source, target]) => [target, values[source] ?? null]));
    const name = String(mapped.name || mapped.title || `${dimension}-${index + 1}`);
    const identityFields = new Set(["name", "title", "url", "platformEntityId"]);
    return {
      id: entityId(task, dimension, name, index),
      platform: task.platform,
      shopId: task.shopId || "",
      productId: task.productId || "",
      skuId: task.skuId || "",
      categoryId: task.categoryId,
      dimension,
      ...Object.fromEntries(Object.entries(mapped).filter(([key]) => identityFields.has(key))),
      metrics: Object.fromEntries(Object.entries(mapped).filter(([key]) => !identityFields.has(key)).map(([key, value]) => [key, numeric(value)]))
    };
  });
  const expected = Math.max(1, requiredColumns.length);
  const present = requiredColumns.filter(column => (table.headers || []).includes(column)).length;
  const coverage = Math.min(1, present / expected);
  return {
    status: coverage === 1 ? "healthy" : "partial",
    message: coverage === 1 ? "" : "部分登记字段缺失。",
    entities,
    snapshot: {
      platform: task.platform,
      shopId: task.shopId || "",
      productId: task.productId || "",
      skuId: task.skuId || "",
      categoryId: task.categoryId,
      categoryName: task.categoryName || "",
      dimension,
      capturedAt,
      schemaVersion: task.schemaVersion || "v1",
      coverage,
      qualityStatus: coverage === 1 ? "healthy" : "partial",
      sourceRef: task.pageUrl,
      metrics: { entityCount: entities.length }
    }
  };
}

export async function contentHash(value) {
  return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

export async function buildIngestBatch(task, dimension, extracted, capturedAt = new Date().toISOString()) {
  const content = { snapshot: extracted.snapshot, entities: extracted.entities || [] };
  const hash = await contentHash(content);
  const capturedDay = capturedAt.slice(0, 10);
  const runId = createHash("sha256").update(`${task.id}|${dimension}|${capturedAt}|${hash}`).digest("hex").slice(0, 24);
  const snapshotId = createHash("sha256").update(`${task.id}|${dimension}|${capturedDay}|${hash}`).digest("hex").slice(0, 24);
  return {
    action: ["healthy", "partial"].includes(extracted.status) ? "complete" : "fail",
    idempotencyKey: `${task.platform}:${task.shopId || ""}:${task.categoryId}:${dimension}:${capturedDay}:${task.schemaVersion || "v1"}:${hash}`,
    run: {
      id: runId,
      platform: task.platform,
      shopId: task.shopId || "",
      productId: task.productId || "",
      skuId: task.skuId || "",
      categoryId: task.categoryId,
      dimension,
      status: extracted.status,
      message: extracted.message || "",
      capturedAt,
      schemaVersion: task.schemaVersion || "v1",
      contentHash: hash
    },
    snapshot: extracted.snapshot ? { ...extracted.snapshot, id: snapshotId, contentHash: hash } : null,
    entities: extracted.entities || []
  };
}

export async function collectRegisteredTasks(tasks, { browser, api, now = new Date(), force = false } = {}) {
  if (!force && !shouldRunScheduledCollection(now)) return { skipped: true, reason: "weekend", completed: 0, failed: 0 };
  const capturedAt = now.toISOString();
  let completed = 0;
  let failed = 0;
  for (const task of tasks) {
    if (!task.pageUrl || !/^https:\/\//i.test(task.pageUrl)) {
      failed += 1;
      continue;
    }
    let page;
    try {
      page = await browser.capture(task.pageUrl);
    } catch (error) {
      page = { url: task.pageUrl, title: "", text: "", tables: null, error: error.message };
    }
    for (const dimension of task.dimensions || []) {
      const extracted = extractMarketDimension(task, dimension, page, capturedAt);
      const batch = await buildIngestBatch(task, dimension, extracted, capturedAt);
      try {
        await api.post(batch);
        if (batch.action === "complete") completed += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
  }
  return { skipped: false, completed, failed };
}
