# 平台连接实施计划

## 目标

交付可由最高权限管理员在数据中心配置、验证并启用钉钉与快麦公司连接的加密保险箱，同时保持旧环境变量回退和环境就绪一致性。

## 架构方案

功能采用四层边界：`src/domain/platformConnections.js` 定义业务中立的平台字段和显示状态；`src/features/data-center` 只调用平台 API；`functions/api/platform/v1/platform-connections.js` 负责会话、权限、校验和只读验证；`functions/api/platform/_shared/platformCredentials.js` 负责 AES-GCM、D1 持久化、解析优先级和审计。外部适配器只通过异步解析器取得当前配置，不直接读取 D1。

## 文件职责

- 新建 `src/domain/platformConnections.js`：钉钉、快麦、阿里云的公开字段定义和状态转换。
- 新建 `src/state/platformConnectionsApi.js`：GET/PUT/DELETE 客户端。
- 新建 `src/features/data-center/PlatformConnectionsWorkspace.jsx`：清单、详情、表单和页面状态。
- 新建 `src/features/data-center/platform-connections.css`：局部响应式样式。
- 修改 `src/App.jsx`、`DataCenterAppPage.jsx`：增加导航和工作区。
- 新建 `functions/api/platform/_shared/credentialCrypto.js`：AES-256-GCM 加解密。
- 新建 `functions/api/platform/_shared/platformCredentials.js`：字段校验、D1 存储、脱敏元数据、回退解析和审计。
- 新建 `functions/api/platform/_shared/platformConnectionTesters.js`：钉钉、快麦只读验证与超时。
- 新建 `functions/api/platform/v1/platform-connections.js`：共享 v1 API。
- 修改钉钉和快麦适配器：读取统一解析器。
- 修改环境就绪检查：保险箱字段和旧环境变量共同满足能力。
- 新建 `migrations/0003_platform_credentials.sql`：当前连接与审计表。
- 更新环境清单、集成注册表、API 目录、错误码、平台规范、ADR、产品与设计持久规则。

## 接口与契约

- `platformConnectionDefinition(platformId)`：返回允许字段、必填字段和生命周期。
- `encryptPlatformCredentials(payload, { masterKey, platformId, keyVersion })`：返回密文、IV、算法和版本。
- `readPlatformCredentials(env, platformId)`：返回 `{ values, source, version }`；顺序为启用保险箱、旧环境变量、空配置。
- `platformEnv(env, platformId)`：返回只覆盖该平台允许变量的新对象，不修改原 `env`。
- `GET /api/platform/v1/platform-connections`：返回脱敏连接数组和 `canManage`。
- `PUT /api/platform/v1/platform-connections`：输入 `{ platformId, expectedVersion, fields }`，先验证后保存。
- `DELETE /api/platform/v1/platform-connections`：输入 `{ platformId, expectedVersion }`，停用当前连接。

## 数据迁移

- 新增 `platform_credentials`，每个平台一行；预计少于 20 行，容量影响可忽略。
- 新增 `platform_credential_audit`，仅字段名和安全结果；按平台和时间建立索引。
- 不回填环境变量明文，避免部署脚本或日志接触凭据。
- 旧部署、旧变量和旧接口保持可用；新代码在无表、无主密钥或无当前连接时回退环境变量。

## 风险与回滚

- 主密钥丢失：保险箱配置不可解密；适配器回退旧环境变量，重新录入即可恢复。
- 外部验证超时：候选配置不保存，旧连接继续使用。
- D1 版本冲突：返回 409，不覆盖他人更新。
- 公共登录自举：当前会话或旧环境变量仍可登录；首次保险箱配置后公共登录路由也使用解析器。
- 回滚：停用保险箱连接、恢复旧部署、保留新表；不需要删除数据。

## 验证命令

- 聚焦：`node --test tests/platform-credential-crypto.test.mjs tests/platform-connections-api.test.mjs tests/environment-readiness-api.test.mjs tests/dingtalk-web-auth.test.mjs tests/kuaimai-api.test.mjs`
- UI：`node --test react-tests/platform-connections.test.mjs react-tests/data-center-app.test.mjs`
- 全量：`npm run lint && npm run check:governance && npm run check:integrations && npm run check:environment-capabilities && npm test && npm run build`
- 生产：`npm run verify:production -- --require-platform dingtalk --require-platform kuaimai`
- 视觉：本地 Pages Functions 预览下检查 1280、768、390 宽度和钉钉 WebView。

## 任务顺序

1. 文档、API 契约、ADR、环境和集成声明。
2. 加密与 D1 存储红绿测试。
3. 平台连接 API、权限、失败保持旧配置红绿测试。
4. 钉钉、快麦解析器和环境就绪红绿测试。
5. 数据中心清单与专属表单红绿测试。
6. 迁移、生成清单、全量验证、生产部署和真实就绪检查。
