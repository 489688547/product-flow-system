# ADR：抖店仅恢复已登录 Chrome 的只读官方报表采集

## 状态

已接受，2026-07-24。

## 背景

原抖店网页连接依赖账号密码自动登录，但平台会动态要求协议、邮箱或手机验证码、滑块、扫码和设备确认。该流程不能可靠无人值守，并扩大了凭据保存范围，因此在 2026-07-21 被退役并销毁凭据。

公司 Chrome 中由员工维护的抖店登录态可以访问官方经营报表。数据中心已具备固定任务、设备身份、租约、下载、归档、游标、通知和 D1 目标环境控制，可以在不恢复凭据登录的前提下扩展为只读报表采集。

## 决策

- `douyin-ecommerce` 的账号密码登录和旧 browser-agent 任务继续保持 `retired`，凭据不恢复。
- 新能力仅使用公司 Chrome 中员工已建立的登录态，生命周期标记为 `integrating`，真实生产验收前不得标记 `connected`。
- `product_daily`、`live_daily`、`video_daily` 以官方 XLSX/CSV 下载为准；`store_daily` 无下载时可读取代码登记的固定原子指标。
- 文件导入保留为人工兜底，不与 Chrome 自动采集互斥。
- 登录、验证码、滑块、扫码或设备验证进入 `waiting_human`，系统不自动绕过。
- 不保存凭据、Cookie、Token、完整页面、截图、网络响应或客户个人信息，不调用内部未公开 API。
- 巨量千川维持独立的广告平台集成状态，不混入抖店自然经营事实。

## 结果

需要新增 Douyin provider adapter、文件解析器、标准事实 writer、store-scoped 控制面和真实 readiness。插件权限仅增加固定抖店/罗盘来源，不增加 Cookie、WebRequest、Debugger 或 Native Messaging。Kuaimai 保持原流程和兼容性。

## 回滚

停用 Douyin adapter 和日计划即可停止新采集；已完成事实、同步记录和原始归档保留。回滚不得恢复旧凭据、账号密码输入或自动登录任务。
