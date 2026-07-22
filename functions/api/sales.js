const META_ID = "sales-meta";
// Cloudflare D1 allows at most 100 bound parameters per statement; 9 rows × 11 columns = 99.
const INSERT_CHUNK = 9;
// Keep each statement below D1's binding limit, but send enough statements per
// batch that a full monthly import finishes before the browser request timeout.
const BATCH_STATEMENTS = 250;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}

function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}

export function salesDatabase(env = {}) {
  return env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB || null;
}

export async function ensureSalesTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS product_sales_daily (
    code TEXT NOT NULL,
    date TEXT NOT NULL,
    platform TEXT NOT NULL,
    qty REAL NOT NULL DEFAULT 0,
    sales REAL NOT NULL DEFAULT 0,
    net_sales REAL NOT NULL DEFAULT 0,
    gross_profit REAL NOT NULL DEFAULT 0,
    refund REAL NOT NULL DEFAULT 0,
    cost REAL NOT NULL DEFAULT 0,
    pre_ship_refund REAL NOT NULL DEFAULT 0,
    post_ship_refund REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (code, date, platform)
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS product_sales_meta (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();
  // Tables created before the pre/post-ship split need the extra columns.
  for (const column of ["pre_ship_refund", "post_ship_refund"]) {
    try {
      await db.prepare(`ALTER TABLE product_sales_daily ADD COLUMN ${column} REAL NOT NULL DEFAULT 0`).run();
    } catch {
      // Column already exists.
    }
  }
}

async function readMeta(db) {
  const row = await db.prepare("SELECT payload FROM product_sales_meta WHERE id = ?").bind(META_ID).first();
  if (!row) return { imports: [], titles: {} };
  try {
    const parsed = JSON.parse(row.payload);
    return { imports: Array.isArray(parsed.imports) ? parsed.imports : [], titles: parsed.titles && typeof parsed.titles === "object" ? parsed.titles : {} };
  } catch {
    return { imports: [], titles: {} };
  }
}

async function writeMeta(db, meta) {
  await db.prepare(`INSERT INTO product_sales_meta (id, payload, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`)
    .bind(META_ID, JSON.stringify(meta), new Date().toISOString())
    .run();
}

function validRow(row) {
  return row && typeof row === "object" && /^69\d{10,12}$/.test(String(row.code || "")) && /^\d{4}-\d{2}-\d{2}$/.test(String(row.date || ""));
}

async function insertRows(db, rows) {
  const statements = [];
  for (let index = 0; index < rows.length; index += INSERT_CHUNK) {
    const chunk = rows.slice(index, index + INSERT_CHUNK);
    const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const values = chunk.flatMap(row => [
      String(row.code), String(row.date), String(row.platform || "未知平台"),
      Number(row.qty) || 0, Number(row.sales) || 0, Number(row.netSales) || 0,
      Number(row.grossProfit) || 0, Number(row.refund) || 0, Number(row.cost) || 0,
      Number(row.preShipRefund) || 0, Number(row.postShipRefund) || 0
    ]);
    statements.push(db.prepare(`INSERT INTO product_sales_daily (code, date, platform, qty, sales, net_sales, gross_profit, refund, cost, pre_ship_refund, post_ship_refund)
      VALUES ${placeholders}
      ON CONFLICT(code, date, platform) DO UPDATE SET
        qty = excluded.qty, sales = excluded.sales, net_sales = excluded.net_sales,
        gross_profit = excluded.gross_profit, refund = excluded.refund, cost = excluded.cost,
        pre_ship_refund = excluded.pre_ship_refund, post_ship_refund = excluded.post_ship_refund`)
      .bind(...values));
  }
  if (typeof db.batch === "function") {
    for (let index = 0; index < statements.length; index += BATCH_STATEMENTS) {
      await db.batch(statements.slice(index, index + BATCH_STATEMENTS));
    }
    return;
  }
  for (const statement of statements) await statement.run();
}

function mapDbRow(row) {
  return {
    code: row.code,
    date: row.date,
    platform: row.platform,
    qty: Number(row.qty) || 0,
    sales: Number(row.sales) || 0,
    netSales: Number(row.net_sales) || 0,
    grossProfit: Number(row.gross_profit) || 0,
    refund: Number(row.refund) || 0,
    cost: Number(row.cost) || 0,
    preShipRefund: Number(row.pre_ship_refund) || 0,
    postShipRefund: Number(row.post_ship_refund) || 0
  };
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return optionsResponse();
  const db = salesDatabase(env);
  if (!db) {
    return jsonResponse({ synced: false, message: "缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB，销售数据只能保存在本机浏览器。" }, 501);
  }
  const url = new URL(request.url);
  try {
    await ensureSalesTables(db);
    if (request.method === "GET") {
      const codesParam = String(url.searchParams.get("codes") || "").trim();
      if (!codesParam) {
        const meta = await readMeta(db);
        return jsonResponse({ synced: true, ...meta });
      }
      const codes = codesParam.split(",").map(code => code.trim()).filter(Boolean).slice(0, 50);
      const placeholders = codes.map(() => "?").join(", ");
      const result = await db.prepare(`SELECT code, date, platform, qty, sales, net_sales, gross_profit, refund, cost, pre_ship_refund, post_ship_refund
        FROM product_sales_daily WHERE code IN (${placeholders}) ORDER BY date`).bind(...codes).all();
      return jsonResponse({ synced: true, rows: (result?.results || []).map(mapDbRow) });
    }
    if (request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const rows = (Array.isArray(body.rows) ? body.rows : []).filter(validRow);
      if (!rows.length) return jsonResponse({ synced: false, message: "没有可保存的销售数据行。" }, 400);
      const monthRows = {};
      rows.forEach(row => {
        const month = String(row.date).slice(0, 7);
        monthRows[month] = (monthRows[month] || 0) + 1;
      });
      const months = Object.keys(monthRows).sort();
      // replaceScope=dates：只覆盖本次数据涉及的具体日期（快麦API按日同步用），
      // 默认按整月覆盖（Excel整月导入用）。
      const dateScope = body.replaceScope === "dates";
      if (dateScope) {
        const dates = [...new Set(rows.map(row => String(row.date)))];
        for (const day of dates) {
          await db.prepare("DELETE FROM product_sales_daily WHERE date = ?").bind(day).run();
        }
      } else {
        for (const month of months) {
          await db.prepare("DELETE FROM product_sales_daily WHERE substr(date, 1, 7) = ?").bind(month).run();
        }
      }
      await insertRows(db, rows);
      const meta = await readMeta(db);
      const importedAt = new Date().toISOString();
      meta.titles = { ...meta.titles, ...(body.titles && typeof body.titles === "object" ? body.titles : {}) };
      meta.imports = [
        { id: `import-${Date.now()}`, months, monthRows, rows: rows.length, scope: dateScope ? "dates" : "months", source: String(body.source || "").slice(0, 120), importedBy: String(body.importedBy || "").slice(0, 80), importedAt },
        ...meta.imports.filter(item => dateScope ? item.scope === "months" || !item.months?.some(month => months.includes(month)) : !item.months?.some(month => months.includes(month)))
      ].slice(0, 60);
      await writeMeta(db, meta);
      return jsonResponse({ synced: true, months, rows: rows.length, importedAt });
    }
    if (request.method === "DELETE") {
      const month = String(url.searchParams.get("month") || "").trim();
      if (!/^\d{4}-\d{2}$/.test(month)) return jsonResponse({ synced: false, message: "缺少要删除的月份参数。" }, 400);
      await db.prepare("DELETE FROM product_sales_daily WHERE substr(date, 1, 7) = ?").bind(month).run();
      const meta = await readMeta(db);
      meta.imports = meta.imports.map(item => ({ ...item, months: (item.months || []).filter(value => value !== month) })).filter(item => item.months.length);
      await writeMeta(db, meta);
      return jsonResponse({ synced: true, month });
    }
    return jsonResponse({ message: "Method not allowed" }, 405);
  } catch (error) {
    return jsonResponse({ synced: false, message: error.message || "销售数据同步失败。" }, error.status || 500);
  }
}
