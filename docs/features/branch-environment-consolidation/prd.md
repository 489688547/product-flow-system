# 分支功能整合与环境一致性 PRD

## 文档状态

- 状态：已评审
- 负责人：产品负责人 / 总经办
- 最近更新：2026-07-20

## 背景与问题

当前 Git 分支、工作树、Cloudflare Preview 和 Production 不是同一个概念。旧工作树不会自动获得 `main` 的新运行时，Pages Preview 也有独立 Secret 配置，导致用户在不同分支中看到不同功能、不同登录能力或“没有连接 D1”的假象。

现场检查发现：生产与最新 Preview 已指向同一个 D1，但多个旧工作树仍运行历史本地服务器；Preview 缺少保险箱主密钥及钉钉、快麦配置。项目还有若干尚未进入远端 `main` 的业务提交和未提交修改，需要在不回灌旧环境规则的前提下统一整合。

## 目标

- 所有尚未进入 `main` 的有效业务能力都有明确整合结论并进入一次统一发布。
- 本地完整运行时、Preview、Production 共享同一个生产 D1 和同一平台连接保险箱密钥。
- 本地和 Preview 能以正式权限验证真实钉钉、快麦能力。
- 落后于最新 `main` 的分支不能启动完整本地运行时、通过 CI 或完成合并。
- Preview 缺少 D1 或必要 Secret 时自动失败，不再依赖人工发现。

## 非目标

- 不合并 `.DS_Store`、个人工具目录、历史构建产物或已经由 `main` 等价替代的实现。
- 不恢复旧 `server.mjs` 作为完整业务运行时。
- 不在自动验收中创建无业务意义的真实待办、日历或快麦写操作。
- 不新增第二个测试数据库。

## 用户与权限

- 产品负责人可以决定所有未合并业务能力是否保留；本次决定为全部保留有效能力。
- 本地真实账号仍由服务端个人令牌解析为 active executive。
- Preview 和 Production 仍要求正式钉钉登录。
- Secret 配置、远程部署和分支保护只允许已授权的仓库及 Cloudflare 管理身份执行。

## 当前流程

1. 开发者打开任意历史工作树。
2. 历史 `npm start` 可能运行旧 Node 服务，而不是 Pages Functions。
3. 分支即使能显示页面，也可能没有 D1、保险箱或平台 Secret。
4. 只有合并时的 CI 会发现分支落后，问题发现过晚。

## 目标流程

1. 创建或恢复分支前先获取最新 `origin/main`。
2. `npm start` 再次刷新并验证分支基线；落后时显示同步命令并退出。
3. 本地 Pages Functions、Preview 和 Production 都通过 `PRODUCT_FLOW_DB` 使用同一个 D1。
4. Preview 部署检查 D1 与必要 Secret 声明及远程配置。
5. 每个环境分别执行就绪验证；全部通过后才允许宣称功能可用。

## 业务规则

- 有效业务功能必须整合；旧环境、旧认证和旧治理规则不得覆盖最新 `main`。
- 未提交内容必须先备份，不能因切分支、合并或归档丢失。
- 主密钥只有在 `platform_credentials` 没有现存密文时才能直接统一；有密文时必须停止并采用密钥轮换迁移。
- D1 写权限不等于外部平台动作权限；所有真实动作继续走正式路由。
- 已合并工作树只有在干净或完成外部备份后才能归档。

## 数据定义

- 共享数据库：`product-flow-system`。
- D1 绑定：`PRODUCT_FLOW_DB`。
- 必要保险箱 Secret：`PLATFORM_CREDENTIAL_MASTER_KEY`。
- 钉钉必要 Secret：`DINGTALK_APP_KEY`、`DINGTALK_APP_SECRET`。
- 快麦必要 Secret：`KUAIMAI_APP_KEY`、`KUAIMAI_APP_SECRET`、`KUAIMAI_ACCESS_TOKEN`；`KUAIMAI_REFRESH_TOKEN` 可选。
- 分支整合结论：`integrated`、`equivalent_in_main`、`discarded_non_product_artifact`，每个唯一提交或未提交业务差异必须属于其中一种。

## 异常与边界

- 分支多重 merge base：逐功能比较，不使用整分支全局覆盖。
- 工作树存在未提交内容：保留原工作树并生成外部备份后再处理。
- Preview Secret 缺少：保持阻断，不以 Production 就绪替代。
- 远端 `main` 在整合期间前进：整合分支重新包含最新 `origin/main` 后再继续。
- Cloudflare 或外部平台暂时失败：记录为环境失败并重试，不修改业务数据掩盖错误。

## 验收标准

- 落后分支运行 `npm start` 时，在启动 Vite/Wrangler 前失败并给出同步命令。
- 最新分支运行 `npm start` 时可以取得真实 executive 会话并读取共享 D1。
- Preview 与 Production 下载配置显示相同 `PRODUCT_FLOW_DB` 数据库 ID。
- Preview 与 Production 必要 Secret 名称完整，任何检查输出不含值。
- Preview 和 Production 的环境就绪检查对 Cloudflare Pages、D1、钉钉、快麦均通过。
- 所有未合并分支和真实未提交业务内容都有整合证据。
- Definition of Done 全部通过后合并、部署。

## 上线与回滚

- 环境配置先补齐 Preview 并验证，再发布整合代码，最后验证 Production。
- 应用异常时回滚 Pages 部署；本功能不修改 D1 结构。
- Preview 配置失败不修改 Production。
- 主密钥设置前再次确认保险箱表为空；如不为空立即中止，不执行覆盖。
