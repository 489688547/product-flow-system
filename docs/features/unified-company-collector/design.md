# 公司单一采集运行时设计

## 架构决策

结论为“扩展现有能力”：保留 `scripts/web-data-collector` 作为共享运行时，直接复用
`scripts/kuaimai-erp-collector` 的文件识别、解析、归档和上传模块，不再维护第二个常驻调度器。

未选择的方案：

- 继续维护两套 LaunchAgent：改动最少，但地址、令牌、日志和运行状态会继续漂移。
- 新建第三个 supervisor 管理两个子进程：能统一启停，但保留重复调度和故障面，没有业务收益。

## 运行单元

统一服务包含三个清晰单元：

1. 网页任务周期：沿用现有 60 秒 `orchestrator.prepare()` 与 provider runtime。
2. 本地文件周期：启动时及每 900 秒独立调用 `scanWaitingDirectory()`；只有实际上传时才从 Keychain 读取 ERP token，并向 ECS ingest 上传。
3. 本地归档串行器：浏览器下载交付和待导入目录扫描通过同一异步队列及归档根目录文件锁更新归档文件、manifest 和扫描状态，旧 CLI 与新服务也不能跨进程并发写。

本地文件周期失败只产生安全日志和下一轮重试，不抛出到顶层结束服务。网络错误与 5xx 保留源文件等待重试，解析或口径错误才进入失败目录。网页周期与本地扫描分别防重入和计时，慢扫描不阻塞网页心跳；进程停止时先停止新周期，再等待在途周期和归档队列排空后关闭。

## LaunchAgent 与切换

统一 LaunchAgent 的标准输出和错误输出固定为：

```text
~/Library/Logs/product-flow/com.company.web-data-collector.log
```

安装器先创建权限为 `0700` 的日志目录，再原子写入权限为 `0600` 的 plist。配置继续只包含稳定主检出入口、归档根目录、ECS base URL 和浏览器模式，不包含秘密。

生产切换分两阶段：

1. 安装统一服务并验证 PID、loopback、日志代码指纹和 ECS 心跳。
2. `bootout` 旧服务，将旧 plist 改名为 `.disabled`；如果第一阶段失败，不执行第二阶段。

## 接口兼容

- `scanWaitingDirectory({ root, upload, resourceType })` 保持不变。
- ERP ingest、web-collection jobs、commerce-facts ingest 的请求和响应不变。
- 浏览器模式保持 `dedicated`，现有 Chrome 扩展与专用 Profile 不变。
- 旧快麦 CLI 继续保留手工 `preflight/upload/archive-existing` 命令，但其 `install` 标记为兼容回滚入口，不再是正式常驻安装方式。

## 错误与可观测性

- 日志目录创建失败：安装失败，旧配置保持可回滚。
- 扫描已经在运行：跳过本轮并记录 `already_running`。
- 本地扫描异常：记录错误码和安全摘要，不记录文件绝对路径、令牌或原始数据。
- 统一服务退出：launchd `KeepAlive` 重启；连续失败可从统一日志和 `launchctl print` 定位。
- 旧服务只有在统一服务验证成功后才停用，避免迁移窗口内两边都不可用。

## 测试设计

- 安装器契约：日志位于 Library、目录提前创建、plist 无秘密。
- 本地周期：启动立即执行、900 秒节流、防重入、异常不终止网页周期。
- 串行边界：目录扫描与浏览器下载不能同时进入归档写入，旧 CLI 与新服务争用同一归档根目录时也只能有一个获得文件锁。
- 兼容回归：现有快麦解析、幂等、网页调度、Chrome bridge 和 provider 测试保持通过。
- 真实验收：ECS 目标、唯一 LaunchAgent、PID、17653、代码指纹、空扫描结果和旧服务禁用状态。

## 规则写回

更新 `docs/platform/data-acquisition.md` 与既有公司网页采集 feature 文档：正式本机采集只有一个常驻服务，ECS 是唯一后端，D1 文案改为已退役历史边界。
