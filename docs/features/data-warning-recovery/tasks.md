# 数据异常处理闭环执行任务

## 执行规则

- 每项任务只交付一个可独立验证的结果。
- 先写失败测试并确认失败原因，再写实现。
- 完成后记录实际验证命令和结果。
- 每次提交只包含当前任务文件。

## 任务

- [x] Chrome 采集恢复状态
  - 依赖：现有 `/api/platform/v1/web-collection/jobs` GET/POST。
  - 文件：`src/domain/dataSyncRecovery.js`、`src/state/webCollectionApi.js`、`functions/api/platform/v1/web-collection/**`、相关测试。
  - 输入：runner/job 安全字段。
  - 输出：稳定恢复文案、只读状态读取、昨天整日缺失或最新日截断时的幂等自动排队，以及人工重排。
  - 失败测试：定向测试应因模块不存在失败。
  - 实现步骤：实现 URL/响应校验，再实现 runner/job 选择和状态映射。
  - 验证：定向测试通过。
  - 提交：领域与客户端文件。

- [x] 异常深链与操作闭环
  - 依赖：Chrome 采集恢复状态。
  - 文件：`src/features/data-center/DataCenterAppPage.jsx`、`src/features/data-center/DataGovernanceWorkspaces.jsx`、`src/App.jsx`、`src/features/settings/SettingsPage.jsx`、`src/features/settings/SalesDataSettings.jsx`、`src/styles.css`、相关 React 测试。
  - 输入：异常日期、Chrome 状态和路由 detail。
  - 输出：`#data-sync/kuaimai-sales`、`#settings/sales-data` 和“我已登录，重新触发”。
  - 失败测试：页面源码测试因仍调用 `requestSalesRepair`、缺少深链与动作失败。
  - 实现步骤：先移除自动 API effect，再增加聚焦、状态卡片和两个入口。
  - 验证：定向 React 测试通过并手动检查焦点。
  - 提交：页面、样式与测试。

- [x] 快麦 API 未打通状态
  - 依赖：无。
  - 文件：`src/domain/dataCenterConnectors.js`、`src/domain/platformConnections.js`、`src/features/data-center/connections/ErpAccessWorkspace.jsx`、`src/features/settings/KuaimaiSyncSettings.jsx`、`src/features/data-center/ProductCatalogWorkspace.jsx`、相关测试。
  - 输入：已确定的通道决策。
  - 输出：Chrome/文件可用，API 未打通且没有前端调用入口。
  - 失败测试：连接器与 UI 测试因仍含 API 字段/调用而失败。
  - 实现步骤：关闭平台定义，移除 API 字段与操作，补明确禁用文案。
  - 验证：定向测试通过。
  - 提交：定义、页面和测试。

- [x] 规则反写与完整验证
  - 依赖：以上任务。
  - 文件：`DESIGN.md`、`docs/platform/integration-registry.json`、`docs/platform/environment-capabilities.json`、`docs/platform/api-catalog.md`、生成文件。
  - 输入：已实现行为。
  - 输出：可执行环境与集成清单一致。
  - 失败测试：平台检查在生成前应发现清单漂移。
  - 实现步骤：更新 durable rules，生成清单，运行 Definition of Done。
  - 验证：隔离发布快照中的 `npm run lint`、`npm run check:governance`、`npm run check:integrations`、`npm run check:environment-capabilities`、`npm test`、`npm run build` 全部通过；生产环境已验证 2026-07-22 整日缺失自动排队、采集器离线、人工重排入口、深链焦点和“数据同步”导航。
  - 提交：文档、生成文件和任务勾选。
