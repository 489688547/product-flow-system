import { normalizeRecognizedShops } from "../../../src/domain/dataConnections.js";

export const DOUYIN_LOGIN_URL = "https://fxg.jinritemai.com/login/common?channel=zhaoshang";
const DOUYIN_ORIGIN = "https://fxg.jinritemai.com";
const HUMAN_VERIFICATION = /(?:请输入(?:图形|短信)?验证码|拖动.{0,12}滑块|扫码登录|请.{0,12}扫码|短信验证|设备确认|安全验证|风险验证)/i;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function validOrigin(value) {
  try { return new URL(value).origin === DOUYIN_ORIGIN; } catch { return false; }
}

export function normalizeDouyinShopCandidates(value) {
  return normalizeRecognizedShops(value);
}

export function classifyDouyinLoginPage(page = {}) {
  if (!validOrigin(page.url)) return { status: "invalid_origin", shops: [] };
  if (page.readyState && page.readyState !== "complete") return { status: "loading", shops: [] };
  if (page.requiresAgreement) return { status: "waiting_human_verification", shops: [] };
  if (HUMAN_VERIFICATION.test(String(page.text || ""))) return { status: "waiting_human_verification", shops: [] };
  const shops = normalizeDouyinShopCandidates(page.shops);
  if (shops.length) return { status: "authenticated", shops };
  const inputs = Array.isArray(page.inputs) ? page.inputs : [];
  const hasLoginInput = inputs.some(input => ["email", "password", "mobile", "mobilecaptcha"].includes(String(input?.name || "").toLowerCase())
    || ["email", "password", "number", "tel"].includes(String(input?.type || "").toLowerCase()));
  if (hasLoginInput || /(?:手机登录|邮箱登录|账号登录|密码登录|登录)/i.test(String(page.text || ""))) return { status: "login_form", shops: [] };
  if (!String(page.text || "").trim()) return { status: "loading", shops: [] };
  return { status: "schema_changed", shops: [] };
}

const INSPECT_EXPRESSION = `(() => {
  const text = (document.body?.innerText || '').slice(0, 30000);
  const byId = new Map();
  const add = (shopId, shopName, shopAvatarUrl = '') => {
    shopId = String(shopId || '').trim();
    shopName = String(shopName || '').trim();
    if (shopId && shopName) byId.set(shopId, { shopId, shopName, shopAvatarUrl: String(shopAvatarUrl || '').trim() });
  };
  document.querySelectorAll('[data-shop-id]').forEach(node => add(
    node.getAttribute('data-shop-id'),
    node.getAttribute('data-shop-name') || node.querySelector('[data-shop-name]')?.textContent || node.textContent,
    node.getAttribute('data-shop-avatar') || node.querySelector('img')?.src
  ));
  document.querySelectorAll('a[href*="shop_id="],a[href*="shopId="]').forEach(node => {
    try {
      const url = new URL(node.href, location.href);
      add(url.searchParams.get('shop_id') || url.searchParams.get('shopId'), node.getAttribute('title') || node.textContent, node.querySelector('img')?.src);
    } catch {}
  });
  const inputs = Array.from(document.querySelectorAll('input')).map(node => ({
    type: String(node.type || '').toLowerCase(),
    name: String(node.name || '').toLowerCase(),
    placeholder: String(node.placeholder || '')
  }));
  return { url: location.href, title: document.title, readyState: document.readyState, text, inputs, shops: [...byId.values()] };
})()`;

const SWITCH_TO_EMAIL_EXPRESSION = `(() => {
  const candidates = Array.from(document.querySelectorAll('button,[role="tab"],[role="button"],div,span'))
    .filter(node => (node.textContent || '').trim() === '邮箱登录');
  const target = candidates.find(node => node.matches('button,[role="tab"],[role="button"]')) || candidates.at(-1);
  if (target) target.click();
  return { switched: Boolean(target) };
})()`;

function fillExpression(loginEmail, password) {
  return `(async () => {
    const setValue = (input, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(input, value); else input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const email = document.querySelector('input[type="email"], input[placeholder*="邮箱"], input[name*="email" i], input[autocomplete="email"], input[autocomplete="username"]');
    const secret = document.querySelector('input[type="password"], input[placeholder*="密码"], input[autocomplete="current-password"]');
    if (email) setValue(email, ${JSON.stringify(loginEmail)});
    if (secret) setValue(secret, ${JSON.stringify(password)});
    const agreement = document.querySelector('input[type="checkbox"]');
    for (let frame = 0; frame < 20; frame += 1) {
      const ready = document.querySelector('button[type="submit"]:not(:disabled), [role="button"][data-e2e*="login"]:not([aria-disabled="true"])')
        || Array.from(document.querySelectorAll('button,[role="button"]')).find(node => /^(?:登录|立即登录|确认登录)$/.test((node.textContent || '').trim()) && !node.disabled);
      if (ready) break;
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    const submit = document.querySelector('button[type="submit"], [role="button"][data-e2e*="login"]')
      || Array.from(document.querySelectorAll('button,[role="button"]')).find(node => /^(?:登录|立即登录|确认登录)$/.test((node.textContent || '').trim()));
    if (email && secret && submit && !submit.disabled) submit.click();
    return {
      filled: Boolean(email && secret),
      submitted: Boolean(email && secret && submit && !submit.disabled),
      agreementRequired: Boolean(agreement && !agreement.checked)
    };
  })()`;
}

function hasEmailPasswordInputs(page) {
  const inputs = Array.isArray(page?.inputs) ? page.inputs : [];
  return inputs.some(input => input.name === "email" || input.type === "email")
    && inputs.some(input => input.name === "password" || input.type === "password");
}

async function waitForPage(browser, pageId, predicate, { wait, maxPolls, intervalMs }) {
  let page;
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    page = await browser.evaluate(pageId, INSPECT_EXPRESSION);
    if (predicate(page)) return page;
    if (attempt < maxPolls - 1) await wait(intervalMs);
  }
  return page;
}

export async function openAndFillDouyin(browser, credentials, options = {}) {
  if (credentials.loginUrl !== DOUYIN_LOGIN_URL) throw new Error("抖音登录地址不在允许范围内。");
  if (credentials.platformId && credentials.platformId !== "douyin-ecommerce") throw new Error("凭证平台与抖音任务不一致。");
  if (credentials.credentialSchemaId && credentials.credentialSchemaId !== "email-password-v1") throw new Error("抖音凭证结构不受支持。");
  const login = {
    loginEmail: credentials.accountLabel || credentials.loginEmail,
    password: credentials.credentials?.password || credentials.password
  };
  if (!login.loginEmail || !login.password) throw new Error("抖音登录凭证不完整。");
  if (typeof browser.openAndFill === "function") return browser.openAndFill(DOUYIN_LOGIN_URL, login);
  const wait = options.wait || delay;
  const maxLoadPolls = Number.isFinite(options.maxLoadPolls) ? options.maxLoadPolls : 40;
  const maxTransitionPolls = Number.isFinite(options.maxTransitionPolls) ? options.maxTransitionPolls : 120;
  const page = await browser.open(DOUYIN_LOGIN_URL);
  let snapshot = await waitForPage(browser, page.id, current => classifyDouyinLoginPage(current).status !== "loading", {
    wait, maxPolls: maxLoadPolls, intervalMs: 250
  });
  const initialStatus = classifyDouyinLoginPage(snapshot).status;
  if (["authenticated", "waiting_human_verification"].includes(initialStatus)) return snapshot;
  if (!hasEmailPasswordInputs(snapshot)) {
    await browser.evaluate(page.id, SWITCH_TO_EMAIL_EXPRESSION);
    snapshot = await waitForPage(browser, page.id, current => hasEmailPasswordInputs(current), {
      wait, maxPolls: maxLoadPolls, intervalMs: 250
    });
  }
  if (!hasEmailPasswordInputs(snapshot)) {
    const error = new Error("抖音邮箱登录表单未出现。");
    error.code = "PROVIDER_LOGIN_FORM_CHANGED";
    throw error;
  }
  const fill = await browser.evaluate(page.id, fillExpression(login.loginEmail, login.password));
  if (fill?.filled && fill?.agreementRequired) return { ...snapshot, requiresAgreement: true };
  if (!fill?.filled || !fill?.submitted) {
    const error = new Error("抖音登录表单未能提交。");
    error.code = "PROVIDER_LOGIN_FORM_CHANGED";
    throw error;
  }
  snapshot = await waitForPage(browser, page.id, current => {
    const status = classifyDouyinLoginPage(current).status;
    return !["loading", "login_form"].includes(status);
  }, { wait, maxPolls: maxTransitionPolls, intervalMs: 500 });
  return snapshot;
}

export async function inspectDouyin(browser, pageId) {
  if (typeof browser.inspect === "function") return browser.inspect(pageId);
  return browser.evaluate(pageId, INSPECT_EXPRESSION);
}

export const douyinEcommerceProvider = Object.freeze({
  id: "douyin-ecommerce",
  taskTypes: Object.freeze(["douyin_login_verification"]),
  resourceTypes: Object.freeze(["connection_identity"]),
  loginUrl: DOUYIN_LOGIN_URL,
  validateTask(task) {
    if (task.loginUrl !== DOUYIN_LOGIN_URL) throw new Error("抖音登录地址不在允许范围内。");
  },
  classify: classifyDouyinLoginPage,
  openAndFill: openAndFillDouyin,
  inspect: inspectDouyin
});
