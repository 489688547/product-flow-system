# 左侧应用折叠导航实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the long desktop sidebar with permission-aware App accordion groups that show only each App's overview by default and automatically expand the App containing the active child page.

**Architecture:** Keep the existing navigation arrays and `canViewNavigation` filtering as the route and permission sources of truth. Add a pure domain helper that groups already-filtered entries, identifies collapsible business Apps, and derives the group that should auto-expand for an active child route; `App.jsx` owns only the current accordion state and rendering. CSS collapses desktop children while preserving the existing flat horizontal navigation below 900px.

**Tech Stack:** React 19, JavaScript ES modules, Node test runner, existing CSS tokens, Lucide icons.

## Global Constraints

- Company operations, collaboration execution, and platform groups remain fully visible.
- Product lifecycle, supply chain, data center, ecommerce operations, human resources, and brand content are collapsible.
- Permission filtering happens before grouping; no empty group or unauthorized route may be rendered.
- Only one business App is expanded on desktop; a directly opened child route expands its App automatically.
- The first visible authorized item remains visible when a group is collapsed.
- Below 900px, preserve the existing flat horizontal navigation with every authorized route.
- Do not change permissions, routes, APIs, persisted data, environment configuration, or provider behavior.

---

## File Map

- Create `src/domain/sidebarNavigation.js`: pure grouping, collapsibility, and active-route expansion rules.
- Create `react-tests/sidebar-navigation.test.mjs`: domain behavior and representative account visibility coverage.
- Create `react-tests/sidebar-navigation-ui.test.mjs`: App integration, accessibility contract, desktop collapse, and mobile flattening checks.
- Modify `src/App.jsx`: render grouped navigation and manage the one-open accordion state.
- Modify `src/styles.css`: restrained group toggle, collapse behavior, focus, reduced motion, and mobile override.
- Modify `DESIGN.md`: record the durable sidebar navigation rule.

### Task 1: Permission-Aware Sidebar Grouping

**Files:**
- Create: `src/domain/sidebarNavigation.js`
- Create: `react-tests/sidebar-navigation.test.mjs`

**Interfaces:**
- Consumes: navigation entries shaped as `[screen, label, Icon, group, ...rest]` after `canViewNavigation` filtering.
- Produces: `groupSidebarNavigation(navigation)` returning `{ label, items, collapsible }[]`.
- Produces: `expandedGroupForScreen(navigation, screen)` returning a group label or `""`.

- [x] **Step 1: Write the failing domain tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { canViewNavigation, DEFAULT_PERMISSIONS } from "../src/domain/permissions.js";
import { expandedGroupForScreen, groupSidebarNavigation } from "../src/domain/sidebarNavigation.js";

const navigation = [
  ["home", "公司首页", null, "公司经营", "home"],
  ["dashboard", "产品总览", null, "产品全周期", "dashboard"],
  ["progress", "产品进度", null, "产品全周期", "progress"],
  ["supply-overview", "供应链总览", null, "供应链管理", "supply-chain"],
  ["supply-quality", "质量管理", null, "供应链管理", "supply-chain"],
  ["content-overview", "内容总览", null, "品牌内容协同", "content-overview"],
  ["content-settings", "设置", null, "品牌内容协同", "content-settings"],
  ["handbook", "说明书", null, "平台", "handbook"]
];

const visibleFor = user => navigation.filter(([, , , , permissionKey]) =>
  canViewNavigation(DEFAULT_PERMISSIONS, user, permissionKey)
);

test("groups authorized navigation without creating empty app groups", () => {
  const groups = groupSidebarNavigation(visibleFor({ department: "客服部", title: "客服" }));
  assert.deepEqual(groups.map(group => group.label), ["公司经营", "产品全周期", "品牌内容协同", "平台"]);
  assert.equal(groups.find(group => group.label === "产品全周期").collapsible, true);
  assert.equal(groups.some(group => group.label === "供应链管理"), false);
});

test("keeps only multi-route business apps collapsible", () => {
  const groups = groupSidebarNavigation(visibleFor({ department: "总经办", title: "总经理" }));
  assert.equal(groups.find(group => group.label === "公司经营").collapsible, false);
  assert.equal(groups.find(group => group.label === "产品全周期").collapsible, true);
  assert.equal(groups.find(group => group.label === "供应链管理").collapsible, true);
  assert.equal(groups.find(group => group.label === "平台").collapsible, false);
});

test("auto expands an active child but not the first visible overview", () => {
  const visible = visibleFor({ department: "运营部", title: "运营负责人" });
  assert.equal(expandedGroupForScreen(visible, "supply-quality"), "供应链管理");
  assert.equal(expandedGroupForScreen(visible, "supply-overview"), "");
  assert.equal(expandedGroupForScreen(visible, "home"), "");
});
```

- [x] **Step 2: Run the test and verify RED**

Run: `node --test react-tests/sidebar-navigation.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/domain/sidebarNavigation.js`.

- [x] **Step 3: Add the minimal grouping implementation**

```js
export const COLLAPSIBLE_APP_GROUPS = new Set([
  "产品全周期",
  "供应链管理",
  "数据中心",
  "电商店铺运营",
  "人事管理",
  "品牌内容协同"
]);

export function groupSidebarNavigation(navigation = []) {
  const groups = [];
  for (const item of navigation) {
    const label = item[3];
    const previous = groups.at(-1);
    if (previous?.label === label) previous.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups.map(group => ({
    ...group,
    collapsible: COLLAPSIBLE_APP_GROUPS.has(group.label) && group.items.length > 1
  }));
}

export function expandedGroupForScreen(navigation = [], screen = "") {
  const group = groupSidebarNavigation(navigation)
    .find(candidate => candidate.items.some(([key]) => key === screen));
  if (!group?.collapsible || group.items[0]?.[0] === screen) return "";
  return group.label;
}
```

- [x] **Step 4: Run the domain test and verify GREEN**

Run: `node --test react-tests/sidebar-navigation.test.mjs`

Expected: PASS, 3 tests.

- [x] **Step 5: Commit the domain behavior**

```bash
git add src/domain/sidebarNavigation.js react-tests/sidebar-navigation.test.mjs
git commit -m "feat(navigation): group authorized app routes"
```

### Task 2: Accessible Desktop Accordion and Mobile Flattening

**Files:**
- Create: `react-tests/sidebar-navigation-ui.test.mjs`
- Modify: `src/App.jsx:1-8,177-205,256-263`
- Modify: `src/styles.css:79-84,746-754,971-975`

**Interfaces:**
- Consumes: `groupSidebarNavigation(visibleNavigation)` and `expandedGroupForScreen(visibleNavigation, activeScreen)` from Task 1.
- Produces: one controlled desktop App group with `aria-expanded`; preserves every authorized route in the DOM for the mobile flat layout.

- [ ] **Step 1: Write the failing integration and CSS contract tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("App renders permission-filtered navigation through accessible accordion groups", () => {
  const app = read("src/App.jsx");
  assert.match(app, /groupSidebarNavigation\(visibleNavigation\)/);
  assert.match(app, /expandedGroupForScreen\(visibleNavigation, activeScreen\)/);
  assert.match(app, /className="sidebar-group-toggle"/);
  assert.match(app, /aria-expanded=\{isExpanded\}/);
  assert.match(app, /aria-controls=\{groupId\}/);
  assert.match(app, /setExpandedAppGroup\(current => current === group\.label \? "" : group\.label\)/);
  assert.match(app, /group\.items\.map/);
});

test("desktop collapses App children while mobile restores the flat authorized navigation", () => {
  const css = read("src/styles.css");
  assert.match(css, /\.sidebar-app-group\.collapsible:not\(\.expanded\) \.sidebar-nav-item:not\(:first-child\)\s*\{[^}]*display:\s*none/s);
  assert.match(css, /\.sidebar-group-toggle:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.sidebar-group-toggle svg/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.sidebar-app-group\s*\{[^}]*display:\s*contents/s);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.sidebar-app-group\.collapsible:not\(\.expanded\) \.sidebar-nav-item:not\(:first-child\)\s*\{[^}]*display:\s*grid/s);
});
```

- [ ] **Step 2: Run the UI test and verify RED**

Run: `node --test react-tests/sidebar-navigation-ui.test.mjs`

Expected: FAIL because `App.jsx` does not use grouped navigation and the new CSS selectors do not exist.

- [ ] **Step 3: Integrate grouped navigation in App.jsx**

Add the domain import:

```js
import { expandedGroupForScreen, groupSidebarNavigation } from "./domain/sidebarNavigation.js";
```

After `activeScreen` is derived, add state and grouping:

```js
const [expandedAppGroup, setExpandedAppGroup] = useState(() =>
  expandedGroupForScreen(visibleNavigation, activeScreen)
);
const sidebarNavigationGroups = useMemo(
  () => groupSidebarNavigation(visibleNavigation),
  [visibleNavigation]
);

useEffect(() => {
  setExpandedAppGroup(expandedGroupForScreen(visibleNavigation, activeScreen));
}, [activeScreen, visibleNavigation]);
```

Replace the flat `<nav>` mapping with:

```jsx
<nav aria-label="主导航">
  {sidebarNavigationGroups.map((group, groupIndex) => {
    const isExpanded = expandedAppGroup === group.label;
    const groupId = `sidebar-group-${groupIndex}`;
    return (
      <div className={`sidebar-app-group${group.collapsible ? " collapsible" : ""}${isExpanded ? " expanded" : ""}`} key={group.label}>
        {group.collapsible ? (
          <button
            className="sidebar-group-toggle"
            type="button"
            aria-expanded={isExpanded}
            aria-controls={groupId}
            aria-label={`${isExpanded ? "收起" : "展开"}${group.label}`}
            onClick={() => setExpandedAppGroup(current => current === group.label ? "" : group.label)}
          >
            <span>{group.label}</span>
            <ChevronDown size={15} aria-hidden="true" />
          </button>
        ) : <span className="sidebar-section-label">{group.label}</span>}
        <div className="sidebar-group-items" id={groupId}>
          {group.items.map(([key, label, Icon]) => (
            <div className="sidebar-nav-item" key={key}>
              <button className={activeScreen === key ? "active" : ""} aria-current={activeScreen === key ? "page" : undefined} onClick={() => navigate(key)}>
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  })}
</nav>
```

- [ ] **Step 4: Add restrained desktop and mobile styles**

```css
.sidebar-app-group, .sidebar-group-items { min-width: 0; display: grid; gap: 2px; }
.sidebar nav .sidebar-group-toggle { width: 100%; height: 30px; justify-content: space-between; padding: 0 10px; color: var(--text-tertiary); font-size: 10px; font-weight: 750; }
.sidebar nav .sidebar-group-toggle::before { display: none; }
.sidebar nav .sidebar-group-toggle:hover, .sidebar-app-group.expanded .sidebar-group-toggle { color: var(--text-primary); background: var(--surface-subtle); }
.sidebar-group-toggle svg { flex: 0 0 auto; transition: transform 180ms ease; }
.sidebar-app-group.expanded .sidebar-group-toggle svg { transform: rotate(180deg); }
.sidebar-group-toggle:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
.sidebar-app-group.collapsible:not(.expanded) .sidebar-nav-item:not(:first-child) { display: none; }

@media (prefers-reduced-motion: reduce) {
  .sidebar-group-toggle svg { transition: none; }
}

@media (max-width: 900px) {
  .sidebar-app-group, .sidebar-group-items { display: contents; }
  .sidebar-group-toggle { display: none !important; }
  .sidebar-app-group.collapsible:not(.expanded) .sidebar-nav-item:not(:first-child) { display: grid; }
}
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --test react-tests/sidebar-navigation.test.mjs react-tests/sidebar-navigation-ui.test.mjs react-tests/company-access-gate.test.mjs react-tests/shared-state.test.mjs`

Expected: PASS with the new accordion tests plus existing access and permission tests.

- [ ] **Step 6: Commit the interface behavior**

```bash
git add src/App.jsx src/styles.css react-tests/sidebar-navigation-ui.test.mjs
git commit -m "feat(navigation): collapse business app groups"
```

### Task 3: Durable Rule and Full Verification

**Files:**
- Modify: `DESIGN.md`

**Interfaces:**
- Consumes: the completed sidebar behavior from Tasks 1–2.
- Produces: durable design guidance and a verified handoff; no new runtime interface.

- [ ] **Step 1: Record the durable navigation rule**

Add under `## 页面布局` in `DESIGN.md`:

```md
桌面左侧导航按业务 App 分组折叠：默认保留每个 App 的第一个已授权入口，同一时间只展开一个 App，进入子页面时自动展开对应分组。导航必须先按组织权限过滤；移动端保持已授权入口的扁平横向导航。
```

- [ ] **Step 2: Run focused navigation regression tests**

Run: `node --test react-tests/sidebar-navigation.test.mjs react-tests/sidebar-navigation-ui.test.mjs react-tests/supply-chain-ui.test.mjs react-tests/data-center-app.test.mjs react-tests/ecommerce-performance-navigation.test.mjs react-tests/brand-content-navigation.test.mjs`

Expected: PASS with no skipped or failed tests.

- [ ] **Step 3: Run the complete repository Definition of Done**

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

Expected: every command exits 0; all React and API tests pass; production JavaScript chunks remain under 500,000 bytes.

- [ ] **Step 4: Run local browser acceptance**

Run `npm run dev`, open `http://127.0.0.1:8132/`, and verify:

- Desktop at 1440px: company/platform groups remain flat; every authorized business App shows only its first item by default.
- Expand supply chain, then data center: only the last selected App remains expanded.
- Open a child hash such as `#supply-quality`: supply chain expands automatically and the active item remains visible.
- Keyboard: Tab reaches each group toggle, Enter/Space toggles it, and the focus ring is visible.
- Representative permission states covered by automated tests render no unauthorized or empty groups.
- At 900px and 390px: group toggles disappear and all authorized routes remain horizontally reachable.
- Console: no errors or React warnings.
- DingTalk WebView structural review: sticky mobile navigation, safe viewport height, and touch targets remain usable.

- [ ] **Step 5: Inspect the final diff and commit documentation**

```bash
git diff --check
git status --short
git diff --stat origin/main...HEAD
git add DESIGN.md
git commit -m "docs: record collapsible app navigation"
```

Expected: only the design, plan, domain helper, App shell, CSS, and navigation tests belong to this change; the worktree is clean after commit.
