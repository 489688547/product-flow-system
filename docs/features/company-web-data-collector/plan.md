# 公司网页数据采集器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在公司 Mac 上建立每天 05:00 自动运行的通用网页数据采集器，并以快麦 ERP 作为首个完整适配器，将昨天事实数据和当前快照/维度数据安全、幂等地写入 D1。

**Architecture:** 通用运行时负责上海时区调度、D1 任务租约、独立 Chrome、受限页面动作、下载确认、运行状态和 macOS 通知；provider adapter 只声明固定域名、资源、页面状态和导出/入库步骤。Cloudflare Pages Functions 是设备和 D1 之间唯一的数据控制面，现有快麦文件解析与 ingest API 继续作为业务数据入口。

**Tech Stack:** Node.js ESM、Cloudflare Pages Functions、Cloudflare D1、Chrome DevTools Protocol、macOS LaunchAgent/Keychain/osascript、React、Node Test Runner。

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

## Task 3: 建立公司 Mac 通用采集运行时

**Files:**
- Create: `scripts/web-data-collector/index.mjs`
- Create: `scripts/web-data-collector/api.mjs`
- Create: `scripts/web-data-collector/schedule.mjs`
- Create: `scripts/web-data-collector/browser.mjs`
- Create: `scripts/web-data-collector/orchestrator.mjs`
- Create: `scripts/web-data-collector/notification.mjs`
- Create: `scripts/web-data-collector/automation.mjs`
- Create: `scripts/web-data-collector/providers/index.mjs`
- Create: `tests/web-data-collector-runtime.test.mjs`
- Create: `tests/web-data-collector-browser.test.mjs`
- Create: `tests/web-data-collector-notification.test.mjs`
- Modify: `scripts/data-connection-agent/chrome.mjs`
- Modify: `scripts/user-insights-collector/chrome-devtools.mjs`
- Modify: `package.json`

- [ ] **Step 1: 写运行时失败测试**

覆盖 provider 契约校验、白名单 origin 拒绝、Chrome 复用和重启、任务串行领取、页面状态分类、下载文件稳定、相同文件恢复、租约释放、阶段回写、Keychain 令牌读取、LaunchAgent 使用当前仓库绝对路径，以及通知文案无业务数据。

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/web-data-collector-runtime.test.mjs tests/web-data-collector-browser.test.mjs tests/web-data-collector-notification.test.mjs`

Expected: FAIL，因为共享运行时不存在。

- [ ] **Step 3: 抽取独立 Chrome 和安全 CDP 原语**

复用 `ensureCompanyChrome` 与 `ChromeDevtoolsBrowser`，新增仅限代码白名单的：

```js
await browser.openAllowedPage({ origin, url });
await browser.classify(adapter.classifyPage);
await browser.performAllowedActions(actionPlan);
await browser.waitForDownload({ directory, signature, timeoutMs });
```

调试端口只监听 `127.0.0.1`；运行日志只输出 provider、resource、stage 和安全错误码。

- [ ] **Step 4: 实现调度、编排和 macOS 通知**

`daily` 命令每 15 分钟心跳并确保当天计划，按 provider 串行执行。首次失败或 `waiting_human/schema_changed` 立即使用 `/usr/bin/osascript` 发系统通知；06:30 后对未成功任务发一条汇总；通知失败单独记录但不改变采集结果。

- [ ] **Step 5: 实现安装命令并修复路径漂移**

新增 npm 命令：

```json
"collect:web": "node scripts/web-data-collector/index.mjs"
```

LaunchAgent label 使用 `com.company.web-data-collector`，`StartInterval=900`，命令固定为当前仓库的 `scripts/web-data-collector/index.mjs daily`。安装时原子替换 plist，并将通用 runner token 只写 macOS Keychain。

- [ ] **Step 6: 运行定向测试**

Run: `node --test tests/web-data-collector-runtime.test.mjs tests/web-data-collector-browser.test.mjs tests/web-data-collector-notification.test.mjs`

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
sales_items       #/report/sale_multidimension_next/     昨天事实
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

订单与销售明细必须在真实登录页核对日期控件和官方导出动作；随后按资源表逐项实现。事实日期必须设置完整昨天自然日，不能使用页面默认“近一天”。下载进入 provider waiting 目录，scanner 稳定性检查、归档、脱敏预检和现有 ERP ingest 全部成功后才返回 provider success。

- [ ] **Step 5: 完成人工边界和恢复**

未登录、验证码、扫码、滑块、邮箱/手机验证时保持页面打开并进入 `waiting_human`；用户完成后下一轮恢复相同幂等任务。代码不得模拟破解验证，也不得读取邮箱或手机验证码。

- [ ] **Step 6: 更新快麦采集 Skill 和持久文档**

记录自动采集命令、资源范围、独立 Chrome、05:00 计划、归档目录、任务状态、人工验证边界和故障恢复；保留人工导入作为回退路径。

- [ ] **Step 7: 运行定向测试**

Run: `node --test tests/kuaimai-web-collector.test.mjs tests/kuaimai-erp-collection-cli.test.mjs tests/kuaimai-erp-local-archive.test.mjs`

Expected: PASS。

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

确认 LaunchAgent 程序路径指向当前仓库，不再引用 `.worktrees/kuaimai-erp-history`；确认独立 Chrome 调试端口只监听 `127.0.0.1`。

- [ ] **Step 5: 完成真实快麦验收**

在独立公司采集 Chrome 中完成一次登录。手动触发一个昨天订单/销售明细任务，核对：页面日期、官方导出、桌面原始归档、文件哈希、D1 batch/facts、任务运行、游标、数据服务和数据同步页面一致。再用一个安全故障演练验证首次 Mac 通知与 06:30 汇总去重。

- [ ] **Step 6: 更新任务清单与完成证据**

逐项勾选 `tasks.md`，记录本地测试、D1/Pages 和真实网页三条证据。未完成真实登录或某资源导出验收时必须保留为未完成，不得把代码通过宣称为数据已自动入库。

