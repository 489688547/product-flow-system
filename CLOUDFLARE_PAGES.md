# Cloudflare Pages 发布说明

## GitHub 仓库内容

这个项目可以直接接入 Cloudflare Pages：

- 前端入口：`index.html`
- Cloudflare Functions：`functions/api/dingtalk/config.js`、`functions/api/dingtalk/login.js`
- 不需要构建命令。

`.env` 只用于本地调试，不能提交到 GitHub。

## Cloudflare Pages 设置

在 Cloudflare Pages 连接 GitHub 仓库后：

- Framework preset：`None`
- Build command：留空
- Build output directory：`/`
- Functions directory：默认 `functions`

在 Pages 项目的环境变量里添加：

```text
DINGTALK_APP_KEY=你的钉钉 AppKey
DINGTALK_APP_SECRET=你的钉钉 AppSecret
```

如果 Cloudflare 同时配置 Production 和 Preview 环境，两个环境都要设置，至少 Production 必须设置。

## 钉钉接口权限

在钉钉开发者后台的应用权限里，需要同时开通：

- 免登。
- 通讯录读取用户基本信息、查询用户详情。
- 待办应用中待办写权限。
- 日历应用中日程写权限。

保存权限后重新发布应用。待办和日程接口失败时，页面会显示钉钉返回的错误码和请求 ID，用来判断是权限、用户 ID 还是参数问题。

## 钉钉后台设置

Cloudflare 部署完成后会得到一个公开 HTTPS 地址，例如：

```text
https://product-flow-system.pages.dev
```

回到钉钉开发平台，把网页应用里的移动端首页地址和 PC 端首页地址都改成：

```text
https://product-flow-system.pages.dev/?corpId=$CORPID$
```

保存后进入「版本管理与发布」，创建新版本并发布。钉钉提示发布后，工作台里打开的才是新地址。

## 本地调试

本地仍然可以运行：

```bash
npm start
```

然后访问：

```text
http://127.0.0.1:8127/
```

本地调试需要 `.env` 里有：

```text
DINGTALK_APP_KEY=...
DINGTALK_APP_SECRET=...
DINGTALK_PORT=8127
```
