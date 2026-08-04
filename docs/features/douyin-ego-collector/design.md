# 抖音 Ego 唯一采集通道设计

## 文档状态

- 状态：已确认
- 研发待办：`DEV-000019`
- 开发分支：`codex/ego-douyin-collector`
- 最近更新：2026-08-04

## 问题与证据

公司实际可用的抖店登录态在 Ego。2026-08-04 的单条 `video_daily` 验证虽然被路由为
`dedicated`，执行器实际启动的却是一个独立 Google Chrome Profile，而不是 Ego。该 Profile 打开
罗盘短视频页后先停留在正文为空的报表壳，约 15 秒后跳转 `/login`；现有适配器只等待 12 秒，
因此在登录跳转完成前把 `loading` 错误收敛成 `DOUYIN_PAGE_SCHEMA_CHANGED`。同一时刻 Ego 可正常
打开 `/shop/video/overview`，显示已登录店铺、日期控件和经营指标。

本次改动同时解决两个根因：抖音任务必须真正进入 Ego；页面状态机不得再把加载超时或登录跳转
包装成页面结构变化。

## 目标与非目标

### 目标

- 抖音任务按稳定 `storeId` 绑定固定 Ego Task Space，只由 Ego 执行。
- 复用 Ego 已有登录态，不读取、复制或保存 Cookie、密码和验证码。
- 明确区分 Ego 不可用、登录失效、人工验证、店铺不一致、加载超时和真实页面结构变化。
- 继续复用现有任务、租约、检查点、归档、解析、幂等上传和 Provider fact processor。
- 快麦继续使用现有 MV3 Chrome 扩展，不受抖音执行器切换影响。
- 阿里云 ECS/SQLite 是唯一正式数据目的地；不可达时保留本地待上传检查点，不回写 D1。

### 非目标

- 不自动输入账号密码，不处理验证码、滑块、扫码或设备验证。
- 不接管用户普通 Ego 标签页，不使用个人 Google Chrome Profile。
- 不把千川并入抖店经营事实采集。
- 不在本事项内完成 ICP 备案、域名切换或公网阿里云部署。
- 不重写快麦扩展、通用任务队列或报表解析器。

## 方案选择

采用 Ego 本地适配器。长期运行的本机 collector 通过已安装的 `ego-browser` CLI 启动一次受限的
Node 任务，脚本只接收固定任务字段并输出单个结构化结果。Ego Task Space 继承用户登录态，页面
操作使用 Ego 提供的 navigation、DOM 和 CDP 能力。

不采用以下方案：

- 不把 MV3 插件简单搬进 Ego。插件生命周期、长等待和桥接丢消息问题仍然存在。
- 不连接 Ego 未公开的内部调试端口。该方式依赖应用内部实现，升级后不可维护。
- 不把 Google Chrome 保留为自动回退。回退会重新引入登录态分叉和串店风险。

## 架构

```text
公司平台 / 阿里云控制面
          ↓ 固定任务、租约、storeId
公司 Mac collector
          ↓ allowlisted JSON over stdin
Ego 本地适配器进程
          ↓ 固定 Task Space
已登录抖店罗盘
          ↓ 官方文件或登记同源接口
任务独立下载目录
          ↓
本地归档 → 解析与校验 → 幂等上传
          ↓
阿里云 ECS API → SQLite 事务
```

collector 仍是任务与文件生命周期的拥有者。Ego 只负责短页面动作、同源请求和下载，不负责领取
任务、决定数据库、解析报表或宣告业务成功。

## Ego 进程协议

新增业务中立的浏览器执行边界，正式实现只接受以下输入：

```json
{
  "jobId": "stable-job-id",
  "providerId": "douyin-ecommerce",
  "storeId": "90862283",
  "storeName": "登记店铺名称",
  "resourceType": "video_daily",
  "businessDate": "2026-08-03",
  "workspace": "/absolute/local-task-directory"
}
```

输入不得包含远程 URL、选择器、脚本、Cookie、Token、数据库 ID 或 binding。URL、页面哨兵、同源
接口和动作仍固定在仓库 Provider adapter 内。输出只允许一个 JSON 对象：下载结果、固定抓取结果
或稳定错误；标准输出中的其它内容视为协议错误。文件路径必须位于本任务工作目录，collector 再按
现有安全规则解析和归档。

LaunchAgent 不依赖交互式 shell 的 `PATH`。安装器在安装时解析并验证 `ego-browser` 的绝对路径，
运行时再次确认它是本机普通文件且不位于仓库或下载目录。Ego CLI 缺失、版本不兼容或应用未运行
时返回 `EGO_UNAVAILABLE`，不得启动 Chrome。

## Task Space 与店铺绑定

每个 `(providerId, storeId)` 使用一个确定性的本地 Task Space 记录，服务端只看到稳定
`providerId/storeId`，不接收 Task Space ID、标签页 ID、本机路径或页面正文。

首次执行创建 agent-owned Task Space；后续任务复用该空间。执行前必须在罗盘页面同时确认：

1. origin 是登记的 `https://compass.jinritemai.com`；
2. 当前不是登录、扫码或人工验证页面；
3. 页面显示的稳定店铺身份与任务 `storeId` 对应；
4. 当前资源页面已达到可操作状态。

登录失效时保留该 Task Space 并交给用户，任务进入 `waiting_human`。用户在公司平台明确点击“已
完成登录，重试”后，collector 才重新取得该空间控制权。没有这次明确确认，不得自动抢回用户控制
或循环重试。

## 页面状态机

页面打开后按条件轮询，不再使用“固定时间到了就等于结构变化”的规则：

```text
opening
  ├─ Ego/Task Space 不可达 → waiting_human:EGO_UNAVAILABLE
  ├─ /login 或登录页哨兵 → waiting_human:DOUYIN_LOGIN_REQUIRED
  ├─ 验证码/扫码/滑块/设备验证 → waiting_human:DOUYIN_HUMAN_VERIFICATION_REQUIRED
  ├─ 店铺身份与任务不一致 → waiting_human:DOUYIN_STORE_MISMATCH
  ├─ 页面仍为空、仍导航或关键请求未稳定 → failed:DOUYIN_PAGE_LOAD_TIMEOUT
  ├─ 页面稳定且店铺已确认，但登记资源哨兵缺失 → schema_changed:DOUYIN_PAGE_SCHEMA_CHANGED
  └─ 页面与资源哨兵完整 → collecting/exporting
```

`DOUYIN_PAGE_SCHEMA_CHANGED` 只能在预期 origin、已登录、店铺身份已确认、文档加载完成且页面已
稳定后产生。单纯 `readyState` 未完成、正文为空、网络仍繁忙或等待登录重定向只能产生加载超时或
登录状态，不能产生结构变化。

## 下载、检查点与恢复

第一项实施验证是 Ego 当前版本的下载能力探针：在测试 Task Space 中设置任务独立下载目录，订阅
CDP 下载开始/进度事件，并核对最终文件真实存在。如果 Ego 当前版本不能提供受控下载目录和完成
事件，本事项停止在 `EGO_DOWNLOAD_CAPABILITY_UNAVAILABLE`，不得回退 Chrome 或只凭页面“导出
完成”继续。

页面动作、文件落盘、归档、解析、上传和数据库提交分别保存检查点。重启后只有任务 ID、店铺、
资源、业务日期、文件哈希和适配器版本一致时才能恢复。网络和文件等待可按已有退避策略重试；
登录、人工验证、店铺不一致和结构变化不自动重试。

## 数据目的地与成功标准

抖音事实只上传到配置为正式目标的阿里云 ECS API，并由 SQLite 事务返回批次 ID、接收行数和校验
摘要。浏览器或 runner 不选择数据库 binding。备案或网络尚未打通时，已归档并验证的结果进入本地
`pending_upload` 检查点；界面显示“待上传”，游标不推进，任务不标记成功。

Cloudflare D1 只保留回滚边界，不接收本事项产生的采集写入。现有代码若仍指向 Cloudflare ingest，
正式 Ego 执行器必须 fail closed，而不是双写或静默沿用旧目标。

一次真实成功必须同时具备：

1. Ego Task Space、登录和店铺身份核对成功；
2. 业务日期在页面或同源请求中真实生效；
3. 官方文件真实落盘；
4. 本地归档路径和内容哈希可回读；
5. 解析通过且业务日期、资源和必需字段一致；
6. 阿里云 API 返回批次 ID、行数和校验摘要；
7. SQLite 事务确认后任务才进入 `success` 并推进游标。

## 可观测性与安全

本机日志记录 `jobId/providerId/storeId/resourceType/businessDate/executor/stage/errorCode`，其中执行器
固定显示 `ego`。日志不记录 Cookie、Token、完整页面正文、原始响应、绝对 Profile 路径或账号凭据。

诊断截图仍只允许来自登记页面，本机加密保存并按现有七天策略清理。服务端只接收稳定错误码、
安全摘要和诊断编号。Task Space ID、Ego 内部端口和本机文件绝对路径不上传。

## 兼容与回滚

- 快麦继续由 extension bridge 领取，抖音任务永远不暴露给 Chrome 扩展。
- 原 `dedicated` Google Chrome 实现保留一版只用于代码回滚，但正常配置、安装脚本和自动路由不得
  选择它；回滚必须是人工、显式、带审计的版本回退，不能在运行时自动发生。
- 上线前先只启用一个店铺的一条 `video_daily`，通过完整证据链后再启用其它资源。
- 试验失败只恢复旧版本代码和任务配置，不删除原始文件、检查点、运行记录或诊断。

## 验证

1. 单元测试覆盖 Ego 输入输出白名单、Task Space 绑定和错误码分类。
2. 状态机测试复现“0.8 秒空白、15 秒跳登录”，断言结果为登录失效而非结构变化。
3. 运行时测试断言 Ego 不可用时不调用 Google Chrome，不领取或执行快麦任务。
4. 下载测试要求真实文件存在、大小稳定、哈希可重复，页面文案不能替代文件证据。
5. 恢复测试覆盖 Ego/collector 重启、用户接管、明确确认后恢复和重复结果提交。
6. 集成测试覆盖归档、解析、幂等上传、阿里云回执和 SQLite 事务失败。
7. 完整运行 `lint`、governance、integrations、environment capabilities、`npm test` 和 build。
8. 生产前仅手工触发一个店铺的一条 `video_daily`；没有完整证据链时不得批量排队或宣告完成。
