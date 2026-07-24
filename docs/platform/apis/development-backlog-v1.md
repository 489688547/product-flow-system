# 研发待办 API v1

## 边界

- 路径前缀：`/api/platform/v1/development-backlog`
- 数据库：控制库 `PRODUCT_FLOW_DB`
- 展示数据策略：`development_backlog_items`、`development_backlog_events` 均为 `skip`
- 缓存：所有响应 `Cache-Control: private, no-store`
- API 不返回 AI 对话、Prompt、Provider 原始响应、凭据、Cookie、绝对路径或客户敏感信息。

研发待办不随正式/展示业务数据环境切换。展示模式不得回退读取正式控制库。

## 身份和权限

| 操作 | 已登录员工 | 非只读员工 | 总经办 |
| --- | --- | --- | --- |
| 列表、详情、事件 | 允许 | 允许 | 允许 |
| AI 草稿 | 允许 | 允许 | 允许 |
| 创建、编辑内容、调整优先级 | 不允许 | 不允许 | 允许 |
| 认领 | 不允许 | 允许 | 允许 |
| 更新开发状态 | 不允许 | 仅本人认领项 | 允许 |
| 验收、完成、取消、重开 | 不允许 | 不允许 | 允许 |

服务端从会话读取稳定用户 ID、姓名、部门和角色，不接受客户端提交操作者身份。

## 列表

```http
GET /api/platform/v1/development-backlog?status=ready&priority=p1&moduleId=data-center&ownerId=user-1&query=DEV-000123&page=1&pageSize=30
```

筛选：

- `status`：状态枚举
- `priority`：`p0`、`p1`、`p2`、`p3`
- `moduleId`：服务端登记模块
- `ownerId`：稳定用户 ID
- `query`：编号、标题或负责人
- `includeClosed`：是否包含完成/取消项
- `page`：从 1 开始
- `pageSize`：1–100，默认 30

页面选择筛选条件不调用本接口，只有点击“查询”或“刷新”才读取。

响应：

```json
{
  "synced": true,
  "items": [
    {
      "id": "1f...",
      "displayId": "DEV-000123",
      "title": "Chrome 扩展重载后自动接收任务",
      "moduleId": "data-acquisition",
      "moduleName": "数据采集",
      "priority": "p1",
      "status": "ready",
      "ownerUserId": null,
      "ownerName": null,
      "claimedBranch": null,
      "version": 1,
      "conflicts": []
    }
  ],
  "summary": {
    "clarification": 0,
    "ready": 1,
    "inProgress": 0,
    "review": 0,
    "blocked": 0
  },
  "pagination": {
    "page": 1,
    "pageSize": 30,
    "total": 1,
    "totalPages": 1
  }
}
```

## 详情

```http
GET /api/platform/v1/development-backlog/:id
```

返回完整结构化事项、当前安全冲突和只追加事件。事件包含动作、状态、变更字段名、安全证据摘要、操作者快照和时间。

## 创建

```http
POST /api/platform/v1/development-backlog
Content-Type: application/json

{
  "title": "Chrome 扩展重载后自动接收任务",
  "background": "扩展重载后恢复受控身份和任务领取。",
  "moduleId": "data-acquisition",
  "priority": "p1",
  "acceptanceCriteria": ["扩展重载后能自动领取任务"],
  "scopePaths": ["chrome-extension/company-data-collector/"],
  "dependencyIds": [],
  "sourceType": "manual"
}
```

只有总经办可调用。服务端生成 ID、`DEV-000123` 编号、状态、版本、操作者和时间。缺少验收标准或路径时状态为 `clarification`，否则为 `ready`。

## 编辑

```http
PATCH /api/platform/v1/development-backlog/:id
Content-Type: application/json

{
  "expectedVersion": 2,
  "patch": {
    "priority": "p0",
    "scopePaths": ["src/features/development-backlog/"]
  }
}
```

只有总经办可编辑需求内容。允许字段为标题、背景、模块、优先级、验收标准、影响路径和依赖。每次写入都要求 `expectedVersion`。

## 状态动作

```http
POST /api/platform/v1/development-backlog/:id/actions
Content-Type: application/json

{
  "action": "claim",
  "expectedVersion": 1,
  "branch": "codex/development-backlog"
}
```

动作：

- `claim`：`ready → in_progress`，要求安全 `codex/` 分支、明确路径且无活跃冲突。
- `release`：负责人或总经办释放为 `ready`。
- `submit_review`：`in_progress → review`，要求 `acceptanceEvidence`，可带 GitHub PR URL。
- `block`：要求 `blockedReason` 与 `resumeCondition`。
- `resume`：`blocked → in_progress`，无负责人时回 `ready`。
- `complete`：总经办执行 `review → completed`。
- `cancel`：总经办执行，要求原因。
- `reopen`：总经办执行 `completed/cancelled → ready`，要求原因。

认领会在写入前重新检查同模块和仓库相对路径。绝对路径、`..`、控制字符、正则和 glob 均被拒绝。v1 不提供强制忽略冲突。

## AI 草稿

```http
POST /api/platform/v1/development-backlog/ai-draft
Content-Type: application/json

{
  "description": "把 Chrome 扩展重载后自动接任务整理成待办"
}
```

服务端调用注册能力：

- `appId: company-platform`
- `featureId: development-backlog-draft`

响应只包含规范化草稿，不写研发待办表。最终创建必须由总经办通过标准创建接口确认。未配置错误不可重试，页面进入“数据中心 → AI 大模型”；超时、限流和临时不可用可原地重试。

## 并发和事件

- 所有更新使用 `expectedVersion` 和 D1 `WHERE id = ? AND version = ?`。
- 版本不一致返回 `409 BACKLOG_VERSION_CONFLICT`，客户端必须刷新，不自动覆盖。
- 成功写入同时追加 `development_backlog_events`；事件不更新、不删除。
- 事件只记录字段名和安全摘要，不记录旧秘密值或完整 AI 内容。

## 错误

- `AUTH_SESSION_REQUIRED`
- `BACKLOG_STORAGE_UNAVAILABLE`
- `BACKLOG_QUERY_FAILED`
- `BACKLOG_WRITE_FAILED`
- `BACKLOG_FORBIDDEN`
- `BACKLOG_NOT_FOUND`
- `BACKLOG_INPUT_INVALID`
- `BACKLOG_MODULE_NOT_REGISTERED`
- `BACKLOG_INVALID_TRANSITION`
- `BACKLOG_VERSION_CONFLICT`
- `BACKLOG_SCOPE_REQUIRED`
- `BACKLOG_SCOPE_INVALID`
- `BACKLOG_ACTIVE_CONFLICT`
- `BACKLOG_BRANCH_INVALID`
- `BACKLOG_ACCEPTANCE_EVIDENCE_REQUIRED`
- `BACKLOG_AI_DRAFT_INVALID`
- `AI_FEATURE_NOT_REGISTERED`
- `AI_DISABLED`
- `AI_PROVIDER_NOT_READY`
- `AI_PROVIDER_TIMEOUT`
- `AI_PROVIDER_RATE_LIMITED`
- `AI_PROVIDER_UNAVAILABLE`

错误响应只包含稳定错误码、安全中文摘要、request ID、retryable 和必要冲突元数据，不返回 SQL、堆栈或 Provider 内容。

## 兼容、迁移与回滚

- `migrations/0014_development_backlog.sql` 只新增两张控制表和索引。
- 列表分页，详情单独读取事件；索引覆盖状态/优先级、模块/状态、负责人/状态和事项事件时间。
- 回滚页面和 API 时保留表和事件，不自动删除公司内部路线图。
- 生产通过 GitHub `main` 的 Cloudflare GitOps 部署；Preview 和 Production 分别验证。
