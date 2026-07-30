# 采集器双模式执行实施计划

## 目标

在不改变现有快麦和抖店正式采集行为的前提下，交付版本化模板、实验执行器、本机可信隔离和可迁往
阿里云的统一 HTTP/存储契约。

## 架构方案

扩展现有 `web-collection` 控制面和公司 Mac Runner。领域层定义模板、步骤、版本、执行包和信任等级；
本机执行层负责浏览器 JavaScript、Python、系统命令、流程控制、本机 SQLite 和检查点；服务端负责
权限、模板版本、签名、租约、运行记录和正式事实边界。现有 Provider 适配器继续作为 `formal`
兼容路径。

首期先交付领域协议、本机执行器和内存/本机契约测试，再接服务端持久化。阿里云 ECS、数据库和 OSS
生产迁移由 `DEV-000014` 负责；本功能只提供业务中立存储接口和同一套契约测试，不修改其部署文件。

## 文件职责

- `src/domain/collectorTemplates.js`：模板、步骤、版本、信任等级和执行包纯规则。
- `scripts/web-data-collector/experimental/`：JavaScript、Python、命令、流程和本机 SQLite 执行器。
- `scripts/web-data-collector/checkpoints.mjs`：扩展模板版本、内容哈希和安全变量检查点。
- `scripts/web-data-collector/orchestrator.mjs`：按 `formal/experimental` 路由且保持旧任务兼容。
- `functions/api/platform/v1/web-collection/templates.js`：模板列表、创建、改版和发布。
- `functions/api/platform/v1/web-collection/runs.js`：实验运行创建、读取和动作。
- `functions/api/platform/v1/web-collection/_shared/templateStorage.js`：模板、运行和事件的 Cloudflare D1 实现。
- `migrations/0018_collector_templates.sql`：模板、版本、运行和步骤事件表。
- `docs/platform/apis/web-collection-v1.md`：认证、权限、请求、响应、错误、兼容和观测契约。
- `docs/platform/data-acquisition.md`：正式/实验双模式和阿里云可移植长期规则。

## 接口与契约

### 领域接口

```text
normalizeCollectorTemplate(input) -> CollectorTemplate
createTemplateVersion(current, patch, actor) -> CollectorTemplate
verifyExecutionBundle(bundle, now) -> VerifiedExecutionBundle
canProduceTrustLevel(template, quality) -> untrusted | validated | trusted
```

### 本机接口

```text
executeExperimentalRun({ bundle, browser, workspace, checkpointStore, eventSink })
  -> { runId, status, trustLevel, outputs, artifactHashes, quality }
```

### 服务端接口

```text
GET    /api/platform/v1/web-collection/templates
POST   /api/platform/v1/web-collection/templates
POST   /api/platform/v1/web-collection/templates/:id/versions
POST   /api/platform/v1/web-collection/templates/:id/publish
POST   /api/platform/v1/web-collection/runs
GET    /api/platform/v1/web-collection/runs/:id
POST   /api/platform/v1/web-collection/runs/:id/actions
```

模板写操作要求公司会话、服务端角色校验、`Idempotency-Key` 和乐观版本；运行创建要求有触发权限的
公司会话，运行状态动作要求所属 Runner Token。Runner 领取接口返回绑定 Runner、模板版本、内容哈希、
目标环境版本、有效期和运行 ID 的 HMAC 签名执行包。

## 数据迁移

`0018_collector_templates.sql` 新增模板当前记录、不可变版本、运行、步骤事件四类表，不修改现有
`web_collection_jobs` 和正式事实表。表的展示数据策略为 `skip`；实验脚本、输出和本机文件不复制
到展示数据库。

旧任务没有 `template_id` 时继续按现有 Provider 适配器执行。新表迁移失败时回滚 Functions 版本并
保持实验开关关闭；旁路表可保留，不影响旧采集。

阿里云存储实现必须复用同一存储接口和契约测试。迁移数据、切换域名、Runner 重新注册和 OSS 生命周期
由 `DEV-000014` 单独执行。

## 风险与回滚

- 自由脚本误执行：服务端权限、签名执行包、本机专用用户、固定工作区和资源上限共同限制。
- 实验数据污染正式事实：实验执行器不持有事实 writer，服务端拒绝 `untrusted/validated` 直接入库。
- 旧采集回归：实验开关默认关闭；无模板任务继续走原 Provider 路径。
- Runner 重启丢进度：检查点绑定模板版本和内容哈希，恢复前重新取得同一运行租约。
- 阿里云迁移时协议漂移：Cloudflare 和阿里云实现必须运行同一 HTTP、存储和错误码契约测试。

## 验证命令

```bash
node --test tests/collector-template-domain.test.mjs
node --test tests/web-data-collector-experimental.test.mjs
node --test tests/web-data-collector-checkpoints.test.mjs
node --test tests/web-collection-api.test.mjs
npm run test:web-collector
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
npx wrangler pages functions build
```

真实验收分开记录：本机非敏感页面实验、现有正式 Provider 回归、Cloudflare 当前控制面、阿里云迁移后
控制面各自验收，不互相替代。

## 任务顺序

1. 领域模板、版本、信任等级和执行包规则。
2. 本机实验步骤、资源限制、SQLite 和检查点。
3. 服务端模板/运行 API、D1 迁移、权限、幂等和审计。
4. 现有任务兼容、正式/实验路由和同步状态。
5. 阿里云存储适配契约、长期文档和完整验收。
