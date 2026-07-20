# 平台连接执行任务

## 执行规则

- 每项任务只交付一个可独立验证的结果。
- 先写失败测试并确认失败原因，再写实现。
- 完成后记录实际验证命令和结果。
- 每次提交只包含当前任务文件。

## 任务

- [x] 固化产品、交互、接口、环境与架构决策
  - 依赖：已确认的产品设计。
  - 文件：`docs/features/platform-connections/*`、`docs/platform/apis/platform-connections-v1.md`、`docs/decisions/2026-07-19-platform-credential-vault.md`。
  - 输入：当前环境阻断、钉钉与快麦适配器、数据中心安全边界。
  - 输出：可执行、可回滚的中文规格。
  - 失败测试：`npm run check:governance` 在缺少完整文档时失败。
  - 实现步骤：从模板建立四份功能文档；补充 API 契约和 ADR；自审无占位词。
  - 验证：`npm run check:governance`。
  - 提交：`docs(platform): define managed platform connections`。

- [x] 建立加密存储和 D1 迁移
  - 依赖：任务 1。
  - 文件：`credentialCrypto.js`、`platformCredentials.js`、迁移和单元测试。
  - 输入：32 字节 Base64URL 主密钥、平台字段对象。
  - 输出：不可明文读取的当前连接、脱敏元数据和审计。
  - 失败测试：加密往返、篡改失败、错误密钥失败、存储不含明文、版本冲突。
  - 实现步骤：先加密；再存储；最后解析回退。
  - 验证：`node --test tests/platform-credential-crypto.test.mjs tests/platform-credential-storage.test.mjs`。
  - 提交：`feat(platform): add encrypted credential vault`。

- [x] 建立管理员 API 和只读连接验证
  - 依赖：任务 2。
  - 文件：v1 路由、测试器、API 客户端和契约测试。
  - 输入：平台 ID、版本、本次修改字段。
  - 输出：脱敏读取、验证后保存、停用和稳定错误码。
  - 失败测试：匿名、普通员工、只读、字段校验、超时、验证失败、成功和冲突。
  - 实现步骤：GET；PUT 候选合并与验证；DELETE 停用；审计。
  - 验证：`node --test tests/platform-connections-api.test.mjs`。
  - 提交：`feat(platform): expose governed connection API`。

- [x] 统一钉钉、快麦和环境就绪读取
  - 依赖：任务 3。
  - 文件：两个适配器、登录路由、环境就绪检查及回归测试。
  - 输入：保险箱或旧环境变量。
  - 输出：同一解析优先级和配置状态。
  - 失败测试：保险箱优先、停用回退、无主密钥回退、就绪检查、公共登录配置。
  - 实现步骤：接入异步解析器；保持旧同步辅助函数兼容；更新就绪检查。
  - 验证：聚焦 API 测试和现有钉钉、快麦回归。
  - 提交：`feat(integrations): resolve managed credentials`。

- [x] 交付老板可用的平台连接页面
  - 依赖：任务 3。
  - 文件：domain、state、React 工作区、路由、CSS 和 UI 测试。
  - 输入：脱敏连接状态和平台定义。
  - 输出：Logo 清单、钉钉/快麦专属表单、阿里云禁用状态。
  - 失败测试：导航、加载、无权限、字段遮罩、保存中、失败保留和响应式样式。
  - 实现步骤：纯领域定义；API 客户端；列表；详情表单；样式。
  - 验证：`node --test react-tests/platform-connections.test.mjs react-tests/data-center-app.test.mjs` 和浏览器检查。
  - 提交：`feat(data): add platform connection workspace`。

- [x] 发布并验证生产连接能力
  - 依赖：任务 2-5。
  - 文件：清单、生成模块、平台规范和发布记录。
  - 输入：D1 迁移、Cloudflare Secret、构建产物。
  - 输出：生产页面和 Functions 使用统一连接。
  - 失败测试：环境能力和集成检查在声明缺失时失败。
  - 实现步骤：生成清单；全量验证；应用迁移；设置主密钥；部署；生产就绪验证。
  - 验证：Definition of Done 和两个平台生产验证。
  - 提交：`chore(release): publish platform connections`。
  - 发布证据：PR #24 合并为 `7758f08`；生产 D1 已应用 `0003_platform_credentials.sql`；Cloudflare Pages 部署 `cd842966`；钉钉、快麦生产就绪检查于 2026-07-19 18:36（Asia/Shanghai）通过。
