# 商品主数据治理工作台实施计划

## 目标

交付一个以档案治理和异常处理为主、经营读取为辅的紧凑商品主数据工作台。

## 架构方案

保持 `ProductCatalogProvider`、商品目录 API 和 D1 契约不变。工作区在前端派生商品档案缺口、任务视图和查询草稿；详情弹窗作为功能内只读组件消费已有商品、销售和跨 App 关联数据。外部 ERP 文件导入和快麦状态继续通过现有平台边界。

## 文件职责

- `docs/features/product-catalog-governance/*`：产品、交互、实施和执行记录。
- `DESIGN.md`：写回商品治理优先、确认式经营查询和详情分层规则。
- `src/features/data-center/ProductCatalogWorkspace.jsx`：状态带、异常入口、任务视图、查询草稿、紧凑表格和详情编排。
- `src/features/data-center/ProductCatalogDetailDialog.jsx`：商品完整只读详情。
- `src/styles.css`：工作区、任务视图、紧凑表格和详情弹窗的响应式样式。
- `react-tests/product-catalog-ui.test.mjs`：静态 UI 契约和关键交互回归。
- `react-tests/product-catalog-sales.test.mjs`：继续覆盖日期范围和销售排序领域规则。

## 接口与契约

- `ProductCatalogDetailDialog({ product, linkedProduct, supplierCount, catalogUpdatedAt, salesUpdatedAt, onClose })`：`product` 为空时返回 `null`。
- `catalogIssues(item)`：返回商品档案缺口的中文标签数组，不判断内部唯一码格式。
- `salesDraft`：`{ from, to, platform }`。
- `applySalesQuery()`：校验草稿后一次性调用 `setSalesQuery`；失败只更新本地范围错误。
- 不新增 API、环境变量、D1 表或持久化字段。

## 数据迁移

无数据迁移。现有商品、SKU、组件、销售事实、导入批次和业务关联保持兼容；新任务视图和问题数量均为前端派生。

## 风险与回滚

- 风险：现有未提交工作同时修改同一商品页面和样式。实施时仅编辑目标区块并保留现有快麦未打通状态。
- 风险：未匹配销售行无法确定性归属商品。只提供数据同步处理入口，不在商品表伪造映射。
- 风险：详情内容过多。通过分区、单层列表和弹窗滚动控制，不增加嵌套卡片。
- 回滚：恢复工作区、详情组件引用和对应样式；不触及数据层。

## 验证命令

1. `node --test react-tests/product-catalog-ui.test.mjs react-tests/product-catalog-sales.test.mjs`
2. `npm run lint`
3. `npm run check:governance`
4. `npm run check:integrations`
5. `npm run check:environment-capabilities`
6. `npm test`
7. `npm run build`
8. 本地真实页面检查 1440、1280、900、390 宽度和键盘焦点。

## 任务顺序

1. 先写商品治理、确认式查询和详情入口的失败 UI 测试。
2. 实现详情弹窗及工作区最小行为，使聚焦测试通过。
3. 实现紧凑样式和响应式状态，完成视觉检查。
4. 更新耐久设计与任务记录，运行完整 Definition of Done。
