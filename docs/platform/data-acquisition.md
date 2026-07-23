# 通用数据采集平台

## 用途

数据中心通过统一 provider registry、连接保险箱、文件导入、受控任务和结果 writer 获取外部系统数据。业务 App 只读取标准事实表或平台 API，不能直接登录抖音、ERP、广告平台或 NAS。

2026-07-21 起，抖音等店铺网页登录采集已退役：动态协议、验证码、滑块和设备验证使其不适合作为稳定无人值守能力。店铺经营改用平台原始文件；通用 provider 边界继续服务于已经验证的 ERP、广告和内部数据接入，不能因旧抖音实现而推断其他平台已接通。

## 分层

1. provider registry 声明固定域名、凭据结构、任务类型、资源类型和结构版本；未登记内容默认拒绝。
2. `data_connections` 保存通用账户标识、凭据结构 ID 和共享保险箱条目引用；AES-GCM 密文只保存在现有 `credential_vault_entries`，不创建第二套凭据存储，也不把邮箱、API Key 等字段固化为数据库列。
3. `browser_agent_tasks` 使用 `platformId + taskType + resourceType + schemaVersion + cursor` 描述采集，不保存明文凭据。
4. 公司 Mac 按设备 scope 领取任务，再使用一次性五分钟 grant 获取该任务的当前凭据。
5. provider adapter 只负责固定允许域名内的登录/API/文件操作和原始结果标准化。
6. provider/resource writer 白名单把结果写入对应标准表；身份写入店铺表，订单、商品、库存和广告数据分别写入自己的事实表，禁止万能 JSON 明细仓库。

## 连接与凭据

- `account_label` 是可展示的通用账户标识；抖音映射为登录邮箱，ERP 可映射为账套或账号名称。
- `credential_schema_id` 指向 provider registry 中的版本化结构；抖音首期为 `email-password-v1`。
- secret fields 作为一个加密 JSON 写入数据中心共享凭据保险箱，并通过 `credential_entry_id` 与采集连接关联。
- 普通列表不返回 secrets；受控 reveal 和 task credential 都使用 `no-store`，且必须服务端授权。
- 验证码、Cookie、Token、完整 HTML、截图和原始平台响应不得作为任务结果保存。

## 扩展一个 provider

新增 provider 必须同时完成：集成注册、环境能力、凭据 schema、允许域名、任务/资源 schema、adapter、result writer、认证与失败测试、迁移容量评估、回滚说明和生产独立验收。仅登记 adapter 不代表平台已接通；没有真实结构验证时状态保持 `integrating`。

ERP adapter 可以选择服务端 API、浏览器页面、文件导出或 NAS 文件读取，但对调度器统一表现为任务。游标、时间范围、幂等键和结构版本属于任务契约，业务口径属于目标事实表契约。

## 运行与恢复

- 已验证的 ERP 网页导出使用仓库内 MV3 插件复用公司日常 Chrome 登录态；首期通过“加载已解压的扩展程序”安装，不依赖 Chrome 应用商店。插件只申请 alarms、storage、tabs、downloads 和登记平台 host 权限，不申请 Cookie、History、WebRequest、Debugger 或 Native Messaging。
- 本机执行器只监听 `127.0.0.1`，请求带 `Origin` 时必须匹配固定扩展 ID；Chrome MV3 Service Worker 未发送 `Origin` 时仍必须通过随机配对密钥，缺少或错误密钥一律拒绝。runner token 和配对密钥分别存在 macOS Keychain。插件只接收 provider/resource/businessDate/jobId，不接收远程 URL、选择器、脚本或凭据。
- 05:00 日计划由本机执行器生成并通过控制面幂等登记；扩展触发官方导出，解析、脱敏、原始文件本机归档和 D1 ingest 仍由本机执行器完成。只有完整 ingest 成功才能推进游标。

- 旧店铺浏览器 agent 已停用，不再创建或领取店铺登录任务。后续若有具备稳定接口和明确授权的新 provider，必须重新完成集成评审和生产验证。
- 浏览器 provider 必须按页面条件等待可操作状态；平台专属的登录方式切换、字段选择器和人工验证文案留在 adapter 内。对有动态风控的平台，adapter 只预填凭证，不代替用户点击登录、接受协议或提交验证码；再次验证优先复用同一登录页，同一固定浏览器 Profile 在人工登录后复用会话。普通手机登录方式中的“发送验证码”等说明不得直接当成已出现人工挑战，邮箱验证码、滑块、扫码和设备确认则必须保持人工等待状态。
- 公司 Mac 离线：任务留在队列，不丢失连接。
- 五分钟 claim 到期：其他同 scope agent 可重新领取。
- 一次性 grant 已消费或凭据版本变化：拒绝并重新领取任务。
- 人工验证：状态改为 `waiting_human_verification`，不保存验证码。
- 页面结构变化：adapter 返回稳定错误，保留最后成功事实。
- 回滚：停止创建和领取新任务，页面切回只读；保留连接、密文、事实和审计。

## 当前范围

店铺网页登录 provider 已退役；六个店铺平台当前只登记文件样例等待状态。文件上传、字段识别和标准化解析尚未在没有真实样例时实现。ERP、广告、钉钉和 NAS 是否可用仍以各自注册表与生产证据为准。
