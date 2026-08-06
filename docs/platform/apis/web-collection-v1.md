# 网页采集 API v1

## Purpose

`/api/platform/v1/web-collection` 是公司 Mac 网页采集器的控制面。它保存 Runner 健康状态、确定性任务、
阶段运行、资源游标、通知去重、版本化采集模板和实验运行。Provider 事实继续通过各自的受控 ingest API
入库；控制面不保存浏览器会话、Cookie、页面正文、本机绝对路径或数据库权限。

## Authentication and authorization

- `POST /runners` requires an active executive company session or the existing server-only production personal token resolved to an active executive identity.
- The runner token is returned once, stored only in macOS Keychain and sent as `Authorization: Bearer`. D1 stores only SHA-256.
- Runner actions on `POST /jobs` require an active `company_web_collection` runner token.
- User action `POST /jobs` with `action=trigger` requires an active non-readonly company session in 总经办、数据中心 or 运营.
- User action `POST /jobs` with `action=register_store` requires an active executive session and an existing active company runner. The server selects that runner; the browser cannot submit a runner ID.
- `GET /jobs` requires a company session in 总经办、数据中心、运营、供应链 or 财务.
- Every route requires the formal control database. Job creation persists the server-resolved target environment and version; browser requests and runners cannot submit a binding or database ID.
- `GET /templates`、`GET /templates/:id` 和 `GET /runs/:id` 使用公司会话；可查看部门沿用网页采集查看权限。
- 模板创建、改版和发布只允许总经办、数据管理员或数据中心部门。
- `POST /runs` 使用网页采集触发权限；实验模式还必须由服务端
  `COLLECTOR_EXPERIMENTAL_MODE=1` 显式开启。
- Runner 使用原有 `company_web_collection` Bearer Token 读取分配给本设备的实验执行包，并提交
  `start`、`wait_human`、`resume`、`complete`、`fail` 或 `cancel`。

## 模板与实验运行端点

| 方法 | 路径 | 调用方 | 用途 |
| --- | --- | --- | --- |
| `GET` | `/templates` | 公司会话 | 读取安全模板摘要 |
| `POST` | `/templates` | 总经办/数据管理员 | 创建版本 1 草稿 |
| `GET` | `/templates/:id` | 公司会话 | 读取模板及全部不可变版本 |
| `POST` | `/templates/:id/versions` | 总经办/数据管理员 | 基于当前版本创建新草稿 |
| `POST` | `/templates/:id/publish` | 总经办/数据管理员 | 发布不含自由脚本的正式版本 |
| `POST` | `/runs` | 有触发权限的公司会话 | 为指定 Runner 创建实验运行 |
| `GET` | `/runs` | Runner Bearer Token | 读取本设备待执行的签名执行包 |
| `GET` | `/runs/:id` | 公司会话 | 读取安全运行状态 |
| `POST` | `/runs/:id/actions` | Runner Bearer Token | 推进运行状态 |

所有写请求必须带 `Idempotency-Key`，长度 8–160 且不得包含空白。模板改版、发布和运行动作同时携带
`expectedVersion`。同一幂等键换请求内容返回 `COLLECTOR_IDEMPOTENCY_CONFLICT`；版本已变化返回对应
`*_VERSION_CONFLICT`，不会静默覆盖。

### 实测示例：创建实验模板

以下请求和响应来自 `tests/collector-template-api.test.mjs` 对当前路由的本地契约测试。日期、操作者和
`requestId` 在真实请求中由服务端生成；示例不代表该能力已经部署到生产。

```http
POST /api/platform/v1/web-collection/templates
Content-Type: application/json
Idempotency-Key: template-create-1
Cookie: <company-session>
```

```json
{
  "template": {
    "templateId": "kuaimai-inventory-research",
    "version": 1,
    "mode": "experimental",
    "providerId": "kuaimai",
    "profileId": "kuaimai-main",
    "timeoutSeconds": 600,
    "limits": {
      "maxOutputBytes": 1048576,
      "maxChildProcesses": 2,
      "maxLoopIterations": 20,
      "maxFiles": 10
    },
    "steps": [
      {
        "id": "open",
        "type": "browser.open",
        "url": "https://erp.superboss.cc/index.html#/stock/warehouse_status/"
      },
      {
        "id": "inspect",
        "type": "browser.javascript",
        "code": "return { ready: true };"
      }
    ],
    "status": "draft"
  }
}
```

`201 Created`

```json
{
  "data": {
    "template": {
      "templateId": "kuaimai-inventory-research",
      "currentVersion": 1,
      "mode": "experimental",
      "providerId": "kuaimai",
      "profileId": "kuaimai-main",
      "status": "draft",
      "createdAt": "2026-07-30T10:00:00.000Z",
      "createdBy": "数据管理员",
      "updatedAt": "2026-07-30T10:00:00.000Z",
      "updatedBy": "数据管理员"
    },
    "version": {
      "templateId": "kuaimai-inventory-research",
      "version": 1,
      "contentHash": "68a96174cf6273c6590ecbcb31308a43ea5cc8c5781bde552765d0bed2eece54",
      "template": {
        "templateId": "kuaimai-inventory-research",
        "version": 1,
        "mode": "experimental",
        "providerId": "kuaimai",
        "profileId": "kuaimai-main",
        "timeoutSeconds": 600,
        "limits": {
          "maxOutputBytes": 1048576,
          "maxChildProcesses": 2,
          "maxLoopIterations": 20,
          "maxFiles": 10
        },
        "steps": [
          {
            "id": "open",
            "type": "browser.open",
            "url": "https://erp.superboss.cc/index.html#/stock/warehouse_status/"
          },
          {
            "id": "inspect",
            "type": "browser.javascript",
            "code": "return { ready: true };"
          }
        ],
        "status": "draft"
      },
      "status": "draft",
      "publishedAt": null,
      "createdAt": "2026-07-30T10:00:00.000Z",
      "createdBy": "数据管理员"
    },
    "idempotentReplay": false
  },
  "meta": {
    "requestId": "942c530f-3739-46f4-b4f0-c49914ed647a",
    "updatedAt": "2026-07-30T10:00:00.000Z",
    "version": 1
  }
}
```

相同幂等键和相同请求重放返回 `200` 且 `idempotentReplay=true`。同一键修改
`timeoutSeconds` 后重放返回：

```json
{
  "error": {
    "code": "COLLECTOR_IDEMPOTENCY_CONFLICT",
    "message": "幂等键对应的采集模板请求内容不同。",
    "requestId": "afe880eb-58ab-48c0-90a7-b77b519b9e8f",
    "retryable": false
  }
}
```

### 实测示例：改版与发布

```http
POST /api/platform/v1/web-collection/templates/kuaimai-inventory-research/versions
Content-Type: application/json
Idempotency-Key: template-version-2
Cookie: <company-session>
```

```json
{
  "expectedVersion": 1,
  "patch": {
    "timeoutSeconds": 900
  }
}
```

成功返回 `201`，`template.currentVersion=2`，新版本状态为 `draft`。发布使用：

```http
POST /api/platform/v1/web-collection/templates/kuaimai-inventory-research/publish
Content-Type: application/json
Idempotency-Key: template-publish-2
Cookie: <company-session>
```

```json
{
  "expectedVersion": 2
}
```

`experimental` 模板或仍包含 `browser.javascript`、`local.python`、`local.command` 的版本返回
`COLLECTOR_TEMPLATE_PROMOTION_REQUIRED`。只有通过正式模板校验的版本可发布。已发布版本用另一个幂等键
重复发布返回 `COLLECTOR_TEMPLATE_STATE_CONFLICT`。

### 实测示例：创建并领取实验运行

公司会话创建运行：

```http
POST /api/platform/v1/web-collection/runs
Content-Type: application/json
Idempotency-Key: run-create-1
Cookie: <company-session>
```

```json
{
  "templateId": "kuaimai-inventory-research",
  "templateVersion": 1,
  "runnerId": "web-runner-example-1"
}
```

服务端从当前数据环境解析 `targetEnvironment` 与版本，客户端不能提交数据库 ID 或 binding。Runner 随后
使用设备 Token 领取：

```http
GET /api/platform/v1/web-collection/runs
Authorization: Bearer <company-web-collection-runner-token>
```

`200 OK`

```json
{
  "data": {
    "runs": [
      {
        "run": {
          "id": "collector-run-example-1",
          "templateId": "kuaimai-inventory-research",
          "templateVersion": 1,
          "contentHash": "68a96174cf6273c6590ecbcb31308a43ea5cc8c5781bde552765d0bed2eece54",
          "runnerId": "web-runner-example-1",
          "status": "queued",
          "trustLevel": "untrusted",
          "quality": {},
          "version": 1,
          "targetEnvironment": "production",
          "targetEnvironmentVersion": 1,
          "expiresAt": "2026-07-30T10:15:00.000Z",
          "createdAt": "2026-07-30T10:00:00.000Z",
          "createdBy": "负责人",
          "updatedAt": "2026-07-30T10:00:00.000Z",
          "completedAt": null
        },
        "executionBundle": {
          "runId": "collector-run-example-1",
          "runnerId": "web-runner-example-1",
          "templateId": "kuaimai-inventory-research",
          "version": 1,
          "contentHash": "68a96174cf6273c6590ecbcb31308a43ea5cc8c5781bde552765d0bed2eece54",
          "expiresAt": "2026-07-30T10:15:00.000Z",
          "targetEnvironment": "production",
          "targetEnvironmentVersion": 1,
          "template": {
            "templateId": "kuaimai-inventory-research",
            "version": 1,
            "mode": "experimental",
            "providerId": "kuaimai",
            "profileId": "kuaimai-main",
            "timeoutSeconds": 600,
            "limits": {
              "maxOutputBytes": 1048576,
              "maxChildProcesses": 2,
              "maxLoopIterations": 20,
              "maxFiles": 10
            },
            "steps": [
              {
                "id": "open",
                "type": "browser.open",
                "url": "https://erp.superboss.cc/index.html#/stock/warehouse_status/"
              },
              {
                "id": "inspect",
                "type": "browser.javascript",
                "code": "return { ready: true };"
              }
            ],
            "status": "draft"
          },
          "signature": "54e2411784efc5ccb2d8343f6eccf982b6cb6eecd6bb886e04f30be4aad04735"
        }
      }
    ]
  },
  "meta": {
    "requestId": "69898d7f-e667-4f33-a156-ea8c7f2a4575",
    "updatedAt": "2026-07-30T10:00:00.000Z",
    "version": 1
  }
}
```

签名使用 Runner Token 哈希派生的 HMAC-SHA256 密钥，覆盖运行、Runner、模板版本、内容哈希、有效期和
目标环境。公司 Mac 在执行前重新计算模板内容哈希并验证签名；篡改任一字段返回
`COLLECTOR_EXECUTION_SIGNATURE_INVALID` 或 `COLLECTOR_TEMPLATE_HASH_MISMATCH`。

### 实测示例：人工验证与完成

登录、短信、扫码、滑块或设备验证不能记录为失败：

```http
POST /api/platform/v1/web-collection/runs/collector-run-example-1/actions
Authorization: Bearer <company-web-collection-runner-token>
Content-Type: application/json
Idempotency-Key: run-human-wait-1
```

```json
{
  "action": "wait_human",
  "expectedVersion": 2,
  "errorCode": "KUAIMAI_LOGIN_REQUIRED",
  "safeSummary": "请在公司 Mac 登录快麦。"
}
```

响应中的 `run.status` 为 `waiting_human`、`trustLevel` 为 `untrusted`。用户处理后，Runner 使用
`{"action":"resume","expectedVersion":3}` 恢复为 `running`。完成请求为：

```json
{
  "action": "complete",
  "expectedVersion": 4,
  "quality": {
    "requiredFieldsComplete": true,
    "storeMatched": true,
    "businessDateMatched": true,
    "schemaMatched": true,
    "coverage": 1
  }
}
```

实验运行最多只能变为 `validated`，即使请求额外提交 `requestedTrustLevel=trusted` 也不会提升；
实验 API 不调用正式事实 writer。`quality` 只接受示例中的 5 个登记字段，布尔字段必须为
boolean，`coverage` 必须在 0–1；任意输出、页面正文或扩展字段会被拒绝。取消使用
`{"action":"cancel","expectedVersion":4}` 并进入 `cancelled`，历史事件不删除。

## Provider and task contract

The server accepts only code-registered provider and resource IDs. Kuaimai schedules `orders`, `order_items` and `sales_items`; Douyin schedules `store_daily`, `product_daily`, `live_daily` and `video_daily` once per connected `web_collection_stores.store_id`. An executive may register multiple Douyin stores from 数据接入 using only `storeId` and `storeName`; `(providerId, storeId)` is unique and submitting the same ID updates its name. The bridge and runner accept exactly `providerId`, stable `storeId` and `storeName`. The server, not the runner, resolves that store directory. Formal Douyin execution maps the stable ID to deterministic Ego Task Space `EC 抖音 <storeId>` and confirms the same ID on the fixed qualification page before opening a resource. Kuaimai remains on the paired MV3 extension; the bridge withholds every Douyin job in `ego` mode. A plan item contains `providerId`, stable `storeId`, `resourceType`, `businessDate`, `rangeKind`, an optional fixed Shanghai-time range, `scheduleVersion`, `selectorVersion` and the derived `idempotencyKey`. Requests containing a URL, origin, selector, script, credentials, cookie, token, Task Space ID or page body field are rejected.

`captured` 结果仅允许 `store_daily` 的固定原子对象或 `product_daily` 的非空商品数组。商品数组每行必须
包含唯一稳定 `productId` 以及完整标准字段集合；接口没有提供的字段使用 `null`。Bridge 最大接收 2 MiB，
本机 processor 按 200 行分块写入标准事实 API，只有最终空结案块声明 `complete=true` 和
`expectedCount`。任何空数组、重复商品、敏感字段、未知字段或不完整分页都在写入前失败。

Runner actions are:

- `heartbeat`: update runner version, safe local executor status, current job and last-seen time.
- `ensure_registered_plan`: after 05:00 Asia/Shanghai, generate yesterday's fixed Kuaimai tasks and four Douyin tasks for every connected store. The request accepts no store, URL, resource or database target.
- `ensure_plan`: idempotently create 1–100 deterministic jobs.
- `claim`: lease one queued or expired-lease job for 60–900 seconds. Kuaimai work may be claimed without a store identity; Douyin work is returned only to the `ego` executor whose assigned stable `storeId` matches the job.
- `transition`: perform one legal state transition with safe stage and error summary.
- `complete`: atomically append the success run, mark the job successful and upsert its resource cursor.
- `record_notification`: persist one deduplicated macOS notification result.

User action is:

- `register_store`: add or rename one Douyin store in the server-owned directory. It accepts only `providerId=douyin-ecommerce`, stable `storeId` and `storeName`.
- `trigger`: enqueue a fixed Kuaimai daily job or one of the four registered Douyin daily resources for an already selected stable store and `businessDate`. `force=false` is idempotent and never resets an existing job. `force=true` may requeue `waiting_human`, `failed`, `schema_changed` or `success` after the user confirms login; queued or running work is not duplicated. The request cannot select a URL, selector, credential or arbitrary resource.

## States, leases and idempotency

States are `queued`, `claimed`, `opening`, `collecting`, `waiting_human`, `exporting`, `downloading`, `validating`, `ingesting`, `success`, `failed` and `schema_changed`. `collecting` is used only for a fixed safe page read; official files use `exporting` and `downloading`. Only the owning runner can change a claimed job. A lease expires after at most 15 minutes; the next runner cycle may reclaim it. Job idempotency includes `providerId:storeId:resourceType:businessDate:scheduleVersion` plus the server-owned target environment and version. Only `complete` from `ingesting` advances `(providerId, storeId, resourceType)` cursor. Provider facts are projected to the persisted target business database; a stale display version is rejected.

Ego keeps local `0600` checkpoints for opening, download, archive, parse, upload and completion. A `waiting_human`
server result retains only the same-job error code and deterministic Task Space name locally; it never stores Cookie,
page body or Task Space ID. A forced requeue of that exact job may consume the marker once and claim the handed-off
space. A downloaded checkpoint resumes parsing/upload without repeating browser work. Before Aliyun cutover, the
local-only `probe-ego` command may stop at `pending_upload`; it does not claim, transition or complete a production job.

Formal `serve/install --browser-mode ego` accepts only `https://deshan-tiyes.cn`. The Ego path uploads facts only
through the Aliyun ECS API, and success requires the SQLite transaction response with batch ID, accepted row count
and validation summary. Cloudflare Pages/D1 is rollback-only for this path: no dual write and no fallback write.

## Responses

Responses use `{ data, meta }` and `cache-control: no-store`. The list response contains safe runner, job, cursor and notification fields. It excludes runner-token hashes, absolute paths, URLs, selectors, page bodies and file contents.

## Errors

- `WEB_COLLECTION_STORAGE_UNAVAILABLE`: the selected control storage or table is unavailable, retryable.
- `WEB_COLLECTION_RUNNER_TOKEN_REQUIRED` / `WEB_COLLECTION_RUNNER_TOKEN_INVALID`: missing or invalid Keychain token.
- `WEB_COLLECTION_RUNNER_REQUIRED`: a user tried to add a store before the company collector was registered.
- `WEB_COLLECTION_RUNNER_REGISTER_DENIED` / `WEB_COLLECTION_VIEW_DENIED`: authorization failure.
- `WEB_COLLECTION_STORE_INVALID`: stable store identity or assigned executor scope is invalid.
- `WEB_COLLECTION_TRIGGER_DENIED`: the company session cannot enqueue or retry collection.
- `WEB_COLLECTION_TRIGGER_INVALID`: the requested provider, resource or business date is outside the fixed user-trigger contract.
- `WEB_COLLECTION_JOB_INVALID`: provider, resource, date, range, key or forbidden instruction field is invalid.
- `WEB_COLLECTION_BUSINESS_DATE_MISMATCH`: the downloaded file's parsed first or last business date differs from the job date; the file is not ingested and the cursor does not advance.
- `DOUYIN_API_EMPTY_DATA` / `DOUYIN_PRODUCT_ID_MISSING`: 商品接口为空或缺少稳定商品 ID，不写入。
- `DOUYIN_PRODUCT_DUPLICATE` / `DOUYIN_PRODUCT_PAGE_INCOMPLETE` / `DOUYIN_PRODUCT_PAGE_CHANGED`: 商品分页重复、不完整或采集中总数变化，不写入。
- `EGO_UNAVAILABLE`: Ego runtime or required helper is unavailable; retry only after Ego is restored.
- `EGO_TASK_SPACE_USER_CONTROLLED`: the deterministic store space is controlled by a human; wait for explicit same-job confirmation.
- `EGO_DOWNLOAD_CAPABILITY_UNAVAILABLE`: Ego cannot guarantee the controlled download directory; fail closed without Chrome fallback.
- `DOUYIN_PAGE_LOAD_TIMEOUT`: the registered Douyin page did not become stable before the bounded timeout.
- `EGO_FORMAL_TARGET_NOT_ALIYUN`: formal Ego service points anywhere except the registered Aliyun HTTPS origin.
- `WEB_COLLECTION_JOB_NOT_FOUND` / `WEB_COLLECTION_JOB_OWNER_MISMATCH`: missing or wrong runner job.
- `WEB_COLLECTION_STATE_CONFLICT` / `WEB_COLLECTION_TRANSITION_INVALID`: stale or illegal state update.
- `WEB_COLLECTION_RUN_INVALID` / `WEB_COLLECTION_NOTIFICATION_INVALID`: invalid completion or notification metadata.
- `COLLECTOR_EXPERIMENT_DISABLED`: server-side experimental mode is not explicitly enabled.
- `COLLECTOR_TEMPLATE_ACTION_DENIED`: current company identity cannot create, edit or publish templates.
- `COLLECTOR_TEMPLATE_NOT_FOUND` / `COLLECTOR_TEMPLATE_VERSION_NOT_FOUND`: template or immutable version is missing.
- `COLLECTOR_TEMPLATE_VERSION_CONFLICT` / `COLLECTOR_TEMPLATE_STATE_CONFLICT`: optimistic version or state is stale.
- `COLLECTOR_TEMPLATE_PROMOTION_REQUIRED`: an experimental/free-execution template cannot be published.
- `COLLECTOR_IDEMPOTENCY_KEY_REQUIRED` / `COLLECTOR_IDEMPOTENCY_CONFLICT`: missing key or changed replay content.
- `COLLECTOR_EXECUTION_SIGNATURE_INVALID` / `COLLECTOR_TEMPLATE_HASH_MISMATCH`: signed bundle was changed.
- `COLLECTOR_RUN_VERSION_CONFLICT` / `COLLECTOR_RUN_STATE_CONFLICT`: run action is stale or illegal.
- `COLLECTOR_RUN_RUNNER_MISMATCH`: a Runner attempted to change another device's run.
- `COLLECTOR_RUN_QUALITY_INVALID`: completion quality contains an unknown field or invalid boolean/coverage value.

## Compatibility, capacity and rollback

This is an additive v1 API. New providers add code adapters and registered resource IDs without changing the shared task schema. Kuaimai keeps its MV3/D1 compatibility path. Douyin uses Ego only and treats the Aliyun ECS/SQLite runtime as its sole formal destination; Cloudflare remains a rollback boundary and receives no Ego facts. Binary exports remain in the local archive. Before cutover, rollback means leaving the existing production collector unchanged. After cutover, rollback stops ECS writes and restores the prior read-only boundary; SQLite and D1 increments are never auto-merged. Disabling a provider retains jobs, runs, cursors, notifications and last trusted facts for audit; the existing Kuaimai file scanner remains available.

## Observability and contract tests

Record Runner ID, provider, resource, business date, task stage, attempt, template ID/version/hash, run version,
trust level, safe error code, batch/archive ID, row count and timestamps. Never log raw page, source rows, scripts,
command output, Token hashes or signatures. Contract coverage lives in
`tests/web-collection-schedule.test.mjs`, `tests/web-collection-migration.test.mjs`,
`tests/web-collection-api.test.mjs`, `tests/collector-template-domain.test.mjs`,
`tests/collector-template-migration.test.mjs`, `tests/collector-template-api.test.mjs` and
`tests/web-data-collector-api.test.mjs`.
