# 平台总体架构

系统采用模块化单体前端、Cloudflare Pages Functions 和 D1 持久化。当前先保持边界清晰和契约稳定，出现第二个真实系统调用方后再抽取独立包或服务。

## 前端边界

- `src/domain/`：纯业务规则、规范化、排序、状态计算和数据投影。
- `src/ui/`：不绑定业务部门的基础组件。
- `src/features/`：公司经营和产品功能页面。
- `src/state/`：共享状态、认证状态、平台状态和 API 客户端编排。
- `src/App.jsx`：导航和页面装配，不承载领域计算。

依赖方向为 `features -> ui/domain/state`。领域模块不能依赖 React、浏览器或网络；功能页面不能直接调用钉钉、快麦或 ERP。

## 服务端边界

- `functions/api/_middleware.js`：公共路由识别、OPTIONS 和公司会话认证。
- `functions/api/auth/`：钉钉登录、Cookie 会话和退出。
- `functions/api/dingtalk/`：组织、待办、日历、文档和会议纪要适配。
- `functions/api/kuaimai/`：订单拉取、聚合、刷新和同步状态。
- `functions/api/state.js`：产品全周期共享状态持久化。
- `functions/api/platform.js`：公司经营平台实体持久化。
- `functions/api/sales.js`：产品销售数据查询。
- `functions/api/platform/v1/environment-readiness.js`：按环境能力清单执行脱敏就绪检查。
- `functions/api/platform/_shared/dataEnvironment.js`：认证后统一解析正式或展示业务库；业务模块不得自行选择 D1 binding。
- `functions/api/platform/_shared/demoDataCatalog.js`：展示库复制白名单、顺序、批量与转换策略；未知表默认不复制。
- `functions/api/platform/_shared/demoDataRefresh.js`：单展示库的分步刷新、租约、游标、幂等、校验和启用。
- `functions/api/platform/_shared/collectionTarget.js`：把服务端选定的数据环境与版本固化到采集控制任务。
- `functions/api/platform/_shared/displayExternalActionAdapter.js`：展示环境外部写模拟与无秘密控制审计。
- `functions/api/platform/v1/production-data/`：个人令牌、短时解锁、版本冲突、快照、审计和回滚边界。

## 数据流

浏览器先完成钉钉身份认证，再读取产品共享状态或公司平台状态。产品全周期整状态同步必须先取得服务器 `updatedAt` 基线；本地缓存只用于首屏和人工恢复，不能在启动时自动上传。客户端比较排除组织缓存刷新时间的规范化业务指纹，无业务变化时不保存。服务端验证会话与写权限，先保存写前快照与审计，再用单个 D1 原子批次比较并推进修订清单、替换全部状态分片；缺少、落后或被并发推进的基线返回 409。外部平台调用由对应适配层完成。客户端不得持有服务端密钥。

最高权限账号可以在设置中为当前浏览器切换正式与展示业务库。会话、权限、平台凭证、AI Provider 配置、个人令牌和环境授权始终留在正式控制库；业务状态由中间件注入的 `businessDb` 决定。切换后前端中止旧请求、按环境隔离缓存，并给写请求携带环境版本。展示库刷新只复制目录白名单：个人敏感字段先用服务端 `DEMO_DATA_MASKING_KEY` 做确定性脱敏，销售可加总事实统一乘二，派生比例和均值重新计算；凭证、令牌、会话、控制审计和未知表一律跳过。

采集控制记录始终写正式控制库，并固化服务端解析出的目标环境和版本；ERP 文件、网页采集和销售修复只把业务投影写入目标业务库。展示环境的外部写请求经过同一业务校验后由共享模拟器返回兼容结果，不解析真实写入凭据。AI Provider、租约、Token 和 Skill 次数记录在控制库，Context builders 与业务 Skills 读取 `businessDb`，审计用独立 `data_environment` 字段标记来源而不改变 `model|rule_fallback` 语义。

完整本地开发通过 `npm start` 同时运行 Vite 与 Wrangler Pages Functions。浏览器只访问 Vite `127.0.0.1:8127`，页面保留热更新，所有 `/api` 请求代理到内部 Wrangler `127.0.0.1:8132`。Wrangler 从被忽略的 `.env` 读取个人令牌并远程绑定生产 D1；API 中间件仅在回环主机和显式开关下校验令牌哈希、能力与 active executive 组织身份，再注入真实线上会话。之后数据与钉钉、快麦等外部动作进入同一套正式路由、权限和适配器。令牌不得进入浏览器；硬编码本地身份和第二套本地业务 API 都不是支持的完整运行时。

生产数据网关继续作为运维修复旁路：它的跨环境写入仍需要 15 分钟解锁、版本检查、写前快照和审计。本地线上账号模式是正式应用在本机执行，不绕过业务 API 自己的版本、幂等、审计或提供商权限。

## 运行环境

- 本地完整运行时使用 Vite 热更新与 `/api` 到 Pages Functions 的反向代理；仅运行 Vite 不具备业务 API 能力。
- Cloudflare Pages/Functions 是生产静态资源和 API 边界。
- D1 保存公司共享状态、平台实体、会话、组织缓存和销售聚合。
- `PRODUCT_FLOW_DB` 是正式控制库与正式业务库，`DEMO_FLOW_DB` 只保存展示业务数据；两者必须是不同的物理 D1。
- 整状态共享数据以 D1 为事实源；默认状态、旧标签页和旧分支只有在先读取当前基线后才能写，同一基线通过原子比较只能被接受一次，所有成功写入都可通过快照和审计回滚。
- 钉钉 WebView 是独立的嵌入环境，需要单独验证登录、视口和权限。
- `docs/platform/environment-capabilities.json` 定义各环境必需的变量名、绑定名和表结构；生成模块供 Pages Functions 使用，CI 检查漂移。

### 前端发布恢复

- Cloudflare Pages 发布必须包含顶层 `404.html`。系统使用 Hash 路由，不依赖任意路径回退到首页；缺失的 JS/CSS 必须返回 404，不能伪装成首页 HTML。
- 应用入口在 React 渲染前接管 Vite 的 `vite:preloadError`。旧标签页加载已被新部署替换的动态分包时，自动刷新获取当前版本。
- 自动刷新使用会话级冷却时间防止循环；受限 WebView 无法使用会话存储时，仍允许执行一次浏览器刷新。
- `_headers` 保持入口 HTML 不缓存；`npm run build` 必须在 `dist` 内生成 `cloudflare-entry.html`、`_headers` 和 `_redirects`，确保 Cloudflare Git 自动部署与手动根目录部署同构。`scripts/prepare-pages-release.mjs` 只能从完整 `dist` 同步根目录发布包，避免两条发布路径遗漏不同文件。

## 未来平台化

新多系统接口放在 `/api/platform/v1/`。通用 UI、契约和客户端只有在第二个真实调用方出现后才抽为 workspace package，避免基于假设建设中台。
