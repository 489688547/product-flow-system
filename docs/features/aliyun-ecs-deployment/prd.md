# 阿里云 ECS 生产迁移 PRD

## 文档状态

- 状态：开发中
- 负责人：周荣庆
- 研发待办：DEV-000014
- 最近更新：2026-08-07

## 背景与问题

Cloudflare Pages Functions 已出现 `Worker exceeded CPU time limit`。2026-07-29
观测到 8,393 次请求中有 387 次 CPU 超限，错误数与 CPU 超限数完全相等。
同日 D1 信息显示正式库约 170 MiB、展示库约 75 MiB；正式库 24 小时读取约
2 亿行，说明迁移后仍需关注查询扫描量与索引，而不能把主机迁移当成性能优化的
终点。

公司已购买杭州 ECS（2 vCPU、2 GiB 内存、40 GiB 系统盘、3 Mbps 公网带宽）、
40 GB 中国大陆 OSS 标准存储包和域名 `deshan-tiyes.cn`。域名已完成企业
实名认证和 ICP 备案，`deshan-tiyes.cn` 已配置 HTTPS 并完成真实钉钉登录。
当前剩余目标是把测试前端与测试 API 隔离，并彻底退役 Cloudflare 业务运行时。

## 目标

1. 在 ECS 上运行现有 React 静态资源与正式 Node.js API 服务，业务请求不再执行
   Cloudflare Worker，也不再通过 `wrangler pages dev`、workerd 或运行时 esbuild。
2. 把正式与展示 D1 通过受控导出、校验和导入迁移到 ECS 持久化 SQLite。
3. 保持现有钉钉登录、权限、数据环境、快麦采集和平台凭证边界不变。
4. 生成可校验的本地数据库备份并上传私有 OSS。
5. 生产前端和全部 API 固定由 ECS 承载；Cloudflare 仅托管测试静态前端。
6. 测试静态前端调用 ECS 上独立容器和 SQLite，不读取或写入生产数据。

## 非目标

- 本次不购买或迁移到 RDS；只定义可执行的 RDS 迁移触发条件。
- 不同时向 D1 与 SQLite 双写。
- 不把 OSS 当作在线数据库，也不在本次引入 CDN。
- 不删除用于测试静态前端的 Cloudflare Pages 项目；删除 Pages Functions、
  Workers 和 D1 运行依赖。
- 不在首次切换中逐个重写 229 个 Pages Functions；先在镜像构建阶段编译为单一
  Fetch bundle，由 Node/Hono 生产入口加载，再按模块逐步迁移为原生 Hono 路由。

## 用户与权限

- 已登录员工沿用钉钉会话与服务端权限读取业务数据。
- 总经办继续负责数据环境切换、平台凭证和生产修复授权。
- ECS 运维人员只能通过服务器配置文件注入 Secret；Secret 不进入镜像、Git、
  浏览器、日志或 OSS。
- OSS 备份使用最小权限的 ECS 实例 RAM 角色；未配置角色时备份保留在 ECS，
  上传必须失败关闭。

## 当前流程

1. 生产浏览器访问 `https://deshan-tiyes.cn`，由 ECS 返回前端和 API。
2. 测试浏览器暂由 Cloudflare Pages 返回静态前端。
3. 测试前端尚未拥有独立 ECS API/SQLite，生产和测试边界仍需固化。

## 目标流程

1. 浏览器通过 `deshan-tiyes.cn` 访问 Nginx Proxy Manager。
2. Nginx Proxy Manager 把请求代理到同 Docker 网络的应用容器。
3. 生产容器使用 Node.js 24 LTS 与 Hono 运行预构建 Functions bundle；运行时不
   包含 Wrangler 监督进程、workerd 开发服务或 esbuild service。
4. `api-test.deshan-tiyes.cn` 指向独立测试容器和测试 SQLite；只允许
   `https://test.deshan-tiyes.cn` 跨域访问。
5. Cloudflare Pages 仅输出 `dev` 分支静态文件，构建时注入测试 API Origin；
   不部署 Functions、Workers、D1 binding 或业务 Secret。
6. 定时任务生成生产数据库 SHA-256 清单并上传私有 OSS Bucket。

## 运行时稳定性规则

- Pages Functions 只允许在镜像构建阶段通过 Wrangler 编译；容器启动和请求路径
  不得调用 Wrangler、Miniflare、workerd 或 esbuild。
- Node 入口以 `PFS_PUBLIC_API_ORIGIN` 重建服务端 Request URL；生产值为
  `https://deshan-tiyes.cn`，测试值为 `https://api-test.deshan-tiyes.cn`。
- SQLite 通过业务中立的 D1 兼容适配器提供 `prepare`、`batch`、`first`、`all`
  和 `run`；数据库工作在 Worker Thread 执行，慢查询不得阻塞 HTTP 事件循环。
- 每个数据库开启 WAL、外键和 busy timeout；`batch` 必须保持全有或全无事务。
- 生产与测试继续各运行单实例；SQLite 阶段不允许多实例共享同一写数据卷。

## 业务规则

- ECS SQLite 是唯一在线业务事实源；Cloudflare D1 已退役，不允许运行时读取、
  写入或作为回滚数据库。
- 切流必须有短暂停写窗口；停止公司采集器并通知用户不进行业务写入后，才能
  执行最终 D1 导出。
- 正式库与展示库必须继续物理隔离；不得把两份 SQL 导入同一绑定。
- `LOCAL_ONLINE_ACCOUNT_MODE` 不得在公网 ECS 运行时启用。
- 公网只暴露 Nginx Proxy Manager 的 80/443；应用 8080 仅绑定宿主机回环地址
  并加入代理内部网络。
- OSS Bucket 必须为私有、阻止公共访问；图片对外访问后续通过签名 URL 或 CDN
  方案单独设计。
- 生产前端只使用同源 `/api`；测试前端只使用构建时固定的
  `https://api-test.deshan-tiyes.cn`，不能由浏览器动态选择后端。
- 测试 API 必须返回精确 CORS Origin，不允许 `*`，并使用独立 Cookie、数据库、
  容器名、端口和数据卷。

## 数据定义

- `PRODUCT_FLOW_DB`：正式控制库与正式业务库，本次从同名远程 D1 全量导入。
- `DEMO_FLOW_DB`：展示业务库，本次从同名远程 D1 全量导入。
- `PFS_DATA_DIR`：ECS 持久化根目录，默认 `/opt/product-flow/data`。
- `PFS_BACKUP_DIR`：本地备份目录，默认
  `/opt/product-flow/data/backups`。
- `OSS_BACKUP_URI`：备份目标前缀，例如
  `oss://<private-bucket>/product-flow/backups/`，只存名称，不存凭据。
- 迁移清单：记录导出时间、源数据库、文件字节数和 SHA-256，不记录业务行内容。

## 异常与边界

- 任一历史 D1 导出或 SQLite 导入校验缺少证据：停止发布并从迁移快照重新验证。
- 测试 SQLite 初始化失败：测试 API 保持不可用，不得回退生产数据库。
- ECS 内存不足或容器被 OOM：Nginx 进入维护状态，停止写入并回滚上一个 ECS 镜像与匹配快照；运行时设置内存上限并记录容器重启。
- OSS 未创建或实例角色未授权：本地备份仍生成，但上线状态标记“OSS 备份受阻”。
- 域名、证书或回调配置失效：生产进入维护并从最近 ECS/OSS 快照恢复，不回写 D1。

## 验收标准

1. 容器以非交互模式启动，重启后两个本地数据库仍存在。
2. 匿名 `/api/auth/session` 返回明确 401；不存在公网本地管理员旁路。
3. 自定义 HTTPS Origin 生成同源钉钉 callback，不回退到 Pages 域名。
4. 正式与展示数据库的表数、关键表行数和导出 SHA-256 有独立校验记录。
5. 备份任务同时导出两个库并生成清单；OSS 未配置时明确受阻，配置后可上传私有
   Bucket。
6. 生产和测试 readiness 均报告预期 commit、运行环境和数据路径，且数据库物理隔离。
7. Cloudflare 测试部署产物不包含 Functions bundle、D1 binding 或业务 Secret；
   网络请求只发送到 `api-test.deshan-tiyes.cn`。
8. 真实钉钉 PC/WebView 在生产域名完成 OAuth、会话和业务页面验收。
9. 容器进程树不包含 Wrangler、workerd 或 esbuild；页面冷启动并发不得导致
   Node 进程退出，匿名会话、静态资源和至少两个数据库重查询可同时完成。

## 上线与回滚

- 候选代码先部署到 ECS 测试容器和 Cloudflare 测试静态站，完成隔离验证。
- `dev` 验收后通过唯一的 `dev → main` 发布流程构建生产 ECS 镜像。
- 回滚使用 ECS 上一个已验收镜像和发布前 SQLite/OSS 快照；不恢复 Cloudflare
  Functions 或 D1。

## RDS 迁移触发条件

任一条件持续出现即启动独立 RDS 迁移：

- 数据库文件超过 10 GiB。
- 需要两个及以上应用实例同时写入。
- SQLite 写锁或请求排队导致 p95 API 延迟连续 15 分钟超过 500 ms。
- ECS 数据库进程稳定占用超过 1 GiB 内存，或发生两次 OOM 重启。
- 备份恢复演练无法在 30 分钟内完成。
