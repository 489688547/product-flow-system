# 绩效管理 App 实施计划

## 目标

交付独立绩效管理 App，完成周期模板、个人方案、业务证据、自评、建议分、主管评估、一次复核和人事冻结。

## 架构方案

`src/domain/performanceManagement.js` 保存纯状态机、计分、权限和冻结规则；`src/state` 编排 API 和证据；`src/features/performance-management` 组合五个工作区；`functions/api/performance-management*` 执行服务端授权、D1 记录存储和审计。敏感数据不写 localStorage，业务证据通过稳定引用读取。

## 文件职责

- `src/domain/performanceManagement.js`：实体、权重、建议分、差异、状态流转和权限。
- `src/state/performanceManagementApi.js`、`PerformanceManagementProvider.jsx`：读取、动作、证据和错误状态。
- `functions/api/performance-management.js`、`actions.js`、`_shared/storage.js`：范围过滤、动作权限、D1 和审计。
- `src/features/performance-management/*`：五个页面和证据/评分组件。
- App 壳、权限和注册：独立导航与 Provider。
- `react-tests/performance-management*.test.mjs`、`tests/performance-management-api.test.mjs`：领域、UI、权限和 API。

## 接口与契约

- `GET /api/performance-management?cycle=`：服务端按人事、主管、员工范围过滤。
- `POST /api/performance-management/actions`：接收 `{ type, entityId, expectedVersion, payload }`。
- 动作包括 `upsert_cycle`、`upsert_template`、`publish_plan`、`submit_self_assessment`、`submit_manager_assessment`、`confirm_result`、`request_review`、`resolve_review`、`freeze_plan`、`append_correction`。
- `calculateSuggestedScore(item, evidence)` 仅在规则和数据完整时返回 `{ score, formula, calculatedAt }`，否则返回 `{ score: null, reason }`。
- 证据引用采用 `{ sourceAppId, entityType, entityId, version, ownerId, accepted, summary, observedAt }`。

## 数据迁移

新增 `performance_entities`、`performance_snapshots`、`performance_audit_logs`。不迁移旧表格，不存业务原始响应；冻结数据为只读快照，后续更正追加记录。

## 风险与回滚

- 敏感数据泄漏：服务端过滤、记录级动作授权、禁止 localStorage。
- 任务等同绩效：建议分必须检查验收标准，主观项不自动计分。
- 评分覆盖：乐观版本与冻结快照阻断。
- 范围扩张：一期不做薪酬考勤招聘；功能开关可独立关闭。

## 验证命令

```bash
node --test react-tests/performance-management*.test.mjs
node --test tests/performance-management-api.test.mjs
npm run lint
npm run check:governance
npm run check:integrations
npm test
npm run build
```

浏览器覆盖人事、主管、员工、空错禁用、无建议分、复核、冻结、响应式和钉钉 WebView。

## 任务顺序

1. 领域模型、计分、状态机和权限。
2. D1、范围过滤、动作 API、审计与冻结。
3. 电商运营绩效证据契约。
4. Provider、App 注册和五个路由。
5. 方案、自评、主管评分、复核与归档 UI。
6. 响应式、无障碍、耐久文档与完整验证。
