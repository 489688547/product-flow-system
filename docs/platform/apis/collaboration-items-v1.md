# 部门协同事项 API 契约

## 基本信息

- 负责人：经营执行平台负责人
- 调用方：经营执行平台、产品全周期、供应链管理、数据中心、品牌内容协同
- 版本：v1
- 集合方法与路径：`GET|POST /api/platform/v1/collaboration-items`
- 单项方法与路径：`GET|PATCH /api/platform/v1/collaboration-items/:id`
- 流转方法与路径：`POST /api/platform/v1/collaboration-items/:id/transitions`
- 活动方法与路径：`GET /api/platform/v1/collaboration-items/:id/activities`

## 用途与边界

该接口保存和查询跨 App 部门协同事项，统一责任、状态流转、权限、活动记录和钉钉同步元数据。业务 App 仍然是产品阶段、库存、采购、质量、数据源和内容生产等业务事实的唯一来源。

接口不接收业务 App 整包状态，不保存附件和外部原始响应，不自动改变来源业务状态，也不允许业务 App 直接代表其他部门完成接收或验收。

## 认证与权限

- 所有方法要求有效公司会话；缺失会话返回 401 `AUTH_SESSION_REQUIRED`。
- `readonly` 会话可读取授权范围，写操作返回 403 `PERMISSION_WRITE_DENIED`。
- 总经办可读取全部事项并执行总经办允许的升级、重新分配和归档动作。
- 普通员工只能读取本人为发起人、主负责人、决策人，或本人部门为发起、主责、协同部门的事项。
- 普通员工创建事项时，`requesterUser` 和 `requesterDepartment` 由服务端会话写入；客户端字段被忽略。
- 状态动作按当前状态和会话身份校验，不能只依赖前端隐藏按钮。
- 对无权查看的 ID 返回 404 `COLLABORATION_ITEM_NOT_FOUND`，避免泄露事项是否存在。

## 请求

### GET 集合

查询参数：

| 参数 | 类型 | 默认值 | 约束 |
| --- | --- | --- | --- |
| `view` | string | `my_scope` | `my_scope | pending_acceptance | in_progress | waiting_others | pending_verification | participating | completed | executive` |
| `status` | string[] | 空 | 可重复参数；仅接受契约状态 |
| `appId` | string | 空 | 最多 80 字符 |
| `kind` | string | 空 | 五种事项类型之一 |
| `impactLevel` | string | 空 | `high | medium | low` |
| `departmentId` | string | 空 | 仅总经办可以指定非本人部门 |
| `query` | string | 空 | 最多 80 字符，匹配标题、来源标签和主负责人展示名 |
| `dueBefore` | ISO string | 空 | 带时区的有效时间 |
| `includeArchived` | boolean | `false` | 仅总经办和原发起人可读取归档记录 |
| `limit` | integer | `50` | 1–100 |
| `cursor` | string | 空 | 服务端签发的不透明游标 |

普通员工传入 `view=executive`、其他部门 ID 或越权状态组合时返回 403，而不是静默扩大范围。

### POST 创建

```json
{
  "idempotencyKey": "product-flow:product:p1:task:task-42:handoff",
  "kind": "handoff",
  "title": "确认首批包装到货时间",
  "description": "新品进入上市准备阶段前需要确认首批包装到仓。",
  "requestedAction": "供应链确认供应商排期并回填预计到仓日期。",
  "impactLevel": "high",
  "businessImpact": "未按期到仓将影响 8 月首批上市。",
  "ownerDepartment": { "id": "dept-supply", "name": "供应链" },
  "ownerUser": { "userId": "user-ye", "unionId": "union-ye", "name": "叶津成" },
  "partnerDepartments": [{ "id": "dept-brand", "name": "品牌" }],
  "dueAt": "2026-07-25T18:00:00+08:00",
  "source": {
    "appId": "product-flow",
    "entityType": "product",
    "entityId": "p1",
    "sourceRecordId": "task-42",
    "sourceRoute": "#/progress/p1",
    "sourceLabel": "鹦鹉谷物棒 · 包装到货"
  },
  "strategyLinks": {
    "strategyId": "strategy-revenue-2026",
    "requiredResultId": "result-new-products",
    "projectId": ""
  },
  "evidence": [
    { "label": "计划上市", "value": "2026-08", "basis": "产品计划", "asOf": "2026-07-18" }
  ]
}
```

约束：

- 只接受文档定义的字段；未知字段返回 400。
- `idempotencyKey`、`kind`、`title`、`requestedAction`、`businessImpact`、`ownerDepartment` 和 `dueAt` 必填。
- `ownerUser` 新建时可为空，但执行 `accept` 前必须存在；`decision` 创建时 `decisionOwner` 必填。
- 主责部门和协同部门必须存在于当前组织缓存；协同部门不得包含主责部门，最多 10 个。
- `evidence` 最多 20 项，每项标签最多 80 字符、值最多 300 字符、口径最多 160 字符。
- 来源路由只接受应用内部 hash 路由或同源相对路径，不接受任意外部 URL。
- 服务端写入发起身份、初始状态 `pending_acceptance`、版本 1 和创建时间。

### PATCH 单项

```json
{
  "version": 3,
  "patch": {
    "title": "确认首批包装生产与到货时间",
    "requestedAction": "供应链确认生产排期、到仓日期和延迟预案。",
    "dueAt": "2026-07-26T18:00:00+08:00"
  },
  "reason": "供应商补充了生产周期"
}
```

- `version` 必填；不一致返回 409。
- 只允许修改标题、说明、下一步、影响、影响等级、责任、协同部门、截止时间、证据、来源标签和战略关联。
- 事项接收后修改主责、主负责人或截止时间必须提供 `reason`，并追加活动记录。
- 关闭、取消和归档事项不可普通编辑。
- 归档使用 `patch.archived = true` 和必填 `reason`；不提供物理 DELETE 方法。

### POST 状态流转

```json
{
  "version": 3,
  "transition": "block",
  "idempotencyKey": "ui-20260718-7d1f4c",
  "reason": "供应商设备故障，原排期无法兑现。",
  "fields": {
    "coordinationNeed": "请总经办确认是否启用备选供应商。",
    "expectedResumeAt": "2026-07-21T12:00:00+08:00"
  }
}
```

允许动作：`accept | return | resubmit | block | resume | submit | verify | reopen | cancel | escalate | decide`。动作需要的字段和权限以 PRD 状态机为准。

`accept` 可携带 `ownerUser`；`submit` 必须携带 `completionSummary`；`block`、`return`、`reopen`、`cancel` 和 `escalate` 必须携带非空原因。

`decide` 只允许指定决策人在 `decision + pending_acceptance` 组合执行，必须携带 `decisionOutcome = recommended | alternative | custom` 和非空 `decisionSummary`，成功后直接进入 `closed`。

## 响应

### 集合成功

```json
{
  "synced": true,
  "items": [
    {
      "id": "collab_a13f",
      "kind": "handoff",
      "title": "确认首批包装到货时间",
      "status": "pending_acceptance",
      "impactLevel": "high",
      "requesterDepartment": { "id": "dept-product", "name": "产品部" },
      "ownerDepartment": { "id": "dept-supply", "name": "供应链" },
      "ownerUser": { "userId": "user-ye", "unionId": "union-ye", "name": "叶津成" },
      "partnerDepartments": [],
      "dueAt": "2026-07-25T10:00:00.000Z",
      "source": {
        "appId": "product-flow",
        "entityType": "product",
        "entityId": "p1",
        "sourceRecordId": "task-42",
        "sourceRoute": "#/progress/p1",
        "sourceLabel": "鹦鹉谷物棒 · 包装到货"
      },
      "version": 1,
      "updatedAt": "2026-07-18T08:30:00.000Z"
    }
  ],
  "nextCursor": "opaque_cursor_or_empty",
  "scope": { "mode": "department", "departmentIds": ["dept-supply"] }
}
```

### 单项成功

```json
{
  "synced": true,
  "item": {
    "id": "collab_a13f",
    "version": 4,
    "status": "blocked",
    "updatedAt": "2026-07-18T09:10:00.000Z"
  }
}
```

### 幂等命中

POST 创建命中未关闭来源时返回 200：

```json
{
  "synced": true,
  "deduplicated": true,
  "item": { "id": "collab_a13f", "version": 4, "status": "blocked" }
}
```

### 活动列表

```json
{
  "synced": true,
  "activities": [
    {
      "id": "activity_64d0",
      "itemId": "collab_a13f",
      "action": "block",
      "fromStatus": "in_progress",
      "toStatus": "blocked",
      "reason": "供应商设备故障，原排期无法兑现。",
      "changedFields": ["blockedReason", "coordinationNeed", "expectedResumeAt", "status"],
      "actorUser": { "userId": "user-ye", "name": "叶津成" },
      "actorDepartment": { "id": "dept-supply", "name": "供应链" },
      "createdAt": "2026-07-18T09:10:00.000Z"
    }
  ]
}
```

所有服务端时间统一返回 UTC ISO 字符串；页面按 `Asia/Shanghai` 展示。无数据字段使用空字符串、空数组或 `null`，不能用虚假 0 代替缺失事实。

## 错误码

| 错误码 | HTTP | 用户文案 | 可重试 | 处理方式 |
| --- | --- | --- | --- | --- |
| `AUTH_SESSION_REQUIRED` | 401 | 请先使用钉钉登录。 | 否 | 进入登录流程 |
| `PERMISSION_READ_DENIED` | 403 | 当前身份不能查看该协同范围。 | 否 | 返回本人范围 |
| `PERMISSION_WRITE_DENIED` | 403 | 当前身份不能执行此操作。 | 否 | 展示允许角色 |
| `COLLABORATION_ITEM_INVALID` | 400 | 请检查协同事项的必填信息。 | 否 | 展示字段错误 |
| `COLLABORATION_TRANSITION_INVALID` | 400 | 当前状态不能执行此动作。 | 否 | 刷新允许动作 |
| `COLLABORATION_ITEM_NOT_FOUND` | 404 | 协同事项不存在或当前无权查看。 | 否 | 返回列表 |
| `COLLABORATION_VERSION_CONFLICT` | 409 | 事项已被其他同事更新，请刷新后重试。 | 否 | 保留输入并比较最新版本 |
| `COLLABORATION_IDEMPOTENCY_CONFLICT` | 409 | 该来源键对应的历史事项与本次请求不一致。 | 否 | 打开历史事项或创建新一轮键 |
| `COLLABORATION_STORAGE_UNAVAILABLE` | 501 | 共享协同数据暂不可用。 | 是 | 检查 D1 绑定后重试 |
| `DINGTALK_TODO_SYNC_FAILED` | 502 | 协同事项已保存，但钉钉待办同步失败。 | 是 | 手动重试同步 |
| `VALIDATION_METHOD_NOT_ALLOWED` | 405 | Method not allowed | 否 | 修正调用方法 |
| `INTERNAL_UNEXPECTED` | 500 | 协同数据处理失败，请稍后重试。 | 是 | 使用 request ID 定位 |

错误结构遵循 `docs/platform/error-codes.md`：

```json
{
  "synced": false,
  "message": "事项已被其他同事更新，请刷新后重试。",
  "error": {
    "code": "COLLABORATION_VERSION_CONFLICT",
    "message": "事项已被其他同事更新，请刷新后重试。",
    "requestId": "req_example",
    "retryable": false,
    "details": { "currentVersion": 4, "updatedAt": "2026-07-18T09:10:00.000Z" }
  }
}
```

## 幂等与分页

- 创建事项使用客户端给出的业务来源 `idempotencyKey`，数据库建立唯一索引。
- 状态动作使用请求级 `idempotencyKey`，同一事项和同一动作键只追加一次活动并返回原结果。
- PATCH 通过 `version` 乐观锁避免覆盖；成功后版本加 1。
- 集合按 `updated_at DESC, id DESC` 排序；游标编码最后一条记录的更新时间和 ID，并带服务端签名或不可预测随机引用。
- 默认 50 条，最大 100 条；游标与筛选组合不匹配时返回 400。

## 超时、重试与限流

- 普通读请求目标 2 秒内完成；D1 单次查询不扫描未授权整表后再在客户端过滤。
- 浏览器只对 GET 和明确可重试的 5xx 执行最多一次退避重试。
- POST 创建和状态动作只有在使用同一幂等键时才能安全重试。
- 客户端不自动重试 400、401、403、404 和 409。
- 每个会话每分钟最多 60 次读和 20 次写；超出返回 429，首版可先记录指标后再启用硬限流。
- 钉钉同步使用现有待办接口超时和幂等规则；协同 API 不等待批量钉钉操作完成。

## 可观测性

- 每次请求记录 request ID、路由、方法、会话用户 ID 的安全哈希、部门 ID、耗时、结果码、读取数量、写动作和幂等命中。
- 不记录事项描述、业务影响、完成结果、手机号、union ID 明文、Cookie、Token 或外部原始响应。
- 监控 401/403/409/5xx、D1 延迟、幂等命中率、平均待接收时长、阻塞时长和钉钉同步失败率。
- 活动记录承担业务审计；运行日志只承担技术定位，两者不能互相替代。

## 兼容与废弃

- 新接口不修改 `/api/platform`、`/api/state`、`/api/supply-chain` 或 `/api/data-center`。
- 现有 `appEvents` 和 `personalTodos` 保持可读；协同事项通过适配器和显式用户动作增量接入。
- v1 只允许新增可选字段和新查询视图；删除字段、改变状态含义或权限范围需要新版本。
- 若后续服务器自动从 App 事实生成事项，将新增受控内部摄取契约，不扩大当前浏览器写权限。

## 契约测试

1. 匿名 GET/POST 返回 401，不读取 D1。
2. 普通员工 GET 只能返回本人或本人部门参与事项，伪造部门参数返回 403。
3. 总经办 GET `view=executive` 返回符合升级规则的排序结果。
4. `readonly` 创建、修改、流转和归档全部返回 403。
5. 创建有效事项写入一条事项和一条 `create` 活动；服务端覆盖客户端发起身份。
6. 重复幂等键返回现有未关闭事项，不追加第二条记录。
7. 未知字段、错误人员、重复主责/协同部门、非法时间和超长证据返回 400。
8. 无权访问的单项 GET、PATCH 和活动 GET 返回同一 404，不泄露存在性。
9. 错误版本 PATCH 和状态流转返回 409 并包含当前版本摘要。
10. 每个允许状态动作成功追加一次活动；不允许动作不写事项和活动。
11. 相同动作幂等键重试返回原结果，不重复追加活动。
12. D1 未绑定返回 501；已存在表时建表逻辑保持幂等。
13. 归档后默认集合不返回，授权用户使用 `includeArchived=true` 可以读取。
14. 50 条分页的下一游标无重无漏；篡改或筛选不匹配的游标返回 400。
15. 错误响应始终包含稳定 code、中文 message、requestId 和 retryable，且不包含原始异常堆栈。
