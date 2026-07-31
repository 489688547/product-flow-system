# Apple 克制风格实施计划

## 文件职责

- `tokens.css`：本次设计新增的可移植视觉与动效令牌。
- `src/styles.css`：全局外壳、共享控件和核心页面视觉实现。
- `src/domain/sidebarNavigation.js`：把权限过滤后的页面组织为业务 App，并解析当前 App。
- `src/ui/WorkspaceNavigation.jsx`：共享的一级 App 轨道和当前 App 二级导航。
- `src/App.jsx`：组合导航、上下文顶部栏和现有页面路由。
- `src/ui/Button.jsx`：共享按钮的安全默认行为与加载状态。
- `src/features/company/CompanyHomePage.jsx`：老板行动摘要与首页优先级。
- `src/features/dashboard/DashboardPage.jsx`：风险优先的产品协同总览。
- `src/features/data-center/DataCenterAppPage.jsx`：健康状态与工作区层级。
- `src/features/data-center/DataOverview.jsx`：数据总览可访问分组和视觉层级。
- `DESIGN.md`：写回长期设计约束。
- `react-tests/apple-quiet-ui.test.mjs`：共享按钮、导航和核心页面可访问行为。

## 实施顺序

1. 用失败测试锁定两级导航、老板行动摘要、风险优先产品总览。
2. 抽取共享工作区导航并接入全局外壳。
3. 重排公司首页、产品总览和数据中心的操作优先级。
4. 写回设计规则，运行聚焦和完整门禁。
5. 在真实页面验证桌面、窄屏、键盘、控制台和减少动效。

## 风险与回滚

- 风险：导航结构变化影响全部页面。处理：路由、权限过滤和页面键保持不变，导航组件只消费过滤后的现有配置。
- 风险：视觉层级导致窄屏溢出。处理：保持现有断点并增加 390px 实测。
- 回滚：撤销第二阶段导航组件、页面结构和样式提交；无数据迁移、API 或外部系统变更。

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
