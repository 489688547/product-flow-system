# 商品目录 API v1

## 边界

- 路径：`GET /api/platform/v1/product-catalog`
- 数据库：请求上下文选择的 `businessDb`
- 事实来源：`product_catalog_*`、`product_sales_daily`、`goods_flow_inventory_daily`
- 接口只读，不调用快麦或其他外部 Provider，不创建表，不复制销售或库存事实。
- 所有响应使用现有商品目录 JSON 与安全错误格式。

## 认证与权限

- 未登录返回 `401 AUTH_SESSION_REQUIRED`。
- 已登录员工可读取商品、销售数量和库存数量。
- 采购成本、组件成本及库存金额不由本接口新增；既有商品成本继续只对总经办、财务、供应链和采购范围返回。
- D1 必须通过请求上下文选择，路由不得直接固定到正式库。

## 请求

```http
GET /api/platform/v1/product-catalog?from=2026-07-01&to=2026-07-28&platform=抖音
```

- `from`、`to` 同时省略时不扫描销售表，但仍读取最新库存。
- 只提供一个日期、倒序、非法日期或超过 370 天返回 `400 PRODUCT_CATALOG_SALES_RANGE_INVALID`。
- `platform` 可省略；省略时排除空值、`其它`、`其他`、`未知` 和 `未知平台`。
- 日期使用订单创建时间、`Asia/Shanghai` 和闭区间。

## 响应

```json
{
  "synced": true,
  "items": [
    {
      "id": "kuaimai:item:1001",
      "name": "示例商品",
      "sales": {
        "quantity": 12,
        "netSales": 360,
        "matchedCodeCount": 1,
        "platforms": []
      },
      "inventory": {
        "quantity": 128,
        "status": "available",
        "snapshotDate": "2026-07-28",
        "coverage": 1,
        "confidence": "partial",
        "matchedSkuCount": 1,
        "requiredComponentCount": 0,
        "matchedComponentCount": 0
      }
    }
  ],
  "meta": {
    "sales": {
      "from": "2026-07-01",
      "to": "2026-07-28",
      "timeBasis": "create_time",
      "timezone": "Asia/Shanghai"
    },
    "inventory": {
      "status": "trusted",
      "snapshotDate": "2026-07-28",
      "coverage": 1,
      "confidence": "partial",
      "lastSuccessfulSyncAt": "2026-07-28T05:20:00.000Z",
      "totalRows": 3568,
      "warehouseCount": 12,
      "skuCount": 301,
      "coveredProducts": 100,
      "unmatchedProducts": 5
    }
  }
}
```

`sales` 只在提交完整日期范围时出现。`inventory` 始终出现。

## 库存计算

- 服务端读取最新库存快照，最多跟随 20 个有界分页，不向浏览器返回仓库明细。
- 快照无数据时 `meta.inventory.status=unavailable`。
- 数量覆盖不足时为 `partial`；快照超过 1 个上海自然日时为 `stale`；只有 `trusted` 快照用于商品数量。
- 单品按真实商品、SKU、规格商家编码或 69 码确定性匹配，同一 SKU 跨仓相加并按库存行去重。
- 组合品只使用正式组件和正整数用量，库存为 `MIN(FLOOR(组件库存 / 组件用量))`。
- 缺失或冲突映射、缺少组件、无效用量均返回 `quantity: null`，不得显示为零。

## 商品库存状态

| 状态 | 含义 |
| --- | --- |
| `available` | 映射完整且校准库存大于零 |
| `zero` | 映射完整且校准库存确实为零 |
| `unmatched` | 单品 SKU 无法唯一匹配库存 |
| `incomplete` | 组合品组件、用量或库存映射不完整 |
| `unavailable` | 没有可信库存快照 |

## 错误

- `AUTH_SESSION_REQUIRED`
- `PRODUCT_CATALOG_STORAGE_UNAVAILABLE`
- `PRODUCT_CATALOG_SALES_RANGE_INVALID`
- `PRODUCT_CATALOG_INVENTORY_QUERY_LIMIT`
- `PRODUCT_CATALOG_UNEXPECTED`

错误包含稳定 `code`、安全中文 `message`、`requestId` 和 `retryable`，不返回 SQL、D1 原始异常、库存明细或本地路径。

## 兼容与回滚

- 新增 `items[].inventory` 和 `meta.inventory` 为向后兼容字段；旧客户端可忽略。
- 不带日期的旧请求继续不扫描销售表，但会读取最新库存。
- 回滚路由扩展只移除新增字段，不删除商品、销售、库存或同步记录。
- 接口读取量受当前库存分页和 20 页硬上限保护；超限失败，不返回截断库存。

## 可观测性与验收

- 本地线上模式、开发站和生产站分别验证，任一环境通过不代替其他环境。
- 生产验收记录 commit、HTTP 状态、request ID、商品数、库存覆盖、快照日期和冷/热耗时；不输出商品或仓库明细。
- 页面日期变化只应改变 `meta.sales` 与 `items[].sales`，库存快照与数量保持不变。

