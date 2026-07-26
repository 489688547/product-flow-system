# 供应链共享平台 API 设计

## 架构

```text
快麦官方文件 / 钉钉审批 / 现有供应链状态
                    ↓
       共享事实投影与质量计算
                    ↓
goods-flow / data-services / data-tasks
                    ↓
       供应链 App / 数据中心 / AI

供应链用户动作
       ↓
supply-chain-workflows
       ↓
版本化实体 + 不可变事件 + 审计
```

读取事实继续使用中间件选择的 `businessDb`。网页采集和 ERP 控制状态属于控制面，`data-tasks` 只通过受权路由读取安全字段。浏览器不得选择 D1 binding 或数据库 ID。

## 共享只读契约

### 库存

`GET /api/platform/v1/goods-flow/inventory`

参数：

- `mode=current|history`，默认 `current`
- `asOf=YYYY-MM-DD`
- `skuId`
- `warehouseId`
- `cursor`

响应使用 `{ data, quality, page, meta }`。current 先确定 `MAX(snapshot_date) <= asOf`，再读取该日期完整快照。history 按日期、SKU、仓库稳定排序并游标分页。金额字段继续按既有 goods-flow 权限删除。

### 销售日需求

`GET /api/platform/v1/data-services/sales/daily`

参数 `from`、`to` 必填，可选 `productId`、`inventoryUnitId`、`platform`、`cursor`。服务端读取 `product_sales_daily`，通过商品目录 SKU 和销售编码映射解析稳定 ID；冲突或未匹配保持 `null` 并进入质量缺失。

### 其他货流事实

- `GET /api/platform/v1/goods-flow/suppliers`
- `GET /api/platform/v1/goods-flow/purchases`
- `GET /api/platform/v1/goods-flow/payments`
- `GET /api/platform/v1/goods-flow/quality-incidents`
- `GET /api/platform/v1/goods-flow/aftersales`

共享 adapter 将已有状态与货流事件投影为安全集合。金额继续按 goods-flow 权限控制。客户名、订单号、原始 payload 和凭据永不返回。

### 数据任务

`GET /api/platform/v1/data-tasks`

聚合 `web_collection_jobs/runs` 与 `erp_collection_batches/archives`，返回任务 ID、来源、资源、业务日期、状态、错误码、最后成功时间、覆盖状态和恢复动作类型。控制面路径只读、无原始行和本机路径。

## 工作流契约

### 资源

`responsibility-rules`、`procurement-rules`、`procurement-suggestions`、`purchase-plans`、`purchase-batches`、`purchase-payment-links`、`suppliers`、`bom-definitions`、`business-rules`、`quality-standards`、`inspection-plans`、`inspection-records`、`quality-incidents`、`clearance-suggestions`、`freight-rate-rules`、`freight-reconciliations`。

### 读取和创建

- `GET /api/platform/v1/supply-chain-workflows/:resource`
- `POST /api/platform/v1/supply-chain-workflows/:resource`

创建要求 `Idempotency-Key`，body 为 `{ id, fields }`。服务端生成状态、版本、责任范围、创建人和更新时间。

### 动作

`POST /api/platform/v1/supply-chain-workflows/:resource/:id/actions`

请求：

```json
{
  "expectedVersion": 3,
  "action": "confirm",
  "reason": "按最新活动计划调整",
  "fields": {}
}
```

响应：

```json
{
  "synced": true,
  "entity": { "id": "SC-001", "version": 4, "status": "confirmed" },
  "event": {
    "eventId": "event-id",
    "action": "confirm",
    "fromStatus": "draft",
    "toStatus": "confirmed"
  },
  "idempotentReplay": false
}
```

动作白名单和状态转换由纯领域模块定义。未知资源、未知动作、非法转换、版本冲突和非法字段全部 fail closed。

## 存储

新增：

- `supply_chain_workflow_entities`
- `supply_chain_workflow_events`

实体表保存当前版本与非敏感 payload；事件表为 append-only，并以幂等键唯一。两个表的展示数据策略为 `mask`，操作者字段确定性遮罩，payload 经过 JSON 安全转换。任何保险箱秘密、Token、Cookie 或原始 Provider 响应不进入这两张表。

## 兼容与回滚

- legacy `/api/supply-chain` 保持兼容但不再承载新工作流写入。
- 事实 API 仅新增，不改变现有 dashboard、盘点、账期和 CCC。
- 迁移仅新增表与索引；回滚应用代码后可保留空表。
- 已写实体不可物理删除；回滚前保留事件以供审计。
- GitOps 部署失败时保留上一生产版本；迁移前记录 D1 Time Travel 书签。

## 可观测性

错误响应包含稳定 code、requestId 和 retryable。记录资源、动作、版本、状态、耗时和安全任务 ID；不记录 fields 原文、凭据、客户、Cookie、Token、原始报表或本机路径。
