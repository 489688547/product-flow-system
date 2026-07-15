const DB_NAME = "productFlowSales";
// v2: recover databases that were accidentally created without object stores.
const DB_VERSION = 2;
const ROW_STORE = "daily";
const META_STORE = "meta";
const META_KEY = "sales-meta";

function openLocalDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ROW_STORE)) db.createObjectStore(ROW_STORE, { keyPath: "key" });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("本地销售数据库打开失败。"));
  });
}

function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("本地销售数据读写失败。"));
  });
}

function transactionDone(transaction, message) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error || new Error(message));
    transaction.onerror = () => reject(transaction.error || new Error(message));
  });
}

async function localWriteRows(rows, titles, importRecord) {
  const db = await openLocalDatabase();
  const months = new Set(importRecord.months);
  const dateScope = importRecord.scope === "dates";
  const dates = new Set(rows.map(row => String(row.date)));
  // Read everything first: some webviews auto-close IndexedDB transactions
  // that are held across awaited promises, so writes happen synchronously below.
  const readTransaction = db.transaction([ROW_STORE, META_STORE]);
  const existingKeys = await requestAsPromise(readTransaction.objectStore(ROW_STORE).getAllKeys());
  const currentMeta = (await requestAsPromise(readTransaction.objectStore(META_STORE).get(META_KEY))) || { id: META_KEY, imports: [], titles: {} };
  const staleKeys = existingKeys.filter(key => {
    const keyDate = String(key).split("|")[1] || "";
    return dateScope ? dates.has(keyDate) : months.has(keyDate.slice(0, 7));
  });
  currentMeta.titles = { ...currentMeta.titles, ...titles };
  currentMeta.imports = [
    importRecord,
    ...(currentMeta.imports || []).filter(item => dateScope
      ? item.scope === "months" || !item.months?.some(month => months.has(month))
      : !item.months?.some(month => months.has(month)))
  ].slice(0, 60);
  const transaction = db.transaction([ROW_STORE, META_STORE], "readwrite");
  const rowStore = transaction.objectStore(ROW_STORE);
  staleKeys.forEach(key => rowStore.delete(key));
  rows.forEach(row => rowStore.put({ key: `${row.code}|${row.date}|${row.platform}`, ...row }));
  transaction.objectStore(META_STORE).put(currentMeta);
  await transactionDone(transaction, "本地销售数据保存失败。");
  db.close();
}

async function localReadMeta() {
  const db = await openLocalDatabase();
  const meta = await requestAsPromise(db.transaction(META_STORE).objectStore(META_STORE).get(META_KEY));
  db.close();
  return { synced: false, local: true, imports: meta?.imports || [], titles: meta?.titles || {} };
}

async function localReadRows(codes) {
  const codeSet = new Set(codes);
  const db = await openLocalDatabase();
  const all = await requestAsPromise(db.transaction(ROW_STORE).objectStore(ROW_STORE).getAll());
  db.close();
  return all.filter(row => codeSet.has(row.code)).map(({ key, ...row }) => row).sort((a, b) => a.date.localeCompare(b.date));
}

async function localDeleteMonth(month) {
  const db = await openLocalDatabase();
  const readTransaction = db.transaction([ROW_STORE, META_STORE]);
  const keys = await requestAsPromise(readTransaction.objectStore(ROW_STORE).getAllKeys());
  const meta = (await requestAsPromise(readTransaction.objectStore(META_STORE).get(META_KEY))) || { id: META_KEY, imports: [], titles: {} };
  const staleKeys = keys.filter(key => String(key).split("|")[1]?.slice(0, 7) === month);
  meta.imports = (meta.imports || []).map(item => ({ ...item, months: (item.months || []).filter(value => value !== month) })).filter(item => item.months.length);
  const transaction = db.transaction([ROW_STORE, META_STORE], "readwrite");
  const rowStore = transaction.objectStore(ROW_STORE);
  staleKeys.forEach(key => rowStore.delete(key));
  transaction.objectStore(META_STORE).put(meta);
  await transactionDone(transaction, "本地销售数据删除失败。");
  db.close();
}

async function sharedUnavailable(response) {
  // 501: local server without D1. 404/405: an older local server that predates
  // the /api/sales route. Any other failure without a JSON message (e.g. a pure
  // static file server answering 500 with an empty body) also means "no shared
  // sales backend" — fall back to browser storage instead of erroring.
  if (response.ok) return false;
  if ([501, 404, 405].includes(response.status)) return true;
  const payload = await response.clone().json().catch(() => null);
  return !payload?.message;
}

export async function loadSalesMeta() {
  try {
    const response = await fetch("/api/sales");
    if (await sharedUnavailable(response)) return localReadMeta();
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "销售数据加载失败。");
    return { synced: true, local: false, imports: payload.imports || [], titles: payload.titles || {} };
  } catch (error) {
    if (error?.name === "TypeError") return localReadMeta();
    throw error;
  }
}

export async function saveSalesData({ rows, titles, months, source, importedBy, replaceScope = "months" }) {
  const monthRows = {};
  rows.forEach(row => {
    const month = String(row.date).slice(0, 7);
    monthRows[month] = (monthRows[month] || 0) + 1;
  });
  const importRecord = { id: `import-${Date.now()}`, months, monthRows, rows: rows.length, scope: replaceScope, source: String(source || "").slice(0, 120), importedBy: String(importedBy || "").slice(0, 80), importedAt: new Date().toISOString() };
  try {
    const response = await fetch("/api/sales", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rows, titles, source, importedBy, replaceScope })
    });
    if (await sharedUnavailable(response)) {
      await localWriteRows(rows, titles, importRecord);
      return { synced: false, local: true };
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.synced === false) throw new Error(payload.message || "销售数据保存失败。");
    return { synced: true, local: false };
  } catch (error) {
    if (error?.name === "TypeError") {
      await localWriteRows(rows, titles, importRecord);
      return { synced: false, local: true };
    }
    throw error;
  }
}

export async function fetchSalesForCodes(codes) {
  const cleaned = [...new Set(codes.map(code => String(code || "").trim()).filter(Boolean))];
  if (!cleaned.length) return [];
  try {
    const response = await fetch(`/api/sales?codes=${encodeURIComponent(cleaned.join(","))}`);
    if (await sharedUnavailable(response)) return localReadRows(cleaned);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "销售数据加载失败。");
    return payload.rows || [];
  } catch (error) {
    if (error?.name === "TypeError") return localReadRows(cleaned);
    throw error;
  }
}

export async function deleteSalesMonth(month) {
  try {
    const response = await fetch(`/api/sales?month=${encodeURIComponent(month)}`, { method: "DELETE" });
    if (await sharedUnavailable(response)) {
      await localDeleteMonth(month);
      return { synced: false, local: true };
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.synced === false) throw new Error(payload.message || "销售数据删除失败。");
    return { synced: true, local: false };
  } catch (error) {
    if (error?.name === "TypeError") {
      await localDeleteMonth(month);
      return { synced: false, local: true };
    }
    throw error;
  }
}
