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

- [ ] 共享主密钥与 Preview Secret 配置器
  - 依赖：Pages 三环境契约。
  - 文件：`tests/configure-pages-environment-parity.test.mjs`、`scripts/configure-pages-environment-parity.mjs`、`.env.example`、`package.json`。
  - 失败测试：保险箱非空中止、值只经 stdin、日志无 Secret、`.env` 幂等。
  - 输出：安全的一次性统一配置和后续复核入口。

- [ ] 分支和未提交内容清单及备份
  - 依赖：无。
  - 范围：全部本地分支、工作树、唯一提交和 dirty 文件。
  - 输出：外部备份与逐项整合结论；原工作树保持可恢复。

- [ ] 供应链与钉钉相关分支整合
  - 依赖：分支备份。
  - 来源：本机 main 的 goods-flow 唯一提交、`codex/fix-dingtalk-supplier-categories`、`codex/hotfix-supply-sync-limit`、`codex/supply-chain-management-app`、`codex/sync-dingtalk-suppliers`。
  - 输出：供应链、盘点、现金周期、审批批量同步、待办编辑和供应商导入统一进入当前平台边界。

- [ ] 数据中心与产品目录整合
  - 依赖：分支备份。
  - 来源：`codex/data-center-app` 及其 dirty 备份、`codex/product-catalog-data-hub`。
  - 输出：数据标准、指标编排、结果版本、归档审计和统一产品目录。

- [ ] 部署与状态修复整合
  - 依赖：业务分支整合。
  - 来源：`codex/company-strategy-platform`、`codex/stale-chunk-recovery`、`codex/release-brand-content-assets`、Cloudflare 兼容 dirty 备份。
  - 输出：缺失修复进入 main，等价实现有证据，最终发布资产由源码重建。

- [ ] 长期规则反写与全环境验收
  - 依赖：全部实现任务。
  - 文件：`AGENTS.md`、两项仓库 Skill、平台文档、环境清单、集成注册表、ADR、生成模块。
  - 输出：完整门禁、PR、合并、Preview/Production 部署验证和安全工作树归档。
