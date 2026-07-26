# 通用数据采集平台

## 用途

数据中心通过统一 provider registry、连接保险箱、文件导入、受控任务和结果 writer 获取外部系统数据。业务 App 只读取标准事实表或平台 API，不能直接登录抖音、ERP、广告平台或 NAS。

旧的“保存账号密码并由通用 agent 代登录”路径已经退役。抖店经营采集默认复用公司日常 Chrome
的已登录状态：MV3 扩展只执行代码登记的页面短动作、官方报表下载和固定白名单指标读取，本机采集
服务承担等待、归档、解析、校验、检查点、重试和受控 API 入库。专用持久 Chrome Profile 仅作为
多账号隔离或扩展故障时的显式回退。该能力在完成真实连续验收前保持 `integrating`，不能据此推断
其他店铺或广告平台已接通。

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

- 已验证的 ERP 网页导出使用仓库内 MV3 插件复用公司日常 Chrome 登录态；首期通过“加载已解压的扩展程序”安装，不依赖 Chrome 应用商店。插件只申请 alarms、storage、tabs、downloads、scripting 和登记平台 host 权限；scripting 仅注入代码包内按 provider 固定登记的 content script，不申请 Cookie、History、WebRequest、Debugger 或 Native Messaging。
- 抖店默认使用公司日常 Chrome 的 MV3 扩展；扩展按最近核对的稳定 `storeId` 领取任务。需要账号隔离
  时可显式启用专用 Chrome 进程，每个已登记店铺对应一个非默认 `user-data-dir`；DevTools 只绑定
  `127.0.0.1` 的随机端口。外网调试地址、远端 URL/脚本/选择器和未登记店铺一律拒绝。
- 默认扩展模式与专用回退模式共用 `web_collection_jobs` 的 claim/lease，不建立第二套队列。
  专用模式启用时，MV3 bridge 不向扩展返回 Douyin 任务，但继续服务 Kuaimai；不能让两个执行器并发
  领取同一店铺任务。LaunchAgent、安装器和 CLI 未显式指定时都使用 `--browser-mode extension`。
- runner 通过 `assigned_stores` 只读取分配给本设备的已启用店铺，响应仅包含 `providerId/storeId/storeName`。本机 Profile 目录、DevTools 端口、Cookie、Token、凭据、页面正文和截图不得返回服务器。
- 官方下载和固定页面读数完成后，本机把可恢复结果原子写入权限为 `0600` 的检查点；服务重启并重新取得同一任务租约后优先恢复检查点，不重复执行页面动作。失败截图只允许来自登记页面，使用本机 AES-256-GCM 加密保存，服务器只接收稳定错误码与诊断编号；诊断文件保留七天后清理。
- 本机执行器只监听 `127.0.0.1`，请求带 `Origin` 时必须匹配固定扩展 ID；Chrome MV3 Service Worker 未发送 `Origin` 时仍必须通过随机配对密钥，缺少或错误密钥一律拒绝。runner token 和配对密钥分别存在 macOS Keychain。插件只接收 provider/resource/businessDate/jobId，不接收远程 URL、选择器、脚本或凭据。
- ERP 采集器令牌由 `/erp-collection/runners` 登记并保存在 macOS Keychain；`/erp-collection/archives`、`/erp-collection/ingest` 和 `/erp-collection/sales-facts` 都属于 handler 自认证路由，API 中间件必须放行 Bearer token 交由各 handler 校验，不能先按员工会话拦截。销售事实路由遗漏放行会表现为文件已归档但 D1 上传 HTTP 401。
- runner 进程心跳与浏览器执行器状态必须分开表达。MV3 使用 `extension_online/offline`；专用浏览器使用 `dedicated_browser_online/offline`。`queued` 只表示等待领取，页面不得把它显示为“正在采集”；只有 `claimed` 及后续阶段才表示已经开始处理。
- 永久 LaunchAgent 不得保存临时 `.worktrees/*` 入口。安装器必须通过 Git common directory 把当前工作树中的采集入口映射回主检出仓库的同一相对路径，再原子写入 plist；临时分支被删除后，服务重启仍须能找到入口。
- 05:00 日计划由本机执行器生成并通过控制面幂等登记；扩展触发官方导出，解析、脱敏、原始文件本机归档和 D1 ingest 仍由本机执行器完成。只有完整 ingest 成功才能推进游标。
- 控制面只自动恢复已登记的瞬时错误：下载、网络或本机处理失败按 5 分钟、15 分钟退避，同一任务最多领取 3 次；重排必须保持 provider、resource、业务日期、目标环境和幂等键不变。登录、验证码与 `schema_changed` 不自动循环；页面适配器修复通过提升 `scheduleVersion` 创建可审计的新任务，旧失败记录不得覆盖或删除。
- `claimed`、`opening`、`collecting`、`exporting`、`downloading`、`validating` 或 `ingesting` 阶段的设备租约过期表示本机执行中断；控制面允许其他轮询重新领取同一任务并增加 attempt，最多 3 次。不能只恢复 `claimed`，否则进程在后续阶段退出会让任务永久显示“同步中”。
- 本机编排器必须同步释放自己内存中的过期活动任务，再向控制面重新领取；只依赖服务端允许重领但继续返回旧的内存任务，会让 attempt 永远不增长并阻塞整个串行队列。结果正在本机校验或入库时不得中途释放，避免并发写入同一批次。
- 当运行中阶段的租约已过期且 attempt 已达 3 次上限时，任务既无法再被采集器重领、又从不落到终态，会成为永久显示“同步中”的僵尸任务。控制面必须在状态读取与领取入口自愈：把这类任务转为 `failed` 并写 `WEB_COLLECTION_STAGE_EXPIRED`（同时追加一条 `web_collection_runs` 失败记录），使其恢复到可由授权人员强制重触发的终态；attempt 未达上限的过期运行中任务仍留给采集器重领，不被自愈抢占。
- 同一 `(provider, 店铺, 资源, 业务日)` 一旦有成功批次，其余未终结的重复任务（含验收触发等以不同 `scheduleVersion` 幂等键创建的任务）必须在完成入库的同一事务内转为终态 `superseded`（释放租约、不再可被领取）。展示与恢复视图必须忽略 `superseded` 任务，且在存在可信成功游标（业务日不早于该运行中任务）时以成功状态为准，不得让陈旧或重复的运行中任务把已成功的资源长期显示为“采集中”。仅业务日更新的运行中任务才继续显示为采集中。
- 每次采集尝试到达 `success`、`failed`、`waiting_human` 或 `schema_changed` 时都必须追加一条 `web_collection_runs` 记录；状态查询以安全字段返回运行记录并由数据同步页关联任务的 provider、resource 和业务日期。重试只重排任务，不能抹掉失败尝试。行数未知时返回 `null`，界面不得补成 0。
- 对快麦这类异步生成文件的 provider，点击官方导出只代表平台已受理。扩展必须进入代码登记的下载中心，在当前任务开始时间窗口内按资源文件名前缀匹配最近一行；“导出完成”后点击该行官方下载，“生成中”继续等待，“失败”与三分钟超时分别返回稳定安全错误码。若官方按钮把标签页导航到代码登记的固定下载域名，扩展必须再次校验固定来源、文件名前缀和扩展名，再通过 Downloads API 以 `saveAs: false` 接管下载，避免保存对话框或内容拦截器中断后台任务。远端任务不得提供下载中心路径、下载域名、选择器或文件名规则。
- Provider adapter 必须覆盖同一官方操作在真实页面出现的已验证弹窗容器变体。快麦销售主题导出当前同时支持普通 `el-dialog` 与确认型 `el-message-box`；商品导出依次处理格式弹窗、字段弹窗和最终确认弹窗，再进入下载中心。所有动作只在当前可见容器内按精确按钮文字执行，不能退化为全页模糊点击。
- 快麦商品刷新是一个三资源当前快照组：`products` 对应“导出普通商品”，`product_kits` 对应“导出套件”，`product_combinations` 对应“导出组合装”。三者各自拥有任务、归档、批次和游标；只有三个 job 全部完成本机归档、D1 ingest 和商品投影，商品页才刷新并宣告成功。子商品身份读取“子商品商家编码”，数量读取“组合比例”，不得从名称或编码格式推断。
- 快麦当前库存使用资源 `inventory`、窗口 `current_snapshot`、schema `v1`，固定从
  `/index.html#/stock/newstatu/` 的官方库存状态页导出。授权人员手动触发与每日 `05:00`
  计划共享同一服务端任务、租约和幂等边界；Chrome 只执行固定页面和官方导出，本机负责等待、
  哈希归档、解析为 `inventory_snapshot`、完整性校验及受控 ingest。
- 库存批次必须同时覆盖仓库、稳定 SKU 和官方数量列；缺失或部分有效时返回
  `ERP_COLLECTION_BATCH_PARTIAL`，不得推进游标或覆盖上一可信快照。快照日期来自批次采集日
  （Asia/Shanghai），行级 ERP 修改时间仅写入 `sourceUpdatedAt`。无真实商品编码时
  `productId=null`，不得用仓库与 SKU 组合伪造商品身份；库存 `0` 必须保留为真实值。
- 网页筛选值的 DOM 显示不等于平台查询状态已接受。快麦每日任务使用代码登记的订单查询路由，把 `Asia/Shanghai` 业务日换算为固定 `startTime/endTime` 并以 `timeType=created` 打开页面；不得依赖远程参数或直接改输入框。页面可操作后及导出前都必须校验“下单时间”和全天范围；任何回退或丢失都必须停止导出并返回稳定错误，禁止以目标业务日名义入库。
- Provider 的默认导出模板不能视为稳定数据契约。快麦订单 adapter 必须在官方导出弹窗内逐项确认代码登记的非个人经营字段，至少包含平台、店铺、仓库、订单状态、数量、金额、成本和下单时间；字段缺失或勾选未生效时停止导出并返回安全结构错误。手机号、地址、邮箱、买家身份和备注不得进入登记字段，文件解析仍须在本机剔除意外出现的个人字段后才能上传。
- ERP 批次的 `partial` 表示允许的原始归档终态（例如部分来源行因映射问题未投影），不是仍在处理；最终分块到达 `partial` 或 `completed` 时原始归档都标记为 `processed`，仅 `pending` 保持 `processing`。数据质量问题通过 issue 记录闭环，不能让已结束归档永久显示“入库中”。但 `sales_items` 批次只有在 `completed` 且完成销售事实投影后，网页采集任务才能显示成功；`partial` 必须进入失败或重试，避免原始文件已收下却被误报为销售已同步。
- 高行数 `sales_items` 在公司 Mac 完成脱敏、校验和 `日期 × 69码 × 平台` 聚合后，通过一次标准事实请求写入 D1；完整明细文件留在本机/NAS 原始归档，D1 记录文件哈希、原始行数、事实行数、日期范围和安全异常，不按 500 行分块复制销售明细。
- 采集任务开始前必须主动探测 provider 标签页的 content script；探测失败时强制刷新，仍失败则只能通过 `scripting.executeScript` 注入代码包内按 provider 固定登记的脚本，不能接收远端脚本名或代码。主动注入仍失败时必须区分 `EXTENSION_SITE_ACCESS_DENIED`（员工需恢复登记域名的网站访问权限）与 `EXTENSION_CONTENT_SCRIPT_UNAVAILABLE`（扩展包或运行时异常），不能笼统显示“采集中”。仅凭 URL、加载状态或同源 SPA 的 hash 变化，不能判定扩展升级或重载后的脚本已经注入。

- 旧的凭据登录 browser agent 已停用，不再创建或领取店铺登录任务。专用 Chrome 不读取数据中心保存的账号密码，也不代替员工提交验证码或破解风控。
- 浏览器 provider 必须按页面条件等待可操作状态；平台专属的登录方式切换、字段选择器和人工验证文案留在 adapter 内。对有动态风控的平台，adapter 只预填凭证，不代替用户点击登录、接受协议或提交验证码；再次验证优先复用同一登录页，同一固定浏览器 Profile 在人工登录后复用会话。普通手机登录方式中的“发送验证码”等说明不得直接当成已出现人工挑战，邮箱验证码、滑块、扫码和设备确认则必须保持人工等待状态。
- 公司 Mac 离线：任务留在队列，不丢失连接。
- 五分钟 claim 到期：其他同 scope agent 可重新领取。
- 一次性 grant 已消费或凭据版本变化：拒绝并重新领取任务。
- 人工验证：状态改为 `waiting_human_verification`，不保存验证码。
- 页面结构变化：adapter 返回稳定错误，保留最后成功事实。
- 回滚：停止创建和领取新任务，页面切回只读；保留连接、密文、事实和审计。

## 当前范围

抖店公司 Chrome 扩展采集已完成本地实现，店铺每日已通过 2026-07-24 真实登录态与 D1 完成批次
验收；商品、直播、短视频仍需完成最新业务日主链路生产复核，因此状态保持 `integrating`。其他店铺
平台仍以文件样例和各自生产证据为准。快麦继续使用现有 MV3 官方导出与本机处理链路；广告、钉钉
和 NAS 是否可用仍以集成注册表与生产证据为准。
