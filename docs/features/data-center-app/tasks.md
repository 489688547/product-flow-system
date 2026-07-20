# 数据中心 App 执行任务

> 以下记录一期交付，以及 2026-07-19 确认的连接器目录、加密凭证保险箱和后续本地采集器扩展任务。

## 2026-07-20 同步记录与数据质量合并

- [x] 先更新数据中心导航契约测试：左侧不再出现 `data-quality`，旧链接仍映射到 `sync`。
- [x] 将质量摘要、执行记录、待处理质量问题按单列顺序合并进“同步记录”，删除独立质量页面组合和重复标题。
- [x] 保留 `syncRuns`、`qualityIssues`、权限、协同按钮与刷新行为，不修改 API、D1 或外部平台。
- [x] 验证键盘焦点、空状态、表格横向滚动和 1440/900/640/390px 布局，并执行完整 Definition of Done。
- [ ] 钉钉 WebView 实机验收；本次未部署，不能用本地 390px 浏览器结果替代。

定向验证：`node --test react-tests/data-center-app.test.mjs react-tests/data-center.test.mjs`，14/14 通过。完整 Lint、治理、集成、环境能力、测试和构建通过；API 397/397、货流投影 2/2，生产分块均小于 500 KB。实页在四个宽度均无页面级横向溢出，390px 两张表分别在 760px 和 680px 最小宽度内横向滚动；旧 `#/data-quality` 显示“同步记录”。本地远程 D1 曾返回一次网络连接丢失，页面保留错误态与内容结构，未把该结果视为生产数据正常。

## 2026-07-20 数据口径治理与计算

- [x] 按 [`data-standards-plan.md`](./data-standards-plan.md) 实现首批 11 项口径、版本化 CRUD、责任部门权限、安全公式 AST、预览、计算批次、历史重算和结果读取。
- [x] 数据总览的净销售额、销量、毛利、退款率、毛利率完成旧算法对账后，只读取共享口径结果；缺失或不完整时展示原因，不回退硬编码值。
- [x] 六项货流口径先完成发布与治理；事实未覆盖前返回“数据未覆盖”，不生成模拟值。
- [x] 完成 D1 兼容迁移、环境能力与集成注册表反写、API 契约、完整 Definition of Done、响应式和钉钉 WebView 分栏验收。

## 2026-07-20 连接器配置简化

- [x] 店铺/账户身份与接入方式自动判断
  - 输出：八个平台专属名称标签；移除经营连接器弹窗中的公司主体、负责人和手工接入方式；API、网页登录、文件导出按凭据自动推断。
  - 安全：创建人和更新人继续由认证会话写入，客户端伪造审计身份会被拒绝；无 D1 迁移、环境变量或生产写入。
  - 验证：领域、前端状态、连接器弹窗和连接器 API 定向测试通过；完整 Definition of Done 与浏览器检查见本次交付记录。
  - 提交：`4d11245 feat(data-center): infer connector method`、`0b4222f feat(data-center): infer access on save`、`e9696d6 feat(data-center): simplify connector dialog`。

## 2026-07-19 连接器与加密保险箱扩展

- [x] 连接器领域定义
  - 输出：八个经营连接器、五类内部系统、平台专属字段 schema、状态优先级和安全配置校验。
  - 验证：`node --test react-tests/data-center-connectors.test.mjs`，8/8 通过。
  - 提交：`26b6b83 feat(data): define connector schemas`。
- [x] 加密与 D1 存储
  - 输出：AES-256-GCM、版本化密钥、凭证/权限/审计/连接实例迁移和环境能力清单。
  - 验证：`node --test tests/credential-vault-crypto.test.mjs tests/credential-vault-storage.test.mjs`，13/13 通过。
  - 提交：`b4cd098 feat(platform): add encrypted credential storage`。
- [x] 凭证保险箱 API
  - 输出：脱敏列表、创建、替换、归档、15 分钟内总经办 reveal 和稳定错误码。
  - 验证：`node --test tests/credential-vault-api.test.mjs`，15/15 通过。
  - 提交：`321a630 feat(platform): expose credential vault API`。
- [x] 连接实例 API
  - 输出：经营连接器和内部保险箱的非敏感实例，保存后保持 `pending_validation`。
  - 验证：`node --test tests/data-center-connectors-api.test.mjs`，12/12 通过。
  - 提交：`57924cf feat(data): persist connector instances`。
- [x] 前端状态编排
  - 输出：连接器、凭据元数据和内部保险箱的统一客户端与 Provider 状态，不在浏览器持久化密文。
  - 验证：`node --test react-tests/data-center-connections-api.test.mjs`，8/8 通过。
  - 提交：`3eadcb6 feat(data): orchestrate connector settings`。
- [x] 数据接入界面
  - 输出：Logo 目录、经营/保险箱分区、平台专属弹窗、已有密文替换交互和完整页面状态。
  - 验证：`node --test react-tests/data-center-connections-ui.test.mjs react-tests/data-center-app.test.mjs`，12/12 通过；1440px 与 390px 本地浏览器无页面横向溢出，弹窗键盘关闭正常。
  - 提交：`8f85d83 feat(data): add connector and vault workspace`。
- [x] 阶段 1 交付验证
  - 输出：文档、API 目录、环境清单、迁移、测试、构建与响应式检查一致。
  - 验证：`npm run lint`、`npm run check:governance`、`npm run check:integrations`、`npm run check:environment-capabilities`、`npm test`（React 422/422、API 195/195）和 `npm run build` 全部通过；生产 JavaScript 分块均小于 500 KB。
  - 实页检查：1440px 与 390px 本地预览无页面横向溢出；平台弹窗、Esc 关闭、中文业务标签、经营/保险箱切换和接口失败态正常。Vite 本地预览未挂载 Cloudflare Functions，因此未把本地接口失败误报为生产接通。
  - 未执行：Cloudflare 部署、D1 生产迁移、Secret 写入、真实凭证导入、真实平台登录和钉钉 WebView 验收；这些操作需要单独授权并属于后续生产发布窗口。

## 后续阶段

- [x] 公司 Mac 采集器、机器身份和短时 task grant 协议；生产机器已注册并用 bearer 身份成功领取任务。
- [x] 每日 `07:30` 调度已安装到公司 Mac，首次运行成功且无待领取任务。
- [x] 公司 Mac agent 已改为常驻，每 30 秒领取任务；保存连接后不必等待次日调度。
- [ ] 人工验证恢复与最近日期重拉。
- [ ] 按月历史回填、幂等覆盖和数据质量闸门。
- [ ] 钉钉账密表 `总表` 的授权预览与一次性加密迁移。
- [ ] 抖音、巨量、快手、淘系、拼多多、小红书、京东/京麦和快麦逐一真实验证；只有具备成功证据后从 `planned` 改为已接通。

## 执行规则

- 每项任务只交付一个可独立验证的结果。
- 先写失败测试并确认失败原因，再写实现。
- 完成后记录实际验证命令和结果。
- 每次提交只包含当前任务文件。

## 任务

- [x] 领域模型
  - 依赖：供应链与治理基线已合并。
  - 文件：`src/domain/dataCenter.js`、`react-tests/data-center.test.mjs`。
  - 输入：现有销售行结构和共享数据定义。
  - 输出：日期、平台过滤、标准化、摘要、质量和 reducer。
  - 失败测试：`node --test react-tests/data-center.test.mjs`，预期模块不存在。
  - 实现步骤：日期规则、平台排除、安全字段、默认状态、摘要、审计。
  - 验证：`node --test react-tests/data-center.test.mjs`，6/6 通过。
  - 提交：`feat(data): add data center domain`。

- [x] D1 与 API
  - 依赖：领域模型。
  - 文件：`functions/api/data-center*`、`functions/api/sales.js`、`tests/data-center-api.test.mjs`、`package.json`。
  - 输入：安全元数据状态和 `product_sales_daily`。
  - 输出：认证后的元数据 GET/POST 与销售 GET。
  - 失败测试：`node --test tests/data-center-api.test.mjs`，预期路由不存在。
  - 实现步骤：表、读写、权限、日期校验、其它过滤、响应元数据。
  - 验证：`node --test tests/data-center-api.test.mjs tests/supply-chain-api.test.mjs react-tests/sales-data.test.mjs`，21/21 通过。
  - 提交：`feat(data): add data center APIs`。

- [x] Provider
  - 依赖：D1 与 API。
  - 文件：`src/state/dataCenterApi.js`、`src/state/DataCenterProvider.jsx`、领域测试。
  - 输入：元数据 API、销售 API、现有浏览器销售仓库。
  - 输出：`useDataCenter()`。
  - 失败测试：Provider 源码契约测试预期文件不存在。
  - 实现步骤：并行读取、缓存、debounce 保存、本地销售降级。
  - 验证：`node --test react-tests/data-center-provider.test.mjs react-tests/data-center.test.mjs`，10/10 通过。
  - 提交：`feat(data): add data center provider`。

- [x] 第三 App 装配
  - 依赖：Provider。
  - 文件：`src/App.jsx`、`main.jsx`、权限、App 注册和最小页面。
  - 输入：现有 Supply Chain 导航模式。
  - 输出：产品全周期之后的七个数据中心入口，不包含独立数据分析页。
  - 失败测试：导航、顺序、权限和注册断言失败。
  - 实现步骤：权限、注册、懒加载、路由映射、Provider 挂载。
  - 验证：数据中心与供应链 21/21 通过，`npm run build` 通过。
  - 提交：`feat(data): register data center app`。

- [x] 数据总览
  - 依赖：第三 App 装配。
  - 文件：`DataCenterAppPage.jsx`、`DataOverview.jsx`。
  - 输入：Provider 销售响应。
  - 输出：老板经营总览；不提供独立数据分析入口或全量明细表。
  - 失败测试：指标、口径、状态文案和无分析入口断言失败。
  - 实现步骤：摘要、趋势、贡献、异常。
  - 验证：数据中心 App 与领域测试 11/11 通过，生产构建通过。
  - 提交：`feat(data): add sales overview and analysis`。

- [x] 数据治理工作区
  - 依赖：数据总览。
  - 文件：六个数据治理 Workspace 和 App 页面映射。
  - 输入：标准元数据状态。
  - 输出：接入、指标、质量、记录、服务和设置页面。
  - 失败测试：安全字段、状态、指标和设置文案断言失败。
  - 实现步骤：安全表单、列表、权限、空错禁用状态。
  - 验证：数据中心 App/Provider 10/10 通过，生产构建通过。
  - 提交：`feat(data): add data governance workspaces`。

- [x] 本地服务一致性
  - 依赖：Provider。
  - 文件：`server.mjs`、`tests/local-data-center-server.test.mjs`、`package.json`。
  - 输入：本机 JSON 与浏览器 IndexedDB 降级边界。
  - 输出：本地元数据路由和明确销售 501。
  - 失败测试：本地路由源码断言失败。
  - 实现步骤：JSON 读写、路由、501 响应。
  - 验证：数据中心 API、本地数据中心与供应链 7/7 通过。
  - 提交：`feat(data): add local data center routes`。

- [x] 视觉与交付
  - 依赖：全部功能任务。
  - 文件：`src/styles.css`、数据中心测试、耐久文档。
  - 输入：现有设计 Token 和页面 class。
  - 输出：响应式、无障碍、完整验证记录。
  - 失败测试：结构 CSS 断言失败。
  - 实现步骤：桌面、900、640、390px、减少动效、表格和焦点。
  - 验证：Definition of Done 五项命令通过；本地浏览器桌面与 390px 通过，无横向溢出、无新控制台错误，视觉规则扫描 0 命中。Cloudflare 和钉钉 WebView 未部署验收。
  - 提交：`style(data): finish responsive data center UI`。

## 数据口径治理交付（2026-07-20）

- [x] 11 项公司级数据口径、受控公式 AST、部门权限、版本、归档、审计、预览、重算批次和结果 API 已实现；销售 5 项可计算，货流 6 项在事实源缺失时返回 `DATA_NOT_COVERED`，不制造模拟数据。
- [x] 数据总览五项 KPI 已切换为读取共享口径结果，趋势和平台贡献明确标注为销售事实视图；缺失、失败、覆盖率、版本和截止时间均显式展示。
- [x] 兼容边界已完成：旧 `metricDefinitions` 不能覆盖共享定义；本地缺少 D1 时共享 API 返回结构化 501；构建期开关默认关闭且回滚不删除历史。
- [x] 截图中的“加密主密钥不可用”已定位并修复：凭证保险箱优先复用线上已有 `PLATFORM_CREDENTIAL_MASTER_KEY`，同时保留旧变量名兼容，不轮换或暴露现有密钥。
- [x] 定向测试 81/81 通过；项目门禁通过：Lint、治理、集成注册表、环境能力、完整测试 241/241、生产构建和 500 KB 分块限制。
- [x] 本地 UI 在 1440、900、640、390px 均无页面横向溢出；新增口径弹窗首焦点、Esc 关闭和焦点回归通过；数据总览的五项缺失态与读取失败态明确；控制台无新增 warning/error。
- [x] 文本检查：生产 UI 不再包含“指标管理”或旧 `MetricDefinitionsWorkspace`；`placeholder` 命中均为真实表单属性、测试名称或 SQL 参数名，不是占位实现。
- [x] Cloudflare Pages 已发布至 `0651f8ca.product-flow-system.pages.dev`，正式域名已返回本次 `index-D9YC06K4.js` / `index-8kv0LHtc.css`；匿名口径接口返回预期 401，登录态显示“线上数据库”。
- [x] Production D1 只读核验：11 个定义、11 个版本，库大小约 7.27 MB；已生成 2026-07-01 至 2026-07-19 的 5 项当前结果，因销售事实尚未补入 7 月而诚实保存为 `DATA_NOT_COVERED` / 覆盖率 0%。现有销售事实仅覆盖 2026-06-01 至 2026-06-30，共 16,501 行。
- [x] 线上抖音连接弹窗不再显示“加密主密钥不可用”；当前凭证表仍为 0 条，因此未替用户重填或传输截图中的密码。
- [x] `verify:production` 已通过 Cloudflare Pages、Production D1、抖音、钉钉和浏览器采集器能力检查；匿名新接口按预期返回 401。
- [x] 钉钉 WebView 已打开生产应用，数据中心导航和数据接入页面均正常；没有恢复数据分析入口。
- [ ] 旧凭证迁移、抖音真实登录与店铺身份识别仍需近期重新认证及可能出现的人工验证码，不用浏览器或本地结果冒充完成。

实际提交：`07c4657`、`ff3ec7d`、`8839745`、`bdb4502`、`d7fdde3`、`a5a9510`、`a5fd8e8`、`6d2e514`、`8ee15a4`。

## 通用数据连接与抖音身份识别（2026-07-20）

- [x] 复用现有数据中心凭据保险箱，完成通用 provider/credential/task/resource/result-writer 协议和抖音 `connection_identity` 首个 adapter。
- [x] 失败测试覆盖通用账户与保险箱引用、一次性 grant、敏感结果拒绝、固定域名、人工验证和店铺 ID 去重。
- [x] 抖音弹窗收敛为邮箱、密码，识别结果列表只展示店铺头像、名称和业务状态；其他 ERP/平台连接器目录继续保留。
- [x] 全量门禁、真实公司 Mac 采集器、Production D1 迁移与线上 Pages 验收完成。
- [x] 钉钉 WebView 已完成生产验收。
- [ ] 抖音真实登录/人工验证验收完成后勾选。
