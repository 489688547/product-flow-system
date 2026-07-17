# 产品规划卡片跳转产品进度设计

## 目标

产品规划页顶部的已立项产品卡片支持整卡点击，直接打开该产品的“产品进度”。

## 交互规则

- 有 `productId` 的产品卡片整卡可点击，并显示可点击的指针与键盘焦点样式。
- 点击卡片时，通过应用现有的 `openProgress(productId)` 导航能力跳转，确保目标产品被显式选中。
- 按 Enter 或 Space 也可以触发跳转。
- 卡片右侧日历按钮保留原有“安排规划”操作；点击按钮时阻止事件冒泡，不触发进度跳转。
- 尚未立项、没有 `productId` 的需求机会不可跳转，继续只提供规划安排能力。

## 组件边界

- `App.jsx` 向 `ProductPlanningPage` 注入 `onOpenProgress`。
- `ProductPlanningPage` 将跳转回调传递给 `PlanningDemandTray`。
- `PlanningDemandTray` 根据 `productId` 决定卡片是否具备点击和键盘交互。

## 验证

- 源码契约测试覆盖回调传递、产品 ID 跳转、键盘操作和日历按钮阻止冒泡。
- 浏览器验证整卡点击跳转到 `#progress` 且目标产品保持选中。
- 浏览器验证点击日历按钮仍打开规划弹窗，不发生页面跳转。
