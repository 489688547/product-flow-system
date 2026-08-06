# 主干与测试发布流 PRD

## 目标

`dev` 是唯一测试候选分支，`main` 是唯一生产分支。功能分支只合并到 `dev`；测试通过后只允许 `dev -> main` 发布。

## 固定环境

- `dev` 静态前端：`https://test.deshan-tiyes.cn`，由 Cloudflare Pages 只发布 `dist/`。
- `dev` API：`https://api-test.deshan-tiyes.cn`，运行于 ECS 独立测试容器与 SQLite。
- `main` 前端、API、SQLite：`https://deshan-tiyes.cn`，运行于 ECS 生产容器。

任意临时 Preview URL、服务器 IP 或本地地址都不能代替固定环境验收。Cloudflare 不承载 API、Functions 或数据库。

## 验收

1. `dev` 同一 commit 同时出现在测试前端与测试 API。
2. 测试站登录、readiness、业务读写和钉钉 WebView 通过。
3. `dev -> main` 后生产域名报告同一目标 commit，并通过相同生产检查。
