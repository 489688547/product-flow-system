#!/usr/bin/env node
import { open, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { uploadErpArchive, uploadErpCollection } from "./api.mjs";
import { DEFAULT_ARCHIVE_ROOT, ensureArchiveLayout } from "./archive.mjs";
import { installLaunchAgent, readCollectorToken, storeCollectorToken } from "./automation.mjs";
import { readKuaimaiExport } from "./core.mjs";
import { archiveExistingFile, archiveExistingRawFile, scanWaitingDirectory, syncLocalArchiveManifest } from "./scanner.mjs";

function argument(argv, name, fallback = "") {
  const index = argv.indexOf(name);
  return index >= 0 ? String(argv[index + 1] || fallback) : fallback;
}

async function withCollectorLock(root, callback) {
  const layout = await ensureArchiveLayout(root);
  const lockPath = resolve(layout.root, ".collector.lock");
  let handle;
  try {
    handle = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if (error?.code === "EEXIST") return { status: "already_running" };
    throw error;
  }
  try {
    return await callback();
  } finally {
    await handle.close();
    await rm(lockPath, { force: true });
  }
}

async function runnerHeaders() {
  const token = await readCollectorToken();
  return { authorization: `Bearer ${token}` };
}

async function registerCollector(baseUrl, fetchImpl = fetch) {
  const personalToken = String(process.env.PRODUCTION_DATA_ACCESS_TOKEN || "").trim();
  const response = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/api/platform/v1/erp-collection/runners`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(personalToken ? { authorization: `Bearer ${personalToken}` } : {}) },
    body: JSON.stringify({ name: "公司 Mac 快麦采集器" })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.data?.token) {
    const error = new Error(payload?.error?.message || `采集器登记失败（HTTP ${response.status}）。`);
    error.code = payload?.error?.code || "KUAIMAI_COLLECTOR_REGISTER_FAILED";
    throw error;
  }
  await storeCollectorToken(payload.data.token);
  return { registered: true, id: payload.data.id, scope: payload.data.scope, keychain: true };
}

export async function runCollector(argv = process.argv.slice(2)) {
  const command = argv[0] || "preflight";
  const filePath = argv[1] && !argv[1].startsWith("--") ? argv[1] : "";
  const root = resolve(argument(argv, "--root", DEFAULT_ARCHIVE_ROOT));
  const baseUrl = argument(argv, "--base-url", process.env.KUAIMAI_ERP_BASE_URL || "http://127.0.0.1:8132");
  const resourceType = argument(argv, "--resource", "");
  if (command === "register") return registerCollector(baseUrl);
  if (command === "install") {
    await readCollectorToken();
    return installLaunchAgent({
      collectorPath: resolve(dirname(fileURLToPath(import.meta.url)), "index.mjs"),
      root,
      baseUrl
    });
  }
  if (command === "scan") {
    return withCollectorLock(root, async () => scanWaitingDirectory({
      root,
      resourceType,
      upload: async collection => uploadErpCollection(collection, { baseUrl, headers: await runnerHeaders() })
    }));
  }
  if (command === "sync-archives") {
    return withCollectorLock(root, async () => syncLocalArchiveManifest({
      root,
      upload: async archive => uploadErpArchive(archive, { baseUrl, headers: await runnerHeaders() })
    }));
  }
  if (command === "archive-existing") {
    if (!filePath) throw new Error("用法：npm run collect:kuaimai -- archive-existing <导出文件> [--resource orders] [--upload]");
    return withCollectorLock(root, async () => (argv.includes("--archive-only") ? archiveExistingRawFile : archiveExistingFile)(resolve(filePath), {
      root,
      resourceType,
      upload: argv.includes("--upload")
        ? async collection => uploadErpCollection(collection, { baseUrl, headers: await runnerHeaders() })
        : null
    }));
  }
  if (!filePath) throw new Error("用法：npm run collect:kuaimai -- preflight|upload <导出文件> --resource orders");
  const parsed = await readKuaimaiExport(resolve(filePath), { resourceType: resourceType || "orders" });
  if (command === "preflight") {
    return {
      ready: true,
      batch: parsed.batch,
      headers: parsed.headers,
      issueCount: parsed.issues.length,
      issues: parsed.issues.slice(0, 20),
      preview: parsed.preview
    };
  }
  if (command === "upload") {
    return uploadErpCollection(parsed, { baseUrl, headers: await runnerHeaders() });
  }
  throw new Error(`未知命令：${command}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runCollector().then(result => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch(error => {
    process.stderr.write(`${error.code ? `${error.code}: ` : ""}${error.message}\n`);
    if (error.details) process.stderr.write(`${JSON.stringify(error.details, null, 2)}\n`);
    process.exitCode = 1;
  });
}
