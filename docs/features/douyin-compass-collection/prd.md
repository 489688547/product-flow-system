# 抖店罗盘经营数据采集 PRD

## 文档状态

- 状态：已评审，开发中
- 负责人：数据中心 / 运营部
- 最近更新：2026-07-24

## 背景与问题

抖店后台与电商罗盘已包含店铺、商品、直播和短视频经营数据，但数据中心当前没有稳定的标准事实。账号密码自动登录会遇到协议、验证码、滑块、扫码和设备验证，不能作为可靠的无人值守入口；运营人工逐页查看或导出，也无法形成统一同步记录和跨 App 复用。

本功能不恢复旧的凭据登录任务，而是复用公司 Chrome 中由员工维护的现有登录态，通过 MV3 扩展执行官方报表下载，并仅在店铺总览无官方下载时读取固定白名单指标。

## 目标

- 每天 Asia/Shanghai 05:00 采集昨天的 `store_daily`、`product_daily`、`live_daily`、`video_daily`。
- 四类资源独立执行、独立记录成功/失败/等待人工、独立推进游标。
- 官方 XLSX/CSV 优先；只有 `store_daily` 可使用代码登记的固定指标读数。
- 原始文件保存在公司 Mac，标准事实、数据质量和任务结果写入任务创建时服务端确定的业务 D1。
- 数据中心、电商店铺运营和公司经营通过只读 API 消费同一标准事实。
- 首版先完成昨天真实数据验收，不启动历史回补。

## 非目标

- 不保存账号密码、Cookie、Token、验证码、完整页面、截图、网络响应或客户个人信息。
- 不自动处理登录协议、验证码、滑块、扫码或设备确认。
- 不调用抖店内部未公开接口，不通过 WebRequest、Debugger 或网络拦截采集。
- 不采集订单、物流、售后工单、评论原文或用户身份。
- 不接入巨量千川广告账户、消耗、计划、素材或付费 ROI。
- 不用缺失值补零，不把下载完成冒充 D1 入库成功。

## 用户与权限

- 已授权员工可查看资源就绪度、安全错误摘要和恢复动作。
- 数据负责人可触发重试；普通查看者不能改任务目标环境、店铺或资源定义。
- 采集器只能领取服务端签发的固定任务；浏览器和本机 runner 不能指定 D1 binding 或数据库 ID。
- 原始归档只保存在公司 Mac，不通过页面或 API 暴露绝对路径和文件内容。

## 核心流程

1. 05:00 后服务端为已登记店铺生成四个昨天任务，并持久化目标环境和版本。
2. 公司 Mac runner 领取任务，插件在固定抖店/罗盘来源校验登录态、店铺身份、页面类型和业务日。
3. 有官方报表则触发下载；`store_daily` 无报表时只读取固定白名单指标。
4. 本机完成文件稳定性检查、原始归档、解析、脱敏、业务日核对和标准化预检。
5. 事实按批次写入目标业务 D1；只有完整批次提交后任务才成功并推进资源游标。
6. 登录、验证码、滑块、扫码或设备确认进入 `waiting_human`；员工处理后重试原任务。

## 业务规则

- Provider 固定为 `douyin-ecommerce`。
- 资源固定为 `store_daily`、`product_daily`、`live_daily`、`video_daily`。
- 业务日使用 Asia/Shanghai 自然日；日计划目标为昨天。
- 幂等范围是 `providerId + storeId + resourceType + businessDate + schemaVersion`。
- 四类资源允许部分成功；失败资源不影响已成功资源，也不删除最后可信事实。
- 明确无记录可写 `rowCount=0` 且 `confidence=high`；页面失败或权限不足的行数为 `null`。
- 缺失指标写 `null`；比例、均值和转化率从原子分子与分母在查询层重算。
- 自然经营事实与巨量千川付费投放事实保持独立，读取接口不得把未接入的广告数据返回为 0。

## 数据定义

### 店铺每日

维度为 provider、storeId、businessDate、sourceVersion。原子事实包括成交金额、成交订单数、成交人数、用户支付金额、结算金额、退款金额与退款订单数的支付时间/退款时间口径，以及商品曝光人数、商品点击人数。

### 商品每日

维度为 provider、storeId、平台商品 ID、可选平台 SKU ID、businessDate。原子事实包括曝光、点击、成交人数/订单/件数/金额、用户支付金额、退款订单/件数/金额；名称、SKU 名称和商家编码为业务展示字段。

### 直播每日

维度为 provider、storeId、直播场次 ID、businessDate、开播/结束时间。原子事实覆盖曝光、进入、观看、有效观看、商品点击、加购、成交人数/订单/件数/金额、用户支付金额、退款订单/金额和时长。

### 短视频每日

维度为 provider、storeId、视频 ID、businessDate、发布日期。原子事实覆盖播放人数/次数、有效播放、点赞、评论数、分享、商品曝光/点击、成交人数/订单/件数/金额及退款订单/金额；不保存评论正文和用户身份。

### 数据质量

每个资源返回 `latestDate`、`lastSuccessfulSyncAt`、`coverage`、`confidence`、`status`、`errorCode` 和 `lastTrustedBusinessDate`。缺失字段为 `null`。

## 异常与恢复

- `DOUYIN_LOGIN_REQUIRED`：在公司 Mac 的同一 Chrome Profile 登录抖店。
- `DOUYIN_HUMAN_VERIFICATION_REQUIRED`：人工完成验证码、滑块、扫码或设备确认。
- `DOUYIN_STORE_IDENTITY_MISMATCH`：确认当前标签页店铺与任务一致。
- `DOUYIN_*_DATE_RANGE_NOT_APPLIED`：重新应用昨天日期后重试。
- `DOUYIN_EXPORT_GENERATION_FAILED` / `DOUYIN_EXPORT_TIMEOUT`：等待平台报表生成或重试。
- `DOUYIN_REPORT_SCHEMA_CHANGED` / `DOUYIN_REQUIRED_FIELDS_MISSING`：停止入库并更新 adapter。
- `DOUYIN_RESOURCE_NOT_COVERED`：该资源尚未通过真实页面验收。

错误摘要只能包含平台、店铺显示名、资源、业务日、阶段和恢复动作，不包含页面正文、追踪码、绝对路径或业务行。

## 验收标准

1. 插件只在登记来源和资源上执行，未知 provider/resource/task 字段均 fail closed。
2. 四类资源能为昨天生成独立任务，并在成功、失败、等待人工时写入同步记录。
3. 下载任务完成原始归档、解析、质量校验和 D1 完整批次提交；中途失败保持上一可信批次。
4. `store_daily` 页面兜底只返回固定安全原子指标，不返回任意页面内容。
5. 读取 API 支持日期范围、provider、storeId、resourceType 及资源稳定 ID；响应不补零。
6. 数据接入页显示“Chrome 官方报表采集”的真实 readiness，巨量千川仍为未接入。
7. 首次真实验收至少完成一个已登录店铺的昨天四资源探测，并记录每个资源的实际结果与恢复动作。
8. 全部治理、集成、环境、测试和构建门禁通过；GitHub main 的 GitOps 部署和生产验证通过后才算交付。

## 上线与回滚

先上线控制面、事实表和只读 API，再发布未启用的插件 adapter；公司 Mac 重载扩展并完成昨天验收后才将 integration 状态提升为 `integrating`。回滚时停用 Douyin adapter 和日计划，保留已完成事实、批次、同步记录与原始归档；旧账号密码登录保持退役，不恢复凭据。
