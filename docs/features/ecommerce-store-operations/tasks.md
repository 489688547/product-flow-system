# 电商店铺运营 App 执行任务

## 执行规则

- 每项任务只交付一个可独立验证的结果。
- 先写失败测试并确认失败原因，再写实现。
- 完成后记录实际验证命令和结果。
- 每次提交只包含当前任务文件。

## 任务

- [x] 产品与设计规格
  - 依赖：数据中心 Phase 1 完成。
  - 文件：`docs/features/ecommerce-store-operations/{prd,design,plan,tasks}.md`。
  - 输入：用户确认的结构化经营闭环、AI 边界、跨部门接受/退回和合并工作台。
  - 输出：可评审的业务、交互、架构、迁移和验收契约。
  - 失败测试：治理检查在功能目录缺失时不能覆盖本功能。
  - 实现步骤：调研现有 App 与数据中心边界；路由集成影响；固化规格并自审。
  - 验证：`npm run check:governance`。
  - 提交：`docs(ops): design ecommerce operations app`。

- [ ] 领域模型
  - 依赖：书面规格复核。
  - 文件：`src/domain/ecommerceOperations.js`、`react-tests/ecommerce-operations-domain.test.mjs`。
  - 输入：产品月度周期、平台店铺子方案和组织身份。
  - 输出：归一化、完整度、状态机、权限、版本、摘要和方法沉淀纯函数。
  - 失败测试：导入不存在的领域模块，确认预期红灯。
  - 实现步骤：实体默认值；问题链校验；审批/执行/复盘流转；角色范围；摘要。
  - 验证：领域测试全部通过。
  - 提交：`feat(ops): add ecommerce operations domain`。

- [ ] D1 与动作 API
  - 依赖：领域模型。
  - 文件：`functions/api/ecommerce-operations.js`、`functions/api/ecommerce-operations/actions.js`、`functions/api/ecommerce-operations/_shared/storage.js`、`tests/ecommerce-operations-api.test.mjs`、`package.json`。
  - 输入：领域动作、当前钉钉会话和 `PRODUCT_FLOW_DB`。
  - 输出：范围读取、记录级动作、版本冲突、权限和审计。
  - 失败测试：API 路由不存在或未拒绝越权、只读和旧版本写入。
  - 实现步骤：建表；实体读写；服务端动作；权限矩阵；409/403/501；契约测试。
  - 验证：新 API 与现有数据中心、供应链、平台 API 回归通过。
  - 提交：`feat(ops): add ecommerce operations APIs`。

- [ ] 数据中心适配
  - 依赖：D1 与动作 API。
  - 文件：`src/state/ecommerceOperationsData.js`、领域测试、API 契约测试。
  - 输入：数据中心销售响应、产品和店铺映射。
  - 输出：创建时间口径、昨日截止、其它排除、质量限制和证据快照。
  - 失败测试：过期、缺失、其它和未映射数据错误进入确定性结论。
  - 实现步骤：标准化；范围聚合；质量门；快照；缺失指标。
  - 验证：数据适配测试和数据中心回归通过。
  - 提交：`feat(ops): connect data center evidence`。

- [ ] AI 点评
  - 依赖：领域模型、数据中心适配。
  - 文件：`functions/api/ecommerce-operations/ai-review.js`、AI 适配器、API 测试、平台集成登记。
  - 输入：已授权方案版本、证据快照和数据质量。
  - 输出：结构化优化建议、数据限制、错误和人工清单降级。
  - 失败测试：AI 能改变审批状态、接收敏感/越权字段或在未配置时伪造成功。
  - 实现步骤：provider 边界；输入白名单；schema；超时；模拟契约；持久化版本。
  - 验证：成功、无配置、超时、坏响应和权限测试通过。
  - 提交：`feat(ops): add AI plan review`。

- [ ] App 装配与 Provider
  - 依赖：API 和数据适配。
  - 文件：`src/state/ecommerceOperationsApi.js`、`src/state/EcommerceOperationsProvider.jsx`、`src/App.jsx`、`src/main.jsx`、权限、App 注册、导航测试。
  - 输入：经营 API、数据中心 API 和现有三 App 壳。
  - 输出：第四 App、五个路由、角色入口、加载和保存状态。
  - 失败测试：App 顺序、权限、Provider 挂载和懒加载断言失败。
  - 实现步骤：权限；注册；路由；Provider；最小可构建页面。
  - 验证：导航、权限、数据中心和供应链回归通过。
  - 提交：`feat(ops): register ecommerce operations app`。

- [ ] 经营驾驶舱与重点产品工作台
  - 依赖：App 装配与 Provider。
  - 文件：`src/features/ecommerce-operations/OperationsCockpit.jsx`、`FocusProductWorkspace.jsx`、`ProblemChainEditor.jsx`、`ExecutionTimeline.jsx`、UI 测试。
  - 输入：经营状态、数据证据、AI 点评和角色。
  - 输出：主管/运营首页和完整经营闭环。
  - 失败测试：方案、执行和复盘被拆成平级页面，或缺口无法阻断提交。
  - 实现步骤：角色摘要；产品列表；工作台；问题链；版本；周/月复盘。
  - 验证：核心用户流程和页面状态测试通过。
  - 提交：`feat(ops): add focus product workbench`。

- [ ] 协同、团队管理与方法库
  - 依赖：经营工作台。
  - 文件：`CollaborationWorkspace.jsx`、`TeamManagementWorkspace.jsx`、`PlaybookWorkspace.jsx`、权限与 UI 测试。
  - 输入：协同请求、组织责任、经营过程事实和已关闭复盘。
  - 输出：接受/退回/交付、责任负荷与辅导、经确认的方法卡。
  - 失败测试：目标部门可修改方案、成员可看他人敏感辅导、AI 建议自动进入方法库。
  - 实现步骤：协同队列；目标链接；责任矩阵；过程质量；辅导可见性；方法确认。
  - 验证：角色权限和完整协同流程通过。
  - 提交：`feat(ops): add collaboration and team management`。

- [ ] 视觉与交付
  - 依赖：全部功能任务。
  - 文件：`src/styles.css`、本地服务、耐久文档和全部相关测试。
  - 输入：现有设计 Token、五个页面和完整页面状态。
  - 输出：响应式、无障碍、本地/生产边界和验证记录。
  - 失败测试：缺少焦点、移动布局、空错禁用过期或本地降级契约。
  - 实现步骤：桌面；900/640/390px；键盘；减少动效；本地路由；文档更新。
  - 验证：Definition of Done 与浏览器验收全部通过。
  - 提交：`style(ops): finish ecommerce operations UI`。
