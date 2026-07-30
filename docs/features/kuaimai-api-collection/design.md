# 快麦订单接口采集 设计

## 取数路径

```
扩展 content script（快麦同源，共享 Cookie）
  → 继承页面已发请求的筛选参数
  → 覆写 timeType=created、startTime、endTime
  → POST /trade/search/count 取总数
  → POST /trade/search 分页拉取直至累计数 === total
  → 校验一致后交由本机服务入库
```

## 口径

`timeType` 白名单仅含 `created`。这是 PRODUCT.md 规定的统一口径来源。
接口对无效值静默回落到 `pay_time`，两者在 2026-07-25 相差 399 单（约 6%），
若不校验会形成无征兆的口径错误。

## 失败信号

| 情况 | 处理 |
|---|---|
| 总数与实际拉取数不一致 | 判失败，不入库部分数据 |
| `result` 非 1 | 按接口返回处理 |
| 登录失效 | 需人工登录 |
| `timeType` 非白名单 | 直接拒绝，不发请求 |

## 请求格式

请求体为 `application/x-www-form-urlencoded`，不是 JSON。
总数在 `data.total`，不在 `data.page` 内。
