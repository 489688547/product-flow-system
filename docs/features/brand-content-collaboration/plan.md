# 品牌内容协同 App 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 在经营执行平台中交付一个可运行、可持久化的“品牌内容协同”首版，把内容主档、生产协作、NAS 元数据、发布记录、数据质量和补充决策串成闭环。

**架构：** 品牌业务规则保留在 `src/domain/brandContent.js`，React 页面通过独立 `BrandContentProvider` 调用 `/api/brand-content`，服务端使用现有认证中间件和 `PRODUCT_FLOW_DB` 中的独立品牌记录表。数据中心表现数据保持只读契约；首版以缓存快照和明确的“待数据中心接入”降级状态运行，不直接抓取外部平台。NAS 首版只管理已索引元数据和相对路径，不保存凭据或上传原视频。

**技术栈：** React 19、Vite 7、Cloudflare Pages Functions、Cloudflare D1、Node `node:test`、Lucide React、项目现有 UI 与 CSS 变量。

## 全局约束

- 左侧导航是九个品牌页面的唯一入口，右侧不得出现顶部二级导航。
- 生产状态与数据状态必须分离；抖音学习期默认 3 个完整自然日，有效测试阈值默认 50 元。
- 付费投放与自然内容指标分区展示；数据未对平时不得确认“内容问题”。
- 品牌 App 不直接调用抖音、千川、快手、小红书、快麦或 NAS；外部平台采集由数据中心或本地只读索引器负责。
- 服务端要求钉钉会话；只读账号不能写入。前端禁用不是权限边界。
- 不保存账号、密码、Cookie、验证码、令牌或 NAS 凭据。
- 页面遵循 `PRODUCT.md`、`DESIGN.md`、WCAG AA 和钉钉 WebView 约束。
- 首版启用独立品牌状态和独立 D1 表，不修改产品全周期业务数据。

---

### Task 1：品牌内容领域模型与判断规则

**文件：**
- 新建：`src/domain/brandContent.js`
- 新建：`react-tests/brand-content-domain.test.mjs`

**接口：**
- 产出：`createDefaultBrandContentState()`、`normalizeBrandContentState(input)`、`deriveContentDataStatus(content, publications, snapshots, settings, now)`、`transitionBrandContent(state, id, nextStatus, actor, now)`、`findBrandContentIssues(state, now)`、`summarizeBrandOverview(state, now)`、`buildBrandTeamMetrics(state, now)`、`reduceBrandContentState(state, action)`。
- 供后续：Provider、API 和九个页面只使用这些标准对象，不自行解释平台字段。

- [ ] **Step 1：写出失败的领域测试**

```js
test("published content stays in learning for three complete days", () => {
  const state = createDefaultBrandContentState();
  const item = state.contents.find(content => content.id === "BC-260718-001");
  const status = deriveContentDataStatus(
    item,
    state.publications,
    state.performanceSnapshots,
    state.settings,
    new Date("2026-07-18T12:00:00+08:00")
  );
  assert.equal(status.code, "learning");
});

test("mature low-spend content is untested instead of content weak", () => {
  const state = createDefaultBrandContentState();
  const item = state.contents.find(content => content.id === "BC-260708-002");
  const status = deriveContentDataStatus(item, state.publications, state.performanceSnapshots, state.settings, new Date("2026-07-18T12:00:00+08:00"));
  assert.equal(status.code, "untested");
  assert.equal(status.ownerRole, "operator");
});

test("duplicate material ids block attribution and create a data issue", () => {
  const state = createDefaultBrandContentState();
  const issues = findBrandContentIssues({
    ...state,
    publications: [...state.publications, { ...state.publications[0], id: "pub-copy" }]
  }, new Date("2026-07-18T12:00:00+08:00"));
  assert.ok(issues.some(issue => issue.type === "duplicate_material_id"));
});
```

- [ ] **Step 2：运行测试并确认因模块不存在而失败**

运行：`node --test react-tests/brand-content-domain.test.mjs`

预期：FAIL，错误包含 `Cannot find module '../src/domain/brandContent.js'`。

- [ ] **Step 3：实现最小领域模型**

```js
export const BRAND_PRODUCTION_STATUSES = ["brief", "scripting", "editing", "reviewing", "ready", "published", "archived"];

export function deriveContentDataStatus(content, publications, snapshots, settings, now = new Date()) {
  const related = publications.filter(item => item.contentId === content.id);
  if (!related.length) return { code: "not_published", label: "待发布", ownerRole: "operator" };
  if (related.some(item => !item.materialIds?.length)) return { code: "missing_id", label: "缺素材 ID", ownerRole: "operator" };
  // 按完整自然日、测试阈值、快照覆盖和对平状态继续判断。
}
```

实现要求：稳定内容 ID、规范化遗留输入、合法状态流转、重复素材 ID、学习期、测试不足、对平门禁、概览漏斗、角色效能和补充决策 reducer 全部由纯函数完成。

- [ ] **Step 4：运行领域测试并确认通过**

运行：`node --test react-tests/brand-content-domain.test.mjs`

预期：全部 PASS。

- [ ] **Step 5：提交领域规则**

```bash
git add src/domain/brandContent.js react-tests/brand-content-domain.test.mjs
git commit -m "feat: add brand content domain rules"
```

### Task 2：独立品牌内容 API 与 D1 持久化

**文件：**
- 新建：`functions/api/brand-content.js`
- 新建：`tests/brand-content-api.test.mjs`
- 修改：`package.json`
- 修改：`docs/platform/api-catalog.md`

**接口：**
- 消费：`normalizeBrandContentState()`、`reduceBrandContentState()`。
- 产出：`GET /api/brand-content` 返回 `{ synced, state, version, updatedAt, updatedBy }`；`POST /api/brand-content` 接收 `{ version, action }` 并返回新状态；冲突返回 `409 BRAND_CONTENT_VERSION_CONFLICT`。

- [ ] **Step 1：写出失败的 API 契约测试**

```js
test("brand content API requires a session and D1", async () => {
  const unauthenticated = await onRequest({ request: new Request("https://flow.example.com/api/brand-content"), env: {}, data: {} });
  assert.equal(unauthenticated.status, 401);
  const noDb = await onRequest({ request: new Request("https://flow.example.com/api/brand-content"), env: {}, data: { session: executive } });
  assert.equal(noDb.status, 501);
});

test("brand content API detects concurrent writes", async () => {
  const db = createD1Mock();
  const first = await postAction(db, 0, { type: "create_content", record: validContent });
  assert.equal(first.status, 200);
  const stale = await postAction(db, 0, { type: "transition_content", id: validContent.id, nextStatus: "scripting" });
  assert.equal(stale.status, 409);
});
```

- [ ] **Step 2：运行测试并确认失败**

运行：`node --test tests/brand-content-api.test.mjs`

预期：FAIL，API 模块不存在。

- [ ] **Step 3：实现认证、版本控制和独立表**

```sql
CREATE TABLE IF NOT EXISTS brand_content_state (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
)
```

写入流程：读取 `company` 行 → 比较请求版本 → 用领域 reducer 应用单个动作 → 规范化 → `UPSERT` 新版本。只读账号返回 403；未知动作返回 400；响应包含稳定错误码和 `requestId`。

- [ ] **Step 4：把 API 测试加入正式测试脚本并更新目录文档**

`package.json` 的 `test:api` 必须包含 `tests/brand-content-api.test.mjs`。`docs/platform/api-catalog.md` 登记认证、方法、输入、输出、错误、兼容和负责人。

- [ ] **Step 5：运行 API 与集成检查**

运行：`node --test tests/brand-content-api.test.mjs && npm run check:integrations`

预期：全部 PASS；集成登记保持 `oceanengine-qianchuan`、`xiaohongshu`、`ugreen-nas` 为 `planned`，实现不声称已连接。

- [ ] **Step 6：提交 API**

```bash
git add functions/api/brand-content.js tests/brand-content-api.test.mjs package.json docs/platform/api-catalog.md
git commit -m "feat: persist brand content state"
```

### Task 3：品牌状态客户端与 Provider

**文件：**
- 新建：`src/state/brandContentApi.js`
- 新建：`src/state/BrandContentProvider.jsx`
- 新建：`react-tests/brand-content-provider.test.mjs`
- 修改：`src/main.jsx`

**接口：**
- 产出：`brandContentApiUrl(hostname)`、`BrandContentProvider`、`useBrandContent()`。
- `useBrandContent()` 返回 `{ state, loading, saving, error, dispatch, refresh, currentUser }`。

- [ ] **Step 1：写出失败的客户端边界测试**

```js
test("brand content client keeps provider calls behind one state boundary", () => {
  const provider = read("src/state/BrandContentProvider.jsx");
  assert.match(provider, /export function BrandContentProvider/);
  assert.match(provider, /useBrandContent/);
  assert.match(provider, /\/api\/brand-content/);
  assert.doesNotMatch(provider, /business\.oceanengine|xiaohongshu|smb:\/\//i);
});
```

- [ ] **Step 2：运行测试并确认失败**

运行：`node --test react-tests/brand-content-provider.test.mjs`

预期：FAIL，Provider 文件不存在。

- [ ] **Step 3：实现 Provider 和本地降级**

本地预览使用 `createDefaultBrandContentState()`；线上优先 GET API。每次 `dispatch(action)` 乐观更新本地状态并 POST `{ version, action }`，冲突时重新拉取并显示明确错误，不静默覆盖。网络失败保留当前内容并显示“修改尚未同步”。

- [ ] **Step 4：在 `src/main.jsx` 挂载 Provider**

Provider 位于认证 Provider 内、页面 App 外；品牌页面之外不触发外部平台请求。

- [ ] **Step 5：运行测试**

运行：`node --test react-tests/brand-content-provider.test.mjs react-tests/shared-state.test.mjs`

预期：全部 PASS。

- [ ] **Step 6：提交状态边界**

```bash
git add src/state/brandContentApi.js src/state/BrandContentProvider.jsx src/main.jsx react-tests/brand-content-provider.test.mjs
git commit -m "feat: add brand content state provider"
```

### Task 4：App 注册、九页左侧导航与权限

**文件：**
- 修改：`src/App.jsx`
- 修改：`src/domain/permissions.js`
- 修改：`src/domain/strategyExecution.js`
- 新建：`react-tests/brand-content-navigation.test.mjs`
- 新建：`src/features/brand-content/BrandContentPlaceholderPage.jsx`

**接口：**
- 新路由：`content-overview`、`content-workbench`、`content-assets`、`content-review`、`brand-accounts`、`content-decisions`、`content-team`、`content-issues`、`content-settings`。
- App 注册：`brand-content` → `content-overview`。

- [ ] **Step 1：写出失败的导航测试**

```js
test("brand content uses nine left routes and no top subnavigation", () => {
  const app = read("src/App.jsx");
  assert.match(app, /品牌内容协同/);
  for (const route of BRAND_ROUTES) assert.match(app, new RegExp(route));
  const page = read("src/features/brand-content/BrandContentPlaceholderPage.jsx");
  assert.doesNotMatch(page, /role="tablist"|brand-content-tabs|顶部导航/);
});
```

- [ ] **Step 2：运行测试并确认失败**

运行：`node --test react-tests/brand-content-navigation.test.mjs`

预期：FAIL，品牌路由不存在。

- [ ] **Step 3：实现导航、权限和 App 注册**

总经办导航顺序为公司经营 → 产品全周期 → 品牌内容协同 → 平台。普通员工保留产品全周期并增加品牌内容协同分组；具体可见性仍通过现有权限配置过滤。品牌九页全部使用左侧分组标签，页面不渲染第二套页签。

- [ ] **Step 4：实现懒加载占位页并验证路由**

占位页必须有标题、描述、加载/空状态，不显示虚构已接入数据。

- [ ] **Step 5：运行导航与现有权限测试**

运行：`node --test react-tests/brand-content-navigation.test.mjs react-tests/platform-ui.test.mjs react-tests/shared-state.test.mjs`

预期：全部 PASS。

- [ ] **Step 6：提交导航壳**

```bash
git add src/App.jsx src/domain/permissions.js src/domain/strategyExecution.js src/features/brand-content/BrandContentPlaceholderPage.jsx react-tests/brand-content-navigation.test.mjs
git commit -m "feat: register brand content app"
```

### Task 5：内容总览、内容作战台与创建 Brief

**文件：**
- 新建：`src/features/brand-content/BrandContentOverviewPage.jsx`
- 新建：`src/features/brand-content/BrandContentWorkbenchPage.jsx`
- 新建：`src/features/brand-content/ContentBriefModal.jsx`
- 新建：`src/features/brand-content/ContentStatusBadge.jsx`
- 新建：`src/features/brand-content/ContentOperationsTable.jsx`
- 新建：`react-tests/brand-content-workbench.test.mjs`
- 修改：`src/App.jsx`

**接口：**
- 消费：`useBrandContent()`、`summarizeBrandOverview()`、`deriveContentDataStatus()`。
- 产出：创建内容主档、按生产状态推进、按产品/平台/负责人筛选和责任队列。

- [ ] **Step 1：写出失败的页面测试**

```js
test("overview exposes operational breaks instead of decorative metrics", () => {
  const page = read("src/features/brand-content/BrandContentOverviewPage.jsx");
  assert.match(page, /未发布/);
  assert.match(page, /缺素材 ID/);
  assert.match(page, /未获有效测试/);
  assert.match(page, /数据中心/);
  assert.match(page, /ContentOperationsTable/);
});

test("brief creation requires product and three primary roles", () => {
  const modal = read("src/features/brand-content/ContentBriefModal.jsx");
  assert.match(modal, /ProductPicker/);
  assert.match(modal, /OrgSelect/);
  assert.match(modal, /主编导/);
  assert.match(modal, /主剪辑/);
  assert.match(modal, /主运营/);
});
```

- [ ] **Step 2：运行测试并确认失败**

运行：`node --test react-tests/brand-content-workbench.test.mjs`

预期：FAIL，页面不存在。

- [ ] **Step 3：实现总览和高密度作战表**

页面显示数据截止时间、数据质量、五个经营断点、产品内容作战表和当前用户责任队列。表格列为产品、链接基准、新内容、成熟/学习结构、测试覆盖、当前判断和下一步。

- [ ] **Step 4：实现 Brief 表单与状态动作**

表单使用现有 `ProductPicker`、`OrgSelect`、`DatePickerField`、`Modal`、`Button`。保存分派 `create_content`；作战台状态按钮分派 `transition_content`。退回审核必须填写原因。

- [ ] **Step 5：运行页面测试**

运行：`node --test react-tests/brand-content-workbench.test.mjs react-tests/react-app.test.mjs`

预期：全部 PASS。

- [ ] **Step 6：提交核心工作台**

```bash
git add src/features/brand-content src/App.jsx react-tests/brand-content-workbench.test.mjs
git commit -m "feat: add brand content workbench"
```

### Task 6：素材资产、投放复盘和品牌账号

**文件：**
- 新建：`src/features/brand-content/BrandAssetLibraryPage.jsx`
- 新建：`src/features/brand-content/BrandAdvertisingReviewPage.jsx`
- 新建：`src/features/brand-content/BrandAccountPage.jsx`
- 新建：`src/features/brand-content/DataQualityGate.jsx`
- 新建：`src/features/brand-content/NasAssetDetail.jsx`
- 新建：`react-tests/brand-content-analysis.test.mjs`
- 修改：`src/App.jsx`

**接口：**
- 素材页只读取 `assetVersions`；复盘页读取 `performanceSnapshots` 和数据质量；账号页只读取自然内容字段。

- [ ] **Step 1：写出失败的分析页面测试**

```js
test("advertising review blocks content verdict while data is unreconciled", () => {
  const page = read("src/features/brand-content/BrandAdvertisingReviewPage.jsx");
  assert.match(page, /DataQualityGate/);
  assert.match(page, /确认内容问题/);
  assert.match(page, /disabled=/);
});

test("brand accounts keep organic metrics separate from paid ROI", () => {
  const page = read("src/features/brand-content/BrandAccountPage.jsx");
  assert.match(page, /完播/);
  assert.match(page, /收藏/);
  assert.match(page, /涨粉/);
  assert.doesNotMatch(page, /自然内容 ROI/);
});
```

- [ ] **Step 2：运行测试并确认失败**

运行：`node --test react-tests/brand-content-analysis.test.mjs`

预期：FAIL，页面不存在。

- [ ] **Step 3：实现素材列表与详情分栏**

展示版本、相对路径、时长、修改时间、索引状态、发布数量和复制路径。NAS 离线时保留记录并显示上次扫描时间；不提供密码输入和大视频上传。

- [ ] **Step 4：实现数据质量优先的投放复盘**

顺序固定为数据截止/覆盖/差额 → 公司和账户口径 → 产品链接与素材 → 同龄对比 → 判断。未对平时禁用结论动作并显示原因。

- [ ] **Step 5：实现自然内容账号表**

展示平台、账号、发布数、播放、完播、互动、收藏、分享和涨粉；付费放大只显示说明标签。

- [ ] **Step 6：运行测试并提交**

运行：`node --test react-tests/brand-content-analysis.test.mjs`

```bash
git add src/features/brand-content src/App.jsx react-tests/brand-content-analysis.test.mjs
git commit -m "feat: add content assets and analysis"
```

### Task 7：补充决策、团队效能、数据问题和设置

**文件：**
- 新建：`src/features/brand-content/BrandDecisionPage.jsx`
- 新建：`src/features/brand-content/BrandTeamPage.jsx`
- 新建：`src/features/brand-content/BrandDataIssuesPage.jsx`
- 新建：`src/features/brand-content/BrandContentSettingsPage.jsx`
- 新建：`src/features/brand-content/DecisionConfirmModal.jsx`
- 新建：`react-tests/brand-content-governance.test.mjs`
- 修改：`src/App.jsx`

**接口：**
- 确认补充决策分派 `confirm_decision` 并生成内容主档。
- 设置动作分派 `update_settings`，只允许修改学习期、测试阈值、编号规则和公开目录元数据。

- [ ] **Step 1：写出失败的治理页面测试**

```js
test("decision confirmation includes quantity direction account owners and review date", () => {
  const modal = read("src/features/brand-content/DecisionConfirmModal.jsx");
  for (const text of ["数量", "内容方向", "目标账户", "主编导", "主剪辑", "运营", "截止时间", "复盘日期"]) {
    assert.match(modal, new RegExp(text));
  }
});

test("team page separates roles and refuses a mixed score", () => {
  const page = read("src/features/brand-content/BrandTeamPage.jsx");
  assert.match(page, /编导/);
  assert.match(page, /剪辑/);
  assert.match(page, /运营/);
  assert.match(page, /暂不排名/);
  assert.doesNotMatch(page, /综合得分/);
});
```

- [ ] **Step 2：运行测试并确认失败**

运行：`node --test react-tests/brand-content-governance.test.mjs`

预期：FAIL，页面不存在。

- [ ] **Step 3：实现补充决策和团队效能**

决策证据显示数据版本、比较范围和限制。团队按三种角色分表，主责任人只计一次；学习中、未测试和样本不足不进入排名。

- [ ] **Step 4：实现数据问题和设置矩阵**

数据问题按严重度、责任角色、影响范围和恢复动作显示。设置页不嵌套卡片，不显示任何凭据字段；数据中心和 NAS 显示只读连接状态。

- [ ] **Step 5：运行测试并提交**

运行：`node --test react-tests/brand-content-governance.test.mjs`

```bash
git add src/features/brand-content src/App.jsx react-tests/brand-content-governance.test.mjs
git commit -m "feat: complete brand content operations pages"
```

### Task 8：视觉系统、响应式与完整验证

**文件：**
- 新建：`src/features/brand-content/brand-content.css`
- 修改：`src/main.jsx`
- 修改：`src/styles.css`
- 修改：`docs/features/brand-content-collaboration/prd.md`
- 修改：`docs/features/brand-content-collaboration/design.md`
- 修改：`docs/features/brand-content-collaboration/tasks.md`
- 修改：`docs/features/brand-content-collaboration/plan.md`
- 修改：`docs/platform/integration-registry.json`

**接口：**
- 无新增业务接口；完成 WCAG、DingTalk WebView、窄屏、空/错/禁用/焦点和文档同步。

- [ ] **Step 1：补充静态视觉约束测试**

验证品牌 CSS 包含 1120、760、390 三档布局；页面无顶部 tablist、无渐变文字、无凭据输入；按钮带可读禁用原因；表格保留横向滚动。

- [ ] **Step 2：运行视觉约束测试并确认新增断言先失败**

运行：`node --test react-tests/brand-content-*.test.mjs`

预期：新加的响应式或状态断言 FAIL。

- [ ] **Step 3：实现品牌样式与状态**

使用现有 CSS 变量和 4px 网格；1440×900 为高密度双区布局，760 以下单列，390 宽度保留安全区和可达操作。只保留左侧导航。

- [ ] **Step 4：启动本地服务并做浏览器验收**

运行：`npm run dev -- --port 8138`

验收：内容总览、作战台、素材资产、未对平复盘、补充决策、团队页、数据问题、设置；检查 1440×900、1120×720、760×900、390×844；检查键盘焦点、空状态、错误、禁用说明和没有顶部重复导航。

- [ ] **Step 5：运行 Definition of Done**

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm test
npm run build
git diff --check
```

预期：全部退出码为 0；生产 JavaScript chunk 不超过项目阈值。

- [ ] **Step 6：更新文档状态并提交验收结果**

PRD 状态改为“首版已实现，待部署验收”；任务勾选全部实际完成项，明确数据中心与 NAS 仍是计划中外部依赖，不把模拟快照描述为生产连接。

```bash
git add src docs functions tests react-tests package.json
git commit -m "feat: ship brand content collaboration app"
```

## 平台能力决策

- 决策：`局部保留`。品牌内容领域模型、页面组合、状态 Provider 和 NAS 索引元数据均保留在品牌功能内。
- 证据：当前只有品牌内容协同一个真实消费者；数据中心契约尚未在本分支实现；NAS 文件索引尚无第二个业务消费者。
- 复用：认证中间件、D1 绑定、`PageHeader`、`DataTable`、`Button`、`Modal`、`OrgSelect`、`ProductPicker`、`DatePickerField`。
- 不抽取：`ContentStatusBadge`、`DataQualityGate`、`ContentOperationsTable`、`NasAssetDetail`、`DecisionConfirmModal`。
- 兼容：品牌路由和 API 可通过移除导航/App 注册隐藏；独立 D1 表保留数据，不影响产品、经营和平台状态。
- 后续条件：数据中心内容表现契约有第二个消费者后，才评估 `/api/platform/v1/content-performance` 为共享平台 API。

## 回滚

1. 从 App 注册与左侧导航移除品牌页面路由。
2. 停止 `/api/brand-content` 写入和本地索引器，不删除 D1 品牌记录。
3. 前端功能开关关闭时，产品全周期、经营平台和数据中心页面继续运行。
4. 恢复时重新启用入口并读取保留版本；版本冲突继续由 API 拒绝而不是覆盖。
