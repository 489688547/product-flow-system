## 目的

说明这次变更解决的问题和用户结果。

## 规格与决策

- PRD：链接 `docs/features/<feature>/prd.md`，或说明为什么属于不改变行为和契约的小改动。
- 设计书：链接交互设计；没有 UI 变化时写明“不涉及 UI”。
- ADR/API 契约：涉及架构、认证、权限、数据结构或共享 API 时提供链接。

## 变更范围

- 列出修改的功能、组件、中间件、API 和文档。
- 说明明确不包含的相邻工作。

## 兼容与回滚

- 数据和 API 兼容影响：
- 外部系统影响：
- 回滚条件与步骤：

Integration-Impact: none
Integration-Impact-Reason: 请说明无影响原因，或把 none 改为逗号分隔的平台 ID

Rule-Writeback: none
Rule-Writeback-Reason: 请列出本 PR 反写的长期规则文件；没有共享边界变化时说明具体差异原因

## 验证

- [ ] `npm run lint`
- [ ] `npm run check:governance`
- [ ] `npm run check:integrations`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] 部署后已对每个受影响平台执行 `npm run verify:production -- --require-platform <platform-id>`
- [ ] UI 变更已检查键盘、空/错/禁用状态、笔记本宽度、响应式和钉钉 WebView
- [ ] API 变更已检查认证、权限、失败、超时和兼容场景

## 截图与证据

UI 变更附真实页面截图；数据或 API 变更附测试输出或安全的示例响应。不要粘贴密钥、Cookie、个人手机号或完整外部接口响应。

## 文档更新

列出本次更新的产品说明、设计规范、说明书、平台目录或架构决策。
