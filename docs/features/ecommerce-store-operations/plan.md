# 电商店铺运营 App 实施计划

## 目标

交付第四个可运行的业务 App，使主管和平台店铺运营能够围绕月度重点产品完成结构化方案、AI 优化、跨部门协同、数据检测、执行复盘和团队管理闭环。

## 架构方案

- `src/domain/ecommerceOperations.js` 保存纯经营规则、状态机、权限范围、版本和摘要，不依赖 React、浏览器或外部接口。
- `src/state` 负责经营 API、数据中心只读查询、缓存、并发版本和 AI 点评编排。
- `src/features/ecommerce-operations` 负责五个页面的业务组合，复用 `src/ui` 基础组件。
- `functions/api/ecommerce-operations*` 在钉钉会话后执行实体级权限、状态流转、D1 持久化和 AI 服务端适配。
- 数据中心继续持有经营事实；本 App 只保存带来源和取得时间的证据快照、方案、执行与复盘。
- 跨 App 协同保存稳定 `targetAppId/entityType/entityId` 引用，不直接写目标 App 数据库；目标部门可在协同页处理状态。

平台能力结论：扩展现有 App 注册、认证、组织、D1、数据中心查询与 App 链接能力；不新增通用工作流引擎。外部电商和广告平台只经数据中心进入本 App。

## 文件职责

- `src/domain/ecommerceOperations.js`：默认状态、实体归一化、完整度、权限、流转、摘要和版本冲突规则。
- `src/state/ecommerceOperationsApi.js`：经营、动作和 AI 点评请求。
- `src/state/EcommerceOperationsProvider.jsx`：按角色/月份加载、数据中心适配、草稿和刷新编排。
- `src/domain/ecommercePerformanceEvidence.js`：把已验收任务、结果和复盘转换为只读绩效证据引用。
- `functions/api/ecommerce-operations.js`：经营实体读取和动作入口。
- `functions/api/ecommerce-operations/_shared/storage.js`：D1 表、记录级存取、审计和版本。
- `functions/api/ecommerce-operations/ai-review.js`：服务端 AI 点评、输入白名单、超时和错误映射。
- `src/features/ecommerce-operations/*`：驾驶舱、重点产品工作台、协同、团队管理和方法库。
- `src/App.jsx`、`src/main.jsx`、权限和 App 注册：第四 App 装配和五个路由。
- `src/styles.css`：现有 Token 下的工作台、问题链、时间线和响应式样式。
- `react-tests/ecommerce-operations*.test.mjs`：领域、导航、UI 和数据适配测试。
- `tests/ecommerce-operations-api.test.mjs`：认证、权限、动作、并发、D1 和 AI 契约测试。
- `docs/product/`、`docs/platform/`、`docs/decisions/`：补充耐久经营流程、API/错误目录和必要架构决策。

## 接口与契约

### 前端

- `useEcommerceOperations()` 返回 `state`、`scope`、`dataStatus`、`loading`、`saving`、`error`、`dispatchAction`、`requestAiReview` 和 `refresh`。
- Provider 通过 `GET /api/data-center/sales?from&to` 获取销售事实；未来投放数据通过数据中心标准数据集扩展，字段缺失保持 `null`。

### API

- `GET /api/ecommerce-operations?month=YYYY-MM`：返回当前用户可见实体、版本、权限和审计摘要。
- `GET /api/ecommerce-operations/evidence?employeeId=&month=`：返回当前会话有权读取的任务、结果和复盘证据，不返回绩效评分字段。
- `POST /api/ecommerce-operations/actions`：接收 `{ type, entityType, entityId, expectedVersion, payload }`，服务端执行白名单、权限、状态机和幂等校验。
- `POST /api/ecommerce-operations/ai-review`：接收 `{ cycleId, planId, planVersion }`，服务端重新读取已授权方案与数据质量，返回并持久化结构化点评。
- AI 返回维度为 `evidence`、`goal`、`issue`、`countermeasure`、`monitor`、`risk`、`dataLimitations` 和 `recommendations`；不返回批准动作。
- 错误响应包含稳定 `error.code`、安全中文说明、`requestId` 和 `retryable`。

## 数据迁移

- 新增 `ecommerce_operation_entities`、`ecommerce_operation_reviews` 和 `ecommerce_operation_audit_logs`，按实体类型、ID 和版本存储。
- 不迁移或复制 `product_sales_daily`、产品全周期、供应链或品牌内容数据。
- 首次上线为空状态；主管手工创建首个月度周期。历史表格导入属于后续独立任务。
- 证据快照只保存方案判断所需指标与来源元数据，不保存订单明细或平台原始响应。
- 记录使用幂等键和乐观版本；失败批次不覆盖已成功版本。
- 回滚时停止读取新表并隐藏 App，数据表保留供恢复。

## 风险与回滚

- 数据中心契约变化：适配器隔离字段差异并用契约测试锁定创建时间、时区、新鲜度和缺失值。
- AI 输出不稳定：结构化 schema、输入白名单、超时、重试上限和人工清单降级；不允许 AI 直接写状态。
- 多人覆盖：动作接口使用 `expectedVersion`，冲突返回 409 并保留本地草稿。
- 权限泄漏：服务端按组织、运营范围、目标部门和实体类型验证；辅导记录单独控制可见性。
- 协同 App 尚未支持：保留请求状态和目标引用，显示未关联，不伪造目标任务。
- 范围过大：一期不做历史批量导入、自动投放操作和通用项目管理；功能开关可单独关闭 App 或 AI。

## 验证命令

```bash
node --test react-tests/ecommerce-operations*.test.mjs
node --test tests/ecommerce-operations-api.test.mjs
npm run lint
npm run check:governance
npm run check:integrations
npm test
npm run build
```

浏览器验证覆盖角色切换、完整闭环、AI 成功/失败、数据正常/过期、协同接受/退回、并发冲突、空/错/禁用/只读，以及 1440/1280/900/640/390px 和钉钉 WebView。

## 任务顺序

1. 领域模型、完整度、状态机和权限范围。
2. D1 实体存储、动作 API、审计和并发控制。
3. 数据中心事实适配和证据快照。
4. AI 点评服务端契约与人工降级。
5. 第四 App 注册、权限、Provider 和五个路由。
6. 驾驶舱与重点产品经营工作台。
7. 跨部门协同、团队管理和经营方法库。
8. 本地服务一致性、响应式、无障碍和 Definition of Done。
9. 绩效证据只读契约和独立绩效 App 联调。
