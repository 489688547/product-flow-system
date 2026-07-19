# 公司 AI 总助实施计划

## 目标

交付一个面向全公司的只读 AI 总助：通过服务端权限与数据目录跨 App 分析，首期接入灵算 Responses Provider，并在数据中心管理安全配置和外发策略。

## 架构方案

采用“公司数据能力目录 → 权限与外发策略 → 上下文压缩 → Provider 中立 AI 网关 → SSE 总助 UI”的单向依赖。各业务 App 不直接调用模型；Provider 密钥只存在服务端 Secret，浏览器不提交业务数据。首期保持模块化单体，新增内部 `/api/platform/v1/ai/*`，不提前声明对外平台 API。

平台能力判断：

- AI Provider 适配和上下文编排：`抽取共享能力`，供总助和后续业务 App AI 分析复用。
- 总助面板与工作台：`局部保留` 在 `src/features/ai-assistant`。
- Provider 设置：`扩展现有能力`，进入数据中心“数据服务”。
- 基础 Button、ConfirmDialog、DataTable 和 Markdown：`复用现有能力`。

## 文件职责

### 文档与平台登记

- `docs/features/company-ai-assistant/*`：产品、设计、计划和任务事实源。
- `docs/platform/integration-registry.json`：登记灵算 Provider、域名、环境变量、代码路径和 Cloudflare 关系；实现验证前为 `integrating`，完成后按证据更新状态。
- `docs/platform/api-catalog.md`：记录 `/api/platform/v1/ai/status`、`/api/platform/v1/ai/provider`、`/api/platform/v1/ai/provider/test`、`/api/platform/v1/ai/chat` 契约。
- `docs/platform/integrations.md`：记录 Provider 密钥、数据外发和无留存审核边界。
- `docs/platform/error-codes.md`：新增 AI 错误码。
- `docs/product/roles-and-permissions.md`：增加 AI 数据域权限与 Provider 外发策略。
- `docs/decisions/`：记录“Provider 中立网关 + 财务默认不外发”的架构决策。

### 领域与状态

- `src/domain/aiAssistant.js`：纯数据域、权限、外发策略、上下文元数据和前端会话归一化。
- `src/state/aiAssistantApi.js`：读取状态、Provider 配置和解析 SSE，不包含 UI。
- `src/state/AiAssistantProvider.jsx`：面板、sessionStorage 会话、中止和错误编排。
- `src/domain/dataCenter.js`：扩展 AI Provider 安全元数据和 AI 数据策略集合；继续移除凭据类字段。
- `src/state/DataCenterProvider.jsx`：保持数据中心元数据同步，不接触 Provider Secret。

### 服务端

- `functions/api/platform/v1/ai/_shared/provider-config.js`：合并注册表、D1 安全元数据和服务端 Secret，输出脱敏状态。
- `functions/api/platform/v1/ai/_shared/responses-adapter.js`：固定白名单 URL，发送 `store:false` 与流式请求，映射 Provider 错误。
- `functions/api/platform/v1/ai/_shared/data-policy.js`：根据会话、AI 数据策略和 Provider 外发策略计算允许/阻止域。
- `functions/api/platform/v1/ai/_shared/context-catalog.js`：登记公司战略、项目、产品、供应链、经营、销售、数据质量和财务只读提供器。
- `functions/api/platform/v1/ai/_shared/context-builders/`：按现有存储边界读取并压缩各数据域，不复制业务持久化。
- `functions/api/platform/v1/ai/_shared/audit.js`：创建 D1 审计表并保存无内容元数据。
- `functions/api/platform/v1/ai/status.js`：所有已登录员工读取脱敏服务状态和自身可用域。
- `functions/api/platform/v1/ai/provider.js`：总经办读取和更新安全元数据，其他用户只读脱敏状态。
- `functions/api/platform/v1/ai/provider/test.js`：总经办使用合成数据测试 Provider。
- `functions/api/platform/v1/ai/chat.js`：校验消息、读取可信上下文、调用网关并代理 SSE。
- `functions/api/_middleware.js`：沿用公司会话认证，不新增公开 AI 路径。
- `server.mjs`：本地状态/聊天兼容；未配置密钥时明确降级，外部 Provider 请求默认关闭。

### UI

- `src/features/ai-assistant/AiAssistantTrigger.jsx`：顶部栏入口。
- `src/features/ai-assistant/AiAssistantPanel.jsx`：侧栏/全屏容器和焦点控制。
- `src/features/ai-assistant/AiConversation.jsx`：消息、来源、限制和错误恢复。
- `src/features/ai-assistant/AiComposer.jsx`：输入、发送和停止。
- `src/features/ai-assistant/AiAssistantWorkspace.jsx`：完整工作台。
- `src/features/data-center/AiProviderSettings.jsx`：Provider、安全状态、连接测试与外发策略。
- `src/features/data-center/DataGovernanceWorkspaces.jsx`：在数据服务装配 Provider 设置。
- `src/App.jsx`：顶部入口、隐藏工作台路由和面板装配。
- `src/main.jsx`：挂载 `AiAssistantProvider`。
- `src/styles.css`：面板、工作台、消息、Provider 设置和响应式规则。

### 测试

- `react-tests/ai-assistant-domain.test.mjs`：权限、财务阻止、会话和来源归一化。
- `react-tests/ai-assistant-ui.test.mjs`：入口、面板、工作台、状态和无障碍结构。
- `react-tests/ai-assistant-api.test.mjs`：前端 API 与 SSE 解析。
- `react-tests/data-center-ai-provider.test.mjs`：Provider 设置和只读状态。
- `tests/ai-provider.test.mjs`：白名单、密钥、`store:false`、模型、超时和 Provider 错误。
- `tests/ai-context-policy.test.mjs`：服务端用户权限、外发策略、脱敏和上下文限额。
- `tests/ai-api.test.mjs`：认证、输入、并发、状态、测试连接、SSE 和审计。

## 接口与契约

### `GET /api/platform/v1/ai/status`

返回功能开关、脱敏 Provider 状态、当前用户可用/被阻止数据域和数据新鲜度；不返回密钥、密钥尾号、内部 Header 或未授权域是否存在数据。

### `GET|PUT /api/platform/v1/ai/provider`

- GET：总经办获取完整安全元数据；其他已登录用户只获取启用/可用布尔状态。
- PUT：只允许总经办非只读身份；只接受 `providerId`、`model`、`reasoningEffort` 和 `enabled`。
- Base URL、协议、路径、`storeResponses=false` 和 Header 白名单由服务端注册表固定。

### `POST /api/platform/v1/ai/provider/test`

只接受已登记 `providerId`；使用固定合成输入，不读取公司上下文。返回 `connected`、模型、耗时、测试时间、安全错误和 request ID。

### `POST /api/platform/v1/ai/chat`

请求：

```json
{
  "messages": [{ "role": "user", "content": "今天最需要关注什么？" }],
  "appHint": { "screen": "home", "detail": "" }
}
```

服务端忽略额外身份、权限和上下文字段。响应为 SSE：

- `meta`：request ID、允许域、阻止域。
- `text_delta`：回答文本增量。
- `sources`：参考 App、数据域和更新时间。
- `usage`：输入/输出 token，只在完成时出现。
- `error`：稳定错误码、安全中文说明、request ID、是否可重试。
- `done`：结束原因和是否完整。

## 数据迁移

- 数据中心增加 `aiProviders`、`aiDataPolicies` 两个安全元数据集合；旧状态归一化时补默认值，不改现有集合。
- D1 增加 Provider 安全配置和 `ai_usage_audit`；不复制产品、平台、供应链、销售或财务事实。
- 迁移 `migrations/0003_company_ai_assistant.sql` 增加 `data_ai_providers`、`data_ai_policies`、`ai_usage_audit` 和 `ai_request_leases`；环境能力清单将它们登记为可选 AI 能力依赖。
- 默认 Provider 为禁用，`secretConfigured` 运行时派生。
- 默认数据策略允许普通内部经营域，财务为 `providerTransfer=blocked`。
- 容量影响主要来自无内容审计行；按月保留或后续归档，首期上限 10,000 行并记录容量监控。

## 风险与回滚

- Provider 不兼容 Responses 或不接受 `store:false`：连接测试失败，保持禁用。
- 第三方数据留存不透明：财务外发保持阻止；没有人工复核记录不得开启。
- 上下文过大或成本上升：服务端按域限额、记录 token，超限返回明确限制。
- 提示注入：业务数据作为定界引用，无法改变系统规则；首期没有写工具。
- D1/Provider 不可用：不退回客户端数据直传；保留业务 App 正常使用。
- 回滚：关闭 `AI_ASSISTANT_ENABLED`，移除 UI 装配和 AI 路由；新增表保持不读，不删除业务数据。

## 验证命令

迭代阶段运行对应文件：

```bash
node --test react-tests/ai-assistant-domain.test.mjs
node --test tests/ai-provider.test.mjs
node --test tests/ai-context-policy.test.mjs
node --test tests/ai-api.test.mjs
node --test react-tests/ai-assistant-api.test.mjs react-tests/ai-assistant-ui.test.mjs react-tests/data-center-ai-provider.test.mjs
```

交付阶段从仓库根目录运行：

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
git diff --check
git status --short
```

外部验收单独记录：使用撤销旧 Key 后生成的新服务端 Secret，先运行合成连接测试；未经授权不配置生产 Secret、不部署、不发送真实公司数据。

## 任务顺序

1. 固化 AI 数据域、Provider 配置和平台文档。
2. TDD 实现数据策略和 Provider 网关。
3. TDD 实现可信公司上下文目录与无内容审计。
4. TDD 实现 AI 状态、Provider 管理、连接测试和流式聊天 API。
5. TDD 实现前端 SSE 客户端和总助状态 Provider。
6. 实现顶部面板和完整工作台，完成可访问性与响应式验收。
7. 将 AI Provider 设置装入数据中心并验证权限。
8. 完成全量门禁、外部合成测试准备和回滚核对。
