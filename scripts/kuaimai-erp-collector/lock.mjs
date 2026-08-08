import { randomUUID } from "node:crypto";
import { open, readFile, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { ensureArchiveLayout } from "./archive.mjs";

const LEGACY_LOCK_STALE_MS = 30 * 60 * 1_000;

function defaultProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}

async function readLockOwner(lockPath) {
  try {
    return JSON.parse(await readFile(lockPath, "utf8"));
  } catch {
    return null;
  }
}

async function staleLock(lockPath, { now, processAlive }) {
  const owner = await readLockOwner(lockPath);
  if (Number.isInteger(owner?.pid) && owner.pid > 0) {
    return !processAlive(owner.pid);
  }
  try {
    return now().valueOf() - (await stat(lockPath)).mtimeMs > LEGACY_LOCK_STALE_MS;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
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
  let handle = null;
  for (let attempt = 0; attempt < 2 && !handle; attempt += 1) {
    try {
      handle = await open(lockPath, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify({
        version: 1,
        ownerId,
        pid,
        createdAt: now().toISOString()
      })}\n`);
    } catch (error) {
      const createdLock = Boolean(handle);
      await handle?.close().catch(() => {});
      handle = null;
      if (createdLock) await rm(lockPath, { force: true });
      if (error?.code !== "EEXIST") throw error;
      if (attempt === 0 && await staleLock(lockPath, { now, processAlive })) {
        await rm(lockPath, { force: true });
        continue;
      }
    }
  }
  if (!handle) {
    if (onBusy === "throw") {
      throw Object.assign(new Error("另一采集进程正在处理快麦归档。"), {
        code: "KUAIMAI_COLLECTOR_BUSY",
        retryable: true
      });
    }
    return { status: "already_running" };
  }
  try {
    return await operation();
  } finally {
    await handle.close();
    if ((await readLockOwner(lockPath))?.ownerId === ownerId) {
      await rm(lockPath, { force: true });
    }
  }
}
