# 环境一致性与生产数据访问实施计划

## 目标

交付一套由环境能力清单驱动的就绪检查，以及当前最高权限账号可从本地受控读写、审计和回滚生产公司状态的通道。

## 架构方案

公开 JSON 清单定义环境所需变量、绑定、表和关联平台；构建脚本生成 Pages Functions 可直接导入的普通 JavaScript，避免旧版 Wrangler 不支持 JSON import attributes。生产网关使用个人 Bearer 令牌和短时解锁令牌访问现有 D1 状态函数；本地 Node 服务持有令牌并继续向前端暴露同源 `/api/state`。生产前端保持现有会话写入流程，外部提供商动作与数据库写入权分离。

## 文件职责

- `docs/platform/environment-capabilities.json`：环境能力事实源。
- `scripts/generate-platform-manifests.mjs`：验证并生成普通 JS 模块。
- `functions/api/platform/_generated/*.js`：Wrangler 3/4 兼容生成物。
- `functions/api/platform/_shared/environmentReadiness.js`：脱敏运行环境检查。
- `functions/api/platform/_shared/productionDataAccess.js`：令牌、解锁、审计和快照存储。
- `functions/api/platform/v1/environment-readiness.js`：员工或生产数据令牌读取状态 API。
- `functions/api/platform/v1/production-write-session.js`：解锁、锁定和状态 API。
- `functions/api/platform/v1/production-data/state.js`：生产状态读写、冲突、快照与回滚网关。
- `functions/api/state.js`：导出复用的状态读写函数，保持原接口兼容。
- `server/productionDataClient.mjs`：本地服务到生产网关的单一客户端。
- `server.mjs`：本地状态代理、解锁代理和外部写操作阻断。
- `src/state/stateApi.js`：本地统一使用同源 `/api/state`。
- `src/state/environmentReadinessApi.js`：状态、解锁、锁定和回滚客户端。
- `src/features/handbook/EnvironmentReadinessPanel.jsx`：中文状态与生产写入控制界面。
- `src/features/handbook/environment-readiness.css`：响应式与状态样式。
- `tests/environment-readiness-api.test.mjs`：API、权限与脱敏契约。
- `tests/production-data-access.test.mjs`：令牌、解锁、冲突、审计和回滚。
- `tests/local-production-data-client.test.mjs`：本地代理与外部副作用隔离。
- `react-tests/environment-readiness-ui.test.mjs`：说明书入口与 UI 状态。

## 接口与契约

- `GET /api/platform/v1/environment-readiness` → `{ environment, ready, checkedAt, capabilities, dataAccess }`。
- `GET /api/platform/v1/production-write-session` → `{ allowed, unlocked, expiresAt, reason }`。
- `POST /api/platform/v1/production-write-session` 输入 `{ reason, confirmation }`，输出有效期与一次性返回的解锁令牌；本地服务不把令牌传给浏览器。
- `DELETE /api/platform/v1/production-write-session` 撤销当前令牌的所有解锁。
- `GET /api/platform/v1/production-data/state` → 现有状态响应并附 `audit`。
- `POST /api/platform/v1/production-data/state` 输入 `{ state, baseUpdatedAt }`；需 `Authorization: Bearer` 和 `X-PFS-Production-Unlock`。
- `POST /api/platform/v1/production-data/state` 输入 `{ action: "rollback", auditId }` 时恢复对应写前快照。
- `createProductionDataClient({ apiUrl, accessToken, fetchImpl })` 只在 Node 本地服务中使用，浏览器永不获得生产令牌。

## 数据迁移

所有新表通过幂等 `CREATE TABLE IF NOT EXISTS` 建立，不修改现有业务表。初始个人令牌由部署操作者生成随机值，将 SHA-256 哈希和当前钉钉稳定身份写入 D1，原始值只进入被忽略的本地 `.env`。快照按 UTF-8 分片并保留最近 30 条，避免 D1 单行上限。

## 风险与回滚

- 错绑账号：令牌表同时校验 `userId`、`unionId` 和 `executive` 角色；撤销令牌立即关闭通道。
- 旧状态覆盖：`baseUpdatedAt` 不一致返回 409。
- 快照膨胀：每次写入后清理超过 30 条的最旧快照与分片。
- 外部副作用：本地服务对钉钉创建/同步和快麦会话刷新返回稳定阻断错误。
- 应用回滚：撤销 D1 令牌、移除本地 `.env` 变量并回退应用；新表保留。

## 验证命令

- `npm run check:environment-capabilities`
- `node --test tests/environment-readiness-api.test.mjs tests/production-data-access.test.mjs tests/local-production-data-client.test.mjs`
- `node --test react-tests/environment-readiness-ui.test.mjs`
- `npm run lint`
- `npm run check:governance`
- `npm run check:integrations`
- `npm test`
- `npm run build`
- `npm run release:pages`
- `node scripts/check-deployed-readiness.mjs --url https://product-flow-system.pages.dev`

## 任务顺序

1. 清单、生成器和 CI 漂移检查。
2. 就绪检查纯函数与 API。
3. 生产数据令牌、解锁、审计、快照和状态网关。
4. 本地同源代理和外部副作用隔离。
5. 说明书环境面板与响应式视觉验收。
6. 平台文档、ADR、完整质量门禁、令牌签发、合并部署与生产验证。
