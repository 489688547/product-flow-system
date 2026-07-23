import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const read = path => readFileSync(resolve(root, path), "utf8");

test("project uses React Vite and Tailwind v4 as the new frontend foundation", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts.dev, "vite --host 127.0.0.1 --port 8132");
  assert.equal(pkg.scripts.build, "npm run check:environment-capabilities && vite build && node scripts/prepare-pages-build.mjs && node scripts/check-build-chunks.mjs");
  assert.equal(pkg.scripts["test:react"], "node --test react-tests/*.test.mjs");
  assert.match(pkg.scripts.test, /test:react/);
  assert.match(pkg.scripts.test, /test:api/);
  assert.ok(pkg.dependencies.react);
  assert.ok(pkg.dependencies["react-dom"]);
  assert.ok(pkg.dependencies.tailwindcss);
  assert.ok(pkg.dependencies["@tailwindcss/vite"]);
  assert.ok(existsSync(resolve(root, "src/main.jsx")));
  assert.match(read("vite.config.js"), /tailwindcss\(\)/);
  assert.match(read("src/styles.css"), /@import "tailwindcss";/);
});

test("deliverable preview recognizes image data URLs without saved MIME metadata", async () => {
  const { deliverableKind, canDownloadDeliverable } = await import("../src/domain/deliverables.js");
  assert.equal(deliverableKind({ name: "会议纪要图", url: "data:image/svg+xml,%3Csvg%3E%3C/svg%3E" }), "image");
  assert.equal(canDownloadDeliverable({ url: "data:image/png;base64,AA==" }, "https://example.com"), true);
  assert.equal(canDownloadDeliverable({ url: "/files/report.pdf" }, "https://example.com"), true);
  assert.equal(canDownloadDeliverable({ url: "https://alidocs.dingtalk.com/i/nodes/abc" }, "https://example.com"), false);
});

test("domain model keeps product-flow rules independent from React components", () => {
  const domain = read("src/domain/productFlow.js");
  assert.match(domain, /export const PRODUCT_LEVELS/);
  assert.match(domain, /export const STAGES/);
  assert.match(domain, /export const PRODUCT_LEVEL_FLOW_RULES/);
  assert.match(domain, /export function createDefaultState/);
  assert.match(domain, /export function visibleDemandPool/);
  assert.match(domain, /export function canConvertDemandToProject/);
  assert.match(domain, /export function convertDemandToProject/);
  assert.match(domain, /export function tasksForProductStage/);
  assert.match(domain, /export function stagePolicy/);
});

test("shared state layer uses the same-origin production data proxy during local preview", async () => {
  const store = read("src/state/ProductFlowProvider.jsx");
  const sync = read("src/state/sharedStateSync.js");
  const api = await import("../src/state/stateApi.js");
  assert.equal(api.sharedStateApiUrl("127.0.0.1"), "/api/state");
  assert.equal(api.sharedStateApiUrl("localhost"), "/api/state");
  assert.equal(api.sharedStateApiUrl("product-flow-system.pages.dev"), "/api/state");
  assert.match(store, /sharedStateApiUrl\(window\.location\.hostname\)/);
  assert.doesNotMatch(store, /fetch\("\/api\/state"\)/);
  assert.doesNotMatch(store, /if \(localStorage\.getItem\(DIRTY_STORAGE_KEY\) === "1" && !isLocalPreview\(\)\)/);
  assert.match(store, /createSharedStateSyncSession/);
  assert.match(store, /persistLocalState/);
  assert.match(sync, /baseUpdatedAt/);
  assert.match(store, /productFlowStateRecoveryBackup/);
  assert.match(store, /tryRemoveStorageItem\(localCache, DIRTY_STORAGE_KEY\)/);
  assert.match(store, /method: "POST"/);
  assert.match(store, /tryGetStorageItem\(localCache, STORAGE_KEY\)/);
  assert.doesNotMatch(store, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(store, /sharedError/);
  assert.match(store, /productFlowStateDirty/);
  assert.doesNotMatch(store, /keepalive: true/);
  assert.match(store, /共享数据加载失败，已暂停自动保存，请刷新重试/);
  assert.match(store, /tryGetStorageItem\(localCache, DIRTY_STORAGE_KEY\)/);
  assert.match(store, /const commitState = useCallback/);
  assert.match(store, /persistLocalState\(localCache, STORAGE_KEY, nextState\)/);
  assert.match(store, /const updateTask = useCallback[\s\S]*commitState\(current/);
  assert.match(store, /latestState\.current === state/);
  assert.doesNotMatch(store, /if \(localStorage\.getItem\(DIRTY_STORAGE_KEY\) === "1"\) return;/);
  assert.match(store, /fetch\("\/api\/dingtalk\/org\/sync"/);
  assert.match(store, /orgSyncAttempted/);
  assert.match(store, /orgCache: payload\.org/);
});

test("business providers never write or remove browser storage outside the resilient cache boundary", () => {
  const providerPaths = [
    "src/state/AiAssistantProvider.jsx",
    "src/state/BrandContentProvider.jsx",
    "src/state/DataCenterProvider.jsx",
    "src/state/PlatformProvider.jsx",
    "src/state/ProductFlowProvider.jsx",
    "src/state/SupplyChainProvider.jsx"
  ];

  for (const path of providerPaths) {
    const source = read(path);
    assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage)\.(?:setItem|removeItem)\(/, path);
    assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage)\s*[,.)\[]/, path);
  }
});

test("new app exposes all core product workflow pages", () => {
  const app = read("src/App.jsx");
  assert.match(app, /总览/);
  assert.match(app, /需求池/);
  assert.match(app, /产品进度/);
  assert.match(app, /产品档案/);
  assert.doesNotMatch(app, /\["packages", "资料包"/);
  assert.match(app, /HIDDEN_SCREENS/);
  assert.match(app, /packages: <PackagePage/);
  assert.match(app, /设置/);
  assert.match(app, /问题反馈/);
  assert.doesNotMatch(app, /\["reviews", "评审决策"/);
  assert.doesNotMatch(app, /\["review", "产品复盘"/);
  assert.match(app, /\["progress", "产品进度"[\s\S]*\["archive", "产品档案"/);
  assert.match(app, /progressFocus/);
  assert.match(app, /openProgress/);
  assert.match(app, /setCurrentProduct\(productId\)/);
  assert.match(app, /<DashboardPage onNavigate=\{navigate\} onOpenProgress=\{openProgress\}/);
  assert.match(app, /<ProductProgressPage focusStage=\{progressFocus\}/);
  assert.match(app, /window\.location\.hash/);
  assert.match(app, /hashchange/);
});

test("supply chain feature has department defaults and an isolated persistence provider", async () => {
  const permissions = await import("../src/domain/permissions.js");
  const api = await import("../src/state/supplyChainApi.js");
  const provider = read("src/state/SupplyChainProvider.jsx");
  assert.ok(permissions.FEATURE_PERMISSION_ITEMS.some(item => item.key === "supplyChain"));
  assert.equal(permissions.canAccessSupplyChain({ department: "供应链部" }), true);
  assert.equal(permissions.canAccessSupplyChain({ department: "品牌部" }), false);
  assert.equal(api.supplyChainApiUrl("product-flow-system.pages.dev"), "/api/supply-chain");
  assert.match(provider, /tryGetStorageItem\(localCache, STORAGE_KEY\)/);
  assert.match(provider, /method: "POST"/);
  assert.match(provider, /syncApprovals/);
  assert.match(provider, /if \(!dirty\.current\) return undefined/);
});

test("annual product planning uses one development-to-launch period and overwrites duplicate demand plans", () => {
  const app = read("src/App.jsx");
  const page = read("src/features/planning/ProductPlanningPage.jsx");
  const tray = read("src/features/planning/PlanningDemandTray.jsx");
  const timeline = read("src/features/planning/AnnualPlanningTimeline.jsx");
  const modal = read("src/features/planning/ProductPlanModal.jsx");
  const button = read("src/ui/Button.jsx");
  const styles = read("src/styles.css");

  assert.match(app, /CalendarRange/);
  assert.match(app, /\["demands", "需求池"[\s\S]*\["planning", "产品规划"[\s\S]*\["progress", "产品进度"/);
  assert.match(app, /planning: <ProductPlanningPage/);
  assert.match(page, /<DemandModal/);
  assert.match(page, /buildPlanningCandidates/);
  assert.match(page, /canEditProductPlanning/);
  assert.match(page, /disabledReason=/);
  assert.match(button, /disabledReason/);
  assert.match(button, /disabled-action-tip/);
  assert.match(button, /data-disabled-reason/);
  assert.match(button, /tabIndex="0"/);
  assert.doesNotMatch(button, /title=\{disabledReason\}/);
  assert.match(button, /export function IconAction\(\{ label, children, className = "", disabled = false, disabledReason = ""/);
  assert.match(tray, /application\/x-product-demand-id/);
  assert.match(tray, /draggable=\{canEdit\}/);
  assert.match(tray, /level-badge/);
  assert.match(tray, /\/>安排/);
  assert.doesNotMatch(tray, /需求池产品/);
  assert.match(timeline, /Array\.from\(\{ length: 12 \}/);
  assert.match(timeline, /timelineSegment/);
  assert.match(timeline, /开发至上线/);
  assert.match(timeline, /level-badge/);
  assert.match(timeline, /来源需求已删除/);
  assert.match(page, /existingPlan/);
  assert.match(page, /levelConfirmed/);
  assert.match(modal, /DatePickerField/);
  assert.match(modal, /开发开始/);
  assert.match(modal, /预计上线/);
  assert.doesNotMatch(modal, /launchStart/);
  assert.doesNotMatch(modal, /developmentEnd/);
  assert.match(modal, /validateProductPlan/);
  assert.match(modal, /<ConfirmDialog/);
  assert.match(modal, /的这条产品规划/);
  assert.match(styles, /\.planning-timeline/);
  assert.match(styles, /\.planning-product-column/);
  assert.match(styles, /\.planning-bar\.period/);
  assert.doesNotMatch(styles, /\.planning-bar\.launch/);
  assert.match(styles, /grid-template-columns: repeat\(12, minmax\(68px, 1fr\)\)/);
});

test("planning range bar separates precise editing from cancellable pointer dragging", () => {
  const rangeBar = read("src/features/planning/PlanningRangeBar.jsx");

  assert.match(rangeBar, /export function PlanningRangeBar/);
  assert.match(rangeBar, /DRAG_THRESHOLD_PX = 4/);
  assert.match(rangeBar, /setPointerCapture/);
  assert.match(rangeBar, /releasePointerCapture/);
  assert.match(rangeBar, /onPointerCancel=/);
  assert.match(rangeBar, /onLostPointerCapture=/);
  assert.match(rangeBar, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(rangeBar, /formatPlanningDateRange/);
  assert.match(rangeBar, /planningDaysFromPixels/);
  assert.match(rangeBar, /movePlanningRange/);
  assert.match(rangeBar, /resizePlanningRange/);
  assert.match(rangeBar, /aria-label=/);
  assert.match(rangeBar, /data-range-edge="start"/);
  assert.match(rangeBar, /data-range-edge="end"/);
  assert.match(rangeBar, /onChange\(nextDates\)/);
});

test("dashboard uses aligned section headers plus reusable product thumbnails in task and risk rows", () => {
  const dashboard = read("src/features/dashboard/DashboardPage.jsx");
  const styles = read("src/styles.css");
  assert.match(dashboard, /function ProductThumb/);
  assert.match(dashboard, /className="panel-title"/);
  assert.match(dashboard, /className="task-row"/);
  assert.doesNotMatch(dashboard, /className="task-icon"/);
  assert.match(dashboard, /className="product-thumb"/);
  assert.match(dashboard, /productById/);
  assert.match(dashboard, /onNavigate\("progress"\)/);
  assert.match(dashboard, /onOpenProgress/);
  assert.match(dashboard, /openProgress\(product, task\.stage\)/);
  assert.match(dashboard, /dashboardTasksForUser/);
  // 总经办看全公司并可按部门筛选；非总经办没有筛选入口
  assert.match(dashboard, /canManagePermissions/);
  assert.match(dashboard, /dashboardTasksForExecutive/);
  assert.match(dashboard, /isExecutive \? <HeaderFilter/);
  assert.doesNotMatch(dashboard, /identity=\{isExecutive/);
  assert.match(dashboard, /全部部门/);
  assert.match(dashboard, /riskMetaForTask/);
  assert.match(dashboard, /currentUser/);
  assert.match(dashboard, /<h2>待办事项<\/h2>/);
  assert.match(dashboard, /<small>待办事项<\/small>/);
  assert.doesNotMatch(dashboard, /待评审会议/);
  assert.match(dashboard, /departmentTasks\.length/);
  assert.match(dashboard, /departmentTasks\[0\]/);
  assert.doesNotMatch(dashboard, /本周待办事项/);
  assert.match(styles, /\.panel-title\s*\{[\s\S]*display: flex;[\s\S]*align-items: center;/);
  assert.match(styles, /\.product-thumb\s*\{[\s\S]*width: 40px;[\s\S]*height: 40px;/);
  assert.match(styles, /\.task-row, \.risk-row\s*\{[\s\S]*width: 100%;/);
  assert.match(styles, /\.task-row\s*\{[\s\S]*grid-template-columns: 30px minmax\(0, 1fr\);/);
  assert.match(styles, /\.task-row\s*\{[\s\S]*min-height: 48px;[\s\S]*border-radius: 0;/);
  assert.match(styles, /\.task-row:hover\s*\{[\s\S]*background: var\(--surface-subtle\);/);
  assert.doesNotMatch(styles, /\.task-row:hover, \.risk-row:hover\s*\{[\s\S]*background: var\(--primary-soft\);/);
  assert.match(styles, /\.dashboard-grid\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
});

test("demand pool supports rich text, status filtering, and clear project conversion", () => {
  const page = read("src/features/demands/DemandPoolPage.jsx");
  const modal = read("src/features/demands/DemandModal.jsx");
  const domain = read("src/domain/productFlow.js");
  const rich = read("src/ui/RichTextEditor.jsx");
  const org = read("src/ui/OrgSelect.jsx");
  assert.match(domain, /export const DEMAND_POOL_STANDARDS/);
  assert.match(domain, /1\. 收集机会/);
  assert.match(domain, /2\. 讨论判断/);
  assert.match(domain, /3\. 形成结论/);
  assert.match(domain, /4\. 进入立项/);
  assert.match(page, /DemandPoolStandards/);
  assert.match(page, /需求推进规则/);
  assert.doesNotMatch(page, /HeaderFilter/);
  assert.doesNotMatch(page, /setLevel/);
  assert.doesNotMatch(page, /item\.check/);
  assert.match(page, /className="standard-rule"/);
  assert.match(page, /function DemandStatusSelect/);
  assert.match(page, /statusPickerOpen/);
  assert.match(page, /className=\{`demand-status-pill/);
  assert.match(page, /<FloatingMenu/);
  assert.match(page, /className="demand-status-menu"/);
  assert.match(page, /className=\{`demand-status-option/);
  assert.match(page, /role="listbox"/);
  assert.match(page, /role="option"/);
  assert.doesNotMatch(page, /render: demand => <select value=\{demand\.status\}/);
  assert.match(page, /StatusStrip/);
  assert.match(page, /data-testid="convert-demand"/);
  assert.match(page, />立项</);
  assert.match(page, /disabled=\{!canConvertDemandToProject\(demand\)\}/);
  assert.match(page, /<ConfirmDialog/);
  assert.match(page, /删除需求机会/);
  assert.match(page, /currentUser/);
  assert.match(page, /orgCache=\{orgCache\}/);
  assert.match(page, /key: "requester", header: "提需人"/);
  assert.match(modal, /<RichTextEditor/);
  assert.match(modal, /<OrgSelect/);
  assert.match(modal, /type="user"/);
  assert.match(modal, /type="department"/);
  assert.match(modal, /机会描述/);
  assert.match(modal, /讨论摘要/);
  assert.match(modal, /提需人/);
  assert.match(modal, /currentUser\?\.name/);
  assert.match(modal, /产品图片/);
  assert.match(modal, /ExpectedLaunchMonthSelect/);
  assert.match(modal, /expectedLaunchMonth/);
  assert.doesNotMatch(modal, /PRODUCT_LEVELS|RESERVE_LEVEL|参考等级/);
  assert.match(page, /key: "expectedLaunchMonth", header: "期望上线"/);
  assert.match(modal, /type="file"/);
  assert.match(modal, /accept="image\/\*"/);
  assert.match(modal, /generateProductCover\(form\.name\)/);
  assert.doesNotMatch(modal, /使用自动封面/);
  assert.match(modal, /type="user"[\s\S]*searchInMenu/);
  assert.match(modal, /type="department"[\s\S]*searchInMenu/);
  assert.match(page, /demand\.image/);
  assert.match(page, /generateProductCover\(form\.name\)/);
  assert.doesNotMatch(modal, /<label>负责人/);
  assert.match(org, /role="combobox"/);
  assert.match(org, /<FloatingMenu/);
  assert.match(org, /className="org-select-menu"/);
  assert.match(org, /const \[query, setQuery\] = useState\(""\)/);
  assert.match(org, /onFocus=\{\(\) => \{ setQuery\(""\);[\s\S]*setOpen\(true\); \}\}/);
  assert.match(org, /value=\{open \? query : value\}/);
  assert.match(org, /onChange=\{event => \{[\s\S]*setQuery\(event\.target\.value\);[\s\S]*setOpen\(true\);/);
  assert.match(org, /aria-label=\{inputLabel\}/);
  assert.match(org, /orgUsers/);
  assert.match(org, /orgDepartments/);
  assert.match(org, /multiple = false/);
  assert.match(org, /selectedValues/);
  assert.match(org, /selectedValues\.join\(" \/ "\)/);
  assert.match(org, /multiple \? toggleItem/);
  assert.match(org, /normalizeDepartmentSelection/);
  assert.match(org, /type === "department" \? "搜索部门/);
  assert.match(org, /selectedValues\.includes\(right\.value\)/);
  assert.match(rich, /new Quill/);
  assert.match(rich, /toolbar\.addHandler\("image"/);
  assert.match(read("src/styles.css"), /\.demand-status-select\s*\{[\s\S]*width: fit-content;/);
  assert.match(read("src/styles.css"), /\.demand-status-pill\s*\{[\s\S]*min-height: 30px;/);
  assert.doesNotMatch(read("src/styles.css"), /\.demand-status-menu\s*\{[^}]*position: absolute;/);
  assert.match(read("src/styles.css"), /\.demand-status-option[\s\S]*min-height: 34px;/);
});

test("all searchable and custom dropdowns render through a viewport floating layer", () => {
  const floating = read("src/ui/FloatingMenu.jsx");
  const demands = read("src/features/demands/DemandPoolPage.jsx");
  const progress = read("src/features/progress/ProductProgressPage.jsx");
  const productPicker = read("src/ui/ProductPicker.jsx");
  const org = read("src/ui/OrgSelect.jsx");
  const styles = read("src/styles.css");
  assert.match(floating, /createPortal/);
  assert.match(floating, /document\.body/);
  assert.match(floating, /position: "fixed"/);
  assert.match(floating, /addEventListener\("scroll"/);
  assert.match(floating, /addEventListener\("resize"/);
  assert.match(floating, /availableBelow/);
  assert.match(floating, /availableAbove/);
  assert.match(floating, /anchorRect\.bottom <= VIEWPORT_PADDING/);
  assert.match(demands, /<FloatingMenu/);
  assert.match(progress, /<ProductPicker/);
  assert.match(productPicker, /<FloatingMenu/);
  assert.match(org, /<FloatingMenu/);
  assert.doesNotMatch(org, /<datalist/);
  assert.match(org, /selected\?\.value \|\| selectedValues\[0\]/);
  assert.match(styles, /\.floating-menu-layer\s*\{[\s\S]*z-index: 80;/);
});

test("product progress derives stages and tasks from the selected product level", () => {
  const page = read("src/features/progress/ProductProgressPage.jsx");
  const categorySelect = read("src/features/progress/TaskCategorySelect.jsx");
  const meetingModal = read("src/features/progress/MeetingScheduleModal.jsx");
  const datePicker = read("src/ui/DatePickerField.jsx");
  const pkg = JSON.parse(read("package.json"));
  assert.match(page, /productStagePolicy\(state, selectedProduct, stage\.index\)/);
  assert.match(page, /productStagePolicy\(state, selectedProduct, selectedStage\)/);
  assert.match(page, /tasksForProductStage\(state, selectedProduct, selectedStage\)/);
  assert.doesNotMatch(page, /advanceProductStage/);
  assert.doesNotMatch(page, /完成当前阶段并进入下一阶段/);
  assert.match(page, /STAGES\.filter\(stage => stage\.index > 0\)/);
  assert.doesNotMatch(page, /下一阶段/);
  assert.match(page, /<span className="stage-num">\{stage\.index\}<\/span>/);
  assert.match(page, /<h2>\{selectedStage\}\. \{STAGES\[selectedStage\]\.title\}<\/h2>/);
  assert.match(page, /设为当前阶段/);
  assert.match(page, /当前阶段/);
  assert.match(page, /setProductStage/);
  assert.match(page, /confirmLabel="设为当前阶段"/);
  assert.doesNotMatch(page, /同步默认任务/);
  assert.doesNotMatch(page, /syncDefaultTasksForProduct\(selectedProduct\.id\)/);
  assert.match(page, /该等级不涉及/);
  assert.doesNotMatch(page, /评审会议/);
  assert.doesNotMatch(page, /reviewRowsForProduct\(state, selectedProduct\)/);
  assert.doesNotMatch(page, /updateReviewMinutes/);
  assert.doesNotMatch(page, /<span className="muted">-<\/span>/);
  assert.match(page, /OrgSelect/);
  assert.match(page, /type="department"/);
  assert.match(page, /multiple/);
  assert.match(page, /searchInMenu/);
  assert.match(page, /taskCategoryActions/);
  assert.match(page, /minWidth=\{880\}/);
  assert.match(page, /categoryActions\.todo/);
  assert.match(page, /categoryActions\.meeting/);
  assert.doesNotMatch(page, /disabled=\{!isMeetingTask \|\| hasMeeting\}/);
  assert.match(page, /addTask/);
  assert.match(page, /deleteTask/);
  assert.match(page, /<ConfirmDialog/);
  assert.match(page, /returnProductToDemand/);
  assert.match(page, /className="compact quiet-danger"/);
  assert.match(page, /progress-overview-toolbar/);
  assert.match(page, /data-testid="add-stage-task"/);
  assert.match(page, /data-testid="return-product-demand"/);
  assert.match(page, /data-testid="sync-task-todo"/);
  assert.match(page, /<TodoSyncModal/);
  assert.match(page, /todoSyncStatus\(task\)/);
  assert.doesNotMatch(page, /disabled=\{!hasValidDue\}/);
  assert.doesNotMatch(page, /updateTask\(todoTask\.id, \{ due: draft\.dueDate \}\)/);
  assert.match(page, /const effectiveTask = \{ \.\.\.todoTask, due: draft\.dueDate \}/);
  assert.doesNotMatch(page, /markTodoSynced/);
  assert.match(page, /stagePolicyTone/);
  assert.match(page, /policy-\$\{stagePolicyTone\(policy\.mode\)\}/);
  assert.match(page, /<ProductPicker/);
  assert.match(page, /className=\{`task-check/);
  assert.match(page, /type="checkbox"/);
  assert.match(page, /focusStage/);
  assert.match(page, /setSelectedStage\(validProgressStage\(focusStage\.stage\)\)/);
  assert.match(page, /产品负责人/);
  assert.match(page, /departmentFilter="产品"/);
  assert.match(page, /productManager/);
  assert.match(page, /请先选择产品负责人/);
  assert.match(page, /<DatePickerField/);
  assert.match(page, /<TaskCategorySelect/);
  assert.match(page, /<TaskDeliverables/);
  assert.match(page, /<TaskDeliverableModal/);
  assert.match(page, /deliverablesForTask\(state, task\.id\)/);
  assert.match(page, /task\.required/);
  assert.match(page, /completionBlocked/);
  assert.match(page, /请先添加交付物/);
  assert.doesNotMatch(page, /aria-label=\{`\$\{task\.title\}交付物`\}/);
  assert.match(page, /<MeetingScheduleModal/);
  assert.match(page, /data-testid="schedule-task-meeting"/);
  assert.match(page, /categoryActions\.meeting/);
  assert.match(page, /task\.dingMeeting\?\.eventId/);
  assert.doesNotMatch(page, /type="date"/);
  assert.match(categorySelect, /TASK_CATEGORIES/);
  assert.match(categorySelect, /<FloatingMenu/);
  assert.match(categorySelect, /role="listbox"/);
  assert.match(meetingModal, /orgUsers\(orgCache\)/);
  assert.match(meetingModal, /type="datetime-local"/);
  assert.match(meetingModal, /同步到钉钉日程/);
  assert.match(meetingModal, /<FullScreenLoading visible=\{submitting\}/);
  assert.ok(pkg.dependencies["react-day-picker"]);
  assert.match(datePicker, /DayPicker/);
  assert.match(datePicker, /<FloatingMenu/);
  assert.match(datePicker, /className=\{`date-picker-trigger/);
  assert.match(datePicker, /aria-haspopup="dialog"/);
  assert.match(datePicker, /今天/);
  assert.match(datePicker, /清除/);
  assert.match(read("src/styles.css"), /\.product-identity-select\s*\{[\s\S]*grid-template-columns: 40px minmax\(0, 1fr\) 20px;/);
  assert.match(read("src/styles.css"), /\.date-picker-trigger\s*\{[\s\S]*width: 100%;[\s\S]*height: var\(--control-height\);/);
  assert.match(read("src/styles.css"), /\.date-picker-menu\s*\{[\s\S]*overflow: visible;/);
  assert.match(read("src/styles.css"), /\.product-identity-thumb\s*\{[\s\S]*width: 40px;[\s\S]*height: 40px;/);
  assert.match(read("src/styles.css"), /\.product-picker\s*\{[\s\S]*width: fit-content;/);
  assert.doesNotMatch(read("src/styles.css"), /\.product-switch-menu\s*\{[^}]*position: absolute;/);
  assert.match(read("src/styles.css"), /\.product-switch-option\s*\{[\s\S]*grid-template-columns: 38px minmax\(0, 1fr\) 18px;/);
  assert.match(read("src/styles.css"), /\.btn\.quiet-danger\s*\{[\s\S]*min-height: 32px;/);
  assert.match(read("src/styles.css"), /\.stage-card em\.policy-required\s*\{[\s\S]*background: var\(--primary-soft\);/);
  assert.match(read("src/styles.css"), /\.stage-card em\.policy-suggested\s*\{[\s\S]*background: var\(--warning-soft\);/);
  assert.match(read("src/styles.css"), /\.stage-grid\s*\{[^}]*grid-template-columns: repeat\(5,/s);
  assert.match(read("src/styles.css"), /\.progress-overview-toolbar\s*\{/);
});

test("product progress reuses the shared development-to-launch schedule", () => {
  const page = read("src/features/progress/ProductProgressPage.jsx");
  const componentPath = resolve(root, "src/features/progress/ProductScheduleSummary.jsx");
  const styles = read("src/styles.css");
  assert.ok(existsSync(componentPath));
  const summary = read("src/features/progress/ProductScheduleSummary.jsx");
  assert.match(page, /buildProductScheduleSummary/);
  assert.match(page, /<ProductScheduleSummary/);
  assert.match(page, /progress-overview-toolbar/);
  assert.ok(page.indexOf("<ProductPicker") < page.indexOf("<ProductScheduleSummary"));
  assert.ok(page.indexOf("<ProductScheduleSummary") < page.indexOf("return-product-demand"));
  assert.match(summary, /未设置排期/);
  assert.match(summary, /前往产品规划/);
  assert.match(summary, /schedule-progress-ring/);
  assert.match(summary, /实际任务进度/);
  assert.doesNotMatch(summary, /时间进度/);
  assert.match(styles, /\.product-schedule-summary\s*\{/);
  assert.match(styles, /\.schedule-progress-ring\.overdue\s*\{/);
});

test("task deliverable modal supports DingTalk documents and rich text", () => {
  const modal = read("src/features/progress/TaskDeliverableModal.jsx");
  const list = read("src/features/progress/TaskDeliverables.jsx");

  assert.match(modal, /钉钉文档/);
  assert.match(modal, /alidocs\.dingtalk\.com/);
  assert.match(modal, /<RichTextEditor/);
  assert.match(modal, /setType\("richtext"\)/);
  assert.match(modal, /setType\("dingtalk-doc"\)/);
  assert.match(list, /slice\(0, 3\)/);
  assert.match(list, /task-deliverable-add/);
});

test("product progress completes deliverable edit and delete actions", () => {
  const page = read("src/features/progress/ProductProgressPage.jsx");
  const modal = read("src/features/progress/TaskDeliverableModal.jsx");
  const preview = read("src/ui/DeliverablePreviewModal.jsx");

  assert.match(page, /updateDeliverable/);
  assert.match(page, /deleteDeliverable/);
  assert.match(page, /editingDeliverable/);
  assert.match(page, /deliverableToDelete/);
  assert.match(page, /title="删除交付物"/);
  assert.match(modal, /file\?\.id/);
  assert.match(modal, /编辑交付物/);
  assert.match(modal, /保存/);
  assert.match(preview, /onEdit/);
  assert.match(preview, /onDelete/);
  assert.match(preview, /编辑交付物/);
  assert.match(preview, /删除交付物/);
});

test("product tasks expose configured DingTalk document templates beside deliverables", () => {
  const page = read("src/features/progress/ProductProgressPage.jsx");
  const list = read("src/features/progress/TaskDeliverables.jsx");
  const modal = read("src/features/progress/TaskTemplateModal.jsx");
  const styles = read("src/styles.css");

  assert.match(page, /<TaskTemplateModal/);
  assert.match(page, /onOpenTemplates/);
  assert.match(page, /deliverableTemplates={task\.deliverableTemplates/);
  assert.match(list, /task-deliverable-add[\s\S]*task-template-open/);
  assert.match(list, />模板<\/button>/);
  assert.match(list, /disabled=\{!deliverableTemplates\.length\}/);
  assert.match(modal, /钉钉文档模板/);
  assert.match(modal, /document\.name/);
  assert.match(modal, /window\.open\(document\.url, "_blank", "noopener,noreferrer"\)/);
  assert.match(styles, /\.task-template-open\s*\{[^}]*height: 40px;/s);
  assert.match(styles, /\.task-template-document\s*\{[^}]*grid-template-columns:/s);
});

test("initiation grading is calculated in a modal and cannot be changed by a plain level select", () => {
  const progress = read("src/features/progress/ProductProgressPage.jsx");
  const modal = read("src/features/progress/ProductGradingModal.jsx");
  const productFlow = read("src/domain/productFlow.js");
  const archiveModal = read("src/features/archive/ProductModal.jsx");
  const orgSelect = read("src/ui/OrgSelect.jsx");

  assert.match(progress, /<ProductGradingModal/);
  assert.match(progress, /gradeProduct/);
  assert.match(progress, /产品负责人/);
  assert.match(progress, /searchInMenu/);
  assert.match(progress, /查看定级打分/);
  assert.match(progress, /期望上线/);
  assert.match(progress, /level-badge/);
  assert.match(orgSelect, /searchInMenu/);
  assert.match(orgSelect, /org-select-trigger/);
  assert.match(orgSelect, /org-select-menu-search/);
  assert.match(modal, /calculateProductGrade/);
  assert.match(modal, /canEdit/);
  assert.match(modal, /disabled=\{!canEdit\}/);
  assert.match(modal, /footer=\{canEdit/);
  assert.match(progress, /canEdit=\{currentUser\?\.name === selectedProduct\.productManager\}/);
  assert.match(modal, /RESERVE_LEVEL/);
  assert.match(modal, /自动退回需求池/);
  assert.match(modal, /产品等级/);
  assert.match(modal, /product\?\.expectedLaunchMonth/);
  assert.match(modal, /风险等级/);
  assert.match(modal, /推进方式/);
  assert.match(productFlow, /30-100万/);
  assert.doesNotMatch(archiveModal, /name="product-level"/);
});

test("initiation places average monthly GMV between manager and formal grading", () => {
  const progress = read("src/features/progress/ProductProgressPage.jsx");
  const modal = read("src/features/progress/ProductGradingModal.jsx");
  const styles = read("src/styles.css");

  assert.match(progress, /产品负责人[\s\S]*平均月 GMV[\s\S]*产品定级/);
  assert.match(progress, /monthlyGmvTarget/);
  assert.doesNotMatch(progress, /suggestAnnualGmvScore/);
  assert.doesNotMatch(progress, /用于经营目标和 GMV 达成率/);
  assert.doesNotMatch(modal, /monthlyGmvTarget/);
  assert.doesNotMatch(modal, /平均月 GMV/);
  assert.match(styles, /\.project-gmv-target\s*\{/);
  assert.doesNotMatch(styles, /\.grading-gmv-target\s*\{/);
});

test("progress and archive reuse one ERP-backed GMV achievement component", () => {
  const progress = read("src/features/progress/ProductProgressPage.jsx");
  const archive = read("src/features/archive/ProductArchivePage.jsx");
  const summary = read("src/features/sales/ProductGmvSummary.jsx");
  const hook = read("src/features/sales/useProductSalesRows.js");
  const styles = read("src/styles.css");

  assert.match(progress, /<ProductGmvSummary/);
  assert.match(archive, /<ProductGmvSummary/);
  assert.match(summary, /本月 GMV/);
  assert.match(summary, /累计 GMV/);
  assert.match(summary, /待绑定销售商品/);
  assert.match(hook, /fetchSalesForCodes/);
  assert.match(styles, /\.product-gmv-summary\s*\{/);
});

test("demand conversion opens the new product at initiation", () => {
  const app = read("src/App.jsx");
  const demands = read("src/features/demands/DemandPoolPage.jsx");

  assert.match(app, /<DemandPoolPage onProjectCreated=/);
  assert.match(app, /openProgress\(productId, 1\)/);
  assert.match(demands, /const productId = convertDemand\(demand\.id\)/);
  assert.match(demands, /onProjectCreated\?\.\(productId\)/);
});

test("DingTalk embedded app exchanges a JSAPI code for the unified server session", () => {
  const html = read("index.html");
  const provider = read("src/state/AuthProvider.jsx");
  const login = read("src/domain/dingTalkLogin.js");

  assert.match(html, /dingtalk-jsapi\/3\.0\.40\/dingtalk\.open\.js/);
  assert.match(provider, /loginWithDingTalkRuntime\(window\)/);
  assert.match(provider, /refreshSession/);
  assert.match(login, /requestAuthCode/);
  assert.match(login, /\/api\/auth\/dingtalk\/embedded/);
  assert.doesNotMatch(login, /localStorage/);
});

test("browser users see DingTalk login before company data mounts", () => {
  const main = read("src/main.jsx");
  const authProvider = read("src/state/AuthProvider.jsx");
  const authGate = read("src/features/auth/AuthGate.jsx");
  const loginPage = read("src/features/auth/LoginPage.jsx");
  const authSession = read("src/domain/authSession.js");

  assert.match(main, /<AuthProvider>/);
  assert.match(main, /<AuthGate>/);
  assert.match(main, /function AuthenticatedApp\(\)[\s\S]*<ProductFlowProvider>/);
  assert.match(main, /<AuthGate>[\s\S]*<AuthenticatedApp \/>/);
  assert.match(authProvider, /status: "checking"/);
  assert.match(authSession, /\/api\/auth\/session/);
  assert.match(authSession, /\/api\/auth\/logout/);
  assert.match(loginPage, /使用钉钉扫码登录/);
  assert.match(loginPage, /\/api\/auth\/dingtalk\/start/);
  assert.match(authGate, /LoginPage/);
  assert.doesNotMatch(loginPage, /本地测试登录/);
});

test("authenticated account menu exposes only logout", () => {
  const app = read("src/App.jsx");
  assert.match(app, /useAuth\(\)/);
  assert.match(app, /退出账号/);
  assert.match(app, /logout/);
  assert.match(app, /account-menu/);
});

test("the static shell shows a loading state before React mounts in DingTalk", () => {
  const html = read("index.html");

  assert.match(html, /<script defer src="https:\/\/g\.alicdn\.com\/dingding\/dingtalk-jsapi\/3\.0\.40\/dingtalk\.open\.js"><\/script>/);
  assert.match(html, /id="app-boot"/);
  assert.match(html, /正在打开经营执行平台/);
});

test("table action CSS keeps row height stable across pages", () => {
  const styles = read("src/styles.css");
  const table = read("src/ui/DataTable.jsx");
  assert.match(table, /className="table-actions"/);
  assert.match(styles, /\.data-table tbody td\s*\{[\s\S]*height: 54px;/);
  assert.match(styles, /\.data-table th:last-child, \.data-table td:last-child\s*\{[\s\S]*width: 1%;[\s\S]*white-space: nowrap;/);
  assert.match(styles, /\.table-actions\s*\{[\s\S]*flex-wrap: nowrap;[\s\S]*justify-content: flex-start;/);
  assert.match(styles, /\.btn:disabled\s*\{[\s\S]*color: var\(--text-disabled\);[\s\S]*opacity: 1;/);
  assert.match(styles, /\.icon-action\s*\{[\s\S]*width: 32px;[\s\S]*height: 32px;/);
});

test("product archive is a reusable product record surface with edit and linked workflow actions", () => {
  const archive = read("src/features/archive/ProductArchivePage.jsx");
  const modal = read("src/features/archive/ProductModal.jsx");
  assert.match(archive, /ProductModal/);
  assert.match(archive, /HeaderFilter/);
  assert.match(archive, /statusFilter/);
  assert.match(archive, /levelFilter/);
  assert.match(archive, /stageFilter/);
  assert.match(archive, /orgCache=\{orgCache\}/);
  assert.match(archive, /data-testid="product-edit"/);
  assert.match(archive, /data-testid="open-product-progress"/);
  assert.match(archive, /data-testid="open-product-package"/);
  assert.match(archive, /data-testid="open-product-sales"/);
  assert.match(archive, /未填写69码/);
  assert.match(archive, /disabledReason=\{hasSkuCodes \? "" : "未填写69码，编辑产品后即可查看销售数据"\}/);
  assert.doesNotMatch(archive, /className=\{hasSkuCodes \? undefined : "disabled-action-tip"\}/);
  assert.doesNotMatch(archive, /open-product-review/);
  assert.doesNotMatch(archive, /产品复盘/);
  assert.match(archive, /ProductPackageModal/);
  assert.match(modal, /产品名称/);
  assert.match(modal, /产品等级/);
  assert.match(modal, /期望上线/);
  assert.match(modal, /提需人/);
  assert.match(modal, /产品经理/);
  assert.match(modal, /departmentFilter="产品"/);
  assert.match(modal, /<OrgSelect/);
  assert.match(modal, /type="user"/);
  assert.match(modal, /type="department"/);
  assert.match(modal, /产品描述/);
  assert.match(modal, /封面图片/);
  // 封面图 hover 显示编辑图标，不再有独立的替换图片按钮
  assert.match(modal, /cover-editable/);
  assert.match(modal, /cover-edit-overlay/);
  assert.doesNotMatch(modal, /替换图片/);
  assert.match(modal, /onSave/);
});

test("review decisions are editable meeting records tied to product progress", () => {
  const reviews = read("src/features/reviews/ReviewDecisionPage.jsx");
  assert.match(reviews, /selectedProductId/);
  assert.match(reviews, /reviewRowsForProduct/);
  assert.match(reviews, /data-testid="review-minutes"/);
  assert.match(reviews, /补纪要/);
  assert.match(reviews, /已通过/);
  assert.match(reviews, /未到阶段/);
  assert.match(reviews, /RichTextEditor/);
  assert.match(reviews, /disabled=\{review\.stage > selectedProduct\.stage\}/);
  assert.doesNotMatch(reviews, /<span className="muted">-<\/span>/);
});

test("package manager uses preview-first file cards with edit download and delete actions", () => {
  const packages = read("src/features/packages/PackagePage.jsx");
  const preview = read("src/ui/DeliverablePreviewModal.jsx");
  const store = read("src/state/ProductFlowProvider.jsx");
  assert.match(packages, /data-testid="package-dropzone"/);
  assert.match(packages, /addDeliverable/);
  assert.match(packages, /updateDeliverable/);
  assert.match(packages, /deleteDeliverable/);
  assert.match(packages, /<ConfirmDialog/);
  assert.match(packages, /删除文件/);
  assert.doesNotMatch(packages, /window\.open/);
  assert.match(packages, /file-card/);
  assert.match(packages, /file-card-overlay/);
  assert.match(packages, /file-card-main/);
  assert.match(packages, /canDownloadDeliverable/);
  assert.match(packages, /编辑/);
  assert.match(packages, /下载/);
  assert.match(packages, /删除/);
  assert.match(packages, /isBrokenDeliverable/);
  assert.match(preview, /deliverableKind/);
  assert.match(preview, /deliverable-image-preview/);
  assert.match(preview, /deliverable-video-preview/);
  assert.match(preview, /deliverable-file-frame/);
  assert.match(store, /const updateDeliverable/);
});

test("issue feedback and settings pages persist company-wide operational data", () => {
  const issues = read("src/features/issues/IssuePage.jsx");
  const floating = read("src/features/issues/FloatingIssueButton.jsx");
  const app = read("src/App.jsx");
  const styles = read("src/styles.css");
  const settings = read("src/features/settings/SettingsPage.jsx");
  const store = read("src/state/ProductFlowProvider.jsx");
  assert.match(issues, /问题描述/);
  assert.match(issues, /截图/);
  assert.match(issues, /addFeedbackIssue/);
  assert.match(issues, /data-testid="issue-submit"/);
  assert.match(app, /FloatingIssueButton/);
  assert.match(app, /<FloatingIssueButton \/>/);
  assert.match(floating, /data-testid="floating-issue-button"/);
  assert.match(floating, /提出问题/);
  assert.match(floating, /<Modal/);
  assert.match(floating, /问题描述/);
  assert.match(floating, /截图/);
  assert.match(floating, /disabled=\{!desc\.trim\(\) \|\| !screenshot\}/);
  assert.match(floating, /addFeedbackIssue/);
  assert.match(styles, /\.floating-issue-button\s*\{[\s\S]*position: fixed;[\s\S]*right: 22px;[\s\S]*bottom: 22px;/);
  assert.match(styles, /\.page\s*\{[^}]*padding-bottom:\s*calc\(80px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(settings, /PermissionSettings/);
  assert.match(settings, /总经办/);
  assert.match(settings, /updateSettings/);
  assert.match(store, /addFeedbackIssue/);
  assert.match(store, /updateSettings/);
});

test("settings configures level-specific stage task and DingTalk deliverable templates", () => {
  const page = read("src/features/settings/SettingsPage.jsx");
  const editor = read("src/features/settings/TaskTemplateSettings.jsx");
  const modal = read("src/features/settings/DeliverableTemplateEditorModal.jsx");
  const provider = read("src/state/ProductFlowProvider.jsx");
  const styles = read("src/styles.css");

  assert.match(page, /<TaskTemplateSettings/);
  assert.match(page, /updateTaskTemplates/);
  assert.match(editor, /PRODUCT_LEVELS/);
  assert.match(editor, /STAGES\.filter\(stage => stage\.index > 0\)/);
  assert.match(editor, /<TaskCategorySelect/);
  assert.match(editor, /<OrgSelect/);
  assert.match(editor, /multiple/);
  assert.match(editor, /searchInMenu/);
  assert.match(editor, /minWidth=\{940\}/);
  assert.doesNotMatch(editor, /label=\{`\$\{template\.title\}责任部门`\}/);
  assert.match(editor, /交付物模板/);
  assert.match(editor, /是否必需/);
  assert.match(editor, /required/);
  assert.match(editor, /<DeliverableTemplateEditorModal/);
  assert.match(editor, /<ConfirmDialog/);
  assert.match(editor, /有未保存修改/);
  assert.match(editor, /已保存并同步到对应产品/);
  assert.match(editor, /disabled=\{!hasChanges\}/);
  assert.match(editor, /JSON\.stringify\(cloneTemplates\(templates\)\)/);
  assert.match(editor, /handleSave/);
  assert.match(modal, /alidocs\.dingtalk\.com/);
  assert.match(modal, /钉钉文档名称/);
  assert.match(modal, /钉钉文档链接/);
  assert.match(provider, /updateWorkflowTaskTemplates/);
  assert.match(provider, /updateTaskTemplates/);
  assert.match(styles, /\.settings-task-templates\s*\{[^}]*margin-top:/s);
  assert.match(styles, /\.template-filter-group\s*\{[^}]*display: flex;/s);
  assert.match(styles, /\.deliverable-template-row\s*\{[^}]*grid-template-columns:/s);
});

test("settings uses organization-backed navigation and feature permission matrices", () => {
  const app = read("src/App.jsx");
  const page = read("src/features/settings/SettingsPage.jsx");
  const permissions = read("src/features/settings/PermissionSettings.jsx");
  const editor = read("src/features/settings/TaskTemplateSettings.jsx");

  assert.match(app, /canViewNavigation/);
  assert.match(app, /visibleNavigation/);
  assert.match(page, /canManagePermissions/);
  assert.match(page, /canViewFeature/);
  assert.match(page, /canEditFeature/);
  assert.match(page, /<PermissionSettings/);
  assert.match(permissions, /导航权限/);
  assert.match(permissions, /功能设置/);
  assert.match(permissions, /<OrgSelect/);
  assert.match(permissions, /type="title"/);
  assert.match(editor, /canEdit/);
  assert.match(editor, /disabled={!canEdit/);
  assert.doesNotMatch(page, /角色权限/);
});

test("visual system uses a lighter collaboration-tool shell instead of dark admin styling", () => {
  const styles = read("src/styles.css");
  const app = read("src/App.jsx");
  assert.match(styles, /\.app-shell\s*\{[\s\S]*grid-template-columns: 176px minmax\(0, 1fr\);/);
  assert.match(styles, /\.sidebar\s*\{[\s\S]*background: rgba\(255, 255, 255, \.86\);/);
  assert.match(styles, /\.sidebar nav button\.active\s*\{[\s\S]*background: var\(--primary-soft\);[\s\S]*color: var\(--primary\);/);
  assert.match(styles, /\.page\s*\{[\s\S]*padding: 22px 26px;/);
  assert.match(styles, /\.section-panel, \.table-wrap, \.product-card, \.file-tile\s*\{[\s\S]*box-shadow: var\(--shadow-sm\);/);
  assert.match(app, /currentUser/);
  assert.match(app, /currentUser\?\.name/);
});

test("project-level design system prevents conflicting marketing and product UI rules", () => {
  const design = read("DESIGN.md");
  assert.match(design, /产品工作台/);
  assert.match(design, /frontend-design-principles/);
  assert.match(design, /impeccable/);
  assert.match(design, /web-design-guidelines/);
  assert.match(design, /不使用.*high-end-visual-design/);
  assert.match(design, /4px/);
  assert.match(design, /8px/);
  assert.match(design, /12px/);
});

test("product identity selector is reused instead of native product selects", () => {
  const picker = read("src/ui/ProductPicker.jsx");
  const progress = read("src/features/progress/ProductProgressPage.jsx");
  const packages = read("src/features/packages/PackagePage.jsx");
  assert.match(picker, /export function ProductPicker/);
  assert.match(picker, /<FloatingMenu/);
  assert.match(picker, /product\.image/);
  assert.match(picker, /levelConfirmed/);
  assert.match(picker, /formatExpectedLaunchMonth/);
  assert.match(progress, /<ProductPicker/);
  assert.match(packages, /<ProductPicker/);
  assert.doesNotMatch(packages, /<select value=\{selectedProduct/);
});

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

test("product progress defaults locally but preserves explicit product navigation", () => {
  const app = read("src/App.jsx");
  const progress = read("src/features/progress/ProductProgressPage.jsx");
  const archive = read("src/features/archive/ProductArchivePage.jsx");
  assert.match(app, /setProgressFocus\(null\)/);
  assert.match(app, /onOpenProgress=\{openProgress\}/);
  assert.match(archive, /onOpenProgress\?\.\(product\.id\)/);
  assert.match(progress, /preferredProgressProductId\(state\.products, currentUser, explicitProductId\)/);
  assert.match(progress, /const selectionInitialized = useRef\(false\)/);
  assert.match(progress, /const lastFocusTick = useRef\(0\)/);
  assert.match(progress, /if \(loading\) return/);
  assert.match(progress, /setSelectedProductId\(productId\)/);
});

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

test("initiated planning cards open product progress without hijacking the arrange action", () => {
  const app = read("src/App.jsx");
  const page = read("src/features/planning/ProductPlanningPage.jsx");
  const tray = read("src/features/planning/PlanningDemandTray.jsx");
  const styles = read("src/styles.css");

  assert.match(app, /<ProductPlanningPage onOpenProgress=\{openProgress\}/);
  assert.match(page, /onOpenProgress=\{onOpenProgress\}/);
  assert.match(tray, /onOpenProgress\?\.\(demand\.productId\)/);
  assert.match(tray, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(tray, /event\.stopPropagation\(\)/);
  assert.match(styles, /\.planning-demand-chip\.is-progress-link/);
});

test("shared page and table primitives support consistent hierarchy and responsive density", () => {
  const pageHeader = read("src/ui/PageHeader.jsx");
  const table = read("src/ui/DataTable.jsx");
  const styles = read("src/styles.css");
  assert.match(pageHeader, /export function PageHeader/);
  assert.match(pageHeader, /className="page-header"/);
  assert.match(table, /minWidth/);
  assert.match(table, /data-label/);
  assert.match(styles, /--space-1: 4px/);
  assert.match(styles, /--radius-control: 8px/);
  assert.match(styles, /--radius-panel: 12px/);
  assert.match(styles, /font-size: 14px/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /prefers-reduced-motion/);
});

test("product progress appends tasks and supports persistent drag ordering", () => {
  const progress = read("src/features/progress/ProductProgressPage.jsx");
  const provider = read("src/state/ProductFlowProvider.jsx");
  const table = read("src/ui/DataTable.jsx");
  const styles = read("src/styles.css");

  assert.match(progress, /GripVertical/);
  assert.match(progress, /draggable/);
  assert.match(progress, /reorderTasks/);
  assert.match(progress, /getRowProps/);
  assert.match(progress, /拖动调整任务顺序/);
  assert.match(provider, /nextTaskSortOrder/);
  assert.match(provider, /tasks:\s*\[\.\.\.\(current\.tasks \|\| \[\]\), taskWithOrder\]/);
  assert.match(provider, /reorderProductStageTasks/);
  assert.match(table, /getRowProps/);
  assert.match(styles, /\.task-drag-handle\s*\{/);
});

test("task deletion uses one designed confirmation dialog and a compact drag column", () => {
  const progress = read("src/features/progress/ProductProgressPage.jsx");
  const settings = read("src/features/settings/TaskTemplateSettings.jsx");
  const dialog = read("src/ui/ConfirmDialog.jsx");
  const styles = read("src/styles.css");

  assert.match(progress, /<ConfirmDialog/);
  assert.match(settings, /<ConfirmDialog/);
  assert.doesNotMatch(progress, /window\.confirm\("确认删除这个任务/);
  assert.doesNotMatch(settings, /window\.confirm\("确认删除这个默认任务模板/);
  assert.match(dialog, /export function ConfirmDialog/);
  assert.match(dialog, /variant="danger"/);
  assert.match(styles, /\.task-table th:nth-child\(1\), \.task-table td:nth-child\(1\)\s*\{[^}]*width: 32px;[^}]*min-width: 32px;/s);
  assert.match(styles, /\.task-drag-handle\s*\{[^}]*width: 24px;/s);
});

test("modal supplies keyboard escape, scroll locking, and labelled close control", () => {
  const modal = read("src/ui/Modal.jsx");
  assert.match(modal, /createPortal/);
  assert.match(modal, /event\.key === "Escape"/);
  assert.match(modal, /document\.body\.style\.overflow/);
  assert.match(modal, /aria-labelledby/);
  assert.match(modal, /aria-label="关闭"/);
});
