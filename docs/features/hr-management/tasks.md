# 人事管理 Phase 1A 执行任务

## 执行规则

- 当前清单只覆盖人事核心与绩效，考勤假期和工资核算分别使用 Phase 1B、Phase 1C 计划。
- 每项任务只交付一个可独立验证的结果。
- 先写失败测试并确认失败原因，再写最小实现。
- 完成后记录实际命令、通过数量和环境限制。
- 每次提交只包含当前任务文件；不得带入其他工作区改动。
- 未经授权不部署、不发送钉钉动作、不导入真实员工或工资数据。

## 集成与共享能力结论

- `cloudflare-pages`：connected，Phase 1A Pages Function 必需。
- `cloudflare-d1`：connected，Phase 1A 独立人事表必需。
- `dingtalk`：connected，仅复用登录和组织通讯录；考勤、请假、加班和审批不在当前已验证能力中。
- `kuaimai`：一跳关联但本功能不直接依赖。
- 共享能力决策：扩展现有认证、组织、权限、App 注册、D1 和错误契约；人事领域和 UI 局部保留。
- `WorkEvidenceRef` 先作为跨 App 数据约定；出现第二个真实消费者后再评估共享平台 API。

## Phase 1A

- [x] 环境能力与迁移契约
  - 输出：`0002_hr_management_core.sql`、`hr-management-core` 环境能力和生成模块。
  - 红灯：迁移/清单表名不一致测试失败。
  - 验证：2026-07-19 运行迁移、环境能力、生产就绪与集成测试，13/13 通过；环境生成模块检查与集成检查通过。
  - 提交：`build(hr): add core data contract`。

- [x] 人事领域规则
  - 输出：稳定身份、有效期、绩效权重、建议分、状态机、冻结和审计纯函数。
  - 红灯：领域模块不存在。
  - 验证：2026-07-19 领域测试 8/8 通过，React 全套 315/315 通过，相关 ESLint 通过。
  - 提交：`feat(hr): add core domain rules`。

- [x] 认证 API 与 D1 存储
  - 输出：范围裁剪 bootstrap、动作 POST、乐观冲突和安全错误。
  - 红灯：API 路由不存在。
  - 验证：2026-07-19 人事 API 6/6、API 全套 145/145 通过，相关 ESLint 通过。
  - 提交：`feat(hr): add authenticated core API`。

- [ ] Provider 与本地空状态
  - 输出：`useHrManagement()`、刷新、动作提交和冲突恢复。
  - 红灯：Provider 文件不存在。
  - 验证：Provider 和 React 基线测试通过。
  - 提交：`feat(hr): add management provider`。

- [ ] App 注册与导航
  - 输出：八个长期入口、统一页面装配和 App Center 记录。
  - 红灯：导航和注册断言失败。
  - 验证：导航、权限和 App Center 测试通过。
  - 提交：`feat(hr): register management app`。

- [ ] 人事核心工作区
  - 输出：角色化总览、员工任职、入转调离和人事任务。
  - 红灯：工作区和关键状态文案缺失。
  - 验证：UI、领域和 API 测试通过。
  - 提交：`feat(hr): add people operations workspaces`。

- [ ] 绩效工作流
  - 输出：主管定项、员工自评、建议分、终评、一次复核和冻结。
  - 红灯：三类分数与 AI 边界断言失败。
  - 验证：领域、UI 和 API 绩效全链通过。
  - 提交：`feat(hr): add performance review workflow`。

- [ ] 设置、阶段状态与响应式
  - 输出：模板/角色设置、考勤工资真实阶段说明、390–1440px 和无障碍样式。
  - 红灯：未接入文案和响应式规则缺失。
  - 验证：UI 测试与构建通过。
  - 提交：`style(hr): finish phase 1a workspaces`。

- [ ] 长期规则与完整验收
  - 输出：角色、流程、数据、API、错误、任务证据和 PR 声明。
  - 红灯：治理或契约遗漏。
  - 验证：Definition of Done 全部通过并完成本地浏览器验收。
  - 提交：`docs(hr): record phase 1a contracts`。

## 后续独立计划边界

- **Phase 1B**：工作日历、考勤、假期、加班、Excel/CSV 导入、异常确认、余额和考勤冻结。
- **Phase 1C**：薪资项、规则版本、工资调整、工资批次、人事复核、财务确认、工资条和补差。
- Phase 1B/1C 不得复用 Phase 1A 的整包 bootstrap 返回敏感数据；各自设计资源级 API 和权限测试。
