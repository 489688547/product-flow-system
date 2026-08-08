---
title: ECS 502 应先区分运行时退出与内存不足
date: 2026-08-08
category: runtime-errors
module: aliyun-ecs-runtime
problem_type: runtime_error
component: tooling
symptoms:
  - 正式与测试站间歇返回 HTTP 502
  - 旧正式容器重启 37 次，旧测试容器重启 4 次
  - Wrangler 管理的 esbuild service 出现 Go deadlock 后进程退出
root_cause: config_error
resolution_type: code_fix
severity: high
tags: [aliyun-ecs, 502, wrangler, esbuild, nodejs, hono]
---

# ECS 502 应先区分运行时退出与内存不足

## Problem

阿里云 ECS 的正式与测试服务出现 502。已确认根因不是“2 GiB 内存必然不足”，
而是正式请求路径仍运行 `wrangler pages dev`；页面冷启动并发触发 esbuild service
Go deadlock，进程以 exit 1 退出并被 Docker 重启。两套容器的 cgroup
`memory.failcnt`、`oom_kill` 和宿主机 OOM 记录均为 0，因此加内存不能修复这条
已确认的退出路径（`docs/decisions/2026-08-07-aliyun-node-hono-runtime.md:10`）。

## Symptoms

- 验收记录显示，切换前正式容器累计重启 37 次、测试容器累计重启 4 次，进程树
  包含 Wrangler、esbuild 和 workerd，主机负载约 9.6
  （`docs/features/aliyun-ecs-deployment/tasks.md:127`）。
- 故障发生在上游容器进程退出后，所以网关返回 502；没有 OOM 证据时，不能只凭
  主机规格把“内存不足”写成根因。
- 切换后两套容器均为 healthy、重启次数 0，`/healthz` 报告 `node-hono`，正式与
  测试健康检查均为 200；验收记录中的容器内存约为 190 MiB/46 MiB，主机负载
  回落到约 1.0（`docs/features/aliyun-ecs-deployment/tasks.md:133`）。

## What Didn't Work

- 直接把 502 归因于服务器内存小：没有 cgroup 或内核 OOM 证据，而且扩容不会
  消除 esbuild deadlock。
- 只检查 Nginx：网关只是暴露了上游容器退出，不是已证实根因。
- 继续把 `wrangler pages dev` 当作正式 HTTP runtime：这会继续把开发服务器、
  workerd 和 esbuild 留在线上请求路径。

## Solution

1. 把镜像构建与运行分开：构建阶段生成前端与 Functions bundle，运行镜像只执行
   `node scripts/aliyun/start-runtime.mjs`（`Dockerfile.aliyun:13`、
   `Dockerfile.aliyun:18`、`Dockerfile.aliyun:45`）。
2. Functions 只在构建期由 Wrangler 编译成单一 Node 可导入 bundle；运行期直接
   导入该文件（`scripts/aliyun/build-functions.mjs:9`、
   `scripts/aliyun/start-runtime.mjs:42`）。
3. 用 Node/Hono 提供正式 HTTP 入口和独立 `/healthz`，其余请求交给既有 Functions
   bundle（`server/aliyun/app.mjs:41`、`server/aliyun/app.mjs:47`）。
4. 正式业务库与展示库分别使用独立 SQLite Worker，并在关闭时同时释放 HTTP
   server 和数据库（`scripts/aliyun/start-runtime.mjs:36`、
   `scripts/aliyun/start-runtime.mjs:64`）。
5. SQLite Worker 启用 WAL、外键、5 秒 busy timeout；batch 在单个同步事务中
   执行（`server/aliyun/sqlite-worker.mjs:10`、
   `server/aliyun/sqlite-worker.mjs:54`）。

## Why This Works

- Wrangler、workerd 和 esbuild 不再参与线上请求处理，直接移除已确认的
  deadlock/exit 1 路径；它们只留在可重试的镜像构建阶段。
- Hono 是常驻 HTTP server，健康检查直接命中 `/healthz`。生产与测试继续使用
  不同端口、环境文件和数据挂载（`deploy/aliyun/docker-compose.yml:2`、
  `deploy/aliyun/docker-compose.yml:45`）。
- SQLite Worker 将同步查询与 HTTP 主线程隔离，并保留现有 D1 风格调用；原子
  batch 失败会整体回滚，测试覆盖这一行为
  （`tests/aliyun-node-runtime.test.mjs:34`、
  `tests/aliyun-node-runtime.test.mjs:140`）。
- 迁移保留原有 Functions、鉴权与 SQLite 文件边界。将来迁移 RDS 时可以主要
  替换存储实现，不必再次迁移 HTTP 与鉴权边界
  （`docs/decisions/2026-08-07-aliyun-node-hono-runtime.md:36`）。

## Prevention

- 诊断 502 时依次核对容器 health、restart count、退出日志、进程树、cgroup OOM、
  内核 OOM、主机资源和真实公网请求；没有 OOM 证据时不要把容量写成根因。
- 发布验收必须证明运行进程树不含 Wrangler、workerd 或 esbuild，`/healthz` 返回
  `node-hono`，正式与测试均为 200，观察窗口内 restart count 保持 0。
- 保持 Node runtime 合约测试：bundle 可导入、双库隔离、事务回滚、固定 HTTPS
  Origin 和优雅关闭（`tests/aliyun-node-runtime.test.mjs:125`、
  `tests/aliyun-node-runtime.test.mjs:255`）。
- 切换 runtime 前生成两套 SQLite 一致性快照；失败时恢复上一已验收镜像和匹配
  快照（`docs/decisions/2026-08-07-aliyun-node-hono-runtime.md:43`）。
- Worker Thread 只解决 HTTP 主线程阻塞；同一数据库仍按单连接顺序执行，慢查询
  和索引仍需单独监控（`docs/decisions/2026-08-07-aliyun-node-hono-runtime.md:38`）。

## Related Issues

- [阿里云 ECS 使用 Node.js 与 Hono 正式运行时](../../decisions/2026-08-07-aliyun-node-hono-runtime.md)
- [阿里云 ECS 生产迁移执行任务](../../features/aliyun-ecs-deployment/tasks.md)
