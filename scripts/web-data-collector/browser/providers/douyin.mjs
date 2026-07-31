export const STORE_DAILY_FACT_KEYS = Object.freeze([
  "transactionAmount",
  "transactionOrderCount",
  "transactionBuyerCount",
  "userPaymentAmount",
  "settlementAmount",
  "refundAmountByPaymentDate",
  "refundAmountByRefundDate",
  "refundOrderCountByPaymentDate",
  "refundOrderCountByRefundDate",
  "productExposureUsers",
  "productClickUsers"
]);

const TASK_FIELDS = new Set([
  "jobId",
  "providerId",
  "storeId",
  "resourceType",
  "businessDate",
  "status",
  "attempt",
  "scheduleVersion"
]);

export const DOUYIN_DEDICATED_RESOURCES = Object.freeze({
  store_daily: Object.freeze({
    url: "https://compass.jinritemai.com/shop",
    pageType: "shop_compass_overview",
    reportVersion: "douyin-store-v1"
  }),
  product_daily: Object.freeze({
    url: "https://compass.jinritemai.com/shop/merchandise-traffic",
    pageType: "shop_compass_product",
    reportVersion: "douyin-product-v2"
  }),
  live_daily: Object.freeze({
    url: "https://compass.jinritemai.com/shop/live-overview",
    pageType: "shop_compass_live",
    reportVersion: "douyin-live-v2"
  }),
  video_daily: Object.freeze({
    url: "https://compass.jinritemai.com/shop/video/overview",
    pageType: "shop_compass_video",
    reportVersion: "douyin-video-v2"
  })
});
// 自助取数是独立页面，不属于四个资源各自的落地页，需要单独登记为合法地址。
export const SELF_SERVICE_URL = "https://compass.jinritemai.com/shop/workshop/appcustom-access?tab=access";

import { usesSelfService } from "../../../../src/domain/douyinSelfServiceExtract.js";

const REGISTERED_URLS = new Set([
  ...Object.values(DOUYIN_DEDICATED_RESOURCES).map(resource => resource.url),
  SELF_SERVICE_URL
]);

// 取数文件的地址带变动的 task_id，没法逐个登记。但也不能因此把白名单放宽成模糊匹配
// ——白名单的意义就是「只去该去的地方」。这里只放行这一个端点，且 task_id 必须是纯数字。
const DOWNLOAD_FILE_PATTERN = /^https:\/\/compass\.jinritemai\.com\/data_factory\/download_file\?task_id=\d+$/;

export function isRegisteredDouyinUrl(url) {
  const text = String(url || "");
  return REGISTERED_URLS.has(text) || DOWNLOAD_FILE_PATTERN.test(text);
}
const SELECTOR_VERSION = "2026-07-25";

const INSPECT_SNAPSHOT_EXPRESSION = `(() => {
  const clean = value => String(value || "").replace(/\\s+/g, " ").trim();
  const body = clean(document.body?.innerText);
  const visible = element => Boolean(element && element.getClientRects().length > 0);
  const reportActionLabels = ["下载报表", "导出数据", "下载数据", "下载明细", "导出"];
  return {
    origin: location.origin,
    path: location.pathname,
    title: clean(document.title),
    body: body.slice(0, 20000),
    hasPassword: Boolean(document.querySelector("input[type='password']")),
    hasDateControl: Boolean(document.querySelector(
      "input[placeholder*='日期'], input[placeholder*='开始时间'], input[placeholder*='结束时间'], [class*='date-picker'], [class*='datePicker']"
    )) || ["近1天", "昨天", "昨日"].some(term => body.includes(term)),
    hasReportAction: Array.from(document.querySelectorAll("button, [role='button'], a"))
      .some(element => visible(element) && reportActionLabels.includes(clean(element.textContent)))
  };
})()`;

export function classifyDouyinPageSnapshot(snapshot, {
  expectedStoreId = "",
  expectedStoreName = ""
} = {}) {
  const origin = String(snapshot?.origin || "");
  const pagePath = String(snapshot?.path || "");
  const title = String(snapshot?.title || "");
  const body = String(snapshot?.body || "");
  if (!origin && !pagePath && !title && !body) return { state: "loading" };
  if (
    /^\/login(?:\/|$)/i.test(pagePath)
    || snapshot?.hasPassword === true
    || (pagePath === "/" && /官网/.test(title) && body.includes("产品介绍") && body.includes("入驻"))
  ) {
    return { state: "login_required" };
  }
  const verificationTerms = ["验证码", "图形验证", "拖动滑块", "滑块验证", "扫码登录", "设备验证", "安全验证", "短信验证码", "手机验证码"];
  if (verificationTerms.some(term => body.includes(term))) return { state: "human_verification" };
  if (origin !== "https://compass.jinritemai.com") return { state: "schema_changed" };
  if (
    body.includes("获取菜单失败")
    || (snapshot?.hasDateControl !== true && snapshot?.hasReportAction !== true)
  ) {
    return { state: "loading" };
  }
  const storeName = String(expectedStoreName || "").trim();
  if (storeName && !body.includes(storeName)) return { state: "store_identity_unavailable" };
  return {
    state: "ready",
    ...(stableId(expectedStoreId) ? { storeId: expectedStoreId } : {})
  };
}

const DATE_EXPRESSION = businessDate => `(() => {
  const businessDate = ${JSON.stringify(businessDate)};
  const visible = element => Boolean(element && element.getClientRects().length > 0);
  const clean = value => String(value || "").replace(/\\s+/g, " ").trim();
  const shanghai = new Date(Date.now() + 8 * 60 * 60 * 1000);
  shanghai.setUTCDate(shanghai.getUTCDate() - 1);
  if (businessDate === shanghai.toISOString().slice(0, 10)) {
    const labels = new Set(["近1天", "昨天", "昨日"]);
    const yesterday = Array.from(document.querySelectorAll("button, [role='button'], [role='tab'], label, span"))
      .find(element => visible(element) && labels.has(clean(element.textContent)));
    if (yesterday) {
      yesterday.click();
      return { applied: true, method: "yesterday" };
    }
  }
  const inputs = Array.from(document.querySelectorAll(
    "input[placeholder*='日期'], input[placeholder*='开始时间'], input[placeholder*='结束时间']"
  )).filter(visible).slice(0, 2);
  if (!inputs.length) return { applied: false, errorCode: "DOUYIN_DATE_CONTROL_MISSING" };
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  for (const input of inputs) {
    descriptor?.set?.call(input, businessDate);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true }));
  }
  return { applied: inputs.every(input => String(input.value || "").includes(businessDate)) };
})()`;

const DOWNLOAD_EXPRESSION = resourceType => `(() => {
  const visible = element => Boolean(element && element.getClientRects().length > 0);
  const clean = value => String(value || "").replace(/\\s+/g, " ").trim();
  const labels = new Set(["下载报表", "导出数据", "下载数据", "下载明细", "导出"]);
  const buttons = Array.from(document.querySelectorAll("button, [role='button'], a"))
    .filter(element => visible(element) && labels.has(clean(element.textContent)));
  const target = ${JSON.stringify(resourceType)} === "video_daily"
    ? buttons.find(element => clean(element.parentElement?.parentElement?.textContent).includes("短视频明细"))
    : buttons[0];
  if (!target) return { clicked: false };
  target.click();
  return { clicked: true };
})()`;

const CAPTURE_EXPRESSION = `(() => {
  const visible = element => Boolean(element && element.getClientRects().length > 0);
  const clean = value => String(value || "").replace(/\\s+/g, " ").trim();
  const parseNumber = value => {
    const text = clean(value).replace(/[¥￥,%]/g, "").replace(/,/g, "");
    if (!text || text === "--" || text === "-") return null;
    const match = text.match(/(-?\\d+(?:\\.\\d+)?)\\s*(万|亿)?/);
    if (!match) return null;
    const number = Number(match[1]);
    if (!Number.isFinite(number)) return null;
    return match[2] === "亿" ? number * 100000000 : match[2] === "万" ? number * 10000 : number;
  };
  const labels = {
    transactionAmount: ["成交金额", "支付GMV"],
    transactionOrderCount: ["成交订单数", "支付订单数"],
    transactionBuyerCount: ["成交人数", "支付人数"],
    userPaymentAmount: ["用户实际支付金额", "用户支付金额"],
    settlementAmount: ["结算金额"],
    refundAmountByPaymentDate: ["支付口径退款金额", "退款金额（支付时间）", "退款金额（支付日期）"],
    refundAmountByRefundDate: ["退款口径退款金额", "退款金额（退款时间）", "退款金额（退款日期）"],
    refundOrderCountByPaymentDate: ["支付口径退款订单数", "退款订单数（支付时间）", "退款订单数（支付日期）"],
    refundOrderCountByRefundDate: ["退款口径退款订单数", "退款订单数（退款时间）", "退款订单数（退款日期）"],
    productExposureUsers: ["商品曝光人数", "商品曝光用户数"],
    productClickUsers: ["商品点击人数", "商品点击用户数"]
  };
  const cards = Array.from(document.querySelectorAll(
    "[data-e2e*='metric'], [class*='data-card-wrapper'], [class*='metric'], [class*='indicator']"
  )).filter(visible);
  const facts = {};
  for (const [key, candidates] of Object.entries(labels)) {
    const registered = document.querySelector("[data-metric-key='" + key + "'], [data-e2e-metric='" + key + "']");
    if (visible(registered)) {
      facts[key] = parseNumber(registered.textContent);
      continue;
    }
    facts[key] = null;
    for (const card of cards) {
      const text = clean(card.textContent);
      const label = candidates.find(candidate => text.includes(candidate));
      if (!label) continue;
      const value = parseNumber(text.replace(label, ""));
      if (value !== null) {
        facts[key] = value;
        break;
      }
    }
  }
  return { facts, selectorVersion: "${SELECTOR_VERSION}" };
})()`;

function douyinError(code, message) {
  return Object.assign(new Error(message), { code });
}

function stableId(value) {
  return /^[-_a-zA-Z0-9]{1,128}$/.test(String(value || ""));
}

export function validateDedicatedDouyinTask(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw douyinError("DOUYIN_TASK_INVALID", "抖店任务格式无效。");
  }
  // viaSelfService 决定走自助取数还是逐页导出，属于任务的合法字段。
  const allowed = new Set([...TASK_FIELDS, "viaSelfService"]);
  if (Object.keys(value).some(field => !allowed.has(field))) {
    throw douyinError("DOUYIN_TASK_UNSAFE_FIELDS", "抖店任务包含未登记字段。");
  }
  if (
    value.providerId !== "douyin-ecommerce"
    || !DOUYIN_DEDICATED_RESOURCES[value.resourceType]
    || !stableId(value.jobId)
    || !stableId(value.storeId)
    || !/^\d{4}-\d{2}-\d{2}$/.test(String(value.businessDate || ""))
  ) {
    throw douyinError("DOUYIN_TASK_INVALID", "抖店任务字段无效。");
  }
  return { ...value };
}

function terminalResult(task, kind, errorCode, safeSummary) {
  return {
    kind,
    jobId: task.jobId,
    errorCode,
    safeSummary,
    stage: "opening"
  };
}

function validateStoreCapture(capture) {
  const facts = capture?.facts;
  const keys = facts && typeof facts === "object" && !Array.isArray(facts)
    ? Object.keys(facts)
    : [];
  if (
    keys.length !== STORE_DAILY_FACT_KEYS.length
    || keys.some(key => !STORE_DAILY_FACT_KEYS.includes(key))
    || keys.some(key => facts[key] !== null && !Number.isFinite(facts[key]))
    || !/^\d{4}-\d{2}-\d{2}$/.test(String(capture?.selectorVersion || ""))
  ) {
    throw douyinError("DOUYIN_STORE_CAPTURE_SCHEMA_CHANGED", "抖店店铺指标结构已变化。");
  }
  return {
    facts: Object.fromEntries(STORE_DAILY_FACT_KEYS.map(key => [key, facts[key]])),
    selectorVersion: capture.selectorVersion
  };
}

export function createDouyinDedicatedExecutor({
  createController,
  createExtractRunner = null,
  createExtractApi = null,
  // 轮询的等待也由外部注入，测试才能把 45 分钟的等待压缩成瞬间。
  wait: waitImpl = ms => new Promise(resolve => setTimeout(resolve, ms))
}) {
  if (typeof createController !== "function") {
    throw douyinError("DOUYIN_BROWSER_CONTROLLER_REQUIRED", "抖店专用浏览器控制器未配置。");
  }
  return Object.freeze({
    async executeTask({ task: input, browser, profile = null, onCheckpoint = async () => {} }) {
      const task = validateDedicatedDouyinTask(input);
      if (
        browser?.online !== true
        || browser.profileKey !== `douyin-ecommerce:${task.storeId}`
      ) {
        return terminalResult(
          task,
          "failed",
          "DOUYIN_BROWSER_PROFILE_MISMATCH",
          "专用浏览器 Profile 与店铺不匹配。"
        );
      }
      const resource = DOUYIN_DEDICATED_RESOURCES[task.resourceType];
      const controller = await createController(browser);
      try {
        await controller.open(resource.url);
        await onCheckpoint("opening");
        const inspection = await controller.inspect({
          expectedStoreId: task.storeId,
          expectedStoreName: profile?.storeName
        });
        if (inspection?.state === "login_required") {
          return terminalResult(task, "waiting_human", "DOUYIN_LOGIN_REQUIRED", "请在专用 Chrome 登录抖店后重试。");
        }
        if (inspection?.state === "human_verification") {
          return terminalResult(
            task,
            "waiting_human",
            "DOUYIN_HUMAN_VERIFICATION_REQUIRED",
            "请在专用 Chrome 完成验证码、扫码、滑块或设备确认后重试。"
          );
        }
        if (inspection?.state === "store_identity_unavailable") {
          return terminalResult(
            task,
            "schema_changed",
            "DOUYIN_STORE_IDENTITY_UNAVAILABLE",
            "专用 Chrome 无法确认当前店铺身份。"
          );
        }
        if (inspection?.state !== "ready") {
          return terminalResult(task, "schema_changed", "DOUYIN_PAGE_SCHEMA_CHANGED", "抖店页面结构已变化。");
        }
        if (String(inspection.storeId || "") !== task.storeId) {
          return terminalResult(task, "failed", "DOUYIN_STORE_MISMATCH", "专用 Chrome 当前登录的店铺与任务不一致。");
        }

        // 自助取数走独立通道：它直接调罗盘的取数接口（建任务/查任务/取文件），
        // 不驱动页面表单——表单只能靠视口坐标点，元素动一下就点空且不报错。
        // 它也是唯一能回溯 14 个月、且能拿到成交订单数与成交人数的路径。
        //
        // 请求在页面上下文里发，登录态由专用浏览器自己带，采集器不接触任何凭据。
        if (usesSelfService(task)) {
          // 通道没接线时必须明确失败，不能悄悄退回逐页导出：那条路采回来的是另一个
          // 口径的数据，看起来一切正常，错值却已经入库了。
          if (!createExtractRunner || !createExtractApi) {
            return terminalResult(task, "failed", "DOUYIN_EXTRACT_CHANNEL_UNAVAILABLE", "自助取数通道未接线。");
          }
          await controller.open(SELF_SERVICE_URL);
          await onCheckpoint("waiting_download");
          const api = createExtractApi({ controller, evaluate: controller.evaluate });
          const runner = createExtractRunner({ api, wait: waitImpl });
          const { plan } = await runner.run({
            resourceType: task.resourceType,
            from: task.businessDate,
            to: task.businessDate
          });
          const downloaded = await controller.awaitDownload(plan.taskName);
          if (!downloaded) {
            return terminalResult(task, "failed", "DOUYIN_EXTRACT_DOWNLOAD_MISSING", "取数文件未落盘。");
          }
          return {
            kind: "downloaded",
            jobId: task.jobId,
            filePath: downloaded.filePath,
            safeFileName: downloaded.safeFileName,
            pageType: "shop_compass_self_service",
            reportVersion: "douyin-self-service-v1"
          };
        }

        await controller.applyBusinessDate(task.businessDate);
        await onCheckpoint("waiting_download");
        const download = await controller.downloadOfficialReport({
          resourceType: task.resourceType,
          pageType: resource.pageType,
          reportVersion: resource.reportVersion
        });
        if (download) {
          return {
            kind: "downloaded",
            jobId: task.jobId,
            filePath: download.filePath,
            safeFileName: download.safeFileName,
            pageType: resource.pageType,
            reportVersion: resource.reportVersion
          };
        }
        if (task.resourceType !== "store_daily") {
          return terminalResult(
            task,
            "schema_changed",
            "DOUYIN_OFFICIAL_REPORT_BUTTON_MISSING",
            "抖店官方报表入口不可用。"
          );
        }
        const captured = validateStoreCapture(await controller.captureStoreDaily());
        return {
          kind: "captured",
          jobId: task.jobId,
          resourceType: "store_daily",
          facts: captured.facts,
          pageType: resource.pageType,
          selectorVersion: captured.selectorVersion
        };
      } catch (error) {
        const artifact = await controller.captureFailureArtifact?.().catch(() => null);
        if (Buffer.isBuffer(artifact)) error.localArtifact = artifact;
        throw error;
      } finally {
        controller.close?.();
      }
    }
  });
}

function runtimeValue(result) {
  return result?.result?.value;
}

function safeDownloadName(value) {
  const name = basename(String(value || ""));
  if (!name || name !== value || name === "." || name === ".." || /[\u0000-\u001f\u007f]/.test(name)) {
    throw douyinError("DOUYIN_DOWNLOAD_FILE_INVALID", "抖店下载文件名无效。");
  }
  return name;
}

export function createCdpDouyinController({
  browser,
  downloadsDirectory,
  fetchImpl = fetch,
  createSession = url => new CdpSession(url),
  wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  downloadTimeoutMs = 90_000,
  inspectionTimeoutMs = 12_000
}) {
  const endpoint = normalizeLoopbackEndpoint(browser?.endpoint);
  if (!isAbsolute(downloadsDirectory || "")) {
    throw douyinError("DOUYIN_DOWNLOAD_DIRECTORY_INVALID", "抖店下载目录必须是本机绝对路径。");
  }
  let pageSession = null;

  async function evaluate(expression) {
    if (!pageSession) throw douyinError("DOUYIN_PAGE_NOT_OPEN", "抖店登记页面尚未打开。");
    return runtimeValue(await pageSession.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true
    }));
  }

  // 罗盘的日期控件只认可信事件：element.click() 与合成 MouseEvent 都只改显示，
  // 不进表单模型——实测在自助取数里填好日期后提交仍报「请输入时间」，用真实鼠标
  // 点击同一个格子则校验立刻通过。扩展没有 debugger 权限发不出可信事件，这正是
  // 专用浏览器模式存在的意义：CDP 的 Input 域发出的就是可信事件。
  async function trustedClickAt(x, y) {
    if (!pageSession) throw douyinError("DOUYIN_PAGE_NOT_OPEN", "抖店登记页面尚未打开。");
    const point = { x: Math.round(Number(x)), y: Math.round(Number(y)) };
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0) {
      throw douyinError("DOUYIN_CLICK_POINT_INVALID", "点击坐标无效。");
    }
    const base = { ...point, button: "left", clickCount: 1 };
    await pageSession.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
    await pageSession.send("Input.dispatchMouseEvent", { type: "mousePressed", ...base });
    await pageSession.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...base });
  }

  // 元素位置由页面自己给出，避免在采集器里硬编码坐标——罗盘一改版坐标就失效，
  // 而且失效时不会报错，只会点空。
  //
  // 但「量一次就点」不够：元素在测量与点击之间只要动一下，坐标就落到别处，
  // 而坐标仍在页面内，所以不会报错。这一条今天连着造成三次故障——
  // 粒度选项没选中、日期面板打不开、点 25 号点成了正上方的 18 号（差整整一行），
  // 全因为展开动画或重绘还没停。
  //
  // 所以要等位置稳定：连续两次量到同一个位置才算停了，再点。
  // 还要保证点击坐标真的落在视口里。CDP 的鼠标事件按视口坐标派发，坐标在视口外
  // 就什么都点不到，而且不会报错。实测日期面板展开在页面底部：视口高 1092，
  // 面板占 925~1218，25 号格子在 y=1109，整行都在屏幕外，
  // elementFromPoint 返回 null——点了等于没点。
  async function measureElement(selectorExpression) {
    return evaluate(`(() => {
      const target = ${selectorExpression};
      if (!target) return null;
      let rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const outside = r => {
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        return x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight;
      };
      if (outside(rect)) {
        target.scrollIntoView({ block: "center", inline: "center" });
        rect = target.getBoundingClientRect();
      }
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        offscreen: outside(rect)
      };
    })()`);
  }

  async function trustedClickElement(selectorExpression, missingCode, missingMessage) {
    let previous = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const box = await measureElement(selectorExpression);
      if (!box) throw douyinError(missingCode, missingMessage);
      if (box.offscreen) {
        // 滚过之后仍在视口外：继续点只会点到空白处，还会顺手关掉弹层。
        if (attempt >= 6) {
          throw douyinError(
            "DOUYIN_ELEMENT_OFFSCREEN",
            `${missingMessage}（元素在视口外 x=${Math.round(box.x)} y=${Math.round(box.y)}，滚动后仍无法点击）`
          );
        }
        previous = null;
        await new Promise(resolve => setTimeout(resolve, 250));
        continue;
      }
      if (previous && Math.abs(previous.x - box.x) < 1 && Math.abs(previous.y - box.y) < 1) {
        await trustedClickAt(box.x, box.y);
        return box;
      }
      previous = box;
      await new Promise(resolve => setTimeout(resolve, 180));
    }
    throw douyinError(
      "DOUYIN_ELEMENT_NOT_SETTLED",
      `${missingMessage}（元素位置持续变动，无法安全点击）`
    );
  }

  // 文本同样要用可信事件写入。今天在快麦与罗盘上反复验证：程序化写 value 只改显示，
  // 提交时表单模型里还是旧值，而且不报错——这是最难察觉的一类故障。
  async function trustedTypeText(text) {
    if (!pageSession) throw douyinError("DOUYIN_PAGE_NOT_OPEN", "抖店登记页面尚未打开。");
    for (const char of String(text)) {
      await pageSession.send("Input.dispatchKeyEvent", { type: "keyDown", text: char });
      await pageSession.send("Input.dispatchKeyEvent", { type: "keyUp" });
    }
  }

  // 清空输入框。实测 CDP 的全选组合键（Ctrl 与 Meta 都试过）在罗盘的输入框上不生效：
  // 新文本被插在光标处而不是覆盖，任务名称先超出 40 字上限，表单卡在
  // 「任务名称已达字符上限」不再往下渲染，后续所有控件都找不到。表现却是
  // GRANULARITY_MISSING，与真正原因隔了好几步——这类连锁误导只有真跑才看得见。
  //
  // 因此改用最笨也最可靠的方式：先把光标移到末尾，再按住退格逐字符删空。
  async function trustedClearAndType(selectorExpression, text, missingCode, missingMessage) {
    await trustedClickElement(selectorExpression, missingCode, missingMessage);
    const current = await evaluate(`(() => {
      const el = document.activeElement;
      return el && typeof el.value === "string" ? el.value.length : 0;
    })()`);
    const length = Number(current) || 0;
    for (const key of ["End", "ArrowRight"]) {
      await pageSession.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: key === "End" ? 35 : 39 });
      await pageSession.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: key === "End" ? 35 : 39 });
    }
    // 多删几次留余量：光标位置无法完全确定，多按的退格作用在空串上无副作用。
    for (let index = 0; index < length + 8; index += 1) {
      await pageSession.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
      await pageSession.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
    }
    await trustedTypeText(text);
    // 写完必须核对：写歪了会连锁触发别处的报错，在那里才发现就晚了。
    const written = await evaluate(`(() => {
      const el = document.activeElement;
      return el && typeof el.value === "string" ? el.value : "";
    })()`);
    if (String(written) !== String(text)) {
      throw douyinError("DOUYIN_EXTRACT_TEXT_NOT_APPLIED", `输入框内容为「${written}」，与预期「${text}」不符。`);
    }
  }

  return Object.freeze({
    // 表单驱动需要读页面状态（日历月份、表单校验结果），因此对外暴露。
    // 此前只在控制器内部可见，接线时才发现缺口——又一处 stub 测试抓不到的问题。
    evaluate,
    trustedClickAt,
    trustedClickElement,
    trustedTypeText,
    trustedClearAndType,
    async open(url) {
      if (!isRegisteredDouyinUrl(url)) {
        throw douyinError("DOUYIN_URL_NOT_REGISTERED", "抖店页面未在采集器登记。");
      }
      const response = await fetchImpl(`${endpoint}/json`);
      if (!response.ok) throw douyinError("DOUYIN_BROWSER_UNAVAILABLE", "无法读取专用 Chrome 页面。");
      const pages = await response.json();
      let page = pages.find(item => item.type === "page" && item.url?.split("#")[0] === url);
      if (!page) {
        const created = await fetchImpl(`${endpoint}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
        if (!created.ok) throw douyinError("DOUYIN_PAGE_OPEN_FAILED", "专用 Chrome 无法打开抖店登记页面。");
        page = await created.json();
      }
      if (!page?.webSocketDebuggerUrl) {
        throw douyinError("DOUYIN_PAGE_OPEN_FAILED", "抖店登记页面没有可用的本机调试会话。");
      }
      pageSession?.close?.();
      pageSession = createSession(page.webSocketDebuggerUrl);
      await wait(800);
    },
    async inspect({ expectedStoreId, expectedStoreName = "" }) {
      if (!stableId(expectedStoreId)) {
        throw douyinError("DOUYIN_STORE_ID_INVALID", "抖店店铺标识无效。");
      }
      const deadline = Date.now() + inspectionTimeoutMs;
      while (true) {
        const result = classifyDouyinPageSnapshot(
          await evaluate(INSPECT_SNAPSHOT_EXPRESSION),
          { expectedStoreId, expectedStoreName }
        );
        if (result.state !== "loading") return result;
        if (Date.now() >= deadline) return { state: "schema_changed" };
        await wait(500);
      }
    },
    async applyBusinessDate(businessDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(businessDate || ""))) {
        throw douyinError("DOUYIN_DATE_INVALID", "抖店业务日期无效。");
      }
      const result = await evaluate(DATE_EXPRESSION(businessDate));
      if (!result?.applied) {
        throw douyinError(
          result?.errorCode || "DOUYIN_DATE_RANGE_NOT_APPLIED",
          "抖店报表日期未生效。"
        );
      }
      await wait(1_500);
    },
    // 等待一次下载完成。自助取数与逐页导出都需要它，因此抽成公开方法：
    // 此前执行器调用的是 controller.awaitDownload?.()，而控制器并没有这个方法，
    // 可选链让它静默返回 undefined，再被判成「文件未落盘」——自助取数会 100% 失败，
    // 且失败原因具有误导性。测试没抓到，是因为 stub 里提供了这个方法。
    async awaitDownload(triggerLabel = "") {
      const versionResponse = await fetchImpl(`${endpoint}/json/version`);
      if (!versionResponse.ok) throw douyinError("DOUYIN_BROWSER_UNAVAILABLE", "无法读取专用 Chrome 下载会话。");
      const browserTarget = await versionResponse.json();
      if (!browserTarget?.webSocketDebuggerUrl) {
        throw douyinError("DOUYIN_BROWSER_UNAVAILABLE", "专用 Chrome 下载会话不可用。");
      }
      const browserSession = createSession(browserTarget.webSocketDebuggerUrl);
      let guid = "";
      let suggestedFilename = "";
      let resolveDownload;
      let rejectDownload;
      const completed = new Promise((resolve, reject) => {
        resolveDownload = resolve;
        rejectDownload = reject;
      });
      const unsubscribeBegin = browserSession.on("Browser.downloadWillBegin", event => {
        guid = String(event.guid || "");
        suggestedFilename = String(event.suggestedFilename || "");
      });
      const unsubscribeProgress = browserSession.on("Browser.downloadProgress", event => {
        if (guid && event.guid !== guid) return;
        if (event.state === "completed") resolveDownload();
        if (event.state === "canceled") rejectDownload(
          douyinError("DOUYIN_DOWNLOAD_CANCELLED", `抖店下载被取消（${triggerLabel}）。`)
        );
      });
      const timeout = setTimeout(() => {
        rejectDownload(douyinError("DOUYIN_DOWNLOAD_TIMEOUT", `抖店下载超时（${triggerLabel}）。`));
      }, downloadTimeoutMs);
      try {
        await browserSession.send("Browser.setDownloadBehavior", {
          behavior: "allow",
          downloadPath: downloadsDirectory,
          eventsEnabled: true
        });
        await completed;
        const safeFileName = safeDownloadName(suggestedFilename);
        return { filePath: join(downloadsDirectory, safeFileName), safeFileName };
      } finally {
        clearTimeout(timeout);
        unsubscribeBegin?.();
        unsubscribeProgress?.();
        browserSession.close?.();
      }
    },

    async downloadOfficialReport({ resourceType, pageType, reportVersion }) {
      const resource = DOUYIN_DEDICATED_RESOURCES[resourceType];
      if (!resource || resource.pageType !== pageType || resource.reportVersion !== reportVersion) {
        throw douyinError("DOUYIN_REPORT_NOT_REGISTERED", "抖店官方报表未登记。");
      }
      const versionResponse = await fetchImpl(`${endpoint}/json/version`);
      if (!versionResponse.ok) throw douyinError("DOUYIN_BROWSER_UNAVAILABLE", "无法读取专用 Chrome 下载会话。");
      const browserTarget = await versionResponse.json();
      if (!browserTarget?.webSocketDebuggerUrl) {
        throw douyinError("DOUYIN_BROWSER_UNAVAILABLE", "专用 Chrome 下载会话不可用。");
      }
      const browserSession = createSession(browserTarget.webSocketDebuggerUrl);
      let guid = "";
      let suggestedFilename = "";
      let resolveDownload;
      let rejectDownload;
      const completed = new Promise((resolve, reject) => {
        resolveDownload = resolve;
        rejectDownload = reject;
      });
      const unsubscribeBegin = browserSession.on("Browser.downloadWillBegin", event => {
        guid = String(event.guid || "");
        suggestedFilename = String(event.suggestedFilename || "");
      });
      const unsubscribeProgress = browserSession.on("Browser.downloadProgress", event => {
        if (guid && event.guid !== guid) return;
        if (event.state === "completed") resolveDownload();
        if (event.state === "canceled") rejectDownload(
          douyinError("DOUYIN_DOWNLOAD_CANCELLED", "抖店官方报表下载被取消。")
        );
      });
      const timeout = setTimeout(() => {
        rejectDownload(douyinError("DOUYIN_DOWNLOAD_TIMEOUT", "抖店官方报表下载超时。"));
      }, downloadTimeoutMs);
      try {
        await browserSession.send("Browser.setDownloadBehavior", {
          behavior: "allow",
          downloadPath: downloadsDirectory,
          eventsEnabled: true
        });
        const clicked = await evaluate(DOWNLOAD_EXPRESSION(resourceType));
        if (!clicked?.clicked) return null;
        await completed;
        const safeFileName = safeDownloadName(suggestedFilename);
        return {
          filePath: join(downloadsDirectory, safeFileName),
          safeFileName
        };
      } finally {
        clearTimeout(timeout);
        unsubscribeBegin();
        unsubscribeProgress();
        browserSession.close?.();
      }
    },
    async captureStoreDaily() {
      return evaluate(CAPTURE_EXPRESSION);
    },
    async captureFailureArtifact() {
      if (!pageSession) return null;
      const result = await pageSession.send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: false
      });
      return result?.data ? Buffer.from(result.data, "base64") : null;
    },
    close() {
      pageSession?.close?.();
      pageSession = null;
    }
  });
}
import { basename, isAbsolute, join } from "node:path";

import { CdpSession } from "../../../browser-runtime/cdp.mjs";
import { normalizeLoopbackEndpoint } from "../../../browser-runtime/managed-chrome.mjs";
