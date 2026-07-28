# 钉钉待办编排器实施计划

## 目标

交付可浏览我的群、完整编辑和预览待办、在弹窗补齐截止时间并可靠处理异常的产品任务同步流程。

## 架构方案

群列表与成员继续经 Cloudflare Functions 调用钉钉用户授权能力，前端只使用内部 JSON 模型。待办草稿与 HTML 转纯文本规则位于纯领域模块；产品进度组件负责表单组合；共享 Modal 和 RichTextEditor 仅扩展业务中立能力。

## 文件职责

- `src/domain/dingTalk.js`：草稿默认值、校验、截止时间、富文本清洗、正文转换和待办 payload。
- `src/domain/taskTodo.js`：统一构造成功绑定、同步状态与展示模拟状态，同时解析受控产品任务深链；未知动作只定位不写入。
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
- `functions/api/dingtalk/todo/sync.js`：供应商写入成功后基于最新共享状态合并当前任务绑定，处理版本冲突并返回已持久化任务。
- `react-tests/` 与 `tests/`：领域、组件契约、API 和共享 UI 回归。

## 接口与契约

- `loadMyDingTalkGroups(fetchImpl?) -> Promise<{groups}>`
- `createTodoComposerDraft({task, product}) -> {subject, descriptionHtml, priority, dueDate, dueClock}`
- `buildTaskTodoPayload(..., draft) -> DingTalkTodoInput`
- `reconcileTaskTodosFromDingTalk(tasks, cards) -> tasks`：按 todoId/sourceId 匹配，以钉钉卡片覆盖同步快照，并按远端字段快照归一完成状态；无匹配、重复快照或查询失败保持原状态。
- `GET /api/dingtalk/groups -> {groups:[{id,name,memberCount,myRole}], nextCursor, hasMore}`
- `POST /api/dingtalk/todo/sync`：必须具备有效企业会话且不是只读账号；服务端从会话覆盖创建人，从 D1 共享状态校验 `sourceId` 对应的产品任务，并只接受与任务记录一致的 `todoId`。客户端传入的创建人、操作人、资源人和恢复人员不作为授权依据。
- 待办同步请求只有在钉钉写入和当前产品任务绑定都成功后返回 `{synced:true,todo,task}`；无会话由全局中间件返回 401，只读返回 403，任务不存在返回 404，D1 未绑定或状态未初始化返回 501/409。钉钉失败只返回白名单错误码、安全提示和可重试标识，不向浏览器透传供应商原始响应。
- 服务端绑定写入使用 `/api/state` 相同的基线和原子事务；若并发推进版本，重新读取最新状态并仅重放当前任务的同步结果，有限重试后返回 `DINGTALK_TODO_BINDING_CONFLICT`，不得报告完整成功。
- 新任务：通过当前登录人的有效钉钉用户授权调用个人待办创建接口；标题、正文、截止时间、优先级和 unionId 执行人进入受支持的个人待办链路。真实 taskId 与本地稳定 `sourceId` 一起保存，个人待办查询作为双向同步主链路。
- 已绑定个人待办：复用 taskId 调用个人待办更新工具写标题、截止时间、优先级和完成状态；官方更新工具不支持的字段不得猜测发送。创建时已写入的正文和执行人若发生变化，受控创建替代个人待办并保留旧记录。
- 兼容旧任务：服务端仅复用来源为 `todo_personal_user`、taskId 与当前任务绑定一致且交互版本为 `2` 的记录。历史企业工作待办或版本较低的绑定进入“待更新”；同步时先创建个人待办并保存新绑定，再用应用访问凭证将旧工作待办整体和执行者状态设为完成。日志和供应商响应不得写入令牌、手机号或原始敏感数据。
- `GET /api/dingtalk/todo/list`：产品任务客户端重复传递当前用户已分配的可信 `taskId` 参数；服务端使用应用访问凭证调用 `/users/{unionId}/tasks/{taskId}` 读取详情，最多 40 个去重 ID、并发上限 4，并把 `id/done` 统一为 `taskId/isDone`。未传 taskId 的通用企业待办读取继续使用 `/org/tasks/query`，不依赖当前应用未开放的 `Custom.Todo.Read`。
- `TodoSyncModal.onSync({executors,draft})`
- `ProductFlowProvider` 在登录完成、窗口聚焦和带抖动的周期内，把当前用户已分配的唯一 taskId 传给 `/api/dingtalk/todo/list`；只在远端快照变化时持久化产品任务。
- 新建产品任务待办不发送 `actionList`，由钉钉原生个人待办提供左侧 checkbox。系统内详情链接仅用于定位，不构造完成写入参数。
- `dingTodo.actionVersion=2` 表示绑定使用原生个人待办 checkbox。服务端发现可信旧工作待办或旧版本绑定时，先创建个人待办，再把旧工作待办整体和执行者状态更新为完成；旧卡片退出未完成列表但保留历史。

## 数据迁移

不迁移数据库。`dingTodo.draft` 和 `dingTodo.actionVersion` 均为可选增量字段；缺失动作版本的工作待办在下一次授权同步时迁移。富文本、优先级、真实 todoId 和弹窗内修改的任务截止日期由服务端在钉钉成功后原子持久化；浏览器返回状态只做即时渲染，不再承担唯一绑定写入。

## 风险与回滚

- 钉钉我的群服务异常：保留关键词搜索和按人员选择；错误可重试。
- 钉钉待办查询量过大：未完成和已完成列表串行执行并分别限制单次分页数量；响应明确返回截断覆盖和下一轮 OpenAPI `nextToken`，避免历史待办永久饿死。浏览器仅在当前账号存在已分配待办时自动刷新，同标签页共享 single-flight、跨标签页使用刷新租约，首次和周期请求增加随机抖动，遇到顶层 429 退避 2 分钟，避免超过企业 40 QPS 权益或在 Cloudflare 边缘超过 CPU 限额。
- 富文本与钉钉正文能力差异：始终发送经过清洗的可读纯文本，避免原始 HTML。
- 共享 Modal 回归：通过现有 Modal 消费者测试和键盘浏览器验收；必要时仅回滚焦点管理提交。
- 钉钉已创建但共享状态连续冲突：返回部分成功错误并记录安全 todoId；重试时按稳定来源或已落库绑定恢复同一条待办，避免重复创建。
- 回滚不删除 `dingTodo.draft`，旧版本会忽略该字段。
- 回滚时保留 `actionVersion` 和历史绑定；若用户授权不可用，停止外部写入并提示重新登录，不得静默退回无 checkbox 的企业工作待办。

## 验证命令

- `node --test react-tests/task-todo.test.mjs react-tests/todo-composer-ui.test.mjs react-tests/dingtalk-group-selection.test.mjs`
- `node --test tests/dingtalk-groups.test.mjs tests/dingtalk-todo-update.test.mjs`
- `npm run lint`
- `npm run check:governance`
- `npm run check:integrations`
- `npm test`
- `npm run build`
- 浏览器验收 1440×900、390×844 和键盘路径；真实联调仅向授权测试账号发送带明确标识的临时待办，并在验证后删除。

## 任务顺序

1. 领域草稿与钉钉 payload。
2. 我的群 API 与前端客户端。
3. 群选择器异常恢复。
4. 待办内容、预览和弹窗内截止时间。
5. Modal 焦点、富文本共享能力与响应式样式。
6. 完整验证和浏览器验收。
