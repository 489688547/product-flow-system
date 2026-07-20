# 分支功能整合与环境一致性设计书

## 文档状态

- 状态：已评审
- 负责人：产品负责人 / 总经办
- 最近更新：2026-07-20

## 背景与问题

项目长期并行开发后出现了两类不一致：

1. 已创建的工作树不会因 `main` 更新而自动获得新代码。旧工作树仍可能运行 `node server.mjs`，因此即使线上已经统一使用 D1，本地页面仍表现为没有连接生产数据库。
2. Cloudflare Pages 的 Preview 与 Production 分别维护运行配置。两者虽然已经指向同一个 `product-flow-system` D1，但 Preview 缺少平台连接保险箱、钉钉和快麦所需的部分 Secret，导致“数据已连接、平台能力未连接”的半就绪状态。

本次不是把所有旧分支机械合并到 `main`，而是完整保留各分支尚未进入 `main` 的有效业务能力，同时禁止旧的运行时、权限、环境和部署规则覆盖当前平台契约。

## 目标

- 将所有尚未进入 `main` 的有效功能和未提交业务改动纳入一次受控整合。
- 本地完整运行时、Cloudflare Preview 和 Production 共同使用同一个生产 D1。
- 本地、Preview 和 Production 使用同一套平台连接保险箱主密钥，使同一 D1 中的凭据可被三个运行环境读取。
- Preview 具备与 Production 相同的钉钉、快麦真实能力；所有动作继续经过正式路由、权限和提供商适配器。
- 旧分支落后于 `main` 时不能继续启动完整本地环境、不能通过 CI、不能合并。
- Preview 缺少 D1 或必要 Secret 时不能被视为可验收环境。

## 非目标

- 不保留已经被 `main` 替代的旧本地服务器、假身份、只读本地预览或第二套业务 API。
- 不把 Cloudflare Secret、个人令牌、Cookie 或外部平台原始响应写入 Git、日志、设计书或审计记录。
- 不把“数据库写权限”扩大为绕过钉钉、快麦或其他平台路由权限。
- 不在合并过程中顺带重构与冲突无关的业务模块。

## 整合策略

### 1. 保护现有工作

- 对每个工作树记录分支、提交、相对 `origin/main` 的领先/落后数量和未提交文件。
- 未提交内容先生成工作树外部备份，再开始合并；备份不进入仓库。
- 已合并且干净的工作树在最终上线后归档。
- 已合并但仍有未提交内容的工作树，先判断这些内容是否已经由 `main` 等价实现；未实现的内容进入整合分支，已实现的内容只保留备份证据。

### 2. 功能整合而非旧规则回灌

- 统一整合分支必须从最新 `origin/main` 创建。
- 对每个尚未合并的分支逐个审查唯一提交和未提交差异，一次只整合一个业务边界。
- 产品功能、数据定义和真实业务修复应保留；生成文件在最终源代码稳定后统一重建。
- 下列边界发生冲突时以最新 `main` 为准：`AGENTS.md`、`.agents/skills/`、`wrangler.toml`、本地启动器、认证中间件、生产数据网关、平台连接保险箱、集成注册表、环境能力清单、GitHub 工作流和发布脚本。
- 每个分支整合后运行该业务边界的聚焦测试；失败时在当前边界解决，不把未定位问题带入下一分支。

## 环境架构

### D1

- 唯一业务数据库为 `product-flow-system`。
- `PRODUCT_FLOW_DB` 在本地、Preview、Production 均绑定到同一个数据库 ID。
- `wrangler.toml` 必须显式声明顶层、`env.preview` 和 `env.production` 的 D1 绑定；生成的平台清单和契约测试校验三处一致。
- 本地只允许通过 `npm start` 启动 Vite 和 Pages Functions，Wrangler 使用受治理的远程 D1 绑定。

### 平台连接保险箱

- `PLATFORM_CREDENTIAL_MASTER_KEY` 使用同一个 32 字节随机密钥，分别保存于本地忽略文件、Cloudflare Preview Secret 和 Production Secret。
- 只有在生产 D1 的 `platform_credentials` 表没有现存密文时，才允许直接统一主密钥；如未来存在密文，必须走专门的密钥轮换迁移，禁止直接覆盖。
- 钉钉和快麦凭据作为 Cloudflare Secret 分别配置到 Preview 与 Production；浏览器和 API 只读取脱敏元数据。
- Preview 和 Production 继续共用 D1 中的平台连接记录，因此在数据中心保存一次连接后，两个环境读取同一版本。

### 身份与真实动作

- 回环主机上的本地完整运行时使用服务端个人令牌解析真实 active executive 身份，不使用硬编码账号。
- Preview 和 Production 使用正式钉钉登录。
- 创建钉钉待办、日历、审批或触发快麦同步时，三个环境均调用同一正式路由和提供商适配器；环境一致性不改变角色、目标范围、幂等、超时和审计规则。

## 防止再次发生

### 开发前与本地启动

- `feature-workflow` 在修改代码前获取最新 `origin/main` 并检查祖先关系。
- `npm start` 启动前再次获取最新 `origin/main`。当前分支不包含最新 `main` 时直接退出，并显示可复制的同步命令。
- 启动检查只阻止错误环境运行，不自动改写或丢弃开发者未提交内容。

### CI 与合并

- `quality` 必须运行 `npm run check:branch-base`、治理、集成和环境能力检查。
- GitHub 保持“分支必须更新到最新 main”“quality 必须通过”“管理员不可绕过”。
- 环境契约测试检查 Preview 与 Production 的 D1 ID、绑定名称和必要 Secret 声明一致。
- PR 修改 D1、Secret 名称、平台关系或发布边界时，必须声明 `Integration-Impact` 和 `Rule-Writeback` 并更新持久规则。

### 部署与验收

- Preview 部署前验证必要 Secret 已存在；缺少时部署或验收失败，不允许用 Production 成功替代 Preview 结果。
- Preview、Production 分别调用环境就绪接口，要求 Cloudflare Pages、D1、钉钉和快麦全部就绪。
- 部署验证只记录能力名称、状态和缺失的变量名，不记录任何 Secret 值。
- 本地成功、Preview 成功和 Production 成功是三条独立证据，不能相互替代。

## 错误处理与回滚

- 分支冲突：停止当前分支整合，保留已完成的独立提交；不得用全局 `ours` 或 `theirs` 覆盖业务文件。
- 未提交内容恢复失败：保留外部备份，不删除原工作树，待逐文件核对。
- Preview Secret 配置失败：不修改 Production；Preview 保持阻断状态。
- 主密钥统一前再次检查 `platform_credentials` 行数；非零即停止并改用密钥轮换方案。
- 上线后发生回归时，回滚应用部署；D1 不做结构迁移，平台连接记录不需要回滚。

## 验证范围

- 分支：所有未合并分支的唯一提交都有“已整合、已由 main 等价覆盖、明确废弃”之一的证据，不能静默遗漏。
- 本地：最新分支可以启动，落后分支被阻止；真实账号、D1 读写、钉钉与快麦只读验证通过。
- Preview：D1、保险箱、钉钉、快麦就绪，未登录业务接口仍受正式认证保护。
- Production：完整就绪检查通过，未登录接口返回 401，本地身份注入不会出现在公网主机。
- 工程：执行 `npm run lint`、`npm run check:governance`、`npm run check:integrations`、`npm run check:environment-capabilities`、`npm test`、`npm run build` 和 `git diff --check`。

## 完成标准

- 所有有效分支能力进入 `main` 并部署。
- Preview 与 Production 的 D1 和必要平台能力均显示就绪。
- 新建或重新打开的旧分支无法在落后 `main` 的情况下启动完整本地运行时或合并。
- 已完成工作树在确认无未保存内容后归档，保留的工作树全部基于最新 `main`。
