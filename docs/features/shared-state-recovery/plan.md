# 产品全周期共享状态安全恢复实施计划

## 目标

先阻断旧客户端整状态覆盖，再通过受控生产网关恢复事故前最后有效状态，并用测试、文档和 CI 固化规则。

## 架构方案

扩展现有共享状态能力，不新增旁路 API。客户端新增独立同步会话模块，只有成功 GET 后才允许构造带 `baseUpdatedAt` 的写请求；服务端 `/api/state` 对普通公司会话执行版本检查、写前快照和审计。生产恢复继续使用既有个人令牌和短时解锁网关。

## 文件职责

- `src/state/sharedStateSync.js`：业务中立的服务器基线与写请求状态机。
- `src/state/ProductFlowProvider.jsx`：先读后写、保留本机恢复副本、处理 409。
- `functions/api/state.js`：普通共享状态版本门禁、快照和审计。
- `react-tests/shared-state.test.mjs`：API 成功、缺少基线、冲突、快照和审计契约。
- `react-tests/shared-state-sync.test.mjs`：客户端未加载禁止写、成功加载允许写、保存推进基线。
- `react-tests/react-app.test.mjs`：移除旧的脏缓存启动上传约束。
- `docs/platform/api-catalog.md`、`docs/platform/architecture.md`、`AGENTS.md`：长期规则。
- `docs/platform/integration-registry.json`：D1 共享状态版本与审计能力。

## 接口与契约

- `GET /api/state` 返回 `{ synced, state, version, updatedAt, updatedBy }`。
- `POST /api/state` 接收 `{ state, baseUpdatedAt }`；操作者只能来自公司会话。
- 缺少基线返回 409 `SHARED_STATE_BASE_REQUIRED`。
- 基线不一致返回 409 `SHARED_STATE_VERSION_CONFLICT` 且 `retryable=true`。
- 成功返回新的 `updatedAt` 和 `auditId`。
- `createSharedStateSyncSession()` 提供 `acceptRemote(payload)`、`canSave()`、`buildWrite(state)` 和 `acceptSaved(payload)`。

## 数据迁移

不新增变量、绑定或 D1 表。复用已部署的生产写前快照和审计表。事故恢复只写 `product_flow_state_parts` 的公司状态；恢复目标为 2026-07-20T06:44:47.806Z 的状态。恢复前保留事故后整库 SQL、当前书签、历史状态 JSON 和校验和。

## 风险与回滚

- 旧客户端全部写入失败：这是有意的安全兼容中断；刷新到新版本后恢复写入。
- 快照失败：状态写入不得继续。
- 客户端冲突：保留本地脏数据，不自动重试。
- 部署失败：不恢复数据，继续保持页面关闭；修复部署后再恢复。
- 恢复错误：使用恢复审计的写前快照回滚，不回滚整库。

## 验证命令

- `node --test react-tests/shared-state-sync.test.mjs react-tests/shared-state.test.mjs`
- `npm run lint`
- `npm run check:governance`
- `npm run check:integrations`
- `npm run check:environment-capabilities`
- `npm test`
- `npm run build`
- `npm run release:pages`
- `npm run verify:production -- --require-platform cloudflare-d1 --require-platform cloudflare-pages`

## 任务顺序

1. 保存当前库、定位首次覆盖并提取最后有效状态。
2. 写失败测试证明旧客户端和旧基线仍能覆盖。
3. 实现服务端版本、快照和审计门禁。
4. 写失败测试证明客户端启动仍会上传脏缓存。
5. 实现先读后写同步会话并接入 Provider。
6. 更新长期规则、生成平台清单并执行完整门禁。
7. 合并部署服务端保护，再通过生产网关恢复数据。
8. 验证生产计数、快照、审计和旧客户端阻断。
