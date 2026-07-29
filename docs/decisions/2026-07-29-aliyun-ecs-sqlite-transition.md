# 阿里云 ECS 使用本地 SQLite 作为过渡生产运行时

- 状态：已采纳
- 日期：2026-07-29
- 关联事项：DEV-000014

## 背景

Cloudflare Worker 免费执行边界持续出现 CPU 时间超限，公司已经购买杭州 ECS、
OSS 存储包和域名。现有服务端由 Pages Functions 与 D1 API 构成，直接改写为
Node/RDS 会扩大迁移范围并延长故障窗口。

## 决策

1. ECS 通过 Wrangler 本地 Pages 运行时执行现有 Functions，两个 D1 binding
   映射为数据卷内的独立本地 SQLite。
2. 该方案是单机过渡生产边界，不是新的长期平台抽象；业务代码继续只依赖
   D1 binding 接口，不引入第二套 API。
3. Cloudflare 保持回滚入口，最终切流使用停写窗口，不做 D1/SQLite 双写。
4. OSS 仅保存图片、附件和数据库导出备份；在线 SQLite 位于 ECS 系统盘。
5. 公网入口复用现有 Nginx Proxy Manager，应用端口默认只绑定回环地址。
6. 达到容量、多实例、锁等待、内存或恢复时限触发条件后，另立 RDS 迁移项目。

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
- Cloudflare 与 ECS 不能长期同时接受写入，回滚需要明确数据边界。

## 回滚

停止 ECS 写入，把公司入口恢复到 Cloudflare 固定正式站。使用最终切流前 D1
导出作为回滚边界；不自动合并 ECS 切流后产生的数据。若需要保留 ECS 新数据，
先进入维护状态并执行专项差异迁移。
