import { TriangleAlert } from "lucide-react";

export function LocalOnlineEnvironmentBanner({ sessionUser }) {
  if (sessionUser?.loginMode !== "local-online-account") return null;
  const isSandbox = import.meta.env.VITE_LOCAL_D1_SANDBOX === "1";
  return (
    <div className="local-online-environment" role="status">
      <TriangleAlert size={18} aria-hidden="true" />
      <strong>{isSandbox ? "本地沙箱 · 本地数据" : "本地代码 · 线上真实环境"}</strong>
      <span>{isSandbox
        ? `当前账号：${sessionUser.name}。写入只影响本机，外部平台操作不可用。`
        : `当前账号：${sessionUser.name}。数据修改、钉钉和快麦操作都会立即在线上生效。`}</span>
    </div>
  );
}
