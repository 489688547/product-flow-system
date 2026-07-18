# 数据中心 App 执行任务

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

- [ ] 第三 App 装配
  - 依赖：Provider。
  - 文件：`src/App.jsx`、`main.jsx`、权限、App 注册和最小页面。
  - 输入：现有 Supply Chain 导航模式。
  - 输出：产品全周期之后的八个数据中心入口。
  - 失败测试：导航、顺序、权限和注册断言失败。
  - 实现步骤：权限、注册、懒加载、路由映射、Provider 挂载。
  - 验证：数据中心、供应链、平台和公司访问测试通过。
  - 提交：`feat(data): register data center app`。

- [ ] 总览与分析
  - 依赖：第三 App 装配。
  - 文件：`DataCenterAppPage.jsx`、`DataOverview.jsx`、`DataAnalysis.jsx`。
  - 输入：Provider 销售响应和产品 SKU 映射。
  - 输出：老板总览与运营下钻。
  - 失败测试：指标、口径、筛选和状态文案断言失败。
  - 实现步骤：摘要、趋势、贡献、异常、筛选、分组表。
  - 验证：数据中心 UI 和领域测试通过。
  - 提交：`feat(data): add sales overview and analysis`。

- [ ] 数据治理工作区
  - 依赖：总览与分析。
  - 文件：六个数据治理 Workspace 和 App 页面映射。
  - 输入：标准元数据状态。
  - 输出：接入、指标、质量、记录、服务和设置页面。
  - 失败测试：安全字段、状态、指标和设置文案断言失败。
  - 实现步骤：安全表单、列表、权限、空错禁用状态。
  - 验证：数据中心 UI/API 测试通过。
  - 提交：`feat(data): add data governance workspaces`。

- [ ] 本地服务一致性
  - 依赖：Provider。
  - 文件：`server.mjs`、`tests/local-data-center-server.test.mjs`、`package.json`。
  - 输入：本机 JSON 与浏览器 IndexedDB 降级边界。
  - 输出：本地元数据路由和明确销售 501。
  - 失败测试：本地路由源码断言失败。
  - 实现步骤：JSON 读写、路由、501 响应。
  - 验证：数据中心与供应链本地测试通过。
  - 提交：`feat(data): add local data center routes`。

- [ ] 视觉与交付
  - 依赖：全部功能任务。
  - 文件：`src/styles.css`、数据中心测试、耐久文档。
  - 输入：现有设计 Token 和页面 class。
  - 输出：响应式、无障碍、完整验证记录。
  - 失败测试：结构 CSS 断言失败。
  - 实现步骤：桌面、900、640、390px、减少动效、表格和焦点。
  - 验证：Definition of Done 命令与浏览器验收全部通过。
  - 提交：`style(data): finish responsive data center UI`。
