# 产品规划时间轴拖动执行任务

## 执行规则

- 每项任务只交付一个可独立验证的结果。
- 先写失败测试并确认失败原因，再写实现。
- 完成后记录实际验证命令和结果。
- 每次提交只包含当前任务文件。

## 任务

- [x] 日期展示与拖动领域规则
  - 依赖：无。
  - 文件：`src/domain/productPlanning.js`、`react-tests/product-planning.test.mjs`。
  - 输入：ISO 日期、年度、指针位移和轨道宽度。
  - 输出：日期文案、整数日差、移动或缩放后的日期范围。
  - 失败测试：`node --test react-tests/product-planning.test.mjs`，新增导出不存在。
  - 实现步骤：同月/跨月/跨年文案；像素换算；移动相交约束；端点年度与同日约束。
  - 验证：`node --test react-tests/product-planning.test.mjs`，9/9 通过。
  - 提交：`feat(planning): add timeline date calculations`。

- [x] 可拖动时间条交互
  - 依赖：日期展示与拖动领域规则。
  - 文件：`src/features/planning/PlanningRangeBar.jsx`、`react-tests/react-app.test.mjs`。
  - 输入：规划、年度、编辑权限和两个回调。
  - 输出：日期预览、一次拖动变更或精确编辑动作。
  - 失败测试：`node --test react-tests/react-app.test.mjs`，组件契约不存在。
  - 实现步骤：Pointer capture；4px 阈值；中心/边缘模式；取消恢复；键盘回退；可访问名称。
  - 验证：`node --test react-tests/react-app.test.mjs`，42/42 通过。
  - 提交：`feat(planning): add draggable timeline range`。

- [ ] 页面接线、视觉收口和持久规则
  - 依赖：可拖动时间条交互。
  - 文件：`src/features/planning/AnnualPlanningTimeline.jsx`、`src/features/planning/ProductPlanningPage.jsx`、`src/styles.css`、`react-tests/react-app.test.mjs`、`DESIGN.md`。
  - 输入：时间条日期变更。
  - 输出：现有共享状态的一次规划更新、完整表格边界与稳定交互状态。
  - 失败测试：`node --test react-tests/react-app.test.mjs`，旧接线或旧样式仍存在。
  - 实现步骤：替换旧时间条；接入 `updateProductPlan`；补齐手柄、焦点、触控和表格收口；记录设计规则。
  - 验证：两个规划定向测试通过。
  - 提交：`feat(planning): connect timeline drag editing`。

- [ ] 浏览器验收与质量门禁
  - 依赖：页面接线、视觉收口和持久规则。
  - 文件：本任务清单。
  - 输入：本地沙箱页面。
  - 输出：桌面、笔记本、窄 WebView 与键盘验收记录。
  - 失败测试：不适用；以浏览器状态和完整质量门禁为证据。
  - 实现步骤：沙箱启动；交互和视觉验收；全量命令；差异检查。
  - 验证：`npm run lint`、治理检查、集成检查、环境能力检查、`npm test`、`npm run build` 全部通过。
  - 提交：`test(planning): verify timeline interactions`。
