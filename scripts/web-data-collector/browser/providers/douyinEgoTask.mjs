import {
  classifyDouyinEgoSnapshot,
  parseDouyinStoreIdentityText,
  validateDouyinEgoTask
} from "./douyinEgoState.mjs";

export const DOUYIN_EGO_STORE_IDENTITY_URL = "https://fxg.jinritemai.com/ffa/grs-new/qualification/common-tools";
export const DOUYIN_EGO_RESOURCE_URLS = Object.freeze({
  store_daily: "https://compass.jinritemai.com/shop",
  product_daily: "https://compass.jinritemai.com/shop/merchandise-traffic",
  live_daily: "https://compass.jinritemai.com/shop/live-overview",
  video_daily: "https://compass.jinritemai.com/shop/video/overview"
});

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
  video_daily: ["短视频", "日期"]
});
const IDENTITY_TEXT_EXPRESSION = String.raw`(() => String(document.body?.innerText || "").slice(0, 50000))()`;

function taskError(code, message) {
  return Object.assign(new Error(message), { code });
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
    "claimTaskSpace",
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
    selected = await helpers.claimTaskSpace(existing.id);
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

function resourceSnapshotExpression(resourceType) {
  const sentinels = JSON.stringify(RESOURCE_SENTINELS[resourceType]);
  return `(() => {
    const body = String(document.body?.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 20000);
    const sentinels = ${sentinels};
    return {
      origin: location.origin,
      path: location.pathname,
      title: String(document.title || "").trim(),
      body,
      readyState: document.readyState,
      hasPassword: Boolean(document.querySelector("input[type='password']")),
      hasRegisteredResourceSentinels: sentinels.every(term => body.includes(term))
    };
  })()`;
}

async function handoff(helpers, taskSpaceId) {
  await helpers.handOffTaskSpace(taskSpaceId);
}

export async function executeDouyinEgoTask(input, helpers) {
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

  await helpers.openOrReuseTab(DOUYIN_EGO_STORE_IDENTITY_URL, { wait: true, timeout: 20 });
  const identityInfo = await helpers.pageInfo();
  const identityText = await helpers.js(IDENTITY_TEXT_EXPRESSION);
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
  const identity = parseDouyinStoreIdentityText(identityText);
  if (!identity) {
    await handoff(helpers, taskSpace.id);
    return terminal(
      task,
      "waiting_human",
      "DOUYIN_STORE_IDENTITY_UNAVAILABLE",
      "Ego 无法从抖店登记页确认稳定店铺 ID，请人工检查。"
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
    const first = await helpers.js(expression);
    await helpers.wait(1);
    const second = await helpers.js(expression);
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
      return {
        kind: "download_capability_check",
        jobId: task.jobId,
        safeSummary: "Ego 店铺身份和资源页面已确认。"
      };
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
