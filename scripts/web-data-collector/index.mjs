#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import os from "node:os";
import { mkdir, readdir, stat } from "node:fs/promises";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { archiveExistingFile, scanWaitingDirectory } from "../kuaimai-erp-collector/scanner.mjs";
import { DEFAULT_ARCHIVE_ROOT } from "../kuaimai-erp-collector/archive.mjs";
import { uploadErpCollection } from "../kuaimai-erp-collector/api.mjs";
import { readCollectorToken as readErpCollectorToken } from "../kuaimai-erp-collector/automation.mjs";
import { nodeRequest } from "../kuaimai-erp-collector/http.mjs";
import { ensureManagedChrome } from "../browser-runtime/managed-chrome.mjs";
import { createEgoCliRunner } from "../browser-runtime/ego-cli.mjs";
import { createWebCollectionApi } from "./api.mjs";
import { createLocalArchiveCoordinator } from "./local-inbox.mjs";
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
import { createBrowserProfileRegistry } from "./browser/profile-registry.mjs";
import {
  createDedicatedBrowserRuntime,
  createExperimentalRunCycle
} from "./browser/runtime.mjs";
import { createEgoBrowserRuntime } from "./browser/ego-runtime.mjs";
import {
  DOUYIN_DEDICATED_RESOURCES,
  createCdpDouyinController,
  createDouyinDedicatedExecutor
} from "./browser/providers/douyin.mjs";
import { createCheckpointStore } from "./checkpoints.mjs";
import { runEgoProbe } from "./ego-probe.mjs";
import { createLocalDiagnosticStore } from "./diagnostics.mjs";
import { createExperimentalCdpBrowser } from "./experimental/browser.mjs";
import { executeExperimentalRun } from "./experimental/executor.mjs";
import { createExperimentalRunStore } from "./experimental/store.mjs";
import { resolveSafeDownload } from "./download.mjs";
import { notifyCollectionIssue } from "./notification.mjs";
import { createWebCollectorOrchestrator } from "./orchestrator.mjs";
import {
  createKuaimaiProcessor,
  createProviderProcessorRegistry
} from "./providers/index.mjs";
import {
  createDouyinProcessor,
  DEFAULT_DOUYIN_ARCHIVE_ROOT
} from "./providers/douyin/index.mjs";
import { createDouyinExtractApi } from "./browser/providers/douyinExtractApi.js";
import { createDouyinHomepageApi } from "./browser/providers/douyinHomepageApi.js";
import { createDouyinExtractRunner } from "./browser/providers/douyinExtractRunner.js";
import { validateDouyinEgoTask } from "./browser/providers/douyinEgoState.mjs";

function argument(argv, name, fallback = "") {
  const index = argv.indexOf(name);
  return index >= 0 ? String(argv[index + 1] || fallback) : fallback;
}

function normalizeBaseUrl(value) {
  return String(value || "http://127.0.0.1:8132").trim().replace(/\/+$/, "");
}

export const DEFAULT_MANAGED_PROFILE_ROOT = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "Product Flow Collector",
  "Profiles"
);

export function buildEgoProbeTask(argv, { homeDirectory = os.homedir() } = {}) {
  const storeId = argument(argv, "--store-id");
  const resourceType = argument(argv, "--resource");
  const businessDate = argument(argv, "--business-date");
  const jobId = `ego-probe-${storeId}-${resourceType}-${businessDate}`;
  return validateDouyinEgoTask({
    jobId,
    providerId: "douyin-ecommerce",
    storeId,
    storeName: argument(argv, "--store-name", `店铺 ${storeId}`),
    resourceType,
    businessDate,
    status: "opening",
    attempt: 1,
    scheduleVersion: "ego-probe-v1",
    workspace: path.join(
      homeDirectory,
      "Library",
      "Application Support",
      "Product Flow Collector",
      "Ego Probes",
      jobId
    )
  });
}

async function runEgoProbeCommand(argv) {
  const task = buildEgoProbeTask(argv);
  await mkdir(task.workspace, { recursive: true, mode: 0o700 });
  const modulePath = resolve(dirname(fileURLToPath(import.meta.url)), "browser/providers/douyinEgoTask.mjs");
  const runner = createEgoCliRunner({
    executable: argument(argv, "--ego-cli"),
    moduleRoot: dirname(modulePath),
    timeoutMs: 50 * 60 * 1_000
  });
  const checkpointStore = createCheckpointStore({
    rootDir: path.join(dirname(task.workspace), "Checkpoints")
  });
  return runEgoProbe({
    task,
    executeTask: input => runner.run({
      moduleUrl: pathToFileURL(modulePath).href,
      input
    }),
    checkpointStore,
    archiveRoot: DEFAULT_DOUYIN_ARCHIVE_ROOT
  });
}

export function experimentalModeEnabled(value = "") {
  return ["1", "true", "enabled"].includes(String(value || "").trim().toLowerCase());
}

export function normalizeBrowserMode(value) {
  const mode = String(value || "").trim();
  if (["extension", "dedicated", "ego"].includes(mode)) return mode;
  throw Object.assign(new Error("浏览器模式无效。"), { code: "WEB_COLLECTION_BROWSER_MODE_INVALID" });
}

export function browserModeUsesManagedChrome(browserMode, { experimentalMode = false } = {}) {
  return browserMode === "dedicated" || experimentalMode === true;
}

export function assertAliyunCollectorTarget({ baseUrl, browserMode, allowLocalProbe = false } = {}) {
  if (browserMode !== "ego") return;
  let target;
  try {
    target = new URL(String(baseUrl || ""));
  } catch {
    target = null;
  }
  const isApprovedAliyun = target?.origin === "https://deshan-tiyes.cn"
    && target.pathname === "/"
    && !target.search
    && !target.hash;
  const isLoopbackProbe = allowLocalProbe === true
    && target?.protocol === "http:"
    && ["127.0.0.1", "localhost", "::1"].includes(target.hostname);
  if (!isApprovedAliyun && !isLoopbackProbe) {
    throw Object.assign(new Error("正式 Ego 采集只允许写入已登记的阿里云 ECS 入口。"), {
      code: "EGO_FORMAL_TARGET_NOT_ALIYUN"
    });
  }
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

export function assertBusinessDateMatchesRange({ businessDate, rangeStart, rangeEnd } = {}) {
  const expected = String(businessDate || "").trim();
  const actualStart = String(rangeStart || "").slice(0, 10);
  const actualEnd = String(rangeEnd || "").slice(0, 10);
  if (!expected || actualStart !== expected || actualEnd !== expected) {
    const error = new Error("下载文件的业务日期与采集任务不一致。");
    error.code = "WEB_COLLECTION_BUSINESS_DATE_MISMATCH";
    throw error;
  }
}

// 商品与库存快照是当前时点全量，不携带业务日期范围，跳过按日校验。
export function assertCollectionFileMatchesTask({ resourceType, businessDate, rangeStart, rangeEnd } = {}) {
  if (["products", "product_kits", "product_combinations", "inventory_snapshot"].includes(String(resourceType || ""))) return;
  assertBusinessDateMatchesRange({ businessDate, rangeStart, rangeEnd });
}

export function createCommerceFactUploader({
  baseUrl,
  runnerToken,
  fetchImpl = nodeRequest
}) {
  const token = String(runnerToken || "").trim();
  if (!/^wdc_[a-f0-9]{48}$/i.test(token)) {
    throw Object.assign(new Error("经营事实上传缺少有效 runner token。"), {
      code: "WEB_COLLECTION_RUNNER_TOKEN_INVALID"
    });
  }
  const endpoint = `${normalizeBaseUrl(baseUrl)}/api/platform/v1/commerce-facts/ingest`;
  return async input => {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(input)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error?.message || `经营事实上传失败（HTTP ${response.status}）。`);
      error.code = payload?.error?.code || "COMMERCE_FACT_UPLOAD_FAILED";
      error.retryable = Boolean(payload?.error?.retryable || response.status >= 500);
      throw error;
    }
    return payload.data || payload;
  };
}

function createDownloadProcessor({ root, downloadsDirectory, baseUrl, erpToken, archiveCoordinator }) {
  return async ({ jobId, fileName, resourceType, businessDate, onValidated }) => {
    const filePath = await resolveSafeDownload({ directory: downloadsDirectory, fileName });
    const archived = await archiveCoordinator.runBrowserArchive(() => archiveExistingFile(filePath, {
      root,
      resourceType,
      onValidated: async validation => {
        assertCollectionFileMatchesTask({ resourceType, businessDate, ...validation });
        await onValidated?.(validation);
      },
      upload: collection => uploadErpCollection(collection, {
        baseUrl,
        headers: {
          authorization: `Bearer ${erpToken}`,
          "x-web-collection-job-id": jobId
        }
      })
    }));
    return {
      batchId: archived.batchId || null,
      archiveId: archived.contentHash,
      rowCount: archived.rowCount,
      fileHash: archived.contentHash
    };
  };
}

// 改完扩展代码必须重载 Chrome 扩展才生效，否则一直跑旧代码。这一点极难察觉：
// 表现为「改完没效果」，只能靠失败耗时之类的间接线索才判断得出来。把扩展源码的
// 最新修改时间当指纹随任务轮询带给扩展，扩展空闲时自行重载。
// 采集器自身的代码指纹：取几个关键文件的内容哈希，与 git 提交无关——
// 即使有人在工作区改了文件没提交，这个值也会变。
async function sourceFingerprint() {
  const here = dirname(fileURLToPath(import.meta.url));
  const files = [
    "orchestrator.mjs",
    "browser/ego-runtime.mjs",
    "browser/providers/douyin.mjs",
    "browser/providers/douyinEgoTask.mjs",
    "browser/providers/douyinEgoState.mjs",
    "browser/providers/douyinExtractApi.js",
    "browser/providers/douyinHomepageApi.js"
  ];
  const hash = createHash("sha256");
  for (const name of files) {
    try {
      hash.update(await readFile(resolve(here, name)));
    } catch {
      hash.update(`missing:${name}`);
    }
  }
  return hash.digest("hex").slice(0, 12);
}

const EXTENSION_SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../chrome-extension/company-data-collector");
let cachedSourceStamp = { at: 0, value: "" };

async function extensionSourceStamp(root) {
  const now = Date.now();
  if (now - cachedSourceStamp.at < 5_000) return cachedSourceStamp.value;
  let newest = 0;
  const walk = async directory => {
    let entries = [];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!/\.(js|json|html|css)$/.test(entry.name)) continue;
      try {
        const info = await stat(full);
        if (info.mtimeMs > newest) newest = info.mtimeMs;
      } catch {
        // 单个文件读不到不影响整体指纹
      }
    }
  };
  await walk(root);
  cachedSourceStamp = { at: now, value: String(Math.trunc(newest)) };
  return cachedSourceStamp.value;
}

async function serve({
  root,
  baseUrl,
  downloadsDirectory,
  browserMode = "extension",
  egoCli = "",
  profileRoot = DEFAULT_MANAGED_PROFILE_ROOT,
  experimentalMode = false
}) {
  const [runnerToken, pairingKey, erpToken] = await Promise.all([
    readRunnerToken(),
    readPairingKey(),
    readErpCollectorToken()
  ]);
  const archiveCoordinator = createLocalArchiveCoordinator();
  const processDownload = createDownloadProcessor({
    root,
    downloadsDirectory,
    baseUrl,
    erpToken,
    archiveCoordinator
  });
  const api = createWebCollectionApi({ baseUrl, token: runnerToken });
  const uploadFactChunk = createCommerceFactUploader({ baseUrl, runnerToken });
  const processors = createProviderProcessorRegistry([
    createKuaimaiProcessor(processDownload),
    createDouyinProcessor({
      archiveRoot: DEFAULT_DOUYIN_ARCHIVE_ROOT,
      uploadFactChunk,
      resolveDownloadFile: safeFileName => resolveSafeDownload({
        directory: downloadsDirectory,
        fileName: safeFileName
      })
    })
  ]);
  const orchestrator = createWebCollectorOrchestrator({
    api,
    processors,
    notify: notifyCollectionIssue,
    executionMode: browserMode
  });
  const profileRegistry = browserModeUsesManagedChrome(browserMode, { experimentalMode })
    ? createBrowserProfileRegistry({ rootDir: profileRoot })
    : null;
  const runtimeStateRoot = path.dirname(profileRoot);
  const checkpointStore = createCheckpointStore({
    rootDir: path.join(runtimeStateRoot, "Checkpoints")
  });
  const experimentalRoot = path.join(runtimeStateRoot, "Experimental");
  const experimentalRunStore = experimentalMode
    ? createExperimentalRunStore({
      databasePath: path.join(experimentalRoot, "experimental-runs.sqlite")
    })
    : null;
  const diagnosticStore = createLocalDiagnosticStore({
    rootDir: path.join(runtimeStateRoot, "Diagnostics"),
    encryptionKey: createHash("sha256").update(pairingKey).digest()
  });
  const dedicatedExecutor = createDouyinDedicatedExecutor({
    createController: browser => createCdpDouyinController({
      browser,
      downloadsDirectory
    }),
    createExtractApi: createDouyinExtractApi,
    createHomepageApi: createDouyinHomepageApi,
    createExtractRunner: createDouyinExtractRunner
  });
  const dedicatedRuntime = browserMode === "dedicated"
    ? createDedicatedBrowserRuntime({
      api,
      profileRegistry,
      ensureBrowser: profile => ensureManagedChrome(profile),
      orchestrator,
      executeTask: input => dedicatedExecutor.executeTask(input),
      checkpointStore,
      diagnosticStore,
      diagnosticPageType: task => DOUYIN_DEDICATED_RESOURCES[task.resourceType]?.pageType || ""
    })
    : null;
  const egoModulePath = resolve(dirname(fileURLToPath(import.meta.url)), "browser/providers/douyinEgoTask.mjs");
  const egoRunner = browserMode === "ego"
    ? createEgoCliRunner({
      executable: egoCli,
      moduleRoot: dirname(egoModulePath),
      timeoutMs: 50 * 60 * 1_000
    })
    : null;
  const egoWorkspaceRoot = path.join(runtimeStateRoot, "Ego Tasks");
  const egoRuntime = browserMode === "ego"
    ? createEgoBrowserRuntime({
      api,
      orchestrator,
      executeTask: input => egoRunner.run({
        moduleUrl: pathToFileURL(egoModulePath).href,
        input
      }),
      checkpointStore,
      workspaceForTask: task => path.join(egoWorkspaceRoot, task.jobId)
    })
    : null;
  const experimentalCycle = experimentalMode ? createExperimentalRunCycle({
    api,
    executeRun: async bundle => {
      const profile = profileRegistry.register({
        providerId: bundle.template.providerId,
        storeId: bundle.template.profileId,
        storeName: bundle.templateId
      });
      const managedBrowser = await ensureManagedChrome(profile);
      const workspace = path.join(experimentalRoot, bundle.runId);
      await mkdir(workspace, { recursive: true, mode: 0o700 });
      const allowedOrigins = [...new Set(
        bundle.template.steps
          .filter(step => step.type === "browser.open")
          .map(step => new URL(step.url).origin)
      )];
      const browser = createExperimentalCdpBrowser({
        endpoint: managedBrowser.endpoint,
        allowedOrigins,
        downloadsDirectory: workspace
      });
      try {
        return await executeExperimentalRun({
          bundle,
          browser,
          workspace,
          checkpointStore,
          runStore: experimentalRunStore
        });
      } finally {
        browser.close();
      }
    }
  }) : null;
  const bridge = createCollectorBridge({
    allowedOrigin: EXTENSION_ORIGIN,
    pairingKey,
    getSourceStamp: () => extensionSourceStamp(EXTENSION_SOURCE_ROOT),
    getNextTask: input => orchestrator.nextTask(input),
    registerStore: store => orchestrator.registerStore(store),
    submitResult: result => {
      void orchestrator.submitResult(result).catch(() => {});
    }
  });
  await bridge.listen({ port: 17653 });
  let cycleRunning = false;
  let localInboxStatus = { status: "pending" };
  const runCycle = async () => {
    if (cycleRunning) return;
    cycleRunning = true;
    try {
      await orchestrator.prepare();
      await diagnosticStore.cleanup();
      await dedicatedRuntime?.runOnce();
      await egoRuntime?.runOnce();
      await experimentalCycle?.runOnce();
      localInboxStatus = await archiveCoordinator.runInboxScan(() => scanWaitingDirectory({
        root,
        upload: collection => uploadErpCollection(collection, {
          baseUrl,
          headers: { authorization: `Bearer ${erpToken}` }
        })
      }));
      if (localInboxStatus.status === "failed") {
        process.stderr.write(`[local-inbox] ${localInboxStatus.errorCode}\n`);
      }
    } finally {
      cycleRunning = false;
    }
  };
  await runCycle().catch(() => {});
  const timer = setInterval(() => void runCycle().catch(() => {}), 60_000);
  const stop = async () => {
    clearInterval(timer);
    await bridge.close();
    experimentalRunStore?.close();
  };
  process.once("SIGINT", () => void stop().then(() => process.exit(0)));
  process.once("SIGTERM", () => void stop().then(() => process.exit(0)));
  return {
    status: "serving",
    // 启动时把代码指纹打出来。出过一次说不清的事：代码验证过是对的、进程也是新的，
    // 但线上行为像是旧代码——当时无法判断跑的到底是哪份代码。
    // 有了这个，下次一眼就能对上（与 git rev-parse HEAD 比对即可）。
    codeVersion: await sourceFingerprint(),
    host: "127.0.0.1",
    port: bridge.port,
    extensionId: EXTENSION_ID,
    browserMode,
    experimentalMode,
    localInboxStatus
  };
}

export async function runWebCollector(argv = process.argv.slice(2)) {
  const command = argv[0] || "preflight";
  const root = resolve(argument(argv, "--root", DEFAULT_ARCHIVE_ROOT));
  const baseUrl = normalizeBaseUrl(argument(argv, "--base-url", process.env.WEB_COLLECTION_BASE_URL || "http://127.0.0.1:8132"));
  const downloadsDirectory = resolve(argument(argv, "--downloads", path.join(os.homedir(), "Downloads")));
  const browserMode = normalizeBrowserMode(argument(argv, "--browser-mode", "extension"));
  const experimentalMode = experimentalModeEnabled(
    argument(argv, "--experimental-mode", process.env.WEB_COLLECTION_EXPERIMENTAL_MODE || "")
  );
  const profileRoot = resolve(argument(argv, "--profile-root", DEFAULT_MANAGED_PROFILE_ROOT));
  const egoCli = argument(argv, "--ego-cli");
  const extensionPath = EXTENSION_SOURCE_ROOT;
  if (["serve", "install"].includes(command)) {
    assertAliyunCollectorTarget({ baseUrl, browserMode });
  }
  if (command === "probe-ego") return runEgoProbeCommand(argv);
  if (command === "register") return registerRunner(baseUrl);
  if (command === "install") {
    await Promise.all([readRunnerToken(), readPairingKey()]);
    const launchAgent = await installLaunchAgent({
      collectorPath: fileURLToPath(import.meta.url),
      root,
      baseUrl,
      browserMode,
      egoCli
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
      douyinArchiveRoot: DEFAULT_DOUYIN_ARCHIVE_ROOT,
      browserMode,
      experimentalMode,
      profileRoot,
      secrets: "macOS Keychain"
    };
  }
  if (command === "serve") return serve({
    root,
    baseUrl,
    downloadsDirectory,
    browserMode,
    egoCli,
    profileRoot,
    experimentalMode
  });
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
