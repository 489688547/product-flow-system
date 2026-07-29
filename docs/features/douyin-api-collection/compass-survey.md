# 抖音电商罗盘摸底

日期：2026-07-29。全部结论在生产页面上实测得出，未经实测的一律标注为未知。

## 为什么要先摸底

罗盘的三个资源（商品卡、直播、短视频）每天都报
`DOUYIN_DATE_RANGE_NOT_APPLIED`，而店铺首页每天都成功。逐个接口打补丁只会
不断踩坑：同一个「查不到数据」的现象，可能是日期参数选错、页面保留期不同、
或者必填参数缺失，三者的处置方式完全不同。

## 页面为什么补不了历史日

罗盘的时间控件是**预设按钮 + 范围选择器**，没有可写值的输入框：

```
2026/07/28 – 2026/07/28  [实时][近1天][近7天][近30天][自然日][自然周][自然月][大促] [←][→]
```

- 「自然日/自然周/自然月」是**统计粒度**，不是时间范围
- 要取指定历史日只能打开范围选择器去点，而罗盘日期组件只响应 `isTrusted` 事件
- URL 上的 `date_value` / `date_type` **不生效**：实测传 07-27 单日，页面仍显示
  默认的近 7 天。快麦那条「把日期塞进 URL」的解法在罗盘上不成立

店铺首页每天成功，是因为它取默认范围，不需要改日期。

## date_type 是取数的关键

后端按 `date_type` 校验日期，选错会被拒或只给最近两天：

| `date_type` | 含义 | 取三天前（07-26） |
|---|---|---|
| 20 | 页面「近1天」 | `st:100008` 日期校验失败 |
| 21 | 自定义范围 | 正常返回 |

日期格式不敏感：`2026/07/26 00:00:00`、`2026-07-26`、`2026/07/26` 三种写法
在 `date_type=21` 下返回完全相同的结果。

## 罗盘自己会告诉你能查多久

```
GET /compass_api/config_center/data_range_v2?data_type=<页面标识>&path=<页面路径>
```

返回 `data_range_map`，按 `date_type` 给出允许的日期窗口。直播概览页实测：

| `date_type` | 可查范围 | 跨度 |
|---|---|---|
| 22 | 2026-07-26 ~ 07-28 | 3 天 |
| 21 | 2026-07-22 ~ 07-28 | 7 天 |
| 23 | 2026-06-29 ~ 07-28 | 30 天 |
| 24 | 2026-04-30 ~ 07-28 | 90 天 |
| 7 | 2026-01-01 ~ 07-28 | 今年至今 |

**采集器应当先查这个接口，再决定用哪个 `date_type`，以及目标业务日是否可采**，
而不是固定一个值然后盲目重试。这个接口按页面返回，各页面窗口并不相同。

## 各资源实测结论

| 资源 | 页面 | 可回溯 | 依据 |
|---|---|---|---|
| `live_daily` | `/shop/live-overview` | **约 90 天** | `date_type=24` 实测取到 07-15、07-20，且逐日数值不同 |
| `product_daily` | `/shop/merchandise-traffic` | **仅约 3 天** | 07-25 及更早在 `date_type=21` 与 `24` 下均返回 0 行 |
| `store_daily` | `/shop` | 未测 | 现有采集每天成功 |
| `video_daily` | `/shop/video/overview` | 未测 | 参数尚未抓取 |

商品卡的短保留期不是故障，补不了就是补不了，不应按失败重试。

## 已验证的接口与必填参数

参数取自页面实际请求，缺失会判「参数校验失败」，不是静默降级。

### 商品卡列表
```
GET /compass_api/shop/product_card/channel_product/channel_product_card_list
date_type, begin_date, end_date, activity_id, is_activity, category_code,
product_status, is_asc, channel, product_tab, only_abnormal, page_no, page_size
```
数据在 `data`（数组）。

### 直播间明细
```
GET /compass_api/shop/live/live_overview/live_room_detail_v2
date_type, begin_date, end_date, page_no, page_size, index_selected, a_type, activity_id
```
数据在 `data.module_data.shop_live_list_room_detail.compass_general_table_value.data`。

`index_selected` 决定返回哪些指标，其中 **`ad_costed_amt` 是投放消耗、
`stat_cost` 是广告花费**——广告费用就在这个接口里，不必另找数据源。

## 日期是否真正生效，必须按数值验证

「有返回」不等于「是那天的数据」。逐日比对首行支付金额：

| 资源 | 07-26 | 07-27 |
|---|---|---|
| 商品卡 | 1,519,911 | 1,441,483 |
| 直播 | 1,051,229 | 998,353 |

数值逐日不同，才算日期真正参与了查询。

## 尚未摸清

- `video_daily` 的接口与必填参数
- `store_daily` 现有采集走的是页面读数，是否也应改为接口
- 各页面的 `data_type` 标识（商品卡页的猜测值返回「调用下游失败」）
- 罗盘多处提供「下载明细」，导出文件与接口直读的字段差异
- 交易、搜索、达人、商品、营销、体验、人群、市场、数据工厂九个模块尚未摸
