# 数据异常处理闭环实施计划

## 目标

停止前端使用快麦开放平台 API，并把总览异常警告闭环到 Chrome 采集状态和官方文件导入。

## 架构方案

业务页面只通过 `src/state` 调用 Web Collection 控制面；异常恢复文案由纯领域函数根据 runner/job 安全字段计算。总览自动调用受公司会话保护的幂等 `trigger`，同步页的人工确认使用 `force=true` 重排可恢复任务。快麦 API 路由保留兼容但不再被前端调用，平台与连接器定义明确标记未打通。

## 文件职责

- `src/domain/dataSyncRecovery.js`：把 Chrome runner/job 状态转换为用户可理解的恢复状态。
- `src/state/webCollectionApi.js`：读取状态并触发 `/api/platform/v1/web-collection/jobs`。
- `functions/api/platform/v1/web-collection/**`：验证公司身份，幂等创建或人工重排固定快麦任务。
- `src/features/data-center/DataCenterAppPage.jsx`：移除快麦 API 自动补拉，生成异常深链并自动排队 Chrome 任务。
- `src/features/data-center/DataGovernanceWorkspaces.jsx`：读取 Chrome 状态、聚焦异常并展示人工重触发动作。
- `src/features/data-center/connections/ErpAccessWorkspace.jsx`：显示 Chrome/文件通道和 API 未打通。
- `src/domain/dataCenterConnectors.js`、`src/domain/platformConnections.js`：关闭快麦 API 配置入口。
- `src/features/settings/KuaimaiSyncSettings.jsx`：改为静态未打通状态，不再请求 API。
- `src/features/settings/SettingsPage.jsx`、`src/App.jsx`、`src/features/settings/SalesDataSettings.jsx`：支持销售导入深链。
- `src/features/data-center/ProductCatalogWorkspace.jsx`：禁用快麦 API 商品同步入口，保留文件导入。
- `DESIGN.md`、`docs/platform/*`：反写当前通道与状态规则。

## 接口与契约

- `loadWebCollectionStatus(fetchImpl?) -> Promise<{runners,jobs,runs,cursors,notifications}>`
- `triggerKuaimaiSalesCollection({date,force}, fetchImpl?) -> Promise<{created,requeued,job}>`
- `buildKuaimaiSalesRecovery({date,runners,jobs,loading,error,now}) -> {tone,label,title,instruction,runner,job}`
- 路由：`#data-sync/kuaimai-sales` 与 `#settings/sales-data`。

## 数据迁移

无迁移。重用 `web_collection_jobs`；历史平台凭据、API 修复记录和销售事实保留，UI 不再把它们解释为当前可用能力。

## 风险与回滚

- Web Collection 状态接口不可用时仍必须提供文件导入入口。
- 自动触发失败不能遮挡原异常；人工触发失败显示安全错误。
- Chrome `order_items` 采集完成不保证退款、成本销售事实完整，异常仍在时必须保留官方销售报表入口。
- 深链焦点可能在懒加载后过早执行，使用组件 `useEffect` 在内容挂载后定位。
- 回滚前端与文档即可，不改 D1。

## 验证命令

- 定向：`node --test react-tests/data-sync-recovery.test.mjs react-tests/data-center-governed-overview.test.mjs react-tests/data-center-app.test.mjs react-tests/data-center-connectors.test.mjs react-tests/data-center-connections-ui.test.mjs`
- 平台：`npm run generate:platform-manifests && npm run check:integrations && npm run check:environment-capabilities`
- 完整：`npm run lint && npm run check:governance && npm run check:integrations && npm run check:environment-capabilities && npm test && npm run build`
- 页面：键盘、焦点、加载/空/错/禁用、1440 与 390 宽度检查。

## 任务顺序

1. 先写领域状态、API 客户端和服务端触发失败测试，再实现读取、幂等排队与恢复文案。
2. 先写总览深链和取消 API 自动补拉失败测试，再修改页面。
3. 先写快麦 API 未打通的连接器、设置和商品页失败测试，再修改定义和 UI。
4. 更新 durable docs、生成平台清单，运行完整验证。
