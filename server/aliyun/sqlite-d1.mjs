import { Worker } from "node:worker_threads";

class D1PreparedStatement {
  constructor(database, sql, params = []) {
    this.database = database;
    this.sql = String(sql || "");
    this.params = params;
  }

  bind(...values) {
    return new D1PreparedStatement(this.database, this.sql, values);
  }

  async first(column) {
    const result = await this.database._statement(this);
    const row = result.results[0] ?? null;
    if (column === undefined || row === null) return row;
    return row[column] ?? null;
  }

  all() {
    return this.database._statement(this);
  }

  run() {
    return this.database._statement(this);
  }
}

class D1Database {
  constructor({ file, workerUrl = new URL("./sqlite-worker.mjs", import.meta.url) }) {
    this.nextId = 1;
    this.pending = new Map();
    this.closed = false;
    this.worker = new Worker(workerUrl, { workerData: { file } });
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.worker.on("message", message => this._message(message));
    this.worker.on("error", error => this._fail(error));
    this.worker.on("exit", code => {
      if (!this.closed && code !== 0) this._fail(new Error(`SQLite worker exited with code ${code}.`));
    });
  }

  _message(message) {
    if (message?.ready) {
      this.resolveReady();
      return;
    }
    const pending = this.pending.get(message?.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) {
      const error = new Error(message.error.message);
      error.code = message.error.code;
      pending.reject(error);
      return;
    }
    pending.resolve(message.result);
  }

  _fail(error) {
    this.rejectReady(error);
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  async _call(operation, payload = {}) {
    if (this.closed) throw new Error("SQLite database is closed.");
    await this.ready;
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, operation, payload });
    });
  }

  _statement(statement) {
    return this._call("statement", { sql: statement.sql, params: statement.params });
  }

  prepare(sql) {
    return new D1PreparedStatement(this, sql);
  }

  batch(statements) {
    return this._call("batch", {
      statements: statements.map(statement => ({ sql: statement.sql, params: statement.params }))
    });
  }

  exec(sql) {
    return this._call("exec", { sql });
  }

  async close() {
    if (this.closed) return;
    await this._call("close");
    this.closed = true;
    await this.worker.terminate();
  }
}

export function createD1Database(options) {
  return new D1Database(options);
}
