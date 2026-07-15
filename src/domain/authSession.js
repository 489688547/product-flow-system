export async function fetchAuthSession() {
  const response = await fetch("/api/auth/session", {
    method: "GET",
    credentials: "same-origin",
    headers: { accept: "application/json" }
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) return { authenticated: false, user: null };
  if (!response.ok) throw new Error(payload.message || "登录状态检查失败，请刷新重试。");
  return payload;
}

export async function logoutAuthSession() {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "application/json" }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "退出账号失败，请重试。");
  return payload;
}
