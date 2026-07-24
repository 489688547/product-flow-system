# 数据总览店铺经营数据执行任务

## 执行规则

- 每项任务只交付一个可独立验证的结果。
- 先写失败测试并确认失败原因，再写实现。
- 完成后记录实际验证命令和结果。

## 任务

- [x] 经营数据展示视图纯函数
  - 文件：`src/domain/commerceOperationsView.js`、`tests/commerce-operations-view.test.mjs`。
  - 输出：店铺每日汇总（含同比）、商品 Top 10（含同比）、直播/短视频摘要、`dayOverDay`。
  - 验证：`node --test tests/commerce-operations-view.test.mjs` 通过 4 项，覆盖方向、比例、除零与缺前一日降级。

- [x] 经营事实 API 客户端
  - 文件：`src/state/commerceFactsApi.js`。
  - 输出：`loadCommerceFacts` 校验资源、拼接查询、返回 `{ facts, quality }`，非 2xx 抛带状态码错误。

- [x] 取数编排 Hook
  - 文件：`src/state/useStoreOperations.js`。
  - 输出：加载已登记店铺、按选中店铺并行取四类资源、403 降级、请求令牌丢弃过期结果。

- [x] 店铺经营面板与总览接线
  - 文件：`StoreOperationsPanel.jsx`、`DataOverview.jsx`、`DataCenterAppPage.jsx`、`src/styles.css`、`react-tests/store-operations-ui.test.mjs`。
  - 输出：店铺切换、KPI 同比徽标、商品 Top 10 表、直播/短视频摘要、空/错/加载/降级四态。
  - 验证：`node --test react-tests/store-operations-ui.test.mjs` 通过 4 项。

- [x] CI 纳入经营测试
  - 文件：`package.json`（`test:api` 追加 `commerce-facts-domain`、`commerce-facts-api`、`commerce-operations-view`）。
  - 验证：`npm test` 全绿且包含以上测试。
