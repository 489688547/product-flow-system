# 供应链管理 App 设计

## 目标

在现有经营执行平台中增加一个独立的“供应链管理”业务 App，让供应链、财务、质量管理、产品与总经办围绕同一套产品数据完成供应商管理、采购付款同步、库存资金核算、库存盘点校准和质量问题闭环。

一期以可审计的数据闭环为目标，不替代钉钉审批、快麦 ERP 或店铺后台。钉钉继续负责采购与付款审批，快麦/ERP 继续提供销售成本和库存账面数据，供应链 App 负责归集、关联、计算、异常处理和跨部门查看。

## 已确认的业务口径

1. 供应链管理作为现有“业务 Apps”中的独立 App 嵌入经营执行平台，复用现有登录、组织权限、产品档案、69 码、销售成本和共享数据能力。
2. 钉钉“采购申请”和“付款申请”是两个流程。付款申请使用钉钉已有的关联审批能力指向采购申请，系统以钉钉返回的关联关系为唯一事实，不按名称、供应商或金额猜测关联。
3. 一张采购申请可以关联多张付款申请，包括预付款、进度款和尾款。
4. 只有审批通过的付款申请计入采购实付；撤销、驳回或金额变更后重新计算。
5. 库存资金原始余额为：`采购实付金额 - 按销量消耗的销售成本`。
6. 库存资金同时支持产品和供应商维度。产品维度使用现有 SKU/69 码销售成本；供应商维度使用产品供应商关系中的物料单位成本分摊销售消耗，分摊不完整时明确显示覆盖率和待分摊金额，不生成猜测结果。
7. 库存盘点通过文件导入，按盘点日、仓库和 69 码与 ERP 库存快照核对。确认差异后生成校准调整，不覆盖付款审批、销售成本、盘点原表或 ERP 原始快照。
8. 仪表盘同时展示原始库存资金、校准调整和校准后余额；所有调整必须保留操作人、时间、原因和调整前后数值。
9. 产品差评一期通过文件导入，后期再接各店铺平台评价接口。快麦售后数据可以作为质量辅助信号，但不代替真实评价文本。
10. 质量问题必须能够关联产品、供应商、物料和导入批次，并记录责任判定、公关处理、整改措施和关闭结果。

## 方案选择

### 采用：嵌入式独立业务 App

在当前 React 应用中增加供应链 App 路由和 App 内导航，共享现有认证、产品上下文和基础 UI。供应链业务数据使用独立 D1 表和独立 API，避免继续扩大通用 `product_flow_state` 状态文档。

该方案既保留供应链部门的日常工作台，又能直接复用产品、销售和组织数据。相比完全独立部署，它不重复建设登录、权限和产品同步；相比只在产品档案增加字段，它能承载采购、付款、库存和质量的跨产品流程。

### 不采用：独立部署

独立项目会造成身份、产品、权限、路由和部署链重复，不符合本期目标。

### 不采用：只扩展产品档案

产品档案适合查看单个产品，但无法承载供应商部门日常管理、跨产品付款异常、盘点批次和质量问题队列。

## 信息架构

供应链 App 从“业务 Apps”中心进入。进入后显示独立 App 导航，并保留“返回经营执行平台”入口。

1. **供应链总览**：采购实付、已售成本、库存资金、校准调整、待付款、库存差异、质量风险和同步状态。
2. **供应商管理**：供应商档案、类别、联系人、账期、合作状态、合作产品、累计实付、库存资金和质量表现。
3. **采购与付款**：采购审批、关联付款、付款进度、待映射记录、同步错误和原审批跳转。
4. **产品供应链**：按产品维护包材、里料、原料、加工等供应商关系、物料、有效期和单位成本。
5. **库存盘点**：导入盘点表、读取 ERP 快照、查看差异、确认校准和查询历史批次。
6. **质量管理**：导入差评、聚类质量原因、责任判定、公关处理、整改任务和关闭记录。
7. **同步记录**：钉钉、销售成本、ERP 库存和文件导入的最近同步结果与错误。
8. **设置**：钉钉流程映射、导入字段映射、质量等级和供应商类别。

## 数据模型

### 供应商

`Supplier`

- `id`
- `name`
- `code`
- `categories[]`
- `contactName`
- `contactPhone`
- `paymentTerms`
- `status`: `active | paused | archived`
- `notes`
- `createdAt`
- `updatedAt`

### 产品供应商关系

`ProductSupplierLink`

- `id`
- `productId`: 关联现有 `state.products.id`
- `supplierId`
- `materialCategory`: 包材、里料、原料、加工或配置项
- `materialName`
- `skuCodes[]`
- `unitCost`
- `consumptionPerSale`
- `effectiveFrom`
- `effectiveTo`
- `status`

`unitCost × consumptionPerSale × 净销量` 用于供应商维度的已消耗成本。缺少有效成本或用量时，该部分进入待分摊，不纳入供应商余额。

### 钉钉采购审批

`PurchaseApproval`

- `processInstanceId`: 钉钉实例唯一标识
- `processCode`
- `businessId`
- `title`
- `status`
- `originatorUserId`
- `approvedAt`
- `supplierId`
- `productIds[]`
- `approvedAmount`
- `rawPayload`
- `lastSyncedAt`

`PurchaseLine`

- `id`
- `purchaseProcessInstanceId`
- `productId`
- `supplierId`
- `materialCategory`
- `materialName`
- `skuCode`
- `quantity`
- `unitCost`
- `amount`

### 钉钉付款审批

`PaymentApproval`

- `processInstanceId`
- `processCode`
- `businessId`
- `purchaseProcessInstanceId`: 来自钉钉关联审批组件
- `status`
- `amount`
- `paymentType`: 预付款、进度款、尾款或其他
- `approvedAt`
- `rawPayload`
- `lastSyncedAt`

同一 `purchaseProcessInstanceId` 可以存在多条付款记录。采购实付为全部有效、已通过付款记录的金额之和。

### 库存快照与校准

`InventorySnapshot`

- `id`
- `source`: `stocktake_import | erp`
- `batchId`
- `snapshotDate`
- `warehouseCode`
- `skuCode`
- `productId`
- `quantity`
- `unitCost`
- `amount`
- `rawRow`

`InventoryAdjustment`

- `id`
- `stocktakeBatchId`
- `productId`
- `supplierId`
- `skuCode`
- `beforeAmount`
- `adjustmentAmount`
- `afterAmount`
- `reason`
- `approvedBy`
- `approvedAt`

库存资金展示三项：

- 原始余额：`采购实付 - 已售成本`
- 校准调整：已确认盘点差异形成的调整金额
- 校准后余额：`原始余额 + 校准调整`

实物库存差异为：`实盘数量 - ERP 账面数量`。数量差异和资金差异分别展示。

### 质量问题

`QualityIssue`

- `id`
- `importBatchId`
- `sourcePlatform`
- `sourceReviewId`
- `reviewedAt`
- `orderNo`
- `skuCode`
- `productId`
- `supplierId`
- `productSupplierLinkId`
- `rating`
- `content`
- `images[]`
- `issueCategory`
- `severity`: `low | medium | high | critical`
- `responsibilityStatus`
- `responsibilityResult`
- `publicResponse`
- `correctiveAction`
- `owner`
- `status`: `new | investigating | handling | monitoring | closed`
- `closedAt`

导入去重优先使用平台评价 ID；没有评价 ID 时使用平台、订单号、SKU、评价时间和内容摘要组成稳定指纹。

## 存储与接口边界

供应链数据使用独立 D1 表：

- `supply_suppliers`
- `supply_product_supplier_links`
- `supply_purchase_approvals`
- `supply_purchase_lines`
- `supply_payment_approvals`
- `supply_sync_runs`
- `supply_inventory_batches`
- `supply_inventory_snapshots`
- `supply_inventory_adjustments`
- `supply_quality_import_batches`
- `supply_quality_issues`

现有 `/api/state` 继续管理产品全周期状态；现有 `/api/sales` 继续提供 D1 销售聚合。供应链 API 只通过产品 ID 和 SKU/69 码引用现有产品与销售数据，不复制产品主数据。

接口按业务能力拆分：

- `/api/supply-chain/summary`
- `/api/supply-chain/suppliers`
- `/api/supply-chain/product-suppliers`
- `/api/supply-chain/approvals/sync`
- `/api/supply-chain/approvals`
- `/api/supply-chain/inventory/import`
- `/api/supply-chain/inventory/reconcile`
- `/api/supply-chain/inventory/adjustments`
- `/api/supply-chain/quality/import`
- `/api/supply-chain/quality/issues`
- `/api/supply-chain/sync-runs`

## 钉钉审批同步

现有“产品全流程”钉钉应用已具备工作流实例读、工作流模板读和审批流数据管理权限。同步服务复用现有服务端应用凭证与访问令牌能力。

设置中保存两类审批流程的 `processCode` 和语义字段映射。同步适配器提供两个稳定接口：

- `listApprovalInstances({ processCode, startTime, endTime, cursor })`
- `getApprovalInstance(processInstanceId)`

同步流程：

1. 按流程和时间游标增量读取采购、付款审批实例。
2. 以 `processInstanceId` 幂等写入，原始响应保存到 `rawPayload` 供审计和兼容字段变化。
3. 从付款审批的钉钉关联审批组件提取采购 `processInstanceId`。
4. 采购或付款中的产品、供应商、物料无法映射时进入待映射队列；人工确认后保存映射，后续复用。
5. 只有已通过的付款计入实付；状态变化时按全部有效付款重新聚合，不做增量相加。
6. 同步支持定时执行和页面手动刷新。接口只读取审批，不在供应链 App 内同意、拒绝或修改钉钉审批。

## 销售成本与供应商分摊

产品维度已售成本沿用现有 `/api/sales` 数据，按产品的 SKU/69 码聚合。

供应商维度已消耗成本按有效的 `ProductSupplierLink` 计算：

`供应商物料已消耗成本 = 净销量 × consumptionPerSale × unitCost`

同一产品的供应商已消耗成本合计与 ERP 产品销售成本进行对账。页面展示分摊覆盖率和差异：

- 覆盖率 100% 且差异在允许阈值内时显示正常。
- 缺成本、缺用量或有效期冲突时显示待分摊，不计算不完整的供应商库存资金。
- 分摊合计与 ERP 销售成本不一致时保留两者并显示差异，不覆盖 ERP 原值。

## 文件导入

库存盘点和差评导入共用“选择文件 → 字段映射 → 预览校验 → 确认导入 → 结果摘要”的流程。

每次导入保存批次、原始文件元数据、成功行、错误行、操作人和时间。确认前不写业务表；导入失败不产生半批数据。重复文件或重复记录提示用户，不静默覆盖。

一期支持 `.xlsx`、`.xls`、`.csv`。库存盘点必需字段为盘点日、仓库、SKU/69 码和实盘数量；差评必需字段为平台、评价时间、SKU/69 码和评价内容。

## 权限

- **总经办**：查看全部供应商、采购、付款、库存和质量数据。
- **供应链**：维护供应商、产品供应关系、采购映射、库存盘点和校准。
- **财务**：查看采购申请，核对付款同步、实付金额和付款异常。
- **质量管理**：导入差评、责任判定、公关处理、整改和关闭；可看供应商质量表现，不看付款明细。
- **产品/运营**：查看自己负责产品的供应商类别、库存风险和质量摘要，不看供应商账期及完整付款金额。

后端接口必须执行同一权限规则，不能只依赖前端隐藏。

## 错误与审计

- 同步失败保留上次成功数据，显示最后成功时间、失败时间和明确错误。
- 无法映射的审批进入待映射，不自动丢弃或猜测。
- 钉钉状态变化通过重新聚合纠正金额。
- 文件导入使用事务或等价的全批原子写入。
- 盘点校准、供应商修改、映射修改和质量关闭均写审计信息。
- 来源数据和校准数据分层保存，任何页面都能追溯到钉钉审批、导入批次、ERP 快照或销售数据日期范围。

## 测试与验收

### 领域测试

- 一采购多付款的实付汇总。
- 付款撤销、驳回、重复同步和金额变化后的重新计算。
- 产品库存资金、供应商物料消耗、分摊覆盖率和校准后余额。
- 库存盘点与 ERP 快照的数量、金额和日期对齐。
- 差评导入去重、关联、状态流转和关闭。
- 部门权限与产品负责人范围。

### API 测试

- 钉钉审批列表、详情、关联组件和分页使用固定响应模拟，不调用真实审批。
- D1 表创建、幂等写入、事务导入、聚合查询和审计记录。
- 同步失败、字段缺失、权限不足和重复请求。

### UI 验收

- 从业务 Apps 中打开供应链管理并返回经营执行平台。
- 总览异常优先级、供应商列表、采购付款关系、产品供应商维护、盘点导入和质量闭环。
- 加载、空状态、错误、过期数据、禁用和无权限状态。
- 桌面端、窄屏和钉钉内嵌 WebView 的层级、间距、对齐、滚动、焦点和控件行为。

## 一期不包含

- 在供应链 App 中发起、同意、拒绝或修改钉钉审批。
- 直接调用店铺平台评价接口。
- 替代 ERP 的采购、仓库、会计或结算系统。
- 完整 BOM、生产计划、需求预测和 MRP。
- 自动处罚供应商或自动决定责任归属。
- 未经确认的线上部署或真实数据回填。
