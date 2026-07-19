# 公司 AI 总助执行任务

## 执行规则

- 每项任务只交付一个可独立验证的结果。
- 先写失败测试并确认失败原因，再写最小实现。
- 完成后记录实际验证命令和结果。
- 每次提交只包含当前任务文件，不包含旧 API Key、生产 Secret 或其他 worktree 改动。

## 任务

- [x] 任务 1：建立 AI 数据域、Provider 元数据和平台契约
  - 依赖：已评审 PRD 与设计。
  - 文件：`src/domain/aiAssistant.js`、`src/domain/dataCenter.js`、`migrations/0003_company_ai_assistant.sql`、环境能力、平台与角色文档、集成注册表、领域测试。
  - 输入：已确认的数据域、总经办全权限、财务默认不外发规则。
  - 输出：稳定数据域 ID、Provider 安全配置、AI 数据策略和文档契约。
  - 失败测试：领域测试因模块、默认策略和财务阻止不存在而失败。
  - 实现步骤：先实现纯归一化和策略投影，再扩展数据中心集合并生成平台清单。
  - 验证：领域测试、环境能力、治理检查、集成检查通过。
  - 证据：`node --test react-tests/ai-assistant-domain.test.mjs tests/data-center-api.test.mjs tests/environment-capabilities.test.mjs`（15/15）；`npm run check:governance`、`npm run check:integrations`、`npm run check:environment-capabilities` 通过。
  - 提交：`feat(ai): define assistant policies`。

- [x] 任务 2：实现 Provider 中立网关和灵算 Responses 适配器
  - 依赖：任务 1。
  - 文件：`functions/api/platform/v1/ai/_shared/provider-config.js`、`responses-adapter.js`、`tests/ai-provider.test.mjs`。
  - 输入：注册表白名单、D1 安全元数据、`LINGSUAN_API_KEY` 和可选服务端 Header Secret。
  - 输出：`resolveProviderConfig()`、`testProviderConnection()`、`streamProviderResponse()`。
  - 失败测试：缺少模块；任意 URL、缺少密钥或 `store:true` 未被拒绝。
  - 实现步骤：实现固定域名与路径、`store:false`、超时中止、Responses SSE 解析和安全错误映射。
  - 验证：Provider 测试覆盖成功、401、429、5xx、超时、未知事件和流中断。
  - 证据：`node --test tests/ai-provider.test.mjs`（6/6），全部使用注入的假 `fetch`，未发起外部请求。
  - 提交：`feat(ai): add responses provider gateway`。

- [x] 任务 3：实现服务端 AI 数据权限和公司上下文目录
  - 依赖：任务 1。
  - 文件：`functions/api/platform/v1/ai/_shared/data-policy.js`、`context-catalog.js`、`context-builders/*`、`tests/ai-context-policy.test.mjs`。
  - 输入：登录会话、AI 数据策略、现有产品/平台/供应链/数据中心存储。
  - 输出：`resolveAiDataAccess()`、`buildCompanyContext()` 和来源元数据。
  - 失败测试：普通员工越权、总经办全局读取、财务外发阻止、隐私字段移除和 24,000 字符上限均未实现。
  - 实现步骤：先实现纯策略，再逐域接只读存储；财务提供器登记但在当前 Provider 下不读取内容。
  - 验证：上下文测试覆盖跨 App、缺失、过期、未授权、提示注入和限额。
  - 证据：`node --test tests/ai-context-policy.test.mjs react-tests/ai-assistant-domain.test.mjs tests/data-center-api.test.mjs`（16/16）；上下文按域白名单、部门范围、24,000 字符上限和财务阻止验证通过。
  - 提交：`feat(ai): build governed company context`。

- [x] 任务 4：实现 AI 状态、Provider 管理和连接测试 API
  - 依赖：任务 1、2。
  - 文件：`functions/api/platform/v1/ai/status.js`、`provider.js`、`provider/test.js`、审计存储、`tests/ai-api.test.mjs`。
  - 输入：会话、Provider 网关、D1。
  - 输出：脱敏状态、总经办配置更新、合成连接测试和无内容审计。
  - 失败测试：认证、只读、运营越权、密钥不回显、合成测试和无 D1 错误均缺失。
  - 实现步骤：状态 GET → Provider GET/PUT → 测试 POST → 审计写入。
  - 验证：API 测试确认非总经办不能编辑/测试，任何响应不含 Secret。
  - 证据：`node --test tests/ai-api.test.mjs tests/ai-provider.test.mjs tests/ai-context-policy.test.mjs`（15/15）；总经办安全更新、合成测试、运营/只读拒绝和单用户并发租约通过。
  - 提交：`feat(ai): add provider management APIs`。

- [x] 任务 5：实现流式总助聊天 API
  - 依赖：任务 2、3、4。
  - 文件：`functions/api/platform/v1/ai/chat.js`、并发保护与审计模块、`tests/ai-api.test.mjs`。
  - 输入：最多 12 条文本消息和当前 App 提示。
  - 输出：`meta`、`text_delta`、`sources`、`usage`、`error`、`done` SSE 事件。
  - 失败测试：客户端上下文字段未拒绝、财务未阻止、消息限额/并发/流取消未处理。
  - 实现步骤：校验 → 数据访问 → 上下文 → Provider → SSE → 审计；失败不自动重试。
  - 验证：API 测试覆盖完整流、取消、超时、429、Provider 5xx 和未知 SSE 事件。
  - 证据：`node --test tests/ai-api.test.mjs tests/ai-context-policy.test.mjs tests/ai-provider.test.mjs`（20/20）；验证越权字段忽略、财务值阻止、SSE 完整流、主动取消、并发冲突、Provider 失败、无内容审计和租约释放。
  - 提交：`feat(ai): stream governed assistant responses`。

- [x] 任务 6：实现前端 AI 会话状态和 SSE 客户端
  - 依赖：任务 4、5。
  - 文件：`src/state/aiAssistantApi.js`、`AiAssistantProvider.jsx`、前端 API 与领域测试。
  - 输入：AI 状态与 SSE 事件。
  - 输出：`useAiAssistant()` 的打开、会话、发送、停止、重试、清空和错误状态。
  - 失败测试：sessionStorage 会话、AbortController、来源、未纳入范围和流中断状态不存在。
  - 实现步骤：先解析事件，再实现 reducer/Provider，最后持久化非敏感会话文本。
  - 验证：前端测试确认不把公司业务数据或权限放进请求。
  - 证据：`node --test react-tests/ai-assistant-api.test.mjs tests/local-data-center-server.test.mjs`（5/5）；浏览器请求仅含消息和路由提示，会话只进 `sessionStorage`，本地预览拒绝 Provider 写入与调用。
  - 提交：`feat(ai): add assistant session orchestration`。

- [x] 任务 7：实现全局面板和总助工作台
  - 依赖：任务 6。
  - 文件：`src/features/ai-assistant/*`、`src/App.jsx`、`src/main.jsx`、`src/styles.css`、UI 测试。
  - 输入：`useAiAssistant()`。
  - 输出：全局入口、右侧面板、隐藏工作台路由、消息/输入/来源/错误状态。
  - 失败测试：顶部入口、`#ai-assistant`、键盘、焦点恢复、窄屏全屏和状态文案缺失。
  - 实现步骤：入口与路由 → 面板容器 → 对话与输入 → 状态和响应式样式。
  - 验证：UI 测试与 1440/1280/900/640/390px 浏览器验收。
  - 证据：`node --test react-tests/ai-assistant-ui.test.mjs react-tests/ai-assistant-api.test.mjs`（6/6）、`npm run lint`、`npm run build`；1440/1280/900/640/390px 均无横向溢出，390px 面板为整屏，Escape 关闭后焦点回到入口，完整工作台不与侧边面板重叠。
  - 提交：`feat(ai): add company assistant workspace`。

- [x] 任务 8：在数据中心接入 AI 模型服务设置
  - 依赖：任务 4、6。
  - 文件：`src/features/data-center/AiProviderSettings.jsx`、`DataGovernanceWorkspaces.jsx`、样式和测试。
  - 输入：Provider 状态、配置 API、连接测试 API。
  - 输出：安全状态、模型/推理配置、启停、合成连接测试和外发策略矩阵。
  - 失败测试：密钥输入/回显防线、总经办编辑、其他身份只读和财务阻止展示缺失。
  - 实现步骤：安全摘要 → 配置表单 → 外发矩阵 → 测试状态。
  - 验证：数据中心 Provider UI 测试和响应式验收。
  - 证据：`node --test react-tests/ai-provider-settings.test.mjs react-tests/data-center-app.test.mjs react-tests/ai-assistant-api.test.mjs`（13/13）、`npm run lint`、`npm run build`；1440px 与 390px 浏览器验收无横向溢出，窄屏配置为单列，本地只读预览未执行保存和 Provider 连接测试。
  - 提交：`feat(data): manage ai provider service`。

- [x] 任务 9：全量验证与安全交付
  - 依赖：任务 1–8。
  - 文件：任务文档验证记录、必要的平台/产品/设计文档更新。
  - 输入：完整分支差异。
  - 输出：自动化、浏览器、权限、安全、回滚和未执行外部边界证据。
  - 失败测试：不适用；必须新鲜运行完整门禁。
  - 实现步骤：敏感值扫描 → 全量命令 → 浏览器矩阵 → diff/status 核对。
  - 验证：Definition of Done 全部通过；外部连接测试仅在新 Secret 获授权配置后执行。
  - 证据：敏感值扫描 0 命中；AI 安全专项 29/29；全量 React 415/415、API 218/218；`npm run lint`、`npm run check:governance`、`npm run check:integrations`、`npm run check:environment-capabilities`、`npm run build` 全部退出 0。1440/1280/900/640/390px 浏览器验收无横向溢出，焦点、Escape、只读/禁用状态和控制台 0 错误。未部署、未配置生产 Secret、未执行真实 Provider 连接、未写入生产数据；DingTalk 嵌入运行时与 Cloudflare 生产环境需部署授权后单独验收。
  - 提交：`docs(ai): record assistant verification`。

- [x] 任务 10：修复对话输入与滚动
  - 范围：`AiComposer`、`AiConversation`、面板/工作台网格和 UI 测试。
  - 验收：Enter 发送、Shift+Enter 换行、IME 不误发、长回答可滚动、手动上滚后可回到最新。
  - 证据：`node --test react-tests/ai-assistant-ui.test.mjs react-tests/ai-assistant-api.test.mjs`（8/8）；`npm run lint` 通过。

- [x] 任务 11：建立跨 App 只读 Skill 注册表
  - 范围：公司经营、产品全周期、供应链和数据中心读取执行器，固定 Schema、权限、超时和结果限额。
  - 验收：客户端不能声明 Skill，越权 Skill 不下发且不能执行，财务外发继续阻止。
  - 证据：`node --test tests/ai-skills.test.mjs tests/ai-context-policy.test.mjs`（8/8）；`npm run lint` 通过。

- [x] 任务 12：扩展店铺运营、品牌内容和绩效 Skill
  - 范围：复用各 App 的服务端读取与权限投影；抽取品牌内容只读存储边界。
  - 验收：普通员工只读取原本可见记录，总经办范围更广但仍不外发财务字段。
  - 证据：业务 Skill 与原 API 回归 `node --test ...`（29/29）；`npm run lint` 通过。

- [x] 任务 13：实现 Provider Function Calling 与受控循环
  - 范围：Responses 工具事件、两轮六次限制、重复调用去重、超时/取消和部分失败。
  - 验收：合成工具连接测试通过；Provider 不支持时明确降级；最终回答保留来源。
  - 证据：原生合成能力测试确认灵算返回 `AI_PROVIDER_SKILLS_UNSUPPORTED`；受控服务端回退复用权限、限额与审计并在生产问题中完成三次只读调用。`node --test tests/ai-skill-loop.test.mjs tests/ai-api.test.mjs`（16/16）通过。

- [x] 任务 14：记录并展示 Skill 调用
  - 范围：`ai_skill_audit`、SSE Skill 事件、前端安全状态和可展开调用记录。
  - 验收：审计和 UI 不保存或显示原始结果、问题或回答正文。
  - 证据：生产 UI 可展开查看“重点项目、经营复盘、供应链状态”三项调用；远程 `ai_skill_audit` 仅记录 Skill/App/结果数/耗时/结果码，无问题、回答和业务结果正文。

- [x] 任务 15：全量、浏览器与生产交付
  - 范围：平台清单、API/错误文档、迁移、完整门禁、响应式/WebView 和生产实测。
  - 验收：至少一个生产问题调用两个 App Skill；匿名仍为 401；正式生产验证器按实际凭证状态报告。
  - 证据：生产部署 `https://affb3bef.product-flow-system.pages.dev`；稳定入口资源指向 `assets/index-DDo-2tj1.js`。生产登录态使用 Enter 提问后调用 strategy 与 supply-chain 三个 Skill 并生成带来源建议；侧栏滚动区 `scrollHeight=1690`、`clientHeight=914`，Home/End 可到 0/731.5；匿名 AI 状态接口为 401。全量 React 425/425、API 224/224，lint、治理、集成、环境能力、构建与 diff 检查通过。`npm run verify:production` 因本机未提供 `PRODUCTION_DATA_ACCESS_TOKEN` 明确退出，不影响钉钉登录态实测结论。
