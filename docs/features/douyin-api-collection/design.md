# 抖音接口采集 设计

## 取数路径

```
扩展 content script（罗盘同源，共享 Cookie）
  → 读取页面已发出请求的业务参数
  → 剥离签名参数与埋点 ID
  → 覆写 begin_date / end_date / date_type
  → fetch(credentials: "include")
  → 判定 st 与数据非空
```

## 为什么读取页面已有请求

接口的业务参数（如 `select_ad_cost`、`has_deposit_pay_amt`）决定返回哪些指标，
且随页面版本变化。从页面实际请求中继承这些参数，比在扩展里硬编码更不易过期。

日期与 `date_type` 由采集任务覆写，其余原样继承。

## 失败信号

| 情况 | 错误码 | 处理 |
|---|---|---|
| 风控拒绝 | `DOUYIN_API_RISK_CONTROL` | 可重试 |
| 登录失效 | `DOUYIN_LOGIN_REQUIRED` | 需人工登录 |
| 成功但无数据 | `DOUYIN_API_EMPTY_DATA` | 检查接口路径与参数 |
| 状态非 0 | `DOUYIN_API_REQUEST_FAILED` | 按 msg 判断 |
| 结构异常 | `DOUYIN_API_MALFORMED` | 需人工确认 |

`DOUYIN_API_EMPTY_DATA` 是最重要的一条：接口对不存在的路径返回 `st:0` 且空数据，
若只看 `st` 会被当成「当天确实没有经营数据」，形成静默错数据。

## 不做的事

不在扩展中重新实现签名算法。签名为一次性且随版本变化，复现成本高且易被风控；
实测不携带签名即可取数。
