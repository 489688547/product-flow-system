# 钉钉待办编排器实施计划

## 目标

交付可浏览我的群、完整编辑和预览待办、在弹窗补齐截止时间并可靠处理异常的产品任务同步流程。

## 架构方案

群列表与成员继续经 Cloudflare Functions 调用钉钉用户授权能力，前端只使用内部 JSON 模型。待办草稿与 HTML 转纯文本规则位于纯领域模块；产品进度组件负责表单组合；共享 Modal 和 RichTextEditor 仅扩展业务中立能力。

## 文件职责

- `src/domain/dingTalkTodoComposer.js`：草稿默认值、校验、截止时间、富文本转正文和预览模型。
- `src/domain/dingTalkGroups.js`：我的群和搜索客户端。
- `functions/api/dingtalk/_shared/groups.js`：我的群 MCP 适配与标准化。
- `functions/api/dingtalk/groups/index.js`：登录态保护的我的群路由。
- `src/features/progress/TodoComposerFields.jsx`：内容编辑字段。
- `src/features/progress/TodoPreview.jsx`：发送预览。
- `src/features/progress/GroupExecutorPicker.jsx`：群列表、成员异常与选择状态。
- `src/features/progress/TodoSyncModal.jsx`：编排器状态与提交协调。
- `src/ui/Modal.jsx`：共享焦点管理。
- `src/ui/RichTextEditor.jsx`：紧凑、禁用和无图片模式。
- `src/styles.css`：编排器布局、状态、响应式和触控目标。
- `react-tests/` 与 `tests/`：领域、组件契约、API 和共享 UI 回归。

## 接口与契约

- `loadMyDingTalkGroups(fetchImpl?) -> Promise<{groups}>`
- `createTodoComposerDraft({task, product}) -> {subject, descriptionHtml, priority, dueDate, dueClock}`
- `buildTaskTodoPayload(..., draft) -> DingTalkTodoInput`
- `GET /api/dingtalk/groups -> {groups:[{id,name,memberCount,myRole}], nextCursor, hasMore}`
- `TodoSyncModal.onSync({executors,draft})`

## 数据迁移

不迁移数据库。`dingTodo.draft` 为可选增量字段；缺失时从产品任务生成。富文本和新优先级只在成功同步后持久化。

## 风险与回滚

- 钉钉我的群服务异常：保留关键词搜索和按人员选择；错误可重试。
- 富文本与钉钉正文能力差异：始终发送经过清洗的可读纯文本，避免原始 HTML。
- 共享 Modal 回归：通过现有 Modal 消费者测试和键盘浏览器验收；必要时仅回滚焦点管理提交。
- 回滚不删除 `dingTodo.draft`，旧版本会忽略该字段。

## 验证命令

- `node --test react-tests/dingtalk-todo-composer.test.mjs react-tests/dingtalk-group-selection.test.mjs`
- `node --test tests/dingtalk-groups.test.mjs tests/dingtalk-todo-update.test.mjs`
- `npm run lint`
- `npm run check:governance`
- `npm run check:integrations`
- `npm test`
- `npm run build`
- 浏览器验收 1440×900、390×844 和键盘路径；不发送真实待办。

## 任务顺序

1. 领域草稿与钉钉 payload。
2. 我的群 API 与前端客户端。
3. 群选择器异常恢复。
4. 待办内容、预览和弹窗内截止时间。
5. Modal 焦点、富文本共享能力与响应式样式。
6. 完整验证和浏览器验收。
