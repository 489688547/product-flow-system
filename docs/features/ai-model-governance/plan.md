# AI 大模型治理实施计划

## 目标

在不改变现有公司 AI 总助和电商运营调用方响应合同的前提下，建立一个服务端统一、可归属、可统计、可审计的 AI 调用能力，并交付面向老板的「AI 大模型」用量页面。

## 架构方案

本功能的共享能力决策为「扩展现有能力」。现有 `/api/platform/v1/ai/*`、灵算 Responses 适配器、Provider 配置、无内容审计和 Skill 注册表已经有两个真实消费者所需的大部分边界，因此不新建平行网关。

实现分为四层：

1. `src/domain` 只处理日期、统计响应归一化和数值格式所需的纯规则。
2. `src/state` 只负责调用统计 API；页面不直接访问 D1 或 Provider。
3. `src/features/data-center` 组合日期工具栏、汇总、两张表和默认收起的 Provider 设置。
4. `functions/api` 扩展统一 AI 功能注册、业务功能调用器、审计写入和聚合读取。业务路由只能调用共享调用器，不得包含 Provider 域名、Secret 或 Provider payload 映射。

数据流为：

`业务 App 路由 -> AI 功能注册表校验 -> 统一业务调用器 -> Provider 配置/保险箱解析 -> Responses 适配器 -> 无内容审计 -> D1 聚合 API -> AI 大模型页面`。

公司 AI 总助保持流式 Skill 循环；电商运营点评使用新增的非流式业务调用器。两者复用相同 Provider 配置、Responses 适配器、功能注册表、审计表和错误合同。

## 文件职责

### 新建

- `migrations/0009_ai_model_governance.sql`：为 `ai_usage_audit` 增加 App、功能、执行模式、Provider 调用标志及聚合索引。
- `functions/api/platform/v1/ai/_shared/feature-registry.js`：登记允许使用 AI 的 App 与功能，提供稳定中文名称并拒绝未知功能。
- `functions/api/platform/v1/ai/_shared/invoke-feature.js`：为非流式业务功能统一解析 Provider、调用模型、映射错误和写一次审计；接收服务端常量归属，不接受浏览器归属。
- `functions/api/platform/v1/ai/usage.js`：认证、校验日期、在 D1 聚合并返回无个人维度的用量响应。
- `src/domain/aiModelGovernance.js`：生成 7/30/90 天区间、校验自定义区间、归一化统计响应。
- `src/state/aiModelGovernanceApi.js`：封装 `GET /api/platform/v1/ai/usage` 和安全错误。
- `src/features/data-center/AiModelWorkspace.jsx`：AI 用量主页面、确认式日期交互、汇总、表格和设置折叠区。
- `tests/ai-usage-api.test.mjs`：统计 API 的认证、权限、日期、聚合、隐私和历史兼容合同。
- `tests/ai-feature-invocation.test.mjs`：注册表、统一调用、Token、规则降级和安全错误合同。
- `tests/ai-provider-boundary.test.mjs`：扫描业务路由，阻止 Provider 域名、Provider Secret 和新增直连。
- `react-tests/ai-model-governance.test.mjs`：导航、页面结构、日期确认、空错禁用状态和设置折叠的 UI 合同。

### 修改

- `src/App.jsx`：将 `data-services` 可见名称和图标改为「AI 大模型」与 `Bot`，保留 route/section ID。
- `src/features/data-center/DataCenterAppPage.jsx`：更新 section 元数据并装配 `AiModelWorkspace`。
- `src/features/data-center/DataGovernanceWorkspaces.jsx`：移除旧 `DataServicesWorkspace` 以及销售服务和应用订阅页面组合；保留其他工作区。
- `src/features/data-center/AiProviderSettings.jsx`：改为统一 AI 文案并提供可用于折叠摘要的脱敏状态；不增加明文凭证字段。
- `src/state/aiAssistantApi.js`：如 Provider 摘要需要，复用现有安全状态请求，不改变聊天合同。
- `src/styles.css`：增加 AI 用量页面、响应式表格、日期工具栏、汇总带和设置折叠样式。
- `functions/api/platform/v1/ai/_shared/audit.js`：创建新字段结构并写入 App、功能、执行模式与 Provider 调用标志。
- `functions/api/platform/v1/ai/_shared/responses-adapter.js`：增加基于现有流事件解析的受控非流式文本生成函数，避免复制 Provider payload 和错误映射。
- `functions/api/platform/v1/ai/_shared/http.js`、`functions/api/platform/v1/ai/_shared/provider-config.js`：通过 `platformEnv(env, "lingsuan-ai-gateway")` 优先解析保险箱凭证，保留环境变量兼容回退，并仅返回脱敏来源状态。
- `functions/api/platform/v1/ai/chat.js`：使用注册表中的公司总助归属写审计，SSE 事件与客户端请求合同不变。
- `functions/api/platform/v1/ai/_shared/skill-registry.js`：向用量 API提供只读 Skill 中文元数据，不暴露执行器或参数结构。
- `functions/api/ecommerce-operations/ai-review.js`：删除 OpenAI 直连，改用统一调用器；保留输入白名单、权限、规则降级和 `{ mode, summary, suggestions }` 响应。
- `src/domain/platformConnections.js`：登记「灵算 AI 网关」公司级连接及 `apiKey`、可选 `actorAuthorization` 字段，不暴露现有值。
- `functions/api/platform/_shared/platformConnectionTesters.js`：使用固定合成输入验证候选灵算凭证，不读取业务数据。
- `tests/platform-connections-api.test.mjs`、`react-tests/platform-connections-ui.test.mjs`：覆盖灵算连接的加密保存、只读验证、脱敏状态和数据接入入口。
- `tests/helpers/ai-d1-mock.mjs`、`tests/ai-api.test.mjs`、`tests/ecommerce-operations-api.test.mjs`：适配新审计字段并覆盖旧调用方兼容。
- `react-tests/ai-provider-settings.test.mjs`、`react-tests/data-center-app.test.mjs`：更新页面与文案断言。
- `docs/platform/environment-capabilities.json`：将电商点评并入公司统一 AI 能力，移除 `OPENAI_API_KEY` 与 `OPENAI_MODEL` 依赖，登记新审计字段所需迁移。
- `docs/platform/integration-registry.json`：扩展灵算能力与代码路径；将 OpenAI 直连接入标记为 retired；保持 Cloudflare Pages 与 D1 关系。
- `docs/platform/api-catalog.md`：登记用量 API、App 功能归属、规则降级和电商点评兼容合同。
- `docs/platform/integrations.md`：写明所有 App 必须通过统一 AI 调用器，Provider 凭证优先从共享保险箱解析。
- `docs/platform/error-codes.md`：登记 `AI_USAGE_*` 与 `AI_FEATURE_NOT_REGISTERED`。
- `docs/product/roles-and-permissions.md`：补充汇总可见、个人不展示和 Provider 管理权限。
- `docs/decisions/2026-07-19-company-ai-gateway.md`：把“电商点评后续迁移”更新为已纳入本计划的兼容迁移后果。
- `PRODUCT.md`：将 AI 治理作为数据中心长期职责，明确不用于员工排名。
- `DESIGN.md`：写入 AI 用量页面的汇总优先、确认日期、默认折叠设置和隐私展示规则。
- `AGENTS.md`：增加业务 App 禁止直连模型、必须登记 App/功能和必须写无内容审计的长期规则。
- `package.json`：若现有默认测试未覆盖新增边界测试，将其加入 `test:api`；不新增运行时依赖。
- `functions/api/platform/_generated/environmentCapabilities.js`、`functions/api/platform/_generated/integrationRegistry.js`：由 `npm run generate:platform-manifests` 生成，不手工编辑。

## 接口与契约

### 功能注册表

```js
getAiFeatureDefinition(appId, featureId)
// -> { appId, appName, featureId, featureName, supportsSkills, fallbackMode }
// 未登记时抛出 { code: "AI_FEATURE_NOT_REGISTERED", status: 500 }
```

首期登记：

```js
[
  {
    appId: "company-ai-assistant",
    appName: "公司 AI 总助",
    featureId: "assistant-chat",
    featureName: "对话分析",
    supportsSkills: true,
    fallbackMode: "none"
  },
  {
    appId: "ecommerce-operations",
    appName: "电商店铺运营",
    featureId: "plan-review",
    featureName: "方案点评",
    supportsSkills: false,
    fallbackMode: "rule_fallback"
  }
]
```

### 非流式业务调用器

```js
invokeAiFeature({
  env,
  db,
  session,
  appId,
  featureId,
  systemInstruction,
  userInput,
  timeoutMs,
  fallback
})
// -> {
//   requestId,
//   mode: "model" | "rule_fallback",
//   text,
//   providerCalled,
//   providerId,
//   model,
//   usage: { inputTokens, outputTokens },
//   resultCode
// }
```

- `appId` 和 `featureId` 必须由业务路由中的服务端常量传入并命中注册表。
- `userInput` 仅接受业务路由白名单化后的有限 JSON 或文本。
- 调用器固定使用 `store:false`，最大超时 20 秒，不返回原始 Provider body。
- 调用器在模型完成、模型失败后降级、未配置直接降级三种路径均写一次审计。
- 没有 `fallback` 的功能沿用安全 AI 错误；有 `fallback` 的功能返回显式规则结果。

### 用量 API

请求：

```http
GET /api/platform/v1/ai/usage?from=2026-06-23&to=2026-07-22
```

成功响应：

```json
{
  "range": { "from": "2026-06-23", "to": "2026-07-22", "timezone": "Asia/Shanghai" },
  "summary": {
    "providerCalls": 18,
    "successfulCalls": 16,
    "successRate": 0.8889,
    "inputTokens": 12000,
    "outputTokens": 3400,
    "totalTokens": 15400,
    "skillCalls": 25,
    "fallbackRuns": 2
  },
  "features": [
    {
      "appId": "company-ai-assistant",
      "appName": "公司 AI 总助",
      "featureId": "assistant-chat",
      "featureName": "对话分析",
      "providerId": "lingsuan-responses",
      "model": "gpt-5.6-sol",
      "providerCalls": 12,
      "successfulCalls": 11,
      "successRate": 0.9167,
      "inputTokens": 9000,
      "outputTokens": 2800,
      "totalTokens": 11800,
      "fallbackRuns": 0,
      "lastUsedAt": "2026-07-22T03:00:00.000Z",
      "historyNote": ""
    }
  ],
  "skills": [
    {
      "callerAppId": "company-ai-assistant",
      "callerFeatureId": "assistant-chat",
      "sourceAppId": "data-center",
      "skillId": "data_center_query_sales",
      "skillName": "查询销售数据",
      "calls": 7,
      "successes": 7,
      "failures": 0,
      "resultCount": 124,
      "lastUsedAt": "2026-07-22T03:00:00.000Z"
    }
  ]
}
```

错误：

- `AI_SESSION_REQUIRED`：未登录，401。
- `AI_USAGE_ACCESS_DENIED`：没有数据中心查看权限，403。
- `AI_USAGE_RANGE_INVALID`：日期缺失、倒序、格式错误或超过 366 天，400。
- `AI_STORAGE_UNAVAILABLE`：D1 未绑定或不可用，503，可重试。
- `AI_USAGE_QUERY_FAILED`：聚合失败，500，可重试；响应不包含 SQL 或原始 D1 错误。

所有响应使用 `Cache-Control: private, no-store` 并携带 Request ID。API 不接受 `userId`、`department`、`appId` 或任意 SQL 筛选参数。

## 数据迁移

`migrations/0009_ai_model_governance.sql` 顺序增加：

```sql
ALTER TABLE ai_usage_audit ADD COLUMN app_id TEXT NOT NULL DEFAULT 'company-ai-assistant';
ALTER TABLE ai_usage_audit ADD COLUMN feature_id TEXT NOT NULL DEFAULT 'assistant-chat';
ALTER TABLE ai_usage_audit ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'model';
ALTER TABLE ai_usage_audit ADD COLUMN provider_called INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS ai_usage_audit_feature_range
  ON ai_usage_audit(created_at, app_id, feature_id);
```

- 新装环境中的 `ensureAiAuditTables` 直接创建完整新结构；已有环境由迁移加列。
- 默认值把可确定的旧公司总助记录兼容为 `company-ai-assistant / assistant-chat / model / provider_called=1`。
- 迁移不修改 Token、用户、结果码或创建时间。
- 电商运营历史没有审计，不插入模拟记录。
- 迁移前后表行数必须一致；新增索引容量按审计行数线性增长，不复制正文或业务数据。
- D1 不支持直接删除新增列；数据回滚采用停止新字段写入和回滚应用代码，保留新增列与索引。

## 风险与回滚

| 风险 | 观测 | 处理与回滚 |
|---|---|---|
| 旧 D1 未执行迁移 | readiness 或统计 API 报缺列 | 阻断发布，执行迁移后重验；不让页面静默显示 0 |
| 电商点评模型结果与旧 OpenAI 不同 | 兼容测试、运营验收 | 保持提示词目标与响应格式；异常时只回退规则，不恢复直连 |
| Provider 失败产生重复审计 | request ID 唯一约束、合同测试 | 统一调用器一次完成一次写入，冲突不重试插入 |
| 日期换算漏算边界 | 上海时区日期测试 | 统一纯函数产生 `[startUtc, endExclusiveUtc)` |
| 汇总泄露个人信息 | 响应快照与禁词测试 | SQL 只选择聚合列，序列化器使用显式白名单 |
| 新 App 绕开网关 | 静态边界测试与 AGENTS 规则 | CI 阻断 Provider 域名、Secret 或未注册功能 |
| Provider 凭证配置漂移 | 环境清单、保险箱来源状态与 readiness | 在平台连接注册表登记灵算，候选值合成验证后激活；环境变量只兼容回退；分别验证 Preview/Production |

## 验证命令

### 分阶段

```bash
node --test tests/ai-usage-api.test.mjs
node --test tests/ai-feature-invocation.test.mjs
node --test tests/ai-provider-boundary.test.mjs
node --test tests/ai-api.test.mjs tests/ecommerce-operations-api.test.mjs
node --test tests/platform-connections-api.test.mjs
node --test react-tests/ai-model-governance.test.mjs react-tests/ai-provider-settings.test.mjs react-tests/data-center-app.test.mjs
npm run generate:platform-manifests
npm run check:environment-capabilities
npm run check:integrations
```

### 完整 Definition of Done

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

### 运行环境

- 本地：`npm start`，使用真实 token-backed 会话读取统一 D1；验证统计读取和电商规则降级，不把本地成功描述为已上线。
- Preview：验证迁移、登录、统计、Provider 状态和电商点评兼容。
- Production：部署后分别执行 `npm run verify:production -- --require-platform cloudflare-pages --require-platform cloudflare-d1 --require-platform lingsuan-ai-gateway`，再用真实页面验证一次 AI 总助和一次电商点评。
- UI：1440、1024、390 像素宽度，键盘、焦点、空/错/禁用、只读、总经办和钉钉 WebView。

## 任务顺序

1. 迁移、功能注册表和审计字段。
2. 用量聚合 API 与隐私/权限合同。
3. 灵算平台连接保险箱解析、统一非流式业务调用器和电商点评迁移。
4. AI 大模型页面、日期确认和 Provider 设置折叠。
5. 静态直连阻断、环境/集成清单和长期规则反写。
6. 完整验证、本地/Preview/Production 分 lane 验收、合并与回滚确认。
