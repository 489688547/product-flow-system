# 公司网页数据采集器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在公司 Mac 上建立每天 05:00 自动运行的通用网页数据采集器，并以快麦 ERP 作为首个完整适配器，将昨天事实数据和当前快照/维度数据安全、幂等地写入 D1。

**Architecture:** Chrome MV3 插件运行在公司日常 Chrome 中复用登录态并执行打包在扩展内的受限页面动作；本机 loopback 执行器负责上海时区调度、D1 任务租约、下载交接、运行状态和 macOS 通知。provider adapter 只声明固定域名、资源、页面状态和导出/入库步骤。Cloudflare Pages Functions 是设备和 D1 之间唯一的数据控制面，现有快麦文件解析与 ingest API 继续作为业务数据入口。

**Tech Stack:** Chrome Extensions Manifest V3、Node.js ESM、loopback HTTP、Cloudflare Pages Functions、Cloudflare D1、macOS LaunchAgent/Keychain/osascript、React、Node Test Runner。

## Global Constraints

- 不读取、上传或记录密码、Cookie、Token、验证码、页面正文、截图和客户个人信息。
- 远端任务只能引用代码内 provider/resource ID；不能下发任意 URL、选择器或 JavaScript。
- 快麦订单及售后事实按 `Asia/Shanghai` 的订单创建时间归日；正常经营口径排除“其它/其他/未知”。
- 只有业务事实完成 D1 ingest 后任务才是 `success` 并推进游标；登录成功、导出成功或下载完成都不能冒充入库成功。
- 本地、D1/Pages 和生产网页采集分别验收。远端迁移、部署和生产写入必须在执行当时再次取得授权。
- 现有未提交的数据同步页面改动属于同一功能链，实施时保留并在对应任务中验证，不覆盖无关用户文件。

---

## Task 1: 建立纯领域调度与任务状态模型

**Files:**
- Create: `src/domain/webCollection.js`
- Create: `tests/web-collection-schedule.test.mjs`
- Modify: `docs/platform/data-acquisition.md`

- [ ] **Step 1: 写调度与状态转换失败测试**

覆盖 05:00 前不创建任务、05:00 后生成昨天事实任务、快照任务使用当前日期、电脑晚启动补跑、幂等键稳定、同 provider 串行、只有成功推进游标、06:30 汇总通知和同错误去重。

```js
assert.deepEqual(
  createDailyPlan({ adapters: [kuaimai], now: "2026-07-22T05:01:00+08:00" })
    .filter(job => job.rangeKind === "daily_fact")
    .map(job => job.businessDate),
  ["2026-07-21", "2026-07-21"]
);
assert.equal(webCollectionJobKey(job), "kuaimai:orders:2026-07-21:v1");
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/web-collection-schedule.test.mjs`

Expected: FAIL，因为 `src/domain/webCollection.js` 尚不存在。

- [ ] **Step 3: 实现最小纯函数接口**

导出：

```js
export const WEB_COLLECTION_STATES = Object.freeze([...]);
export function createDailyPlan({ adapters, cursors = [], now, timeZone = "Asia/Shanghai", scheduleHour = 5 }) {}
export function webCollectionJobKey(job) {}
export function assertWebCollectionTransition(from, to) {}
export function nextCursorForSuccessfulJob(job, run) {}
export function notificationIntents({ jobs, notifications = [], now, timeZone = "Asia/Shanghai" }) {}
```

所有日期计算返回明确的 `businessDate`、`rangeStart`、`rangeEnd`、`rangeKind` 和 `scheduleVersion`，不依赖浏览器本地时区。

- [ ] **Step 4: 运行测试并确认通过**

Run: `node --test tests/web-collection-schedule.test.mjs`

Expected: PASS。

- [ ] **Step 5: 写回共享数据采集规则**

在 `docs/platform/data-acquisition.md` 记录事实/快照资源范围、状态转换、幂等键和游标规则。

---

## Task 2: 建立通用 D1 任务控制面

**Files:**
- Create: `migrations/0009_web_collection.sql`
- Create: `functions/api/platform/v1/web-collection/_shared/authorization.js`
- Create: `functions/api/platform/v1/web-collection/_shared/http.js`
- Create: `functions/api/platform/v1/web-collection/_shared/storage.js`
- Create: `functions/api/platform/v1/web-collection/runners.js`
- Create: `functions/api/platform/v1/web-collection/jobs.js`
- Create: `tests/helpers/web-collection-d1-mock.mjs`
- Create: `tests/web-collection-migration.test.mjs`
- Create: `tests/web-collection-api.test.mjs`
- Create: `docs/platform/apis/web-collection-v1.md`
- Modify: `docs/platform/api-catalog.md`
- Modify: `docs/platform/error-codes.md`
- Modify: `docs/platform/integration-registry.json`
- Modify: `docs/platform/environment-capabilities.json`

- [ ] **Step 1: 写迁移与 API 失败测试**

迁移测试必须断言以下表、唯一键和索引存在：

```text
web_collection_runners
web_collection_jobs
web_collection_runs
web_collection_cursors
web_collection_notifications
```

API 测试覆盖真实公司会话登记设备、令牌仅返回一次且 D1 只存 SHA-256、runner 心跳、计划 upsert、原子领取租约、合法状态转换、租约过期恢复、运行追加、成功游标更新、失败不推进、通知去重和无权限拒绝。

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/web-collection-migration.test.mjs tests/web-collection-api.test.mjs`

Expected: FAIL，因为迁移和路由不存在。

- [ ] **Step 3: 新增向后兼容迁移**

`web_collection_jobs` 使用 `idempotency_key UNIQUE`；`web_collection_runs` 只保存安全错误码、阶段、数量、文件哈希和 provider batch/archive ID；`web_collection_cursors` 使用 `(provider_id, resource_type)` 唯一键；通知使用 `dedupe_key UNIQUE`。迁移只新增表，不修改或删除 `erp_*` 现有事实及归档表。

- [ ] **Step 4: 实现 runner 与 jobs API**

`POST /runners` 仅总经办真实公司会话登记一次性令牌；`GET|POST /jobs` 根据 runner scope 支持 `heartbeat`、`ensure_plan`、`claim`、`transition`、`append_run`、`complete`、`record_notification`。所有任务输入只接受代码登记过的 provider/resource，不接受 URL、selector 或 script。

- [ ] **Step 5: 补齐平台契约和环境清单**

在 API 文档明确认证、权限、请求响应、错误、超时、租约、幂等、容量、兼容和回滚；在 integration registry 把新路径路由至 Cloudflare D1、Cloudflare Pages、ERP 文件导入和快麦；运行清单生成器同步派生文件。

- [ ] **Step 6: 运行定向门禁**

Run: `node --test tests/web-collection-migration.test.mjs tests/web-collection-api.test.mjs`

Run: `npm run check:integrations`

Run: `npm run check:environment-capabilities`

Expected: 全部 PASS。

---

## Task 3: 建立 MV3 插件与公司 Mac 通用采集运行时

**Files:**
- Create: `scripts/web-data-collector/index.mjs`
- Create: `scripts/web-data-collector/api.mjs`
- Create: `scripts/web-data-collector/schedule.mjs`
- Create: `scripts/web-data-collector/bridge.mjs`
- Create: `scripts/web-data-collector/orchestrator.mjs`
- Create: `scripts/web-data-collector/notification.mjs`
- Create: `scripts/web-data-collector/automation.mjs`
- Create: `scripts/web-data-collector/providers/index.mjs`
- Create: `chrome-extension/company-data-collector/manifest.json`
- Create: `chrome-extension/company-data-collector/service-worker.js`
- Create: `chrome-extension/company-data-collector/content-script.js`
- Create: `chrome-extension/company-data-collector/popup.html`
- Create: `chrome-extension/company-data-collector/popup.js`
- Create: `chrome-extension/company-data-collector/popup.css`
- Create: `tests/web-data-collector-runtime.test.mjs`
- Create: `tests/chrome-collector-extension.test.mjs`
- Create: `tests/web-data-collector-bridge.test.mjs`
- Create: `tests/web-data-collector-notification.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: 写运行时失败测试**

覆盖 MV3 最小权限、固定 host 白名单、无 Cookie/History/WebRequest 权限、配对密钥与扩展来源校验、provider 契约、任务串行领取、页面状态分类、下载文件稳定、相同文件恢复、租约释放、阶段回写、Keychain 令牌读取、LaunchAgent 使用当前仓库绝对路径，以及通知文案无业务数据。

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/chrome-collector-extension.test.mjs tests/web-data-collector-bridge.test.mjs tests/web-data-collector-runtime.test.mjs tests/web-data-collector-notification.test.mjs`

Expected: FAIL，因为共享运行时不存在。

- [ ] **Step 3: 实现 MV3 最小权限插件**

扩展只申请 `alarms/storage/tabs/downloads` 和已登记 host 权限。service worker 只接收安全任务字段；content script 将 provider/resource 映射到扩展内固定动作，不实现 `eval`、远程脚本或任意 selector 执行。

```js
await extension.openRegisteredResource({ providerId, resourceType });
await extension.runBundledActionPlan({ jobId, businessDate });
await extension.reportDownload({ jobId, downloadId });
```

运行日志只输出 provider、resource、stage 和安全错误码。

- [ ] **Step 4: 实现 loopback 安全桥接**

桥接仅监听 `127.0.0.1`，只接受固定 `chrome-extension://<id>` 来源和配对密钥；返回安全任务投影并拒绝凭据、Cookie、Token、页面正文、绝对路径以及远程 URL/selector/script。runner token 只由本机进程从 Keychain 读取，绝不返回扩展。

- [ ] **Step 5: 实现调度、编排和 macOS 通知**

`daily` 命令每 15 分钟心跳并确保当天计划，按 provider 串行执行。首次失败或 `waiting_human/schema_changed` 立即使用 `/usr/bin/osascript` 发系统通知；06:30 后对未成功任务发一条汇总；通知失败单独记录但不改变采集结果。

- [ ] **Step 6: 实现安装命令并修复路径漂移**

新增 npm 命令：

```json
"collect:web": "node scripts/web-data-collector/index.mjs"
```

LaunchAgent label 使用 `com.company.web-data-collector`，守护固定为当前仓库的 `scripts/web-data-collector/index.mjs serve`。安装时原子替换 plist，并将通用 runner token 与本机配对密钥只写 macOS Keychain；命令输出扩展加载目录和配对步骤，不自动修改 Chrome 策略。

- [ ] **Step 7: 运行定向测试**

Run: `node --test tests/chrome-collector-extension.test.mjs tests/web-data-collector-bridge.test.mjs tests/web-data-collector-runtime.test.mjs tests/web-data-collector-notification.test.mjs`

Expected: PASS。

---

## Task 4: 实现快麦 ERP 完整 provider adapter

**Files:**
- Create: `scripts/web-data-collector/providers/kuaimai/index.mjs`
- Create: `scripts/web-data-collector/providers/kuaimai/resources.mjs`
- Create: `scripts/web-data-collector/providers/kuaimai/page-classifier.mjs`
- Create: `tests/fixtures/kuaimai-web/logged-out.html`
- Create: `tests/fixtures/kuaimai-web/verification.html`
- Create: `tests/fixtures/kuaimai-web/report-ready.html`
- Create: `tests/fixtures/kuaimai-web/schema-changed.html`
- Create: `tests/kuaimai-web-collector.test.mjs`
- Modify: `scripts/kuaimai-erp-collector/scanner.mjs`
- Modify: `scripts/kuaimai-erp-collector/archive.mjs`
- Modify: `.agents/skills/kuaimai-erp-data-collection/SKILL.md`
- Modify: `docs/features/kuaimai-erp-local-archive/prd.md`
- Modify: `docs/features/kuaimai-erp-local-archive/design.md`

- [ ] **Step 1: 写快麦 adapter 契约失败测试**

测试固定允许 origin 为 `https://erpb.superboss.cc`，拒绝其他 host；测试 `logged_out`、`waiting_human`、`ready`、`schema_changed` 分类；测试日期范围使用订单创建时间；测试导出文件只由既有 scanner/archive/ingest 链路处理。

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/kuaimai-web-collector.test.mjs`

Expected: FAIL，因为 adapter 不存在。

- [ ] **Step 3: 固化已识别资源注册表**

资源及入口固定为：

```text
orders            #/trade/searchlist/                    昨天事实
order_items       #/trade/searchlist/                    昨天事实（导出订单明细）
sales_items       #/report/sale_multidimension_next/     昨天事实（销售主题/按订单商品明细）
products          #/prod/parallel/                       当前维度
inventory         #/stock/warehouse_status/              当前快照
purchases         #/purchase/manager/                    当前及未完结事实
suppliers         #/purchase/supplier_next/              当前维度
aftersales        #/aftersale/sale_handle_next/          昨天事实及未完结
shops             #/setting/shop_info_next/              当前维度
warehouses        #/setting/storage_management/          当前维度
sales_analysis    #/report/dynamic/?reportId=67949       昨天事实
goods_ledger      #/report/dynamic/?reportId=7           当前快照
inventory_cost    #/report/stock_cost_next/              当前快照
```

每项声明 `rangeKind`、`scheduleVersion`、页面签名、日期控件动作、官方导出动作、下载特征、解析器 ID 和安全超时；页面未达到已知签名时停止并标记 `schema_changed`。

- [ ] **Step 4: 先完成订单与销售明细端到端，再逐资源复用**

订单、交易订单明细与销售主题明细必须在真实登录页核对日期控件和官方导出动作；随后按资源表逐项实现。事实日期必须设置完整昨天自然日，不能使用页面默认“近一天”。下载进入 provider waiting 目录，scanner 稳定性检查、业务日期二次核对、归档、脱敏预检和现有 ERP ingest 全部成功后才返回 provider success。

- [ ] **Step 5: 完成人工边界和恢复**

未登录、验证码、扫码、滑块、邮箱/手机验证时保持页面打开并进入 `waiting_human`；用户完成后下一轮恢复相同幂等任务。代码不得模拟破解验证，也不得读取邮箱或手机验证码。

- [ ] **Step 6: 更新快麦采集 Skill 和持久文档**

记录自动采集命令、资源范围、独立 Chrome、05:00 计划、归档目录、任务状态、人工验证边界和故障恢复；保留人工导入作为回退路径。

- [ ] **Step 7: 运行定向测试**

Run: `node --test tests/kuaimai-web-collector.test.mjs tests/kuaimai-erp-collection-cli.test.mjs tests/kuaimai-erp-local-archive.test.mjs`

Expected: PASS。

### Task 4.1: 修复快麦异步下载中心交接

**Files:**
- Modify: `chrome-extension/company-data-collector/providers/kuaimai.js`
- Modify: `chrome-extension/company-data-collector/content-script.js`
- Modify: `chrome-extension/company-data-collector/service-worker.js`
- Modify: `tests/kuaimai-extension-adapter.test.mjs`
- Modify: `tests/chrome-collector-extension.test.mjs`
- Modify: `docs/platform/data-acquisition.md`
- Modify: `.agents/skills/kuaimai-erp-data-collection/SKILL.md`

- [x] **Step 1: 写下载中心失败测试**

覆盖固定下载中心入口、订单与订单明细文件名前缀互斥、当前任务时间窗口、生成中、生成失败、完成行选择，以及扩展不能把下载中心路径或选择器交给远端任务。

adapter 新增并由 content script 消费以下固定接口：

```js
export const KUAIMAI_DOWNLOAD_CENTER_ROUTE = "/index.html#/index/download_center/";
export const KUAIMAI_DOWNLOAD_CENTER_SELECTORS = Object.freeze({
  row: ".m-data-item",
  exportTime: ".exportTime",
  content: ".content",
  status: ".schedule",
  refresh: ".j-search",
  download: ".J-download"
});

export function selectKuaimaiDownloadRow({ resourceType, startedAt, rows }) {
  // 返回 { state: "ready"|"pending"|"failed"|"missing", rowIndex, errorCode? }
}
```

`buildKuaimaiActionPlan(task)` 在已有导出动作后追加 `{ action: "download_from_center", resourceType }`。content script 在点击导出前记录 `exportStartedAt`，执行该动作时只解析固定行字段，并在 `ready` 时点击同一行固定下载控件。

- [x] **Step 2: 运行测试并确认 RED**

Run: `node --test tests/kuaimai-extension-adapter.test.mjs tests/chrome-collector-extension.test.mjs`

Expected: FAIL，因为 adapter 只会在订单页点击导出并等待直接下载。

- [x] **Step 3: 实现最小异步下载流程**

点击订单页官方导出后导航到代码登记的下载中心；最多等待三分钟，每轮用固定查询控件刷新并解析安全任务元数据。只选择当前任务窗口内、资源类型匹配且状态为“导出完成”的最近任务行，然后点击该行固定下载控件。明确失败和等待超时使用不同安全错误码。

- [x] **Step 4: 运行定向测试并确认 GREEN**

Run: `node --test tests/kuaimai-extension-adapter.test.mjs tests/chrome-collector-extension.test.mjs tests/web-data-collector-runtime.test.mjs tests/web-data-collector-download.test.mjs`

Expected: PASS。

- [ ] **Step 5: 更新本机扩展并真实回归**

合并并部署后，把公司 Chrome 加载的未打包扩展更新到已合并版本并点击“重新加载”。重新触发 2026-07-22 的 `orders`、`order_items` 与 `sales_items`，核对下载中心只下载当前任务文件、本机归档成功、D1 任务进入 `success`、游标推进到 2026-07-22，最后刷新数据同步页面。

---

## Task 5: 让“数据同步”展示真实任务、设备和恢复动作

**Files:**
- Create: `src/state/webCollectionApi.js`
- Create: `react-tests/web-collection-ui.test.mjs`
- Modify: `functions/api/data-center/sales.js`
- Modify: `src/domain/dataCenter.js`
- Modify: `src/state/DataCenterProvider.jsx`
- Modify: `src/features/data-center/DataGovernanceWorkspaces.jsx`
- Modify: `src/styles.css`
- Modify: `react-tests/data-center-app.test.mjs`
- Modify: `react-tests/data-center.test.mjs`
- Modify: `tests/data-center-api.test.mjs`
- Modify: `docs/features/data-center-app/prd.md`
- Modify: `docs/features/data-center-app/design.md`
- Modify: `docs/features/data-center-app/plan.md`
- Modify: `docs/features/data-center-app/tasks.md`

- [ ] **Step 1: 写数据同步真实状态失败测试**

覆盖设备 30 分钟无心跳显示“公司 Mac 离线”、05:00 前空态、正在打开/导出/下载/校验/入库、等待登录、等待人工验证、页面结构变化、部分失败、全部成功、06:30 已提醒和成功历史默认折叠。经营数据异常推断只作为没有真实任务记录时的回退证据。

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/data-center-api.test.mjs react-tests/data-center-app.test.mjs react-tests/data-center.test.mjs react-tests/web-collection-ui.test.mjs`

Expected: FAIL，因为数据同步尚未读取通用任务表。

- [ ] **Step 3: 接入安全的只读状态投影**

数据中心 API 返回 runner 健康、任务、运行摘要、游标和通知状态，不返回令牌、绝对路径、URL、选择器、页面正文或文件内容。前端 API 客户端支持 loading/empty/error/permission。

- [ ] **Step 4: 调整数据同步工作台**

异常和 `waiting_human/schema_changed` 置顶，进行中显示阶段，责任动作明确为“打开公司采集 Chrome/完成登录验证/检查页面改版/检查 D1 入库”；成功历史折叠；钉钉 WebView 只显示状态与说明，不尝试控制本机 Chrome。

- [ ] **Step 5: 运行 UI 与 API 测试**

Run: `node --test tests/data-center-api.test.mjs react-tests/data-center-app.test.mjs react-tests/data-center.test.mjs react-tests/web-collection-ui.test.mjs`

Expected: PASS。

---

## Task 6: 安装、迁移和三条验证链路

**Files:**
- Modify: `docs/features/company-web-data-collector/tasks.md`
- Modify: `docs/features/company-web-data-collector/prd.md`
- Modify: `docs/features/company-web-data-collector/design.md`
- Modify: `PRODUCT.md`
- Modify: `DESIGN.md`

- [ ] **Step 1: 执行代码级完整门禁**

Run:

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

Expected: 全部退出码 0。

- [ ] **Step 2: 检查分支和变更边界**

Run: `git fetch origin main && git merge-base --is-ancestor origin/main HEAD`

Run: `git status --short`

Expected: 当前 HEAD 包含最新 `origin/main`；只暂存本功能文件，保留 `docs/.DS_Store`、`docs/reviews/` 和其他用户文件不动。

- [ ] **Step 3: 经执行时授权后迁移并部署**

按 `environment-parity` 的 Cloudflare 清单和 `npm run release:pages` 执行；先预检/备份，再应用 `0009_web_collection.sql`，部署 Pages，最后分别验证生产 API 的未认证拒绝、公司会话只读状态和 D1 表/索引。

- [ ] **Step 4: 登记并安装公司 Mac 采集器**

登记通用 runner，将一次性 token 写 Keychain，运行：

```bash
npm run collect:web -- install --base-url <production-origin>
npm run collect:web -- preflight --base-url <production-origin>
```

确认 LaunchAgent 程序路径指向当前仓库，不再引用 `.worktrees/kuaimai-erp-history`；确认 loopback 端口只监听 `127.0.0.1`，扩展 ID 和配对状态正确，且 Chrome 未授予 Cookie/History/WebRequest 权限。

- [ ] **Step 5: 完成真实快麦验收**

在已加载插件的公司日常 Chrome 中确认快麦已有登录态。手动触发一个昨天订单/订单明细任务，核对：页面使用创建时间、官方导出、桌面原始归档、文件哈希、D1 batch/facts、任务运行、游标、数据服务和数据同步页面一致。再用一个安全故障演练验证首次 Mac 通知与 06:30 汇总去重。

- [ ] **Step 6: 更新任务清单与完成证据**

逐项勾选 `tasks.md`，记录本地测试、D1/Pages 和真实网页三条证据。未完成真实登录或某资源导出验收时必须保留为未完成，不得把代码通过宣称为数据已自动入库。

---

## Task 7: 失败任务自动恢复与按资源人工兜底

**Files:**
- Modify: `src/domain/webCollection.js`
- Modify: `functions/api/platform/v1/web-collection/_shared/storage.js`
- Modify: `scripts/web-data-collector/providers/index.mjs`
- Modify: `src/state/webCollectionApi.js`
- Modify: `src/features/data-center/DataGovernanceWorkspaces.jsx`
- Modify: `tests/web-collection-schedule.test.mjs`
- Modify: `tests/web-collection-api.test.mjs`
- Modify: `react-tests/data-sync-recovery.test.mjs`

- [x] **Step 1: 写自动恢复和按资源重试失败测试**

覆盖瞬时下载错误在 5/15 分钟退避后重新排队、第三次失败不再自动重试、`waiting_human/schema_changed` 不自动循环、`sales_items` 适配器新版本生成新任务，以及前端把当前失败任务的 `resourceType` 传给触发接口。

- [x] **Step 2: 运行定向测试并确认失败**

Run: `node --test tests/web-collection-schedule.test.mjs tests/web-collection-api.test.mjs react-tests/data-sync-recovery.test.mjs`

Expected: FAIL，因为当前控制面不会自动重排失败任务，销售主题仍使用旧计划版本，前端仍写死 `order_items`。

- [x] **Step 3: 实现最小恢复策略**

在纯领域层返回确定性的重试决策；`ensure_plan` 仅对允许的瞬时错误、未超过 3 次且退避已到期的原任务执行 `failed -> queued`。`sales_items` 提升计划版本，前端触发函数接受已登记资源类型，服务端继续执行既有会话权限和资源白名单校验。

- [x] **Step 4: 运行定向测试并确认通过**

Run: `node --test tests/web-collection-schedule.test.mjs tests/web-collection-api.test.mjs react-tests/data-sync-recovery.test.mjs`

Expected: PASS。

- [ ] **Step 5: 完成生产验收**

合并后更新公司 Mac 的 LaunchAgent 与未打包扩展，确认 2026-07-22 `orders` 的下载超时任务自动重试、`sales_items` 新版本任务自动创建；核对本机原始归档、D1 批次与事实、游标和数据同步记录，只有三条资源均成功才勾选完成。
