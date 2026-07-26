# 供应链工作流平台 API v1

## 范围

`/api/platform/v1/supply-chain-workflows` 是供应链 13 个用户故事共用的版本化写边界。它管理责任规则、采购建议与计划、采购批次、采购付款关联、供应商商务档案、BOM、业务规则、质量标准与闭环、清仓建议和快递费核对。供应链 feature 不得在浏览器状态、legacy whole-state 或自己的 D1 表中复制这些实体。

## 资源

- `responsibility-rules`
- `procurement-rules`
- `procurement-suggestions`
- `purchase-plans`
- `purchase-batches`
- `purchase-payment-links`
- `suppliers`
- `bom-definitions`
- `business-rules`
- `quality-standards`
- `inspection-plans`
- `inspection-records`
- `quality-incidents`
- `clearance-suggestions`
- `freight-rate-rules`
- `freight-reconciliations`

## 请求

### 列表

`GET /api/platform/v1/supply-chain-workflows/:resource?status=&cursor=`

返回 `{ synced, items, nextCursor, scope, coverage, meta }`。实体包含稳定 ID、状态、版本、责任部门、非敏感 fields、归档时间和服务端操作者留痕。

### 创建

`POST /api/platform/v1/supply-chain-workflows/:resource`

必须携带 `Idempotency-Key`，body 为：

```json
{
  "id": "plan-2026-07-001",
  "fields": {
    "title": "7 月补货计划",
    "suggestedQuantity": 100
  }
}
```

服务端生成初始状态、版本 1、责任部门和审计事件。重复幂等键返回原结果且 `idempotentReplay=true`。

### 动作

`POST /api/platform/v1/supply-chain-workflows/:resource/:id/actions`

必须携带 `Idempotency-Key`，body 为：

```json
{
  "expectedVersion": 1,
  "action": "submit",
  "reason": "按最新活动计划调整",
  "fields": {
    "adjustedQuantity": 90
  }
}
```

服务端校验资源状态机和乐观版本，成功后版本加一并追加不可变事件。`submit` 和 `order` 在尚未接通外部写 Provider 时只保存 `pending_manual` 恢复状态，不伪造钉钉审批或 ERP 下单成功。

## 权限

- 所有读写要求有效公司会话。
- executive 可读取和维护全部资源。
- 供应链/采购维护采购、供应商、BOM、业务规则和清仓。
- 质量维护质量标准、质检和质量问题。
- 财务维护采购付款关联、费率和运费核对。
- 仓库可维护质检记录；运营可确认清仓建议；产品可维护 BOM 与质量标准。
- readonly 账号不能写。
- 责任部门、操作者、版本、状态和审计时间全部由服务端生成。

## 安全

- payload 不能包含密码、Token、Cookie、Authorization、银行卡、证件、手机号或任何凭据；供应商秘密只保存 `credentialVaultEntryId`。
- payload 不能提交 actor、actorId、userId、department、ownerDepartment、createdBy、updatedBy、version 或 status。
- 列表和错误响应使用 `no-store`，不返回原始 Provider 响应。

## 稳定错误

- `AUTH_SESSION_REQUIRED`
- `SUPPLY_WORKFLOW_VIEW_DENIED`
- `SUPPLY_WORKFLOW_ACTION_DENIED`
- `SUPPLY_WORKFLOW_WRITE_DENIED`
- `SUPPLY_WORKFLOW_RESOURCE_INVALID`
- `SUPPLY_WORKFLOW_INPUT_INVALID`
- `SUPPLY_WORKFLOW_SERVER_FIELD_DENIED`
- `SUPPLY_WORKFLOW_SENSITIVE_FIELD_DENIED`
- `SUPPLY_WORKFLOW_IDEMPOTENCY_KEY_REQUIRED`
- `SUPPLY_WORKFLOW_IDEMPOTENCY_CONFLICT`
- `SUPPLY_WORKFLOW_ALREADY_EXISTS`
- `SUPPLY_WORKFLOW_NOT_FOUND`
- `SUPPLY_WORKFLOW_ACTION_INVALID`
- `SUPPLY_WORKFLOW_TRANSITION_INVALID`
- `SUPPLY_WORKFLOW_VERSION_CONFLICT`
- `SUPPLY_WORKFLOW_STORAGE_UNAVAILABLE`

## 存储、展示与回滚

`supply_chain_workflow_entities` 保存当前版本，`supply_chain_workflow_events` 保存不可变事件。事件表对 `(resource_type, entity_id, result_version)` 和 `idempotency_key` 唯一，配合 D1 batch 阻止重复版本。

两张表展示策略均为 `mask`；操作者字段确定性遮罩，JSON fields 走安全转换。归档替代物理删除。回滚应用代码不删除表或事件；迁移前记录 D1 Time Travel 书签。
