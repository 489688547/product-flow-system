# 阿里云 ECS 生产迁移实施计划

## 目标

交付可重复构建、可迁移双数据库、可备份和可回滚的 ECS 生产运行时；同时交付
Cloudflare 静态测试前端与 ECS 隔离测试 API。

## 架构方案

保留现有 Pages Functions 的 Fetch 契约，在镜像构建阶段一次性编译为 Worker
bundle；ECS 运行时由 Node.js 24 LTS、Hono 和 SQLite Worker Thread 执行，不再
启动 Wrangler、workerd 或 esbuild。Nginx Proxy Manager 负责入口，OSS 只存对象
与 SQLite 一致性快照。Cloudflare 只保留测试静态文件托管。

## 文件职责

- `Dockerfile.aliyun`：位于仓库根目录，供本地 Docker 与 ACR 云端构建共同使用，
  可重复构建前端和 Pages Functions 运行镜像。
- `deploy/aliyun/docker-compose.yml`：资源限制、回环端口、数据卷、健康检查和
  代理网络。
- `deploy/aliyun/docker-compose.test.yml`：独立测试容器、端口、SQLite 数据卷和
  健康检查。
- `deploy/aliyun/wrangler.toml`：两个本地 D1 binding 与 Pages 静态目录。
- `scripts/aliyun/runtime-config.mjs`：校验 Node 运行时路径、公开 API Origin 和
  正式/展示 SQLite 文件。
- `scripts/aliyun/start-runtime.mjs`：加载 Hono 服务并优雅关闭 HTTP 与数据库线程。
- `server/aliyun/app.mjs`：Hono 路由、静态文件、API bundle 和安全日志边界。
- `server/aliyun/sqlite-d1.mjs`：异步 D1 兼容对象与 Worker RPC。
- `server/aliyun/sqlite-worker.mjs`：better-sqlite3、WAL、busy timeout 和原子 batch。
- `scripts/aliyun/export-cloudflare-d1.mjs`：远程全量导出和哈希清单。
- `scripts/aliyun/import-local-d1.mjs`：空白数据卷导入与重复导入保护。
- `scripts/aliyun/backup-local-d1.mjs`：通过 SQLite Online Backup API 生成一致性
  快照、哈希清单并上传 OSS，不依赖宿主机 Wrangler/workerd。
- `deploy/aliyun/product-flow-backup.{service,timer}`：每日备份任务、超时和
  systemd 沙箱边界。
- `scripts/aliyun/check-local-d1.mjs`：验证两个库的表数与关键表。
- `tests/aliyun-ecs-deployment.test.mjs`：运行时、迁移、备份和 OAuth 契约。

## 接口与契约

- `validateRuntimeEnvironment(env)` 返回规范化的 `port`、`persistDir`、
  `bundlePath`、`assetsDir`、`publicApiOrigin` 和两个数据库文件，路径必须为绝对路径。
- `createD1Database({ file, workerUrl })` 返回兼容 `prepare/batch/exec` 的异步数据库。
- `createAliyunApp({ worker, env, assetsDir })` 返回 Hono 实例；业务 bundle 只接收
  服务端重建的 HTTPS URL 和登记过的 env/binding。
- 迁移脚本只接受 `--output-dir`、`--persist-to`、`--config` 和显式
  `--replace-empty`；默认拒绝覆盖已有状态。
- 备份清单为 JSON：`createdAt`、`databases[]`、`file`、`bytes`、`sha256`。
- `OSS_BACKUP_URI` 只允许 `oss://bucket/prefix/`，上传通过 `ossutil cp`。
- OSS 客户端只使用 ECS 实例 RAM 角色与内网 Endpoint，不保存 AccessKey。

## 数据迁移

1. 初次预发布从远程 D1 导出两个 SQL 文件并生成哈希。
2. 在空白 ECS 数据卷导入正式库和展示库。
3. 查询 `sqlite_master` 表数及关键表行数，与远程导出前只读查询对比。
4. 最终切流前停止采集器并设置人工停写窗口，重复全量导出和空卷导入。
5. D1 迁移证据保留为历史记录；运行时不再连接 D1，回滚只使用 ECS 快照。

当前总 D1 约 245 MiB，预计 SQL 导出与临时文件低于 2 GiB；ECS 至少保留
10 GiB 空闲才允许最终导入。

## 风险与回滚

- Node 兼容层仍保留 Pages bundle 构建依赖；它只存在于 build stage，后续逐路由
  迁移到 Hono 后删除，不得重新进入运行时。
- 单机 SQLite 不支持多实例并发写；达到 PRD 触发条件后迁 RDS。
- 长查询仍可能占用单个数据库线程；上线验证必须记录慢查询，索引优化独立进行，
  不能再用容器重启掩盖。
- 域名未备案时不开放正式业务入口。
- 回滚恢复 ECS 上一个已验收镜像和发布前 SQLite/OSS 快照；不恢复 Cloudflare
  业务运行时。

## 验证命令

```bash
node --test tests/aliyun-ecs-deployment.test.mjs
npm run check:environment-capabilities
npm run check:integrations
npm run build:aliyun-runtime
docker compose -f deploy/aliyun/docker-compose.yml config
docker build \
  --build-arg PFS_BUILD_COMMIT="$(git rev-parse HEAD)" \
  -f Dockerfile.aliyun \
  -t product-flow-system:aliyun \
  .
npm run lint
npm run check:governance
npm test
npm run build
```

服务器内：

```bash
curl -fsS http://127.0.0.1:8080/
curl -sS -o /tmp/session.json -w '%{http_code}' http://127.0.0.1:8080/api/auth/session
docker inspect --format '{{.State.Health.Status}}' product-flow-app
```

## 任务顺序

1. 文档、环境和集成契约。
2. 失败测试与运行时配置。
3. D1 导出、导入、校验和备份。
4. Docker 镜像与 Compose。
5. 本地完整门禁、ECS 私有预发布和服务器内验收。
6. 部署 ECS 隔离测试 API 和 Cloudflare 测试静态前端。
7. 通过 `dev → main` 发布 ECS 生产镜像并完成钉钉验收。
8. 删除 Cloudflare Workers、D1 binding、业务 Secret、Git 构建入口和无用后端配置；
   保留镜像构建阶段读取的 `functions/` 业务源代码。

## Node 正式运行时实施任务

### 任务 A：运行时契约与构建产物

**文件**：`tests/aliyun-node-runtime.test.mjs`、`scripts/aliyun/runtime-config.mjs`、
`package.json`、`Dockerfile.aliyun`。

**接口**：`validateRuntimeEnvironment(env)` 必须返回 `publicApiOrigin`、`bundlePath`、
`productDatabasePath`、`demoDatabasePath`；`npm run build:aliyun-runtime` 必须生成可由
Node 动态导入且导出 `default.fetch` 的 bundle。

1. 先写测试，用缺少 `PFS_PUBLIC_API_ORIGIN`、HTTP Origin 和相对 bundle 路径调用
   `validateRuntimeEnvironment`，分别断言拒绝。
2. 运行 `node --test tests/aliyun-node-runtime.test.mjs`，确认因接口尚不存在失败。
3. 最小修改配置函数与构建脚本；保留现有 SQLite 文件定位算法，不搬动在线数据。
4. 重跑测试，并执行 `npm run build:aliyun-runtime` 后动态导入 bundle。

### 任务 B：D1 兼容 SQLite Worker

**文件**：`server/aliyun/sqlite-d1.mjs`、`server/aliyun/sqlite-worker.mjs`、
`tests/aliyun-node-runtime.test.mjs`、`package.json`。

**接口**：`createD1Database({ file, workerUrl })`；prepared statement 提供
`bind(...values)`、`first(column?)`、`all()`、`run()`；`batch(statements)` 在一个
SQLite 事务内返回 D1 风格结果。

1. 在临时真实 SQLite 上测试建表、bind/first/all/run 和成功 batch。
2. 增加唯一键冲突 batch，断言整个 batch 回滚，再确认插入行数仍为零。
3. 确认测试因 `createD1Database` 不存在失败后，安装 `better-sqlite3` 并实现最小 RPC。
4. 启用 `journal_mode=WAL`、`foreign_keys=ON`、`busy_timeout=5000`，重跑测试。

### 任务 C：Hono HTTP 与 Pages bundle 兼容入口

**文件**：`server/aliyun/app.mjs`、`scripts/aliyun/start-runtime.mjs`、
`tests/aliyun-node-runtime.test.mjs`。

**接口**：`createAliyunApp({ worker, env, assetsDir, publicApiOrigin })`；`startAliyunRuntime`
返回可关闭的 `{ server, databases }`。

1. 用真实 Hono app 测试 `/healthz`、SPA 静态回退、API 401、公开 API Origin 重写和
   多个 `Set-Cookie` 保留。
2. 确认测试因 Hono 入口不存在失败，再实现路由和 `waitUntil` 错误日志。
3. 启动真实预构建 bundle 与临时双 SQLite，验证 `/api/auth/session` 返回 401。
4. 关闭服务后确认 HTTP listener 与两个 Worker Thread 均退出。

### 任务 D：环境、集成与回滚契约

**文件**：`docs/platform/environment-capabilities.json`、
`docs/platform/integration-registry.json`、生成模块、运行时示例、Compose、ADR 与测试。

1. 先让环境测试要求 `PFS_PUBLIC_API_ORIGIN` 和 `Node/Hono 正式运行时` 描述。
2. 确认 manifest 测试失败，再更新 JSON 并执行 `npm run generate:platform-manifests`。
3. Compose 健康检查改为 `/healthz`；镜像运行用户、数据卷与端口隔离保持不变。
4. 回滚仍使用上一镜像和匹配 SQLite 快照；旧 Wrangler 镜像只作为短时故障回退，
   不重新成为目标架构。

### 任务 E：容器与线上验收

**文件**：`tests/aliyun-node-runtime.test.mjs`、`tests/aliyun-ecs-deployment.test.mjs`、
`docs/features/aliyun-ecs-deployment/tasks.md`。

1. 本地构建镜像，确认进程树只有 Node，不含 Wrangler、workerd 或 esbuild。
2. 对测试容器执行静态页面、匿名会话、OAuth bootstrap、readiness 和 20 路并发。
3. 生成双 SQLite 快照后串行切换生产；确认真实钉钉登录与两个重查询不触发重启。
4. 运行仓库完整 Definition of Done，并把实际 commit、镜像和运行证据写回任务。
