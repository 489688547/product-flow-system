# 架构决策：公开注册表与内部覆盖层分离

## 状态

已接受

## 背景

项目接触钉钉、快麦、Cloudflare、阿里云及多个计划平台。平台能力、接入状态、代码边界和内部控制台资料曾分散在代码、文档与历史任务中，导致后续开发无法稳定路由到正确平台。仓库可以公开，但控制台、账号主体、负责人和内部运行手册只应对已登录员工可见。

## 决策

- `docs/platform/integration-registry.json` 是公开平台元数据的唯一事实源。
- Codex 项目技能、AGENTS 预检、PR/CI 影响检查和说明书平台地图读取同一注册表。
- 内部资料按平台 ID 存入 D1 的 `integration_private_profiles`，通过 `/api/platform/v1/integrations` 读取和维护。
- 公开层和内部层均禁止保存密钥、令牌、Cookie、密码、私钥和原始敏感响应。
- 内部写操作记录在 `integration_profile_audit`；审计只保存平台、动作、字段名、操作者和时间。
- 生命周期固定为已连接、集成中、计划中、已停用。集成中必须有仓库证据，计划中不能视为已可用，已停用默认禁止新增依赖。

## 备选方案

1. 仅维护 Markdown 文档：阅读友好，但无法可靠驱动路由、CI 和界面，未采用。
2. 全部资料写入仓库：实现简单，但会暴露内部账号和控制台边界，未采用。
3. 全部资料写入数据库：权限清楚，但分支和 CI 无法在代码审查前获得稳定公开事实，未采用。

## 后果

收益是平台知识能主动参与编码和审查，同时保证公司内部资料仍在认证边界内。成本是公开注册表与内部覆盖层需要分别维护，并需要在能力、代码路径或平台状态变化时同步更新注册表。D1 API 不可用时，员工仍能查看公开地图，但内部入口和责任信息暂不可见。

## 兼容与迁移

新增两张旁路 D1 表，不改变现有业务表或 API。首次 API 请求幂等建表；旧版本不会读取这些表。回滚应用时可保留表；如 CI 误阻断，可独立回退 `check:integrations` 工作流步骤，不删除注册表数据。

## 关联与替代

本文关于公开注册表和 `integration_private_profiles` 禁止保存敏感值的结论继续有效。2026-07-19 新增的加密凭证保险箱是独立存储与权限边界，不属于公开注册表或内部平台资料，见 `docs/decisions/2026-07-19-encrypted-credential-vault.md`。

- PRD：`docs/features/integration-routing/prd.md`
- 交互设计：`docs/features/integration-routing/design.md`
- API 目录：`docs/platform/api-catalog.md`
- 外部平台目录：`docs/platform/integration-registry.json`
