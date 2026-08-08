---
title: 核心开发者权限文件必须按实际交付物验收
date: 2026-08-08
category: runtime-errors
module: core-developer-access
problem_type: runtime_error
component: authentication
symptoms:
  - 成员收到个人权限文件后运行 npm start 仍无法进入核心开发模式
  - 有效 Token 因文件名、目录或权限与加载器假设不一致而未被读取
  - 同一成员存在有效与失效的多份交付文件，人工选择容易出错
root_cause: incomplete_setup
resolution_type: code_fix
severity: high
tags: [core-developer, onboarding, env-file, file-permissions, production-access]
---

# 核心开发者权限文件必须按实际交付物验收

## Problem

签发脚本、README 和本地加载器分别通过，并不代表成员拿到文件后能够启动。2026-08-08
的排查发现，实际交付文件与加载器写死的目录、文件名和 `0600` 权限假设不一致；另有旧
文件已经被撤销，却仍和有效文件放在一起。成员拿到错误副本或保持交付文件原名时，
`npm start` 无法进入预期的核心开发模式。

## Symptoms

- 当前有效的短文件通过正式 `/api/auth/session` 验证，但复制后的权限是 `0644`，旧加载器
  会以 `DEVELOPER_ACCESS_MODE_INVALID` 拒绝。
- 另两份权限为 `0600` 的旧文件调用正式会话接口返回 `401`，证明“文件格式正确”不等于
  Token 仍有效。
- 旧加载器只读取 `~/.config/product-flow-system/developer.env`，交付文件保持成员标识文件名
  或放在其他位置时不会被发现（`scripts/core-developer-access.mjs`）。

## What Didn't Work

- README 假设文件一定叫 `developer.env` 且位于 Downloads：这个假设没有来自实际交付物。
- 只验证签发数据库行、文件字段和单元测试：没有覆盖传输后的文件名、权限和成员操作。
- 看到 Token 存在就判断可以启动：旧副本可能已撤销，必须调用无副作用的正式会话接口。

## Solution

1. 将新的仓库外配置目录固定为 `~/.config/EC-management-system/`。成员只需把收到的个人
   文件原样放进去，不改名（`README.md`）。
2. `loadDeveloperAccess` 读取目录内唯一的非隐藏条目；多份文件以
   `DEVELOPER_ACCESS_AMBIGUOUS` 失败，避免静默选错（`scripts/core-developer-access.mjs`）。
3. 加载器继续拒绝符号链接、非普通文件和非当前用户文件；对于当前用户拥有的普通文件，
   自动把权限收紧为 `0600` 后再解析。
4. 迁移期间继续读取旧 `~/.config/product-flow-system/developer.env`，避免已经正确安装的成员
   被新目录规则中断。
5. README 在安装依赖前就从 `upstream/dev` 创建功能分支，避免成员在默认 `main` 上运行
   尚未包含新加载规则的代码。

## Why This Works

文件名不再承担身份或权限含义，成员收到什么名字就放什么名字；唯一文件约束阻止旧副本
和新副本同时参与选择。自动收紧权限保留了 Token 不向同机其他用户开放的安全边界，同时
消除了聊天、下载或 Finder 复制导致的 `0644` 摩擦。旧路径只作读取回退，因此升级不要求
已经安装成功的成员立即搬迁。

## Prevention

- 签发后必须用“最终准备发送的那一个文件”完成验收，而不是用生成过程中的另一个副本。
- 验收至少覆盖：保持交付文件名、模拟复制后的 `0644`、`npm start`、本地页面 200、本地
  `/api/auth/session` 200 且 `loginMode=local-online-account`，全程不得打印 Token。
- 重新签发后，把旧副本明确移出交付目录；不要仅凭文件名或修改时间判断哪份有效。
- README 合同与加载器行为必须在同一变更中更新，并保留真实交付形态的回归测试
  （`tests/core-developer-access.test.mjs`）。

## Related Issues

- `docs/features/core-developer-access/prd.md`
- `docs/decisions/2026-07-18-production-data-access.md`
- `docs/platform/environment-capabilities.json`
