# Compound Engineering 项目经验闭环设计书

## 用户任务

开发者在确认问题已解决后，把可复用结论交给下一位开发者；维护者定期清理重复、矛盾和过期经验；团队以一致、已审查的 EveryInc 版本执行该流程。

## 信息层级

1. 强制契约：项目当前代码、测试和 durable docs。
2. 执行流程：`ce-compound`、`ce-compound-refresh` 与 `verification` 的触发关系。
3. 经验内容：`docs/solutions/` 中按问题类型分类的文档。
4. 供应链信息：固定 tag、commit、许可证和升级 PR。

## 页面结构

无产品页面。仓库结构为：

```text
.agents/skills/ce-compound/
.agents/skills/ce-compound-refresh/
.agents/skills/compound-engineering-upstream.json
.agents/skills/compound-engineering-LICENSE
docs/solutions/
```

## 交互流程

- 沉淀：验证完成 → 判断是否非简单且可复用 → 查重和对照代码 → 写入或更新经验 → 校验引用。
- 刷新：发现重构、冲突或漂移 → 聚类相关经验 → 选择保留、更新、合并、替换、删除 → 证据不足标记 `stale`。
- 升级：定时或手动检查 release → 在临时目录检出固定 tag → 只同步允许目录 → 运行治理检查 → 创建 `codex/*` 分支和面向 `dev` 的 PR。

## 组件复用

- 复用项目 `verification` Skill 作为所有交付的入口，不修改仍被 DEV-000014 占用的 `AGENTS.md`。
- 复用现有 `check:governance` 作为固定版本、许可证和目录完整性门禁。
- 复用 GitHub PR、分支流向和现有质量工作流，不增加另一个合并通道。

## 新增组件

- `sync-compound-engineering-skills.mjs`：接收本地上游 checkout、tag 和 commit；校验后原子替换允许的 Skill，并更新来源清单与许可证。
- `update-compound-engineering.yml`：每周或手动检查正式 release，只创建升级 PR。
- `compound-engineering-skills.test.mjs`：验证来源、发现性、安全边界、工作流目标分支和项目触发关系。

## 页面状态

无 UI 状态。命令行结果必须区分：已是最新版、发现新版并创建 PR、同步失败、CI 失败、Actions 无 PR 权限。

## 响应式与钉钉 WebView

不适用。

## 交互文案

- 已是最新版：`Compound Engineering 已锁定清单声明的最新正式版本。`
- 发现新版：`已创建升级 PR；合并前必须审查 Skill、脚本和许可证变化。`
- 非法来源：`上游内容未通过固定版本或目录安全检查，未修改项目 Skill。`

## 无障碍

不适用；所有结果以普通文本和 GitHub Checks 状态提供。

## 视觉验收

不适用。
