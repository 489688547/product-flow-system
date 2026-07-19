# 数据中心 App 执行任务

> 以下记录一期交付，以及 2026-07-19 确认的连接器目录、加密凭证保险箱和后续本地采集器扩展任务。

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

- [ ] 公司 Mac 采集器、机器身份和短时 task grant。
- [ ] 每日 `07:30` 调度、人工验证恢复与最近日期重拉。
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
