# 供应链管理重做实施计划

## 目标

在现有供应链 App 内交付 8 个任务闭环工作区，逐项实现采购与质量 13 个场景，并统一消费数据中心共享事实。

## 架构方案

采用“供应链业务层 + 数据中心事实层”：

```text
供应链页面
  → 供应链领域规则与消费客户端
  → /api/platform/v1/product-catalog
  → /api/platform/v1/goods-flow/*
  → /api/platform/v1/data-services/*
  → /api/platform/v1/data-tasks
```

供应链 feature 不直接调用快麦、钉钉、抖音或 D1。`DEV-000005` 交付共享读取契约，`DEV-000006` 交付 `/api/platform/v1/supply-chain-workflows` 版本化命令契约；本计划只在 `DEV-000004` 的认领范围内实现 UI、纯领域规则、消费适配器和消费测试，不在 feature 内复建事实表、整状态存储或第二套工作流。

## 文件职责

- `docs/features/supply-chain-rebuild/prd.md`：完整需求、角色、规则和验收。
- `docs/features/supply-chain-rebuild/design.md`：8 个工作区、交互和状态。
- `docs/features/supply-chain-rebuild/plan.md`：架构、依赖与实施顺序。
- `docs/features/supply-chain-rebuild/tasks.md`：13 个场景到任务和测试的追踪。
- `docs/product/supply-chain.md`：长期产品定位与稳定规则。
- `DESIGN.md`：更新全局供应链导航、货流动效和表格控件规则。
- `src/App.jsx`：将供应链左侧导航迁移为 8 个工作区并兼容旧路由。
- `src/domain/supplyChainWorkflow.js`：纯角色范围、任务优先级、货流节点、建议和质量状态规则。
- `src/domain/supplyChain.js`：兼容已有汇总，逐步委托给新领域规则。
- `src/state/supplyChainDataApi.js`：共享商品、库存、销售、采购、质量和任务的只读消费客户端。
- `src/state/webCollectionApi.js`：调用已登记的快麦库存当前快照任务并把任务阶段转换为供应链可读状态；不包含页面地址、选择器或 D1 写入逻辑。
- `src/state/supplyChainApi.js`：兼容旧供应链业务状态，不新增整状态写入。
- `src/features/supply-chain/SupplyChainAppPage.jsx`：工作区装配和权限范围。
- `src/features/supply-chain/` 新工作区组件：按业务职责拆分，避免继续扩大 App 页面。
- `src/styles.css`：供应链布局、时间线、状态和响应式样式。
- `react-tests/supply-chain*.test.mjs`：领域、消费契约和页面结构。
- `react-tests/sidebar-navigation.test.mjs`：导航顺序与旧路由兼容。

## 接口与契约

### 已有并直接消费

- `GET /api/platform/v1/product-catalog`
- `GET /api/platform/v1/goods-flow/dashboard`
- `GET /api/platform/v1/goods-flow/inventory`
- `GET /api/platform/v1/data-services/sales`
- `GET /api/platform/v1/web-collection/jobs`

### `DEV-000005` 增补

- `GET /api/platform/v1/goods-flow/inventory?mode=current|history&asOf&skuId&warehouseId&cursor`
- `GET /api/platform/v1/data-services/sales/daily?from&to&productId&inventoryUnitId&platform&cursor`
- `GET /api/platform/v1/goods-flow/suppliers`
- `GET /api/platform/v1/goods-flow/purchases`
- `GET /api/platform/v1/goods-flow/payments`
- `GET /api/platform/v1/goods-flow/quality-incidents`
- `GET /api/platform/v1/goods-flow/aftersales`
- `GET /api/platform/v1/data-tasks`

### `DEV-000006` 增补

- 命名空间：`/api/platform/v1/supply-chain-workflows`
- 能力：责任与采购规则、采购建议、计划/批次/里程碑、采购付款关联、供应商业务档案、BOM/规则版本、质量标准/质检/问题闭环、清仓和运费核对。
- 写入约束：`Idempotency-Key`、`expectedVersion`、服务端授权与审计；外部钉钉/ERP 动作只能由服务端适配器执行。
- 当前状态：`ready/planned`。交付前供应链页面只展示来源事实、未知状态和禁用动作，不调用模拟接口、不在浏览器保存业务命令。

### 消费客户端

`loadSupplyChainWorkspaceData({ workspace, filters, signal })` 返回：

```js
{
  data: {},
  quality: {
    status: "trusted" | "partial" | "stale" | "unavailable",
    lastSuccessfulSyncAt: null,
    coverage: null,
    confidence: null,
    missing: []
  },
  errors: []
}
```

未实现契约返回安全缺口状态，不用空数组冒充业务为空。

### 领域函数

- `buildRoleWorkbench({ actor, assignments, facts, workflows, now })`
- `buildGoodsFlowProgress({ purchase, payments, milestones, quality, receipt })`
- `calculateProcurementSuggestion({ inventory, demand, leadTimes, promotions, moq, capacity })`
- `calculateBundleRequirements({ plans, bom })`
- `calculateBundleCost({ bom, skuCosts, lossRate })`
- `classifyStockRisk({ daysOfSupply, longestLeadTime, clearanceThreshold })`
- `buildQualityClosure({ incident, actions, verification })`

所有函数无 React、浏览器全局或网络请求。

## 数据迁移

- 现有 `/api/supply-chain` 状态只读兼容，旧采购、付款、供应商、质量记录通过稳定来源 ID 映射到新视图。
- 新页面不执行 legacy whole-state 覆盖写。
- 共享事实的 D1 迁移由 `DEV-000005` 负责，并声明展示数据库策略。
- `DEV-000006` 交付前，涉及写入的新功能保持明确禁用或使用已有已验证动作，不保存到浏览器假数据；交付后由消费客户端适配版本冲突、幂等重放、外部动作失败和协同恢复事项。
- 历史节点缺证据时显示“历史状态未知”，不根据当前状态反推。

## 风险与回滚

- 共享 API 延迟：工作区显示缺口并继续使用已验证旧页面；不复制临时事实表。
- 旧路由书签失效：保留旧 screen 到新 section 映射。
- 权限扩大：服务端契约未就绪的写动作保持禁用；消费层不自行推断授权。
- 大表性能：服务端游标与筛选；客户端只渲染当前页。
- 动效干扰：减少动效时禁用；状态始终有文本。
- 回滚：恢复旧 App 装配和导航，保留新领域规则与文档；不删除业务数据。

## 验证命令

每个任务先运行聚焦测试，再运行：

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

UI 额外验证：

- `npm start` 读取线上真实数据，仅进行真实授权操作。
- 测试写入使用 `npm run seed:sandbox` 与 `npm run start:sandbox`。
- 1440px、1180px、390px。
- 键盘、焦点、减少动效、加载、空、错误、无权限、部分覆盖和过期状态。
- 钉钉 WebView 动态视口与安全区。

## 任务顺序

1. 文档、导航和领域骨架。
2. 共享事实消费客户端与质量状态。
3. 角色工作台和产品/批次货流进度。
4. 库存预警、采购建议和责任分工。
5. 采购申请、付款关联、生产在途和收货。
6. 供应商、报价、成本与依赖风险。
7. 库存盘点、BOM、清仓和运费核对；供应链库存页只消费 `kuaimai / inventory / current_snapshot` 的共享任务契约，Chrome 页面适配、公司 Mac 解析和 D1 投影由数据中心采集能力交付。
8. 质量标准、质检、问题闭环和供应商质量评价。
9. 应收应付、数据规则和完整跨模块验收。

每项在 `tasks.md` 记录 RED、GREEN、验证和提交证据。共享 API 未就绪时先完成契约测试与页面缺口状态；待 `DEV-000005` 和 `DEV-000006` 对应阶段合入后，再分别完成只读事实与版本化命令的真实验收。
