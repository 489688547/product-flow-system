# 老板行动台与跨 App 部门协同实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task in the current session. Subagent dispatch is not authorized for this feature. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不合并 `main`、不影响线上现有版本的独立功能分支中，交付可按组织权限使用的部门协同闭环，并让老板首页只聚焦待决策、跨部门阻塞、高影响逾期和重要变化。

**Architecture:** 业务 App 通过纯函数适配器生成标准协同草稿；共享领域模块负责状态机、可见范围和老板行动投影；新的 `/api/platform/v1/collaboration-items` 使用独立 D1 行记录、参与者索引、乐观锁和追加活动表；React 使用独立 `CollaborationProvider`，普通员工无需加载总经办战略整包状态。钉钉由平台端点统一同步，业务 App 不直接调用外部系统。

**Tech Stack:** React 19、Vite 7、Cloudflare Pages Functions、Cloudflare D1、Node.js `node:test`、现有 DingTalk Todo 适配器、现有共享 UI 组件。

## Global Constraints

- 新分支必须从最新 `origin/main` 开始，所有变更保留在 `codex/executive-collaboration-hub`，不合并 `main`、不部署生产。
- 依赖方向保持 `features -> ui/domain/state`、`state -> API client`、`functions/api -> shared middleware/provider adapter`。
- 普通员工不能加载或写入仅总经办可访问的 `/api/platform`；部门协同使用独立细粒度 API。
- 每个事项只有一个主责部门和一个主负责人；协同部门不能替代唯一责任。
- App 适配器只构造协同草稿，不持久化、不流转、不发送钉钉待办。
- 不新增第三方依赖；复用 `PageHeader`、`DataTable`、`Button`、`OrgSelect`、`DatePickerField` 和现有钉钉待办函数。
- D1 使用独立表和每事项单行记录，不写入现有 `platform_records`，不回填历史 `appEvents`。
- 所有新行为先写测试并确认按预期失败，再写最小实现。
- 所有列表支持加载、空、错误、无权限、禁用和冲突状态；中文表头不单字换行。
- 页面必须验证 1440、1280、1024 和 390 像素宽度、键盘焦点、WCAG AA 和钉钉 WebView 动态视口。
- 外部平台影响：Cloudflare D1、Cloudflare Pages 和 DingTalk 为直接影响；Kuaimai 只作为供应链/数据中心已有事实来源，不新增调用。

---

## 目标

完成共享协同领域和 API、部门协同工作台、老板行动台、业务 App 适配器、App 健康视图与钉钉待办同步；保留原战略、产品、供应链和数据中心业务状态边界。

## 架构方案

选择“共享协同契约 + 各 App 局部适配器 + 平台行动投影”。共享能力评审结论为“抽取共享能力”，因为产品全周期、供应链、数据中心和品牌内容已经是四个真实消费者。共享层只拥有责任、交接、状态、审计和权限；App 继续拥有异常判断和业务结果。

数据写入采用三张 D1 表：

- `collaboration_items`：查询字段、JSON 负载、版本和归档信息。
- `collaboration_participants`：按用户或部门建立读取范围索引，避免先读全表再在浏览器过滤。
- `collaboration_activities`：追加状态和责任变更活动，动作幂等键唯一。

老板行动台通过 `buildExecutiveActions(items, now)` 读取时投影，不建立第二份可漂移的老板事项表。产品、供应链和数据中心适配器只输出 `CollaborationDraft`，保存由用户确认和 API 完成。

## 文件职责

### 文档与决策

- `docs/features/executive-collaboration-hub/prd.md`：业务边界、状态、权限、数据和验收。
- `docs/features/executive-collaboration-hub/design.md`：老板行动台、部门工作台和 App 内入口设计。
- `docs/features/executive-collaboration-hub/plan.md`：实现边界、接口、迁移、风险和任务顺序。
- `docs/features/executive-collaboration-hub/tasks.md`：执行状态与实际验证记录。
- `docs/platform/apis/collaboration-items-v1.md`：v1 API 契约。
- `docs/decisions/2026-07-18-cross-app-collaboration-contract.md`：共享能力和业务事实所有权 ADR。
- `docs/product/core-workflows.md`、`docs/product/roles-and-permissions.md`、`docs/product/data-definitions.md`：持久产品规则。
- `docs/platform/api-catalog.md`、`docs/platform/error-codes.md`：共享 API 和错误码登记。

### 领域与权限

- `src/domain/collaboration.js`：规范化、状态机、可见范围、允许动作、活动和老板行动投影。
- `src/domain/collaborationAdapters/productFlow.js`：产品任务到协同草稿。
- `src/domain/collaborationAdapters/supplyChain.js`：库存、审批映射和质量问题到协同草稿。
- `src/domain/collaborationAdapters/dataCenter.js`：数据质量和数据源异常到协同草稿。
- `src/domain/collaborationAdapters/brandContent.js`：品牌内容领域记录到协同草稿；首版不添加未完成业务 UI。
- `src/domain/permissions.js`：部门协同导航和总经办范围判定，不扩大战略平台权限。
- `src/domain/featureFlags.js`：`executiveCollaborationHub` 本地默认开启、生产仅显式环境变量开启。

### API 与 D1

- `functions/api/platform/v1/_shared/collaborationValidation.js`：字段白名单、长度、时间、来源路由和组织身份校验。
- `functions/api/platform/v1/_shared/collaborationAuthorization.js`：从会话构建演员身份并校验读取、编辑和状态动作。
- `functions/api/platform/v1/_shared/collaborationStorage.js`：建表、参与者索引、分页、乐观锁、活动和归档。
- `functions/api/platform/v1/_shared/collaborationHttp.js`：统一错误响应、request ID、游标和路由参数。
- `functions/api/platform/v1/collaboration-items.js`：集合 GET/POST。
- `functions/api/platform/v1/collaboration-items/[id].js`：单项 GET/PATCH。
- `functions/api/platform/v1/collaboration-items/[id]/activities.js`：活动 GET。
- `functions/api/platform/v1/collaboration-items/[id]/transitions.js`：受控状态动作 POST。
- `functions/api/platform/v1/collaboration-items/[id]/dingtalk.js`：平台端钉钉待办同步和安全元数据保存。

### 状态与页面

- `src/state/collaborationApi.js`：集合、详情、活动、创建、修改、流转和钉钉同步客户端。
- `src/state/CollaborationProvider.jsx`：分页列表、选中详情、刷新、缓存、错误和写入协调。
- `src/features/collaboration/CollaborationPage.jsx`：部门协同页面组合。
- `src/features/collaboration/CollaborationFilters.jsx`：视图和筛选工具栏。
- `src/features/collaboration/CollaborationTable.jsx`：高密度列表、行选择和允许动作。
- `src/features/collaboration/CollaborationDetailPanel.jsx`：当前行动、责任、来源、活动和钉钉区。
- `src/features/collaboration/CollaborationEditor.jsx`：新建和编辑表单。
- `src/features/collaboration/CollaborationStatusBadge.jsx`：协同状态语义。
- `src/features/collaboration/AppCollaborationButton.jsx`：接收 App 适配器草稿并打开统一编辑器。
- `src/features/company/ExecutiveActionDesk.jsx`：老板待拍板、需要协调、高影响逾期和重要变化。
- `src/features/company/CompanyHomePage.jsx`：以行动台替换数量条首屏，保留战略和经营下钻。
- `src/features/platform/AppCenterPage.jsx`：App 协同健康与筛选入口。
- `src/App.jsx`、`src/main.jsx`：导航、路由和独立 Provider；普通员工不挂载 `PlatformProvider`。
- `src/styles.css`：只添加协同和行动台命名空间样式、响应式、焦点和减少动效规则。

### 测试

- `react-tests/collaboration-domain.test.mjs`：规范化、状态机、权限和行动投影。
- `react-tests/collaboration-adapters.test.mjs`：四个 App 草稿适配器。
- `tests/collaboration-api.test.mjs`：D1、认证、范围、幂等、版本、流转、归档和分页契约。
- `react-tests/collaboration-provider.test.mjs`：客户端路径、错误和状态协调静态契约。
- `react-tests/collaboration-ui.test.mjs`：导航、页面结构、状态和无障碍契约。
- `react-tests/executive-action-desk.test.mjs`：老板首页信息优先级和来源导航。
- `tests/collaboration-dingtalk.test.mjs`：稳定 source ID、更新同一待办和失败不回滚。
- `package.json`：把新 API 测试加入 `test:api`。

## 接口与契约

### 领域接口

```js
normalizeCollaborationDraft(input, context = {}) -> CollaborationDraft
collaborationTransitionsFor(item, actor) -> string[]
applyCollaborationTransition(item, request, actor, now) -> { item, activity }
canReadCollaborationItem(item, actor) -> boolean
filterCollaborationItems(items, query, actor, now) -> CollaborationItem[]
buildExecutiveActions(items, now) -> ExecutiveAction[]
```

`actor` 使用：

```js
{
  userId: "user-1",
  unionId: "union-1",
  name: "张三",
  departmentIds: ["dept-product"],
  departmentNames: ["产品部"],
  executive: false,
  readonly: false
}
```

### App 适配器接口

四个适配器均导出单一函数并返回可传给 `normalizeCollaborationDraft` 的结构：

```js
buildProductTaskCollaborationDraft({ task, product, risk, route })
buildSupplyChainCollaborationDraft({ kind, record, product, route })
buildDataCenterCollaborationDraft({ kind, record, freshness, route })
buildBrandContentCollaborationDraft({ kind, record, product, route })
```

### React 状态接口

```js
useCollaboration() -> {
  items, selectedItem, activities, loading, detailLoading, error, filters,
  refresh, setFilters, selectItem, createItem, updateItem,
  transitionItem, archiveItem, syncDingTalkTodo
}
```

### API

请求、响应、权限、错误、幂等和分页完全以 `docs/platform/apis/collaboration-items-v1.md` 为准。客户端不调用 D1，也不直接导入钉钉 provider 代码。

## 数据迁移

1. `ensureCollaborationTables` 使用 `CREATE TABLE IF NOT EXISTS` 建立三张独立表和索引，可重复执行。
2. 不迁移或删除 `platform_records`、`product_flow_state`、供应链、数据中心或品牌内容表。
3. 不把历史 `appEvents` 批量转成协同事项；产品适配器只生成用户确认的草稿。
4. `collaboration_items.payload` 保存小型业务字段；查询和权限字段同时保留独立列，单项负载限制 32KB，避免 D1 `SQLITE_TOOBIG`。
5. 参与者变化时在同一 `db.batch` 中更新事项、参与者索引和活动；环境不支持 batch 时返回存储错误，不执行部分成功。
6. 版本从 1 开始，每次修改或状态动作加 1；活动不覆盖。
7. 回滚只关闭前端功能开关并停止写入；表和历史保留，不执行破坏性 down migration。

## 风险与回滚

- **分支整合冲突**：战略 CRUD 与数据中心分支都修改 `App.jsx`、`strategyExecution.js` 和 `styles.css`。先合并战略，再合并数据中心，按“保留两者功能、合并 App 注册表、样式保持命名空间”解决；每次合并后运行完整测试。
- **普通员工看到战略数据**：`CollaborationProvider` 独立于 `PlatformProvider`；API 返回服务端范围，前端不能使用 `/api/platform` 兜底。
- **重复协同和钉钉待办**：事项业务幂等键和动作幂等键分别唯一；钉钉使用 `collaboration:<id>:v1`。
- **业务事实漂移**：适配器只保存来源和证据快照；协同详情始终标明事实时间和返回来源入口。
- **行动台信息过载**：只有 PRD 升级规则生成 `ExecutiveAction`，普通事项留在部门工作台。
- **D1 容量和大字段**：单项 payload 32KB、证据 20 项、分页 50/100，列表不读取活动全文。
- **钉钉失败**：协同写入先完成，钉钉失败独立记录并可重试；关闭功能开关即可停止新同步。
- **UI 回滚**：关闭 `VITE_EXECUTIVE_COLLABORATION_HUB` 后恢复原公司首页与导航；业务 App 和旧 API 不受影响。

## 验证命令

阶段命令：

```bash
node --test react-tests/collaboration-domain.test.mjs
node --test tests/collaboration-api.test.mjs
node --test react-tests/collaboration-provider.test.mjs
node --test react-tests/collaboration-ui.test.mjs react-tests/executive-action-desk.test.mjs
node --test react-tests/collaboration-adapters.test.mjs
node --test tests/collaboration-dingtalk.test.mjs
```

完整命令：

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm test
VITE_EXECUTIVE_COLLABORATION_HUB=true npm run build
```

浏览器验证使用本地 Vite 预览，不访问生产：

```bash
VITE_EXECUTIVE_COLLABORATION_HUB=true npm run dev -- --port 8137
```

## 任务顺序

### Task 1: 固化产品、平台和架构契约

**Files:**
- Create: `docs/features/executive-collaboration-hub/prd.md`
- Create: `docs/features/executive-collaboration-hub/design.md`
- Create: `docs/features/executive-collaboration-hub/plan.md`
- Create: `docs/features/executive-collaboration-hub/tasks.md`
- Create: `docs/platform/apis/collaboration-items-v1.md`
- Create: `docs/decisions/2026-07-18-cross-app-collaboration-contract.md`
- Modify: `docs/product/core-workflows.md`
- Modify: `docs/product/roles-and-permissions.md`
- Modify: `docs/product/data-definitions.md`
- Modify: `docs/platform/api-catalog.md`
- Modify: `docs/platform/error-codes.md`

**Interfaces:**
- Consumes: 已确认的产品边界和现有文档模板。
- Produces: 状态机、数据结构、权限、API、迁移和验收的唯一实现依据。

- [ ] **Step 1: 写完整功能和 API 文档**

  使用本计划列出的文件和契约，所有产品选择在提交前形成明确结论。

- [ ] **Step 2: 运行治理检查并确认文档完整**

  Run: `npm run check:governance`

  Expected: PASS，功能目录包含 PRD、design、plan、tasks，且所有必需章节存在。

- [ ] **Step 3: 自检设计与计划覆盖**

  Run: `git diff --check && npm run check:governance`

  Expected: 无输出。

- [ ] **Step 4: 提交文档基线**

  ```bash
  git add docs/features/executive-collaboration-hub docs/platform/apis/collaboration-items-v1.md docs/decisions/2026-07-18-cross-app-collaboration-contract.md docs/product docs/platform/api-catalog.md docs/platform/error-codes.md
  git commit -m "docs(collaboration): define cross-app execution hub"
  ```

### Task 2: 汇合已完成的战略和业务 App 依赖

**Files:**
- Merge: `codex/strategy-crud`
- Merge: `codex/data-center-app`
- Merge: `codex/brand-content-collaboration`
- Resolve if needed: `src/App.jsx`
- Resolve if needed: `src/main.jsx`
- Resolve if needed: `src/domain/strategyExecution.js`
- Resolve if needed: `src/styles.css`
- Resolve if needed: `package.json`

**Interfaces:**
- Consumes: 最新 `origin/main`、已完成战略 CRUD、供应链/数据中心 App 和品牌内容领域规则。
- Produces: 一个不合并 main 的本地集成基线，后续适配器拥有真实消费者代码。

- [ ] **Step 1: 合并战略 CRUD 分支**

  Run: `git merge --no-ff codex/strategy-crud -m "merge: include strategy execution baseline"`

  Resolution rule: 保留最新 main 的治理和平台集成文档，保留战略分支的 CRUD、归档、关键结果下钻和不可变记录规则。

- [ ] **Step 2: 验证战略合并**

  Run: `npm test`

  Expected: 所有 React 和 API 测试通过。

- [ ] **Step 3: 合并数据中心分支**

  Run: `git merge --no-ff codex/data-center-app -m "merge: include supply and data apps"`

  Resolution rule: `App.jsx` 同时保留战略、供应链和数据中心路由；`strategyExecution.js` 的 App 注册表包含 product-flow、supply-chain、data-center；`styles.css` 保留分区命名空间，不覆盖全局控件。

- [ ] **Step 4: 验证业务 App 合并**

  Run: `npm test && npm run build`

  Expected: 所有测试通过，构建无冲突标记和缺失导入。

- [ ] **Step 5: 合并品牌内容领域分支**

  Run: `git merge --no-ff codex/brand-content-collaboration -m "merge: include brand content domain baseline"`

  Expected: 只引入已确认文档、领域规则和领域测试，不伪造未完成的业务 UI。

- [ ] **Step 6: 验证无冲突残留**

  Run: `rg -n "^(<<<<<<<|=======|>>>>>>>)" src functions docs tests react-tests || true`

  Expected: 无输出。

### Task 3: 实现协同领域、权限和老板行动投影

**Files:**
- Create: `src/domain/collaboration.js`
- Create: `react-tests/collaboration-domain.test.mjs`
- Modify: `src/domain/permissions.js`
- Create: `src/domain/featureFlags.js`

**Interfaces:**
- Consumes: PRD 状态机、组织身份、业务来源草稿。
- Produces: `normalizeCollaborationDraft`、`collaborationTransitionsFor`、`applyCollaborationTransition`、`canReadCollaborationItem`、`filterCollaborationItems`、`buildExecutiveActions`。

- [ ] **Step 1: 写失败的领域测试**

  ```js
  test("a receiving department accepts one owner and appends an activity", () => {
    const result = applyCollaborationTransition(item, {
      transition: "accept",
      fields: { ownerUser: owner },
      idempotencyKey: "accept-1"
    }, receivingActor, now);
    assert.equal(result.item.status, "in_progress");
    assert.equal(result.item.ownerUser.userId, owner.userId);
    assert.deepEqual(result.activity.changedFields.sort(), ["ownerUser", "status"]);
  });

  test("executive actions exclude ordinary in-progress work", () => {
    assert.deepEqual(buildExecutiveActions([normalItem], now), []);
    assert.equal(buildExecutiveActions([blockedHighImpact], now)[0].reason, "high_impact_blocked");
  });
  ```

- [ ] **Step 2: 确认测试按预期失败**

  Run: `node --test react-tests/collaboration-domain.test.mjs`

  Expected: FAIL，因为 `src/domain/collaboration.js` 尚不存在。

- [ ] **Step 3: 实现最小领域函数**

  实现契约中的五种类型、七个状态、允许动作、决策关闭、原因要求、唯一责任、协同部门去重、可见范围、视图过滤、版本递增和行动排序。所有函数保持纯函数，不访问 React、浏览器、网络或 D1。

- [ ] **Step 4: 验证领域测试通过**

  Run: `node --test react-tests/collaboration-domain.test.mjs`

  Expected: PASS。

- [ ] **Step 5: 提交领域能力**

  ```bash
  git add src/domain/collaboration.js src/domain/permissions.js src/domain/featureFlags.js react-tests/collaboration-domain.test.mjs
  git commit -m "feat(collaboration): add governed workflow domain"
  ```

### Task 4: 实现细粒度 D1 API

**Files:**
- Create: `functions/api/platform/v1/_shared/collaborationValidation.js`
- Create: `functions/api/platform/v1/_shared/collaborationAuthorization.js`
- Create: `functions/api/platform/v1/_shared/collaborationStorage.js`
- Create: `functions/api/platform/v1/_shared/collaborationHttp.js`
- Create: `functions/api/platform/v1/collaboration-items.js`
- Create: `functions/api/platform/v1/collaboration-items/[id].js`
- Create: `functions/api/platform/v1/collaboration-items/[id]/activities.js`
- Create: `functions/api/platform/v1/collaboration-items/[id]/transitions.js`
- Create: `tests/collaboration-api.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: 领域状态机、公司会话和 `PRODUCT_FLOW_DB`。
- Produces: API 契约的集合、单项、活动和流转端点。

- [ ] **Step 1: 写认证、范围、幂等和版本失败测试**

  ```js
  test("department users cannot list unrelated collaboration items", async () => {
    const response = await listRoute({
      request: new Request("https://flow.example.com/api/platform/v1/collaboration-items"),
      env: { PRODUCT_FLOW_DB: db },
      data: { session: productUser }
    });
    const payload = await response.json();
    assert.deepEqual(payload.items.map(item => item.id), ["product-owned"]);
  });

  test("stale versions return a conflict without appending activity", async () => {
    const response = await transitionRoute(staleRequestContext);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, "COLLABORATION_VERSION_CONFLICT");
    assert.equal(db.activities.size, 0);
  });
  ```

- [ ] **Step 2: 确认 API 测试按预期失败**

  Run: `node --test tests/collaboration-api.test.mjs`

  Expected: FAIL，因为路由和存储模块尚不存在。

- [ ] **Step 3: 实现建表、参与者索引和集合端点**

  `collaboration_items` 的 payload 最大 32768 字节；`collaboration_participants` 对 `(subject_type, subject_id, item_id)` 建索引；GET 使用参与者 join 约束普通用户范围；POST 在同一 `db.batch` 写事项、参与者和 create 活动。

- [ ] **Step 4: 实现单项、活动、乐观锁和状态端点**

  PATCH 和 transition 使用 `WHERE id = ? AND version = ?`；受影响行数为 0 时读取当前版本并返回 409。活动动作幂等键建立唯一约束，重复请求返回已存在结果。

- [ ] **Step 5: 验证 API 测试通过**

  Run: `node --test tests/collaboration-api.test.mjs`

  Expected: PASS，覆盖 401、403、404、409、501、创建、读取、分页、归档和全部动作。

- [ ] **Step 6: 加入完整 API 测试脚本并提交**

  ```bash
  git add functions/api/platform/v1 tests/collaboration-api.test.mjs package.json
  git commit -m "feat(api): persist scoped collaboration items"
  ```

### Task 5: 实现协同客户端和 Provider

**Files:**
- Create: `src/state/collaborationApi.js`
- Create: `src/state/CollaborationProvider.jsx`
- Create: `react-tests/collaboration-provider.test.mjs`
- Modify: `src/main.jsx`

**Interfaces:**
- Consumes: v1 API 和 Auth/ProductFlow 组织身份。
- Produces: `useCollaboration` 页面接口；所有已登录员工挂载，但不加载总经办 `/api/platform`。

- [ ] **Step 1: 写失败的客户端与 Provider 契约测试**

  ```js
  test("collaboration client preserves server error codes", async () => {
    await assert.rejects(
      () => updateCollaborationItem("c1", { version: 1, patch: {} }, conflictFetch),
      error => error.code === "COLLABORATION_VERSION_CONFLICT" && error.status === 409
    );
  });
  ```

- [ ] **Step 2: 确认测试失败**

  Run: `node --test react-tests/collaboration-provider.test.mjs`

  Expected: FAIL，因为客户端和 Provider 尚不存在。

- [ ] **Step 3: 实现 API 客户端和 Provider**

  GET 支持 AbortController；写入成功替换单项并刷新活动；409 保留编辑草稿并暴露冲突；501 进入只读错误状态，不把 localStorage 当共享保存成功。

- [ ] **Step 4: 验证并提交**

  Run: `node --test react-tests/collaboration-provider.test.mjs react-tests/company-access-gate.test.mjs`

  ```bash
  git add src/state/collaborationApi.js src/state/CollaborationProvider.jsx src/main.jsx react-tests/collaboration-provider.test.mjs
  git commit -m "feat(collaboration): add scoped state provider"
  ```

### Task 6: 交付部门协同工作台

**Files:**
- Create: `src/features/collaboration/CollaborationPage.jsx`
- Create: `src/features/collaboration/CollaborationFilters.jsx`
- Create: `src/features/collaboration/CollaborationTable.jsx`
- Create: `src/features/collaboration/CollaborationDetailPanel.jsx`
- Create: `src/features/collaboration/CollaborationEditor.jsx`
- Create: `src/features/collaboration/CollaborationStatusBadge.jsx`
- Modify: `src/App.jsx`
- Modify: `src/domain/permissions.js`
- Modify: `src/styles.css`
- Create: `react-tests/collaboration-ui.test.mjs`

**Interfaces:**
- Consumes: `useCollaboration`、共享 UI、组织缓存和 feature flag。
- Produces: 总经办和普通员工均可按授权范围使用的 `#/collaboration`。

- [ ] **Step 1: 写失败的页面结构和权限测试**

  ```js
  test("department collaboration is available without mounting executive strategy", () => {
    assert.match(appSource, /部门协同/);
    assert.match(appSource, /CollaborationPage/);
    assert.doesNotMatch(mainSource, /<PlatformProvider enabled=\{true\}>/);
  });

  test("collaboration workspace exposes all responsibility views", () => {
    for (const label of ["待我部门接收", "执行中", "等待其他部门", "待我验收", "我参与的", "已完成"])
      assert.match(pageSource, new RegExp(label));
  });
  ```

- [ ] **Step 2: 确认 UI 测试失败**

  Run: `node --test react-tests/collaboration-ui.test.mjs`

  Expected: FAIL，因为页面和路由尚不存在。

- [ ] **Step 3: 实现页面、列表、详情和编辑器**

  桌面使用表格加详情面板，窄屏使用单列和全屏详情；动作来自领域允许动作，不在组件内重写状态规则。`OrgSelect` 只选择真实组织人员和部门。

- [ ] **Step 4: 添加响应式、焦点和状态样式**

  使用 `.collaboration-*` 命名空间；卡片半径不超过 12px；表头 `white-space: nowrap`；过渡 150–200ms；添加 `prefers-reduced-motion`。

- [ ] **Step 5: 验证 UI 和原外壳测试**

  Run: `node --test react-tests/collaboration-ui.test.mjs react-tests/platform-ui.test.mjs react-tests/company-access-gate.test.mjs`

  Expected: PASS。

- [ ] **Step 6: 提交工作台**

  ```bash
  git add src/features/collaboration src/App.jsx src/domain/permissions.js src/styles.css react-tests/collaboration-ui.test.mjs
  git commit -m "feat(collaboration): add department workbench"
  ```

### Task 7: 接入产品、供应链、数据中心和品牌内容草稿

**Files:**
- Create: `src/domain/collaborationAdapters/productFlow.js`
- Create: `src/domain/collaborationAdapters/supplyChain.js`
- Create: `src/domain/collaborationAdapters/dataCenter.js`
- Create: `src/domain/collaborationAdapters/brandContent.js`
- Create: `src/features/collaboration/AppCollaborationButton.jsx`
- Modify: `src/features/progress/ProductProgressPage.jsx`
- Modify: `src/features/supply-chain/InventoryWorkspace.jsx`
- Modify: `src/features/supply-chain/ApprovalWorkspace.jsx`
- Modify: `src/features/supply-chain/QualityWorkspace.jsx`
- Modify: `src/features/data-center/DataGovernanceWorkspaces.jsx`
- Create: `react-tests/collaboration-adapters.test.mjs`

**Interfaces:**
- Consumes: 各 App 真实业务记录和统一编辑器。
- Produces: 符合 `CollaborationDraft` 的上下文入口；不直接写 API。

- [ ] **Step 1: 写失败的适配器测试**

  ```js
  test("inventory risk drafts preserve the supply source and requested action", () => {
    const draft = buildSupplyChainCollaborationDraft({ kind: "inventory_risk", record: risk, product, route: "#/supply-inventory" });
    assert.equal(draft.kind, "risk");
    assert.equal(draft.source.appId, "supply-chain");
    assert.match(draft.requestedAction, /补货|到货|库存/);
  });

  test("data issues never copy provider credentials", () => {
    const draft = buildDataCenterCollaborationDraft({ kind: "source_stale", record: { ...source, token: "secret" } });
    assert.doesNotMatch(JSON.stringify(draft), /secret|token/);
  });
  ```

- [ ] **Step 2: 确认测试失败**

  Run: `node --test react-tests/collaboration-adapters.test.mjs`

  Expected: FAIL，因为四个适配器尚不存在。

- [ ] **Step 3: 实现纯函数适配器**

  每个适配器只保留安全来源、证据、建议类型、建议影响和建议下一步；人员、部门和截止由用户确认。

- [ ] **Step 4: 接入三个已完成 App 的行操作**

  行操作使用 `AppCollaborationButton`；品牌内容只导出适配器并通过测试，等待业务 UI 完成后接按钮。

- [ ] **Step 5: 验证并提交**

  Run: `node --test react-tests/collaboration-adapters.test.mjs react-tests/collaboration-ui.test.mjs`

  ```bash
  git add src/domain/collaborationAdapters src/features/collaboration/AppCollaborationButton.jsx src/features/progress/ProductProgressPage.jsx src/features/supply-chain src/features/data-center react-tests/collaboration-adapters.test.mjs
  git commit -m "feat(collaboration): connect business app drafts"
  ```

### Task 8: 把公司首页改成老板行动台并升级 App 中心

**Files:**
- Create: `src/features/company/ExecutiveActionDesk.jsx`
- Modify: `src/features/company/CompanyHomePage.jsx`
- Modify: `src/features/platform/AppCenterPage.jsx`
- Modify: `src/domain/strategyExecution.js`
- Modify: `src/styles.css`
- Create: `react-tests/executive-action-desk.test.mjs`
- Modify: `react-tests/platform-ui.test.mjs`

**Interfaces:**
- Consumes: `buildExecutiveActions`、协同事项、现有战略/项目摘要和 App 注册表。
- Produces: 行动驱动公司首页和 App 协同健康表。

- [ ] **Step 1: 写失败的行动优先级测试**

  ```js
  test("executive home leads with decisions and coordination instead of metric counts", () => {
    assert.match(homeSource, /ExecutiveActionDesk/);
    assert.match(actionSource, /今天需要处理/);
    assert.match(actionSource, /重要变化/);
    assert.doesNotMatch(homeSource, /<MetricStrip/);
  });
  ```

- [ ] **Step 2: 确认测试失败**

  Run: `node --test react-tests/executive-action-desk.test.mjs`

  Expected: FAIL，因为行动台尚不存在且旧 MetricStrip 仍在首屏。

- [ ] **Step 3: 实现行动台和导航**

  默认公司首页视图为行动台；个人待办保留为同级视图。行动行支持进入协同详情、来源 App、战略或重点项目。

- [ ] **Step 4: 升级 App 中心**

  App 行展示协议接入、数据新鲜度、未关闭协同和高影响阻塞；未接入品牌 UI 显示真实待接入状态。

- [ ] **Step 5: 验证并提交**

  Run: `node --test react-tests/executive-action-desk.test.mjs react-tests/platform-ui.test.mjs react-tests/strategy-execution.test.mjs`

  ```bash
  git add src/features/company/ExecutiveActionDesk.jsx src/features/company/CompanyHomePage.jsx src/features/platform/AppCenterPage.jsx src/domain/strategyExecution.js src/styles.css react-tests/executive-action-desk.test.mjs react-tests/platform-ui.test.mjs
  git commit -m "feat(executive): prioritize decisions and coordination"
  ```

### Task 9: 平台统一同步钉钉待办

**Files:**
- Create: `functions/api/platform/v1/collaboration-items/[id]/dingtalk.js`
- Create: `src/domain/collaborationNotifications.js`
- Modify: `src/state/collaborationApi.js`
- Modify: `src/state/CollaborationProvider.jsx`
- Modify: `src/features/collaboration/CollaborationDetailPanel.jsx`
- Create: `tests/collaboration-dingtalk.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: 已接收事项、稳定人员 union ID、现有 `getDingAccessToken` 和 `syncDingTodoTask`。
- Produces: 稳定 `collaboration:<itemId>:v1` 待办和安全同步元数据。

- [ ] **Step 1: 写失败的钉钉同步测试**

  ```js
  test("collaboration todo uses one stable source id", async () => {
    const payload = buildCollaborationTodoPayload(item, actor, "https://flow.example.com/#/collaboration/c1");
    assert.equal(payload.sourceId, "collaboration:c1:v1");
    assert.deepEqual(payload.executorUnionIds, [item.ownerUser.unionId]);
  });

  test("DingTalk failure does not roll back collaboration state", async () => {
    const response = await dingRoute(failingDingContext);
    assert.equal(response.status, 502);
    assert.equal(db.items.get("c1").status, "in_progress");
  });
  ```

- [ ] **Step 2: 确认测试失败**

  Run: `node --test tests/collaboration-dingtalk.test.mjs`

  Expected: FAIL，因为通知领域和平台端点尚不存在。

- [ ] **Step 3: 实现平台端同步和元数据保存**

  服务端从 D1 读取授权事项、构造待办、调用现有 DingTalk 适配器，再用版本锁保存 `dingTodo`；原始钉钉响应不写日志或浏览器。

- [ ] **Step 4: 实现 UI 同步和重试状态**

  只有已确认主负责人和有效 union ID 时启用；失败显示中文摘要、request ID 和重试，不撤销协同动作。

- [ ] **Step 5: 验证并提交**

  Run: `node --test tests/collaboration-dingtalk.test.mjs tests/dingtalk-sync.test.mjs react-tests/collaboration-ui.test.mjs`

  ```bash
  git add functions/api/platform/v1/collaboration-items src/domain/collaborationNotifications.js src/state/collaborationApi.js src/state/CollaborationProvider.jsx src/features/collaboration/CollaborationDetailPanel.jsx tests/collaboration-dingtalk.test.mjs package.json
  git commit -m "feat(collaboration): sync governed DingTalk todos"
  ```

### Task 10: 完整验证、视觉审计和交付

**Files:**
- Modify if defects found: 当前任务直接相关文件
- Update: `docs/features/executive-collaboration-hub/tasks.md`

**Interfaces:**
- Consumes: 全部实现。
- Produces: 可本地验收、无生产副作用的功能分支和测试页面。

- [ ] **Step 1: 运行仓库完整质量门**

  ```bash
  npm run lint
  npm run check:governance
  npm run check:integrations
  npm test
  VITE_EXECUTIVE_COLLABORATION_HUB=true npm run build
  ```

  Expected: 全部退出码 0，无警告性冲突标记、缺失导入或超大构建块。

- [ ] **Step 2: 启动本地测试页**

  Run: `VITE_EXECUTIVE_COLLABORATION_HUB=true npm run dev -- --port 8137`

  Expected: `http://127.0.0.1:8137/` 可打开；不请求生产 D1 写入，不发送真实钉钉待办。

- [ ] **Step 3: 浏览器验证主要任务**

  依次检查总经办老板行动台、普通部门待接收、执行中、阻塞、待验收、App 内发起、重复来源、409、501 和钉钉失败状态。

- [ ] **Step 4: 验证响应式和无障碍**

  检查 1440、1280、1024 和 390 像素；键盘完成标签切换、筛选、打开详情和允许动作；确认焦点恢复、表头单行、无双滚动和 WCAG AA 对比度。

- [ ] **Step 5: 更新任务记录并检查提交范围**

  Run: `git status --short && git diff --check`

  Expected: 只包含本功能文件，无尾随空格和无关用户改动。

- [ ] **Step 6: 提交验证修正**

  ```bash
  git add docs/features/executive-collaboration-hub/tasks.md
  git commit -m "test(collaboration): verify executive coordination hub"
  ```
