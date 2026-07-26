# 供应链共享平台 API 实施计划

## 目标

补齐供应链 13 个用户故事依赖的共享事实与版本化工作流，使供应链 App 只通过 `/api/platform/v1/...` 读取和写入，并完成 GitOps 生产交付。

## 实施顺序

### 任务 1：锁定契约、迁移与领域规则

- 新增供应链平台 API feature 文档。
- 新增迁移与展示数据策略。
- 为工作流资源、动作、部门权限、敏感字段和状态转换写失败测试。
- 实现纯领域规则与安全 payload 规范化。

### 任务 2：库存 current/history/filter/quality

- 为最新完整快照、历史过滤、游标、金额权限和质量状态写失败测试。
- 扩展 goods-flow inventory storage 与 route。
- 更新 goods-flow API 文档和错误契约。

### 任务 3：销售日需求

- 为固定 contract、日级 grain、平台排除、商品映射、缺失退款件数/促销覆盖和游标写失败测试。
- 新增 data-services sales daily route 与 storage。
- 更新销售数据服务文档。

### 任务 4：采购、付款、供应商、质量与售后

- 为 legacy 状态与 goods-flow events 的安全投影写失败测试。
- 新增五个只读集合路由，共用授权、分页和质量 helper。
- 严格移除客户、订单、原始 payload 和凭据。

### 任务 5：统一数据任务

- 为网页采集、ERP 批次、失败和人工恢复状态写失败测试。
- 新增 control-plane 只读聚合路由。
- 保持 businessDb 与 control DB 使用边界。

### 任务 6：版本化供应链工作流

- 为创建、列表、部门权限、幂等、乐观版本、非法动作、归档和审计写失败测试。
- 实现 D1 storage、通用资源 route 和 action route。
- 外部动作只记录 `pending_manual` 恢复状态，不伪造 Provider 成功。

### 任务 7：规则写回与环境能力

- 更新 API catalog、错误码、集成注册表、环境能力和生成模块。
- 更新迁移、展示数据 catalog、Pages compatibility 和容量/回滚说明。
- 更新 tasks 复选项。

### 任务 8：验证、合并与生产验收

- 运行聚焦测试和 Definition of Done 全量门禁。
- 更新到最新 `origin/main`，再跑 `check:branch-base`。
- 创建 PR，声明 `Integration-Impact` 与 `Rule-Writeback`。
- required checks 通过后合并到 `main`。
- 记录 D1 Time Travel 书签，按批准迁移应用新增表。
- 等待 Cloudflare Git 部署成功，运行生产 readiness 与 executive 会话只读验收。
- 通知供应链消费分支联调，关闭 DEV-000005/006 仅在各自验收范围真实完成后执行。

## 验证命令

```bash
node --test tests/supply-chain-platform-data-api.test.mjs
node --test tests/supply-chain-workflows-api.test.mjs
node --test tests/goods-flow-api.test.mjs tests/goods-flow-storage.test.mjs
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
npx wrangler pages functions build
npm run check:branch-base
```
