# 钉钉待办编排器执行任务

## 执行规则

- 每项先写失败测试并确认因缺少行为失败，再写最小实现。
- 不修改或提交供应链审批、库存导入等并行工作。
- 不发送真实钉钉待办，不部署生产。

## 任务

- [x] 领域草稿和 payload
  - 依赖：无。
  - 文件：`src/domain/dingTalk.js`、`src/domain/taskTodo.js`、`react-tests/task-todo.test.mjs`。
  - 输入：产品、任务、草稿、执行人。
  - 输出：可验证草稿、纯文本正文、优先级和截止时间 payload。
  - 失败测试：新测试因模块或字段不存在失败。
  - 实现步骤：默认草稿 → HTML 清洗 → 校验/时间戳 → payload/snapshot。
  - 验证：聚焦领域测试通过。
  - 提交：`feat: add DingTalk todo composer domain`。

- [x] 我的群 API
  - 依赖：无。
  - 文件：`functions/api/dingtalk/_shared/groups.js`、`functions/api/dingtalk/groups/index.js`、`src/domain/dingTalkGroups.js`、`tests/dingtalk-groups.test.mjs`、`react-tests/dingtalk-groups-client.test.mjs`。
  - 输入：当前登录用户授权令牌。
  - 输出：标准化我的群列表。
  - 失败测试：路由/客户端新断言失败。
  - 实现步骤：MCP 适配 → 会话路由 → 客户端。
  - 验证：API 和客户端测试通过。
  - 提交：`feat: list DingTalk groups in todo picker`。

- [x] 群选择器恢复能力
  - 依赖：我的群 API。
  - 文件：`src/features/progress/GroupExecutorPicker.jsx`、`src/domain/dingTalkGroupSelection.js`、相关 React 测试。
  - 输入：我的群、搜索群、成员解析结果。
  - 输出：可靠的默认列表、跳过详情、互斥加载和完整禁用。
  - 失败测试：空态、失败后旧结果、并发和跳过详情断言失败。
  - 实现步骤：默认加载 → 查询状态 → 成员互斥 → 跳过详情。
  - 验证：聚焦群选择测试通过。
  - 提交：`feat: complete DingTalk group executor flow`。

- [x] 待办编排 UI
  - 依赖：领域草稿、群选择器。
  - 文件：`TodoComposerFields.jsx`、`TodoPreview.jsx`、`TodoSyncModal.jsx`、`ProductProgressPage.jsx`、`ProductFlowProvider.jsx`、`RichTextEditor.jsx`、样式与测试。
  - 输入：任务、产品、组织架构、编排草稿。
  - 输出：可编辑、可预览、可同步并持久化的待办。
  - 失败测试：无日期入口、表单字段、更新 payload 和草稿持久化断言失败。
  - 实现步骤：允许打开 → 表单 → 预览 → 提交/保存 → 错误保留。
  - 验证：组件契约、领域和 Provider 测试通过。
  - 提交：`feat: add DingTalk todo composer`。

- [x] 共享焦点和最终验收
  - 依赖：待办编排 UI。
  - 文件：`src/ui/Modal.jsx`、共享 Modal 测试、`src/styles.css`。
  - 输入：打开/关闭与键盘事件。
  - 输出：焦点陷阱、焦点恢复、响应式和触控目标。
  - 失败测试：焦点行为断言失败。
  - 实现步骤：记录触发元素 → 初始焦点 → Tab 循环 → 关闭恢复 → 窄屏样式。
  - 验证：聚焦测试、全量 DoD、浏览器验收。
  - 提交：`fix: harden todo composer accessibility`。
