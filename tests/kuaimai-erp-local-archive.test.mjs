import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  appendManifestEvent,
  archiveSourceFile,
  ensureArchiveLayout,
  inspectFileStability,
  loadLocalManifest
} from "../scripts/kuaimai-erp-collector/archive.mjs";

async function tempRoot() {
  return mkdtemp(path.join(os.tmpdir(), "kuaimai-archive-"));
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

test("archive layout is private and contains all governed folders", async () => {
  const root = await tempRoot();
  const layout = await ensureArchiveLayout(root);
  assert.deepEqual(Object.keys(layout).sort(), ["archive", "failed", "manifest", "processed", "reports", "root", "waiting"].sort());
  for (const directory of [layout.root, layout.waiting, layout.archive, layout.processed, layout.failed, layout.reports]) {
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
  }
});

test("archive clone preserves source bytes and deduplicates by content hash", async () => {
  const root = await tempRoot();
  const source = path.join(root, "快麦交易订单.xlsx");
  const bytes = Buffer.from("official-kuaimai-export\nrow-1\n", "utf8");
  await writeFile(source, bytes);
  const before = await stat(source);

  const first = await archiveSourceFile(source, {
    root: path.join(root, "公司数据中心", "快麦ERP"),
    resourceType: "orders",
    archivedAt: "2026-07-22T10:00:00.000Z"
  });
  const second = await archiveSourceFile(source, {
    root: path.join(root, "公司数据中心", "快麦ERP"),
    resourceType: "orders",
    archivedAt: "2026-07-22T10:00:01.000Z"
  });

  assert.equal(first.contentHash, sha256(bytes));
  assert.equal(second.contentHash, first.contentHash);
  assert.equal(second.deduplicated, true);
  assert.equal(first.relativePath, second.relativePath);
  assert.deepEqual(await readFile(source), bytes);
  assert.equal((await stat(source)).ino, before.ino);
  assert.deepEqual(await readFile(first.absolutePath), bytes);
  assert.equal(first.relativePath.includes(root), false);
});

test("stability gate waits until size and modification time match twice", async () => {
  const root = await tempRoot();
  const source = path.join(root, "orders.csv");
  await writeFile(source, "订单号,创建时间\n1,2026-07-22 10:00:00\n");
  const first = await inspectFileStability(source);
  assert.equal(first.stable, false);
  const second = await inspectFileStability(source, first.signature);
  assert.equal(second.stable, true);
  await writeFile(source, "订单号,创建时间\n1,2026-07-22 10:00:00\n2,2026-07-22 10:01:00\n");
  const changed = await inspectFileStability(source, second.signature);
  assert.equal(changed.stable, false);
});

test("manifest appends recoverable events without absolute source paths", async () => {
  const root = await tempRoot();
  const layout = await ensureArchiveLayout(root);
  await appendManifestEvent(layout.manifest, {
    contentHash: "a".repeat(64),
    fileName: "orders.csv",
    relativePath: "原始归档/orders/2026-07/aaa__orders.csv",
    resourceType: "orders",
    status: "archived",
    archivedAt: "2026-07-22T10:00:00.000Z"
  });
  await appendManifestEvent(layout.manifest, {
    contentHash: "a".repeat(64),
    status: "processed",
    batchId: "batch-1",
    processedAt: "2026-07-22T10:02:00.000Z"
  });
  const state = await loadLocalManifest(layout.manifest);
  assert.equal(state.size, 1);
  assert.equal(state.get("a".repeat(64)).status, "processed");
  assert.equal(state.get("a".repeat(64)).batchId, "batch-1");
  assert.equal(JSON.stringify([...state.values()]).includes(root), false);
});

