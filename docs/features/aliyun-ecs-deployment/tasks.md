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
  - 输出：`aliyun-ecs-runtime`、`aliyun-oss-backup` 能力。
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

- [ ] 域名与正式切流
  - 依赖：域名实名、ICP备案、OSS Bucket 和实例 RAM 角色。
  - 文件：钉钉控制台、DNS、Nginx Proxy Manager 外部配置。
  - 输入：`deshan-tiyes.cn`、停写窗口。
  - 输出：HTTPS、真实钉钉登录和 ECS 正式事实源。
  - 失败测试：证书、回调、readiness 或数据库校验失败时保持 Cloudflare。
  - 实现步骤：最终导出/导入、代理、DNS、回调、验收。
  - 验证：新会话、冷暖、20 并发、业务读写和 Cloudflare 回滚请求。
  - 提交：将真实验收证据回写 DEV-000014。
  - 当前状态：企业实名认证、私有 OSS Bucket、实例 RAM 角色和备份任务已就绪；
    HTTP Host 代理可预配置，ICP备案完成前保持 DNS 和钉钉回调不变。
