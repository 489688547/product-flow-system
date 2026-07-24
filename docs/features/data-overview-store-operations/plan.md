# 数据总览店铺经营数据实施计划

**Goal:** 数据总览新增可切换店铺的抖店经营数据区，只读消费已登记的经营事实，展示店铺每日汇总（含同比昨天）、重点商品 Top 10 与直播/短视频摘要。

**Architecture:** `src/domain` 提供纯函数视图构建；`src/state` 编排取数（复用采集状态与经营事实查询）；`src/features/data-center` 组合展示。不新增数据库表、迁移、环境变量或外部写入。

**Tech Stack:** React 19、lucide-react、既有 `DataTable`、Node test runner、Vite 7。

## 全局约束

- 仅读取 `provider=douyin-ecommerce`、`status=connected` 店铺与已登记经营事实资源。
- 同比取经营事实最新业务日与紧邻前一日；除零、缺前一日降级为不可比，不补 0。
- 退款率越低越好；其余指标越高越好；徽标复用总览 `data-kpi-comparison` 语义。
- 403 优雅降级，不影响总览其余部分；快速切换店铺以请求令牌丢弃过期结果。
- 不复制统一口径公式，不替代电商店铺运营 App 驾驶舱。

## 文件

- `src/domain/commerceOperationsView.js`：`buildStoreDailySummary`、`buildProductDailyTop10`、`buildContentDailySummary`、`dayOverDay`（纯函数）。
- `src/state/commerceFactsApi.js`：`loadCommerceFacts`（GET `/api/platform/v1/commerce-facts`）。
- `src/state/useStoreOperations.js`：店铺清单 + 选中店铺四类资源取数与降级。
- `src/features/data-center/StoreOperationsPanel.jsx`：切换、KPI、商品表、内容摘要与各状态。
- `src/features/data-center/DataOverview.jsx`、`DataCenterAppPage.jsx`：挂载与接线。
- `src/styles.css`：`store-ops-*` 样式。
- 测试：`tests/commerce-operations-view.test.mjs`、`react-tests/store-operations-ui.test.mjs`；并把既有 `tests/commerce-facts-*.test.mjs` 纳入 `test:api`。

## 回滚

- 纯新增读取路径；移除 `DataOverview` 中的 `StoreOperationsPanel` 挂载即回到原总览，无数据结构或契约变更。
