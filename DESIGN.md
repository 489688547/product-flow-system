# Design

## Style Direction

浅色、克制的产品工作台，参考 Linear、Apple 系统应用和成熟钉钉工作台应用。

设计执行以 `frontend-design-principles`、`impeccable` 和 `web-design-guidelines` 为主，不使用偏营销展示的 `high-end-visual-design`。

## Typography

使用系统字体。页面标题 24px，区块标题 15-16px，正文和表格 13px，辅助文字 12px。

## Layout

固定左侧导航和响应式主工作区。间距使用 4px 基础网格，常用间距为 8px 和 12px。表格保持表头单行、稳定列宽和水平滚动；设置页使用无嵌套卡片的矩阵结构。

## Components

- 主操作使用蓝色，普通操作使用中性按钮，危险操作只用于不可逆动作。
- 权限范围使用组织架构下拉多选，不使用自由文本录入。
- 所有下拉通过浮层渲染，避免被表格和面板裁切。
- 加载、错误、禁用、选中状态必须清楚且一致。

## Embedded DingTalk Webview

避免大请求使用 `keepalive`；错误提示使用明确中文。布局使用动态视口高度并适配安全区。
