import { TriangleAlert } from "lucide-react";

export function LocalOnlineEnvironmentBanner({ sessionUser }) {
  if (sessionUser?.loginMode !== "local-online-account") return null;
  return (
    <div className="local-online-environment" role="status">
      <TriangleAlert size={18} aria-hidden="true" />
      <strong>本地代码 · 线上真实环境</strong>
      <span>当前账号：{sessionUser.name}。数据修改、钉钉和快麦操作都会立即在线上生效。</span>
    </div>
  );
}
