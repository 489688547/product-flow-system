# 研发待办技术计划

## 架构

- `src/domain/developmentBacklog.js` 保存纯状态机、权限、路径和冲突规则。
- `/api/platform/v1/development-backlog` 提供鉴权列表、详情、写入和动作。
- `PRODUCT_FLOW_DB` 保存 `development_backlog_items` 与只追加的 `development_backlog_events`。
- 浏览器通过 `src/state/developmentBacklogApi.js` 调用 API，不直连 D1 或 AI Provider。
- AI 草稿使用 `company-platform/development-backlog-draft` 和共享 `invokeAiFeature`。

## 迁移与容量

`0014_development_backlog.sql` 只新增两张表和查询索引。列表服务端分页，事件只在详情读取。两张表在展示目录登记 `skip`。

## 并发

所有写入携带 `expectedVersion`，SQL 使用 `WHERE id = ? AND version = ?`。认领时重新读取活跃范围并在写入前检查冲突；冲突和版本不一致均返回 `409`。

## 回滚

回滚页面和 API 时保留表与事件，不自动删除内部路线图数据。需要移除数据时先受控导出并由总经办确认。

## 验证

覆盖领域、迁移、API、AI 边界、客户端、导航、权限、响应式和全量治理门禁；生产通过 GitOps 部署后分别验证真实鉴权读取、创建、认领、冲突和 AI 不可用路径。
