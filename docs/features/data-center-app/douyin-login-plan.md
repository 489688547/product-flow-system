# 抖音店铺登录识别实施计划

> 2026-07-21 已终止并退役；当前店铺数据方向见 `docs/features/store-file-import-transition/`。以下内容只保留实施历史，不再作为待执行任务。

> **执行要求：** 本计划由当前任务使用 `superpowers:executing-plans` 逐项执行；用户已明确要求不使用子代理。

**目标：** 把数据接入页的抖音入口改为只填写登录邮箱和密码，保存后由公司 Mac 浏览器助手打开固定后台、等待人工验证码并自动识别店铺名称与头像。

**架构：** 复用 `PLATFORM_CREDENTIAL_MASTER_KEY` 与 AES-GCM 加密协议，新增按连接实例隔离的 D1 凭证、店铺、通用采集任务和审计表。用户 API 继续走钉钉会话；公司 Mac 复用现有采集设备 Bearer Token，使用一次性五分钟 task grant 获取单个任务的凭证。共享 provider registry 统一约束 provider、固定域名、任务类型、资源类型、调度和回写；抖音页面选择器只存在于首个 adapter，后续 ERP 等数据源复用任务协议而不复制采集框架。

**技术栈：** React 19、Cloudflare Pages Functions、D1、Web Crypto AES-GCM、Node.js Chrome DevTools Protocol、Node test runner。

## 共享能力决定

- 扩展现有 `credentialCrypto.js`，通过 `platformId = douyin-ecommerce:<connectionId>` 绑定密文附加数据；不新增加密算法或主密钥。
- 复用现有 `user_insight_runner_tokens` 的哈希设备令牌和 platform scope；新增浏览器任务路由，不复制设备认证协议。
- 新增 `dataConnections` 前端领域与状态边界；平台专属 UI 保留在数据中心 feature 内，不污染通用平台连接页。
- 固定抖音后台地址只存在服务端任务和公司 Mac provider adapter，不进入用户表单或保存请求体。
- 店铺 ID、名称和头像被建模为通用资源 `connection_identity` 的首个结果；订单、商品、库存、广告等后续资源由 provider 专属 ingestor 写入标准事实表，不使用万能 JSON 数据仓库。

## Task 1：固定领域契约、迁移和平台注册

**文件：**

- 新增：`src/domain/dataConnections.js`
- 新增：`migrations/0006_data_connections.sql`
- 新增测试：`react-tests/data-connections.test.mjs`
- 新增测试：`tests/data-connections-migration.test.mjs`
- 修改：`docs/platform/integration-registry.json`
- 修改：`docs/platform/environment-capabilities.json`
- 生成：`src/generated/platformCapabilities.js`
- 生成：`functions/api/platform/_generated/platformCapabilities.js`
- 修改：`docs/features/data-center-app/prd.md`
- 修改：`docs/features/data-center-app/design.md`
- 修改：`docs/features/data-center-app/tasks.md`

### RED

1. 为平台定义、邮箱归一化、UI 状态、店铺去重和固定 URL 不可由输入覆盖编写测试。
2. 为 `data_connections`、`data_connection_shops`、`browser_agent_tasks`、`browser_agent_task_grants`、`data_connection_audit` 表及索引编写迁移测试。
3. 运行：

```bash
node --test react-tests/data-connections.test.mjs tests/data-connections-migration.test.mjs
```

预期：模块和迁移不存在而失败。

### GREEN

1. 实现 `DOUYIN_ECOMMERCE` 固定平台定义、连接/店铺状态标准化和店铺 ID 去重。
2. 新增迁移；连接表保存通用账户标识、凭据结构 ID 和现有保险箱条目引用，加密 JSON 继续只存于共享 `credential_vault_entries`；店铺表按 `(platform_id, shop_id)` 唯一，任务只保存引用和结果摘要，grant 只保存哈希。
3. 在集成注册表新增 `douyin-ecommerce`，标记为 `integrating`；在环境能力表登记 D1 表和复用的主密钥。
4. 运行 `npm run generate:platform-manifests`，再运行 RED 命令直到通过。

## Task 2：D1 存储、权限和受控密码查看

**文件：**

- 新增：`functions/api/platform/v1/data-connections/_shared/http.js`
- 新增：`functions/api/platform/v1/data-connections/_shared/access.js`
- 新增：`functions/api/platform/v1/data-connections/_shared/storage.js`
- 新增：`functions/api/platform/v1/data-connections/index.js`
- 新增：`functions/api/platform/v1/data-connections/[id]/reveal.js`
- 新增测试：`tests/data-connections-api.test.mjs`
- 修改：`functions/api/platform/_shared/credentialCrypto.js`（仅在测试证明需要时抽取实例级上下文帮助函数）

### RED

1. 测试匿名/只读/越权写入被拒绝；授权运营与总经办可读取和管理。
2. 测试 POST 只接受 `loginEmail`、`password` 和 `expectedVersion`，忽略或拒绝后台 URL、负责人、店铺名称等字段。
3. 测试普通 GET 永不返回密码、密文、IV 或 Cookie。
4. 测试 reveal 需要 15 分钟内的新会话，返回 `no-store`，同一连接 15 分钟最多五次，并追加不含秘密的审计。
5. 运行：

```bash
node --test tests/data-connections-api.test.mjs tests/platform-credential-crypto.test.mjs
```

预期：路由和存储模块不存在而失败。

### GREEN

1. 使用 `PRODUCT_FLOW_DB` 和 `PLATFORM_CREDENTIAL_MASTER_KEY` 保存实例级 AES-GCM 密文；更新时采用 `expectedVersion` 乐观锁。
2. GET 返回连接、识别店铺和业务状态；POST/PUT 保存后创建或复用当前凭证版本的活动验证任务。
3. reveal 只在明确 POST、授权且会话新鲜时解密，响应加入 `Cache-Control: no-store, private`、`Pragma: no-cache`、`X-Content-Type-Options: nosniff`。
4. 所有错误使用稳定 code；审计只记录 actor、动作、连接 ID、请求 ID 和结果。
5. 运行 RED 命令直到通过，并回归 `tests/platform-connections-api.test.mjs`。

## Task 3：浏览器助手一次性任务与识别回写

**文件：**

- 新增：`functions/api/platform/v1/browser-agent/_shared/tasks.js`
- 新增：`functions/api/platform/v1/browser-agent/tasks.js`
- 新增：`functions/api/platform/v1/browser-agent/tasks/[id]/credential.js`
- 新增：`functions/api/platform/v1/browser-agent/tasks/[id]/result.js`
- 新增测试：`tests/browser-agent-api.test.mjs`
- 修改：`functions/api/platform/v1/user-insights/_shared/storage.js`（只抽取/复用设备令牌认证与 scope 校验）

### RED

1. 测试伪造设备令牌、平台 scope 不符、过期任务和重复领取均被拒绝。
2. 测试任务列表不含邮箱和密码；领取后生成一次性、五分钟、绑定 task/device/credentialVersion 的 grant。
3. 测试 credential 路由消费 grant 后立即失效；旧凭证版本不能使用。
4. 测试 `waiting_human_verification` 只更新任务状态；`succeeded` 按平台店铺 ID upsert 名称和头像；失败不覆盖旧店铺信息。
5. 测试结果请求中的 password、Cookie、Token、验证码、HTML 和 screenshot 字段被拒绝。
6. 运行：

```bash
node --test tests/browser-agent-api.test.mjs tests/user-insights-api.test.mjs
```

预期：浏览器助手任务路由不存在而失败。

### GREEN

1. 复用现有设备令牌认证；仅允许 `allowedScope.platforms` 包含 `douyin-ecommerce` 的设备领取抖音任务。
2. 使用 SHA-256 保存 task grant，凭证响应只允许一次且 no-store。
3. 实现任务状态机：`queued -> claimed -> waiting_human_verification -> recognizing -> succeeded|failed|expired`。
4. 成功结果按 `shopId` 去重写入店铺表并把连接标为已连接；失败保留最后一次成功识别。
5. 运行 RED 命令直到通过。

## Task 4：公司 Mac Chrome 登录助手

**文件：**

- 新增：`scripts/data-connection-agent/core.mjs`
- 新增：`scripts/data-connection-agent/providers/index.mjs`
- 新增：`scripts/data-connection-agent/providers/douyin-ecommerce.mjs`
- 新增：`scripts/data-connection-agent/index.mjs`
- 修改：`scripts/user-insights-collector/chrome-devtools.mjs`
- 修改：`package.json`
- 新增测试：`tests/data-connection-agent.test.mjs`

### RED

1. 测试通用 provider registry 只调度已登记的 provider/task/resource，并由抖音 adapter 只打开固定抖音地址、拒绝其他 origin。
2. 测试邮箱/密码只作为函数入参保存在内存，不出现在日志、错误和结果 payload。
3. 测试稳定选择器优先填写；检测验证码/滑块/短信/扫码时回传等待人工。
4. 测试登录成功后从确定性 DOM/页面状态提取一个或多个 `{shopId, shopName, shopAvatarUrl}`；页面结构变化返回 `schema_changed`，不猜名称。
5. 运行：

```bash
node --test tests/data-connection-agent.test.mjs tests/user-insights-collector.test.mjs
```

预期：助手模块不存在而失败。

### GREEN

1. 从现有 CDP 客户端抽出打开/执行表达式能力并保持用户洞察采集兼容。
2. 实现轮询任务、领取 grant、打开 Chrome 独立 profile 页面、填表、等待人工和识别回写。
3. 增加 `npm run agent:data-connections`；所需本机配置仅为服务端地址、设备 token 和 CDP endpoint。
4. AI 只预留登录后信息区适配接口，首期不把截图发往任何模型，避免在未配置公司 AI Provider 时扩大范围。
5. 运行 RED 命令直到通过。

## Task 5：抖音专属数据接入 UI

**文件：**

- 新增：`src/assets/connectors/douyin.svg`
- 新增：`src/state/dataConnectionsApi.js`
- 新增：`src/features/data-center/data-connections/DouyinConnectionDialog.jsx`
- 新增：`src/features/data-center/data-connections/DataConnectionsWorkspace.jsx`
- 新增：`src/features/data-center/data-connections/data-connections.css`
- 修改：`src/features/data-center/DataCenterAppPage.jsx`
- 修改：`react-tests/data-center-app.test.mjs`
- 新增测试：`react-tests/data-connections-ui.test.mjs`

### RED

1. 测试数据接入页不再渲染负责人、公司主体、链接名称、接入方式、账户类型、后台地址和同步数据。
2. 测试弹窗只包含登录邮箱、密码、取消和保存按钮；邮箱回显，已保存密码默认掩码。
3. 测试眼睛按钮调用 reveal、60 秒/失焦/Esc/关闭时清空明文，且不写 localStorage/sessionStorage/URL。
4. 测试已连接卡片只显示真实店铺头像、店铺名称和短状态；头像错误回退抖音 Logo；等待验证显示邮箱摘要。
5. 测试 loading、empty、error、disabled、版本冲突和键盘焦点恢复。
6. 运行：

```bash
node --test react-tests/data-connections-ui.test.mjs react-tests/data-center-app.test.mjs
```

预期：新 workspace 和 API client 不存在而失败。

### GREEN

1. 实现只含两字段的专属弹窗和受控明文显示。
2. 保存后立即关闭编辑态并显示“正在等待公司 Mac”；轮询/刷新展示人工验证和识别结果。
3. 用 `DataConnectionsWorkspace` 替换 `sources` 的旧通用 `DataSourcesWorkspace`，不改变独立的公司“平台连接”页面。
4. 完成 1440/900/640/390px、DingTalk WebView、焦点环、对比度和减少动效样式。
5. 运行 RED 命令直到通过。

## Task 6：契约文档、本地兼容和完整验证

**文件：**

- 新增：`docs/platform/apis/data-connections-v1.md`
- 新增：`docs/platform/apis/browser-agent-v1.md`
- 修改：`docs/platform/api-catalog.md`
- 修改：`docs/platform/integrations.md`
- 修改：`docs/platform/errors.md`
- 修改：`docs/platform/migrations.md`
- 修改：`DESIGN.md`
- 修改：`AGENTS.md`
- 修改：`docs/features/data-center-app/douyin-login-design.md`
- 修改：`docs/features/data-center-app/tasks.md`
- 修改：`server.mjs`（仅补本地明确兼容路由；不得把本地明文写入 JSON）
- 修改：`package.json`

### 验证

1. 更新 durable rules：普通列表/API 永不返回秘密；仅允许经过权限、新鲜会话、限流和审计的显式 reveal 路由短时返回。
2. 记录迁移容量、向后兼容和回滚；API 文档写清 auth、authorization、请求/响应、错误、超时、幂等、日志和弃用。
3. 使用真实浏览器做本地 UI 验收；公司 Mac 外部抖音登录只在拥有测试账号和人工验证时执行，不以模拟结果声称线上验证成功。
4. 运行：

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

5. 检查 `git status --short`，只提交本功能文件。没有新的明确部署授权时停在可部署状态，不执行 `release:pages` 或 D1 远程迁移。

## 完成标准

- 弹窗业务字段严格只有邮箱和密码。
- 固定 URL 不可由用户或客户端请求覆盖。
- 明文密码只在受控 reveal 和一次性浏览器任务凭证响应中短时出现，所有普通响应、日志与 D1 非密文字段均无秘密。
- 公司 Mac 可领取任务、打开抖音后台、等待人工验证并按店铺 ID 回写名称和头像。
- 外层数据接入只显示店铺头像、名称与简短状态。
- 所有定向测试、完整门禁和构建通过；真实外部登录验证状态如实报告。
