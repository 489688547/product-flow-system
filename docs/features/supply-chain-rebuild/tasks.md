# 供应链管理重做执行任务

## 执行规则

- 每项任务只交付一个可独立验证的结果。
- 先写失败测试并确认失败原因，再写实现。
- 完成后记录实际验证命令和结果。
- 每次提交只包含当前任务文件。
- 所有 13 个用户故事必须在“场景追踪”中具备页面、契约和测试证据。
- `DEV-000005` 未交付的数据只允许显示缺口，不允许构造假事实。

## 任务

- [x] 任务 1：建立 8 个工作区导航与领域骨架
  - 依赖：无。
  - 文件：`src/App.jsx`、`src/domain/supplyChainWorkflow.js`、`src/features/supply-chain/SupplyChainAppPage.jsx`、`react-tests/sidebar-navigation.test.mjs`、`react-tests/supply-chain.test.mjs`。
  - 输入：确认的导航和角色规则。
  - 输出：新路由、旧路由兼容、纯领域状态枚举。
  - 失败测试：新导航顺序、旧 screen 映射和领域状态测试先失败。
  - 实现步骤：定义工作区 → 更新导航 → 抽离 App 装配 → 兼容旧路由。
  - 验证：`node --test react-tests/sidebar-navigation.test.mjs react-tests/supply-chain.test.mjs react-tests/supply-chain-ui.test.mjs`，34/34 通过；`npm run lint`、`npm run build` 通过。
  - 提交：`feat(supply-chain): establish workflow workspaces`。

- [x] 任务 2：实现共享事实消费客户端
  - 依赖：任务 1；`DEV-000005` 契约可分阶段就绪。
  - 文件：`src/state/supplyChainDataApi.js`、`react-tests/supply-chain-data-contract.test.mjs`。
  - 输入：产品目录、库存、销售、采购付款、质量售后和任务 API。
  - 输出：统一数据与 `trusted/partial/stale/unavailable` 质量状态。
  - 失败测试：认证错误、部分覆盖、过期、游标和契约缺失状态先失败。
  - 实现步骤：安全请求 → 响应校验 → 质量归一 → 聚合加载 → 取消与重试。
  - 验证：`node --test react-tests/supply-chain-data-contract.test.mjs`，5/5 通过；供应链聚焦回归 39/39、`npm run lint` 通过。
  - 提交：`feat(supply-chain): consume shared supply facts`。

- [ ] 任务 3：实现角色工作台
  - 依赖：任务 1、2。
  - 文件：`src/domain/supplyChainWorkflow.js`、`src/features/supply-chain/SupplyChainWorkbench.jsx`、`src/styles.css`、`react-tests/supply-chain-ui.test.mjs`。
  - 输入：责任配置、采购、库存、质量和数据问题。
  - 输出：我的待处理、即将逾期、数据问题和主管范围切换。
  - 失败测试：多岗位、无人负责、交叉冲突和只读角色测试先失败。
  - 实现步骤：任务归一 → 优先级 → 角色裁剪 → 状态 UI → 操作入口。
  - 验证：聚焦测试、键盘和 1440/390px。
  - 提交：`feat(supply-chain): add role workbench`。

- [ ] 任务 4：实现产品与采购批次货流进度
  - 依赖：任务 2。
  - 文件：`src/domain/supplyChainWorkflow.js`、`src/features/supply-chain/GoodsFlowProgress.jsx`、`src/features/supply-chain/TransitWorkspace.jsx`、`src/styles.css`、`react-tests/supply-chain-ui.test.mjs`。
  - 输入：采购、付款、里程碑、质检和收货事实。
  - 输出：产品汇总、批次时间线、当前/逾期/等待/不适用状态。
  - 失败测试：缺节点不反推、逾期、多个批次、减少动效先失败。
  - 实现步骤：节点模型 → 产品聚合 → 时间线 → 动效与无障碍。
  - 验证：聚焦测试、`prefers-reduced-motion`、1180/390px。
  - 提交：`feat(supply-chain): visualize goods flow progress`。

- [ ] 任务 5：实现库存预警与采购建议
  - 依赖：任务 2、3。
  - 文件：`src/domain/supplyChainWorkflow.js`、`src/features/supply-chain/PlanningWorkspace.jsx`、`src/styles.css`、`react-tests/supply-chain.test.mjs`、`react-tests/supply-chain-ui.test.mjs`。
  - 输入：库存、需求、同比、活动、周期、MOQ、产能和 BOM。
  - 输出：断货、爆单、清仓预警与可解释采购建议。
  - 失败测试：部分覆盖、共用物料、MOQ、产能、人工调整原因先失败。
  - 实现步骤：风险分类 → 建议计算 → 依据展示 → 调整预览 → 确认边界。
  - 验证：聚焦测试与缺数据/过期状态。
  - 提交：`feat(supply-chain): build procurement planning`。

- [ ] 任务 6：实现采购、付款、生产与收货闭环
  - 依赖：任务 4、5；平台工作流写契约。
  - 文件：`src/domain/supplyChainWorkflow.js`、`src/features/supply-chain/ProcurementWorkspace.jsx`、`src/features/supply-chain/TransitWorkspace.jsx`、`src/state/supplyChainApi.js`、对应测试。
  - 输入：采购建议、钉钉采购付款、ERP 采购和收货。
  - 输出：独立采购/付款实体、责任、提醒、人工 ERP 待办、批次结案。
  - 失败测试：重复提交、付款错配、无责任、外部失败和版本冲突先失败。
  - 实现步骤：领域状态 → API 适配 → 表单 → 节点动作 → 恢复提示。
  - 验证：权限、失败、超时、幂等和兼容测试。
  - 提交：`feat(supply-chain): close procurement workflow`。

- [ ] 任务 7：实现供应商、报价与成本管理
  - 依赖：任务 2、6。
  - 文件：`src/domain/supplyChainWorkflow.js`、`src/features/supply-chain/SupplierWorkspace.jsx`、`src/features/supply-chain/CostFinanceWorkspace.jsx`、对应测试。
  - 输入：供应商、采购、质量、报价和 BOM。
  - 输出：能力筛选、寻源、ABC、集中风险、价格历史、比价和成本预警。
  - 失败测试：多主体、敏感字段、供应商×产品评价、缺成本和涨价先失败。
  - 实现步骤：读模型 → 筛选 → 详情 → 成本计算 → 风险与建议。
  - 验证：权限裁剪、掩码、空/部分覆盖和表格键盘。
  - 提交：`feat(supply-chain): govern suppliers and costs`。

- [ ] 任务 8：实现库存、盘点、BOM 与清仓
  - 依赖：任务 2、5。
  - 文件：`src/features/supply-chain/InventoryWorkspace.jsx`、`src/domain/supplyChainWorkflow.js`、对应测试。
  - 输入：当前/历史库存、仓库、BOM、盘点和销售需求。
  - 输出：多仓库存、理论/实盘、盈亏、低库存盘点时机和清仓建议。
  - 失败测试：current/history、超 5%、多仓缺失、供应商自带物料和清仓规则先失败。
  - 实现步骤：消费 current API → 盘点状态 → BOM 下钻 → 异常/清仓。
  - 验证：聚焦测试与真实只读库存。
  - 提交：`feat(supply-chain): complete inventory controls`。

- [ ] 任务 9：实现质量标准与质检执行
  - 依赖：任务 2。
  - 文件：`src/domain/supplyChainWorkflow.js`、`src/features/supply-chain/QualityWorkspace.jsx`、对应测试。
  - 输入：产品、标准、计划、批次和评价售后摘要。
  - 输出：双形态标准、首批/抽检、外购/自产、三态记录。
  - 失败测试：标准缺失、客观判断、图片依据、应检未检和先入库例外先失败。
  - 实现步骤：标准版本 → 清单 → 计划 → 执行 → 结果与留痕。
  - 验证：角色、空/错误、文件状态和键盘流程。
  - 提交：`feat(supply-chain): deliver quality inspection`。

- [ ] 任务 10：实现质量问题和供应商质量评价
  - 依赖：任务 7、9。
  - 文件：`src/domain/supplyChainWorkflow.js`、`src/features/supply-chain/QualityWorkspace.jsx`、`src/features/supply-chain/SupplierWorkspace.jsx`、对应测试。
  - 输入：质检、售后、评价、整改、采购和价格。
  - 输出：六步闭环、紧急响应、责任建议、三方评价和单品淘汰建议。
  - 失败测试：多来源、定性分流、48 小时、下一批验证和三方不平均先失败。
  - 实现步骤：问题归一 → 定性 → 处置 → 整改 → 验证 → 评价聚合。
  - 验证：聚焦测试和完整问题详情交互。
  - 提交：`feat(supply-chain): close quality incidents`。

- [ ] 任务 11：实现财务联动与快递费核对
  - 依赖：任务 6、7。
  - 文件：`src/domain/supplyChainWorkflow.js`、`src/features/supply-chain/CostFinanceWorkspace.jsx`、对应测试。
  - 输入：采购、付款、收货、快递报价和 ERP 理论运费。
  - 输出：应收、应付、在途资产、月度差异报告和申诉明细。
  - 失败测试：付款已付未交、已下单未付、重复账单、费率版本和差异阈值先失败。
  - 实现步骤：资产分类 → 逐单关联 → 费率解析结果消费 → 差异 → 报告。
  - 验证：金额权限、月度范围和审计。
  - 提交：`feat(supply-chain): reconcile cash and freight`。

- [ ] 任务 12：完成数据与规则、兼容迁移和全量验收
  - 依赖：任务 1—11。
  - 文件：`src/features/supply-chain/DataRulesWorkspace.jsx`、`SupplyChainAppPage.jsx`、文档与全部测试。
  - 输入：覆盖、任务、规则版本、旧路由和旧状态。
  - 输出：统一数据缺口、规则入口、旧记录兼容和 13 场景验收证据。
  - 失败测试：旧路由、旧记录、API 不可用、过期、部分覆盖和无权限先失败。
  - 实现步骤：数据规则页 → 兼容适配 → 场景追踪 → 响应式与 WebView → 完整门禁。
  - 验证：DoD 六项命令、浏览器视觉、钉钉 WebView 和真实只读数据。
  - 提交：`feat(supply-chain): finish end-to-end rebuild`。

## 场景追踪

| 场景 | 对应任务 | 状态 | 页面证据 | API 证据 | 测试证据 |
| --- | --- | --- | --- | --- | --- |
| 1 库存监控与预警 | 3、5 | 待开发 | — | `inventory`、`sales/daily` | — |
| 2 采购下单与跟进 | 4、5、6、8 | 待开发 | — | `purchases`、`payments` | — |
| 3 供应商管理 | 7、10 | 待开发 | — | `suppliers` | — |
| 4 价格与成本 | 7、11 | 待开发 | — | 商品成本、采购事实 | — |
| 5 跨部门协同 | 3、6、10 | 待开发 | — | 公司协同中心 | — |
| 6 仓储与库存 | 8 | 待开发 | — | `inventory current/history` | — |
| 7 质量标准 | 9 | 待开发 | — | 供应链工作流契约 | — |
| 8 质检执行 | 9 | 待开发 | — | `quality-incidents` | — |
| 9 质量问题闭环 | 10 | 待开发 | — | `quality-incidents/aftersales` | — |
| 10 供应商质量评价 | 7、10 | 待开发 | — | `suppliers`、质量事实 | — |
| 11 应收应付 | 6、11 | 待开发 | — | `purchases/payments` | — |
| 12 清仓建议 | 5、8 | 待开发 | — | `inventory`、`sales/daily` | — |
| 13 快递费核对 | 11 | 待开发 | — | 供应链费用工作流契约 | — |
