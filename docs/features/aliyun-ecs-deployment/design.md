# 阿里云 ECS 生产迁移设计书

## 用户任务

员工继续使用原有公司平台和钉钉登录；迁移期间不需要学习新的入口或数据库操作。
运维人员需要完成部署、数据库迁移、备份、验证和回滚。

## 信息层级

1. 主信息：当前运行平台、数据库来源、容器健康、最近一次备份结果。
2. 辅助信息：镜像版本、Git commit、数据库校验摘要、OSS 上传状态。
3. 低频信息：完整导入日志、恢复演练和 RDS 迁移触发指标。

## 页面结构

本次不新增业务页面。运行状态沿用 `/api/platform/v1/environment-readiness`，
部署证据由服务器命令和 feature 文档记录。后续如新增运维 UI，必须复用平台
环境就绪能力而不是在浏览器直接访问 ECS 或 OSS。

## 交互流程

1. 未登录用户访问阿里云域名，点击钉钉登录。
2. OAuth start 使用当前 HTTPS Origin 生成同源 callback。
3. callback 在 ECS 本地正式库创建会话 Cookie。
4. 已登录用户按原有权限读取正式或展示业务库。
5. 发生故障时运维回滚 ECS 上一个镜像和 SQLite 快照，用户无需导入本地缓存。
6. 测试用户访问 Cloudflare Pages 静态站，浏览器只调用 ECS 隔离测试 API。

## 组件复用

- 复用现有登录页、会话中间件、环境就绪 API 和所有业务页面。
- 复用 Nginx Proxy Manager 管理 80/443 和证书，不在应用容器内再运行 Nginx。
- 复用 Pages Functions 的 Fetch API 契约；镜像构建时生成单一 bundle，运行时由
  Hono 调用，避免复制或一次性重写 API。
- Cloudflare Pages 只复用静态文件托管；不复用 Functions、Workers 或 D1。

## 新增组件

本次不新增 React 组件；新增正式 Node.js 服务边界。

- `server/aliyun/app.mjs`：Hono 入口、健康检查、静态资源和 Functions bundle
  兼容路由。
- `server/aliyun/sqlite-d1.mjs`：现有业务 API 使用的 D1 兼容接口。
- `server/aliyun/sqlite-worker.mjs`：在 Worker Thread 中执行 SQLite 查询和事务。
- `start-runtime.mjs`：校验公开运行时配置、加载预构建 bundle 并优雅启停 Node。
- `export-cloudflare-d1.mjs`：只读导出两个远程 D1。
- `import-local-d1.mjs`：只向空白 ECS 数据卷导入两个数据库。
- `backup-local-d1.mjs`：SQLite Online Backup 一致性快照、哈希和可选 OSS
  上传；避免宿主机 Wrangler/workerd 的 GLIBC 依赖。

## 页面状态

- 加载：沿用应用现有加载状态。
- 空数据：本地库未导入时 readiness 阻止上线。
- 错误：返回现有安全错误码，不把 SQLite 路径、SQL、Secret 或内部堆栈暴露给浏览器。
- 无权限：沿用服务端会话与角色校验。
- 禁用：域名/OSS 未就绪只影响对应上线或备份步骤，不伪装成功。
- 成功：readiness、数据库校验和公网请求均提供独立证据。
- 环境隔离：生产和测试页面显示各自环境；测试 API 不得读取生产 SQLite。

## 响应式与钉钉 WebView

业务 UI 不变。正式切流前重新验证笔记本、窄屏和钉钉 WebView；服务器内
`curl` 不能代替 WebView 登录验收。

## 交互文案

- 未导入数据库：`阿里云本地数据库尚未初始化，服务暂不可用。`
- OSS 未配置：`本地备份已完成；OSS 备份尚未配置。`
- 迁移维护：`系统正在执行数据迁移，请稍后重新进入。`

## 无障碍

无新增页面交互。现有登录与错误页面的焦点、键盘和语义要求保持不变。

## 视觉验收

- `deshan-tiyes.cn` 登录页：1440×900、1280×800、390×844。
- 钉钉 PC 与移动 WebView：登录、回调、首页和一个数据页。
- Cloudflare 测试静态站：只请求 ECS 测试 API，不存在 Cloudflare API 请求。

## 请求与数据流

1. Nginx Proxy Manager 完成 TLS 后把请求转发至容器回环端口。
2. Hono 处理 `/healthz`，并用 `PFS_PUBLIC_API_ORIGIN` 规范化交给业务 bundle 的
   Request URL；禁止相信任意浏览器提供的 forwarded host。
3. API bundle 继续接收 `{ request, env, data, waitUntil }` Pages 契约；`env` 中的
   `PRODUCT_FLOW_DB` 与 `DEMO_FLOW_DB` 是本地适配器，不是 Cloudflare binding。
4. SQLite 操作经 Worker Thread 串行进入各自连接；HTTP 主线程继续处理静态资源、
   其他请求与流式响应。
5. 新 API 可直接注册为 Hono 路由；旧 bundle 作为兼容兜底，直至所有路由迁完。
