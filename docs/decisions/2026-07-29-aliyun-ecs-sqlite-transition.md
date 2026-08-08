# 阿里云 ECS 使用本地 SQLite 作为过渡生产运行时

- 状态：已采纳
- 日期：2026-07-29
- 修订：2026-08-08
- 关联事项：DEV-000014、DEV-000018

## 背景

Cloudflare Worker 免费执行边界持续出现 CPU 时间超限，公司已经购买杭州 ECS、
OSS 存储包和域名。现有服务端由 Pages Functions 与 D1 API 构成，直接改写为
Node/RDS 会扩大迁移范围并延长故障窗口。

## 决策

> 2026-08-07 修订：下列第 1、2 项中的 Wrangler 运行时已被
> `2026-08-07-aliyun-node-hono-runtime.md` 取代；SQLite、OSS、网络、隔离与 RDS
> 触发条件继续有效。

1. ECS 通过 Wrangler 本地 Pages 运行时执行现有 Functions，两个 D1 binding
   映射为数据卷内的独立本地 SQLite。
2. 该方案是单机过渡生产边界，不是新的长期平台抽象；业务代码继续只依赖
   D1 binding 接口，不引入第二套 API。
3. 生产前端、全部 API 与在线数据库均由 ECS 承载；Cloudflare 只保留测试静态
   前端托管，不运行 Functions、Workers、D1 或业务 Secret。
4. OSS 仅保存图片、附件和数据库导出备份；在线 SQLite 位于 ECS 系统盘。
5. 公网入口复用现有 Nginx Proxy Manager，应用端口默认只绑定回环地址。
6. 达到容量、多实例、锁等待、内存或恢复时限触发条件后，另立 RDS 迁移项目。
7. 测试前端直接调用 `api-test.deshan-tiyes.cn` 的独立 ECS 容器和 SQLite；
   精确 CORS 只允许 `test.deshan-tiyes.cn`。
8. ECS 每两分钟拉取并比较固定 ACR `main` 镜像。仅在镜像变化、候选 Compose
   合同与主机一致、双库备份校验和私有 OSS 上传成功后替换生产；失败健康检查
   自动回滚。成功上传后本地只保留最新一份快照，历史由私有 OSS 保存。

## 安全与数据边界

- ECS 公网运行时禁止 `LOCAL_ONLINE_ACCOUNT_MODE`。
- Secret 只通过服务器只读 env 文件注入，不进入镜像或仓库。
- OSS 使用私有 Bucket 和 ECS 实例 RAM 角色；不在命令行传 AccessKey。
- 正式与展示数据库保持物理隔离，控制数据仍只在正式库。
- 域名未实名、备案和配置 HTTPS 前，ECS 只作私有预发布。

## 后果

- 迁移代码量小，现有 Functions、权限和数据路由可以复用。
- Wrangler Pages Dev 是兼容运行时而非托管生产服务，需要容器健康检查、资源
  限额和重启策略补足。
- 单机 SQLite 无法水平写扩展，查询扫描问题仍需独立优化。
- D1 在迁移验证后退役；生产回滚依赖 ECS 上一个镜像和 SQLite/OSS 快照。
- 自动发布减少手工操作，但主机 Compose 仍是运行合同；合同变化、首次安装和
  自动回滚失败必须人工处理。相同镜像检查没有备份或容器重启副作用。

## 迁移验收记录

2026-08-06 从 ECS 只读复核最终迁移清单：正式 SQL 为 195,351,093 bytes，
SHA-256 `83a8750594097345d8590d4f1681a26d32b6ff9b807c54884073e3d0bc707852`；
展示 SQL 为 79,569,962 bytes，SHA-256
`f8ba143f00abe9ac7a1fd8741dc856e48f494851389ac432422feb15b959f632`。
导入标记与清单一致；两份在线 SQLite 的 `PRAGMA quick_check` 均为 `ok`，
分别包含 121 和 111 张表。

## 回滚

进入维护状态，停止 ECS 写入，恢复上一个已验收镜像，并按发布前清单恢复
SQLite/OSS 快照。Cloudflare Pages 只有测试静态文件，不能作为生产 API 或
数据库回滚入口。
