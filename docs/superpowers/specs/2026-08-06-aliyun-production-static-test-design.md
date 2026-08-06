# 阿里云生产与静态测试前端设计

- 状态：待用户书面复核
- 日期：2026-08-06
- 关联研发待办：`DEV-000014`
- 实施分支：`codex/aliyun-deployment`

## 1. 决策摘要

生产环境的前端、API、正式 SQLite 和展示 SQLite 全部运行在阿里云 ECS，
`https://deshan-tiyes.cn` 是唯一正式入口。Cloudflare 不再承载生产流量、
业务 API、Worker 或 D1。

测试环境采用分离部署：Cloudflare Pages 只托管已经构建完成的静态前端，
`https://test.deshan-tiyes.cn` 是员工可见的测试入口；测试 API 运行在同一台
ECS 的独立容器，通过 `https://api-test.deshan-tiyes.cn` 提供服务。测试 API
使用独立 SQLite 数据目录，不得读取或回退正式 SQLite。测试后端默认按需启动，
以保护当前 2 GiB ECS 的生产余量。

Cloudflare Pages 的 `_redirects` 不能反向代理外部域名，因此测试前端直接访问
测试 API。浏览器端通过单一 API 地址解析边界重写 `/api/...` 请求，不在每个
业务模块散落环境判断。

## 2. 运行架构

### 2.1 生产环境

1. `deshan-tiyes.cn` 和 `www.deshan-tiyes.cn` 解析到 ECS 公网 IP。
2. Nginx Proxy Manager 终止 HTTPS，并把根路径和 `/api` 转发到生产应用容器。
3. 生产应用容器提供静态前端和现有 Functions API；现阶段在 ECS 内保留
   Wrangler/workerd 兼容执行器，但它不连接 Cloudflare 网络服务。
4. `PRODUCT_FLOW_DB` 与 `DEMO_FLOW_DB` 映射为生产数据卷中的两个独立 SQLite。
5. 每日一致性备份写入本地后上传私有 OSS；OSS 不承担在线数据库职责。

### 2.2 测试环境

1. `test.deshan-tiyes.cn` 作为 Cloudflare Pages 自定义域名，只发布 `dev` 分支的
   静态构建产物，不发布 `functions/`，不绑定 D1，不配置业务 Secret。
2. `api-test.deshan-tiyes.cn` 解析到 ECS，由 Nginx 转发到独立测试应用容器。
3. 测试容器使用独立端口、运行时 env、持久化目录和 SQLite；任何缺失都必须
   失败关闭，不得连接生产容器或生产数据卷。
4. 测试前端构建时只注入公开的 API Origin。所有跨域请求带凭据，ECS 仅允许
   精确 Origin `https://test.deshan-tiyes.cn`，不允许通配 CORS。
5. 钉钉测试 OAuth callback 固定为
   `https://api-test.deshan-tiyes.cn/api/auth/dingtalk/callback`；成功后只跳回
   `https://test.deshan-tiyes.cn`。测试会话 Cookie 由测试 API 域签发。

## 3. 发布与分支流

- `codex/*` 仍从最新 `dev` 开始并只向 `dev` 提交 PR；`dev -> main` 是唯一正式
  发布 PR，避免改变其他开发者已经使用的协作分支规则。
- `dev` 合并后，GitHub Actions 构建静态测试前端并部署到 Cloudflare Pages；
  同一 commit 构建测试后端镜像并发布到 ACR。测试后端按需更新和启动。
- `main` 合并后，GitHub Actions 构建带 commit 指纹的生产镜像并发布到 ACR；
  ECS 只拉取通过门禁的不可变镜像标签，完成健康检查后原子切换。
- 生产部署失败时保留上一镜像和 SQLite 写前快照，在 ECS 内回滚。Cloudflare
  不再是生产回滚入口，也不允许在切流后接受业务写入。

## 4. Cloudflare 清理边界

### 删除或替换

- 删除生产 Cloudflare Pages 部署、固定 `pages.dev` 生产地址、D1 binding、
  远程 D1 配置和以 Cloudflare 为正式事实源的 readiness/CI 规则。
- 删除 `cloudflare-entry` 文件名、路由和界面概念；生产和测试都从 `/` 进入。
- 删除仅服务旧 Pages Functions 打包兼容、D1 远程导出和 Cloudflare 生产回滚的
  脚本、文档与测试；迁移证据保留在 ADR，不保留可误执行的生产命令。
- 将环境能力、集成注册表、平台架构、钉钉设置和开发说明统一改为：阿里云是
  后端与数据事实源，Cloudflare 仅是测试静态文件托管商。

### 暂时保留

- `functions/api/**` 是现有业务 API 源码，不因目录名称或历史运行方式而删除。
- Wrangler/workerd 暂时作为 ECS 内部兼容执行器保留；它不构成 Cloudflare 托管
  服务。迁移 RDS/原生 Node 时再通过独立研发事项替换，避免本次重写全部 API。
- Cloudflare Pages 仅保留一个无 Functions、无 D1、无 Secret 的测试静态项目。

## 5. 稳定性与故障处理

- Docker `restart` 不能恢复仍在运行但已 unhealthy 的容器，因此宿主机增加带
  频率限制的健康恢复 timer：连续失败后重启目标容器，并保留时间、镜像 commit、
  重启原因和结果；短时间重复失败则停止自动重启并报警。
- 生产与测试分别检查容器、HTTP、数据库表、磁盘余量和版本指纹。测试失败不得
  影响生产；生产失败不得自动切到测试或旧 Cloudflare 后端。
- SQLite 写入前保持快照与审计；发布不自动迁移到未知 schema。失败时恢复上一
  镜像和对应快照，不混合两个版本继续写入。
- 2 GiB ECS 上生产容器优先。测试容器默认停止；需要验收时启动，验收结束后
  停止。若要求测试 24 小时在线，应先把 ECS 升级到至少 4 GiB。

## 6. 验收标准

1. `https://deshan-tiyes.cn/` 返回生产环境、当前 main commit 和 HTTPS 200；
   页面及 API 不再出现 `cloudflare-entry`、`pages.dev` 或 `x-server-env: dev`。
2. 新 Ego 会话通过正式钉钉 OAuth 登录并完成一个受控业务读取；callback、Cookie、
   权限和数据均来自生产 ECS。
3. `https://test.deshan-tiyes.cn/` 返回当前 dev commit；网络证据表明静态资源来自
   Pages，而 `/api` 请求直接进入 `api-test.deshan-tiyes.cn` 的 ECS 测试容器。
4. 测试写入只改变测试 SQLite；生产关键表行数、版本和更新时间保持不变。
5. 仓库全量门禁、阿里云生产 readiness、测试 readiness、冷启动、暖请求、20
   并发、自动恢复演练、备份与恢复演练全部通过后，才提交 `DEV-000014` 验收。

## 7. 回滚

- 代码回滚：ECS 切回上一 ACR 镜像；测试 Pages 切回上一静态部署。
- 数据回滚：停止写入后恢复与目标镜像匹配的 SQLite 快照，再执行表与版本校验。
- DNS 回滚：只在阿里云入口之间调整，不恢复 Cloudflare Worker 或 D1。
- 测试后端异常时关闭测试容器并显示测试维护状态，生产继续服务。
