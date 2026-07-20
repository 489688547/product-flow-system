import { normalizeRecognizedShops } from "../../../src/domain/dataConnections.js";

export const DOUYIN_LOGIN_URL = "https://fxg.jinritemai.com/login/common?channel=zhaoshang";
const DOUYIN_ORIGIN = "https://fxg.jinritemai.com";
const HUMAN_VERIFICATION = /(?:验证码|滑块|扫码|短信验证|设备确认|安全验证|风险验证)/i;

function validOrigin(value) {
  try { return new URL(value).origin === DOUYIN_ORIGIN; } catch { return false; }
}

export function normalizeDouyinShopCandidates(value) {
  return normalizeRecognizedShops(value);
}

export function classifyDouyinLoginPage(page = {}) {
  if (!validOrigin(page.url)) return { status: "invalid_origin", shops: [] };
  if (HUMAN_VERIFICATION.test(String(page.text || ""))) return { status: "waiting_human_verification", shops: [] };
  const shops = normalizeDouyinShopCandidates(page.shops);
  if (shops.length) return { status: "authenticated", shops };
  if (/(?:邮箱登录|账号登录|密码登录|登录)/i.test(String(page.text || ""))) return { status: "login_form", shops: [] };
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
  return { url: location.href, title: document.title, text, shops: [...byId.values()] };
})()`;

function fillExpression(loginEmail, password) {
  return `(() => {
    const setValue = (input, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(input, value); else input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const email = document.querySelector('input[type="email"], input[placeholder*="邮箱"], input[name*="email" i], input[autocomplete="username"]');
    const secret = document.querySelector('input[type="password"], input[placeholder*="密码"], input[autocomplete="current-password"]');
    if (email) setValue(email, ${JSON.stringify(loginEmail)});
    if (secret) setValue(secret, ${JSON.stringify(password)});
    const submit = document.querySelector('button[type="submit"], [role="button"][data-e2e*="login"]')
      || Array.from(document.querySelectorAll('button,[role="button"]')).find(node => /^(?:登录|立即登录|确认登录)$/.test((node.textContent || '').trim()));
    if (email && secret && submit && !submit.disabled) submit.click();
    return { filled: Boolean(email && secret), submitted: Boolean(email && secret && submit) };
  })()`;
}

export async function openAndFillDouyin(browser, credentials) {
  if (credentials.loginUrl !== DOUYIN_LOGIN_URL) throw new Error("抖音登录地址不在允许范围内。");
  if (credentials.platformId && credentials.platformId !== "douyin-ecommerce") throw new Error("凭证平台与抖音任务不一致。");
  if (credentials.credentialSchemaId && credentials.credentialSchemaId !== "email-password-v1") throw new Error("抖音凭证结构不受支持。");
  const login = {
    loginEmail: credentials.accountLabel || credentials.loginEmail,
    password: credentials.credentials?.password || credentials.password
  };
  if (!login.loginEmail || !login.password) throw new Error("抖音登录凭证不完整。");
  if (typeof browser.openAndFill === "function") return browser.openAndFill(DOUYIN_LOGIN_URL, login);
  const page = await browser.open(DOUYIN_LOGIN_URL);
  await browser.evaluate(page.id, fillExpression(login.loginEmail, login.password));
  return browser.evaluate(page.id, INSPECT_EXPRESSION);
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
