# 环境一致性与生产数据访问执行任务

## 执行规则

- 每项任务只交付一个可独立验证的结果。
- 先写失败测试并确认失败原因，再写实现。
- 完成后记录实际验证命令和结果。
- 每次提交只包含当前任务文件。

## 任务

- [x] 环境能力清单与兼容生成模块
  - 依赖：无。
  - 文件：`docs/platform/environment-capabilities.json`、`scripts/generate-platform-manifests.mjs`、`functions/api/platform/_generated/`、`tests/environment-capabilities.test.mjs`、`package.json`。
  - 输入：集成注册表平台 ID 与已确认环境需求。
  - 输出：`validateEnvironmentCapabilities`、Wrangler 兼容 JS 模块和 `check:environment-capabilities`。
  - 失败测试：`node --test tests/environment-capabilities.test.mjs`，预期缺少模块或校验函数。
  - 实现步骤：先验证 schema 与平台引用，再生成确定性模块，最后把漂移检查加入质量脚本。
  - 验证：`node --test tests/environment-capabilities.test.mjs` 2/2 通过；`npm run check:environment-capabilities` 通过且重复生成无 diff。
  - 提交：`feat: define environment capability contract`。

- [x] 脱敏环境就绪 API
  - 依赖：环境能力清单。
  - 文件：`functions/api/platform/_shared/environmentReadiness.js`、`functions/api/platform/v1/environment-readiness.js`、`tests/environment-readiness-api.test.mjs`。
  - 输入：生成的能力清单、当前 `env` 与员工会话。
  - 输出：标准 `environment readiness` 响应。
  - 失败测试：未登录、缺失变量、D1 表缺失和完全就绪场景先失败。
  - 实现步骤：实现环境识别、变量/绑定/表检查、脱敏响应和错误码。
  - 验证：环境清单与就绪 API 聚焦测试 6/6 通过；ESLint 静默通过。
  - 提交：`feat: expose environment readiness`。

- [ ] 生产数据受控网关
  - 依赖：就绪 API。
  - 文件：`functions/api/platform/_shared/productionDataAccess.js`、`functions/api/platform/v1/production-write-session.js`、`functions/api/platform/v1/production-data/state.js`、`functions/api/state.js`、`functions/api/_middleware.js`、`tests/production-data-access.test.mjs`。
  - 输入：个人访问令牌、最高权限身份、写入原因、确认短语和基线版本。
  - 输出：实时读取、15 分钟解锁、冲突保护、快照、审计和回滚。
  - 失败测试：原始令牌不落库、错误账号/无解锁/过期/冲突被拒绝，有效写入和回滚成功。
  - 实现步骤：先建表和鉴权，再实现解锁，最后接入状态快照、审计和回滚。
  - 验证：`node --test tests/production-data-access.test.mjs`。
  - 提交：`feat: guard production data writes`。

- [ ] 本地生产数据代理与外部动作隔离
  - 依赖：生产数据网关。
  - 文件：`server/productionDataClient.mjs`、`server.mjs`、`src/state/stateApi.js`、`tests/local-production-data-client.test.mjs`。
  - 输入：被忽略 `.env` 中的生产 API URL 和个人访问令牌。
  - 输出：本地同源 `/api/state` 真实读写及本地解锁代理；外部写操作默认阻断。
  - 失败测试：读取转发、解锁令牌不下发浏览器、写入携带解锁、无配置降级、外部动作阻断。
  - 实现步骤：实现 Node 客户端，再接入本地路由，最后移除浏览器直连生产 API。
  - 验证：`node --test tests/local-production-data-client.test.mjs`。
  - 提交：`feat: connect local tests to production data`。

- [ ] 说明书环境状态界面
  - 依赖：就绪 API、本地代理。
  - 文件：`docs/platform/environment-readiness.md`、`src/state/environmentReadinessApi.js`、`src/features/handbook/EnvironmentReadinessPanel.jsx`、`src/features/handbook/environment-readiness.css`、`src/features/handbook/HandbookPage.jsx`、`react-tests/environment-readiness-ui.test.mjs`。
  - 输入：标准就绪、解锁和审计响应。
  - 输出：中文状态卡、红色解锁提示、回滚入口和完整页面状态。
  - 失败测试：专用文档路由、加载/错误/阻断/解锁/无权限文案和响应式规则先失败。
  - 实现步骤：先 API 客户端和纯展示，再解锁/回滚交互，最后响应式与无障碍。
  - 验证：`node --test react-tests/environment-readiness-ui.test.mjs`，并完成 1440、1024、390 宽度检查。
  - 提交：`feat: show environment readiness in handbook`。

- [ ] 治理、发布与生产验收
  - 依赖：全部功能任务。
  - 文件：`AGENTS.md`、`docs/platform/*.md`、`docs/decisions/2026-07-18-production-data-access.md`、`.github/workflows/quality.yml`、`CLOUDFLARE_PAGES.md`、`scripts/check-deployed-readiness.mjs`。
  - 输入：环境契约、平台能力、生产部署地址和当前指定账号。
  - 输出：跨分支门禁、生产令牌签发、部署与可验证运行状态。
  - 失败测试：治理检查发现共享能力未登记、部署检查发现生产阻断项时失败。
  - 实现步骤：更新 durable docs 和 CI，执行完整门禁，生成并签发令牌，合并 `main`，部署后检查与可回滚写入验收。
  - 验证：Definition of Done、生产就绪接口、生产页面视觉检查、D1 审计与快照记录。
  - 提交：`docs: govern environment parity releases`。
