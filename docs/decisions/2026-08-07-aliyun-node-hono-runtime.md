# 阿里云 ECS 使用 Node.js 与 Hono 正式运行时

- 状态：已采纳
- 日期：2026-08-07
- 关联事项：DEV-000014
- 取代：`2026-07-29-aliyun-ecs-sqlite-transition.md` 中的 Wrangler 运行时部分

## 背景

生产与测试 ECS 容器此前长期运行 `wrangler pages dev`。页面冷启动产生并发 API
和静态资源请求时，Wrangler 管理的 esbuild service 出现 Go deadlock，容器以
exit 1 退出并由 Docker 重启。两份容器的 cgroup `memory.failcnt` 与 `oom_kill`
均为 0，宿主机内核也没有 OOM 记录，因此增加内存不能修复已确认的退出路径。

## 决策

1. ECS 使用 Node.js 24 LTS 与 Hono 作为正式 HTTP 运行时。
2. 现有 Pages Functions 在镜像构建阶段编译为单一 Fetch bundle；Wrangler、
   workerd、Miniflare 和 esbuild 不进入容器请求路径。
3. 通过共享 D1 兼容适配器把现有 `prepare/batch/first/all/run` 调用映射到本地
   SQLite；每个数据库拥有独立 Worker Thread 和连接。
4. SQLite 开启 WAL、外键、busy timeout；batch 在一个同步事务内执行并在任一
   语句失败时整体回滚。
5. `PFS_PUBLIC_API_ORIGIN` 是服务端登记的 API Origin，专用于重建 OAuth callback
   和同源策略；不相信浏览器提供的 forwarded host。
6. 新 API 可直接使用 Hono；旧 bundle 作为兼容路由逐步缩小，直至删除构建期
   Wrangler 依赖。

## 平台能力结论

结论为“抽取共享能力”。生产与测试是两个真实消费者，共用 HTTP、数据库、日志
和优雅关闭契约；域名、Cookie、Secret、端口、SQLite 文件和数据卷仍归各环境。

## 后果

- 运行时不再启动开发服务器和编译器，消除已确认的 Wrangler/esbuild 退出路径。
- 现有 API、鉴权、钉钉适配器与 SQLite 文件无需一次性重写或搬迁。
- 长查询从 HTTP 主线程隔离，但同一数据库仍按单连接顺序执行；查询与索引仍需优化。
- 首次切换仍有构建期 Pages bundle 依赖；这是明确的迁移兼容层，不是长期业务接口。
- RDS 迁移仍需把存储模块从 SQLite SQL 迁到 PostgreSQL 方言，但 HTTP、鉴权和
  Provider 边界不需要再次迁移。

## 回滚

切换前生成两个 SQLite 一致性快照。Node/Hono 镜像失败时恢复上一已验收镜像和
匹配快照；旧 Wrangler 镜像只允许用于短时生产恢复，不恢复 Cloudflare D1，也不
撤销本 ADR 的目标架构。
