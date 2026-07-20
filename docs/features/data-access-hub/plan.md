# 统一数据接入中心实施计划

## 技术方案

在前端新增纯分类映射和数据中心局部卡片组件，由 `DataConnectionsWorkspace` 组合现有数据连接器、平台连接和内部保险箱。平台连接 API、凭据保险箱 API、D1 数据结构与 provider adapter 均保持不变。

## 文件边界

- `src/domain/dataAccessCatalog.js`：三类定义及来源映射。
- `src/features/data-center/connections/DataAccessTabs.jsx`：分类导航与键盘行为。
- `src/features/data-center/connections/DataAccessCard.jsx`：统一卡片外壳。
- `src/features/data-center/connections/DataConnectionsWorkspace.jsx`：统一页面编排。
- `src/features/data-center/connections/ConnectorCatalog.jsx`：支持传入筛选后的定义。
- `src/features/data-center/connections/InternalVaultWorkspace.jsx`：支持从公司数据卡片进入指定类型。
- `src/features/data-center/PlatformConnectionsWorkspace.jsx`：支持平台过滤与嵌入详情。
- `src/App.jsx`、`DataCenterAppPage.jsx`、`EnvironmentReadinessPanel.jsx`：导航、旧路由和入口文案。
- `src/styles.css`、`platform-connections.css`：卡片目录、详情和响应式样式。
- `PRODUCT.md`、`DESIGN.md`、`docs/platform/integrations.md`：长期规则回写。

## 实施顺序

1. 先写分类、导航兼容和目录去重的失败测试。
2. 新增纯分类模块并移除独立导航入口。
3. 新增分类导航和统一卡片外壳。
4. 改造电商平台目录，使快麦只进入 ERP。
5. 将快麦平台连接和同步实例组合为单卡详情。
6. 将钉钉、阿里云和内部系统类型组合为公司数据目录。
7. 补齐加载、错误、权限、焦点恢复和响应式状态。
8. 更新长期产品、设计、平台集成文档和 PR 声明。
9. 执行完整验证并在部署后检查真实数据接入页；不执行任何真实钉钉、快麦或阿里云写动作。

## 迁移与回滚

- 数据迁移：无。
- 环境配置：无。
- API 兼容：现有 `/api/platform/v1/platform-connections` 和 `/api/platform/v1/credential-vault` 不变。
- 路由兼容：旧 `data-connections` 映射到数据接入的公司数据分类。
- 回滚：恢复前端导航与组件版本；数据库和凭据无需回滚。

## 验证

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

另外验证 1440px、900px、640px 和 390px；检查键盘切换、焦点恢复、只读、错误、禁用、空状态和钉钉 WebView。
