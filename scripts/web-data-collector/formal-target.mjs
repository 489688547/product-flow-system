export function assertFormalCollectorTarget({ baseUrl, allowLocalProbe = false } = {}) {
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
    throw Object.assign(new Error("正式采集服务只允许写入已登记的阿里云 ECS 入口。"), {
      code: "EGO_FORMAL_TARGET_NOT_ALIYUN"
    });
  }
}
