# AI 大模型治理执行任务

## 执行规则

- 每项任务只交付一个可独立验证的结果。
- 先写失败测试并确认失败原因，再写实现。
- 完成后记录实际验证命令和结果。
- 每次提交只包含当前任务文件。
- 所有业务 App 的 `appId` 与 `featureId` 必须是服务端注册表常量，浏览器值不能决定审计归属。
- 不保存或返回提示词、回答、业务上下文、Skill 参数值、凭据或 Provider 原始响应。

## 任务

- [x] 任务 1：建立 AI 功能注册表与可归属审计结构
  - 依赖：无。
  - 文件：`migrations/0009_ai_model_governance.sql`、`functions/api/platform/v1/ai/_shared/feature-registry.js`、`functions/api/platform/v1/ai/_shared/audit.js`、`tests/helpers/ai-d1-mock.mjs`、`tests/ai-feature-invocation.test.mjs`、`tests/ai-api.test.mjs`。
  - 输入：现有 `ai_usage_audit`、`ai_skill_audit` 和公司总助审计写入。
  - 输出：`getAiFeatureDefinition(appId, featureId)` 与支持 App/功能/执行模式/Provider 调用标志的审计写入。
  - 失败测试：`node --test tests/ai-feature-invocation.test.mjs tests/ai-api.test.mjs`；预期因注册表、新列和归属写入不存在而失败。
  - 实现步骤：先定义两个首期功能；再增加迁移与新装表结构；最后让公司总助写固定归属并保持 SSE 合同。
  - 验证：同一命令全部通过；迁移前后审计行数相等，旧行默认归入公司总助。
  - 实际结果：`node --test tests/ai-feature-invocation.test.mjs tests/ai-api.test.mjs` 通过，14 项测试、0 失败。
  - 提交：只提交注册表、迁移、审计和对应测试，信息 `feat(ai): register governed feature usage`。

- [x] 任务 2：提供无个人维度的 AI 用量聚合 API
  - 依赖：任务 1。
  - 文件：`functions/api/platform/v1/ai/usage.js`、`functions/api/platform/v1/ai/_shared/feature-registry.js`、`functions/api/platform/v1/ai/_shared/skill-registry.js`、`tests/ai-usage-api.test.mjs`。
  - 输入：已迁移的 AI 审计、当前钉钉会话、`from/to` 日期。
  - 输出：`GET /api/platform/v1/ai/usage` 的 `range/summary/features/skills` 聚合响应。
  - 失败测试：`node --test tests/ai-usage-api.test.mjs`；预期因路由不存在而失败。
  - 实现步骤：先校验会话、数据中心权限和 366 天区间；再在 D1 聚合；最后用注册表补齐零调用功能并显式白名单序列化。
  - 验证：认证、拒绝权限、上海日期边界、多个模型、规则降级、Skill 关联、空数据、D1 错误和响应禁敏测试全部通过。
  - 实际结果：`node --test tests/ai-usage-api.test.mjs tests/ai-api.test.mjs tests/ai-skill-loop.test.mjs tests/data-center-api.test.mjs` 通过，30 项测试、0 失败。
  - 提交：只提交聚合 API、元数据读取和对应测试，信息 `feat(ai): expose aggregate usage report`。

- [x] 任务 3：建立统一非流式 AI 调用器并迁移电商点评
  - 依赖：任务 1。
  - 文件：`functions/api/platform/v1/ai/_shared/invoke-feature.js`、`functions/api/platform/v1/ai/_shared/responses-adapter.js`、`functions/api/platform/v1/ai/_shared/http.js`、`functions/api/platform/v1/ai/_shared/provider-config.js`、`src/domain/platformConnections.js`、`functions/api/platform/_shared/platformConnectionTesters.js`、`functions/api/ecommerce-operations/ai-review.js`、`tests/ai-feature-invocation.test.mjs`、`tests/ecommerce-operations-api.test.mjs`、`tests/platform-connections-api.test.mjs`、`react-tests/platform-connections-ui.test.mjs`。
  - 输入：服务端固定 App/功能 ID、白名单化方案、共享 Provider 配置、现有规则检查函数。
  - 输出：`invokeAiFeature`；电商点评保持 `{ mode, summary, suggestions }`，成功与降级均写一次统一审计。
  - 失败测试：`node --test tests/ai-feature-invocation.test.mjs tests/ecommerce-operations-api.test.mjs tests/platform-connections-api.test.mjs react-tests/platform-connections-ui.test.mjs`；预期因灵算尚未进入平台连接注册表、统一调用器不存在且旧路由仍直连 OpenAI 而失败。
  - 实现步骤：先把灵算登记为公司数据连接并增加合成只读验证；让 AI 配置优先解析保险箱、环境变量兼容回退；再从现有 Responses 事件解析提取非流式文本结果，实现注册、超时、降级和一次审计；最后替换电商路由直连并保留输入白名单与权限。
  - 验证：保险箱加密保存与优先解析、候选凭证合成验证、模型成功 Token、Provider 失败后降级、未配置直接降级、未知功能拒绝、无原始错误和旧响应兼容全部通过。
  - 实际结果：`node --test tests/platform-connections-api.test.mjs react-tests/platform-connections.test.mjs tests/ai-feature-invocation.test.mjs tests/ecommerce-operations-api.test.mjs tests/ai-provider.test.mjs tests/ai-api.test.mjs` 通过，54 项测试、0 失败。
  - 提交：只提交共享调用器、电商迁移和对应测试，信息 `refactor(ai): route operations review through gateway`。

- [x] 任务 4：交付「AI 大模型」页面
  - 依赖：任务 2。
  - 文件：`src/domain/aiModelGovernance.js`、`src/state/aiModelGovernanceApi.js`、`src/features/data-center/AiModelWorkspace.jsx`、`src/features/data-center/AiProviderSettings.jsx`、`src/features/data-center/DataGovernanceWorkspaces.jsx`、`src/features/data-center/DataCenterAppPage.jsx`、`src/App.jsx`、`src/styles.css`、`react-tests/ai-model-governance.test.mjs`、`react-tests/ai-provider-settings.test.mjs`、`react-tests/data-center-app.test.mjs`。
  - 输入：用量聚合 API、现有 `DateRangeControls`、`DataTable`、`AiProviderSettings`。
  - 输出：保留旧 route ID 的「AI 大模型」导航与页面，确认式日期、汇总、两张表、默认收起设置。
  - 失败测试：`node --test react-tests/ai-model-governance.test.mjs react-tests/ai-provider-settings.test.mjs react-tests/data-center-app.test.mjs`；预期因新名称、页面和状态不存在而失败。
  - 实现步骤：先实现日期纯函数与 API 客户端；再实现页面结构与状态；最后替换路由组合、删除旧销售/订阅页面并补齐响应式样式。
  - 验证：最近 7/30/90、自定义未确认不请求、空/错/禁用/只读、设置折叠、旧链接和无销售/订阅文案测试全部通过。
  - 实际结果：`node --test react-tests/ai-model-governance.test.mjs react-tests/ai-provider-settings.test.mjs react-tests/data-center-app.test.mjs` 通过，14 项测试、0 失败；`npm run lint`、`npm run build` 通过。
  - 提交：只提交 UI、客户端、纯规则和对应测试，信息 `feat(data-center): add AI model governance workspace`。

- [x] 任务 5：阻止未来 App 绕过统一 AI 能力
  - 依赖：任务 3。
  - 文件：`tests/ai-provider-boundary.test.mjs`、`package.json`、`AGENTS.md`、`docs/platform/api-catalog.md`、`docs/platform/integrations.md`、`docs/platform/error-codes.md`、`docs/product/roles-and-permissions.md`、`docs/decisions/2026-07-19-company-ai-gateway.md`、`PRODUCT.md`、`DESIGN.md`。
  - 输入：统一功能注册表、调用器和现有治理命令。
  - 输出：静态直连阻断测试及 App 登记、无内容审计、个人不展示的长期规则。
  - 失败测试：`node --test tests/ai-provider-boundary.test.mjs`；预期首先命中电商路由遗留的 Provider 域名/Secret，迁移后才通过。
  - 实现步骤：定义唯一允许出现 Provider 域名和 Secret 的服务端适配器/配置白名单；扫描其他业务路由；将同一规则反写到 AGENTS、平台 API、集成、错误、权限、产品和设计来源。
  - 验证：边界测试和 `npm run check:governance` 通过；文档不存在“电商点评仍独立直连”的旧表述。
  - 实际结果：边界测试扫描业务路由中的模型地址、Secret、低层适配器导入和电商点评归属，3 项测试通过；`npm run check:governance` 通过。长期规则已反写到 Agent、产品、设计、API、集成、权限、错误码与 ADR。
  - 提交：只提交测试、治理接入和长期文档，信息 `chore(ai): enforce shared provider boundary`。

- [ ] 任务 6：同步环境能力与集成注册表
  - 依赖：任务 3、任务 5。
  - 文件：`docs/platform/environment-capabilities.json`、`docs/platform/integration-registry.json`、`functions/api/platform/_generated/environmentCapabilities.js`、`functions/api/platform/_generated/integrationRegistry.js`、`tests/environment-capabilities.test.mjs`、`tests/integration-registry.test.mjs`。
  - 输入：电商点评已迁移、OpenAI 环境变量已移除、D1 新迁移与灵算统一消费者。
  - 输出：公司统一 AI 能力清单、retired 的 OpenAI 直连记录、更新后的生成模块。
  - 失败测试：`node --test tests/environment-capabilities.test.mjs tests/integration-registry.test.mjs`；预期因旧 `operations-ai-review` 和 OpenAI 依赖仍存在而失败。
  - 实现步骤：更新两个 JSON 来源；运行 `npm run generate:platform-manifests`；更新测试期望，不手改生成文件。
  - 验证：`npm run check:environment-capabilities` 和 `npm run check:integrations` 通过，路由结果只要求 Cloudflare Pages、D1 与灵算。
  - 提交：只提交清单、生成文件和合同测试，信息 `docs(platform): govern unified AI capability`。

- [ ] 任务 7：完成全量验证与三环境验收
  - 依赖：任务 1–6。
  - 文件：仅更新本任务实际验证结果；不得为通过检查修改无关文件。
  - 输入：完整功能分支、Cloudflare 迁移与部署权限。
  - 输出：Definition of Done、UI 验收、Preview 与 Production readiness 证据，以及明确回滚点。
  - 失败测试：先运行完整命令并记录任何真实失败；不得在失败时声称完成。
  - 实现步骤：检查 `git status --short`；运行六条 Definition of Done；启动 `npm start` 做本地真实会话验收；发布 Preview 并验证；经用户已有发布授权后部署 Production、运行三平台 readiness、验证公司总助和电商点评各一次。
  - 验证：`npm run lint`、`npm run check:governance`、`npm run check:integrations`、`npm run check:environment-capabilities`、`npm test`、`npm run build` 全通过；1440/1024/390 宽度、键盘、钉钉 WebView、空/错/只读/总经办状态通过；Production readiness 对三个受影响平台无 warning。
  - 提交：如果完整验证发现本功能缺陷，每个缺陷使用独立修复提交；没有缺陷时不创建空提交。随后更新分支包含最新 `origin/main` 再合并。
