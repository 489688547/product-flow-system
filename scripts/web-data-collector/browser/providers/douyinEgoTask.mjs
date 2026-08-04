import { mkdir, readdir, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, join, resolve } from "node:path";

import {
  classifyDouyinEgoSnapshot,
  parseDouyinStoreIdentitySnapshot,
  validateDouyinEgoTask
} from "./douyinEgoState.mjs";
import { createDouyinExtractApi } from "./douyinExtractApi.js";
import { createDouyinExtractRunner } from "./douyinExtractRunner.js";
import { SELF_SERVICE_REPORT_VERSION } from "../../providers/douyin/parser.mjs";

export const DOUYIN_EGO_STORE_IDENTITY_URL = "https://fxg.jinritemai.com/ffa/mshop/homepage/index";
export const DOUYIN_EGO_RESOURCE_URLS = Object.freeze({
  store_daily: "https://compass.jinritemai.com/shop",
  product_daily: "https://compass.jinritemai.com/shop/merchandise-traffic",
  live_daily: "https://compass.jinritemai.com/shop/live-overview",
  video_daily: "https://compass.jinritemai.com/shop/video/overview"
});
export const DOUYIN_EGO_SELF_SERVICE_URL = "https://compass.jinritemai.com/shop/workshop/appcustom-access?tab=access";
const DOUYIN_DOWNLOAD_URL = /^https:\/\/compass\.jinritemai\.com\/data_factory\/download_file\?task_id=\d+$/;

const HUMAN_TERMS = Object.freeze([
  "验证码",
  "拖动滑块",
  "滑块验证",
  "扫码登录",
  "设备验证",
  "安全验证",
  "短信验证码",
  "手机验证码"
]);
const RESOURCE_SENTINELS = Object.freeze({
  store_daily: ["店铺", "日期"],
  product_daily: ["商品", "日期"],
  live_daily: ["直播", "日期"],
  video_daily: ["短视频", "下载明细"]
});
const IDENTITY_SNAPSHOT_EXPRESSION = String.raw`(() => {
  const normalize = value => String(value || "").replace(/\s+/g, " ").trim();
  const ownText = element => normalize(
    [...element.childNodes]
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent)
      .join(" ")
  );
  const stableId = /^[-_a-zA-Z0-9]{1,128}$/;
  const label = /^(?:店铺\s*ID|店铺编号|商家编号)$/i;
  const labelledStoreIds = [];
  const elements = [...document.querySelectorAll("body *")].slice(0, 5000);
  for (const element of elements) {
    if (!label.test(ownText(element))) continue;
    const roots = [element.parentElement, element.nextElementSibling, element.parentElement?.nextElementSibling]
      .filter(Boolean);
    for (const root of roots) {
      for (const candidate of [root, ...root.querySelectorAll("*")].slice(0, 100)) {
        const value = ownText(candidate);
        if (stableId.test(value)) labelledStoreIds.push(value);
      }
    }
  }
  return {
    visibleText: String(document.body?.innerText || "").slice(0, 50000),
    labelledStoreIds: [...new Set(labelledStoreIds)].slice(0, 8)
  };
})()`;
const DOWNLOAD_EXTENSIONS = new Set([".xlsx", ".xls", ".csv"]);

function taskError(code, message) {
  return Object.assign(new Error(message), { code });
}

export async function configureEgoDownload({ cdp, workspace } = {}) {
  const directory = String(workspace || "");
  if (typeof cdp !== "function" || !isAbsolute(directory)) {
    throw taskError("EGO_DOWNLOAD_CAPABILITY_UNAVAILABLE", "Ego 受控下载目录配置无效。");
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const details = await stat(directory).catch(() => null);
  if (!details?.isDirectory()) {
    throw taskError("EGO_DOWNLOAD_CAPABILITY_UNAVAILABLE", "Ego 受控下载目录不可用。");
  }
  const parameters = {
    behavior: "allow",
    downloadPath: directory,
    eventsEnabled: true
  };
  try {
    await cdp("Browser.setDownloadBehavior", parameters);
  } catch {
    try {
      await cdp("Page.setDownloadBehavior", parameters);
    } catch {
      throw taskError("EGO_DOWNLOAD_CAPABILITY_UNAVAILABLE", "当前 Ego 版本无法提供受控下载目录，采集已停止。");
    }
  }
}

function waitMilliseconds(milliseconds) {
  return new Promise(resolveWait => setTimeout(resolveWait, Math.max(0, milliseconds)));
}

export async function waitForStableEgoDownload({
  workspace,
  startedAt,
  timeoutMs = 90_000,
  pollIntervalMs = 500,
  stabilityDelayMs = 750,
  now = () => Date.now()
} = {}) {
  const root = resolve(String(workspace || ""));
  if (!isAbsolute(String(workspace || "")) || !Number.isFinite(Number(startedAt))) {
    throw taskError("EGO_DOWNLOAD_WORKSPACE_INVALID", "Ego 下载任务目录无效。");
  }
  const deadline = now() + Math.max(1, Number(timeoutMs) || 90_000);
  while (now() <= deadline) {
    const entries = await readdir(root, { withFileTypes: true }).catch(error => {
      if (error?.code === "ENOENT") return [];
      throw error;
    });
    const candidates = [];
    for (const entry of entries) {
      if (!entry.isFile() || basename(entry.name) !== entry.name) continue;
      if (!DOWNLOAD_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
      const filePath = join(root, entry.name);
      const first = await stat(filePath).catch(() => null);
      if (!first?.isFile() || first.size <= 0 || first.mtimeMs + 1 < Number(startedAt)) continue;
      candidates.push({ filePath, safeFileName: entry.name, first });
    }
    candidates.sort((left, right) => left.first.mtimeMs - right.first.mtimeMs || left.safeFileName.localeCompare(right.safeFileName));
    for (const candidate of candidates) {
      await waitMilliseconds(stabilityDelayMs);
      const second = await stat(candidate.filePath).catch(() => null);
      if (
        second?.isFile()
        && second.size > 0
        && second.size === candidate.first.size
        && second.mtimeMs === candidate.first.mtimeMs
      ) {
        return { filePath: candidate.filePath, safeFileName: candidate.safeFileName };
      }
    }
    if (now() <= deadline) await waitMilliseconds(pollIntervalMs);
  }
  throw taskError("EGO_DOWNLOAD_TIMEOUT", "Ego 下载文件未在限定时间内稳定落盘。");
}

export async function collectDouyinResourceWithEgo({
  task,
  helpers,
  createApi = createDouyinExtractApi,
  createRunner = createDouyinExtractRunner,
  downloadOptions = {}
} = {}) {
  await configureEgoDownload({ cdp: helpers?.cdp, workspace: task?.workspace });
  const open = async url => {
    const target = String(url || "");
    if (target !== DOUYIN_EGO_SELF_SERVICE_URL && !DOUYIN_DOWNLOAD_URL.test(target)) {
      throw taskError("DOUYIN_NAVIGATION_UNEXPECTED", "Ego 自助取数尝试打开未登记地址。");
    }
    return helpers.openOrReuseTab(target, { wait: true, timeout: 20 });
  };
  await open(DOUYIN_EGO_SELF_SERVICE_URL);
  const api = createApi({
    controller: { open },
    evaluate: code => helpers.js(code)
  });
  const runner = createRunner({
    api,
    wait: milliseconds => helpers.wait(Math.max(0, Number(milliseconds) || 0) / 1_000)
  });
  const startedAt = Date.now();
  await runner.run({
    resourceType: task.resourceType,
    from: task.businessDate,
    to: task.businessDate
  });
  const downloaded = await waitForStableEgoDownload({
    workspace: task.workspace,
    startedAt,
    ...downloadOptions
  });
  return {
    kind: "downloaded",
    jobId: task.jobId,
    filePath: downloaded.filePath,
    safeFileName: downloaded.safeFileName,
    pageType: "shop_compass_self_service",
    reportVersion: SELF_SERVICE_REPORT_VERSION
  };
}

function stableId(value) {
  return /^[-_a-zA-Z0-9]{1,128}$/.test(String(value || ""));
}

export function egoTaskSpaceName({ providerId, storeId } = {}) {
  if (providerId !== "douyin-ecommerce" || !stableId(storeId)) {
    throw taskError("DOUYIN_EGO_TASK_SPACE_INVALID", "Ego 抖店空间身份无效。");
  }
  return `EC 抖音 ${storeId}`;
}

function terminal(task, kind, errorCode, safeSummary) {
  return { kind, jobId: task.jobId, errorCode, safeSummary, stage: "opening" };
}

function validateControl(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { explicitHumanRetry: false };
  }
  if (Object.keys(value).some(field => field !== "explicitHumanRetry")) {
    throw taskError("DOUYIN_EGO_CONTROL_INVALID", "Ego 本机控制信息无效。");
  }
  return { explicitHumanRetry: value.explicitHumanRetry === true };
}

function requireHelpers(helpers) {
  const required = [
    "listTaskSpaces",
    "useOrCreateTaskSpace",
    "takeOverTaskSpace",
    "handOffTaskSpace",
    "listTabs",
    "switchTab",
    "openOrReuseTab",
    "pageInfo",
    "js",
    "wait"
  ];
  if (required.some(name => typeof helpers?.[name] !== "function")) {
    throw taskError("EGO_UNAVAILABLE", "Ego 当前版本缺少抖店采集所需能力。");
  }
}

async function selectTaskSpace(task, control, helpers) {
  const name = egoTaskSpaceName(task);
  const spaces = await helpers.listTaskSpaces();
  const existing = Array.isArray(spaces) ? spaces.find(space => space?.name === name) : null;
  if (existing?.ownership === "user" && !control.explicitHumanRetry) {
    return { blocked: true, id: existing.id, name };
  }
  let selected;
  if (existing?.ownership === "user") {
    selected = await helpers.takeOverTaskSpace(existing.id);
    const tabs = await helpers.listTabs();
    const exact = Array.isArray(tabs) ? tabs.find(tab => (
      tab?.url === DOUYIN_EGO_STORE_IDENTITY_URL
      || Object.values(DOUYIN_EGO_RESOURCE_URLS).includes(tab?.url)
    )) : null;
    if (exact?.targetId) await helpers.switchTab(exact.targetId);
  } else if (existing) {
    selected = await helpers.useOrCreateTaskSpace(existing.id);
  } else {
    selected = await helpers.useOrCreateTaskSpace(name);
  }
  const id = selected?.id ?? existing?.id;
  if (id === undefined || id === null) {
    throw taskError("EGO_UNAVAILABLE", "Ego 未返回可用的 Task Space。");
  }
  return { blocked: false, id, name };
}

function identityPageState(info, body) {
  let pageUrl;
  try {
    pageUrl = new URL(String(info?.url || ""));
  } catch {
    return "unexpected";
  }
  const text = String(body || "");
  if (/^\/login(?:\/|$)/i.test(pageUrl.pathname) || /登录/.test(String(info?.title || ""))) return "login";
  if (HUMAN_TERMS.some(term => text.includes(term))) return "human";
  if (pageUrl.origin !== "https://fxg.jinritemai.com") return "unexpected";
  return "identity";
}

function isRegisteredIdentityTab(value) {
  try {
    const url = new URL(String(value || ""));
    return url.origin === "https://fxg.jinritemai.com"
      && url.pathname === "/ffa/mshop/homepage/index";
  } catch {
    return false;
  }
}

async function openIdentityPage(helpers) {
  const tabs = await helpers.listTabs();
  const existing = Array.isArray(tabs)
    ? tabs.find(tab => tab?.targetId && isRegisteredIdentityTab(tab?.url))
    : null;
  if (existing) {
    await helpers.switchTab(existing.targetId);
    return existing;
  }
  return helpers.openOrReuseTab(DOUYIN_EGO_STORE_IDENTITY_URL, { wait: true, timeout: 20 });
}

function resourceSnapshotExpression(resourceType) {
  return `(() => {
    const body = String(document.body?.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 20000);
    return {
      origin: location.origin,
      path: location.pathname,
      title: String(document.title || "").trim(),
      body,
      readyState: document.readyState,
      hasPassword: Boolean(document.querySelector("input[type='password']"))
    };
  })()`;
}

function withResourceSentinels(snapshot, resourceType) {
  const value = snapshot && typeof snapshot === "object" ? snapshot : {};
  const body = String(value.body || "");
  return {
    ...value,
    hasRegisteredResourceSentinels: RESOURCE_SENTINELS[resourceType].every(term => body.includes(term))
  };
}

async function handoff(helpers, taskSpaceId) {
  await helpers.handOffTaskSpace(taskSpaceId);
}

export async function executeDouyinEgoTask(input, helpers, {
  collect = collectDouyinResourceWithEgo
} = {}) {
  requireHelpers(helpers);
  const task = validateDouyinEgoTask(input?.task);
  const control = validateControl(input?.control);
  const taskSpace = await selectTaskSpace(task, control, helpers);
  if (taskSpace.blocked) {
    return terminal(
      task,
      "waiting_human",
      "EGO_TASK_SPACE_USER_CONTROLLED",
      "Ego 中该店铺空间正由用户控制，请在公司平台确认后重试。"
    );
  }

  await openIdentityPage(helpers);
  const identityInfo = await helpers.pageInfo();
  let identity = null;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const identitySnapshot = await helpers.js(IDENTITY_SNAPSHOT_EXPRESSION);
    const identityText = typeof identitySnapshot === "string"
      ? identitySnapshot
      : String(identitySnapshot?.visibleText || "");
    const identityState = identityPageState(identityInfo, identityText);
    if (identityState === "login" || identityState === "human") {
      await handoff(helpers, taskSpace.id);
      return terminal(
        task,
        "waiting_human",
        identityState === "login" ? "DOUYIN_LOGIN_REQUIRED" : "DOUYIN_HUMAN_VERIFICATION_REQUIRED",
        identityState === "login"
          ? "请在 Ego 完成抖店登录后，到公司平台确认重试。"
          : "请在 Ego 完成验证码、扫码、滑块或设备确认后，到公司平台确认重试。"
      );
    }
    if (identityState !== "identity") {
      return terminal(task, "failed", "DOUYIN_NAVIGATION_UNEXPECTED", "Ego 打开了未登记的店铺身份页面。");
    }
    identity = parseDouyinStoreIdentitySnapshot(identitySnapshot);
    if (identity) break;
    if (attempt < 14) await helpers.wait(1);
  }
  if (!identity) {
    return terminal(
      task,
      "failed",
      "DOUYIN_STORE_IDENTITY_UNAVAILABLE",
      "抖店首页未能提供唯一店铺 ID，采集器将按技术失败处理。"
    );
  }
  if (identity.storeId !== task.storeId) {
    await handoff(helpers, taskSpace.id);
    return terminal(
      task,
      "waiting_human",
      "DOUYIN_STORE_MISMATCH",
      "Ego 当前抖店账号与任务店铺不一致，请切换到正确店铺。"
    );
  }

  await helpers.openOrReuseTab(DOUYIN_EGO_RESOURCE_URLS[task.resourceType], { wait: true, timeout: 20 });
  const startedAt = Date.now();
  const expression = resourceSnapshotExpression(task.resourceType);
  while (true) {
    const first = withResourceSentinels(await helpers.js(expression), task.resourceType);
    await helpers.wait(1);
    const second = withResourceSentinels(await helpers.js(expression), task.resourceType);
    const stable = String(first?.body || "") === String(second?.body || "")
      && String(first?.path || "") === String(second?.path || "");
    const classification = classifyDouyinEgoSnapshot({ ...second, networkIdle: stable }, {
      elapsedMs: Date.now() - startedAt,
      loadTimeoutMs: 45_000,
      expectedStoreId: task.storeId,
      actualStoreId: identity.storeId,
      identityVerified: true
    });
    if (classification.state === "loading") continue;
    if (classification.state === "ready") {
      try {
        return await collect({ task, helpers, taskSpace });
      } catch (error) {
        const candidate = String(error?.code || "EGO_COLLECTION_FAILED").toUpperCase();
        const errorCode = /^[A-Z0-9_]{3,80}$/.test(candidate) ? candidate : "EGO_COLLECTION_FAILED";
        return terminal(
          task,
          "failed",
          errorCode,
          errorCode === "EGO_DOWNLOAD_CAPABILITY_UNAVAILABLE"
            ? "当前 Ego 版本无法提供受控下载目录，采集已停止。"
            : "Ego 自助取数或下载未完成，未进入解析和上传。"
        );
      }
    }
    if (["login_required", "human_verification", "store_mismatch"].includes(classification.state)) {
      await handoff(helpers, taskSpace.id);
      return terminal(task, "waiting_human", classification.errorCode, "请在 Ego 完成人工处理后，到公司平台确认重试。");
    }
    if (classification.state === "schema_changed") {
      return terminal(task, "schema_changed", classification.errorCode, "抖店页面稳定后仍缺少登记的数据入口。");
    }
    return terminal(task, "failed", classification.errorCode, "抖店页面未能达到可采集状态。");
  }
}

export async function executeEgoCliTask(input, helpers) {
  return executeDouyinEgoTask(input, helpers);
}
