# 前端运行时防白屏执行任务

## 执行规则

- 每项任务只交付一个可独立验证的结果。
- 先写失败测试并确认失败原因，再写实现。
- 完成后记录实际验证命令和结果。
- 每次提交只包含当前任务文件。

## 任务

- [x] 统一安全存储边界
  - 依赖：无。
  - 文件：`src/state/resilientLocalStorage.js`、`react-tests/resilient-local-storage.test.mjs`。
  - 输入：浏览器 Storage 和可序列化业务状态。
  - 输出：安全读写、删除、序列化和白名单清理函数。
  - 失败测试：验证序列化异常、配额异常、删除异常和未登记键保留。
  - 实现步骤：扩展纯函数；登记业务缓存白名单；保持现有导出兼容。
  - 验证：`node --test react-tests/resilient-local-storage.test.mjs`。
  - 提交：`fix(runtime): harden browser cache boundary`。

- [x] 迁移所有业务 Provider
  - 依赖：统一安全存储边界。
  - 文件：`src/state/AiAssistantProvider.jsx`、`BrandContentProvider.jsx`、`DataCenterProvider.jsx`、`PlatformProvider.jsx`、`ProductFlowProvider.jsx`、`SupplyChainProvider.jsx`、`react-tests/react-app.test.mjs`。
  - 输入：安全存储函数。
  - 输出：Provider 不再直接写入或删除浏览器存储。
  - 失败测试：静态检查当前直接调用并确认失败。
  - 实现步骤：逐个替换写入与删除；缓存失败不改变业务控制流。
  - 验证：`node --test react-tests/react-app.test.mjs react-tests/resilient-local-storage.test.mjs`。
  - 提交：`fix(runtime): route providers through safe cache`。

- [x] 增加应用级故障页
  - 依赖：统一安全存储边界。
  - 文件：`src/ui/ApplicationErrorBoundary.jsx`、`src/main.jsx`、`src/styles.css`、`react-tests/application-error-boundary.test.mjs`。
  - 输入：React 子树异常、刷新动作和缓存清理动作。
  - 输出：可访问、响应式、不泄露原始异常的恢复页面。
  - 失败测试：验证入口未挂载故障边界、恢复文案与操作契约缺失。
  - 实现步骤：实现边界；接入根入口；添加故障页样式。
  - 验证：`node --test react-tests/application-error-boundary.test.mjs react-tests/react-app.test.mjs`。
  - 提交：`fix(runtime): render recoverable fatal fallback`。

- [x] 写回平台规则
  - 依赖：前两项实现。
  - 文件：`DESIGN.md`、`docs/platform/architecture.md`、`docs/platform/integration-registry.json`、`functions/api/platform/_generated/integrationRegistry.js`。
  - 输入：已实现的缓存与故障边界。
  - 输出：不可白屏、缓存非关键路径和 Cloudflare Pages 恢复代码路径成为持久规则。
  - 失败测试：`npm run check:integrations` 在生成模块未更新时失败。
  - 实现步骤：更新规则；生成平台模块。
  - 验证：`npm run check:integrations && npm run check:environment-capabilities`。
  - 提交：`docs(runtime): govern frontend recovery boundary`。

- [ ] 发布与生产验收
  - 依赖：全部实现任务。
  - 文件：构建产物与 PR 发布声明。
  - 输入：通过完整门禁的分支。
  - 输出：生产 `main` 部署和同源超额缓存浏览器验收证据。
  - 失败测试：部署前复现旧版超额缓存白屏；部署后不得出现。
  - 实现步骤：完整门禁；提交；推送；PR；合并；检查 Pages 部署；浏览器复验。
  - 验证：Definition of Done、生产就绪脚本、正式域名入口哈希、控制台和页面交互。
  - 提交：只发布已评审文件，不混入其他工作区改动。
