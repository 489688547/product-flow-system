# 本地线上账号一致性执行任务

## 执行规则

- 每项任务只交付一个可独立验证的结果。
- 先写失败测试并确认失败原因，再写实现。
- 完成后记录实际验证命令和结果。
- 不以自动化验收名义创建无业务意义的真实钉钉或快麦动作。

## 任务

- [x] 真实本地会话鉴权
  - 依赖：无。
  - 文件：`tests/dingtalk-web-auth.test.mjs`、`tests/production-data-access.test.mjs`、`functions/api/platform/_shared/productionDataAccess.js`、`functions/api/_middleware.js`。
  - 失败测试：真实身份字段、GET read、POST write、只读令牌拒绝写、无令牌失败、非本地域名不绕过。
  - 输出：`local-online-account` 标准会话；无硬编码身份和无统一只读拦截。
  - 验证：`node --test tests/production-data-access.test.mjs tests/dingtalk-web-auth.test.mjs`，34/34 通过。

- [x] 唯一完整本地启动入口
  - 依赖：真实本地会话鉴权。
  - 文件：`tests/local-online-start.test.mjs`、`scripts/start-local-online.mjs`、`package.json`、`启动服务.command`、`.env.example`、`wrangler.toml`。
  - 失败测试：标准命令必须同时包含 Vite 代理、Pages Functions、8127 用户端口、`.env` 服务端加载和进程清理。
  - 输出：双击或 `npm start` 均运行与线上相同的 Functions 和远程 D1。
  - 验证：`node --test tests/local-online-start.test.mjs` 2/2 通过；Vite 与 Wrangler 8127 启动成功，真实 `.env` 会话验收在合并到持有本地密钥的主工作区后执行。

- [x] 真实环境可见性
  - 依赖：真实本地会话鉴权。
  - 文件：`react-tests/local-online-account-ui.test.mjs`、`react-tests/local-dev-login.test.mjs`、`src/state/AuthProvider.jsx`、`src/ui/LocalOnlineEnvironmentBanner.jsx`、`src/App.jsx`、全局 CSS。
  - 失败测试：不存在硬编码 LOCAL_USER；真实本地会话显示全局警示；生产会话不显示；390px 无横向溢出规则。
  - 输出：所有页面明确显示本地代码、线上真实环境、账号和立即生效。
  - 验证：`node --test react-tests/local-online-account-ui.test.mjs` 2/2、ESLint 和生产构建通过；真实账号三档宽度浏览器验收在合并后执行。

- [x] 长期规则反写
  - 依赖：前三项。
  - 文件：`AGENTS.md`、`.agents/skills/environment-parity/SKILL.md`、`docs/platform/environment-capabilities.json`、`docs/platform/integration-registry.json`、`docs/platform/architecture.md`、`docs/platform/api-catalog.md`、`docs/platform/middleware.md`、`docs/platform/integrations.md`、`docs/platform/environment-readiness.md`、`docs/platform/error-codes.md`、`docs/decisions/2026-07-20-local-online-account.md`、生成模块。
  - 失败测试：环境变量漂移、旧只读规则、旧外部动作阻断或缺少路由声明时门禁失败。
  - 输出：所有分支可执行地继承同一环境、集成和 Skill 规则。
  - 验证：生成模块、环境能力、治理、集成检查全绿；环境与治理聚焦测试 17/17 通过，受支持运行时的旧只读与外部动作阻断规则 0 命中。

- [ ] 完整验收、合并与部署
  - 依赖：全部功能任务。
  - 文件：仅当前功能与发布产物。
  - 验证：合并前 Definition of Done 全绿（React 446/446、API 269/269）；本地真实身份、生产域名登录与部署就绪证据在 main 合并部署后补充。
  - 输出：合并到 `main` 并部署，生产现有登录行为不变。
