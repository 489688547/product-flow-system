# 商品主数据库存与日期经营视图实施计划

## 计划状态

- 状态：已确认，实施中
- 研发待办：`DEV-000012`
- 分支：`codex/product-catalog-inventory`
- 详细计划：`docs/superpowers/plans/2026-07-28-product-catalog-inventory.md`

## 实施停点

1. 已完成 `prd.md` 与 `design.md` 书面确认并展开详细实施计划。
2. 实施前先为库存领域计算、商品目录 API 和日期自动刷新补失败测试。
3. 每完成一个可独立验证的任务，更新 `tasks.md` 并运行聚焦测试。
4. 完成功能后运行仓库完整质量门禁、Pages Functions 构建和真实开发站验收。
5. 未通过开发站验收前不进入 `dev → main` 生产发布。

## 交付边界

- 不新增或迁移 D1 表。
- 不读取或修改外部平台。
- 功能完成并通过门禁后，按 `codex/* → dev → main` 自动完成 GitOps 交付。
