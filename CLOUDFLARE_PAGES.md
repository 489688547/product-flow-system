# Cloudflare Pages 发布说明

## GitHub 仓库内容

这个项目可以直接接入 Cloudflare Pages：

- 前端发布目录：`dist`
- Cloudflare Functions：`functions/api/dingtalk/config.js`、`functions/api/dingtalk/login.js`
- 构建命令：`npm run build`

本地发布验收仍可生成仓库根目录的兼容发布资源：

```bash
npm run release:pages
```

GitHub 集成的 Pages 部署以 Vite 生成的 `dist` 为准；仓库根目录的兼容发布资源不作为 Pages 构建输入。

`.env` 只用于本地调试，不能提交到 GitHub。

## Cloudflare Pages 设置

在 Cloudflare Pages 连接 GitHub 仓库后：

- Framework preset：`None`
- Build command：`npm run build`
- Build output directory：`dist`
- Functions directory：默认 `functions`

平台连接保险箱需要一个仅存在于 Cloudflare 的加密主密钥：

```text
PLATFORM_CREDENTIAL_MASTER_KEY=32 字节 Base64URL 随机值
```

真实值使用 Pages Secret 保存，不能写入 GitHub 或普通环境变量。Production 和 Preview 都要设置；如果两个环境绑定同一个 D1，公司管理员在数据中心保存一次钉钉或快麦连接后即可共同读取。旧的 `DINGTALK_APP_KEY`、`DINGTALK_APP_SECRET` 和快麦变量继续作为兼容回退，不再是新增连接的主要入口。环境能力清单和生产就绪页面只检查配置名称，不展示密钥值。

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
npx wrangler d1 execute product-flow-system --remote --file migrations/0003_platform_credentials.sql
npm run verify:production
```

本地完整开发在被忽略的 `.env` 中配置个人 `PRODUCTION_DATA_ACCESS_TOKEN`；Wrangler 自动将 `.env` 作为本机 Pages Functions 的服务端变量加载。个人令牌由平台管理员受控签发，仓库、浏览器、响应和日志都不能保存原始值。`PRODUCTION_DATA_API_URL` 仅供独立生产数据运维修复网关兼容使用，不是标准本地业务链路。

旧版共享状态表仍可由 `/api/state` 首次访问时兼容创建；平台连接保险箱等受治理能力必须先执行清单中的迁移，不能依赖页面请求临时建表。

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

标准本地开发运行：

```bash
npm start
```

然后访问：

```text
http://127.0.0.1:8127/
```

该命令同时启动 Vite 热更新和 Pages Functions，浏览器只打开 8127。它使用真实线上账号、生产 D1、钉钉和快麦适配器，页面上的所有操作都会立即在线上生效。

本地 `.env` 至少需要个人令牌；提供商密钥可继续由生产 D1 平台连接保险箱读取，环境变量仅作为兼容回退：

```text
DINGTALK_APP_KEY=...
DINGTALK_APP_SECRET=...
DINGTALK_PORT=8127
PRODUCTION_DATA_API_URL=https://product-flow-system.pages.dev
PRODUCTION_DATA_ACCESS_TOKEN=仅属于当前授权账号的个人令牌
```

缺少或撤销个人令牌时，本地会话直接失败，不会降级为硬编码最高权限账号。正式生产域名即使误配本地开关和令牌也不会启用本地账号模式。

## 本地沙箱模式（本地 D1）

当远程 D1 绑定故障（dev 代理报 `D1_ERROR: Failed to parse body as JSON ... internal error`）或只想安全地点开界面验证时，可以使用本地沙箱：D1 改走本机 SQLite 持久化，写入只影响本机，不触达生产库。**一切测试性、试验性数据写入都必须在这里进行**，本地线上模式只用于真实业务操作与真实能力验证。

```bash
npm run seed:sandbox                   # 首次执行迁移 + 播种身份；之后可随时重跑刷新（已有本地库自动跳过迁移）
npm run seed:sandbox -- --with-state   # 可选：再从生产库只读复制共享业务状态，打开即见线上数据
npm run start:sandbox                  # 等价于 npm start -- --local-d1
```

- 播种脚本应用全部迁移，并从生产库**只读**复制当前个人令牌对应的身份行与令牌哈希行（不读取 .env 明文令牌）。
- `--with-state` 只复制 `product_flow_state` 与 `product_flow_state_parts` 两张白名单表；凭据、令牌、审计类表一律不复制。超大 payload 会按 `part_index` 无损切片写入多行（服务端读取时自动拼接），业务数据原样保留。沙箱中的任何修改都只写本机，不会回传生产。
- 沙箱模式启动时会临时把 `wrangler.local.toml` 换入 `wrangler.toml`（Pages 不支持自定义配置路径），退出时自动恢复线上配置；备份写入 `.wrangler-toml.online-backup`，进程被强杀后下次启动也会自愈。
- 沙箱仍走同一份 Pages Functions 路由与鉴权中间件，身份由同一个服务器端哈希令牌解析，只是数据库落在本机。
