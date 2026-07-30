# Apple 克制风格实施计划

## 文件职责

- `tokens.css`：本次设计新增的可移植视觉与动效令牌。
- `src/styles.css`：全局外壳、共享控件和数据总览视觉实现。
- `src/ui/Button.jsx`：共享按钮的安全默认行为与加载状态。
- `src/features/data-center/DataOverview.jsx`：数据总览可访问分组和视觉层级。
- `DESIGN.md`：写回长期设计约束。
- `react-tests/apple-quiet-ui.test.mjs`：共享按钮与数据总览可访问行为。

## 实施顺序

1. 用失败测试锁定按钮默认类型、加载状态和核心指标语义分组。
2. 增加设计令牌并重构全局外壳和共享控件样式。
3. 调整数据总览结构语义与视觉层级。
4. 写回设计规则，运行聚焦和完整门禁。
5. 在真实页面验证桌面、窄屏、键盘、控制台和减少动效。

## 风险与回滚

- 风险：全局样式影响高频页面。处理：保留现有类名和组件 API，只调整令牌与已有选择器。
- 风险：视觉层级导致窄屏溢出。处理：保持现有断点并增加 390px 实测。
- 回滚：撤销本功能分支的样式、组件和文档提交；无数据迁移。

## 验证

```bash
node --test react-tests/apple-quiet-ui.test.mjs react-tests/sidebar-navigation-ui.test.mjs react-tests/data-center-governed-overview.test.mjs
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```
