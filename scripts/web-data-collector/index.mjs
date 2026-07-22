#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import os from "node:os";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { archiveExistingFile } from "../kuaimai-erp-collector/scanner.mjs";
import { DEFAULT_ARCHIVE_ROOT } from "../kuaimai-erp-collector/archive.mjs";
import { uploadErpCollection } from "../kuaimai-erp-collector/api.mjs";
import { readCollectorToken as readErpCollectorToken } from "../kuaimai-erp-collector/automation.mjs";
import { nodeRequest } from "../kuaimai-erp-collector/http.mjs";
import { createWebCollectionApi } from "./api.mjs";
import {
  EXTENSION_ID,
  EXTENSION_ORIGIN,
  installLaunchAgent,
  readPairingKey,
  readRunnerToken,
  storePairingKey,
  storeRunnerToken
} from "./automation.mjs";
import { createCollectorBridge } from "./bridge.mjs";
import { resolveSafeDownload } from "./download.mjs";
import { notifyCollectionIssue } from "./notification.mjs";
import { createWebCollectorOrchestrator } from "./orchestrator.mjs";

function argument(argv, name, fallback = "") {
  const index = argv.indexOf(name);
  return index >= 0 ? String(argv[index + 1] || fallback) : fallback;
}

function normalizeBaseUrl(value) {
  return String(value || "http://127.0.0.1:8132").trim().replace(/\/+$/, "");
}

async function registerRunner(baseUrl, fetchImpl = nodeRequest) {
  const personalToken = String(process.env.PRODUCTION_DATA_ACCESS_TOKEN || "").trim();
  const response = await fetchImpl(`${normalizeBaseUrl(baseUrl)}/api/platform/v1/web-collection/runners`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(personalToken ? { authorization: `Bearer ${personalToken}` } : {})
    },
    body: JSON.stringify({ name: `公司 Mac 网页采集器 (${os.hostname()})` })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.data?.token) {
    const error = new Error(payload?.error?.message || `采集设备登记失败（HTTP ${response.status}）。`);
    error.code = payload?.error?.code || "WEB_COLLECTION_RUNNER_REGISTER_FAILED";
    throw error;
  }
  const pairingKey = `wcp_${randomBytes(24).toString("hex")}`;
  await storeRunnerToken(payload.data.token);
  await storePairingKey(pairingKey);
  return {
    registered: true,
    runnerId: payload.data.id,
    extensionId: EXTENSION_ID,
    pairingKey,
    notice: "配对码只在本次登记结果显示一次；runner token 已写入 macOS 钥匙串。"
  };
}

async function createDownloadProcessor({ root, downloadsDirectory, baseUrl }) {
  const erpToken = await readErpCollectorToken();
  return async ({ fileName, resourceType, onValidated }) => {
    const filePath = await resolveSafeDownload({ directory: downloadsDirectory, fileName });
    const archived = await archiveExistingFile(filePath, {
      root,
      resourceType,
      onValidated,
      upload: collection => uploadErpCollection(collection, {
        baseUrl,
        headers: { authorization: `Bearer ${erpToken}` }
      })
    });
    return {
      batchId: archived.batchId || null,
      archiveId: archived.contentHash,
      rowCount: archived.rowCount,
      fileHash: archived.contentHash
    };
  };
}

async function serve({ root, baseUrl, downloadsDirectory }) {
  const [runnerToken, pairingKey, processDownload] = await Promise.all([
    readRunnerToken(),
    readPairingKey(),
    createDownloadProcessor({ root, downloadsDirectory, baseUrl })
  ]);
  const api = createWebCollectionApi({ baseUrl, token: runnerToken });
  const orchestrator = createWebCollectorOrchestrator({ api, processDownload, notify: notifyCollectionIssue });
  const bridge = createCollectorBridge({
    allowedOrigin: EXTENSION_ORIGIN,
    pairingKey,
    getNextTask: () => orchestrator.nextTask(),
    submitResult: result => {
      void orchestrator.submitResult(result).catch(() => {});
    }
  });
  await bridge.listen({ port: 17653 });
  await orchestrator.prepare();
  const timer = setInterval(() => void orchestrator.prepare().catch(() => {}), 60_000);
  const stop = async () => {
    clearInterval(timer);
    await bridge.close();
  };
  process.once("SIGINT", () => void stop().then(() => process.exit(0)));
  process.once("SIGTERM", () => void stop().then(() => process.exit(0)));
  return { status: "serving", host: "127.0.0.1", port: bridge.port, extensionId: EXTENSION_ID };
}

export async function runWebCollector(argv = process.argv.slice(2)) {
  const command = argv[0] || "preflight";
  const root = resolve(argument(argv, "--root", DEFAULT_ARCHIVE_ROOT));
  const baseUrl = normalizeBaseUrl(argument(argv, "--base-url", process.env.WEB_COLLECTION_BASE_URL || "http://127.0.0.1:8132"));
  const downloadsDirectory = resolve(argument(argv, "--downloads", path.join(os.homedir(), "Downloads")));
  const extensionPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../chrome-extension/company-data-collector");
  if (command === "register") return registerRunner(baseUrl);
  if (command === "install") {
    await Promise.all([readRunnerToken(), readPairingKey()]);
    const launchAgent = await installLaunchAgent({
      collectorPath: fileURLToPath(import.meta.url),
      root,
      baseUrl
    });
    return { ...launchAgent, extensionId: EXTENSION_ID, extensionPath };
  }
  if (command === "preflight") {
    await Promise.all([readRunnerToken(), readPairingKey(), readErpCollectorToken()]);
    return {
      ready: true,
      extensionId: EXTENSION_ID,
      extensionPath,
      bridge: "http://127.0.0.1:17653",
      downloadsDirectory,
      archiveRoot: root,
      secrets: "macOS Keychain"
    };
  }
  if (command === "serve") return serve({ root, baseUrl, downloadsDirectory });
  throw new Error(`未知命令：${command}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runWebCollector().then(result => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch(error => {
    process.stderr.write(`${error.code ? `${error.code}: ` : ""}${error.message}\n`);
    process.exitCode = 1;
  });
}
