# 品牌内容协同规格阶段计划

## 目标

在任何行为代码开始前，让业务负责人确认品牌内容协同的产品范围、角色权限、数据口径、NAS 边界和唯一左侧导航设计。

## 架构方案

本阶段只交付可评审的 PRD、功能设计和绿联 NAS 计划中集成登记。品牌内容协同保留内容主档与生产协同，数据中心提供标准表现数据，绿联 NAS 通过本地只读索引器提供文件元数据；三个边界在规格评审通过前不得进入代码。

## 文件职责

- `docs/features/brand-content-collaboration/prd.md`：定义问题、目标、角色、业务规则、数据定义、异常和验收标准。
- `docs/features/brand-content-collaboration/design.md`：定义唯一左侧导航、九个页面、交互状态、组件边界和视觉验收。
- `docs/features/brand-content-collaboration/plan.md`：记录当前规格评审门禁；评审通过后由正式实施计划替换本文件内容。
- `docs/features/brand-content-collaboration/tasks.md`：记录规格阶段已完成工作和下一门禁。
- `docs/platform/integration-registry.json`：登记绿联 NAS 的计划中状态、官方能力、限制和与投放平台的关系。

## 接口与契约

本阶段不新增运行时接口。规格提出的 `ContentItem`、`ContentAssetVersion`、`Publication` 和 `ContentPerformanceSnapshot` 仅作为待评审契约；正式实施计划必须把它们拆成精确的领域接口、API 契约、数据表和契约测试后才能实现。

## 数据迁移

本阶段不写入业务数据库、不导入历史素材、不扫描 NAS。正式实施计划必须单独定义历史台账预览、幂等键、容量、失败回滚和数据中心兼容策略。

## 风险与回滚

- 风险：书面规则与业务预期不一致。观测方式是业务负责人对 PRD 和设计书逐项复核；修正方式是只改规格，不产生代码迁移成本。
- 风险：数据中心契约尚未落地。当前仅定义品牌 App 的消费要求，不把计划中接口宣称为已连接能力。
- 风险：NAS 能力被误解为官方 MCP。注册表明确官方未提供 MCP Server，首版使用 SMB/WebDAV 与只读索引器。
- 回滚：删除本功能目录和绿联 NAS 计划中注册项即可恢复基线，不影响任何运行页面。

## 验证命令

- `npm run check:governance`：四份功能文档齐全且没有未完成标记。
- `npm run check:integrations`：集成注册表结构与关系有效。
- `git diff --check`：Markdown 与 JSON 没有空白错误。
- `npm test`：独立 worktree 基线测试保持通过。

## 任务顺序

1. 完成仓库、历史业务任务、数据中心边界、绿联 NAS 官方能力和视觉结构调研。
2. 编写并自检 PRD、设计书和集成登记。
3. 提交规格，等待业务负责人复核书面文件。
4. 业务负责人确认后，使用正式实施计划流程替换本计划，并在业务代码前定义完整任务与失败测试。
