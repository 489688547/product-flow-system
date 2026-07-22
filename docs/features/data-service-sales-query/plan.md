# 销售数据服务查询实施计划

## 架构方案

新增只读 `GET /api/platform/v1/data-services/sales`。无日期参数时返回 D1 实际覆盖范围和月份；提供完整 `from/to` 时以 SQL 聚合返回汇总。路由复用现有会话、部门权限、销售表初始化和 D1 绑定，浏览器不接触数据库凭据。

## 文件职责

- `functions/api/platform/v1/data-services/sales.js`：授权、校验、可用范围和汇总查询。
- `src/state/dataServicesApi.js`：版本化数据服务客户端。
- `src/ui/DateRangeControls.jsx`：共用日期范围控件。
- `src/features/data-center/DataGovernanceWorkspaces.jsx`：销售数据服务页面组合与显式查询状态。
- `tests/data-services-sales-api.test.mjs`：接口、权限、口径和查询契约。

## 接口契约

无日期参数返回 `availability`；完整日期参数返回 `query` 与 `summary`。只传一个日期、非法日期、倒序或超出允许范围时返回 `DATA_SERVICE_DATE_RANGE_INVALID`。接口不返回原始订单或个人信息。

## 风险与回滚

月份分组会读取销售事实索引，页面只在首次进入时执行一次；汇总响应固定为单行，避免大范围明细传输。回滚时移除新路由和页面区域，不改表结构。

## 验证

先运行新接口及客户端测试，再执行仓库完整 Definition of Done；部署后验证线上接口、D1 覆盖月份和生产页面显式查询行为。
