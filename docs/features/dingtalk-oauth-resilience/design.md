# 钉钉 OAuth 冷启动韧性交互设计

## 流程

```text
静态开始页
  → GET /api/auth/dingtalk/bootstrap
  → 服务端写 OAuth state Cookie
  → 钉钉授权页
  → 静态回调页
  → GET /api/auth/dingtalk/complete
  → 服务端校验 state、建立会话
  → 返回系统内安全地址
```

静态页只显示“正在连接钉钉”或“正在完成登录”。首次冷启动失败时自动重试，不暴露 Cloudflare
错误页。超过重试次数后显示明确原因和键盘可操作的“重新尝试”按钮。

## 可访问性与安全

- 状态区域使用 `role=status` 与 `aria-live=polite`。
- 按钮具有清晰焦点环，尊重 `prefers-reduced-motion`。
- 页面设置 `no-referrer`，不把回调 code/state 发送给第三方资源。
- returnTo 仅接受同源绝对路径；协议地址与 `//` 开头地址被拒绝。
- 浏览器不读取 OAuth state、平台 Secret 或服务器会话。
