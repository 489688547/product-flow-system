import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { parentPort, workerData } from "node:worker_threads";

if (!parentPort || !workerData?.file) {
  throw new Error("SQLite worker requires a database file.");
}

mkdirSync(dirname(workerData.file), { recursive: true, mode: 0o700 });
const database = new Database(workerData.file);
database.pragma("journal_mode = WAL");
database.pragma("foreign_keys = ON");
database.pragma("busy_timeout = 5000");
database.pragma("synchronous = NORMAL");

function normalizeValue(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return value;
}

function metadata(startedAt, details = {}) {
  return {
    changed_db: Number(details.changes || 0) > 0,
    changes: Number(details.changes || 0),
    duration: performance.now() - startedAt,
    last_row_id: Number(details.lastInsertRowid || 0),
    rows_read: Number(details.rowsRead || 0),
    rows_written: Number(details.changes || 0)
  };
}

function executePrepared({ sql, params = [] }) {
  const startedAt = performance.now();
  const statement = database.prepare(sql);
  const values = params.map(normalizeValue);
  if (statement.reader) {
    const results = statement.all(...values);
    return {
      results,
      success: true,
      meta: metadata(startedAt, { rowsRead: results.length })
    };
  }
  const result = statement.run(...values);
  return {
    results: [],
    success: true,
    meta: metadata(startedAt, result)
  };
}

const executeBatch = database.transaction(statements => statements.map(executePrepared));

function serializeError(error) {
  return {
    message: String(error?.message || error),
    code: String(error?.code || "SQLITE_ERROR")
  };
}

parentPort.on("message", message => {
  const { id, operation, payload } = message || {};
  try {
    let result;
    if (operation === "statement") result = executePrepared(payload);
    else if (operation === "batch") result = executeBatch(payload.statements || []);
    else if (operation === "exec") {
      const startedAt = performance.now();
      database.exec(String(payload.sql || ""));
      result = { count: 1, duration: performance.now() - startedAt };
    } else if (operation === "close") {
      database.close();
      result = true;
    } else {
      throw new Error(`Unsupported SQLite operation: ${operation}`);
    }
    parentPort.postMessage({ id, result });
    if (operation === "close") parentPort.close();
  } catch (error) {
    parentPort.postMessage({ id, error: serializeError(error) });
  }
});

parentPort.postMessage({ ready: true });
