# AI 大模型治理实施计划

> **给执行者：** 必须使用 `superpowers:executing-plans` 在当前隔离工作区逐项执行；每一步使用复选框跟踪，并严格遵守测试先行。

**目标：** 建立全系统统一 AI 调用、归属、审计和用量页面，同时保持公司 AI 总助与电商运营点评的现有调用方合同。

**架构：** 扩展现有 `/api/platform/v1/ai/*`，用服务端功能注册表固定 App/功能归属，用统一调用器复用灵算 Provider、保险箱与审计。D1 在服务端聚合后只向数据中心返回无个人维度的统计，React 页面负责确认式日期选择与高密度汇总。

**技术栈：** React、Vite、Cloudflare Pages Functions、Cloudflare D1、Node.js 内建测试、灵算 Responses 兼容 API。

## 全局约束

- 分支必须包含当前 `origin/main`；工作目录为 `.worktrees/ai-model-governance`。
- 不新增运行时依赖，不新增平行 AI 网关，不恢复浏览器或业务路由直连 Provider。
- 统计默认最近 30 个上海自然日，快速范围为 7/30/90 天，自定义最长 366 天且必须点击查询确认。
- 统计 API 不返回员工、部门、提示词、回答、Skill 参数、业务上下文、凭证或 Provider 原始响应。
- 灵算凭证优先读取共享平台连接保险箱，`LINGSUAN_API_KEY` 与 `LINGSUAN_ACTOR_AUTHORIZATION` 仅兼容回退。
- `/api/platform/v1/ai/chat` SSE 与 `/api/ecommerce-operations/ai-review` JSON 响应保持兼容。
- 电商点评失败时只使用现有规则降级，规则结果为 0 Token，不恢复 OpenAI 直连。
- 页面保留 `data-services` route 和 `services` section，只改变可见名称、图标和内容。
- 每项生产代码修改前必须先运行对应失败测试并确认失败原因。

---

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

## 测试驱动执行步骤

### 执行任务 1：功能注册表、审计迁移与公司总助归属

**文件：**

- 新建：`migrations/0009_ai_model_governance.sql`
- 新建：`functions/api/platform/v1/ai/_shared/feature-registry.js`
- 修改：`functions/api/platform/v1/ai/_shared/audit.js`
- 修改：`functions/api/platform/v1/ai/chat.js`
- 修改：`tests/helpers/ai-d1-mock.mjs`
- 新建：`tests/ai-feature-invocation.test.mjs`
- 修改：`tests/ai-api.test.mjs`

**接口：**

- 输入：固定 `appId`、`featureId` 与现有 AI 审计记录。
- 输出：`getAiFeatureDefinition(appId, featureId)`、`listAiFeatureDefinitions()` 和支持 `appId/featureId/executionMode/providerCalled` 的 `writeAiAudit(db, record)`。

- [ ] **步骤 1：先写注册表与审计失败测试**

```js
test("AI feature registry accepts only registered server identities", async () => {
  const { getAiFeatureDefinition } = await import("../functions/api/platform/v1/ai/_shared/feature-registry.js");
  assert.equal(getAiFeatureDefinition("ecommerce-operations", "plan-review").featureName, "方案点评");
  assert.throws(() => getAiFeatureDefinition("browser", "forged"), error => error.code === "AI_FEATURE_NOT_REGISTERED");
});

test("AI usage audit stores app feature and execution attribution without content", async () => {
  await writeAiAudit(db, {
    requestId: "req-1", userId: "u1", appId: "ecommerce-operations",
    featureId: "plan-review", executionMode: "rule_fallback", providerCalled: false
  });
  assert.deepEqual(db.audits[0].slice(-4), ["ecommerce-operations", "plan-review", "rule_fallback", 0]);
});
```

- [ ] **步骤 2：运行测试并确认正确失败**

```bash
node --test tests/ai-feature-invocation.test.mjs tests/ai-api.test.mjs
```

预期：因 `feature-registry.js` 不存在和审计字段未写入而失败，不允许因语法错误失败。

- [ ] **步骤 3：实现注册表、迁移和审计字段**

```js
const FEATURES = Object.freeze([
  Object.freeze({ appId: "company-ai-assistant", appName: "公司 AI 总助", featureId: "assistant-chat", featureName: "对话分析", supportsSkills: true, fallbackMode: "none" }),
  Object.freeze({ appId: "ecommerce-operations", appName: "电商店铺运营", featureId: "plan-review", featureName: "方案点评", supportsSkills: false, fallbackMode: "rule_fallback", historyNote: "统一接入前暂无统计" })
]);
```

迁移按本计划「数据迁移」中的四个 `ALTER TABLE` 与复合索引执行；`chat.js` 写入固定 `company-ai-assistant / assistant-chat / model / providerCalled=true`。

- [ ] **步骤 4：运行聚焦测试并确认通过**

```bash
node --test tests/ai-feature-invocation.test.mjs tests/ai-api.test.mjs
```

预期：全部通过，现有 SSE 测试不需要改客户端事件结构。

- [ ] **步骤 5：更新任务并提交**

```bash
git add migrations/0009_ai_model_governance.sql functions/api/platform/v1/ai/_shared/feature-registry.js functions/api/platform/v1/ai/_shared/audit.js functions/api/platform/v1/ai/chat.js tests/helpers/ai-d1-mock.mjs tests/ai-feature-invocation.test.mjs tests/ai-api.test.mjs docs/features/ai-model-governance/tasks.md
git commit -m "feat(ai): register governed feature usage"
```

### 执行任务 2：无个人维度的用量聚合 API

**文件：**

- 新建：`functions/api/platform/v1/ai/usage.js`
- 修改：`functions/api/platform/v1/ai/_shared/feature-registry.js`
- 修改：`functions/api/platform/v1/ai/_shared/skill-registry.js`
- 新建：`tests/ai-usage-api.test.mjs`

**接口：**

- 输入：`GET ?from=YYYY-MM-DD&to=YYYY-MM-DD`、服务端会话和 D1 审计。
- 输出：`{ range, summary, features, skills }`，不包含 `user_id` 或 `department`。

- [ ] **步骤 1：写认证、日期、聚合和禁敏失败测试**

```js
test("usage report aggregates model tokens fallbacks and skills without employee dimensions", async () => {
  const response = await onRequest(context({ from: "2026-07-01", to: "2026-07-22", session: executive, db }));
  const payload = await response.json();
  assert.equal(payload.summary.totalTokens, payload.summary.inputTokens + payload.summary.outputTokens);
  assert.equal(payload.features[0].appId, "company-ai-assistant");
  assert.equal(JSON.stringify(payload).includes("user_id"), false);
  assert.equal(JSON.stringify(payload).includes("department"), false);
});
```

同时覆盖：未登录 401、无数据中心权限 403、缺失/倒序/超 366 天 400、D1 缺失 503、空库补齐两个登记功能、多模型分行、Skill 通过 request ID 关联调用方。

- [ ] **步骤 2：运行测试并确认路由不存在**

```bash
node --test tests/ai-usage-api.test.mjs
```

预期：因 `usage.js` 不存在或未导出 `onRequest` 而失败。

- [ ] **步骤 3：实现上海日期边界、权限与 D1 聚合**

```js
const startUtc = `${from}T00:00:00+08:00`;
const endExclusiveUtc = new Date(`${to}T00:00:00+08:00`);
endExclusiveUtc.setUTCDate(endExclusiveUtc.getUTCDate() + 1);
```

API 使用显式 SQL 列和显式响应字段；特性聚合按 `app_id, feature_id, provider_id, model`，Skill 聚合连接 `ai_usage_audit.request_id = ai_skill_audit.request_id`。所有响应使用 `private, no-store` 和稳定 Request ID。

- [ ] **步骤 4：运行用量 API 测试与现有 AI 测试**

```bash
node --test tests/ai-usage-api.test.mjs tests/ai-api.test.mjs tests/ai-skill-loop.test.mjs
```

预期：全部通过。

- [ ] **步骤 5：更新任务并提交**

```bash
git add functions/api/platform/v1/ai/usage.js functions/api/platform/v1/ai/_shared/feature-registry.js functions/api/platform/v1/ai/_shared/skill-registry.js tests/ai-usage-api.test.mjs docs/features/ai-model-governance/tasks.md
git commit -m "feat(ai): expose aggregate usage report"
```

### 执行任务 3：灵算保险箱、统一调用器与电商点评迁移

**文件：**

- 修改：`src/domain/platformConnections.js`
- 修改：`functions/api/platform/_shared/platformConnectionTesters.js`
- 修改：`functions/api/platform/v1/ai/_shared/http.js`
- 修改：`functions/api/platform/v1/ai/_shared/provider-config.js`
- 修改：`functions/api/platform/v1/ai/_shared/responses-adapter.js`
- 新建：`functions/api/platform/v1/ai/_shared/invoke-feature.js`
- 修改：`functions/api/ecommerce-operations/ai-review.js`
- 修改：`tests/platform-connections-api.test.mjs`
- 修改：`react-tests/platform-connections-ui.test.mjs`
- 修改：`tests/ai-feature-invocation.test.mjs`
- 修改：`tests/ecommerce-operations-api.test.mjs`

**接口：**

- 输入：服务端固定功能 ID、白名单化方案、共享平台连接和规则函数。
- 输出：`invokeAiFeature(options)`；电商路由仍返回 `{ mode: "ai" | "rule_fallback", summary, suggestions }`。

- [ ] **步骤 1：写保险箱优先、统一调用与兼容失败测试**

```js
test("AI configuration prefers the validated Lingsuan vault entry", async () => {
  const loaded = await loadAiConfiguration(envWithVault({ apiKey: "vault-key" }));
  assert.equal(loaded.provider.credentialSource, "vault");
  assert.equal(loaded.provider.secretConfigured, true);
});

test("operations review records shared attribution and preserves its response", async () => {
  const response = await reviewRequest(aiContext());
  const body = await response.json();
  assert.equal(body.mode, "ai");
  assert.equal(db.audits[0].appId, "ecommerce-operations");
  assert.equal(db.audits[0].featureId, "plan-review");
});
```

静态断言旧路由不再包含 `OPENAI_API_KEY`、`OPENAI_MODEL` 或 `api.openai.com`。

- [ ] **步骤 2：运行测试并确认命中旧直连**

```bash
node --test tests/platform-connections-api.test.mjs react-tests/platform-connections-ui.test.mjs tests/ai-feature-invocation.test.mjs tests/ecommerce-operations-api.test.mjs
```

预期：灵算连接未登记、调用器不存在或旧直连断言失败。

- [ ] **步骤 3：登记灵算平台连接并实现合成验证**

```js
connectionDefinition({
  id: "lingsuan-ai-gateway",
  name: "灵算 AI 网关",
  mark: "AI",
  description: "公司统一模型调用、Token 与 Skill 审计",
  fields: [
    connectionField("apiKey", "API Key", "LINGSUAN_API_KEY"),
    connectionField("actorAuthorization", "Actor Authorization", "LINGSUAN_ACTOR_AUTHORIZATION", { required: false })
  ]
})
```

验证器只向固定 Responses 端点发送合成输入“返回 ok”，固定 `store:false`，不读取 D1 业务数据，不回显候选凭证。

- [ ] **步骤 4：实现统一非流式调用器并替换电商直连**

```js
const result = await invokeAiFeature({
  env, db, session: data.session,
  appId: "ecommerce-operations",
  featureId: "plan-review",
  systemInstruction: OPERATIONS_REVIEW_INSTRUCTION,
  userInput: JSON.stringify(safePlan),
  timeoutMs: 20_000,
  fallback: () => fallbackReview(safePlan)
});
```

调用器必须在模型成功、模型失败后规则降级、未配置直接规则降级三条路径写一次审计；Provider 原始错误只映射为稳定 `AI_*` 代码。

- [ ] **步骤 5：运行四组测试并确认通过**

```bash
node --test tests/platform-connections-api.test.mjs react-tests/platform-connections-ui.test.mjs tests/ai-feature-invocation.test.mjs tests/ecommerce-operations-api.test.mjs
```

预期：全部通过，响应和权限保持兼容。

- [ ] **步骤 6：更新任务并提交**

```bash
git add src/domain/platformConnections.js functions/api/platform/_shared/platformConnectionTesters.js functions/api/platform/v1/ai/_shared/http.js functions/api/platform/v1/ai/_shared/provider-config.js functions/api/platform/v1/ai/_shared/responses-adapter.js functions/api/platform/v1/ai/_shared/invoke-feature.js functions/api/ecommerce-operations/ai-review.js tests/platform-connections-api.test.mjs react-tests/platform-connections-ui.test.mjs tests/ai-feature-invocation.test.mjs tests/ecommerce-operations-api.test.mjs docs/features/ai-model-governance/tasks.md
git commit -m "refactor(ai): route operations review through gateway"
```

### 执行任务 4：AI 大模型页面

**文件：**

- 新建：`src/domain/aiModelGovernance.js`
- 新建：`src/state/aiModelGovernanceApi.js`
- 新建：`src/features/data-center/AiModelWorkspace.jsx`
- 修改：`src/features/data-center/AiProviderSettings.jsx`
- 修改：`src/features/data-center/DataGovernanceWorkspaces.jsx`
- 修改：`src/features/data-center/DataCenterAppPage.jsx`
- 修改：`src/App.jsx`
- 修改：`src/styles.css`
- 新建：`react-tests/ai-model-governance.test.mjs`
- 修改：`react-tests/ai-provider-settings.test.mjs`
- 修改：`react-tests/data-center-app.test.mjs`

**接口：**

- 输入：`loadAiUsage(range)` 与确认后的 `{ from, to }`。
- 输出：老板可读的汇总、App/功能表、Skill 表及默认收起设置；route ID 不变。

- [ ] **步骤 1：写日期纯规则与页面结构失败测试**

```js
test("quick ranges use complete Shanghai calendar days", () => {
  assert.deepEqual(aiUsagePresetRange(7, "2026-07-22"), { from: "2026-07-16", to: "2026-07-22" });
});

test("AI model workspace keeps draft dates separate from the applied query", () => {
  assert.match(workspace, /draftRange/);
  assert.match(workspace, /appliedRange/);
  assert.match(workspace, /查询/);
  assert.match(workspace, /<details/);
});
```

同时断言：导航为 `Bot` 和「AI 大模型」、旧 route 保留、页面没有「销售数据服务」或「应用订阅」、Provider 设置默认折叠、空/错/禁用/只读文案存在。

- [ ] **步骤 2：运行 UI 测试并确认旧页面失败**

```bash
node --test react-tests/ai-model-governance.test.mjs react-tests/ai-provider-settings.test.mjs react-tests/data-center-app.test.mjs
```

预期：新文件不存在或旧「数据服务」断言失败。

- [ ] **步骤 3：实现日期规则、客户端和页面最小结构**

```js
export async function loadAiUsage({ from, to }, fetchImpl = fetch) {
  return jsonPayload(await fetchImpl(`/api/platform/v1/ai/usage?${new URLSearchParams({ from, to })}`), "AI 使用统计加载失败。");
}
```

页面用 `draftRange` 保存输入、`appliedRange` 驱动请求；快速按钮直接形成完整区间并应用，自定义输入只有提交表单才应用。

- [ ] **步骤 4：按已批准设计实现高密度页面和响应式样式**

界面保持当前数据中心视觉系统：不新增装饰图表、渐变文字、玻璃卡片或嵌套卡片。汇总使用一条紧凑状态带，两张表使用现有 `DataTable`，设置用原生 `details/summary`。在 1440、1024、390 宽度下均不让页面整体横向溢出。

- [ ] **步骤 5：运行 UI 与构建测试**

```bash
node --test react-tests/ai-model-governance.test.mjs react-tests/ai-provider-settings.test.mjs react-tests/data-center-app.test.mjs
npm run build
```

预期：测试与构建通过，无大于现有阈值的新 chunk。

- [ ] **步骤 6：更新任务并提交**

```bash
git add src/domain/aiModelGovernance.js src/state/aiModelGovernanceApi.js src/features/data-center/AiModelWorkspace.jsx src/features/data-center/AiProviderSettings.jsx src/features/data-center/DataGovernanceWorkspaces.jsx src/features/data-center/DataCenterAppPage.jsx src/App.jsx src/styles.css react-tests/ai-model-governance.test.mjs react-tests/ai-provider-settings.test.mjs react-tests/data-center-app.test.mjs docs/features/ai-model-governance/tasks.md
git commit -m "feat(data-center): add AI model governance workspace"
```

### 执行任务 5：长期规则、环境清单与直连阻断

**文件：**

- 新建：`tests/ai-provider-boundary.test.mjs`
- 修改：`package.json`
- 修改：`AGENTS.md`
- 修改：`PRODUCT.md`
- 修改：`DESIGN.md`
- 修改：`docs/platform/api-catalog.md`
- 修改：`docs/platform/integrations.md`
- 修改：`docs/platform/error-codes.md`
- 修改：`docs/product/roles-and-permissions.md`
- 修改：`docs/decisions/2026-07-19-company-ai-gateway.md`
- 修改：`docs/platform/environment-capabilities.json`
- 修改：`docs/platform/integration-registry.json`
- 生成：`functions/api/platform/_generated/environmentCapabilities.js`
- 生成：`functions/api/platform/_generated/integrationRegistry.js`
- 修改：`tests/environment-capabilities.test.mjs`
- 修改：`tests/integration-registry.test.mjs`

**接口：**

- 输入：已统一的 Provider 代码路径和 D1 表。
- 输出：CI 可执行的唯一网关规则、更新后的平台清单和生成模块。

- [ ] **步骤 1：写 Provider 边界和环境清单失败测试**

```js
test("business routes cannot reference provider secrets or domains", () => {
  for (const file of businessRouteFiles()) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /OPENAI_API_KEY|OPENAI_MODEL|api\.openai\.com|lingsuan\.top/);
  }
});
```

环境测试断言 `operations-ai-review` 已合并、`company-ai-assistant` 覆盖统一 AI 与新表、OpenAI 平台状态为 `retired`、灵算代码路径包含电商点评和统一调用器。

- [ ] **步骤 2：运行测试并确认旧清单失败**

```bash
node --test tests/ai-provider-boundary.test.mjs tests/environment-capabilities.test.mjs tests/integration-registry.test.mjs
```

预期：旧环境能力或集成状态断言失败；业务路由扫描在任务 3 后应通过。

- [ ] **步骤 3：更新长期规则和两个 JSON 来源**

AGENTS 规则必须明确：业务 App 只能使用登记过的统一 AI 服务端调用器；每个功能必须写 App/功能/模式/Token 无内容审计；不得公开个人排行。平台文档登记用量 API、错误、权限、保险箱优先与电商兼容。

- [ ] **步骤 4：生成平台模块并运行治理检查**

```bash
npm run generate:platform-manifests
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
```

预期：全部通过，生成文件只由脚本更新。

- [ ] **步骤 5：运行边界与合同测试**

```bash
node --test tests/ai-provider-boundary.test.mjs tests/environment-capabilities.test.mjs tests/integration-registry.test.mjs
```

预期：全部通过。

- [ ] **步骤 6：更新任务并提交**

```bash
git add AGENTS.md PRODUCT.md DESIGN.md package.json tests/ai-provider-boundary.test.mjs docs/platform docs/product/roles-and-permissions.md docs/decisions/2026-07-19-company-ai-gateway.md functions/api/platform/_generated tests/environment-capabilities.test.mjs tests/integration-registry.test.mjs docs/features/ai-model-governance/tasks.md
git commit -m "chore(ai): enforce shared provider boundary"
```

### 执行任务 6：完整验证、视觉验收与发布准备

**文件：**

- 修改：`docs/features/ai-model-governance/tasks.md`，只记录实际验证结果。
- 其他文件：仅修复本功能验证发现的真实缺陷；每个缺陷继续走失败测试、最小修复、复测。

**接口：**

- 输入：任务 1–5 的完整分支。
- 输出：可合并、可迁移、可回滚的实现证据。

- [ ] **步骤 1：检查分支和工作区**

```bash
git fetch origin main
git merge-base --is-ancestor origin/main HEAD
git status --short
```

预期：包含最新 `origin/main`，状态只包含本功能预期修改。

- [ ] **步骤 2：运行 Definition of Done**

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

预期：全部退出 0；任何失败都先复现并修复，不跳过。

- [ ] **步骤 3：本地完整运行与视觉验收**

```bash
npm start
```

在 1440×900、1024×768、390×844 检查最近 7/30/90、自定义确认、加载、空、错误、只读、总经办、表格横向滚动、键盘焦点和设置折叠。确认 `npm start` 使用服务端真实会话和统一 D1，但不把本地结果描述为生产验证。

- [ ] **步骤 4：记录实际验证并提交**

```bash
git add docs/features/ai-model-governance/tasks.md
git commit -m "docs(ai): record governance verification"
```

若任务文件没有实际内容变化，则不创建空提交。

- [ ] **步骤 5：合并前再次同步主线**

```bash
git fetch origin main
git rebase origin/main
git merge-base --is-ancestor origin/main HEAD
```

预期：分支包含最新主线且完整测试仍通过。部署和 Production readiness 在合并授权范围内单独执行，不能用本地或 Preview 代替。

### 补充实施：AI 页面灵算凭据管理

已取消「数据接入 > 公司数据 > 灵算 AI 网关」入口后，`AiProviderSettings` 直接嵌入过滤为 `lingsuan-ai-gateway` 的共享连接表单。保存、候选合成验证、版本冲突、停用和 Provider 解析继续使用现有 `/api/platform/v1/platform-connections` 与 `platform_credentials`，不建立第二套凭据状态。

新增 `POST /api/platform/v1/platform-connections/:platformId/reveal`，首期只接受灵算平台。服务端要求 `role=executive`、15 分钟内会话、用途、确认语「查看灵算凭据」，并通过 `platform_credential_audit` 对同一连接执行 15 分钟 5 次成功查看限制。迁移 `0010_platform_credential_reveal.sql` 为审计增加 `purpose`；审计动作不记录字段名或字段值。环境变量回退、已停用版本和其他平台一律不可查看。

成功响应使用 `private, no-store`，包含 `revealedAt/expiresAt`。React 只在连接表单组件状态中保存返回字段，5 分钟定时清除，并在设置折叠、`visibilitychange`、保存、停用和卸载时清除；禁止进入 URL、浏览器存储或共享连接元数据。应用回滚保留新增审计列，旧代码忽略该列；数据迁移无需复制或重写凭据。
