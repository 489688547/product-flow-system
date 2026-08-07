# 核心开发人员本地数据访问执行任务

## 执行规则

- 每项任务只交付一个可独立验证的结果。
- 先写失败测试并确认失败原因，再写实现。
- 完成后记录实际验证命令和结果。
- 每次提交只包含当前任务文件。

## 任务

- [x] 个人文件与启动分流
  - 依赖：已确认固定路径与两名唯一钉钉成员。
  - 文件：`scripts/core-developer-access.mjs`、`scripts/start-local.mjs`、`package.json`、测试。
  - 输入：用户主目录和个人文件。
  - 输出：安全配置对象及核心/沙箱启动选择。
  - 失败测试：文件不存在、权限过宽、URL 非 HTTPS 和 Token 为空。
  - 实现步骤：测试先行，实现解析、权限检查和入口分流。
  - 验证：核心文件存在选择 production；不存在选择 sandbox。
  - 提交：`feat(dev): load personal developer access`
  - 2026-08-07：固定路径、0600/所有者/HTTPS Origin/空 Token 校验、缺文件沙箱
    回退和 `npm start` 分流测试共 8 项通过；`npm run start:sandbox` 保持强制本地。

- [x] 核心开发认证与本地代理
  - 依赖：个人文件合同。
  - 文件：`vite.config.js`、`functions/api/_middleware.js`、认证路由、平台测试。
  - 输入：服务端个人 Token 和请求方法。
  - 输出：个人生产身份与现有 API 数据权限。
  - 失败测试：浏览器看不到 Token、外部 Origin 拒绝、非核心 Token 不提权。
  - 实现步骤：先扩展授权器，再接 middleware、session 和 Vite 代理。
  - 验证：read/write 映射、身份、Origin 和错误合同测试通过。
  - 提交：`feat(auth): authorize core developers`
  - 2026-08-07：复用生产个人令牌并增加 `core_developer` 能力；服务端按请求方法映射
    read/write，本地 Vite 仅在 Node 代理注入 Token，拒绝外部 Origin。认证、CORS、
    代理与沙箱相关测试共 59 项通过，相关 ESLint 通过。

- [ ] 受控签发与仓库外文件
  - 依赖：核心开发认证。
  - 文件：签发脚本、测试和 ECS 运行说明。
  - 输入：稳定 userId、生产 SQLite 和仓库外输出目录。
  - 输出：两份独立 0600 文件、哈希记录和无秘密审计。
  - 失败测试：非 active、身份不完整、重复有效 Token 和仓库内输出拒绝。
  - 实现步骤：生成、哈希、原子写文件、记录指纹与审计，再在 ECS 执行。
  - 验证：两 Token 不同，单独撤销互不影响，输出不打印明文。
  - 提交：`feat(dev): issue personal access files`

- [ ] README、门禁与真实验收
  - 依赖：前三项。
  - 文件：`README.md`、`.env.example`、`AGENTS.md`、平台/决策文档和任务证据。
  - 输入：最终命令、路径和错误文案。
  - 输出：fork 后一条主路径与核心/沙箱边界。
  - 失败测试：README 缺固定路径、沙箱命令或 Secret 禁令时失败。
  - 实现步骤：更新长期规则，运行完整门禁，推送 PR，测试后发布。
  - 验证：本地、固定测试、ECS 生产和两名个人身份分别留证。
  - 提交：`docs(dev): document core developer setup`
