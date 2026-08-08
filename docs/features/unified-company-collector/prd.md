# 公司单一采集运行时 PRD

## 文档状态

- 状态：已评审
- 负责人：数据中心
- 最近更新：2026-08-08

## 背景与问题

公司 Mac 同时安装 `com.company.web-data-collector` 与
`com.company.kuaimai-erp-collector`。前者负责网页任务、官方报表下载、解析和受控上传，后者每
15 分钟扫描快麦本地待导入目录。网页采集器已经复用后者的解析、归档和上传模块，两套常驻进程不再代表两个独立业务能力，却仍分别持有 LaunchAgent、目标地址和日志配置。

阿里云迁移后，两份旧 LaunchAgent 仍指向退役的 Cloudflare Pages。重新安装时，当前安装器又把标准输出写到受 macOS 隐私保护的桌面归档目录，导致 launchd 在启动程序前以 `EX_CONFIG(78)` 退出。结果是配置已更新但采集服务仍不在线。

## 目标

- 公司 Mac 只保留一个 `com.company.web-data-collector` 常驻服务。
- 网页采集和本地快麦待导入目录扫描由同一进程调度，继续复用既有解析、归档、幂等上传和钥匙串令牌。
- 正式目标固定为 `https://deshan-tiyes.cn`；Cloudflare 不再作为采集后端。
- LaunchAgent 日志写入 `~/Library/Logs/product-flow/`，不依赖桌面目录权限。
- 新服务通过进程、loopback、ECS 心跳和一次本地扫描验证后，旧 LaunchAgent 才停用，并保留明确回滚路径。

## 非目标

- 不修改快麦或抖店页面适配器、业务口径和事实结构。
- 不新增数据库表、环境变量、令牌或生产写入接口。
- 不重放历史文件、不手工修改事实、不切换现有 `dedicated` 浏览器模式。
- 不在这次修复中改造数据同步页面。

## 用户与权限

公司 Mac 当前登录用户安装和运行本机服务。服务继续从 macOS Keychain 读取网页 runner、配对密钥和 ERP ingest 令牌。现有服务端认证、授权、任务租约、幂等和审计保持不变。

## 当前流程

1. 网页采集服务每分钟领取和执行登记任务。
2. 独立快麦文件服务每 15 分钟扫描待导入目录。
3. 两套 LaunchAgent 分别保存后端地址和日志位置，迁移时容易漂移。
4. 任一服务启动失败只能从独立退出码和日志排查。

## 目标流程

1. 唯一 LaunchAgent 启动网页采集服务。
2. 每分钟执行网页任务周期；每 15 分钟在同一进程内执行一次快麦本地目录扫描。
3. 浏览器下载处理与目录扫描共用本地串行边界，避免同时更新归档清单。
4. 任一局部周期失败只记录安全错误并等待下轮恢复，不中断另一条采集路径。
5. 进程、loopback、ECS 目标和本地扫描均验收成功后，旧快麦 LaunchAgent 退出并改名为禁用备份。

## 业务规则

- `web-data-collector` 是公司 Mac 唯一常驻采集运行时。
- 网页周期保持 60 秒；本地待导入目录扫描保持 900 秒，首次启动立即扫描一次。
- 本地扫描与浏览器下载归档不得并发写同一 manifest、扫描状态或待处理目录。
- 文件上传继续使用原文件哈希、资源类型和来源键幂等；统一进程不得改变事实内容。
- 扫描失败不得把文件移入成功目录，不得推进网页任务游标，也不得退出常驻服务。
- 正式安装只允许登记的 ECS origin；Cloudflare、任意 IP、路径或查询参数均不可成为正式目标。
- LaunchAgent 配置和日志不得包含令牌、Cookie、验证码或平台凭据。

## 数据定义

- `browserCycleIntervalMs`：60,000 毫秒。
- `localInboxIntervalMs`：900,000 毫秒。
- `localInboxResult`：沿用 `scanWaitingDirectory` 的 `discovered/waiting/processed/failed/duplicates/status`。
- `logPath`：`~/Library/Logs/product-flow/com.company.web-data-collector.log`。
- 不新增服务端持久字段；任务、批次、归档和事实继续沿用现有契约。

## 异常与边界

- 日志目录不可写：安装器在 bootstrap 前创建目录并失败退出，不写入不可启动的 plist。
- 本地锁存在：本轮扫描返回 `already_running`，网页心跳与后续周期继续。
- ERP 令牌失效：本地扫描记录安全错误，浏览器控制面仍继续；不得降级为匿名上传。
- ECS 不可达：保留本地文件和检查点，下轮重试，不切回 Cloudflare。
- 新服务未通过真实健康检查：不得停用旧配置备份。
- 回滚：停用统一服务，恢复禁用的旧 plist，并继续使用 ECS 地址；本地文件和可信事实不删除。

## 验收标准

- LaunchAgent 中只存在一个启用的公司采集服务，目标为 `https://deshan-tiyes.cn`。
- 服务 PID 持续运行，`127.0.0.1:17653` 由该 PID 监听，日志出现当前代码指纹。
- 启动后执行一次空目录扫描并保持服务在线；有稳定测试文件时沿用既有解析与幂等结果。
- 日志位于 `~/Library/Logs/product-flow/`，LaunchAgent 不再因桌面日志路径返回 78。
- 旧 `com.company.kuaimai-erp-collector` 不再加载，plist 以禁用备份形式保留。
- 聚焦测试、仓库 Definition of Done、固定测试环境和公司 Mac 真实运行验收均通过。

## 上线与回滚

先合入 `dev` 并通过固定测试环境，再按 `dev → main` 发布同一提交。公司 Mac 从最新 `main` 运行统一安装，验证新服务后停用旧服务。若新服务在 10 分钟内无法维持进程、loopback 或 ECS 心跳，则恢复旧 plist、保留 ECS 地址并重新 bootstrap；不删除任何归档、检查点或事实。
