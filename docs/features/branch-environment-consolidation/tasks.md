# 分支功能整合与环境一致性执行任务

## 执行规则

- 每项任务只交付一个可独立验证的结果。
- 先写失败测试并确认失败原因，再写最小实现。
- 每次提交只包含当前任务文件。
- 未提交业务内容先备份，原工作树在确认前不删除。
- `.DS_Store`、个人工具目录和历史生成资产不作为业务功能合并。

## 任务

- [x] 最新分支启动门禁
  - 依赖：无。
  - 文件：`tests/branch-base-check.test.mjs`、`tests/local-online-start.test.mjs`、`scripts/check-branch-base.mjs`、`scripts/start-local-online.mjs`。
  - 失败测试：本地 main 分叉、普通分支落后和 fetch 失败必须在子进程启动前失败。
  - 输出：任何分支都必须包含最新 `origin/main` 才能运行完整本地环境。
  - 验证：`node --test tests/branch-base-check.test.mjs tests/local-online-start.test.mjs`，5/5 通过；本地 `main` 分叉、普通分支最新和 fetch 失败均已覆盖。

- [x] Pages 三环境契约
  - 依赖：最新分支启动门禁。
  - 文件：`tests/pages-environment-parity.test.mjs`、`scripts/check-pages-environment-parity.mjs`、`wrangler.toml`、`package.json`、`tests/environment-capabilities.test.mjs`。
  - 失败测试：D1 ID 漂移、环境清单遗漏必要 Secret 或远程 Secret 缺失时失败且不输出值。
  - 输出：本地、Preview、Production 同 D1 的静态与远端检查。
  - 验证：聚焦测试 12/12 通过，静态检查通过；远程检查准确阻断并仅报告 Preview 缺少的 6 个 Secret 名称。

- [x] 共享主密钥与 Preview Secret 配置器
  - 依赖：Pages 三环境契约。
  - 文件：`tests/configure-pages-environment-parity.test.mjs`、`scripts/configure-pages-environment-parity.mjs`、`scripts/shared-local-env.mjs`、`scripts/start-local-online.mjs`、`.env.example`、`package.json`。
  - 失败测试：保险箱非空中止、值只经 stdin、日志无 Secret、`.env` 幂等。
  - 输出：安全的一次性统一配置和后续复核入口。
  - 验证：保险箱远程查询 0 行；聚焦测试 6/6 通过；本地、Preview、Production 已设置同一主密钥，Preview 已补齐钉钉和快麦 Secret；远程一致性检查通过。

- [x] 分支和未提交内容清单及备份
  - 依赖：无。
  - 范围：全部本地分支、工作树、唯一提交和 dirty 文件。
  - 输出：外部备份与逐项整合结论；原工作树保持可恢复。
  - 验证：Cloudflare 兼容工作树的 tracked patch 已在提交 `6f324a7` 的干净临时工作树通过 `git apply --check`；未跟踪测试归档可列出。数据中心原 dirty 内容已由其工作树提交到 `6d2e514`，原工作树现为干净，额外归档保留为恢复副本。

## 整合清单

| 来源 | 唯一提交 | 决策 | 当前证据 |
|---|---:|---|---|
| 本机分叉 `main` | 13 | integrated | goods flow、盘点和现金周期已在 `5b71898` 合入 |
| `codex/data-center-app` | 46 | integrated | 数据标准、连接器、保险箱及生产部署证据已在 `73a7dd3`、`3e56b53` 合入 |
| `codex/product-catalog-data-hub` | 1 | integrated | ERP 产品目录已在 `c2c3395` 合入 |
| `codex/fix-dingtalk-supplier-categories` | 1 | integrated | 分类修复已在 `d882d39` 合入，`.DS_Store` 排除 |
| `codex/hotfix-supply-sync-limit` | 1 | integrated | 审批同步批处理修复已在 `293ef40` 合入 |
| `codex/supply-chain-management-app` | 3 | integrated | 供应链应用已在 `07b2b0a` 合入，个人工具目录排除 |
| `codex/sync-dingtalk-suppliers` | 2 | integrated | 供应商同步已在 `5a2380a` 合入，`.DS_Store` 排除 |
| `codex/company-strategy-platform` | 1 | integrated | D1 大状态分片修复已在 `8e07be3` 合入 |
| `codex/stale-chunk-recovery` | 2 | integrated | 部署旧 chunk 恢复及 CI 元数据已在 `56d68c4` 合入 |
| `codex/release-brand-content-assets` | 1 | history_integrated_artifacts_rebuilt | 历史进入合并图，旧构建产物删除并由最终源码统一重建 |
| `codex/cloudflare-wrangler3-compat` 未提交内容 | patch + test | equivalent_integrated | 完整 Pages 构建、发布、404、缓存和重写契约已由现有实现及部署恢复测试覆盖；备份继续保留 |

备份目录：`/Users/roger/Documents/product-flow-system-branch-backups/2026-07-20/`。备份不进入 Git，原工作树仍保留。

- [x] 供应链与钉钉相关分支整合
  - 依赖：分支备份。
  - 来源：本机 main 的 goods-flow 唯一提交、`codex/fix-dingtalk-supplier-categories`、`codex/hotfix-supply-sync-limit`、`codex/supply-chain-management-app`、`codex/sync-dingtalk-suppliers`。
  - 输出：供应链、盘点、现金周期、审批批量同步、待办编辑和供应商导入统一进入当前平台边界。

- [x] 数据中心与产品目录整合
  - 依赖：分支备份。
  - 来源：`codex/data-center-app` 及其 dirty 备份、`codex/product-catalog-data-hub`。
  - 输出：数据标准、指标编排、结果版本、归档审计和统一产品目录。

- [x] 部署与状态修复整合
  - 依赖：业务分支整合。
  - 来源：`codex/company-strategy-platform`、`codex/stale-chunk-recovery`、`codex/release-brand-content-assets`、Cloudflare 兼容 dirty 备份。
  - 输出：缺失修复进入 main，等价实现有证据，最终发布资产由源码重建。

- [x] 长期规则反写与全环境验收
  - 依赖：全部实现任务。
  - 文件：`AGENTS.md`、两项仓库 Skill、平台文档、环境清单、集成注册表、ADR、生成模块。
  - 输出：完整门禁、PR、合并、Preview/Production 部署验证和安全工作树归档。
  - 验证：Lint、治理、集成、环境能力、React 588 项、API 397 项、货物流投影 2 项和生产构建全部通过；GitHub PR #30 的 `quality` 成功并已合入 `main`。
  - 环境：Preview 与 Production 共用 D1 `product-flow-system`，必要 Secret 名称远程检查通过；迁移前快照保存在外部备份目录，已上线的数据口径迁移账本完成对账，商品目录与货物流迁移已应用，远端无待执行迁移。
  - 线上：Cloudflare Pages Production 已绑定 `main` 合并提交 `4a5fea3`；正式入口返回新分包，匿名环境接口保持 401；总经理登录态可看到数据分析、商品主数据、数据接入、平台连接、数据口径等完整导航，钉钉和快麦连接均显示已配置且凭证不回显。
