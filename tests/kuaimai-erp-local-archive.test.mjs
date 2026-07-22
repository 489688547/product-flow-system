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
import {
  collectorLaunchAgentPlist,
  readCollectorToken,
  storeCollectorToken
} from "../scripts/kuaimai-erp-collector/automation.mjs";
import { scanWaitingDirectory } from "../scripts/kuaimai-erp-collector/scanner.mjs";

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

test("collector token is exchanged only with macOS Keychain", async () => {
  const calls = [];
  const command = async (program, args, options = {}) => {
    calls.push({ program, args, options });
    return args[0] === "find-generic-password" ? { stdout: "kec_secret\n" } : { stdout: "" };
  };
  await storeCollectorToken("kec_secret", { command, account: "roger" });
  assert.equal(calls[0].program, "/usr/bin/xcrun");
  assert.equal(calls[0].args[0], "swift");
  assert.equal(calls[0].args.includes("kec_secret"), false);
  assert.equal(calls[0].options.input, "kec_secret\n");
  assert.equal(await readCollectorToken({ command, account: "roger" }), "kec_secret");
});

test("LaunchAgent runs every 15 minutes without embedding secrets", () => {
  const plist = collectorLaunchAgentPlist({
    nodePath: "/usr/local/bin/node",
    collectorPath: "/Company/product-flow-system/scripts/kuaimai-erp-collector/index.mjs",
    root: "/Users/roger/Desktop/公司数据中心/快麦ERP",
    baseUrl: "https://product-flow-system.pages.dev"
  });
  assert.match(plist, /<key>StartInterval<\/key>\s*<integer>900<\/integer>/);
  assert.match(plist, /<string>scan<\/string>/);
  assert.doesNotMatch(plist, /kec_|token|password|cookie/i);
});

test("scanner waits for one stable interval before archiving and uploading", async () => {
  const root = await tempRoot();
  const layout = await ensureArchiveLayout(root);
  const source = path.join(layout.waiting, "orders.csv");
  await writeFile(source, "系统订单号,订单创建时间,店铺名称\nKM1,2026-07-22 10:00:00,抖音旗舰店\n");
  const uploads = [];
  const first = await scanWaitingDirectory({ root, upload: async value => uploads.push(value) });
  assert.equal(first.waiting, 1);
  assert.equal(first.processed, 0);
  const second = await scanWaitingDirectory({ root, upload: async value => uploads.push(value) });
  assert.equal(second.processed, 1);
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].archive.relativePath.startsWith("原始归档/orders/"), true);
  assert.equal((await loadLocalManifest(layout.manifest)).values().next().value.status, "processed");
});
