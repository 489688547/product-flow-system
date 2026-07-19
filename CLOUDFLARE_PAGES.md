# Cloudflare Pages 发布说明

## GitHub 仓库内容

这个项目可以直接接入 Cloudflare Pages：

- 前端发布入口：`cloudflare-entry.html`（由 `_redirects` 接管根路径）
- Cloudflare Functions：`functions/api/dingtalk/config.js`、`functions/api/dingtalk/login.js`
- 不需要构建命令。

发布前先在本地生成并提交生产资源：

```bash
npm run release:pages
```

仓库中的 `index.html` 保留给 Vite 本地开发；Pages 继续使用“无构建、发布仓库根目录”的现有配置。

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

如果 Cloudflare 同时配置 Production 和 Preview 环境，两个环境都要设置。环境能力清单和生产就绪页面会检查缺失项；密钥值不会展示。

## 公司共享数据库

这个系统给全公司使用时，需求池、产品档案、任务、资料包、会议纪要、产品复盘、员工提交的问题反馈都必须走 Cloudflare D1 共享数据库；浏览器 `localStorage` 只作为本地缓存和数据库异常时的兜底。

在 Cloudflare 控制台创建一个 D1 数据库，例如：

```text
product-flow-system
```

然后进入 Pages 项目：

```text
Settings -> Functions -> D1 database bindings
```

添加绑定：

```text
Variable name: PRODUCT_FLOW_DB
D1 database: product-flow-system
```

Production 和 Preview 环境都建议绑定。没有这个绑定时，页面会提示“共享数据库未配置”，不同账号的数据不会同步。

部署生产数据控制能力后执行：

```bash
npx wrangler d1 execute product-flow-system --remote --file migrations/0001_production_data_access.sql
npx wrangler d1 execute product-flow-system --remote --file migrations/0002_business_data_apps.sql
npx wrangler d1 execute product-flow-system --remote --file migrations/0002_collaboration_execution.sql
npx wrangler d1 execute product-flow-system --remote --file migrations/0002_hr_management_core.sql
npm run verify:production
```

本地测试如需实时读取生产数据，在被忽略的 `.env` 中配置 `PRODUCTION_DATA_API_URL` 与个人 `PRODUCTION_DATA_ACCESS_TOKEN`。个人令牌由平台管理员受控签发，仓库和浏览器都不能保存原始值。

数据库表会由 `/api/state` 函数首次访问时自动创建，不需要手工执行 SQL。

## 钉钉接口权限

在钉钉开发者后台的应用权限里，需要同时开通：

- 免登。
- 通讯录读取用户基本信息、查询用户详情。
- 待办应用中待办写权限。
- 日历应用中日程写权限。
- 视频会议应用会议读权限，用于读取云录制/闪记文本并同步会议纪要。

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
PRODUCTION_DATA_API_URL=https://product-flow-system.pages.dev
PRODUCTION_DATA_ACCESS_TOKEN=仅属于当前授权账号的个人令牌
```
