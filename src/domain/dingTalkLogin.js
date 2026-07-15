export function detectDingTalkEnvironment(win = window) {
  const params = new URLSearchParams(win.location?.search || "");
  const corpId = params.get("corpId") || params.get("corpid") || win.dd?.corpId || "";
  const ua = win.navigator?.userAgent || "";
  return {
    corpId,
    inDingTalk: /DingTalk|AliApp\(DingTalk/i.test(ua),
    hasAuthApi: hasDingAuthApi(win.dd)
  };
}

export function hasDingAuthApi(api = window.dd) {
  return !!(api && (api.runtime?.permission?.requestAuthCode || api.getAuthCode));
}

export function waitForDingApi(win = window, timeout = 6000) {
  return new Promise((resolve, reject) => {
    if (hasDingAuthApi(win.dd)) {
      resolve(win.dd);
      return;
    }
    const started = Date.now();
    const timer = win.setInterval(() => {
      if (hasDingAuthApi(win.dd)) {
        win.clearInterval(timer);
        resolve(win.dd);
        return;
      }
      if (Date.now() - started >= timeout) {
        win.clearInterval(timer);
        reject(new Error("钉钉 JSAPI 未加载完成，请从钉钉工作台重新打开。"));
      }
    }, 150);
  });
}

export function requestDingAuthCode(corpId, win = window) {
  return new Promise((resolve, reject) => {
    const api = win.dd;
    if (!api) {
      reject(new Error("未检测到钉钉 JSAPI"));
      return;
    }
    const done = result => {
      const code = result?.code || result?.authCode;
      if (code) resolve(code);
      else reject(new Error("钉钉未返回免登授权码"));
    };
    const fail = error => reject(new Error(typeof error === "string" ? error : JSON.stringify(error || {})));
    const run = () => {
      if (api.runtime?.permission?.requestAuthCode) {
        api.runtime.permission.requestAuthCode({ corpId, onSuccess: done, onFail: fail });
        return;
      }
      if (api.getAuthCode) {
        api.getAuthCode({ corpId, success: done, fail });
        return;
      }
      fail("当前钉钉 JSAPI 不支持免登授权码");
    };
    if (api.ready) api.ready(run);
    else run();
    if (api.error) api.error(fail);
  });
}

export async function loginWithDingTalkRuntime(win = window) {
  const env = detectDingTalkEnvironment(win);
  if (!env.inDingTalk) return null;
  if (!env.corpId) throw new Error("缺少 corpId，无法请求钉钉免登码。");
  if (!env.hasAuthApi) await waitForDingApi(win);
  const authCode = await requestDingAuthCode(env.corpId, win);
  const response = await fetch("/api/auth/dingtalk/embedded", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ authCode, corpId: env.corpId })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "钉钉服务端登录失败");
  return payload.user || null;
}
