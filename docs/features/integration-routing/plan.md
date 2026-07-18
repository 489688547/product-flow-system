# 外部平台集成路由实施计划

## 变更范围

- 新增公开注册表、校验器和路由器。
- 新增项目技能、AGENTS 预检、PR 字段和 CI 检查。
- 新增内部资料 D1 API、授权、校验与审计。
- 新增说明书平台地图、内部资料合并与管理员编辑。
- 更新平台目录、API、错误码和架构决策。

## 接口与数据

- 公开：`docs/platform/integration-registry.json`。
- API：`GET/PUT /api/platform/v1/integrations`。
- D1：`integration_private_profiles` 与 `integration_profile_audit`，均为旁路新表。
- 前端：领域层完成过滤和公开/内部合并，状态层负责网络请求，功能层负责展示。

## 迁移、兼容与回滚

API 首次请求幂等建表，无需改动旧表。旧版本不读取新表，因此向后兼容。回滚代码时保留新表；若 CI 误阻断，单独回退工作流检查步骤。

## 验证

- 先为注册表、路由、CI、API 和领域合并逻辑写失败测试。
- 然后实现最小代码使测试通过。
- 最后运行 lint、治理检查、全部测试、构建和浏览器视觉审计。
