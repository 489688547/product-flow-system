# 通用数据采集平台

## 用途

数据中心通过统一 provider registry、连接保险箱、采集任务、公司 Mac agent 和结果 writer 获取外部系统数据。业务 App 只读取标准事实表或平台 API，不能直接登录抖音、ERP、广告平台或 NAS。

抖音店铺身份识别是首个 adapter，不是特例框架。后续 ERP 的订单、商品和库存，电商平台的店铺经营，以及广告平台的消耗和素材，都复用同一任务协议。

## 分层

1. provider registry 声明固定域名、凭据结构、任务类型、资源类型和结构版本；未登记内容默认拒绝。
2. `data_connections` 保存通用账户标识、凭据结构 ID 和 AES-GCM 加密 JSON，不把邮箱、API Key 等字段固化为数据库列。
3. `browser_agent_tasks` 使用 `platformId + taskType + resourceType + schemaVersion + cursor` 描述采集，不保存明文凭据。
4. 公司 Mac 按设备 scope 领取任务，再使用一次性五分钟 grant 获取该任务的当前凭据。
5. provider adapter 只负责固定允许域名内的登录/API/文件操作和原始结果标准化。
6. provider/resource writer 白名单把结果写入对应标准表；身份写入店铺表，订单、商品、库存和广告数据分别写入自己的事实表，禁止万能 JSON 明细仓库。

## 连接与凭据

- `account_label` 是可展示的通用账户标识；抖音映射为登录邮箱，ERP 可映射为账套或账号名称。
- `credential_schema_id` 指向 provider registry 中的版本化结构；抖音首期为 `email-password-v1`。
- secret fields 作为一个加密 JSON 保存，并以 `providerId:connectionId` 绑定密文附加数据。
- 普通列表不返回 secrets；受控 reveal 和 task credential 都使用 `no-store`，且必须服务端授权。
- 验证码、Cookie、Token、完整 HTML、截图和原始平台响应不得作为任务结果保存。

## 扩展一个 provider

新增 provider 必须同时完成：集成注册、环境能力、凭据 schema、允许域名、任务/资源 schema、adapter、result writer、认证与失败测试、迁移容量评估、回滚说明和生产独立验收。仅登记 adapter 不代表平台已接通；没有真实结构验证时状态保持 `integrating`。

ERP adapter 可以选择服务端 API、浏览器页面、文件导出或 NAS 文件读取，但对调度器统一表现为任务。游标、时间范围、幂等键和结构版本属于任务契约，业务口径属于目标事实表契约。

## 运行与恢复

- 公司 Mac 离线：任务留在队列，不丢失连接。
- 五分钟 claim 到期：其他同 scope agent 可重新领取。
- 一次性 grant 已消费或凭据版本变化：拒绝并重新领取任务。
- 人工验证：状态改为 `waiting_human_verification`，不保存验证码。
- 页面结构变化：adapter 返回稳定错误，保留最后成功事实。
- 回滚：停止创建和领取新任务，页面切回只读；保留连接、密文、事实和审计。

## 当前范围

已实现并登记 `douyin-ecommerce / douyin_login_verification / connection_identity / v1`。ERP、快手、天猫、巨量、NAS 等只具备可复用扩展边界，本次不宣称已经接通。
