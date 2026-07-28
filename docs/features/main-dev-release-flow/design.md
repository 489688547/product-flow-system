# Main / Dev 双站发布流程设计书

## 用户任务

用户只需要记住两个固定入口：

- 正式使用：`https://deshan-tiyes-system.pages.dev`
- 功能验收：`https://deshan-tiyes-system-dev.pages.dev`

开发完成后系统自动更新测试站；用户确认没问题后，系统才允许把相同提交发布到正式站。

## 信息层级

1. 主信息：当前打开的是正式站还是测试站，以及对应 commit。
2. 辅助信息：数据环境、Provider readiness、部署时间和验证结果。
3. 低频信息：Cloudflare deployment ID、回滚记录、旧站迁移清单。

本功能不新增业务页面。环境身份通过响应元数据、部署检查和运维文档表达，避免给公司员工增加
无关操作；如果后续需要界面提示，应只在测试站顶部展示简洁的“测试站·真实数据”标识。

## 页面结构

不改变现有左侧导航和默认使用手册。两个站点使用相同 UI 与同一构建产物逻辑，差异只来自
Git branch、Pages project 和 runtime environment。

```text
codex/* 功能分支
        │ Pull Request
        ▼
dev ──自动部署──► deshan-tiyes-system-dev.pages.dev
        │ 用户验收
        │ 仅允许 dev → main
        ▼
main ─自动部署──► deshan-tiyes-system.pages.dev
```

## 交互流程

### 功能开发

1. 从包含最新 `main` 的 `dev` 创建 `codex/*` 分支。
2. PR 目标为 `dev`。
3. quality 和 Cloudflare 测试站部署完成后合并。
4. 用户打开固定测试站验收真实业务。

### 正式发布

1. 创建 `dev → main` 发布 PR。
2. 来源分支门禁拒绝任何其他 head。
3. 检查 dev 测试站对应 commit、quality、Cloudflare build 和 smoke 结果。
4. 合并后正式项目自动部署同一 commit。
5. 正式 smoke 和 readiness 独立通过后才宣布上线。

### 旧站迁移

1. 两个新站先并行存在。
2. 修改所有代码与本机消费者，但旧站保持可回滚。
3. 钉钉首页、安全回调和 SSO 最后切换。
4. 真实登录通过后删除旧 Pages 项目，使旧地址不再可访问。

## 组件复用

- 复用现有 `check-deployed-readiness.mjs` 验证认证后的环境能力。
- 复用 `check-pages-environment-parity.mjs` 检查 D1 和 Secret 名称。
- 复用 GitHub `quality` 工作流和分支保护。
- 复用 Cloudflare Git integration，不引入第三方部署服务。
- 复用钉钉开放平台 DWS `webapp config`、`security config` 与版本发布能力。

## 新增组件

### 分支流向检查脚本

- 职责：根据 GitHub event payload 验证 PR base/head。
- 输入：`GITHUB_EVENT_PATH` 中的 `pull_request.base.ref` 与 `pull_request.head.ref`。
- 输出：合法时退出 0；功能 PR 指向 main 或非 dev 发布 PR时退出 1并给出中文原因。
- 复用边界：只判断分支流向，不重复执行质量或部署检查。

### 双项目环境检查

- 职责：分别下载正式与测试 Pages 项目配置，比较 D1 和必要 Secret 名称。
- 输入：正式项目名、测试项目名、仓库 `wrangler.toml` 与环境能力清单。
- 输出：两项目一致时返回安全摘要；漂移时只输出绑定或 Secret 名称，不输出值。

### 部署冒烟工作流

- 职责：在 `dev` 和 `main` 更新后等待对应固定站点出现目标 commit，再验证首页、OAuth、认证和 readiness。
- 输入：branch、commit SHA、固定站点 URL、受控生产验证 token。
- 输出：GitHub check success/failure 与不含秘密的错误摘要。

## 页面状态

- 加载：Cloudflare 构建中，GitHub check 保持 pending。
- 空数据：不适用；D1 无业务数据时 readiness 仍单独报告。
- 错误：指出是 GitHub quality、Cloudflare build、固定站 smoke、D1 还是 Provider readiness。
- 无权限：Cloudflare、GitHub 或钉钉配置失败时保留原配置，不绕过权限。
- 禁用：`dev` 未验收或来源分支不合法时，main 合并保持阻断。
- 成功：同时记录 branch、commit、固定站点和 checkedAt。

## 响应式与钉钉 WebView

现有页面不改变。验收必须覆盖：

- PC 钉钉工作台首页。
- 移动端钉钉工作台首页。
- 普通浏览器 OAuth 登录。
- 真实笔记本宽度和窄屏已有页面无回归。

## 交互文案

- 测试站标识（如后续启用）：`测试站 · 使用真实业务数据`
- 分支阻断：`正式发布只接受 dev 分支；请先在测试站完成验收。`
- 环境漂移：`正式站与测试站的环境配置不一致，已阻止发布。`
- 旧站停用阻断：`钉钉或采集器仍在使用旧网址，暂不允许停用。`

## 无障碍

本轮不新增可见交互控件。若增加测试站标识，必须使用文本而非只靠颜色区分，并保持
WCAG AA 对比度，不抢占键盘焦点，不覆盖钉钉安全区。

## 视觉验收

- 新正式站登录页与主页面：1440px、1280px、390px。
- 新测试站登录页与主页面：同上，并能明确识别测试站。
- PC 和移动钉钉工作台入口。
- OAuth 失败、环境阻断和无权限状态。
