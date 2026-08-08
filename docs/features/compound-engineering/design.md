# Compound Engineering 项目经验闭环设计书

## 用户任务

开发者在确认问题已解决后，把可复用结论交给下一位开发者；维护者定期清理重复、矛盾和过期经验；团队以一致、已审查的 EveryInc 版本执行该流程。

## 信息层级

1. 强制契约：项目当前代码、测试和 durable docs。
2. 执行流程：`ce-compound`、`ce-compound-refresh` 与 `verification` 的触发关系。
3. 经验内容：`docs/solutions/` 中按问题类型分类的文档。
4. 供应链信息：固定 tag、commit、许可证和人工升级命令。

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

- 沉淀：取得聚焦验证证据 → 判断是否非简单且可复用 → 查重和对照代码 → 写入或更新经验 → 校验引用 → 重新运行最终完整 DoD。
- 刷新：发现重构、冲突或漂移 → 聚类相关经验 → 选择保留、更新、合并、替换、删除 → 证据不足标记 `stale`。
- 升级：维护者按需检出精确 tag 与 commit → 运行本地同步命令 → 审查差异 → 提交普通功能 PR。

## 组件复用

- 复用项目 `verification` Skill 作为所有交付的入口，并在 `AGENTS.md` 提供 repo-local Skill 直接调用的相同硬门槛和 `docs/solutions/` 发现规则。
- 复用现有 `check:governance` 作为固定版本、许可证和目录完整性门禁。
- 复用 GitHub PR、分支流向和现有质量工作流，不增加另一个合并通道。

## 新增组件

- `sync-compound-engineering-skills.mjs`：接收本地上游 checkout、tag 和 commit；校验实际 tag、版本方向、文件类型、HEAD tree 与 allowlist 后原子替换允许的 Skill，并更新来源清单、内容摘要与许可证。
- `compound-engineering-skills.test.mjs`：验证来源、发现性、人工同步安全边界和项目触发关系。

## 页面状态

无 UI 状态。命令行结果只需区分：同步成功、来源非法、tag 移动、版本降级和内容校验失败。

## 响应式与钉钉 WebView

不适用。

## 交互文案

- 已是当前固定版：`Compound Engineering 已锁定清单声明的正式版本。`
- 完成人工同步：`请审查 Skill、脚本和许可证差异后提交普通 PR。`
- 非法来源：`上游内容未通过固定版本或目录安全检查，未修改项目 Skill。`

## 无障碍

不适用；所有结果以普通文本和 GitHub Checks 状态提供。

## 视觉验收

不适用。
