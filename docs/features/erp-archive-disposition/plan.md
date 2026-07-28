# ERP 归档入库决策实施计划

## 目标

交付可迁移、可授权、可测试的 ERP 归档入库决策，并让超过 24 小时的 `processing` 自动形成真实故障终态。

## 架构方案

沿用 `/api/platform/v1/erp-collection/archives` 和 `erp_file_archives`，不建立第二套归档服务。
运行状态与入库决策分别建模：storage 负责超时恢复和乐观锁写入，domain 负责安全归一化，state
负责客户端调用，feature 只组合 UI。

## 文件职责

- `migrations/0017_erp_archive_disposition.sql`：增加决策、操作人、时间和版本列。
- `src/domain/kuaimaiErpCollection.js`：归一化新增安全字段。
- `functions/api/platform/v1/erp-collection/_shared/storage.js`：超时更新、决策写入和清单读取。
- `functions/api/platform/v1/erp-collection/archives.js`：GET/POST/PATCH 方法、授权和错误契约。
- `src/domain/localArchive.js`：归档分组、标签、原因和告警判定。
- `src/state/erpCollectionApi.js`：读取和决策 PATCH 客户端。
- `src/features/data-center/LocalArchivePanel.jsx`：分流展示与决策控件。
- `src/features/data-center/DataGovernanceWorkspaces.jsx`：保存后刷新和重试入口定位。
- `src/styles.css`：局部响应式样式。
- 平台文档、环境清单和测试：持久化契约与回归证据。

## 接口与契约

`PATCH /api/platform/v1/erp-collection/archives`

```json
{
  "archiveId": "kuaimai-archive-...",
  "expectedVersion": 1,
  "ingestionDecision": "skipped",
  "ingestionReasonCode": "DETAIL_STORAGE_DEFERRED"
}
```

撤销时发送 `ingestionDecision: "pending"` 且不发送原因。响应返回更新后的安全归档对象。GET 在查询前
执行一次有界超时更新，返回 `ingestionDecision`、原因、决定人、决定时间和版本。

错误包括：`ERP_COLLECTION_ARCHIVE_NOT_FOUND`、
`ERP_COLLECTION_ARCHIVE_DECISION_INVALID`、`ERP_COLLECTION_ARCHIVE_REASON_INVALID`、
`ERP_COLLECTION_ARCHIVE_STATE_CONFLICT`、`ERP_COLLECTION_ARCHIVE_VERSION_CONFLICT`、
`ERP_COLLECTION_ARCHIVE_PROCESSING_TIMEOUT`。

## 数据迁移

向现有表增加：

- `ingestion_decision TEXT NOT NULL DEFAULT 'pending'`
- `ingestion_reason_code TEXT`
- `decision_at TEXT`
- `decision_by TEXT`
- `version INTEGER NOT NULL DEFAULT 1`

不新增表，容量为每行少量元数据。旧记录继续可读并默认待决策。展示数据 catalog 继续对
`erp_file_archives` 使用 `skip`。迁移不包含生产记录回填；发布后按报告确认的精确 ID 通过 PATCH
分别记录 `DETAIL_STORAGE_DEFERRED` 与 `TIME_BASIS_MISSING`。

## 风险与回滚

- 风险：代码先于迁移上线导致列缺失。控制：迁移先行，生产 readiness 检查列和 GET。
- 风险：把运行故障标为跳过。控制：只允许 `archived` 决策，其他状态 409。
- 风险：误回填历史记录。控制：不按文件名批量 SQL；仅精确 ID、正式接口、逐条结果核对。
- 回滚：回滚应用提交；新增列保留。决策数据可通过正式 PATCH 撤销，不删除文件和事实。

## 验证命令

```bash
node --test tests/kuaimai-erp-local-archive-api.test.mjs tests/kuaimai-erp-collection-migration.test.mjs
node --test react-tests/local-archive-grouping.test.mjs react-tests/data-center-archive-status.test.mjs
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
npx wrangler pages functions build
npm run check:branch-base
```

UI 需在 sandbox 或无生产写入的本地夹具下检查 1280px、390px、键盘、权限、保存错误和空状态。
生产验收在迁移和 GitOps 部署后执行，不在本开发分支直接写生产。

## 任务顺序

1. 迁移与领域契约红绿测试。
2. storage/API 超时和决策写入红绿测试。
3. 客户端与页面分组红绿测试。
4. 文档、环境清单和完整门禁。
5. 发布后迁移、精确历史决策回填和真实会话验收。
