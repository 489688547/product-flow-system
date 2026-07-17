# Product Ownership Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use the organization-backed product owner assignment to prioritize the signed-in user's products in product progress and show a consistent “我负责” label in the product picker, product archive, and product planning.

**Architecture:** Add pure ownership identity and stable-sorting helpers that prefer DingTalk organization IDs and fall back to names for legacy records. Keep the product-progress default selection local to the mounted page so a personal default does not rewrite shared state, while explicit product navigation remains authoritative. Render one shared badge component across all requested surfaces.

**Tech Stack:** React 19, JavaScript ES modules, Node test runner, Vite 7, existing DingTalk organization cache and CSS design tokens.

## Global Constraints

- Product owners continue to be selected from the existing organization user selector; do not add free-text owner input.
- Match by user ID first, union ID second, and normalized name only as a legacy fallback.
- Do not hard-code the signed-in user's job title; ownership is determined by the product assignment.
- Direct product-progress navigation prefers the first owned product, but explicit product links keep their selected product.
- Product archive and product planning keep their current order, filtering, planning, drag, and edit behavior.
- Do not add a “只看我负责” filter or change authorization rules.
- Reuse one accessible text badge with the copy `我负责`.

---

### Task 1: Organization-backed product ownership domain

**Files:**
- Create: `src/domain/productOwnership.js`
- Create: `react-tests/product-ownership.test.mjs`

**Interfaces:**
- Consumes: `orgUsers(orgCache)` from `src/domain/productFlow.js`.
- Produces: `productManagerAssignment(name, orgCache)`, `isProductOwnedBy(product, currentUser)`, `prioritizeOwnedProducts(products, currentUser)`, and `preferredProgressProductId(products, currentUser, explicitProductId)`.

- [ ] **Step 1: Write failing identity, legacy, and stable-order tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  isProductOwnedBy,
  preferredProgressProductId,
  prioritizeOwnedProducts,
  productManagerAssignment
} from "../src/domain/productOwnership.js";

const currentUser = { userid: "u-zhao", unionid: "union-zhao", name: "赵雨涵" };

test("product owner assignment resolves organization identifiers", () => {
  const assignment = productManagerAssignment("赵雨涵", {
    users: [{ userid: "u-zhao", unionid: "union-zhao", name: "赵雨涵" }]
  });
  assert.deepEqual(assignment, {
    productManager: "赵雨涵",
    productManagerUserId: "u-zhao",
    productManagerUnionId: "union-zhao"
  });
});

test("ownership prefers organization identifiers and supports legacy names", () => {
  assert.equal(isProductOwnedBy({ productManagerUserId: "u-zhao", productManager: "旧姓名" }, currentUser), true);
  assert.equal(isProductOwnedBy({ productManagerUnionId: "union-zhao", productManager: "旧姓名" }, currentUser), true);
  assert.equal(isProductOwnedBy({ productManager: " 赵雨涵 " }, currentUser), true);
  assert.equal(isProductOwnedBy({ productManager: "叶津成" }, currentUser), false);
});

test("owned products are moved first without changing order inside either group", () => {
  const products = [
    { id: "p1", productManager: "叶津成" },
    { id: "p2", productManager: "赵雨涵" },
    { id: "p3", productManager: "赵雨涵" },
    { id: "p4", productManager: "陈菲" }
  ];
  assert.deepEqual(prioritizeOwnedProducts(products, currentUser).map(product => product.id), ["p2", "p3", "p1", "p4"]);
  assert.deepEqual(products.map(product => product.id), ["p1", "p2", "p3", "p4"]);
});

test("explicit progress product wins over the personal default", () => {
  const products = [
    { id: "other", productManager: "叶津成" },
    { id: "mine", productManagerUserId: "u-zhao", productManager: "赵雨涵" }
  ];
  assert.equal(preferredProgressProductId(products, currentUser, "other"), "other");
  assert.equal(preferredProgressProductId(products, currentUser, ""), "mine");
});
```

- [ ] **Step 2: Run the new test and verify the missing module failure**

Run: `node --test react-tests/product-ownership.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/domain/productOwnership.js`.

- [ ] **Step 3: Implement normalized identity matching and stable ordering**

```js
import { orgUsers } from "./productFlow.js";

function clean(value) {
  return String(value || "").trim();
}

function userId(user) {
  return clean(user?.userid || user?.userId || user?.id);
}

function unionId(user) {
  return clean(user?.unionid || user?.unionId);
}

export function productManagerAssignment(name, orgCache = {}) {
  const productManager = clean(name);
  const member = orgUsers(orgCache).find(user => clean(user.name) === productManager);
  return {
    productManager,
    productManagerUserId: userId(member),
    productManagerUnionId: unionId(member)
  };
}

export function isProductOwnedBy(product, currentUser) {
  if (!product || !currentUser) return false;
  const managerUserId = clean(product.productManagerUserId);
  const managerUnionId = clean(product.productManagerUnionId);
  if (managerUserId && userId(currentUser)) return managerUserId === userId(currentUser);
  if (managerUnionId && unionId(currentUser)) return managerUnionId === unionId(currentUser);
  return Boolean(clean(product.productManager) && clean(product.productManager) === clean(currentUser.name));
}

export function prioritizeOwnedProducts(products = [], currentUser) {
  return [...products]
    .map((product, index) => ({ product, index, owned: isProductOwnedBy(product, currentUser) }))
    .sort((left, right) => Number(right.owned) - Number(left.owned) || left.index - right.index)
    .map(item => item.product);
}

export function preferredProgressProductId(products = [], currentUser, explicitProductId = "") {
  const explicit = clean(explicitProductId);
  if (explicit && products.some(product => product.id === explicit)) return explicit;
  const owned = prioritizeOwnedProducts(products, currentUser).find(product => isProductOwnedBy(product, currentUser));
  return owned?.id || products[0]?.id || "";
}
```

- [ ] **Step 4: Run the domain test and verify it passes**

Run: `node --test react-tests/product-ownership.test.mjs`

Expected: 4 tests pass, 0 fail.

- [ ] **Step 5: Commit the domain behavior**

```bash
git add src/domain/productOwnership.js react-tests/product-ownership.test.mjs
git commit -m "feat(products): identify owned products"
```

### Task 2: Persist organization identity and build the shared badge/picker behavior

**Files:**
- Create: `src/ui/ProductOwnershipBadge.jsx`
- Modify: `src/ui/ProductPicker.jsx`
- Modify: `src/features/progress/ProductProgressPage.jsx`
- Modify: `src/features/archive/ProductModal.jsx`
- Modify: `src/features/packages/PackagePage.jsx`
- Modify: `src/styles.css`
- Modify: `react-tests/react-app.test.mjs`

**Interfaces:**
- Consumes: Task 1 ownership helpers.
- Produces: `ProductOwnershipBadge({ owned })` and `ProductPicker({ products, value, onChange, currentUser, ...props })`.

- [ ] **Step 1: Add failing source-contract assertions for assignment and shared UI**

Add this test to `react-tests/react-app.test.mjs`:

```js
test("organization ownership is saved and shown through one shared product badge", () => {
  const progress = read("src/features/progress/ProductProgressPage.jsx");
  const modal = read("src/features/archive/ProductModal.jsx");
  const picker = read("src/ui/ProductPicker.jsx");
  const badge = read("src/ui/ProductOwnershipBadge.jsx");
  const packages = read("src/features/packages/PackagePage.jsx");
  const styles = read("src/styles.css");
  assert.match(progress, /productManagerAssignment\(productManager, orgCache\)/);
  assert.match(modal, /productManagerAssignment\(productManager, orgCache\)/);
  assert.match(picker, /prioritizeOwnedProducts\(products, currentUser\)/);
  assert.match(picker, /<ProductOwnershipBadge owned=/);
  assert.match(packages, /currentUser/);
  assert.match(packages, /<ProductPicker[\s\S]*currentUser=\{currentUser\}/);
  assert.match(badge, />我负责</);
  assert.match(styles, /\.product-ownership-badge\s*\{/);
});
```

- [ ] **Step 2: Run the source-contract test and verify it fails because the badge is absent**

Run: `node --test react-tests/react-app.test.mjs`

Expected: FAIL in `organization ownership is saved and shown through one shared product badge`.

- [ ] **Step 3: Add the shared badge and organization-backed assignment patches**

Create `src/ui/ProductOwnershipBadge.jsx`:

```jsx
export function ProductOwnershipBadge({ owned }) {
  return owned ? <span className="product-ownership-badge">我负责</span> : null;
}
```

In both owner selectors, replace the string-only patch with:

```jsx
onChange={productManager => set(productManagerAssignment(productManager, orgCache))}
```

for `ProductModal`, and:

```jsx
onChange={productManager => updateProduct(
  selectedProduct.id,
  productManagerAssignment(productManager, orgCache)
)}
```

for `ProductProgressPage`.

- [ ] **Step 4: Make the picker stable-sort owned products and show the shared badge**

Update the picker to compute:

```jsx
const orderedProducts = useMemo(
  () => prioritizeOwnedProducts(products, currentUser),
  [products, currentUser]
);
const owned = item => isProductOwnedBy(item, currentUser);
```

Use `orderedProducts.map(...)`, and render the product name as:

```jsx
<span className="product-name-line">
  <strong>{item.name}</strong>
  <ProductOwnershipBadge owned={owned(item)} />
</span>
```

Render the same `product-name-line` in the selected-product button. Pass `currentUser` from both `ProductProgressPage` and `PackagePage`.

- [ ] **Step 5: Add compact, responsive badge styling**

Add to `src/styles.css`:

```css
.product-name-line { min-width: 0; display: flex; align-items: center; gap: 6px; }
.product-name-line > strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.product-ownership-badge { flex: 0 0 auto; min-height: 20px; display: inline-flex; align-items: center; padding: 0 7px; border-radius: 999px; background: var(--primary-soft); color: var(--primary); font-size: 11px; font-weight: 650; line-height: 1; white-space: nowrap; }
```

- [ ] **Step 6: Run the domain and source-contract tests**

Run: `node --test react-tests/product-ownership.test.mjs react-tests/react-app.test.mjs`

Expected: all selected tests pass, 0 fail.

- [ ] **Step 7: Commit organization assignment and shared picker UI**

```bash
git add src/ui/ProductOwnershipBadge.jsx src/ui/ProductPicker.jsx src/features/progress/ProductProgressPage.jsx src/features/archive/ProductModal.jsx src/features/packages/PackagePage.jsx src/styles.css react-tests/react-app.test.mjs
git commit -m "feat(products): mark owned products"
```

### Task 3: Personal default selection without overriding explicit navigation

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/features/progress/ProductProgressPage.jsx`
- Modify: `src/features/archive/ProductArchivePage.jsx`
- Modify: `react-tests/react-app.test.mjs`

**Interfaces:**
- Consumes: `preferredProgressProductId` from Task 1.
- Produces: `ProductArchivePage({ onNavigate, onOpenProgress })`; explicit progress navigation carries `{ productId, stage, tick }` through `focusStage`.

- [ ] **Step 1: Add failing navigation-contract assertions**

Add to `react-tests/react-app.test.mjs`:

```js
test("product progress defaults locally but preserves explicit product navigation", () => {
  const app = read("src/App.jsx");
  const progress = read("src/features/progress/ProductProgressPage.jsx");
  const archive = read("src/features/archive/ProductArchivePage.jsx");
  assert.match(app, /setProgressFocus\(null\)/);
  assert.match(app, /onOpenProgress=\{openProgress\}/);
  assert.match(archive, /onOpenProgress\?\.\(product\.id\)/);
  assert.match(progress, /preferredProgressProductId\(state\.products, currentUser, focusStage\?\.productId\)/);
  assert.match(progress, /const selectionInitialized = useRef\(false\)/);
  assert.match(progress, /const lastFocusTick = useRef\(0\)/);
  assert.match(progress, /if \(loading\) return/);
  assert.match(progress, /setSelectedProductId\(productId\)/);
});
```

- [ ] **Step 2: Run the source-contract test and verify the new case fails**

Run: `node --test react-tests/react-app.test.mjs`

Expected: FAIL in `product progress defaults locally but preserves explicit product navigation`.

- [ ] **Step 3: Separate direct navigation from explicit progress navigation**

In `App.jsx`, extract the screen/hash mutation into `showScreen(nextScreen)`. Implement direct and explicit entry as:

```jsx
function navigate(nextScreen) {
  if (nextScreen === "progress") setProgressFocus(null);
  showScreen(nextScreen);
}

function openProgress(productId, stage) {
  if (productId) setCurrentProduct(productId);
  setProgressFocus({ productId, stage, tick: Date.now() });
  showScreen("progress");
}
```

Pass `onOpenProgress={openProgress}` to `ProductArchivePage`. In the archive card action call `onOpenProgress?.(product.id)` instead of setting shared current product and calling generic navigation.

- [ ] **Step 4: Keep progress selection local for the mounted page**

In `ProductProgressPage`, wait for shared state loading to finish, then initialize and maintain a local ID. Track the explicit-navigation tick so that the initial explicit product wins without preventing the user from switching afterward:

```jsx
const selectionInitialized = useRef(false);
const lastFocusTick = useRef(0);
const [selectedProductId, setSelectedProductId] = useState("");
const selectedProduct = state.products.find(item => item.id === selectedProductId) || state.products[0];

useEffect(() => {
  if (loading) return;
  const hasExplicitFocus = Boolean(
    focusStage?.productId && lastFocusTick.current !== focusStage.tick
  );
  const selectionMissing = !state.products.some(product => product.id === selectedProductId);
  if (!selectionInitialized.current || hasExplicitFocus || selectionMissing) {
    const explicitProductId = hasExplicitFocus ? focusStage.productId : "";
    const preferredId = preferredProgressProductId(state.products, currentUser, explicitProductId);
    setSelectedProductId(preferredId);
    selectionInitialized.current = true;
    if (hasExplicitFocus) lastFocusTick.current = focusStage.tick;
  }
}, [currentUser, focusStage?.productId, focusStage?.tick, loading, selectedProductId, state.products]);
```

Update the picker callback to preserve the user's later choice:

```jsx
onChange={productId => {
  setSelectedProductId(productId);
  setCurrentProduct(productId);
}}
```

When returning a product to the demand pool, the existing state update removes it; the effect above selects a remaining valid product.

- [ ] **Step 5: Run ownership and source-contract tests**

Run: `node --test react-tests/product-ownership.test.mjs react-tests/react-app.test.mjs`

Expected: all selected tests pass, 0 fail.

- [ ] **Step 6: Commit progress entry behavior**

```bash
git add src/App.jsx src/features/progress/ProductProgressPage.jsx src/features/archive/ProductArchivePage.jsx react-tests/react-app.test.mjs
git commit -m "feat(progress): prefer owned products"
```

### Task 4: Product archive and planning ownership labels

**Files:**
- Modify: `src/features/archive/ProductArchivePage.jsx`
- Modify: `src/domain/productPlanning.js`
- Modify: `src/features/planning/ProductPlanningPage.jsx`
- Modify: `src/features/planning/PlanningDemandTray.jsx`
- Modify: `src/features/planning/AnnualPlanningTimeline.jsx`
- Modify: `react-tests/product-planning.test.mjs`
- Modify: `react-tests/react-app.test.mjs`

**Interfaces:**
- Consumes: `isProductOwnedBy` and `ProductOwnershipBadge` from Tasks 1 and 2.
- Produces: planning candidates and snapshots with `productManager`, `productManagerUserId`, and `productManagerUnionId`.

- [ ] **Step 1: Add failing planning identity and page-label tests**

Extend the first candidate test in `react-tests/product-planning.test.mjs` with owner fields on `p-active`, then assert:

```js
assert.equal(candidates[1].productManager, "赵雨涵");
assert.equal(candidates[1].productManagerUserId, "u-zhao");
assert.equal(candidates[1].productManagerUnionId, "union-zhao");
```

Add to `react-tests/react-app.test.mjs`:

```js
test("archive and both planning product surfaces show the shared ownership badge", () => {
  const archive = read("src/features/archive/ProductArchivePage.jsx");
  const page = read("src/features/planning/ProductPlanningPage.jsx");
  const tray = read("src/features/planning/PlanningDemandTray.jsx");
  const timeline = read("src/features/planning/AnnualPlanningTimeline.jsx");
  assert.match(archive, /<ProductOwnershipBadge owned=\{isProductOwnedBy\(product, currentUser\)\}/);
  assert.match(page, /currentUser=\{currentUser\}/g);
  assert.match(tray, /<ProductOwnershipBadge owned=\{isProductOwnedBy\(demand, currentUser\)\}/);
  assert.match(timeline, /<ProductOwnershipBadge owned=\{isProductOwnedBy\(snapshot, currentUser\)\}/);
});
```

- [ ] **Step 2: Run planning and source-contract tests and verify both new cases fail**

Run: `node --test react-tests/product-planning.test.mjs react-tests/react-app.test.mjs`

Expected: FAIL on missing planning ownership fields and missing badge usage.

- [ ] **Step 3: Carry current owner identity through planning candidates and snapshots**

In `productPlanning.js`, add:

```js
function productManagerIdentity(product = {}) {
  return {
    productManager: cleanText(product.productManager),
    productManagerUserId: cleanText(product.productManagerUserId),
    productManagerUnionId: cleanText(product.productManagerUnionId)
  };
}
```

Spread `productManagerIdentity(product)` into active-product candidates. Preserve the same three fields inside `normalizeProductPlans().demandSnapshot`.

In `ProductPlanningPage`, spread the matched product's manager fields into `enrichPlanningDemand`, and include them when creating `demandSnapshot` in `savePlan`.

- [ ] **Step 4: Render the shared badge in archive and planning**

Destructure `currentUser` in `ProductArchivePage`, render the badge after the product heading, and leave the existing status badge untouched.

Pass `currentUser` from `ProductPlanningPage` to both planning children. Render:

```jsx
<ProductOwnershipBadge owned={isProductOwnedBy(demand, currentUser)} />
```

beside names in `PlanningDemandTray`, and:

```jsx
<ProductOwnershipBadge owned={isProductOwnedBy(snapshot, currentUser)} />
```

beside names in `AnnualPlanningTimeline`. Wrap each name and ownership badge in `product-name-line` so long names truncate before the badge.

- [ ] **Step 5: Run planning, ownership, and source-contract tests**

Run: `node --test react-tests/product-ownership.test.mjs react-tests/product-planning.test.mjs react-tests/react-app.test.mjs`

Expected: all selected tests pass, 0 fail.

- [ ] **Step 6: Commit archive and planning labels**

```bash
git add src/features/archive/ProductArchivePage.jsx src/domain/productPlanning.js src/features/planning/ProductPlanningPage.jsx src/features/planning/PlanningDemandTray.jsx src/features/planning/AnnualPlanningTimeline.jsx react-tests/product-planning.test.mjs react-tests/react-app.test.mjs
git commit -m "feat(products): label owned product surfaces"
```

### Task 5: Full verification and design audit

**Files:**
- Modify only if verification reveals a defect in files already listed above.

**Interfaces:**
- Consumes: completed Tasks 1-4.
- Produces: verified React behavior, production build, and responsive UI acceptance.

- [ ] **Step 1: Run the full React test suite**

Run: `npm run test:react`

Expected: exit 0 with 0 failed tests.

- [ ] **Step 2: Run the API regression suite**

Run: `npm run test:api`

Expected: exit 0 with 0 failed tests.

- [ ] **Step 3: Build the production bundle**

Run: `npm run build`

Expected: exit 0 and Vite reports a completed production build.

- [ ] **Step 4: Audit the requested pages at desktop and narrow widths**

Run the local app at `127.0.0.1:8132` and verify at 1440px, 1024px, and a narrow viewport:

```text
产品进度：直接进入显示本人第一款产品；明确点开的其他产品不被覆盖。
产品下拉：本人产品稳定置顶，当前区和选项均显示“我负责”。
产品档案：标签不挤压状态标签、操作按钮或产品说明。
产品规划：待规划卡片和年度时间轴均显示标签，长名称正常截断，拖拽和编辑保持可用。
```

Expected: no overlap, clipping, horizontal overflow, inconsistent badge styling, or color-only ownership communication.

- [ ] **Step 5: Check the final diff for scope and whitespace defects**

Run: `git diff --check && git status --short && git diff --stat HEAD~4..HEAD`

Expected: `git diff --check` has no output; only the planned product ownership files and pre-existing untracked workspace items appear.
