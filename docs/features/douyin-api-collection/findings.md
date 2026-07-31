# 抖音罗盘接口采集：生产环境验证结论

日期：2026-07-29。全部结论均在生产页面上实测得出，未经推测。

## 为什么放弃 DOM 操作

抖音罗盘的日期组件只响应 `isTrusted` 事件：

| 方式 | 结果 |
|---|---|
| `element.click()` | 无效 |
| `PointerEvent` + `MouseEvent` 完整序列 | 无效 |
| 真实鼠标点击 | 有效 |
| 写入日期 `input.value` | 输入框显示新值，但页面筛选范围不变 |

扩展权限只有 `alarms / downloads / scripting / storage / tabs`，没有 `debugger`，
无法派发可信事件。因此「用扩展操作 DOM 设置日期」这条路不可行，
PR #159 据此回滚（见 #160）。

## 接口清单

| 资源 | 接口路径 |
|---|---|
| store_daily | `/compass_api/shop/common/homepage/summary_core_index_v3` |
| store_daily | `/compass_api/shop/common/homepage/core_trend_v3` |
| product_daily | `/compass_api/shop/product_card/channel_product/channel_product_card_list` |
| product_daily | `/compass_api/shop/product_card/channel_product/channel_product_category` |
| live_daily | `/compass_api/shop/live/live_overview/live_room_detail_v2` |
| video_daily | `/compass_api/shop/video/overview/core_index_trend` |
| video_daily | `/compass_api/shop/video/overview/product_rank` |
| video_daily | `/compass_api/shop/video/overview/top_videos` |

## 鉴权

仅依赖 Cookie。

签名参数（`msToken`、`a_bogus`、`verifyFp`、`fp`）在 store_daily 接口上逐个删除实测
均不影响取数（三次对照均返回 7354 字节）；商品页实测复用旧签名会被风控拒
（`code 11001`）。因此一律不携带。

`_lid` 是埋点 ID，删除不影响取数。

## 参数

商品日采集最小可用集：`begin_date`、`end_date`、`date_type=21`。`21` 是自定义日期，
可稳定指定某一个业务日；页面“近 1 天”使用的滚动预设不能用于补历史日期。

日期同时接受 `YYYY-MM-DD` 与 `YYYY/MM/DD HH:mm:ss`，实测均可取数。

**「st:0 但 data 为空」的真正原因是请求了不存在的接口路径**，不是 `date_type` 取值。
最初把 `core_index_v3` 写进清单（页面实际使用的是 `summary_core_index_v3`），
对该路径的所有请求都返回 17 字节的空响应。这类故障最难察觉：接口报成功，
只是没有数据，会被当成「当天确实没有经营数据」。

可选增强参数 `select_ad_expense_ratio`、`select_ad_cost`、`select_settlement_amt`
决定是否返回广告费与结算金额（响应 6977 → 7352 字节）。

## 响应结构

```
{ st: 0, msg: "", data: { module_data: { ... } } }
```

店铺汇总使用 `data.module_data`；商品列表使用：

```json
{
  "st": 0,
  "data": [
    {
      "cell_info": {
        "product": {
          "product_id_value": { "value": { "unit": "string", "value_str": "3718502021305860341" } },
          "product_name_value": { "value": { "unit": "string", "value_str": "商品名称" } }
        },
        "pay_amt": {
          "pay_amt_index_values": { "index_values": { "value": { "unit": "price", "value": 1519911 } } }
        }
      }
    }
  ],
  "page_result": { "total": 134 }
}
```

商品金额原值为分，标准事实写入前除以 100 转为元。当前商品接口可稳定映射商品 ID、商品名称、
用户支付金额、成交订单数、成交人数、曝光人数和点击人数；SKU/69 码由商品主数据后续关联，
退款、成交件数和平台成交金额在该接口没有事实来源，保持 `null`，不得补零或由名称推断。

成功判据是 `st === 0` 且对应数据容器非空。商品列表还必须完整分页到
`page_result.total`，商品 ID 唯一且非空；空页、重复 ID、分页总数变化或提前结束都失败且不入库。

## 尚未验证

- 店铺、直播和短视频接口与标准事实的完整字段映射
- 接口在扩展 content script 中的长期稳定性（内部接口无契约保证）
