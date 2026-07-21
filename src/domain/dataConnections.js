export const DOUYIN_ECOMMERCE = Object.freeze({
  id: "douyin-ecommerce",
  name: "抖音电商",
  loginUrl: "https://fxg.jinritemai.com/login/common?channel=zhaoshang",
  editableFields: Object.freeze(["loginEmail", "password"]),
  loginUrlFrom: () => "https://fxg.jinritemai.com/login/common?channel=zhaoshang"
});

const DISPLAY_STATES = Object.freeze({
  queued: { label: "网页登录已停用", tone: "muted" },
  claimed: { label: "网页登录已停用", tone: "muted" },
  waiting_human_verification: { label: "请在抖音页面完成人工验证", tone: "warning" },
  recognizing: { label: "正在识别店铺", tone: "pending" },
  connected: { label: "已连接", tone: "success" },
  succeeded: { label: "已连接", tone: "success" },
  failed: { label: "登录验证失败", tone: "danger" },
  disabled: { label: "已停用", tone: "muted" }
});

export function normalizeLoginEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error("请输入有效的登录邮箱。");
  }
  return email;
}

export function normalizeRecognizedShops(shops = []) {
  const byId = new Map();
  for (const shop of Array.isArray(shops) ? shops : []) {
    const shopId = String(shop?.shopId || "").trim();
    const shopName = String(shop?.shopName || "").trim();
    if (!shopId || !shopName) continue;
    byId.set(shopId, {
      shopId,
      shopName,
      shopAvatarUrl: String(shop?.shopAvatarUrl || "").trim()
    });
  }
  return [...byId.values()].sort((left, right) => left.shopId.localeCompare(right.shopId));
}

export function connectionDisplayState(connection = {}) {
  return DISPLAY_STATES[connection.status] || { label: "等待登录确认", tone: "pending" };
}
