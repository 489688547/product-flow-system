# 阿里云 ECS 生产迁移实施计划

## 目标

交付可重复构建、可迁移双数据库、可备份和可回滚的 ECS 生产运行时；同时交付
Cloudflare 静态测试前端与 ECS 隔离测试 API。

## 架构方案

保留现有 Pages Functions 代码，通过 Wrangler 的本地 Pages 运行时在 ECS
执行，D1 binding 映射到持久化数据卷内的本地 SQLite。Nginx Proxy Manager
负责入口，OSS 只存对象与 SQLite 一致性快照。Cloudflare 只保留测试静态文件
托管，不运行 Functions、Workers、D1 或业务 Secret。

## 文件职责

- `Dockerfile.aliyun`：位于仓库根目录，供本地 Docker 与 ACR 云端构建共同使用，
  可重复构建前端和 Pages Functions 运行镜像。
- `deploy/aliyun/docker-compose.yml`：资源限制、回环端口、数据卷、健康检查和
  代理网络。
- `deploy/aliyun/docker-compose.test.yml`：独立测试容器、端口、SQLite 数据卷和
  健康检查。
- `deploy/aliyun/wrangler.toml`：两个本地 D1 binding 与 Pages 静态目录。
- `scripts/aliyun/runtime-config.mjs`：纯函数校验环境和生成 Wrangler 参数。
- `scripts/aliyun/start-runtime.mjs`：启动并转发进程信号。
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
  `envFile`、`configPath` 和 `assetsDir`，路径必须为绝对路径。
- `buildPagesDevArgs(config)` 返回不含任何 Secret 值的 Wrangler 参数。
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

- Wrangler Pages Dev 是兼容运行时而非阿里云托管生产产品；通过 Docker
  重启策略、健康检查和固定版本控制风险，后续 RDS/Node 运行时另立项目。
- 单机 SQLite 不支持多实例并发写；达到 PRD 触发条件后迁 RDS。
- 域名未备案时不开放正式业务入口。
- 回滚恢复 ECS 上一个已验收镜像和发布前 SQLite/OSS 快照；不恢复 Cloudflare
  业务运行时。

## 验证命令

```bash
node --test tests/aliyun-ecs-deployment.test.mjs
npm run check:environment-capabilities
npm run check:integrations
npx wrangler pages functions build
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
8. 删除 Cloudflare Functions、Workers、D1 运行配置和遗留代码。
