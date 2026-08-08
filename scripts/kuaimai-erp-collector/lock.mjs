import { randomUUID } from "node:crypto";
import { open, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { ensureArchiveLayout } from "./archive.mjs";

function defaultProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}

function busyResult(onBusy) {
  if (onBusy === "throw") {
    throw Object.assign(new Error("另一采集进程正在处理快麦归档。"), {
      code: "KUAIMAI_COLLECTOR_BUSY",
      retryable: true
    });
  }
  return { status: "already_running" };
}

function sqliteBusy(error) {
  return /locked|busy/i.test(String(error?.message || ""));
}

function openLockDatabase(databasePath) {
  const database = new DatabaseSync(databasePath);
  try {
    database.exec(`PRAGMA busy_timeout = 1000;
      CREATE TABLE IF NOT EXISTS collector_lock_owner (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        owner_id TEXT NOT NULL,
        owner_pid INTEGER NOT NULL,
        acquired_at TEXT NOT NULL
      );
      PRAGMA busy_timeout = 0;`);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

async function readLegacyOwner(lockPath) {
  try {
    let owner = null;
    try {
      owner = JSON.parse(await readFile(lockPath, "utf8"));
    } catch {
      // An ownerless legacy lock stays fail-closed because age cannot prove its process exited.
    }
    return { owner };
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function legacyLockIsStale(snapshot, { processAlive }) {
  if (Number.isInteger(snapshot?.owner?.pid) && snapshot.owner.pid > 0) {
    return !processAlive(snapshot.owner.pid);
  }
  return false;
}

async function acquireLegacySentinel(lockPath, owner, options) {
  const existing = await readLegacyOwner(lockPath);
  if (existing) {
    if (!legacyLockIsStale(existing, options)) return null;
    await rm(lockPath, { force: true });
  }
  let handle;
  try {
    handle = await open(lockPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(owner)}\n`);
    return handle;
  } catch (error) {
    await handle?.close().catch(() => {});
    if (handle) await rm(lockPath, { force: true });
    if (error?.code === "EEXIST") return null;
    throw error;
  }
}

export async function withCollectorLock(root, operation, {
  onBusy = "return",
  now = () => new Date(),
  processAlive = defaultProcessAlive,
  pid = process.pid,
  ownerId = randomUUID()
} = {}) {
  if (typeof operation !== "function") throw new TypeError("快麦归档操作无效。");
  const layout = await ensureArchiveLayout(root);
  const lockPath = resolve(layout.root, ".collector.lock");
  const databasePath = resolve(layout.root, ".collector-lock.sqlite");
  const owner = {
    version: 2,
    ownerId,
    pid,
    createdAt: now().toISOString()
  };
  let database;
  try {
    database = openLockDatabase(databasePath);
    database.exec("BEGIN IMMEDIATE");
  } catch (error) {
    database?.close();
    if (sqliteBusy(error)) return busyResult(onBusy);
    throw error;
  }

  let sentinel;
  try {
    sentinel = await acquireLegacySentinel(lockPath, owner, { now, processAlive });
    if (!sentinel) {
      database.exec("ROLLBACK");
      return busyResult(onBusy);
    }
    database.prepare(`INSERT INTO collector_lock_owner (singleton, owner_id, owner_pid, acquired_at)
      VALUES (1, ?, ?, ?)
      ON CONFLICT(singleton) DO UPDATE SET
        owner_id = excluded.owner_id,
        owner_pid = excluded.owner_pid,
        acquired_at = excluded.acquired_at`).run(ownerId, pid, owner.createdAt);
    const result = await operation();
    database.prepare("DELETE FROM collector_lock_owner WHERE singleton = 1 AND owner_id = ?").run(ownerId);
    database.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // A failed or already-closed transaction has no further state to roll back.
    }
    throw error;
  } finally {
    await sentinel?.close().catch(() => {});
    if (sentinel) await rm(lockPath, { force: true });
    database.close();
  }
}
