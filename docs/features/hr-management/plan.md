# 人事管理 Phase 1A 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付可运行的人事管理 App 第一阶段，完成员工任职、入转调离、绩效项目、员工自评、系统建议分、主管终评和冻结证据闭环。

**Architecture:** 人事纯规则位于 `src/domain/hrManagement.js`；React 页面通过 `HrManagementProvider` 调用认证后的 `/api/hr-management`；Pages Function 按当前钉钉身份和人事角色裁剪字段，并使用独立 D1 表保存核心人事和绩效记录。业务 App 只通过稳定 `WorkEvidenceRef` 提供只读证据，钉钉本期只复用已连接的登录与组织通讯录。

**Tech Stack:** React 19、Vite 7、Node test runner、Cloudflare Pages Functions、Cloudflare D1、现有钉钉组织 API、Lucide React、项目共享 UI。

## Global Constraints

- App ID 固定为 `hr-management`，分组名称固定为“人事管理”。
- Phase 1A 只实现人事核心与绩效；考勤假期和工资核算分别由 Phase 1B、Phase 1C 计划交付。
- 新员工必须绑定钉钉 `userId` 或 `unionId`；姓名不是唯一身份。
- 员工自评分、系统建议分和主管终评分分别保存，任何一类分数不得覆盖另一类。
- 系统建议分只由版本化确定性规则产生；AI 不写入评分字段。
- 主管不能读取完整工资；Phase 1A API 不返回任何工资字段。
- 业务证据只读，人事 App 不修改源任务或源复盘。
- 钉钉考勤、请假、加班和审批不得描述为已接通。
- 所有写入由服务端按会话、角色、人员范围和乐观版本校验。
- 不部署、不发送真实钉钉动作、不导入真实员工或工资数据。

---

## 计划边界

本规格包含三个独立子系统，按可独立验收的软件切片拆分：

- **本计划 Phase 1A**：人事核心与绩效闭环。
- **Phase 1B 独立计划**：工作日历、考勤、假期、加班、导入、异常确认和考勤冻结。
- **Phase 1C 独立计划**：薪资项、计薪规则、工资调整、工资批次、财务确认、工资条和补差。

Phase 1A 的导航会登记全部八个长期入口，但“考勤与假期”和“工资核算”只显示真实接入状态与阶段边界，不保存记录、不展示演示数字，也不宣称功能完成。

## 文件职责

- `src/domain/hrManagement.js`：人事状态规范化、有效期、角色范围、绩效校验、建议分、状态机、证据快照和审计纯函数。
- `src/state/hrManagementApi.js`：人事 API 请求、错误规范化和查询参数。
- `src/state/HrManagementProvider.jsx`：加载、缓存、动作提交、并发刷新和本地空状态编排。
- `src/features/hr-management/HrManagementAppPage.jsx`：八个入口装配，不包含领域计算。
- `src/features/hr-management/HrOverview.jsx`：角色化待办和风险。
- `src/features/hr-management/EmployeeDirectoryWorkspace.jsx`：员工与有效期任职。
- `src/features/hr-management/LifecycleWorkspace.jsx`：入转调离事件和任务。
- `src/features/hr-management/PerformanceWorkspace.jsx`：周期、项目、证据、自评、终评、复核和冻结。
- `src/features/hr-management/HrTaskWorkspace.jsx`：聚合当前用户人事待办。
- `src/features/hr-management/HrSettingsWorkspace.jsx`：Phase 1A 绩效模板、角色授权和集成状态。
- `src/features/hr-management/PhaseStatusWorkspace.jsx`：考勤与工资的真实未接入状态，不持久化业务数据。
- `src/features/hr-management/hr-management.css`：人事 App 局部布局、状态和响应式规则。
- `functions/api/hr-management.js`：认证路由、资源读取、动作执行、权限、版本冲突和安全错误。
- `functions/api/hr-management/_shared/storage.js`：D1 建表兼容、分资源查询、事务式写入和审计。
- `functions/api/hr-management/_shared/permissions.js`：会话到人事角色和人员范围的服务端授权。
- `migrations/0002_hr_management_core.sql`：Phase 1A 独立人事核心表。
- `react-tests/hr-management-domain.test.mjs`：纯规则测试。
- `react-tests/hr-management-navigation.test.mjs`：App 注册、导航和页面契约。
- `react-tests/hr-management-ui.test.mjs`：关键文案、状态、敏感边界和响应式结构。
- `tests/hr-management-api.test.mjs`：认证、权限、字段裁剪、动作、冲突和 D1 缺失。
- `tests/hr-management-migration.test.mjs`：迁移与环境能力表名一致性。
- `docs/platform/environment-capabilities.json`：登记 Phase 1A D1 表。
- `docs/platform/integration-registry.json`：扩展 Cloudflare D1 代码路径、表能力和人事边界说明；钉钉能力列表保持不新增考勤。
- `docs/platform/api-catalog.md`：登记内部 `/api/hr-management` 契约和错误码。
- `docs/product/roles-and-permissions.md`、`docs/product/core-workflows.md`、`docs/product/data-definitions.md`：写回长期人事角色、流程和跨 App 证据定义。

## 接口与契约

### 领域接口

```js
createEmptyHrManagementState() => {
  version: 0,
  employees: [], assignments: [], roleAssignments: [],
  lifecycleEvents: [], performanceTemplates: [],
  performanceCycles: [], performanceItems: [],
  evidenceSnapshots: [], auditLogs: [], sourceMode: "empty"
}

normalizeHrManagementState(input) => HrManagementState
activeAssignment(assignments, employeeId, atDate) => Assignment | null
validatePerformanceItems(items) => { valid, errors, totalWeight }
computeSuggestedScore(item, evidence) => { score: number | null, explanation, missing[] }
reduceHrManagementState(state, action) => HrManagementState
buildHrOverview(state, viewer, now) => { priorities, risks, counts }
```

允许的 Phase 1A 动作：

```js
"upsert_employee"
"upsert_assignment"
"upsert_lifecycle_event"
"transition_lifecycle_event"
"upsert_performance_template"
"upsert_performance_cycle"
"upsert_performance_item"
"submit_self_review"
"submit_manager_review"
"request_performance_review"
"resolve_performance_review"
"freeze_performance_cycle"
```

### API 契约

`GET /api/hr-management?resource=bootstrap` 返回当前会话可见的：

```json
{
  "synced": true,
  "version": 7,
  "scope": { "roles": ["employee"], "employeeId": "emp-u1", "managedEmployeeIds": [] },
  "state": {
    "employees": [],
    "assignments": [],
    "lifecycleEvents": [],
    "performanceTemplates": [],
    "performanceCycles": [],
    "performanceItems": [],
    "evidenceSnapshots": []
  },
  "meta": { "sourceMode": "shared", "updatedAt": "2026-07-19T00:00:00.000Z" }
}
```

`POST /api/hr-management` 接收：

```json
{
  "version": 7,
  "action": {
    "type": "submit_self_review",
    "employeeId": "emp-u1",
    "cycleId": "cycle-2026-07",
    "items": [{ "itemId": "item-1", "selfScore": 88, "selfComment": "按期完成" }]
  }
}
```

成功返回新版本与当前会话裁剪后的状态；版本冲突返回 `409 HR_VERSION_CONFLICT`。主要错误码：`AUTH_SESSION_REQUIRED`、`HR_STORAGE_UNAVAILABLE`、`HR_READ_DENIED`、`HR_WRITE_DENIED`、`HR_SCOPE_DENIED`、`HR_ACTION_INVALID`、`HR_VERSION_CONFLICT`、`HR_STATE_CORRUPT`。

### D1 表

- `hr_employees`
- `hr_assignments`
- `hr_role_assignments`
- `hr_lifecycle_events`
- `hr_performance_templates`
- `hr_performance_cycles`
- `hr_performance_items`
- `hr_evidence_snapshots`
- `hr_audit_logs`
- `hr_management_meta`

所有表使用文本 ID；业务记录包含 `version`、`created_at`、`updated_at`、`updated_by`。工资字段不出现在 Phase 1A 表中。

## 数据迁移

- Migration `0002` 只创建新表和索引，不读取或修改 `product_flow_state`、`platform_state`、品牌、销售或组织缓存表。
- 首次启动无记录时返回空状态，不把演示员工写入 D1。
- 本地预览使用内存空状态；可通过测试 fixture 展示示例，但 fixture 不进入生产 API。
- `hr_management_meta` 保存公司级乐观版本和更新时间；批量动作在 D1 batch 内写业务行、元数据和审计。
- 容量按员工、绩效项目和周期线性增长；证据只保存摘要和稳定引用，不复制文件或完整业务响应。
- 回滚关闭功能开关并停止 API 写入；新表保留以便恢复，不执行破坏性删除。

## 风险与回滚

- **敏感数据越权**：API 在查询前计算 scope，响应白名单不包含工资或其他员工私有自评；契约测试覆盖员工、主管、人事、财务和未授权身份。
- **组织姓名重复**：新员工没有 `userId`/`unionId` 时拒绝转正式；历史姓名只读兼容。
- **大状态并发覆盖**：使用公司版本拒绝旧写入；动作只更新相关资源并写审计。
- **业务证据漂移**：保存来源版本与取得时间；冻结后使用快照，不自动追溯改写。
- **钉钉能力误报**：只读取现有组织 API；设置页明确显示考勤和审批未接入。
- **主导航高触达风险**：新增 `HR_NAV` 常量和统一页面装配，避免继续扩张 `pages` 中的重复分支；回滚时移除分组、Provider 和 App 注册。
- **环境漂移**：表名进入环境能力清单并生成模块；Preview/Production 分别验证，未部署时不声明生产就绪。

## 验证命令

阶段测试：

```bash
node --test react-tests/hr-management-domain.test.mjs
node --test react-tests/hr-management-navigation.test.mjs
node --test react-tests/hr-management-ui.test.mjs
node --test tests/hr-management-api.test.mjs
node --test tests/hr-management-migration.test.mjs
```

平台清单：

```bash
npm run generate:platform-manifests
npm run check:environment-capabilities
npm run check:integrations
```

Definition of Done：

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

UI 验收：1440、1280、900、640、390px；键盘、焦点、空/错/禁用/只读/过期/并发冲突；钉钉 WebView 单独验证。生产验证只在获得部署授权后执行。

---

### Task 1: 人事环境能力与迁移契约

**Files:**
- Create: `migrations/0002_hr_management_core.sql`
- Create: `tests/hr-management-migration.test.mjs`
- Modify: `docs/platform/environment-capabilities.json`
- Modify: `docs/platform/integration-registry.json`
- Modify: `functions/api/platform/_generated/environmentCapabilities.js`
- Modify: `functions/api/platform/_generated/integrationRegistry.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `PRODUCT_FLOW_DB` 现有 D1 绑定与 `generate:platform-manifests`。
- Produces: 十张 Phase 1A 表的可执行迁移和环境就绪契约。

- [ ] **Step 1: 写失败的迁移契约测试**

```js
test("HR core tables stay aligned across migration and environment manifest", () => {
  const expected = ["hr_employees", "hr_assignments", "hr_role_assignments", "hr_lifecycle_events", "hr_performance_templates", "hr_performance_cycles", "hr_performance_items", "hr_evidence_snapshots", "hr_audit_logs", "hr_management_meta"];
  for (const table of expected) assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.deepEqual(capability.tables, expected);
});
```

- [ ] **Step 2: 验证测试因迁移和能力不存在而失败**

Run: `node --test tests/hr-management-migration.test.mjs`

Expected: FAIL，指出 `0002_hr_management_core.sql` 或 `hr-management-core` capability 不存在。

- [ ] **Step 3: 创建迁移并登记环境能力**

迁移为十张表创建主键、JSON payload/显式索引字段、版本、时间和操作者字段，并为员工钉钉身份、任职有效期、绩效周期员工组合创建索引。环境能力 ID 使用 `hr-management-core`，平台为 `cloudflare-pages`、`cloudflare-d1`，Preview/Production 均为 blocking。

- [ ] **Step 4: 更新注册表并重新生成平台模块**

Run: `npm run generate:platform-manifests`

Expected: 生成模块包含 `hr-management-core` 和新增表；钉钉 capabilities 仍不包含考勤、请假或审批。

- [ ] **Step 5: 运行迁移、环境与集成测试**

Run: `node --test tests/hr-management-migration.test.mjs tests/environment-capabilities.test.mjs && npm run check:environment-capabilities && npm run check:integrations`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add migrations/0002_hr_management_core.sql tests/hr-management-migration.test.mjs docs/platform/environment-capabilities.json docs/platform/integration-registry.json functions/api/platform/_generated/environmentCapabilities.js functions/api/platform/_generated/integrationRegistry.js package.json
git commit -m "build(hr): add core data contract"
```

### Task 2: 人事领域规则与角色范围

**Files:**
- Create: `src/domain/hrManagement.js`
- Create: `react-tests/hr-management-domain.test.mjs`

**Interfaces:**
- Consumes: `HrManagementState`、当前日期、当前会话身份和 `WorkEvidenceRef`。
- Produces: `createEmptyHrManagementState`、`normalizeHrManagementState`、`activeAssignment`、`validatePerformanceItems`、`computeSuggestedScore`、`reduceHrManagementState`、`buildHrOverview`。

- [ ] **Step 1: 写身份、权重、三类分数、状态机和冻结失败测试**

```js
assert.equal(activeAssignment(assignments, "emp-1", "2026-07-19").positionName, "运营");
assert.deepEqual(validatePerformanceItems([{ weight: 60 }, { weight: 40 }]), { valid: true, errors: [], totalWeight: 100 });
assert.equal(computeSuggestedScore(item, evidence).score, 85);
assert.equal(frozen.items[0].selfScore, 82);
assert.equal(frozen.items[0].suggestedScore, 85);
assert.equal(frozen.items[0].managerScore, 88);
```

- [ ] **Step 2: 验证测试因模块不存在而失败**

Run: `node --test react-tests/hr-management-domain.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现最小纯函数与动作白名单**

规则必须拒绝无稳定身份正式员工、权重不等于 100、无评分规则项目、缺失证据却伪造 0 分、第二次复核申请和未完成复核的冻结。

- [ ] **Step 4: 运行领域测试**

Run: `node --test react-tests/hr-management-domain.test.mjs`

Expected: PASS，覆盖正常、空数据、非法动作和冻结快照。

- [ ] **Step 5: 提交**

```bash
git add src/domain/hrManagement.js react-tests/hr-management-domain.test.mjs
git commit -m "feat(hr): add core domain rules"
```

### Task 3: D1 存储、认证 API 与字段裁剪

**Files:**
- Create: `functions/api/hr-management.js`
- Create: `functions/api/hr-management/_shared/storage.js`
- Create: `functions/api/hr-management/_shared/permissions.js`
- Create: `tests/hr-management-api.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1 表结构、Task 2 领域动作、`context.data.session` 和 `PRODUCT_FLOW_DB`。
- Produces: `GET /api/hr-management?resource=bootstrap`、`POST /api/hr-management`、`readHrScope(session, db)`、`readScopedHrState(db, scope)`、`applyHrAction(db, expectedVersion, action, actor)`。

- [ ] **Step 1: 写 API 失败测试**

```js
assert.equal((await call({ session: null })).status, 401);
assert.equal((await call({ session: outsider })).status, 403);
assert.equal((await employeeGet()).body.state.employees.length, 1);
assert.equal((await employeeGet()).body.state.performanceItems.some(item => item.employeeId !== "emp-u1"), false);
assert.equal((await employeeAfterFinalReview()).body.state.performanceItems[0].managerScore, 88);
assert.equal((await managerReadsPayroll()).status, 404);
assert.equal((await staleWrite()).status, 409);
```

- [ ] **Step 2: 验证路由不存在而失败**

Run: `node --test tests/hr-management-api.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现服务端角色和人员范围**

`employee` 只能读取本人；`manager` 读取当前有效任职中由本人管理的员工；`hr_admin` 按角色授权范围读取；`executive` 读取汇总和非工资 Phase 1A 数据。角色来自 `hr_role_assignments` 与当前会话稳定身份，不依赖自由文本姓名。

当 `hr_role_assignments` 为空时，现有总经办最高权限会话可以创建第一条 `hr_admin` 授权；首条授权建立后，后续授权统一走人事角色动作和审计，不能继续依赖初始化旁路。

- [ ] **Step 4: 实现资源查询、动作写入、审计和冲突**

POST 仅接受动作白名单；操作者和时间来自服务端；D1 batch 同时写业务表、`hr_management_meta` 和 `hr_audit_logs`。错误响应包含稳定 `error.code`、安全中文 `message`、`requestId` 和 `retryable`。

- [ ] **Step 5: 运行 API 与回归测试**

Run: `node --test tests/hr-management-api.test.mjs tests/dingtalk-web-auth.test.mjs tests/platform-api.test.mjs`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add functions/api/hr-management.js functions/api/hr-management/_shared/storage.js functions/api/hr-management/_shared/permissions.js tests/hr-management-api.test.mjs package.json
git commit -m "feat(hr): add authenticated core API"
```

### Task 4: Provider 与本地空状态

**Files:**
- Create: `src/state/hrManagementApi.js`
- Create: `src/state/HrManagementProvider.jsx`
- Create: `react-tests/hr-management-provider.test.mjs`
- Modify: `src/main.jsx`

**Interfaces:**
- Consumes: Task 3 bootstrap/POST 契约和 `useAuth()`。
- Produces: `HrManagementProvider` 与 `useHrManagement()`，返回 `{ state, scope, version, loading, saving, error, meta, dispatchAction, refresh }`。

- [ ] **Step 1: 写 Provider 契约失败测试**

```js
assert.match(provider, /export function HrManagementProvider/);
assert.match(provider, /export function useHrManagement/);
assert.match(provider, /dispatchAction/);
assert.match(main, /<HrManagementProvider>/);
assert.doesNotMatch(provider, /localStorage|salary|payroll/i);
```

- [ ] **Step 2: 验证文件不存在而失败**

Run: `node --test react-tests/hr-management-provider.test.mjs`

Expected: FAIL with missing file。

- [ ] **Step 3: 实现 API 客户端和 Provider**

初始 GET 失败时保留空状态；仅 localhost 的 501 使用 `sourceMode: "local-empty"`，不生成示例员工。POST 成功替换服务端裁剪状态；409 自动刷新一次并保留动作供用户重试，不静默重复写入。

- [ ] **Step 4: 运行 Provider 和认证回归测试**

Run: `node --test react-tests/hr-management-provider.test.mjs react-tests/react-app.test.mjs`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/state/hrManagementApi.js src/state/HrManagementProvider.jsx react-tests/hr-management-provider.test.mjs src/main.jsx
git commit -m "feat(hr): add management provider"
```

### Task 5: App 注册、导航与权限

**Files:**
- Create: `src/features/hr-management/HrManagementAppPage.jsx`
- Create: `react-tests/hr-management-navigation.test.mjs`
- Modify: `src/App.jsx`
- Modify: `src/domain/permissions.js`
- Modify: `src/domain/strategyExecution.js`

**Interfaces:**
- Consumes: `HrManagementProvider`、现有导航权限和 App Center 注册协议。
- Produces: `HR_NAV`、八个稳定 route key、`HrManagementAppPage({ section })` 和 App Center `hr-management` 记录。

- [ ] **Step 1: 写导航和顺序失败测试**

```js
for (const route of ["hr-overview", "hr-employees", "hr-lifecycle", "hr-performance", "hr-attendance", "hr-payroll", "hr-tasks", "hr-settings"]) assert.match(app, new RegExp(route));
assert.ok(app.indexOf("品牌内容协同") < app.indexOf("人事管理"));
assert.ok(app.indexOf("人事管理") < app.indexOf("平台"));
assert.match(registry, /id: "hr-management"/);
```

- [ ] **Step 2: 验证导航测试失败**

Run: `node --test react-tests/hr-management-navigation.test.mjs`

Expected: FAIL，指出 HR routes 和 App registry 缺失。

- [ ] **Step 3: 添加集中式 HR 导航和最小页面装配**

`App.jsx` 只登记一个懒加载 `HrManagementAppPage`，通过 route-to-section 映射传入 section，避免为八页增加八个顶层 import。默认权限允许已登录员工看到个人相关入口；管理动作仍由 API scope 控制。

- [ ] **Step 4: 运行导航、权限和 App Center 回归测试**

Run: `node --test react-tests/hr-management-navigation.test.mjs react-tests/shared-state.test.mjs react-tests/platform-ui.test.mjs`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/features/hr-management/HrManagementAppPage.jsx react-tests/hr-management-navigation.test.mjs src/App.jsx src/domain/permissions.js src/domain/strategyExecution.js
git commit -m "feat(hr): register management app"
```

### Task 6: 人事核心工作区

**Files:**
- Create: `src/features/hr-management/HrOverview.jsx`
- Create: `src/features/hr-management/EmployeeDirectoryWorkspace.jsx`
- Create: `src/features/hr-management/LifecycleWorkspace.jsx`
- Create: `src/features/hr-management/HrTaskWorkspace.jsx`
- Create: `react-tests/hr-management-ui.test.mjs`
- Modify: `src/features/hr-management/HrManagementAppPage.jsx`

**Interfaces:**
- Consumes: `useHrManagement()` 和 Task 2 `buildHrOverview`。
- Produces: 角色化总览、员工任职列表、异动时间线和本人待办。

- [ ] **Step 1: 写工作区状态和隐私失败测试**

```js
for (const copy of ["人事总览", "员工与岗位", "入转调离", "人事任务", "数据来源", "生效日期"]) assert.match(source, new RegExp(copy));
assert.match(source, /OrgSelect/);
assert.match(source, /disabledReason/);
assert.doesNotMatch(source, /身份证|银行卡|个人手机号/);
```

- [ ] **Step 2: 验证组件缺失而失败**

Run: `node --test react-tests/hr-management-ui.test.mjs`

Expected: FAIL with missing workspace files。

- [ ] **Step 3: 实现总览、员工任职、异动和任务**

空状态按角色给出下一步；员工选择使用 `OrgSelect`；正式保存前要求稳定身份、生效日、岗位和直属主管。异动推进展示阻断任务，不能用单个开关直接完成生效。

- [ ] **Step 4: 运行 UI、领域和 API 测试**

Run: `node --test react-tests/hr-management-ui.test.mjs react-tests/hr-management-domain.test.mjs tests/hr-management-api.test.mjs`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/features/hr-management/HrOverview.jsx src/features/hr-management/EmployeeDirectoryWorkspace.jsx src/features/hr-management/LifecycleWorkspace.jsx src/features/hr-management/HrTaskWorkspace.jsx react-tests/hr-management-ui.test.mjs src/features/hr-management/HrManagementAppPage.jsx
git commit -m "feat(hr): add people operations workspaces"
```

### Task 7: 绩效、自评、终评与冻结

**Files:**
- Create: `src/features/hr-management/PerformanceWorkspace.jsx`
- Create: `src/features/hr-management/PerformanceEvidencePanel.jsx`
- Create: `src/features/hr-management/PerformanceScorePanel.jsx`
- Modify: `react-tests/hr-management-ui.test.mjs`
- Modify: `src/features/hr-management/HrManagementAppPage.jsx`

**Interfaces:**
- Consumes: `performanceCycles`、`performanceItems`、`evidenceSnapshots`、`scope` 和 `dispatchAction`。
- Produces: 主管定项、员工自评、建议分解释、终评、一次复核和冻结工作台。

- [ ] **Step 1: 写绩效链和 AI 边界失败测试**

```js
for (const copy of ["目标与权重", "业务证据", "员工自评", "系统建议分", "主管终评", "确认或复核", "冻结绩效"]) assert.match(performance, new RegExp(copy));
assert.match(performance, /AI 仅辅助归纳证据/);
assert.doesNotMatch(performance, /AI评分|自动终评/);
```

- [ ] **Step 2: 验证绩效组件不存在而失败**

Run: `node --test react-tests/hr-management-ui.test.mjs`

Expected: FAIL，指出绩效组件或文案缺失。

- [ ] **Step 3: 实现绩效工作台**

主管表单实时显示权重合计；员工视图只编辑自己的自评；三类分数并列且标签固定。证据卡显示来源 App、版本、验收状态和取得时间，并提供回源链接但没有写入控件。

- [ ] **Step 4: 实现复核和冻结阻断状态**

冻结按钮列出未提交自评、未终评、待复核和无证据项目；主管分数偏离建议分超过模板阈值时要求解释但允许提交。

- [ ] **Step 5: 运行绩效全链测试**

Run: `node --test react-tests/hr-management-domain.test.mjs react-tests/hr-management-ui.test.mjs tests/hr-management-api.test.mjs`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/features/hr-management/PerformanceWorkspace.jsx src/features/hr-management/PerformanceEvidencePanel.jsx src/features/hr-management/PerformanceScorePanel.jsx react-tests/hr-management-ui.test.mjs src/features/hr-management/HrManagementAppPage.jsx
git commit -m "feat(hr): add performance review workflow"
```

### Task 8: 设置、阶段状态与响应式界面

**Files:**
- Create: `src/features/hr-management/HrSettingsWorkspace.jsx`
- Create: `src/features/hr-management/PhaseStatusWorkspace.jsx`
- Create: `src/features/hr-management/hr-management.css`
- Modify: `src/features/hr-management/HrManagementAppPage.jsx`
- Modify: `src/main.jsx`
- Modify: `react-tests/hr-management-ui.test.mjs`

**Interfaces:**
- Consumes: Phase 1A 模板与角色数据、集成注册表状态。
- Produces: 绩效模板/角色设置、考勤工资真实阶段说明、完整响应式与无障碍状态。

- [ ] **Step 1: 写未接入状态和 CSS 失败测试**

```js
assert.match(status, /钉钉考勤能力尚未完成接入验证/);
assert.match(status, /当前不自动同步/);
assert.match(status, /Phase 1B|Phase 1C/);
assert.match(css, /@media \(max-width: 900px\)/);
assert.match(css, /@media \(max-width: 640px\)/);
assert.match(css, /@media \(max-width: 390px\)/);
assert.match(css, /prefers-reduced-motion/);
```

- [ ] **Step 2: 验证测试失败**

Run: `node --test react-tests/hr-management-ui.test.mjs`

Expected: FAIL，指出阶段状态和响应式样式缺失。

- [ ] **Step 3: 实现设置和阶段状态**

设置页只维护绩效模板、角色授权和只读集成状态；不显示密码、Cookie、Token、工资规则或伪造连接按钮。考勤与工资页面提供边界、依赖、责任人和下一阶段说明。

- [ ] **Step 4: 完成视觉和无障碍样式**

复用现有 Token，桌面主次两列、900px 单列、640px 表单单列、390px 仅表格容器横向滚动；焦点可见、状态不只依赖颜色、减少动效生效。

- [ ] **Step 5: 运行 UI 与构建**

Run: `node --test react-tests/hr-management-ui.test.mjs react-tests/hr-management-navigation.test.mjs && npm run build`

Expected: PASS，且无新增超大 chunk 警告。

- [ ] **Step 6: 提交**

```bash
git add src/features/hr-management/HrSettingsWorkspace.jsx src/features/hr-management/PhaseStatusWorkspace.jsx src/features/hr-management/hr-management.css src/features/hr-management/HrManagementAppPage.jsx src/main.jsx react-tests/hr-management-ui.test.mjs
git commit -m "style(hr): finish phase 1a workspaces"
```

### Task 9: 长期规则写回与完整验收

**Files:**
- Modify: `docs/product/roles-and-permissions.md`
- Modify: `docs/product/core-workflows.md`
- Modify: `docs/product/data-definitions.md`
- Modify: `docs/platform/api-catalog.md`
- Modify: `docs/platform/error-codes.md`
- Modify: `docs/features/hr-management/tasks.md`

**Interfaces:**
- Consumes: Phase 1A 实际代码、接口和测试结果。
- Produces: 长期人事规则、API/错误契约、完成状态和验证证据。

- [ ] **Step 1: 写回已实现的长期规则**

角色文档登记员工、主管、人事、财务和敏感工资权限边界；流程文档登记绩效闭环；数据定义登记稳定员工身份、任职有效期和 `WorkEvidenceRef`；API 目录登记认证、权限、请求、响应、错误、并发、兼容、回滚和可观测性。

- [ ] **Step 2: 更新任务证据并检查无占位词**

Run: `rg -n "T[B]D|T[O]DO|implement lat[e]r|fill in detai[l]s" docs/features/hr-management docs/product docs/platform`

Expected: 无本功能遗留占位词。

- [ ] **Step 3: 运行 Definition of Done**

Run: `npm run lint && npm run check:governance && npm run check:integrations && npm run check:environment-capabilities && npm test && npm run build`

Expected: 全部通过。

- [ ] **Step 4: 完成浏览器验收**

在本地 Vite 检查 1440、1280、900、640、390px；覆盖员工、主管、人事、财务视角，以及空、错、禁用、只读、过期、冲突。记录钉钉 WebView 尚未部署验收，不以本地结果代替。

- [ ] **Step 5: 复核集成和规则声明**

PR 声明：

```text
Integration-Impact: cloudflare-pages, cloudflare-d1, dingtalk
Integration-Impact-Reason: 新增人事 Pages Function 与 D1 核心表，并只读复用钉钉登录和组织通讯录；未接入钉钉考勤或审批。
Rule-Writeback: docs/product/roles-and-permissions.md, docs/product/core-workflows.md, docs/product/data-definitions.md, docs/platform/api-catalog.md, docs/platform/error-codes.md, docs/platform/environment-capabilities.json, docs/platform/integration-registry.json
Rule-Writeback-Reason: 新增长期人事角色、绩效流程、证据定义、内部 API、错误码、D1 表和平台边界。
```

- [ ] **Step 6: 提交**

```bash
git add docs/product/roles-and-permissions.md docs/product/core-workflows.md docs/product/data-definitions.md docs/platform/api-catalog.md docs/platform/error-codes.md docs/features/hr-management/tasks.md
git commit -m "docs(hr): record phase 1a contracts"
```
