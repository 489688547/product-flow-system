# 商品主数据治理工作台执行任务

## 执行规则

- 每项任务只交付一个可独立验证的结果。
- 先写失败测试并确认失败原因，再写实现。
- 完成后记录实际验证命令和结果。
- 不提交或覆盖工作区内与本任务无关的现有修改。

## 任务

- [x] 商品治理与确认式查询契约
  - 依赖：已确认 PRD 与设计。
  - 文件：`react-tests/product-catalog-ui.test.mjs`、`src/features/data-center/ProductCatalogWorkspace.jsx`。
  - 输入：现有商品目录、销售查询和关联状态。
  - 输出：任务视图、异常入口、查询草稿与显式提交。
  - 失败测试：`node --test react-tests/product-catalog-ui.test.mjs`，预期因治理入口和查询提交尚不存在而失败。
  - 实现步骤：先派生档案缺口，再加入任务视图；平台和日期写入草稿；提交时一次性更新查询。
  - 验证：聚焦测试通过，改变草稿的代码路径不直接调用 `setSalesQuery`。
  - 实际验证：`node --test react-tests/product-catalog-ui.test.mjs react-tests/product-catalog-sales.test.mjs`，14/14 通过；日期范围弹窗取消后不提交查询。
  - 提交：仅包含本任务测试、工作区和文档。

- [x] 商品详情与紧凑主表
  - 依赖：商品治理与确认式查询契约。
  - 文件：`src/features/data-center/ProductCatalogDetailDialog.jsx`、`src/features/data-center/ProductCatalogWorkspace.jsx`、`src/styles.css`、`react-tests/product-catalog-ui.test.mjs`。
  - 输入：商品、SKU、组件、销售、关联和来源时间。
  - 输出：详情弹窗、状态列、稳定主表行高和响应式布局。
  - 失败测试：`node --test react-tests/product-catalog-ui.test.mjs`，预期因详情组件和样式不存在而失败。
  - 实现步骤：创建只读详情；主表仅保留摘要；详情按钮连接当前商品；补充桌面和窄屏样式。
  - 验证：聚焦测试通过，并完成 1440、1280、900、390 宽度及键盘检查。
  - 实际验证：1440、900、390 宽度无页面或工具栏横向溢出；日期范围可由键盘打开并取消；空商品目录、异常入口和详情结构均有明确状态。
  - 提交：仅包含详情、工作区、样式、测试和文档。

- [x] 完整质量门禁与交付
  - 依赖：前两项完成。
  - 文件：本功能全部目标文件。
  - 输入：最终工作区差异。
  - 输出：完整验证证据和明确的未覆盖环境边界。
  - 失败测试：不适用；该任务验证已经通过聚焦测试的实现。
  - 实现步骤：检查目标 diff、运行仓库 Definition of Done、构建后进行本地页面和 WebView 宽度检查。
  - 验证：所有命令逐项记录通过、失败、未执行或受阻。
  - 实际验证：`npm run lint`、`npm run check:governance`、`npm run check:integrations`、`npm run check:environment-capabilities`、`npm test`、`npm run build`、`git diff --check` 均通过；本次未执行线上发布。
  - 提交：只暂存本功能文件，不包含既有用户修改。
