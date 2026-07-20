# 用户洞察执行任务

## 执行规则

- 每个任务先写失败测试并确认失败原因，再写最小实现。
- 每个完成项记录实际验证结果，不以代码存在代替行为验证。
- 只修改当前功能所需文件，保留工作区内其他用户变更。
- 平台集成、环境、数据库和共享 API 变化同步写回耐久文档与生成清单。

## 任务

- [x] 领域模型
  - 文件：`src/domain/userInsights.js`、`react-tests/user-insights-domain.test.mjs`。
  - 输出：状态标准化、平台可比性、覆盖率、类目确认、规则复制、竞品转换、建议降级。
  - 验证：`node --test react-tests/user-insights-domain.test.mjs`，10/10 通过；覆盖正常、缺失、越界和版本场景。

- [x] D1 迁移与存储
  - 文件：`migrations/0005_user_insights.sql`、`functions/api/platform/v1/user-insights/_shared/*`、迁移/API 测试。
  - 输出：九类新表、索引、哈希令牌、稳定存储和审计。
  - 验证：迁移/API 共 7 项专项测试通过；敏感字段剥离、哈希令牌、幂等和最后成功快照保留均有覆盖。

- [x] 共享 API
  - 文件：`functions/api/platform/v1/user-insights/**`、`tests/user-insights-api.test.mjs`。
  - 输出：查询、类目、规则、竞品、采集器和 ingest 路由。
  - 验证：认证、部门/App/范围授权、只读、版本、幂等、错误和兼容测试通过；本地预览路由 2/2 通过。

- [x] 浏览器采集器
  - 文件：`scripts/user-insights-collector/**`、固定夹具、`tests/user-insights-collector.test.mjs`。
  - 输出：工作日调度、登记任务、平台适配器接口、结构校验、内容哈希和批次上传。
  - 验证：采集器专项测试 5/5 通过；覆盖工作日、登录失效、结构变化、部分字段和幂等上传。

- [x] 客户端与 Provider
  - 文件：`src/state/userInsightsApi.js`、`src/state/UserInsightsProvider.jsx`、Provider 测试。
  - 输出：查询、命令、缓存、筛选状态、刷新和错误映射。
  - 验证：API URL、参数、店铺/产品隔离、失败保留当前数据和无权限状态专项测试通过。

- [x] 导航与用户洞察页面
  - 文件：`src/App.jsx`、`DataCenterAppPage.jsx`、`UserInsightsWorkspace.jsx`、CSS、UI 测试。
  - 输出：`data-insights`、双视角、平台范围、用户/竞品/规则三个 Tab、人工确认和建议证据。
  - 验证：专项 UI 测试 4/4 通过；浏览器实测类目登记与确认、手动重试、规则编辑/发布/版本、人工竞品确认/停用、双视角和三个 Tab；1440、900、390 像素均无横向溢出。

- [x] 平台与环境写回
  - 文件：`docs/platform/integration-registry.json`、`environment-capabilities.json`、平台 API/采集文档、生成模块。
  - 输出：浏览器采集和 D1 能力、路径、API、表、错误、回滚与验收规则。
  - 验证：治理、集成注册表和环境能力检查均通过，生产 readiness 已纳入九张新表。

- [x] 完整验证与交付
  - 文件：测试、任务状态和必要修复。
  - 输出：自动测试、构建、视觉和安全复核结果。
  - 验证：`lint`、治理、集成、环境、全部 740 项测试和生产构建通过；生产部署与真实平台采集需单独授权。
