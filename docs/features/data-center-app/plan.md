# 数据中心 App 实施计划

## 目标

交付第三个可运行的业务 App，在不复制销售事实的前提下完成 D1 元数据、销售查询、权限、八个工作区和完整页面状态。

## 架构方案

领域规则位于 `src/domain/dataCenter.js`；Provider 和客户端位于 `src/state`；页面组合位于 `src/features/data-center`；认证后的 Cloudflare Functions 负责元数据和销售查询。销售继续由 `product_sales_daily` 提供，数据中心只增加稳定查询契约和元数据记录。

共享能力结论：扩展现有 App 注册、权限、认证、D1 和销售能力；数据中心页面组合局部保留，不新增推测性通用 UI。

## 文件职责

- `src/domain/dataCenter.js`：日期、平台过滤、标准化、摘要和审计。
- `src/state/dataCenterApi.js`、`DataCenterProvider.jsx`：API 编排、缓存和本地降级。
- `functions/api/data-center*`：元数据持久化和只读销售查询。
- `src/features/data-center/*`：八个工作区。
- `src/App.jsx`、`main.jsx`、`permissions.js`、`strategyExecution.js`：第三 App 装配。
- `styles.css`：沿用现有 Token 的数据中心布局和响应式规则。
- `react-tests/data-center.test.mjs`、`tests/data-center-api.test.mjs`：领域、UI、契约和权限测试。

## 接口与契约

- `useDataCenter()` 返回元数据状态、销售响应、范围、加载/刷新/错误、dispatch 和刷新方法。
- `GET /api/data-center` 返回标准元数据状态。
- `POST /api/data-center` 仅允许总经办或授权运营写入安全字段。
- `GET /api/data-center/sales?from&to` 返回行、范围、`create_time`、`Asia/Shanghai`、最后同步和数据日期、覆盖率、指标版本及警告。
- 本地销售 API 返回 501 后，由 Provider 使用现有 IndexedDB 销售仓库构造同形响应。

## 数据迁移

- 新增 `data_sources`、`data_runners`、`data_sync_runs`、`data_source_files`、`data_dimension_mappings`、`data_metric_definitions`、`data_quality_issues`、`data_app_subscriptions`、`data_audit_logs` 和 `data_center_meta`。
- 不迁移或复制 `product_sales_daily`。
- 默认指标和消费订阅由状态归一化补齐，旧部署无元数据时可安全启动。
- 元数据按实体记录存储，容量增长与销售事实分离。
- D1 元数据批量写入每批最多 50 条；运行记录、质量问题和审计记录按集合上限归一化，避免单次元数据保存无限增长。
- 本实现没有读取线上 D1 配额或当前占用量；上线前仍需在 Cloudflare 环境单独确认容量和绑定状态。

## 风险与回滚

- App 壳整合冲突：已在隔离分支合入供应链基线并用完整测试确认。
- 销售口径漂移：接口和领域测试固定创建时间、上海时区和其它排除规则。
- D1 不可用：生产返回 501，本地使用明确降级，不修改事实。
- 权限泄漏：服务端按部门/readonly 二次校验。
- 回滚时移除导航和 Provider；新增表保留但停止读取，销售数据不受影响。

## 验证命令

```bash
node --test react-tests/data-center.test.mjs
node --test tests/data-center-api.test.mjs
npm run lint
npm run check:governance
npm run check:integrations
npm test
npm run build
```

页面验收使用本地 Vite 服务，检查键盘、焦点、空/错/禁用/过期、1440/1280/900/640/390px 和钉钉 WebView。

## 任务顺序

1. 领域契约和测试。
2. D1 元数据与销售查询 API。
3. Provider 和本地降级。
4. 第三 App 注册、权限和主导航。
5. 总览与分析。
6. 数据治理工作区。
7. 本地服务一致性。
8. 视觉、响应式和 Definition of Done。
