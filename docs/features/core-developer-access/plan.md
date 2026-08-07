# 核心开发人员本地数据访问实施计划

## 目标

交付个人开发文件签发、固定路径自动加载和安全本地生产 API 代理。

## 架构方案

扩展现有 `productionDataAccess`，以显式 `core_developer` Token 能力授权非 executive
组织成员；Vite 代理在 Node 侧注入个人 Token，浏览器不接触明文。默认 `npm start`
按文件存在性选择核心开发模式或零 Secret 沙箱，后端开发可强制使用沙箱。

## 文件职责

- `scripts/core-developer-access.mjs`：配置路径、解析、校验和安全文件权限。
- `scripts/issue-core-developer-access.mjs`：ECS 受控签发/撤销、哈希和文件输出。
- `scripts/start-local.mjs`：标准入口分流。
- `scripts/start-core-developer.mjs`：生产 API 连通性检查和 Vite 生命周期。
- `vite.config.js`：同源限制、Origin 清理和服务端 Token 注入。
- `functions/api/_middleware.js`：核心开发 Token 认证和请求方法能力映射。
- `functions/api/auth/session.js`：返回中间件已解析的核心开发身份。
- `README.md`、`.env.example`、`AGENTS.md` 和平台文档：公开启动与权限规则。
- `tests/core-developer-access.test.mjs`：文件、签发、代理和认证合同。

## 接口与契约

- `developerAccessPath(homeDir) -> ~/.config/product-flow-system/developer.env`。
- `loadDeveloperAccess({ homeDir }) -> { path, apiUrl, token }`；拒绝非 0600、非 HTTPS
  正式 Origin 和空 Token。
- `issueCoreDeveloperAccess({ db, userId, outputPath, now }) -> { path, fingerprint,
  expiresAt }`；不返回或记录明文 Token。
- 核心代理头只在本地 Node 代理与生产 API 间使用；中间件按 GET/HEAD=`read`、其他
  方法=`write` 调用 `authorizeProductionToken`。
- `core_developer` 能力允许 active 且稳定身份匹配的成员获得 server-owned executive
  数据权限；普通 Token 的既有 executive 检查保持不变。

## 数据迁移

不新增表。既有 JSON capabilities 向后兼容新增字符串。签发前对控制 SQLite 做一致性
快照；两枚 Token 作为两行独立记录，可单独撤销。

## 风险与回滚

- 本地恶意网页借代理写生产：代理拒绝非固定 localhost Origin。
- Token 泄露：文件强制 0600、明文不进日志、可按个人撤销。
- 权限过宽：只有显式 `core_developer` 能力触发，人员 active 状态每次请求复核。
- 回滚：撤销新 Token，恢复旧 middleware/Vite/启动器；数据库无需降级。

## 验证命令

```bash
node --test tests/core-developer-access.test.mjs tests/production-data-access.test.mjs tests/local-online-start.test.mjs tests/local-sandbox.test.mjs
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

真实环境另行验证：ACR Node 24 构建、ECS 测试 API、个人身份会话、GET/写入、单独
撤销、Token 泄漏扫描、控制库快照和正式域名恢复。

## 任务顺序

1. 个人文件合同与标准启动分流。
2. 核心开发 Token 授权与安全代理。
3. ECS 签发脚本和两份仓库外文件。
4. README、长期规则、完整门禁和固定环境验收。
