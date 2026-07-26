# 供应链共享平台 API 任务

- [x] 锁定 13 个用户故事到共享事实和工作流资源的映射。
- [x] 新增工作流 D1 迁移、展示策略与环境能力。
- [x] 实现库存 current/history/filter/quality。
- [x] 实现销售日需求 API。
- [x] 实现供应商、采购、付款、质量问题、售后只读事实。
- [x] 实现统一 data-tasks。
- [x] 实现供应链工作流创建、列表、动作、版本、幂等和审计。
- [x] 写回 API、错误、集成与回滚规则。
- [x] 聚焦测试和全量门禁通过。
- [x] PR 合并、迁移、Cloudflare Git 部署和生产验收。

## 生产验收

- 2026-07-26：共享事实与工作流由 PR #94 合并，库存质量口径修复由 PR #95 合并；两次 GitHub 质量门禁和 Cloudflare Git 生产部署均成功。
- 生产仅应用并登记 `0016_supply_chain_workflows.sql`，迁移前已记录 D1 Time Travel 书签。
- 真实 executive 会话读取库存成功：3,568 行、12 个仓库、301 个 SKU，`coverage=1`、`status=trusted`、`confidence=partial`、金额字段可见。
- 销售日需求、供应商、采购、付款、质量问题、售后、统一任务与 16 类工作流路由均返回稳定契约；没有来源事实的质量问题和售后保持 `unavailable`，外部钉钉/ERP 写动作保持 `pending_manual`。
