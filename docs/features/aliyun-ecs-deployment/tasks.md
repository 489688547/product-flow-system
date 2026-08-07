# 阿里云 ECS 生产迁移执行任务

## 执行规则

- 每项任务只交付一个可独立验证的结果。
- 先写失败测试并确认失败原因，再写实现。
- 完成后记录实际验证命令和结果。
- 每次提交只包含当前任务文件。

## 任务

- [x] 建立迁移产品、设计、数据和回滚边界
  - 依赖：DEV-000014 已确认并由 `codex/aliyun-deployment` 认领。
  - 文件：`docs/features/aliyun-ecs-deployment/`、ADR、平台文档。
  - 输入：ECS、OSS、域名、D1 当前信息。
  - 输出：SQLite 过渡架构与 RDS 触发条件。
  - 失败测试：不适用，文档必须先于行为代码。
  - 实现步骤：记录非目标、权限、停写、双库隔离、备份和回滚。
  - 验证：人工对照 PRD 验收标准与 ADR。
  - 提交：随环境契约任务一起提交。

- [x] 新增阿里云环境与集成契约
  - 依赖：迁移边界文档。
  - 文件：`docs/platform/environment-capabilities.json`、
    `docs/platform/integration-registry.json`、生成模块和契约测试。
  - 输入：ECS 本地 D1、钉钉、OSS 所需变量名。
  - 输出：`aliyun-ecs-production`、`aliyun-ecs-test-api`、
    `cloudflare-pages-static-test`、`aliyun-oss-backup` 能力。
  - 失败测试：`node --test tests/aliyun-ecs-deployment.test.mjs` 应因能力缺失失败。
  - 实现步骤：先补 manifest 测试，再更新 JSON 并重新生成模块。
  - 验证：`npm run check:environment-capabilities && npm run check:integrations`。
  - 提交：`feat(platform): register aliyun runtime`

- [x] 实现双 D1 迁移和本地备份
  - 依赖：环境契约。
  - 文件：`scripts/aliyun/*.mjs`、`tests/aliyun-ecs-deployment.test.mjs`。
  - 输入：远程 D1 名称、空白持久化目录、可选 OSS URI。
  - 输出：导出、导入、校验、哈希清单与备份上传命令。
  - 失败测试：脚本缺失、覆盖已有状态或非法 OSS URI 时测试失败。
  - 实现步骤：纯函数命令计划、注入 runner、原子清单、重复导入保护。
  - 验证：`node --test tests/aliyun-ecs-deployment.test.mjs`。
  - 提交：`feat(deploy): add d1 migration tools`

- [x] 实现 ECS 容器运行时
  - 依赖：迁移脚本。
  - 文件：`deploy/aliyun/*`、运行时脚本和测试。
  - 输入：只读 runtime env、持久化数据卷、代理网络。
  - 输出：固定 Wrangler 版本的应用镜像和受限 Compose 服务。
  - 失败测试：缺少绝对路径、启用本地管理员模式或绑定公网数据库时失败。
  - 实现步骤：运行时参数校验、信号转发、Docker 构建、Compose 健康检查。
  - 验证：单元测试、`docker compose config`、本地镜像启动与 401 会话检查。
  - 提交：`feat(deploy): add aliyun ecs runtime`

- [x] 完成 ECS 私有预发布
  - 依赖：完整本地门禁通过。
  - 文件：无新增业务文件；服务器 `/opt/product-flow/`。
  - 输入：分支镜像、D1 预发布导出、服务器 runtime env。
  - 输出：回环 8080 健康容器、数据库校验和本地备份。
  - 失败测试：任一数据库或匿名认证不符合预期时不配置公网代理。
  - 实现步骤：安装、构建、导入、启动、健康检查、备份。
  - 验证：服务器内冷/暖/并发请求和容器重启。
  - 提交：只记录验收证据，不提交服务器 Secret。
  - 2026-07-30 收尾：ECS 已绑定最小权限 OSS 实例角色；备份改用 SQLite
    Online Backup 一致性快照，并由 systemd timer 每日执行。
  - 2026-07-30 验收修复：运行时把只读 `runtime.env` 链接为 Pages Functions
    识别的 `.dev.vars`，钉钉 OAuth bootstrap 从缺少配置的 501 恢复为 200。
  - 2026-07-31 验收修复：运行时安装系统 CA，并显式向 workerd 提供证书路径，
    避免钉钉 OAuth 换取用户令牌时因缺少本地签发链返回 500。

- [x] 域名与正式切流
  - 依赖：域名实名、ICP备案、OSS Bucket 和实例 RAM 角色。
  - 文件：钉钉控制台、DNS、Nginx Proxy Manager 外部配置。
  - 输入：`deshan-tiyes.cn`、停写窗口。
  - 输出：HTTPS、真实钉钉登录和 ECS 正式事实源。
  - 失败测试：证书、回调、readiness 或数据库校验失败时停止发布。
  - 实现步骤：最终导出/导入、代理、DNS、回调、验收。
  - 验证：新会话、冷暖、20 并发和业务读写。
  - 提交：将真实验收证据回写 DEV-000014。
  - 2026-08-06：ICP备案、HTTPS、DNS 和真实钉钉 OAuth 已完成，生产入口为
    `https://deshan-tiyes.cn`。

- [x] 隔离测试环境并退役 Cloudflare 业务运行时
  - 依赖：生产 ECS 入口已验收。
  - 输出：Cloudflare 静态测试前端、ECS 测试 API/SQLite、无 D1/Workers 运行依赖。
  - 验证：测试/生产 commit 与数据隔离、CORS、OAuth、readiness 和完整门禁。
  - 2026-08-06：代码与契约已完成；固定域名部署和真实环境验收作为发布任务继续执行。

- [x] 发布并验收固定测试环境
  - 输出：`https://test.deshan-tiyes.cn` 与 `https://api-test.deshan-tiyes.cn` 报告同一 `dev` commit。
  - 验证：静态产物边界、CORS、OAuth、readiness、数据隔离与钉钉 WebView。
  - 2026-08-06：最终 ACR 构建 `83af46c9-d11e-4a21-9ed0-f457f009d744` 成功，
    固定前端与隔离测试 API 均报告 `4e8eb09467a8`；完整冒烟、精确 CORS、
    20 路 OAuth bootstrap、真实钉钉登录和 executive 业务读取通过。
  - 2026-08-06：测试库写入 `ECS-ISOLATION-CHECK-20260806-2212` 时生产库
    计数保持为 0，测试记录随后已清理；停止/重启测试容器期间生产站保持可用。
  - 2026-08-06：Cloudflare Pages Git 构建已断开，production/preview 的
    Variables、Secrets 和 D1 bindings 均已清空，只保留固定测试静态产物与域名。
  - 2026-08-06：2 GiB ECS 同时运行生产、测试和 Harbor 时，解压 645 MB 镜像
    出现资源抖动；重启后生产 30 秒内恢复 200，测试以最终镜像恢复健康。后续发布
    必须串行停止按需测试容器后再拉取生产镜像，或先升级到至少 4 GiB 内存。

- [x] 通过 `dev -> main` 发布并验收生产
  - 输出：`https://deshan-tiyes.cn` 报告目标 `main` commit。
  - 验证：OAuth、readiness、业务读写、容器健康恢复与 SQLite/OSS 备份。
  - 2026-08-06：`dev -> main` 已发布 `f551714ce43d`，ACR 构建
    `d4b96be8-f25b-47f1-a2eb-f8c636c855eb` 成功，生产容器恢复健康。
  - 2026-08-06：切流前生成双 SQLite 一致性快照并上传
    `oss://deshan-tiyes-product-flow-backup-cn-hangzhou/product-flow/backups/20260806T145734Z/`；
    服务器清单与文件 SHA-256 回读一致。
  - 2026-08-06：HTTPS 钉钉回调返回同源
    `https://deshan-tiyes.cn/api/auth/dingtalk/callback`；真实钉钉登录后会话为
    `executive`，总览成功读取 26 项业务待办。
  - 2026-08-06：生产冒烟通过 `f551714ce43d`；测试前端和隔离测试 API
    恢复后冒烟通过 `7c9352ba4ae5`。

- [x] 用 Node.js 24 + Hono 正式运行时替换 Wrangler Pages Dev
  - 根因：页面冷启动并发使 Wrangler/esbuild 开发运行时以 exit 1 退出；两个容器
    均无 cgroup OOM、无 `memory.failcnt`，2 GiB 主机内存不是已证实根因。
  - 设计：构建期编译 Functions bundle，运行时使用 Hono、SQLite Worker Thread
    和现有双库文件；生产/测试继续物理隔离。
  - 验证：失败测试、Node bundle 兼容、事务回滚、容器并发、进程树、钉钉登录、
    readiness、SQLite/OSS 快照和完整门禁。
  - 2026-08-07：代码阶段已完成 Hono 入口、构建期 Functions bundle、双 SQLite
    Worker Thread 与 D1 兼容层；本机真实 bundle 的匿名会话、React 静态回退、
    事务回滚和优雅关闭测试通过。因本机没有 Docker，Node 24 镜像构建、ECS
    并发、进程树、钉钉登录和备份验收仍待 ACR/ECS 发布阶段完成。
  - 2026-08-07：生产 502 复核确认旧正式容器已重启 37 次、测试容器重启 4 次，
    进程树仍包含 Wrangler、esbuild 和 workerd，主机负载约 9.6；不是 cgroup OOM。
  - 2026-08-07：停止旧容器后分别生成正式和测试双 SQLite 一致性快照
    `pre-hono-20260807T073424Z`。ACR 构建
    `c323bdf0-8d31-4d16-bffa-a437b5db1e65` 在 72 秒内成功，ECS 从杭州内网拉取
    `aliyun-latest` 并保留旧 Wrangler 镜像回滚标签。
  - 2026-08-07：正式与测试 Node/Hono 容器均为 `healthy`、重启次数 0，运行时
    `/healthz` 返回 `node-hono`，进程树不再包含 Wrangler、workerd 或 esbuild。
    正式站、正式 healthz 与测试 healthz 均为 200；正式/测试容器分别约 190 MiB
    与 46 MiB，空闲 CPU 接近 0%，主机负载回落到约 1.0。
