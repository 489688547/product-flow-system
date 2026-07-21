# 用户洞察实施计划

## 目标

交付数据中心“用户洞察”完整纵向切片：浏览器采集器注册与批次契约、D1 标准事实、部门/App 规则、类目确认、竞品候选、参考建议、共享查询 API，以及店铺/产品双视角界面。真实平台采集采用适配器和固定夹具验证，生产登录页面单独验收。

## 架构方案

- `src/domain/userInsights.js` 保存纯业务规则、标准模型、可比字段、覆盖率、候选状态和建议降级。
- `src/state/userInsightsApi.js` 与 `UserInsightsProvider.jsx` 负责共享 API、缓存、筛选和命令编排。
- `src/features/data-center/UserInsightsWorkspace.jsx` 负责数据中心页面组合，不直接访问平台或计算领域结论。
- `/api/platform/v1/user-insights...` 提供查询、类目、规则、竞品和采集批次能力；共享授权、存储和校验置于该路由的 `_shared`。
- 本地浏览器采集器置于 `scripts/user-insights-collector/`，只消费已登记来源和已确认类目；平台适配器用固定夹具测试，不读取浏览器密钥存储。
- D1 保存标准事实、映射、规则、竞品、同步、设备令牌哈希和审计；原始结构化页面快照只保存到本机受控目录。

共享能力结论：数据中心、产品全周期和电商店铺运营三个真实消费者共用领域与 API 契约；页面布局和功能组件保留在数据中心 feature 内。

## 文件职责

- `src/domain/userInsights.js`：默认状态、范围、平台可比性、覆盖率、建议、类目/规则/竞品状态转换。
- `src/state/userInsightsApi.js`、`src/state/UserInsightsProvider.jsx`：API URL、读写、错误映射、筛选状态和刷新。
- `src/features/data-center/UserInsightsWorkspace.jsx`、`user-insights.css`：双视角、平台范围、三个 Tab、状态与响应式。
- `src/App.jsx`、`DataCenterAppPage.jsx`：导航与页面装配。
- `functions/api/platform/v1/user-insights/**`：HTTP、认证、授权、校验、存储、资源和 ingest 路由。
- `scripts/user-insights-collector/**`：登记范围读取、工作日调度、适配器、结构校验、哈希和批次上传。
- `migrations/0005_user_insights.sql`：新增用户洞察表、索引和元数据。
- `docs/platform/*`：API 契约、浏览器采集规则、集成登记、环境能力和生成清单。
- `react-tests/user-insights*.test.mjs`、`tests/user-insights*.test.mjs`：领域、UI、API、迁移和采集器测试。

## 稳定契约

- `GET /api/platform/v1/user-insights`：按视角、平台、店铺/产品/SKU、类目和日期查询最后成功快照、质量、竞品和建议。
- `GET|POST|PATCH /api/platform/v1/user-insights/category-mappings`：推荐、确认和停用类目。
- `GET|POST|PATCH /api/platform/v1/user-insights/rules`：规则草稿、复制、发布、停用和版本冲突。
- `GET|POST|PATCH /api/platform/v1/user-insights/competitors`：人工核心竞品、候选确认、驳回和停用。
- `GET|POST /api/platform/v1/user-insights/collector`：采集器读取限定任务和回报在线状态。
- `POST /api/platform/v1/user-insights/ingest`：批次开始、记录、完成和失败；哈希设备令牌和幂等键校验。

所有响应包含 `synced`、范围、数据质量或稳定错误代码。普通用户会话和采集设备令牌不能互相替代。

## 数据迁移

新增：

- `user_insight_category_mappings`
- `user_insight_rules`
- `user_insight_snapshots`
- `user_insight_entities`
- `user_insight_competitors`
- `user_insight_sync_runs`
- `user_insight_runner_tokens`
- `user_insight_audit_logs`
- `user_insight_meta`

所有业务表使用稳定 ID、JSON payload、版本和更新时间；快照及实体增加平台/店铺/类目/维度/范围索引。设备表只保存令牌哈希。迁移只新增结构；回滚关闭功能与采集，不删除历史数据。

## TDD 顺序

1. 领域模型与测试：先固定状态、可比性、覆盖率、规则复制、候选确认和建议降级。
2. 迁移与存储测试：先证明缺表和授权失败，再实现 D1 读写、版本和审计。
3. API 测试：查询、类目、规则、竞品、采集设备、幂等和错误。
4. 采集器测试：工作日、允许范围、登录页、结构变化、缺失字段和内容哈希。
5. Provider 与客户端测试：URL、读取、命令、缓存和稳定错误。
6. UI 测试：导航、双视角、范围、三个 Tab、确认流程与完整状态。
7. 平台文档、环境清单和生成模块。
8. 全量自动、视觉与 WebView 验证。

## 风险与控制

- 平台页面变化：每个适配器声明结构版本，变化即停止写入并保留最后成功快照。
- 登录或风控：识别登录页后返回 `login_required`，不尝试绕过或采集页面内容。
- 多平台误合并：标准模型显式声明共同和平台特有字段，领域测试禁止不可比指标聚合。
- 规则越权：规则绑定消费 App 和部门，复制产生新 ID；API 版本与授权双重校验。
- 凭证泄露：代码、请求和 D1 模型禁止密码、Cookie、Token、验证码和完整页面内容；设备令牌只保存哈希。
- 批次重复/部分写入：幂等键、批次状态和事务式完成语义；失败不替换最后成功快照。
- D1 容量：标准实体按范围覆盖并设上限；原始快照留本机，服务端不保存 HTML/截图。

## 回滚

1. 关闭 `userInsights` 功能开关和采集任务。
2. 导航不再显示 `data-insights`，其他数据中心页面继续工作。
3. API 保持只读或返回功能未启用；采集入口拒绝新批次。
4. 新表和审计数据保留，便于恢复；不回滚或删除其他业务数据。
5. 无新环境变量；D1 表能力从就绪检查移除需与代码和清单同批回滚。

## 验证命令

```bash
node --test react-tests/user-insights-domain.test.mjs
node --test react-tests/user-insights-ui.test.mjs react-tests/user-insights-provider.test.mjs
node --test tests/user-insights-api.test.mjs tests/user-insights-migration.test.mjs tests/user-insights-collector.test.mjs
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

视觉检查覆盖 1440、1280、900、640、390px，键盘、焦点、空/错/禁用/只读/部分/过期，以及钉钉 WebView。真实平台生产采集在部署授权后另行验收，不进入 CI。
