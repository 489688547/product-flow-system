# 业务应用导航排序与商品主数据加载修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 固定两套侧栏的业务 App 顺序，并让商品主数据把合法空目录显示为空状态、把真实失败显示为可重试错误。

**Architecture:** 导航仍由 `src/App.jsx` 组合，领域分组逻辑不变，只调整业务 App 的组合顺序。商品目录服务端契约保持不变，读取客户端仅对 GET 允许 `synced: false`，Provider 继续持有状态，工作区复用 `refresh()` 增加错误重试交互。

**Tech Stack:** React 19、Vite、Node.js `node:test`、现有平台 v1 商品目录客户端与共享 UI `Button`。

## Global Constraints

- 公司级和产品级侧栏顺序固定为：产品全周期、电商店铺运营、品牌内容协同、供应链管理、人事管理、数据中心。
- 没有权限的 App 不展示，其余 App 保持上述相对顺序。
- HTTP 200 且 `synced: false`、`items: []` 是合法空目录；非成功 HTTP、网络异常和无效响应才是加载错误。
- 真实错误提供“重新加载”，加载期间禁用；已有目录在刷新失败时保留。
- 不修改服务端 API 结构、D1、迁移、绑定、环境变量、导入/同步权限和外部平台配置。

---

### Task 1: 固定业务 App 导航顺序

**Files:**
- Modify: `react-tests/sidebar-navigation.test.mjs`
- Modify: `react-tests/ecommerce-performance-navigation.test.mjs`
- Modify: `src/App.jsx`
- Modify: `DESIGN.md`
- Modify: `docs/features/data-center-app/prd.md`
- Modify: `docs/features/data-center-app/design.md`
- Modify: `docs/features/ecommerce-store-operations/prd.md`

**Interfaces:**
- Consumes: `groupSidebarNavigation(navigation)` 按传入数组顺序生成分组。
- Produces: `COMPANY_NAV` 与 `PRODUCT_NAV` 中六个业务 App 的确认顺序；权限过滤后仍保持相对顺序。

- [x] **Step 1: 写导航顺序失败测试**

将测试夹具中的业务 App 按确认顺序排列，并断言运营负责人看到的授权分组顺序：

```js
const navigation = [
  ["home", "公司首页", null, "公司经营", "home"],
  ["dashboard", "产品总览", null, "产品全周期", "dashboard"],
  ["progress", "产品进度", null, "产品全周期", "progress"],
  ["ops-dashboard", "经营驾驶舱", null, "电商店铺运营", "ecommerce-operations"],
  ["ops-team", "运营团队", null, "电商店铺运营", "ecommerce-operations"],
  ["content-overview", "内容总览", null, "品牌内容协同", "content-overview"],
  ["content-settings", "设置", null, "品牌内容协同", "content-settings"],
  ["supply-overview", "供应链总览", null, "供应链管理", "supply-chain"],
  ["supply-quality", "质量管理", null, "供应链管理", "supply-chain"],
  ["performance-overview", "绩效总览", null, "人事管理", "performance-management"],
  ["performance-mine", "我的绩效", null, "人事管理", "performance-management"],
  ["data-overview", "数据总览", null, "数据中心", "data-center"],
  ["data-quality", "数据质量", null, "数据中心", "data-center"],
  ["handbook", "说明书", null, "平台", "handbook"]
];

assert.deepEqual(groups.map(group => group.label), [
  "产品全周期",
  "电商店铺运营",
  "品牌内容协同",
  "供应链管理",
  "人事管理",
  "数据中心",
  "平台"
]);
```

再读取 `src/App.jsx`，对 `COMPANY_NAV` 和 `PRODUCT_NAV` 片段断言实际组合顺序：

```js
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const appOrder = [
  "...ECOMMERCE_OPERATIONS_NAV",
  "...BRAND_NAV",
  "...SUPPLY_CHAIN_NAV",
  "...PERFORMANCE_MANAGEMENT_NAV",
  "...DATA_CENTER_NAV"
];

function navBlock(name, nextMarker) {
  const start = source.indexOf(`const ${name} = [`);
  const end = source.indexOf(nextMarker, start);
  return source.slice(start, end);
}

test("company and product shells keep the confirmed business app order", () => {
  for (const block of [
    navBlock("COMPANY_NAV", "const PRODUCT_NAV = ["),
    navBlock("PRODUCT_NAV", "const HIDDEN_SCREENS = new Set")
  ]) {
    const positions = appOrder.map(token => block.indexOf(token));
    assert.ok(positions.every(position => position >= 0));
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
    assert.ok(block.indexOf('"archive"') < positions[0]);
  }
});
```

- [x] **Step 2: 运行测试确认失败**

Run: `node --test react-tests/sidebar-navigation.test.mjs`

Expected: FAIL，指出 `src/App.jsx` 的业务 App 组合顺序仍为旧顺序。

- [x] **Step 3: 最小调整两套导航组合顺序**

在 `src/App.jsx` 中让产品条目之后的组合统一为：

```js
...ECOMMERCE_OPERATIONS_NAV,
...BRAND_NAV,
...SUPPLY_CHAIN_NAV,
...PERFORMANCE_MANAGEMENT_NAV,
...DATA_CENTER_NAV,
```

公司经营、协同执行和平台分组保持原位，权限字段和各 App 内部路由不变。

- [x] **Step 4: 更新耐久设计与验收文档**

在 `DESIGN.md` 的侧栏规则中写明六个业务 App 的固定顺序；将 `docs/features/data-center-app/prd.md` 与 `docs/features/data-center-app/design.md` 中旧的“数据中心位于产品全周期之后”改为“数据中心位于业务 App 列表最后”，并保留平台分组在其后。同步更新 `docs/features/ecommerce-store-operations/prd.md` 与对应导航测试，不再声明电商店铺运营位于数据中心之后。

- [x] **Step 5: 运行导航测试确认通过**

Run: `node --test react-tests/sidebar-navigation.test.mjs react-tests/ecommerce-performance-navigation.test.mjs`

Expected: PASS，9 个导航与 App 注册测试全部通过。

- [x] **Step 6: 提交导航任务**

```bash
git add src/App.jsx react-tests/sidebar-navigation.test.mjs react-tests/ecommerce-performance-navigation.test.mjs DESIGN.md docs/features/data-center-app/prd.md docs/features/data-center-app/design.md docs/features/ecommerce-store-operations/prd.md
git commit -m "fix: order business app navigation"
```

---

### Task 2: 区分商品目录空状态与真实失败

**Files:**
- Modify: `react-tests/product-catalog-provider.test.mjs`
- Modify: `react-tests/product-catalog-ui.test.mjs`
- Modify: `src/state/productCatalogApi.js`
- Modify: `src/features/data-center/ProductCatalogWorkspace.jsx`
- Modify: `src/styles.css`
- Modify: `docs/features/shared-product-catalog/design.md`

**Interfaces:**
- Consumes: `loadProductCatalog(fetchImpl)`、`ProductCatalogProvider.refresh({ quiet?: boolean })`。
- Produces: `payloadFor(response, fallback, { allowUnsynced?: boolean })` 内部判定；GET 允许未同步空目录，导入和快麦同步仍要求 `synced !== false`；工作区调用现有 `refresh()` 重试。

- [x] **Step 1: 写合法空目录与 UI 重试失败测试**

在客户端测试中增加：

```js
test("catalog client treats an unsynced successful read as an empty catalog", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    synced: false,
    items: [],
    runs: [],
    meta: { products: 0, lastSuccessfulSyncAt: "" }
  }), { status: 200 });
  const payload = await loadProductCatalog(fetchImpl);
  assert.equal(payload.synced, false);
  assert.deepEqual(payload.items, []);
});
```

同时验证无效的 200 读取响应仍会失败：

```js
await assert.rejects(
  () => loadProductCatalog(async () => new Response(JSON.stringify({}), { status: 200 })),
  /商品主数据加载失败/
);
```

并在 UI 静态契约测试中断言工作区解构 `refresh`、渲染“重新加载”、以 `loading` 禁用按钮并调用 `refresh().catch(...)`：

```js
assert.match(workspace, /const \{[\s\S]*refresh[\s\S]*\} = useProductCatalog\(\)/);
assert.match(workspace, />重新加载</);
assert.match(workspace, /disabled=\{loading\}/);
assert.match(workspace, /onClick=\{\(\) => refresh\(\)\.catch\(\(\) => \{\}\)\}/);
```

- [x] **Step 2: 运行测试确认失败**

Run: `node --test react-tests/product-catalog-provider.test.mjs react-tests/product-catalog-ui.test.mjs`

Expected: FAIL；客户端仍对 `synced: false` 抛出“商品主数据加载失败”，UI 尚无重试操作。

- [x] **Step 3: 最小放宽 GET 读取语义**

将内部响应解析改为：

```js
async function payloadFor(response, fallback, { allowUnsynced = false } = {}) {
  const payload = await response.json().catch(() => ({}));
  const invalidReadPayload = allowUnsynced && !Array.isArray(payload.items);
  if (!response.ok || invalidReadPayload || (!allowUnsynced && payload.synced === false)) {
    const error = new Error(payload.message || fallback);
    error.status = response.status;
    error.code = payload.error?.code || "PRODUCT_CATALOG_REQUEST_FAILED";
    error.retryable = Boolean(payload.error?.retryable);
    error.requestId = payload.error?.requestId || "";
    throw error;
  }
  return payload;
}

export async function loadProductCatalog(fetchImpl = fetch) {
  const response = await fetchImpl(productCatalogApiUrl());
  return payloadFor(response, "商品主数据加载失败。", { allowUnsynced: true });
}
```

`importProductCatalog` 与 `syncKuaimaiProductCatalog` 保持默认严格语义。

- [x] **Step 4: 增加错误重试交互**

在工作区解构 `refresh`，把单行错误改为带按钮的错误容器：

```jsx
{error ? <div className="supply-message error product-catalog-error" role="alert">
  <span>{error}</span>
  <Button disabled={loading} onClick={() => refresh().catch(() => {})}>
    <RefreshCw size={15} className={loading ? "is-spinning" : ""} />
    {loading ? "正在重新加载…" : "重新加载"}
  </Button>
</div> : null}
```

在 `src/styles.css` 增加 `.product-catalog-error` 的弹性布局、文本伸缩和移动端换行规则；沿用共享 `Button` 的键盘与焦点行为。

- [x] **Step 5: 更新商品主数据耐久设计**

在 `docs/features/shared-product-catalog/design.md` 记录：首次未同步的 200 空目录显示空状态；网络或服务端失败显示可重试错误；已有目录刷新失败不清空现有数据。

- [x] **Step 6: 运行商品目录测试确认通过**

Run: `node --test react-tests/product-catalog-provider.test.mjs react-tests/product-catalog-ui.test.mjs`

Expected: PASS，商品目录客户端与 UI 契约测试全部通过。

- [x] **Step 7: 提交商品目录任务**

```bash
git add src/state/productCatalogApi.js src/features/data-center/ProductCatalogWorkspace.jsx src/styles.css react-tests/product-catalog-provider.test.mjs react-tests/product-catalog-ui.test.mjs docs/features/shared-product-catalog/design.md
git commit -m "fix: handle empty product catalog reads"
```

---

### Task 3: 规格状态与完整验证

**Files:**
- Modify: `docs/superpowers/specs/2026-07-20-navigation-product-catalog-load-fix-design.md`
- Create or update by implementation: `docs/superpowers/plans/2026-07-20-navigation-product-catalog-load-fix.md`

**Interfaces:**
- Consumes: Task 1 与 Task 2 的完整实现和测试。
- Produces: 已确认规格状态、仓库完整检查证据和本地 UI 验收结果。

- [x] **Step 1: 标记规格已确认并更新计划勾选状态**

把设计规格中的 `状态：待确认` 改为 `状态：已确认`，并按实际完成情况更新本计划复选框，不伪造未执行步骤。

- [x] **Step 2: 运行仓库完整检查**

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

Expected: 六项命令全部 exit 0；没有新增环境能力或集成契约变化。

- [x] **Step 3: 启动本地完整运行时并做浏览器验收**

Run: `npm start`

在本地真实登录页面验证：

1. 公司级与产品级侧栏按确认顺序展示，数据中心是最后一个业务 App。
2. 商品目录空响应展示“还没有商品主数据”，不显示加载失败。
3. 模拟真实失败时显示“重新加载”，按钮可键盘聚焦、请求中禁用。
4. 真实笔记本宽度和窄屏下错误行不溢出；钉钉 WebView 导航与页面布局无回归。

实际验收使用生产构建本地预览：确认侧栏顺序、855 个真实商品正常加载、桌面与 390px 窄屏无页面横向溢出，浏览器控制台无错误。由于本地运行时连接生产目录且目录非空，没有为制造空状态或错误状态而改动线上数据；合法空目录、无效响应与重试禁用状态由针对性自动测试覆盖。

- [x] **Step 4: 检查分支基线与提交范围**

```bash
git fetch origin main
git merge-base --is-ancestor origin/main HEAD
git status --short
git diff origin/main...HEAD --stat
```

Expected: 当前分支包含最新 `origin/main`；工作树仅含本任务文件或保持干净。

- [x] **Step 5: 提交文档状态与验证记录**

```bash
git add docs/superpowers/specs/2026-07-20-navigation-product-catalog-load-fix-design.md docs/superpowers/plans/2026-07-20-navigation-product-catalog-load-fix.md
git commit -m "docs: finalize navigation catalog fix"
```
