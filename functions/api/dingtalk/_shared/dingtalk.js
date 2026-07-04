const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type"
};

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS
  });
}

export function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: JSON_HEADERS
  });
}

export function getDingCredentials(env = {}) {
  const appKey = env.DINGTALK_APP_KEY || env.DINGTALK_CLIENT_ID || "";
  const appSecret = env.DINGTALK_APP_SECRET || env.DINGTALK_CLIENT_SECRET || "";
  const missing = [];
  if (!appKey) missing.push("DINGTALK_APP_KEY");
  if (!appSecret) missing.push("DINGTALK_APP_SECRET");
  return { appKey, appSecret, missing };
}

export function buildConfigResponse(env = {}, origin = "") {
  const { missing } = getDingCredentials(env);
  const normalizedOrigin = String(origin || "").replace(/\/$/, "");
  return {
    configured: missing.length === 0,
    missing,
    callbackUrl: `${normalizedOrigin}/?corpId=$CORPID$`
  };
}

export async function getDingAccessToken(env = {}, fetchImpl = fetch) {
  const { appKey, appSecret, missing } = getDingCredentials(env);
  if (missing.length) {
    const err = new Error(`缺少钉钉应用配置：${missing.join("、")}`);
    err.status = 501;
    throw err;
  }
  const url = `https://oapi.dingtalk.com/gettoken?appkey=${encodeURIComponent(appKey)}&appsecret=${encodeURIComponent(appSecret)}`;
  const res = await fetchImpl(url);
  const data = await res.json();
  if (!res.ok || data.errcode !== 0) {
    const err = new Error(data.errmsg || "获取钉钉 access_token 失败");
    err.status = 502;
    err.detail = data;
    throw err;
  }
  return data.access_token;
}

export async function getDingUserByCode(accessToken, authCode, fetchImpl = fetch) {
  const res = await fetchImpl(`https://oapi.dingtalk.com/topapi/v2/user/getuserinfo?access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: authCode })
  });
  const data = await res.json();
  if (!res.ok || data.errcode !== 0) {
    const err = new Error(data.errmsg || "通过免登码获取用户失败");
    err.status = 502;
    err.detail = data;
    throw err;
  }
  return data.result || {};
}

export async function getDingUserDetail(accessToken, userid, fetchImpl = fetch) {
  if (!userid) return {};
  const res = await fetchImpl(`https://oapi.dingtalk.com/topapi/v2/user/get?access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userid, language: "zh_CN" })
  });
  const data = await res.json();
  if (!res.ok || data.errcode !== 0) return {};
  return data.result || {};
}

export function mapDingRole(user = {}) {
  const roleNames = (user.role_list || []).map(role => `${role.group_name || ""} ${role.name || ""}`).join(" ");
  const text = [
    user.name,
    user.title,
    user.org_email,
    user.work_place,
    user.remark,
    roleNames,
    user.extension
  ].filter(Boolean).join(" ");
  if (user.boss || user.admin || /老板|总经理|管理员|负责人|高层|管理层|创始人/i.test(text)) return "executive";
  if (/产品|产品经理|研发|项目/i.test(text)) return "product";
  if (/运营|店长|投放|直播|内容/i.test(text)) return "ops";
  if (/客服|售后|用户/i.test(text)) return "service";
  if (/品牌|设计|视觉|内容/i.test(text)) return "brand";
  if (/供应链|采购|仓储|物流|工厂|生产/i.test(text)) return "supply";
  if (/财务|会计|出纳|利润|成本/i.test(text)) return "finance";
  return "readonly";
}

export function publicUser(basic = {}, detail = {}) {
  return {
    userid: detail.userid || basic.userid || "",
    unionid: detail.unionid || basic.unionid || "",
    name: detail.name || basic.name || basic.userid || "",
    avatar: detail.avatar || "",
    title: detail.title || "",
    mobileMasked: detail.mobile ? `${String(detail.mobile).slice(0, 3)}****${String(detail.mobile).slice(-4)}` : "",
    deptIds: detail.dept_id_list || [],
    roles: detail.role_list || []
  };
}

export async function loginWithDingTalk({ authCode, corpId }, env = {}, fetchImpl = fetch) {
  if (!authCode) {
    const err = new Error("缺少钉钉免登授权码 authCode");
    err.status = 400;
    throw err;
  }
  const accessToken = await getDingAccessToken(env, fetchImpl);
  const basic = await getDingUserByCode(accessToken, authCode, fetchImpl);
  const detail = await getDingUserDetail(accessToken, basic.userid, fetchImpl);
  const user = publicUser(basic, detail);
  const role = mapDingRole({ ...basic, ...detail });
  return {
    role,
    user,
    org: { corpId: corpId || "", deptIds: user.deptIds, roles: user.roles }
  };
}
