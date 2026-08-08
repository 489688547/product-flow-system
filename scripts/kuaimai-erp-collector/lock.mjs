import { open, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { ensureArchiveLayout } from "./archive.mjs";

export async function withCollectorLock(root, operation, { onBusy = "return" } = {}) {
  if (typeof operation !== "function") throw new TypeError("快麦归档操作无效。");
  const layout = await ensureArchiveLayout(root);
  const lockPath = resolve(layout.root, ".collector.lock");
  let handle;
  try {
    handle = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
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
    await rm(lockPath, { force: true });
  }
}
