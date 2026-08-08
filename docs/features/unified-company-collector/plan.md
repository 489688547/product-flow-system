# 公司单一采集运行时实施计划

> **执行要求：** 使用测试驱动逐项实施；每项先确认目标测试因缺失行为失败，再写最小实现。

**目标：** 让公司 Mac 只运行 `com.company.web-data-collector`，由它同时处理网页采集与快麦本地待导入扫描，并消除 LaunchAgent 的桌面日志权限故障。

**架构：** 扩展现有网页采集运行时，不创建新队列、API、令牌或数据库结构。本地文件周期复用快麦 scanner/parser/uploader，并与浏览器下载归档共用一个进程内串行器；安装器把日志写入用户 Library Logs。旧快麦 CLI 保留人工与回滚命令，但其 LaunchAgent 在统一服务验收后禁用。

**技术栈：** Node.js ESM、macOS LaunchAgent/Keychain、现有 ECS API、Node test runner。

## 全局约束

- 正式 base URL 固定为 `https://deshan-tiyes.cn`。
- 浏览器模式保持 `dedicated`，不修改 provider 页面动作。
- 本地扫描周期固定 900 秒，网页周期固定 60 秒。
- 不新增或修改服务端持久表、API 请求形状、事实字段和环境变量。
- 不上传原始文件、Cookie、Token、验证码、页面正文或本地绝对路径。
- 只有新服务真实在线后才禁用旧服务；回滚不删除任何本地或线上事实。

## 文件职责

- 创建 `scripts/web-data-collector/local-inbox.mjs`：本地扫描节流、串行执行与安全失败结果。
- 修改 `scripts/web-data-collector/index.mjs`：将浏览器下载和本地扫描接入同一串行边界，管理两个周期。
- 修改 `scripts/web-data-collector/automation.mjs`：将日志写入 `~/Library/Logs/product-flow/` 并创建目录。
- 修改 `scripts/kuaimai-erp-collector/automation.mjs`：让兼容回滚安装也使用安全日志目录。
- 修改 `tests/web-data-collector-runtime.test.mjs`：覆盖本地扫描周期、节流、异常隔离和串行。
- 修改 `tests/web-data-collector-automation.test.mjs`、`tests/kuaimai-erp-local-archive.test.mjs`：覆盖日志目录契约。
- 修改 `docs/platform/data-acquisition.md` 与既有采集 feature 文档：写回单服务、ECS 和回滚规则。

## 接口与契约

```js
createLocalArchiveSerial().run(operation) -> Promise<unknown>

createLocalInboxCycle({
  root,
  upload,
  serial,
  now,
  intervalMs
}).runIfDue() -> Promise<{
  due: boolean,
  status: "success" | "skipped" | "failed",
  result?: ScanResult,
  errorCode?: string
}>
```

`runIfDue()` 首次调用立即运行；900 秒内重复调用返回 `skipped`。扫描异常被规范为稳定错误码，不结束网页运行时。浏览器下载处理与扫描都通过同一个 `serial.run()`。

## 数据迁移

无数据库迁移。LaunchAgent 迁移仅更新本机 plist：新服务成功后把
`com.company.kuaimai-erp-collector.plist` 改名为 `.plist.disabled` 并 bootout。原始文件、归档、manifest、扫描状态、检查点和 Keychain 项保持原位。

## 风险与回滚

- 风险：扫描耗时阻塞浏览器归档。控制方式：只串行本地归档写入，不阻塞网页心跳和任务准备。
- 风险：日志目录仍不可写。控制方式：安装前创建 `0700` 目录，写入失败不替换已加载服务。
- 风险：统一服务失败后旧服务已停。控制方式：先验收 PID、loopback、日志和 ECS 心跳，再执行 bootout/改名。
- 回滚：停止统一服务，恢复旧 plist 文件名，用最新主线重新安装旧 CLI 到 ECS 地址并 bootstrap。

## 验证命令

```bash
node --test tests/web-data-collector-runtime.test.mjs tests/web-data-collector-automation.test.mjs tests/kuaimai-erp-local-archive.test.mjs
npm run test:web-collector
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

真实环境另外验证：plist 目标与日志路径、`launchctl list/print`、PID、`lsof 127.0.0.1:17653`、日志代码指纹、ECS `/healthz`、空扫描结果，以及旧服务未加载。

## 任务顺序

### 任务 1：安全日志路径

**接口：** 两个 `collectorLaunchAgentPlist()` 继续返回 plist 文本；两个 `installLaunchAgent()` 在 bootstrap 前创建统一日志目录。

- [ ] 在两个 automation 测试中断言日志路径不位于 Desktop，且安装器创建 Library Logs 目录。
- [ ] 运行聚焦测试并确认因当前桌面日志路径失败。
- [ ] 修改两个安装器，保持 plist 无秘密和稳定主检出路径行为。
- [ ] 运行聚焦测试确认通过并提交。

### 任务 2：把快麦本地扫描并入网页运行时

**接口：** 新建 `createLocalArchiveSerial()` 与 `createLocalInboxCycle()`；`serve()` 复用既有 ERP token、scanner 和 uploader。

- [ ] 写运行时测试，覆盖首次扫描、900 秒节流、失败隔离和浏览器下载/扫描串行。
- [ ] 运行测试并确认因新接口不存在失败。
- [ ] 写最小本地周期模块，并在 `serve()` 中接入；停止时清理两个 timer。
- [ ] 运行聚焦测试和 `test:web-collector`，确认旧 provider 行为兼容并提交。

### 任务 3：规则写回与生产切换

**接口：** 不新增代码接口；更新正式采集运行契约与运维证据。

- [ ] 更新 `docs/platform/data-acquisition.md` 和既有 PRD/design/tasks，删除正式链路仍写 D1/双 LaunchAgent 的陈旧描述。
- [ ] 运行完整 Definition of Done 与 PR 检查，提交并按 feature → dev → main GitOps 发布。
- [ ] 从最新主线重装统一 LaunchAgent，验证 ECS、PID、loopback、日志和本地扫描。
- [ ] 验证成功后 bootout 旧服务并把 plist 改名 `.disabled`；复核只剩一个启用服务。
- [ ] 将真实证据写入 `DEV-000017` 并提交验收。
