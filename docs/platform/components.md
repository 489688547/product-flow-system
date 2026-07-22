# 通用组件目录

通用组件位于 `src/ui/`。组件必须使用设计 Token、业务无关属性和稳定交互，不在内部写死部门、产品或审批文案。

| 组件 | 用途 | 关键约束 |
| --- | --- | --- |
| `Button` / `IconAction` | 主操作、普通操作、危险操作和图标操作 | disabled 必须说明原因；危险样式只用于不可逆动作 |
| `Modal` | 需要集中注意力的复杂编辑 | 优先考虑页面内编辑；焦点必须可进入和返回 |
| `ConfirmDialog` | 不可逆或高影响确认 | 明确对象、后果和确认动作，不使用浏览器模糊提示 |
| `DataTable` / `TableActions` | 高密度结构化数据 | 表头不拆字，列宽稳定，窄屏水平滚动，操作不换行 |
| `HeaderFilter` | 页面级轻量筛选 | 选项数量有限且不会遮挡页面主操作 |
| `DatePickerField` | 标准日期输入 | 输出稳定日期格式，浮层不被表格裁切 |
| `DateRangeControls` | 起止日期组合 | 复用 `DatePickerField`；只上报草稿值，是否查询由业务页面显式决定 |
| `DateRangePickerField` | 确认式日期范围输入 | 草稿不向父级提交；完整合法范围确认后才输出，浮层不被容器裁切 |
| `ExpectedLaunchMonthSelect` | 预计上市月份 | 只提供当前及未来月份，存储 `YYYY-MM` |
| `ProductPicker` | 产品切换 | 保留显式选择，清楚展示当前产品和责任归属 |
| `OrgSelect` | 钉钉部门或人员选择 | 不使用自由文本伪造组织成员，浮层通过安全层级展示 |
| `RichTextEditor` | 需要结构化说明的长文本 | 保留基本语义和可读降级，不用于简单单行内容 |
| `DeliverablePreviewModal` | 交付物预览 | 根据类型安全预览，下载能力由来源决定 |
| `FloatingMenu` | 脱离裁切容器的菜单 | 统一浮层定位、关闭、键盘和层级行为 |

## 平台组合组件

`EnvironmentReadinessPanel` 位于 `src/features/handbook/`，消费稳定的环境就绪 API，统一展示 Cloudflare、D1、钉钉和其他平台的环境状态。它是说明书中的平台组合能力，不是基础控件；其他页面需要状态展示时应复用其状态契约和文案，不复制密钥检查逻辑到组件。

## 组件状态

交互组件按适用范围覆盖 default、hover、focus、active、disabled、loading、error、empty 和 selected。加载优先使用保持布局的骨架；空状态说明下一步；错误说明原因和恢复方式。

## 进入通用层的条件

基础控件可以直接进入 `src/ui`。其他组件至少有两个真实消费者，或者经过设计评审确认属于稳定平台模式。只服务一个业务页面的组合组件留在对应 feature。

## 兼容与废弃

修改共享组件属性前搜索全部调用方并补测试。废弃属性先提供迁移说明和兼容周期，不在无关功能 PR 中顺手重写所有调用方。
