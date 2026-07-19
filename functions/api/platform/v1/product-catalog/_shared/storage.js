import { mergeCatalogRecords, normalizeCatalogPayload } from "../../../../../../src/domain/productCatalog.js";

const BATCH_SIZE = 50;

export function productCatalogDatabase(env = {}) {
  return env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB || null;
}

export async function ensureProductCatalogTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS product_catalog_items (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    source_product_id TEXT,
    merchant_code TEXT,
    name TEXT NOT NULL,
    payload TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    present_in_source INTEGER NOT NULL DEFAULT 1,
    synced_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS product_catalog_skus (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    source TEXT NOT NULL,
    source_sku_id TEXT,
    merchant_sku_code TEXT,
    barcode TEXT,
    payload TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    synced_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS product_catalog_sync_runs (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    payload TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    updated_by TEXT
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS product_catalog_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`).run();
}

async function runBatches(db, statements) {
  for (let index = 0; index < statements.length; index += BATCH_SIZE) {
    await db.batch(statements.slice(index, index + BATCH_SIZE));
  }
}

function metaStatement(db, key, value) {
  return db.prepare(`INSERT INTO product_catalog_meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(key, String(value ?? ""));
}

function itemStatement(db, item, context) {
  const { skus: _skus, ...payload } = item;
  return db.prepare(`INSERT INTO product_catalog_items
    (id, source, source_product_id, merchant_code, name, payload, active, present_in_source, synced_at, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      source = excluded.source,
      source_product_id = excluded.source_product_id,
      merchant_code = excluded.merchant_code,
      name = excluded.name,
      payload = excluded.payload,
      active = excluded.active,
      present_in_source = excluded.present_in_source,
      synced_at = excluded.synced_at,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by`)
    .bind(item.id, item.source, item.sourceProductId, item.merchantCode, item.name, JSON.stringify(payload), item.active ? 1 : 0, item.presentInSource === false ? 0 : 1, context.syncedAt, context.updatedAt, context.actor);
}

function skuStatement(db, sku, context) {
  return db.prepare(`INSERT INTO product_catalog_skus
    (id, item_id, source, source_sku_id, merchant_sku_code, barcode, payload, active, synced_at, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      item_id = excluded.item_id,
      source = excluded.source,
      source_sku_id = excluded.source_sku_id,
      merchant_sku_code = excluded.merchant_sku_code,
      barcode = excluded.barcode,
      payload = excluded.payload,
      active = excluded.active,
      synced_at = excluded.synced_at,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by`)
    .bind(sku.id, sku.productId, sku.source, sku.sourceSkuId, sku.merchantSkuCode, sku.barcode, JSON.stringify(sku), sku.active ? 1 : 0, context.syncedAt, context.updatedAt, context.actor);
}

function runStatement(db, run) {
  return db.prepare(`INSERT INTO product_catalog_sync_runs
    (id, source, mode, status, payload, started_at, completed_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET status = excluded.status, payload = excluded.payload, completed_at = excluded.completed_at`)
    .bind(run.id, run.source, run.mode, run.status, JSON.stringify(run), run.startedAt, run.completedAt, run.updatedBy);
}

export async function writeProductCatalog(db, input, { actor = "", mode = "import", replaceSource = false, fileName = "", pages = 0, errors = [] } = {}) {
  await ensureProductCatalogTables(db);
  const completedAt = new Date().toISOString();
  const incoming = normalizeCatalogPayload({ ...input, syncedAt: input.syncedAt || completedAt });
  const previous = await readProductCatalog(db);
  const previousById = new Map(previous.items.map(item => [item.id, item]));
  const normalized = normalizeCatalogPayload({
    source: incoming.source,
    syncedAt: input.syncedAt || completedAt,
    items: incoming.items.map(item => mergeCatalogRecords(previousById.get(item.id), item))
  });
  const syncedAt = input.syncedAt || completedAt;
  const context = { actor: String(actor).slice(0, 120), syncedAt, updatedAt: completedAt };
  const statements = [];
  for (const item of normalized.items) {
    statements.push(itemStatement(db, { ...item, syncedAt }, context));
    for (const sku of item.skus) statements.push(skuStatement(db, { ...sku, syncedAt }, context));
  }
  await runBatches(db, statements);
  if (replaceSource) {
    await db.prepare("UPDATE product_catalog_items SET present_in_source = 0 WHERE source = ? AND synced_at <> ?")
      .bind(normalized.source, syncedAt).run();
  }
  const run = {
    id: `product-catalog-${mode}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: normalized.source,
    mode,
    status: "success",
    fileName: String(fileName || "").slice(0, 240),
    pages: Number(pages) || 0,
    counts: normalized.counts,
    errorCount: Array.isArray(errors) ? errors.length : 0,
    startedAt: input.startedAt || completedAt,
    completedAt,
    updatedBy: context.actor
  };
  await db.batch([
    runStatement(db, run),
    metaStatement(db, "lastSuccessfulSyncAt", completedAt),
    metaStatement(db, "lastSource", normalized.source),
    metaStatement(db, "lastMode", mode),
    metaStatement(db, "version", "product-catalog-v1")
  ]);
  return { counts: normalized.counts, run, meta: { lastSuccessfulSyncAt: completedAt, lastSource: normalized.source, lastMode: mode, version: "product-catalog-v1" } };
}

export async function replaceProductCatalog(db, input, options = {}) {
  return writeProductCatalog(db, input, { ...options, replaceSource: true });
}

export async function upsertProductCatalog(db, input, options = {}) {
  return writeProductCatalog(db, input, { ...options, replaceSource: false });
}

async function readMeta(db, key) {
  const row = await db.prepare("SELECT value FROM product_catalog_meta WHERE key = ?").bind(key).first();
  return row?.value || "";
}

function parsePayload(row) {
  try {
    return JSON.parse(row?.payload || "{}");
  } catch {
    return null;
  }
}

export async function readProductCatalog(db) {
  await ensureProductCatalogTables(db);
  const [itemRows, skuRows, runRows] = await Promise.all([
    db.prepare("SELECT * FROM product_catalog_items ORDER BY active DESC, name, merchant_code").all(),
    db.prepare("SELECT * FROM product_catalog_skus ORDER BY item_id, merchant_sku_code, barcode").all(),
    db.prepare("SELECT * FROM product_catalog_sync_runs ORDER BY started_at DESC LIMIT 20").all()
  ]);
  const skuByItem = new Map();
  for (const row of skuRows?.results || []) {
    const sku = parsePayload(row);
    if (!sku) continue;
    const list = skuByItem.get(row.item_id) || [];
    list.push(sku);
    skuByItem.set(row.item_id, list);
  }
  const items = [];
  for (const row of itemRows?.results || []) {
    const item = parsePayload(row);
    if (!item) continue;
    items.push({ ...item, presentInSource: Boolean(row.present_in_source), skus: skuByItem.get(row.id) || [] });
  }
  const runs = (runRows?.results || []).map(parsePayload).filter(Boolean);
  const [lastSuccessfulSyncAt, lastSource, lastMode, version] = await Promise.all([
    readMeta(db, "lastSuccessfulSyncAt"),
    readMeta(db, "lastSource"),
    readMeta(db, "lastMode"),
    readMeta(db, "version")
  ]);
  const normalized = normalizeCatalogPayload({ source: "catalog", items });
  return {
    items,
    runs,
    meta: {
      ...normalized.counts,
      lastSuccessfulSyncAt,
      lastSource,
      lastMode,
      version: version || "product-catalog-v1"
    }
  };
}
