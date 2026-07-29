# 抖音接口采集 实施计划

## 文件

### 新增
- `chrome-extension/company-data-collector/providers/douyinApi.js`
  接口清单、URL 构造、响应判定
- `tests/douyin-api-collection.test.mjs`
- `docs/features/douyin-api-collection/findings.md` 生产验证结论

### 待修改
- `chrome-extension/company-data-collector/providers/executors/douyin.js`
  以接口取数替代日期 DOM 操作
- `docs/platform/error-codes.md` 登记新增的四个错误码

## 验证方式

单元测试覆盖 URL 构造与响应判定。**接口可用性必须在生产页面上实测**，
不接受仅凭单元测试通过就认为可用——本特性的接口清单错误正是被实测发现的。

## 风险

内部接口无契约保证，可能随版本变化。失败信号必须可区分，
使接口变化表现为明确失败而不是静默的空数据。
