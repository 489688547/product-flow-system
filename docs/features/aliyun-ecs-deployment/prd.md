# 阿里云 ECS 生产迁移 PRD

## 文档状态

- 状态：开发中
- 负责人：周荣庆
- 研发待办：DEV-000014
- 最近更新：2026-07-29

## 背景与问题

Cloudflare Pages Functions 已出现 `Worker exceeded CPU time limit`。2026-07-29
观测到 8,393 次请求中有 387 次 CPU 超限，错误数与 CPU 超限数完全相等。
同日 D1 信息显示正式库约 170 MiB、展示库约 75 MiB；正式库 24 小时读取约
2 亿行，说明迁移后仍需关注查询扫描量与索引，而不能把主机迁移当成性能优化的
终点。

公司已购买杭州 ECS（2 vCPU、2 GiB 内存、40 GiB 系统盘、3 Mbps 公网带宽）、
40 GB 中国大陆 OSS 标准存储包和域名 `deshan-tiyes.cn`。域名已完成企业
实名认证，但 ICP 备案尚未开始，因此正式 HTTPS、DNS 和钉钉回调切换暂不能
完成。

## 目标

1. 在 ECS 上运行现有 React 静态资源与 Pages Functions，业务请求不再执行
   Cloudflare Worker。
2. 把正式与展示 D1 通过受控导出、校验和导入迁移到 ECS 持久化 SQLite。
3. 保持现有钉钉登录、权限、数据环境、快麦采集和平台凭证边界不变。
4. 生成可校验的本地数据库备份，并在 OSS Bucket 与实例角色就绪后上传 OSS。
5. Cloudflare 正式站保持可用，直到阿里云域名、认证和数据完成切流验收。

## 非目标

- 本次不购买或迁移到 RDS；只定义可执行的 RDS 迁移触发条件。
- 不同时向 D1 与 SQLite 双写。
- 不把 OSS 当作在线数据库，也不在本次引入 CDN。
- 不删除 Cloudflare Pages、D1 或现有固定生产域名。
- 不重构 219 个 Pages Functions 为第二套 Node API。

## 用户与权限

- 已登录员工沿用钉钉会话与服务端权限读取业务数据。
- 总经办继续负责数据环境切换、平台凭证和生产修复授权。
- ECS 运维人员只能通过服务器配置文件注入 Secret；Secret 不进入镜像、Git、
  浏览器、日志或 OSS。
- OSS 备份使用最小权限的 ECS 实例 RAM 角色；未配置角色时备份保留在 ECS，
  上传必须失败关闭。

## 当前流程

1. 浏览器访问 Cloudflare Pages。
2. Pages Functions 执行业务 API 并访问远程 D1。
3. 钉钉回调、会话、控制数据和业务数据全部位于 Cloudflare 运行边界。
4. CPU 时间超过 Worker 套餐限制时请求失败。

## 目标流程

1. 浏览器通过 `deshan-tiyes.cn` 访问 Nginx Proxy Manager。
2. Nginx Proxy Manager 把请求代理到同 Docker 网络的应用容器。
3. 容器使用 Wrangler/Miniflare/workerd 兼容层运行现有 Pages Functions。
4. `PRODUCT_FLOW_DB` 与 `DEMO_FLOW_DB` 指向 ECS 数据卷中的两个独立本地 D1
   SQLite 实例。
5. 定时任务导出两个本地数据库、生成 SHA-256 清单并上传私有 OSS Bucket。

## 业务规则

- ECS SQLite 是正式业务事实源后，Cloudflare D1 只作切流回滚点，不允许继续
  接受业务写入。
- 切流必须有短暂停写窗口；停止公司采集器并通知用户不进行业务写入后，才能
  执行最终 D1 导出。
- 正式库与展示库必须继续物理隔离；不得把两份 SQL 导入同一绑定。
- `LOCAL_ONLINE_ACCOUNT_MODE` 不得在公网 ECS 运行时启用。
- 公网只暴露 Nginx Proxy Manager 的 80/443；应用 8080 仅绑定宿主机回环地址
  并加入代理内部网络。
- OSS Bucket 必须为私有、阻止公共访问；图片对外访问后续通过签名 URL 或 CDN
  方案单独设计。

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

- 任一 D1 导出失败：不停止 Cloudflare，不执行切流。
- 任一 SQLite 导入或关键表校验失败：删除本次空白目标数据卷后重试，Cloudflare
  继续服务。
- ECS 内存不足或容器被 OOM：保持 Cloudflare DNS，不切流；运行时设置内存上限
  并记录容器重启。
- OSS 未创建或实例角色未授权：本地备份仍生成，但上线状态标记“OSS 备份受阻”。
- 域名未实名或未备案：只允许回环/服务器内技术验收，不宣称公网生产上线。
- D1 最终导出后出现新写入：取消切流，恢复采集器，重新安排停写窗口。

## 验收标准

1. 容器以非交互模式启动，重启后两个本地数据库仍存在。
2. 匿名 `/api/auth/session` 返回明确 401；不存在公网本地管理员旁路。
3. 自定义 HTTPS Origin 生成同源钉钉 callback，不回退到 Pages 域名。
4. 正式与展示数据库的表数、关键表行数和导出 SHA-256 有独立校验记录。
5. 备份任务同时导出两个库并生成清单；OSS 未配置时明确受阻，配置后可上传私有
   Bucket。
6. 切流前 Cloudflare 生产站仍通过 readiness；阿里云入口通过冷启动、暖请求和
   并发请求验收后才修改正式入口。

## 上线与回滚

- 第一阶段只部署 ECS 私有预发布：应用端口绑定 `127.0.0.1`，通过服务器内
  `curl` 验收。
- 第二阶段完成域名实名、ICP备案、DNS、证书和钉钉回调白名单后，配置代理但
  暂不关闭 Cloudflare。
- 最终切流使用停写窗口执行最后一次导出、导入和校验，再修改公司入口。
- 回滚时停止阿里云写入，把公司入口恢复到
  `https://deshan-tiyes-system.pages.dev`；不得把两边产生的数据自动合并。

## RDS 迁移触发条件

任一条件持续出现即启动独立 RDS 迁移：

- 数据库文件超过 10 GiB。
- 需要两个及以上应用实例同时写入。
- SQLite 写锁或请求排队导致 p95 API 延迟连续 15 分钟超过 500 ms。
- ECS 数据库进程稳定占用超过 1 GiB 内存，或发生两次 OOM 重启。
- 备份恢复演练无法在 30 分钟内完成。
