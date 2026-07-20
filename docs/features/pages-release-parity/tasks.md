# Pages 发布一致性执行任务

## 执行规则

- 每项任务只交付一个可独立验证的结果。
- 先写失败测试并确认失败原因，再写实现。
- 完成后记录实际验证命令和结果。
- 每次提交只包含当前任务文件。

## 任务

- [x] 任务 1：锁定 `dist` 发布契约
  - 依赖：生产事故证据。
  - 文件：`react-tests/deployment-recovery.test.mjs`。
  - 输入：自动部署缺少 `/cloudflare-entry` 的复现。
  - 输出：构建命令与产物契约测试。
  - 失败测试：现有 `npm run build` 未执行 Pages 产物后处理，测试按预期失败。
  - 实现步骤：先只增加断言并运行一次红灯。
  - 验证：`node --test react-tests/deployment-recovery.test.mjs`。
  - 提交：随任务 2 形成单一事故修复提交。
  - 证据：`node --test react-tests/deployment-recovery.test.mjs` 首次运行 3/4，新增契约按预期因 build 未调用后处理脚本而失败。

- [x] 任务 2：统一自动与手动发布包
  - 依赖：任务 1 红灯。
  - 文件：`scripts/prepare-pages-build.mjs`、`package.json`、`scripts/prepare-pages-release.mjs`。
  - 输入：Vite `dist/index.html` 与仓库发布规则。
  - 输出：完整 `dist` 和根目录发布包。
  - 失败测试：缺少构建后处理模块与三个 `dist` 文件。
  - 实现步骤：补入口 → 复制头规则 → 复制重写规则 → 让 release 复用构建产物。
  - 验证：聚焦测试与 `npm run build`。
  - 提交：`fix(deploy): keep Pages releases version-consistent`。
  - 证据：聚焦测试 4/4；`npm run build` 后入口内容一致，`dist/_headers` 与 `dist/_redirects` 存在且规则正确。

- [x] 任务 3：生产验证与规则写回
  - 依赖：任务 2。
  - 文件：`docs/platform/architecture.md`、任务证据。
  - 输入：完整分支和生产部署。
  - 输出：全量门禁、生产入口/资源/浏览器证据和回滚说明。
  - 失败测试：不适用。
  - 实现步骤：全量门禁 → 生成发布包 → 部署 → HTTP/浏览器/控制台验证。
  - 验证：仓库 Definition of Done 与生产读验证。
  - 提交：随事故修复提交记录。
  - 证据：在最新 `main` 基线上整合 AI 总助后，lint、治理、集成、环境检查、完整前端/API 测试和构建均通过；生产部署 `3093d9ee` 的入口、主 JS/CSS 与三个受保护 API 均返回预期状态。Chrome 登录态确认 AI 总助服务可用、11 个数据域、Enter 发送成功、数据 Skill 返回带来源答案且控制台 0 错误。
