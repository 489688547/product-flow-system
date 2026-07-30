# 快麦订单接口采集 实施计划

## 文件

### 新增
- `chrome-extension/company-data-collector/providers/kuaimaiApi.js`
  参数构造、口径白名单、响应判定、分页
- `tests/kuaimai-api-collection.test.mjs`

### 待修改
- `chrome-extension/company-data-collector/providers/executors/kuaimai.js`
  以接口取数替代网页导出
- `docs/platform/error-codes.md` 登记新增错误码

## 验证方式

单元测试覆盖参数构造与判定逻辑。**接口行为必须在生产页面实测**：
本特性的口径差异与静默回落，都是实测才发现的。

## 风险

内部接口无契约保证。口径回落尤其危险，必须在发请求前校验而非事后判断。
