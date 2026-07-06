import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("core pages use shared page sections and empty states", () => {
  assert.match(html, /class="page-section"/);
  assert.match(html, /class="empty-state"/);
  assert.match(html, /emptyStateHtml/);
});

test("sidebar is compact but keeps full navigation labels", () => {
  assert.match(html, /\.app \{[\s\S]*grid-template-columns: 172px minmax\(0, 1fr\);/);
  assert.match(html, /\.nav button \{[\s\S]*white-space: nowrap;/);
  assert.match(html, /<button data-screen="settings"><i data-lucide="settings"><\/i><span>设置<\/span><\/button>/);
});

test("demand pool uses one streamlined sortable list instead of duplicate board and records", () => {
  assert.match(html, /需求池列表/);
  assert.doesNotMatch(html, /需求看板/);
  assert.doesNotMatch(html, /需求记录/);
  assert.doesNotMatch(html, /id="demandBoard"/);
  assert.match(html, /class="section-toolbar"/);
  assert.match(html, /class="demand-status-strip"/);
  assert.match(html, /data-demand-filter/);
  assert.match(html, /id="demandLevelFilterMenu"/);
  assert.match(html, /data-demand-level-filter-toggle/);
  assert.match(html, /讨论摘要/);
});

test("demand pool uses compact header filters instead of outside selects or sortable headers", () => {
  assert.doesNotMatch(html, /data-demand-sort/);
  assert.doesNotMatch(html, /function sortDemands/);
  assert.doesNotMatch(html, /function setDemandSort/);
  assert.doesNotMatch(html, /let demandSort/);
  assert.doesNotMatch(html, /class="demand-filter-bar"/);
  assert.doesNotMatch(html, /id="demandLevelFilter"/);
  assert.match(html, /<th>机会名称<\/th>/);
  assert.match(html, /<th>状态<\/th>/);
  assert.match(html, /<span>等级<\/span>/);
  assert.match(html, /class="table-filter-trigger" data-demand-level-filter-toggle/);
  assert.match(html, /data-demand-level-filter="all"/);
  assert.match(html, /data-demand-level-filter="P0 重点品"/);
  assert.match(html, /<th>来源<\/th>/);
  assert.match(html, /<th>负责人<\/th>/);
  assert.match(html, /<th>创建时间<\/th>/);
  assert.match(html, /let demandLevelFilter = "all";/);
  assert.match(html, /visibleDemands = visibleDemands\.filter\(demand => demand\.level === demandLevelFilter\);/);
  assert.match(html, /function syncDemandLevelFilterMenu\(\)/);
  assert.match(html, /demandLevelFilter = btn\.dataset\.demandLevelFilter \|\| "all";/);
});

test("demand pool only shows active opportunity statuses", () => {
  assert.match(html, /const demandPoolStatuses = \["待讨论", "讨论中", "已讨论", "暂缓"\]/);
  assert.match(html, /const visibleDemandRecords = demands\.filter\(isDemandInPool\)/);
  assert.doesNotMatch(html, /statusLabels = \["all", "待讨论", "讨论中", "已讨论", "暂缓", "已转开发"\]/);
});

test("demand pool keeps status transitions in the status select and row actions on one line", () => {
  assert.match(html, /<select class="demand-status-control" data-demand-status="\$\{esc\(d\.id\)\}" aria-label="调整需求状态">/);
  assert.doesNotMatch(html, /data-demand-start/);
  assert.doesNotMatch(html, /data-demand-finish/);
  assert.doesNotMatch(html, /data-demand-pause/);
  assert.doesNotMatch(html, /data-demand-resume/);
  assert.match(html, /\.demand-table \.table-actions \{[\s\S]*flex-wrap: nowrap;[\s\S]*justify-content: center;/);
  assert.match(html, /\.demand-table th:last-child,\s+\.demand-table td:last-child \{[\s\S]*width: 132px;[\s\S]*text-align: center;/);
  assert.match(html, /class="mini-action icon-only" title="转入开发" aria-label="转入开发" data-demand-convert/);
  assert.match(html, /class="mini-action icon-only" title="编辑需求" aria-label="编辑需求" data-edit-demand/);
  assert.match(html, /class="mini-action icon-only danger" title="删除需求" aria-label="删除需求" data-delete-demand/);
});

test("demand discussion summary is editable from the demand modal", () => {
  assert.match(html, /id="discussionField"/);
  assert.match(html, /<textarea id="formDiscussion" placeholder="讨论后的判断、争议点、下一步结论"><\/textarea>/);
  assert.match(html, /discussionField\.classList\.toggle\("hidden", mode === "productEdit"\)/);
  assert.match(html, /document\.getElementById\("formDiscussion"\)\.value = target\?\.discussion \|\| "";/);
  assert.match(html, /demand\.discussion = document\.getElementById\("formDiscussion"\)\.value\.trim\(\);/);
  assert.match(html, /discussion: document\.getElementById\("formDiscussion"\)\.value\.trim\(\) \|\| "待讨论：补充用户痛点、市场空间、供应链可行性和建议产品等级。"/);
});

test("demand modal uses organization-backed owner and department selectors", () => {
  assert.match(html, /class="owner-combobox" id="ownerCombobox"/);
  assert.match(html, /<input type="hidden" id="formOwner">/);
  assert.match(html, /id="ownerSearch" placeholder="搜索姓名、岗位、部门"/);
  assert.match(html, /<select id="formSource"><\/select>/);
  assert.match(html, /function orgDepartmentOptions\(selected = ""\)/);
  assert.match(html, /\.\.\.\(orgCache\?\.departments \|\| \[\]\)\.map\(dept => dept\.name \|\| dept\.deptName \|\| dept\.departmentName\)/);
  assert.match(html, /function ownerCandidates\(selected = ""\)/);
  assert.match(html, /const users = orgUsers\(\);[\s\S]*users\.map\(user => \(\{/);
  assert.match(html, /renderSourceOptions\(target\?\.source \|\| ""\);/);
  assert.match(html, /setOwnerPickerValue\(target\?\.owner \|\| ""\);/);
  assert.doesNotMatch(html, /document\.getElementById\("formOwner"\)\.value = target\?\.owner \|\| "赵雨涵";/);
  assert.doesNotMatch(html, /document\.getElementById\("formSource"\)\.value = target\?\.source \|\| "产品部";/);
});

test("demand modal requires name owner level source and description before save", () => {
  assert.match(html, /<button class="btn primary" id="saveModal" disabled>/);
  assert.match(html, /function modalRequiredValues\(\)/);
  assert.match(html, /function missingModalFields\(\)/);
  assert.match(html, /\["owner", "负责人"\]/);
  assert.match(html, /\["source", "来源部门"\]/);
  assert.match(html, /\["desc", modalMode === "productEdit" \? "产品描述" : "机会描述"\]/);
  assert.match(html, /function updateModalSaveState\(\)[\s\S]*saveButton\.disabled = missingModalFields\(\)\.length > 0;/);
  assert.match(html, /function validateModalForm\(\)[\s\S]*toast\(`请先填写：\$\{missing\.join\("、"\)\}`\);/);
  assert.match(html, /if \(!validateModalForm\(\)\) return;/);
  assert.match(html, /const formValues = modalRequiredValues\(\);/);
  assert.doesNotMatch(html, /owner: document\.getElementById\("formOwner"\)\.value\.trim\(\) \|\| "产品部"/);
});

test("product archive edit modal reuses product data and shows demand discussion", () => {
  assert.match(html, /id="productProfilePanel"/);
  assert.match(html, /id="productMetaRows"/);
  assert.match(html, /id="productDiscussionRecord"/);
  assert.match(html, /function sourceDemandForProduct\(product\)/);
  assert.match(html, /function productArchiveRecord\(product\)/);
  assert.match(html, /function renderProductProfilePanel\(product\)/);
  assert.match(html, /productProfilePanel\.classList\.toggle\("show", mode === "productEdit"\)/);
  assert.match(html, /renderProductProfilePanel\(target\)/);
  assert.match(html, /<strong>需求讨论记录<\/strong>/);
  assert.match(html, /desc: demand\.desc,/);
  assert.doesNotMatch(html, /desc: `\$\{demand\.desc\} \$\{demand\.discussion\}`/);
});

test("settings page is only visible to general office users and shows permission settings", () => {
  assert.match(html, /<section class="screen" id="settings">/);
  assert.match(html, /系统设置/);
  assert.match(html, /人员权限/);
  assert.match(html, /function currentUserDepartments\(/);
  assert.match(html, /function canViewSettings\(/);
  assert.match(html, /department\.includes\("总经办"\)/);
  assert.match(html, /if \(screen === "settings"\) return canViewSettings\(\);/);
  assert.match(html, /function renderSettings\(/);
  assert.match(html, /renderSettings\(\);/);
});

test("workflow can return a product back to the demand pool and clear progress data", () => {
  assert.match(html, /data-return-product-demand/);
  assert.match(html, /function returnProductToDemand\(id = currentId\)/);
  assert.match(html, /state\.tasks = state\.tasks\.filter\(t => t\.productId !== id\)/);
  assert.match(html, /state\.deliverables = state\.deliverables\.filter\(d => d\.productId !== id\)/);
  assert.match(html, /state\.reviews = state\.reviews\.filter\(r => r\.productId !== id\)/);
  assert.match(html, /state\.decisions = state\.decisions\.filter\(d => d\.productId !== id\)/);
  assert.match(html, /state\.dingMeetings = \(state\.dingMeetings \|\| \[\]\)\.filter\(meeting => meeting\.productId !== id\)/);
  assert.match(html, /demand\.productId = ""/);
  assert.match(html, /demand\.status = "已讨论"/);
});

test("dashboard task rows use row affordance instead of an arrow icon", () => {
  assert.doesNotMatch(html, /class="task-link" data-open-task="\$\{esc\(t\.id\)\}"><i data-lucide="external-link"><\/i>/);
  assert.match(html, /<tr class="task-row" data-open-task="\$\{esc\(t\.id\)\}" tabindex="0">/);
  assert.match(html, /#todayTasks tr\.task-row \{[\s\S]*cursor: pointer;/);
  assert.match(html, /#todayTasks tr\.task-row:hover td/);
});

test("workflow task due date uses a date picker and refreshes dashboard data", () => {
  assert.match(html, /<input type="date" data-task-field="due" value="\$\{esc\(taskDueInputValue\(t\.due\)\)\}" \$\{disabled\}>/);
  assert.match(html, /function taskDueInputValue\(due\)/);
  assert.match(html, /function formatTaskDueDisplay\(due\)/);
  assert.match(html, /if \(field === "done" \|\| field === "due"\) renderAll\(\);/);
  assert.match(html, /<td>\$\{esc\(formatTaskDueDisplay\(t\.due\)\)\}<\/td>/);
  assert.match(html, /return \(a\.dueDate\?\.getTime\(\) \|\| Number\.MAX_SAFE_INTEGER\) - \(b\.dueDate\?\.getTime\(\) \|\| Number\.MAX_SAFE_INTEGER\);/);
});

test("workflow task editor allocates enough width for full due dates", () => {
  assert.match(html, /\.task-edit-row \{[\s\S]*grid-template-columns: 104px minmax\(360px, 1\.7fr\) minmax\(168px, \.75fr\) minmax\(180px, \.85fr\) 142px 268px;/);
  assert.match(html, /\.task-edit-row input,\s+\.task-edit-row select \{[\s\S]*width: 100%;[\s\S]*min-width: 0;/);
  assert.match(html, /\.task-edit-row input\[type="date"\] \{[\s\S]*min-width: 132px;[\s\S]*font-variant-numeric: tabular-nums;/);
  assert.match(html, /\.stage-editor \{[\s\S]*overflow-x: auto;/);
  assert.doesNotMatch(html, /grid-template-columns: 104px minmax\(220px, 1\.4fr\) 128px 150px 76px 70px minmax\(150px, \.7fr\)/);
});

test("workflow task rows use compact action buttons and a done toggle button", () => {
  assert.match(html, /class="task-complete-check \$\{t\.done \? "done" : ""\} \$\{taskEditable \? "" : "disabled"\}"/);
  assert.match(html, /<input type="checkbox" data-task-done="\$\{esc\(t\.id\)\}" \$\{t\.done \? "checked" : ""\} \$\{disabled\}>/);
  assert.match(html, /t\.done \? "已完成" : "未完成"/);
  assert.match(html, /class="task-row-actions"/);
  assert.match(html, /\.task-row-actions \{[\s\S]*display: flex;[\s\S]*flex-wrap: nowrap;[\s\S]*justify-content: flex-start;/);
  assert.match(html, /<button class="mini-action" data-sync-task="\$\{esc\(t\.id\)\}"><i data-lucide="send"><\/i>同步待办<\/button>/);
  assert.match(html, /\.task-table \.table-actions \{[\s\S]*width: 100%;[\s\S]*justify-content: flex-end;[\s\S]*flex-wrap: nowrap;/);
  assert.match(html, /class="mini-action icon-only danger" title="删除任务" aria-label="删除任务" data-delete-task/);
  assert.doesNotMatch(html, /<label class="task-label"><input type="checkbox" data-task-field="done"/);
  assert.doesNotMatch(html, /class="task-state-toggle/);
});

test("product archive actions are discoverable without relying only on icons", () => {
  assert.match(html, /class="product-action-menu"/);
  assert.match(html, /<span>进度<\/span>/);
  assert.match(html, /<span>资料<\/span>/);
  assert.match(html, /<span>评审<\/span>/);
});

test("product archive page uses header filters and aligned list columns", () => {
  assert.match(html, /\.product-list-head,\s+\.product-row\.archive-row \{[\s\S]*grid-template-columns: minmax\(360px, 1fr\) 108px 68px 104px 506px;/);
  assert.match(html, /\.product-list-head \{[\s\S]*padding: 0 12px 8px;/);
  assert.match(html, /\.product-row\.archive-row \{[\s\S]*min-height: 104px;/);
  assert.match(html, /\.product-row\.archive-row > \.badge,\s+\.product-row\.archive-row > \.product-level,\s+\.product-row\.archive-row > \.product-stage \{[\s\S]*justify-self: start;/);
  assert.match(html, /<span class="product-level">\$\{esc\(p\.level\.split\(" "\)\[0\]\)\}<\/span>/);
  assert.match(html, /document\.getElementById\("statusFilter"\)\.classList\.add\("hidden"\);/);
  assert.doesNotMatch(html, /产品只能从需求池转入开发后生成；这里负责查看状态、阶段、资料和会议记录。/);
  assert.match(html, /data-product-filter-toggle="status"/);
  assert.match(html, /data-product-filter-toggle="level"/);
  assert.match(html, /data-product-filter-toggle="stage"/);
  assert.match(html, /let productStatusFilter = "all";/);
  assert.match(html, /if \(productStatusFilter !== "all"\) list = list\.filter\(product => product\.status === productStatusFilter\);/);
  assert.match(html, /if \(productLevelFilter !== "all"\) list = list\.filter\(product => product\.level === productLevelFilter\);/);
  assert.match(html, /if \(productStageFilter !== "all"\) list = list\.filter\(product => String\(product\.stage\) === productStageFilter\);/);
  assert.match(html, /function syncProductFilterMenus\(\)/);
  assert.doesNotMatch(html, /document\.getElementById\("statusFilter"\)\.classList\.toggle\("hidden", screen !== "products"\)/);
});

test("package manager exposes drag and drop affordance and file empty state", () => {
  assert.match(html, /class="package-drop-hint"/);
  assert.match(html, /拖拽文件到这里/);
  assert.match(html, /暂无资料文件/);
});

test("review and lifecycle pages group actions and editable data areas", () => {
  assert.match(html, /class="review-action-group"/);
  assert.match(html, /class="task-table review-table"/);
  assert.match(html, /\.review-table \.table-actions \{[\s\S]*width: auto;[\s\S]*justify-content: flex-start;/);
  assert.match(html, /class="lifecycle-data-panel"/);
  assert.match(html, /class="metric-input"/);
});

test("floating issue feedback requires description and screenshot and is visible to general office", () => {
  assert.match(html, /id="feedbackButton"/);
  assert.match(html, /id="feedbackModal"/);
  assert.match(html, /id="feedbackDesc"/);
  assert.match(html, /id="feedbackShotFile" accept="image\/\*"/);
  assert.match(html, /<button class="btn primary" id="saveFeedback" disabled>/);
  assert.match(html, /function feedbackRequiredValues\(\)/);
  assert.match(html, /save\.disabled = !values\.desc \|\| !values\.screenshot;/);
  assert.match(html, /state\.feedbackIssues\.unshift/);
  assert.match(html, /<button data-screen="issues"><i data-lucide="message-circle-warning"><\/i><span>BUG 优化<\/span><\/button>/);
  assert.match(html, /if \(screen === "issues"\) return canViewSettings\(\);/);
  assert.match(html, /function renderIssues\(\)/);
  assert.match(html, /renderIssues\(\);/);
});
