# 老板行动台与跨 App 部门协同执行任务

## 执行规则

- 每项任务只交付一个可独立验证的结果。
- 先写失败测试并确认失败原因，再写实现。
- 完成后记录实际验证命令和结果。
- 每次提交只包含当前任务文件。
- 不合并 `main`、不部署生产、不写线上 D1、不发送真实钉钉待办。
- 集成影响声明：`cloudflare-d1`、`cloudflare-pages`、`dingtalk`；`kuaimai` 仅为相关既有事实来源。

## 任务

- [x] 固化产品、平台、API 和架构契约
  - 依赖：已确认产品边界。
  - 文件：`docs/features/executive-collaboration-hub/*`、`docs/platform/apis/collaboration-items-v1.md`、ADR 和持久产品/平台文档。
  - 输入：现有战略、角色、数据定义、API 和集成注册表。
  - 输出：状态机、权限、数据、迁移、回滚和验收契约。
  - 失败测试：`npm run check:governance` 在缺少完整文档时失败。
  - 实现步骤：完成四件套、API 契约、ADR 和持久文档更新。
  - 验证：`npm run check:governance`；无占位词。
  - 提交：`docs(collaboration): define cross-app execution hub`。
  - 实际结果：2026-07-18 `npm run check:governance`、`npm run check:integrations` 和 `git diff --check` 通过。

- [x] 汇合战略、供应链、数据中心和品牌内容已完成依赖
  - 依赖：文档契约完成。
  - 文件：三个功能分支及冲突文件。
  - 输入：`codex/strategy-crud`、`codex/data-center-app`、`codex/brand-content-collaboration`。
  - 输出：不合并 main 的本地 App 集成基线。
  - 失败测试：冲突标记、缺失导入或现有测试失败。
  - 实现步骤：按战略、数据中心、品牌内容顺序合并并逐次验证。
  - 验证：`npm test`、`npm run build`、冲突标记扫描。
  - 提交：三个说明性 merge commit。
  - 实际结果：战略、供应链、数据中心和品牌内容完整 UI/API 已汇合；React 345 项、API 132 项通过，生产构建通过且全部 JavaScript chunk 小于 500KB。

- [x] 实现协同领域、权限和老板行动投影
  - 依赖：集成基线。
  - 文件：`src/domain/collaboration.js`、权限、feature flag、领域测试。
  - 输入：PRD 状态机和组织身份。
  - 输出：纯函数规范化、流转、范围、过滤和行动投影。
  - 失败测试：`node --test react-tests/collaboration-domain.test.mjs`。
  - 实现步骤：先类型和规范化，再状态机、权限、视图和排序。
  - 验证：领域测试全部通过。
  - 提交：`feat(collaboration): add governed workflow domain`。
  - 实际结果：2026-07-18 协同规范化、状态流转、参与范围、部门视图、老板行动投影和生产安全 feature flag 已实现；`node --test react-tests/collaboration-domain.test.mjs` 8 项通过。

- [ ] 实现细粒度 D1 API
  - 依赖：协同领域。
  - 文件：协同 API shared 模块、集合/单项/活动/流转端点、API 测试和 `package.json`。
  - 输入：公司会话和 `PRODUCT_FLOW_DB`。
  - 输出：受权限约束、幂等、分页、乐观锁和追加活动的 v1 API。
  - 失败测试：`node --test tests/collaboration-api.test.mjs`。
  - 实现步骤：验证、授权、存储、集合、单项、活动和流转。
  - 验证：API 测试覆盖 401/403/404/409/501 和成功路径。
  - 提交：`feat(api): persist scoped collaboration items`。

- [ ] 实现协同客户端和 Provider
  - 依赖：v1 API。
  - 文件：`src/state/collaborationApi.js`、`CollaborationProvider.jsx`、`src/main.jsx` 和测试。
  - 输入：API 响应和当前会话。
  - 输出：页面可用的 `useCollaboration`。
  - 失败测试：`node --test react-tests/collaboration-provider.test.mjs`。
  - 实现步骤：先客户端错误模型，再 Provider 加载、详情、写入和冲突状态。
  - 验证：Provider 与现有公司访问门测试通过。
  - 提交：`feat(collaboration): add scoped state provider`。

- [ ] 交付部门协同工作台
  - 依赖：Provider。
  - 文件：`src/features/collaboration/*`、路由、权限、样式和 UI 测试。
  - 输入：授权事项、活动和允许动作。
  - 输出：`#/collaboration` 的部门视图、列表、详情和编辑器。
  - 失败测试：`node --test react-tests/collaboration-ui.test.mjs`。
  - 实现步骤：状态视图、筛选、表格、详情、编辑和响应式。
  - 验证：UI、平台外壳和公司访问门测试通过。
  - 提交：`feat(collaboration): add department workbench`。

- [ ] 接入四个 App 草稿适配器和三个真实 UI 入口
  - 依赖：协同工作台和真实 App 代码。
  - 文件：四个适配器、统一按钮、产品/供应链/数据中心页面和测试。
  - 输入：App 业务记录。
  - 输出：安全、可确认的标准协同草稿。
  - 失败测试：`node --test react-tests/collaboration-adapters.test.mjs`。
  - 实现步骤：纯函数适配器后接产品、供应链、数据中心行操作；品牌内容只提供已测试契约。
  - 验证：适配器和 UI 测试通过，草稿不含敏感字段。
  - 提交：`feat(collaboration): connect business app drafts`。

- [ ] 把公司首页改为老板行动台并升级 App 中心
  - 依赖：协同事项和适配器。
  - 文件：行动台、公司首页、App 中心、战略 App 注册和测试。
  - 输入：老板行动投影、战略摘要和 App 健康。
  - 输出：待拍板/协调/逾期/变化优先首页和 App 协同健康表。
  - 失败测试：`node --test react-tests/executive-action-desk.test.mjs`。
  - 实现步骤：行动列表、首页布局、导航、App 健康和来源下钻。
  - 验证：行动台、平台 UI 和战略领域测试通过。
  - 提交：`feat(executive): prioritize decisions and coordination`。

- [ ] 平台统一同步钉钉待办
  - 依赖：协同 API、主负责人 union ID。
  - 文件：DingTalk 端点、通知领域、客户端、Provider、详情和测试。
  - 输入：已接收协同事项和现有钉钉适配器。
  - 输出：稳定 source ID、同一待办更新和失败可重试。
  - 失败测试：`node --test tests/collaboration-dingtalk.test.mjs`。
  - 实现步骤：构造 payload、服务端同步、元数据保存、UI 状态。
  - 验证：协同钉钉测试、现有钉钉回归和 UI 测试通过。
  - 提交：`feat(collaboration): sync governed DingTalk todos`。

- [ ] 完整验证、视觉审计和本地测试页交付
  - 依赖：全部实现完成。
  - 文件：本任务缺陷修正和本任务清单。
  - 输入：完整功能分支。
  - 输出：可在 8137 本地验收、无生产副作用的构建。
  - 失败测试：任一质量门、浏览器任务、响应式或无障碍检查失败。
  - 实现步骤：完整质量门、浏览器检查、视觉修正、任务记录。
  - 验证：lint、governance、integrations、test、build 和浏览器验收全部通过。
  - 提交：`test(collaboration): verify executive coordination hub`。
