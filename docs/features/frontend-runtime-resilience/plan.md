# 前端运行时防白屏实施计划

## 目标

把所有浏览器存储操作收敛到不抛错的共享边界，并为未知 React 故障提供不会泄露数据的可恢复页面。

## 架构方案

采用两层防护：

1. 数据层：扩展 `src/state/resilientLocalStorage.js`，安全覆盖读取、序列化、写入、删除和白名单清理；所有 Provider 只依赖该模块。
2. 展示层：在 `src/main.jsx` 最外层挂载根级错误边界；错误边界只负责展示恢复界面，不参与业务数据读写。

依赖方向保持 `main/features -> ui/state`。服务端 API、D1 和 Provider 数据契约不变。

## 文件职责

- `src/state/resilientLocalStorage.js`：安全存储原语、状态序列化和应用缓存白名单清理。
- `src/ui/ApplicationErrorBoundary.jsx`：根级故障边界和恢复动作。
- `src/main.jsx`：在所有 Provider 外挂载故障边界。
- `src/state/*Provider.jsx`：移除直接存储写入，调用共享安全边界。
- `src/styles.css`：故障页响应式、焦点和安全区样式。
- `react-tests/resilient-local-storage.test.mjs`：存储配额、序列化、删除和白名单清理行为。
- `react-tests/application-error-boundary.test.mjs`：根级挂载、文案、恢复动作和无障碍契约。
- `react-tests/react-app.test.mjs`：Provider 不再直接写存储的架构约束。
- `DESIGN.md`、`docs/platform/architecture.md`：写回不可白屏和浏览器缓存非关键路径规则。
- `docs/platform/integration-registry.json` 及生成模块：登记 Cloudflare Pages 前端恢复边界代码路径。

## 接口与契约

- `tryGetStorageItem(storage, key): string | null`
- `trySetStorageItem(storage, key, value): boolean`
- `tryRemoveStorageItem(storage, key): boolean`
- `persistLocalState(storage, key, state): boolean`
- `clearApplicationBrowserCaches({ localStorage, sessionStorage }): { local: boolean, session: boolean }`
- `ApplicationErrorBoundary` 捕获错误后不显示 `error.message` 或堆栈；恢复按钮分别调用刷新和白名单清理后刷新。

## 数据迁移

无需服务端迁移。现有缓存键保持兼容，不自动删除。只有故障页中用户明确确认时按白名单删除当前浏览器缓存。容量失败后内存状态和 D1 同步继续工作；浏览器缓存恢复能力降级。

## 风险与回滚

- 风险：遗漏直接存储写入。通过静态测试扫描 Provider 和入口源文件。
- 风险：错误边界自身抛错。故障页不依赖业务 Provider、网络请求或动态数据。
- 风险：缓存清理误伤登录。使用固定业务键白名单并测试未登记键保留。
- 回滚：回滚 Pages 到上一生产部署；无数据库、配置或数据迁移回滚。

## 验证命令

- RED/GREEN：`node --test react-tests/resilient-local-storage.test.mjs react-tests/application-error-boundary.test.mjs react-tests/react-app.test.mjs`
- 完整门禁：`npm run lint`
- 完整门禁：`npm run check:governance`
- 完整门禁：`npm run check:integrations`
- 完整门禁：`npm run check:environment-capabilities`
- 完整门禁：`npm test`
- 完整门禁：`npm run build`
- 生产：`npm run verify:production -- --require-platform cloudflare-pages`
- 浏览器：保留超额缓存打开正式域名，检查首屏、刷新、页面切换、控制台和故障页键盘操作。

## 任务顺序

1. 为安全存储和白名单清理补失败测试并实现。
2. 把所有现有 Provider 迁移到安全存储边界。
3. 为根级故障页补失败测试并实现。
4. 写回设计、架构和集成注册表。
5. 运行完整门禁、发布并完成生产浏览器验证。
