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
- `functions/api/platform/v1/production-data/`：个人令牌、短时解锁、版本冲突、快照、审计和回滚边界。

## 数据流

浏览器先完成钉钉身份认证，再读取产品共享状态或公司平台状态。服务端验证会话和写权限后访问 D1，外部平台调用由对应适配层完成。客户端不得持有服务端密钥。

本地测试读取生产数据时，浏览器仍只访问同源 `/api/state`；本地 Node 服务持有被忽略的个人令牌，并调用生产数据网关。生产数据库写入需要 15 分钟解锁，令牌与解锁令牌都不得进入浏览器。钉钉、快麦等外部副作用与数据库写入分开授权。

## 运行环境

- 本地 React 预览用于前端和测试验收。
- Cloudflare Pages/Functions 是生产静态资源和 API 边界。
- D1 保存公司共享状态、平台实体、会话、组织缓存和销售聚合。
- 钉钉 WebView 是独立的嵌入环境，需要单独验证登录、视口和权限。
- `docs/platform/environment-capabilities.json` 定义各环境必需的变量名、绑定名和表结构；生成模块供 Pages Functions 使用，CI 检查漂移。

## 未来平台化

新多系统接口放在 `/api/platform/v1/`。通用 UI、契约和客户端只有在第二个真实调用方出现后才抽为 workspace package，避免基于假设建设中台。
