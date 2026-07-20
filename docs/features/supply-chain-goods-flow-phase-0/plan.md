# 供应链管理货流升级实施计划

## 目标

在不新增重复业务 App、不中断现有供应链页面的前提下，交付可追溯的库存日快照、月度盘点校准、库存资金和 CCC 月度计算，并为多个 App 提供统一只读货流契约。

## 当前阶段

本文件记录经确认的实施边界和依赖顺序。详细到函数、测试用例和逐提交范围的执行计划，在书面设计复核通过后按仓库计划流程补充；在此之前不修改业务行为。

## 架构方案

- 决策：供应链管理保留唯一业务入口，底层抽取独立货流数据平台。
- 领域规则放入独立纯领域模块；provider payload 不进入领域层。
- D1 通过追加式事件、每日库存投影、月度指标版本和异常队列保存事实。
- `/api/platform/v1/goods-flow/*` 提供稳定多消费者契约；现有 `/api/supply-chain` 在迁移期保持兼容。
- 钉钉、快麦和 ERP 文件分别经过服务端 adapter；功能页面只调用状态/API 客户端。

## 预期文件职责

- `src/domain/goodsFlow/`：库存校准、账期版本、CCC、覆盖率和异常规则。
- `src/state/goodsFlowStore.js`：读模型、写动作、错误和乐观版本编排。
- `src/features/supply-chain/`：合并后的左侧 Tab、驾驶舱、库存、盘点和现金循环页面。
- `functions/api/platform/v1/goods-flow/`：认证、权限、导入、盘点、指标和查询路由。
- `functions/api/platform/_shared/`：只放经证明可复用的幂等、审计或 provider adapter 边界。
- `migrations/`：使用实施开始时下一个可用序号创建货流核心表，避免与并行分支迁移编号冲突。
- `tests/`：领域公式、API 契约、迁移、兼容投影、权限和页面交互测试。
- `docs/platform/`：API、环境能力、集成注册、错误码和可观测性契约。

## 接口与契约

计划中的 v1 资源：

- `GET /api/platform/v1/goods-flow/dashboard`
- `GET /api/platform/v1/goods-flow/inventory`
- `POST /api/platform/v1/goods-flow/imports`
- `GET|POST /api/platform/v1/goods-flow/stocktakes`
- `POST /api/platform/v1/goods-flow/stocktakes/:id/transitions`
- `GET|PUT /api/platform/v1/goods-flow/receivable-terms`
- `GET /api/platform/v1/goods-flow/ccc`
- `POST /api/platform/v1/goods-flow/ccc/:month/recalculate`
- `POST /api/platform/v1/goods-flow/ccc/:month/freeze`
- `GET /api/platform/v1/goods-flow/exceptions`

所有响应包含请求 ID；涉及数据的响应包含来源时间、覆盖率和版本。写操作使用业务幂等键与乐观版本。稳定错误码、分页、超时、重试和权限矩阵在 API 契约文档中固定。

## 数据迁移

1. 创建旁路表，不改动或删除现有供应链状态表。
2. 从现有供应商、采购付款、库存盘点和销售聚合生成只读迁移预览。
3. 对商品/SKU/69 码、采购付款和库存数量输出对账报告。
4. 只有对账通过的数据进入事件与投影；无法匹配的记录进入异常队列。
5. 页面先通过功能开关读取新投影，保留旧 API 回退。
6. 稳定观察后才停止向旧库存资金投影增加新字段；历史数据继续可读。

## 风险与回滚

- 商品主键未统一：阻止金额分摊并进入异常队列，不按名称猜测。
- 盘点锚点与 ERP 修正重复：按来源事件和盘点区间对账，发现重复时停止重算。
- CCC 看似完整但来源缺失：覆盖不足时不显示完整等级，不以零补齐。
- 快麦库存接口不可用：继续使用 ERP/文件快照，不影响销售同步。
- D1 容量或查询延迟：按日期、SKU、仓库建立索引，日/月投影避免驾驶舱扫描原始事件。
- 新读模型异常：关闭功能开关，恢复现有供应链 API 和页面；新表保留、不继续写入。

## 验证命令

每个实施任务执行聚焦测试；合并前从仓库根目录执行：

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

涉及部署后，分别验证本地、Preview 和 Production，并对所有路由平台执行生产就绪检查。Preview 通过不能替代 Production 验证。

## 任务顺序

1. 固化领域公式、数据契约和错误码，并先写失败测试。
2. 增加 D1 迁移、环境能力和存储契约。
3. 建立商品主键与现有供应链状态兼容投影。
4. 实现 ERP/文件、钉钉采购付款和销售成本进入事件层的适配。
5. 实现库存日投影、月度盘点和校准规则。
6. 实现平台账期、CCC 计算、版本和冻结。
7. 升级供应链左侧导航及驾驶舱、库存、盘点和现金循环页面。
8. 完成迁移预览、真实数据对账、响应式和钉钉 WebView 验收。
9. 运行完整质量门，记录集成影响、规则回写、部署与回滚证据。
