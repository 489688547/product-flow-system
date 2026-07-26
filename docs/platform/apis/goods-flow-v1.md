# 货流平台 API v1

## 目的与当前状态

`/api/platform/v1/goods-flow/*` 是供应链、数据中心、经营驾驶舱和公司 AI 共用的货流事实边界。页面不得直接读取 D1，也不得在供应链 feature 内复制库存事实。

当前已实现库存日投影、盘点、账期、CCC、库存 `current/history/filter/quality`，以及供应商、采购、付款、质量问题和售后安全读取。快麦开放平台仍保持 `integrating`；当前库存来自公司 Mac 的官方文件采集与受控投影，不能因库存查询健康而把快麦 API 标记为已接通。

## 认证与授权

- 所有路由要求有效的公司会话，并由服务端解析组织身份。
- `role=executive` 可读取全部货流数据和金额，不依赖会话中是否同时带有部门文本。
- 非 executive 读取权限由钉钉部门集合决定；支持单部门和多部门字段。
- 写权限继续按动作与责任部门校验；executive 读取放行不会隐式扩大写权限。
- 浏览器提交的角色、部门、数据库 ID 或绑定名称不会参与授权。

## 库存读取

### `GET /api/platform/v1/goods-flow/inventory`

支持 `mode=current|history`、`asOf=YYYY-MM-DD`、`skuId`、`warehouseId` 和 `cursor`。兼容参数 `through` 等同 `asOf`。`current` 先确定不晚于 `asOf` 的最新完整快照日期，再返回该日期的全部行；不得按每个 SKU 的最后更新时间拼出混合日期快照。`history` 返回历史行并稳定分页。响应：

```json
{
  "ok": true,
  "data": [
    {
      "id": "2026-07-26:SKU-001:WH-01",
      "date": "2026-07-26",
      "productId": null,
      "skuId": "SKU-001",
      "skuCode": "690000000001",
      "warehouseId": "WH-01",
      "erpQuantity": 18,
      "calibratedQuantity": 18,
      "unitCost": 0,
      "calibratedInventoryValue": 0,
      "stocktakeStatus": "unverified",
      "sourceUpdatedAt": "2026-06-01T00:00:00.000Z",
      "confidence": "complete"
    }
  ],
  "quality": {
    "status": "trusted",
    "lastSuccessfulSyncAt": "2026-07-26T13:00:00.000Z",
    "coverage": 1,
    "confidence": "complete",
    "missing": [],
    "latestSnapshotDate": "2026-07-26",
    "freshnessDays": 0
  },
  "page": { "nextCursor": null },
  "meta": {
    "requestId": "request-id",
    "updatedAt": "2026-07-26T13:00:00.000Z",
    "coverage": { "stocktake": 0 },
    "version": 2
  }
}
```

`date` 是批次采集/投影日期；行级 ERP 更新时间单独保存在 `sourceUpdatedAt`。没有真实商品稳定 ID 时 `productId=null`，不得以仓库与 SKU 拼接值伪造商品 ID。无金额权限时服务端删除成本和金额字段。

## 供应商、采购、付款、质量与售后读取

- `GET /api/platform/v1/goods-flow/suppliers`
- `GET /api/platform/v1/goods-flow/purchases`
- `GET /api/platform/v1/goods-flow/payments`
- `GET /api/platform/v1/goods-flow/quality-incidents`
- `GET /api/platform/v1/goods-flow/aftersales`

统一返回 `{ synced, items, quality, page, meta }`。采购与付款保持独立，并通过稳定 `purchaseId` 关联。货流事件优先于 legacy 状态；供应商主档与质量问题当前仍有 legacy 安全投影时，`quality.status=partial` 并列出缺失来源。售后只返回标准化状态、金额、时间和库存单位引用，不返回客户、订单号、原始 payload 或凭据。没有来源事实时返回空集合与 `unavailable`，不得补样例。

## 完整当前快照投影

完成状态的 ERP `inventory_snapshot` 批次通过受控 ERP ingest 边界投影，不提供浏览器直写接口：

1. 公司 Mac 对完整官方文件做日期、字段、行数和覆盖校验。
2. 服务端要求一个批次内所有记录使用同一个快照日期，且 `SKU × 仓库` 唯一。
3. 3,568 行等大快照先写入 `goods_flow_inventory_daily_stage`，每个 D1 batch 最多 50 条 statement。
4. 暂存完整后，以一个 D1 batch 原子执行：删除目标快照日期、从指定 projection 插入全部暂存行、清理该 projection 暂存行。
5. projection ID 使用稳定批次 ID；同一批次重放幂等，不累积重复事实。
6. 收到 `completed` 请求时，control batch/archive 先保持 `pending/processing`；只有原子发布成功才推进为 `completed/processed`。
7. 任一暂存分块失败时，不删除或改变线上上一可信快照，control 状态保持可重放。

普通盘点和小范围兼容 upsert 也以最多 50 条 statement 分块，但不会触发完整日期替换。

## 稳定错误

- `AUTH_SESSION_REQUIRED`：未登录，HTTP 401。
- `GOODS_FLOW_ACTION_DENIED`：当前身份无读取或操作权限，HTTP 403。
- `GOODS_FLOW_WRITE_DENIED`：只读身份尝试写入，HTTP 403。
- `GOODS_FLOW_STORAGE_UNAVAILABLE`：业务 D1 或所需表不可用。
- `GOODS_FLOW_INVENTORY_SNAPSHOT_INVALID`：完整库存快照为空、混合日期、缺少稳定 SKU/仓库、或存在重复 `SKU × 仓库`，HTTP 400。
- `GOODS_FLOW_INVENTORY_QUERY_INVALID`：库存模式、日期、筛选或游标无效，HTTP 400。
- `GOODS_FLOW_QUERY_INVALID`：货流集合筛选或游标无效，HTTP 400。
- `ERP_COLLECTION_INGEST_FAILED` / `ERP_COLLECTION_INTERNAL_ERROR`：ERP 入库或投影发生未预期失败；响应与日志不得暴露原始行或凭据。

## 兼容、迁移与回滚

- 新增 `goods_flow_inventory_daily_stage`，展示数据策略为 `skip`；暂存事实不会复制到展示库。
- 上线前必须应用对应迁移并通过环境能力检查，否则保持上一可信库存投影。
- 迁移仅新增暂存表和索引，不改动现有 `goods_flow_inventory_daily`。
- 回滚应用代码后可保留暂存表；未发布的暂存行不影响读取。需要清理时按 projection ID 删除，不得删除 live 表历史。
- 生产交付仍走 GitOps。应用迁移、部署和真实文件重放是独立验收步骤，本地测试不代表生产数据已恢复。

## 可观测性

记录安全 request ID、ERP batch/projection ID、快照日期、源行数、暂存分块数、投影行数、覆盖率和稳定错误码。不得记录原始文件内容、绝对路径、账号、Cookie、Token 或客户信息。

## 契约测试

- `tests/goods-flow-inventory-storage.test.mjs`
- `tests/goods-flow-api.test.mjs`
- `tests/goods-flow-migration.test.mjs`
- `tests/kuaimai-erp-collection-api.test.mjs`
