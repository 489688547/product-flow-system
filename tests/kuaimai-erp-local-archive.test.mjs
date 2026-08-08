import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
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
  installLaunchAgent,
  readCollectorToken,
  storeCollectorToken
} from "../scripts/kuaimai-erp-collector/automation.mjs";
import { scanWaitingDirectory } from "../scripts/kuaimai-erp-collector/scanner.mjs";
import { withCollectorLock } from "../scripts/kuaimai-erp-collector/lock.mjs";
import { runCollector } from "../scripts/kuaimai-erp-collector/index.mjs";

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

test("legacy rollback installer rejects every non-ECS formal target before reading secrets", async () => {
  for (const baseUrl of [
    "http://127.0.0.1:8132",
    "https://retired-backend.pages.dev",
    "https://deshan-tiyes.cn/path",
    "https://deshan-tiyes.cn?target=other"
  ]) {
    await assert.rejects(
      runCollector(["install", "--base-url", baseUrl]),
      error => error?.code === "EGO_FORMAL_TARGET_NOT_ALIYUN"
    );
  }
});

test("collector lock reclaims a stale owner whose process no longer exists", async () => {
  const root = await tempRoot();
  const layout = await ensureArchiveLayout(root);
  await writeFile(path.join(layout.root, ".collector.lock"), `${JSON.stringify({
    version: 1,
    ownerId: "old-owner",
    pid: 987654,
    createdAt: "2026-08-08T00:00:00.000Z"
  })}\n`, { mode: 0o600 });
  let calls = 0;

  const result = await withCollectorLock(root, async () => {
    calls += 1;
    return "recovered";
  }, {
    processAlive: () => false,
    now: () => new Date("2026-08-08T07:00:00.000Z")
  });

  assert.equal(result, "recovered");
  assert.equal(calls, 1);
  await assert.rejects(readFile(path.join(layout.root, ".collector.lock")), error => error?.code === "ENOENT");
});

test("multiple processes reclaim one stale collector lock without overlapping", async () => {
  const root = await tempRoot();
  const layout = await ensureArchiveLayout(root);
  await writeFile(path.join(layout.root, ".collector.lock"), `${JSON.stringify({
    version: 1,
    ownerId: "shared-stale-owner",
    pid: 987654,
    createdAt: "2026-08-08T00:00:00.000Z"
  })}\n`, { mode: 0o600 });
  const moduleUrl = pathToFileURL(path.resolve("scripts/kuaimai-erp-collector/lock.mjs")).href;
  const program = `
    import { open, rm } from "node:fs/promises";
    import { join } from "node:path";
    import { withCollectorLock } from ${JSON.stringify(moduleUrl)};
    const root = process.argv[1];
    const result = await withCollectorLock(root, async () => {
      let marker;
      try {
        marker = await open(join(root, ".critical-section"), "wx", 0o600);
      } catch (error) {
        if (error?.code === "EEXIST") return "overlap";
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 75));
      await marker.close();
      await rm(join(root, ".critical-section"), { force: true });
      return "acquired";
    }, { processAlive: () => false });
    process.stdout.write(JSON.stringify(result));
  `;
  const runChild = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", program, root], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", code => code === 0 ? resolve(JSON.parse(stdout)) : reject(new Error(stderr)));
  });

  const results = await Promise.all(Array.from({ length: 8 }, runChild));
  assert.equal(results.filter(result => result === "acquired").length >= 1, true);
  assert.equal(results.includes("overlap"), false);
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

test("retryable upload failures leave the source in waiting for the next scan", async () => {
  const root = await tempRoot();
  const layout = await ensureArchiveLayout(root);
  const source = path.join(layout.waiting, "orders-retry.csv");
  await writeFile(source, "系统订单号,订单创建时间,店铺名称\nKM2,2026-07-22 11:00:00,抖音旗舰店\n");
  await scanWaitingDirectory({ root, upload: async () => {} });
  const retrying = await scanWaitingDirectory({
    root,
    upload: async () => {
      throw Object.assign(new Error("upstream unavailable"), {
        code: "ERP_COLLECTION_UPLOAD_FAILED",
        status: 503
      });
    }
  });

  assert.equal(retrying.retrying, 1);
  assert.deepEqual(await readdir(layout.waiting), ["orders-retry.csv"]);
  assert.deepEqual(await readdir(layout.failed), []);

  const recovered = await scanWaitingDirectory({ root, upload: async () => ({ batchId: "batch-retry" }) });
  assert.equal(recovered.processed, 1);
  assert.deepEqual(await readdir(layout.waiting), []);
});

test("scanner distinguishes kit and combination snapshots from ordinary product files", async () => {
  const root = await tempRoot();
  const layout = await ensureArchiveLayout(root);
  await writeFile(
    path.join(layout.waiting, "快麦导出_套件.csv"),
    "套件主商家编码,套件名称,子商品商家编码,子商品名称,组合比例\nKIT-1,测试套件,SKU-1,单品一,2\n"
  );
  await writeFile(
    path.join(layout.waiting, "快麦导出_组合装.csv"),
    "组合装主商家编码,组合装名称,单品规格商家编码,单品名称,数量\nCOMBO-1,测试组合装,SKU-2,单品二,3\n"
  );
  const uploads = [];
  await scanWaitingDirectory({ root, upload: async value => uploads.push(value) });
  const result = await scanWaitingDirectory({ root, upload: async value => uploads.push(value) });

  assert.equal(result.processed, 2);
  assert.deepEqual(
    uploads.map(value => value.batch.resourceType).sort(),
    ["product_combinations", "product_kits"]
  );
});

test("LaunchAgent installed from a Git worktree records the main repository path", async () => {
  // 之前的常驻任务是从 .worktrees/kuaimai-erp-history 安装的；该 worktree 被删除后
  // node 找不到模块，launchctl 只留下退出码 1，采集静默停摆。写入 plist 的必须是稳定路径。
  const worktreeEntry = "/Company/product-flow-system/.worktrees/kuaimai-erp-history/scripts/kuaimai-erp-collector/index.mjs";
  const written = [];
  const command = async (bin, args) => {
    if (bin === "/usr/bin/git") {
      return {
        stdout: [
          "/Company/product-flow-system/.worktrees/kuaimai-erp-history",
          "/Company/product-flow-system/.git"
        ].join("\n")
      };
    }
    written.push({ bin, args });
    return { stdout: "" };
  };
  const home = await mkdtemp(path.join(os.tmpdir(), "kuaimai-agent-"));
  const result = await installLaunchAgent({
    nodePath: "/usr/local/bin/node",
    collectorPath: worktreeEntry,
    root: "/Users/roger/Desktop/公司数据中心/快麦ERP",
    baseUrl: "https://product-flow-system.pages.dev",
    home,
    command
  });
  const plist = await readFile(result.plistPath, "utf8");
  assert.match(plist, /<string>\/Company\/product-flow-system\/scripts\/kuaimai-erp-collector\/index\.mjs<\/string>/);
  assert.equal(plist.includes(".worktrees"), false, "plist 不得写入临时 worktree 路径");
});

test("LaunchAgent writes a log so a failing background run can be diagnosed", () => {
  const plist = collectorLaunchAgentPlist({
    nodePath: "/usr/local/bin/node",
    collectorPath: "/Company/product-flow-system/scripts/kuaimai-erp-collector/index.mjs",
    root: "/Users/roger/Desktop/公司数据中心/快麦ERP",
    baseUrl: "https://product-flow-system.pages.dev",
    home: "/Users/roger"
  });
  assert.match(plist, /<key>StandardOutPath<\/key>/);
  assert.match(plist, /<key>StandardErrorPath<\/key>/);
  assert.match(plist, /com\.company\.kuaimai-erp-collector\.log/);
  assert.match(plist, /\/Users\/roger\/Library\/Logs\/product-flow\/com\.company\.kuaimai-erp-collector\.log/);
  assert.doesNotMatch(plist, /Desktop\/公司数据中心\/快麦ERP\/处理报告/);
});
