# 数据中心同步记录与质量合并实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从数据中心左侧导航移除独立“数据质量”，把质量摘要和问题队列合并进“同步记录”，同时保留历史链接兼容。

**Architecture:** 保持 `syncRuns` 与 `qualityIssues` 两套数据模型和现有 Provider/API 不变，只调整 `App.jsx` 的导航解析和数据中心工作区组合。合并后的页面是单列结构：质量摘要、执行记录、待处理数据问题；历史 `data-quality` 在路由解析时转换为 `data-sync`。

**Tech Stack:** React 19、Vite、Node test runner、现有 `DataTable` / `Button` / 数据中心 CSS token。

## Global Constraints

- 不修改 D1、API、权限、外部平台连接、环境变量或生产数据。
- 页面标题“同步记录”只出现一次，不新增页内 Tab。
- `syncRuns` 与 `qualityIssues` 保持独立数据结构，不强行合表。
- 保留刷新、空状态、质量问题协同按钮、表格横向滚动、键盘焦点和窄屏可用性。
- 共享能力判断为“局部保留”；不为单一消费者抽取新通用组件。

---

### Task 1: 精简导航并兼容历史链接

**Files:**
- Modify: `react-tests/data-center-app.test.mjs`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `DATA_CENTER_NAV` 与 `resolveScreen(screen)`。
- Produces: 不含 `data-quality` 的数据中心导航；`resolveScreen("data-quality") === "data-sync"`。

- [ ] **Step 1: 写导航失败测试**

在 `react-tests/data-center-app.test.mjs` 的导航测试中提取 `DATA_CENTER_NAV` 内容，断言保留 `data-sync` 且不含 `data-quality`，并断言历史路由显式转换：

```js
const navBlock = app.match(/const DATA_CENTER_NAV = \[([\s\S]*?)\];/)?.[1] || "";
assert.match(navBlock, /data-metrics[\s\S]*data-sync[\s\S]*data-services/);
assert.doesNotMatch(navBlock, /data-quality/);
assert.match(app, /if \(screen === "data-quality"\) return "data-sync";/);
```

- [ ] **Step 2: 运行测试并确认失败原因**

Run: `node --test react-tests/data-center-app.test.mjs`

Expected: FAIL，因为导航仍包含 `data-quality`，且 `resolveScreen` 尚未兼容旧链接。

- [ ] **Step 3: 写最小导航实现**

从 `DATA_CENTER_NAV` 删除：

```js
["data-quality", "数据质量", ShieldCheck, "数据中心", "quality"],
```

在 `resolveScreen` 的数据中心入口处理旁加入：

```js
if (screen === "data-quality") return "data-sync";
```

保留 `ShieldCheck` 导入，因为供应链“逆向与质量”仍使用该图标。

- [ ] **Step 4: 运行测试并确认导航通过**

Run: `node --test react-tests/data-center-app.test.mjs`

Expected: PASS，且历史路由契约被覆盖。

- [ ] **Step 5: 提交导航任务**

```bash
git add src/App.jsx react-tests/data-center-app.test.mjs
git commit -m "refactor(data-center): simplify quality navigation"
```

### Task 2: 合并同步与质量工作区

**Files:**
- Modify: `react-tests/data-center-app.test.mjs`
- Modify: `src/features/data-center/DataCenterAppPage.jsx`
- Modify: `src/features/data-center/DataGovernanceWorkspaces.jsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `buildDataQualitySummary(...)` 返回的 `{ openIssues, unmappedProducts, excludedRows }`、`useDataCenter().state.syncRuns`、`useDataCenter().state.qualityIssues`。
- Produces: `SyncRunsWorkspace({ quality })`，按质量摘要、执行记录、待处理数据问题顺序渲染。

- [ ] **Step 1: 写工作区失败测试**

更新治理工作区测试，要求页面只将 `quality` 传给同步工作区，并锁定精简结构：

```js
assert.doesNotMatch(page, /DataQualityWorkspace/);
assert.doesNotMatch(page, /quality:\s*</);
assert.match(page, /sync: <SyncRunsWorkspace quality=\{quality\} \/>/);
assert.match(workspaces, /export function SyncRunsWorkspace\(\{ quality \}\)/);
assert.match(workspaces, /待处理问题[\s\S]*执行记录[\s\S]*待处理数据问题/);
assert.doesNotMatch(workspaces, /<h2>同步记录<\/h2>/);
assert.match(workspaces, /collaborationDraftFromDataIssue/);
assert.match(workspaces, /refresh/);
```

在响应式测试中加入：

```js
assert.match(styles, /\.data-sync-status-bar/);
assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.data-sync-status-bar/);
```

- [ ] **Step 2: 运行测试并确认失败原因**

Run: `node --test react-tests/data-center-app.test.mjs`

Expected: FAIL，因为质量仍是独立工作区，`SyncRunsWorkspace` 未接收 `quality`，合并布局 class 不存在。

- [ ] **Step 3: 写最小页面组合**

在 `DataCenterAppPage.jsx`：

```jsx
import { DataCenterSettingsWorkspace, DataServicesWorkspace, DataSourcesWorkspace, SyncRunsWorkspace } from "./DataGovernanceWorkspaces.jsx";
// 删除 SECTION_META.quality 和 content.quality
sync: <SyncRunsWorkspace quality={quality} />,
```

在 `DataGovernanceWorkspaces.jsx` 删除独立 `DataQualityWorkspace`，将原摘要和问题表放进同步工作区：

```jsx
export function SyncRunsWorkspace({ quality }) {
  const { state, refresh } = useDataCenter();
  const cards = [
    ["待处理问题", quality.openIssues],
    ["待确认商品映射", quality.unmappedProducts],
    ["本期口径排除", quality.excludedRows]
  ];
  return (
    <div className="data-workspace data-sync-workspace">
      <div className="data-sync-status-bar">
        <div className="data-quality-summary" aria-label="数据质量摘要">
          {cards.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}
        </div>
        <Button onClick={refresh}><RefreshCw size={16} />刷新状态</Button>
      </div>
      <section className="section-panel">
        <div className="section-head"><div><h2>执行记录</h2><p>每次采集和导入的范围、行数与结果；失败不会覆盖上次成功数据。</p></div></div>
        <DataTable minWidth={760} columns={[
          { key: "time", header: "执行时间", render: row => row.completedAt || row.startedAt || "—" },
          { key: "source", header: "数据源", render: row => row.sourceName || row.sourceId || "未知来源" },
          { key: "range", header: "数据范围", render: row => [row.from, row.to].filter(Boolean).join(" 至 ") || "—" },
          { key: "rows", header: "行数", render: row => row.rowCount || 0 },
          { key: "status", header: "状态", render: row => <span className={`status-badge ${row.status === "success" ? "success" : row.status === "running" ? "warning" : "danger"}`}>{statusLabel(row.status)}</span> },
          { key: "message", header: "结果", render: row => row.message || "—" }
        ]} rows={state.syncRuns} empty={<div className="empty-state compact-empty">还没有数据中心同步记录。</div>} />
      </section>
      <section className="section-panel">
        <div className="section-head"><div><h2>待处理数据问题</h2><p>同步产生的缺失、重复、延迟和映射异常在这里闭环。</p></div></div>
        <DataTable minWidth={680} columns={[
          { key: "title", header: "问题", render: row => row.title || row.message || "未命名问题" },
          { key: "type", header: "类型", render: row => row.type || "数据校验" },
          { key: "owner", header: "负责人", render: row => row.owner || "待认领" },
          { key: "status", header: "状态", render: row => <span className={`status-badge ${row.status === "resolved" ? "success" : "warning"}`}>{row.status === "resolved" ? "已解决" : "待处理"}</span> },
          { key: "actions", header: "操作", render: row => <TableActions><AppCollaborationButton draft={collaborationDraftFromDataIssue(row)} disabled={row.status === "resolved"} disabledReason="已解决的数据问题无需再发起协同" /></TableActions> }
        ]} rows={state.qualityIssues} empty={<div className="empty-state compact-empty">当前没有待处理的数据质量问题。</div>} />
      </section>
    </div>
  );
}
```

两张现有 `DataTable` 原样移入对应 section，不创建新数据结构、不改变列含义。

- [ ] **Step 4: 精简摘要样式并补窄屏布局**

在 `src/styles.css` 增加：

```css
.data-sync-status-bar { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); }
.data-sync-status-bar > .btn { white-space: nowrap; }
```

把 `.data-quality-summary article` 改为两行文字布局，删除不再使用的 SVG 规则。在现有 `@media (max-width: 640px)` 中加入：

```css
.data-sync-status-bar { grid-template-columns: 1fr; align-items: stretch; }
.data-sync-status-bar > .btn { width: 100%; justify-content: center; }
```

- [ ] **Step 5: 运行定向测试并确认通过**

Run: `node --test react-tests/data-center-app.test.mjs react-tests/data-center.test.mjs`

Expected: PASS；页面只保留一个同步入口，质量摘要与问题队列仍可访问。

- [ ] **Step 6: 更新任务记录并提交实现**

将 `docs/features/data-center-app/tasks.md` 本功能四项改为完成，并记录定向验证结果。

```bash
git add src/features/data-center/DataCenterAppPage.jsx src/features/data-center/DataGovernanceWorkspaces.jsx src/styles.css react-tests/data-center-app.test.mjs docs/features/data-center-app/tasks.md
git commit -m "refactor(data-center): merge quality into sync"
```

### Task 3: 实页和完整交付验证

**Files:**
- Verify: `src/App.jsx`
- Verify: `src/features/data-center/DataCenterAppPage.jsx`
- Verify: `src/features/data-center/DataGovernanceWorkspaces.jsx`
- Verify: `src/styles.css`
- Modify only if verification finds an in-scope defect.

**Interfaces:**
- Consumes: 完成后的 `data-sync` 页面与历史 `data-quality` hash。
- Produces: 可交付的导航、响应式与验证证据。

- [ ] **Step 1: 运行项目 Definition of Done**

```bash
npm run check:branch-base
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
git diff --check
```

Expected: 全部退出码 0；构建分块保持在 500 KB 限制内。

- [ ] **Step 2: 验证真实页面结构**

用正式本地运行入口 `npm start` 打开 `#/data-sync`，检查 1440、900、640、390px：

- 左侧数据中心没有“数据质量”；
- “同步记录”顶部依次为三项质量摘要、执行记录、待处理数据问题；
- 刷新按钮可聚焦，空状态可读，两张表在窄屏使用横向滚动而不逐字折行；
- `#/data-quality` 自动进入同步记录，不回到数据总览；
- 钉钉 WebView 宽度下无页面级横向溢出。

- [ ] **Step 3: 提交仅由验证产生的修复（如有）**

如验证无缺陷，不创建空提交；如有缺陷，只提交本功能文件：

```bash
git add <本功能修复文件>
git commit -m "fix(data-center): finish sync quality merge"
```
