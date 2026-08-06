# 主干与测试发布流实施计划

1. 分支质量门禁校验 `codex/* -> dev -> main`。
2. `dev` 质量通过后，只上传 `dist/` 到 Cloudflare 测试项目。
3. 同一 commit 构建并部署 ECS 测试容器，保留独立环境文件和 SQLite 数据卷。
4. 固定测试域名通过 commit、OAuth、readiness、CORS 和业务 smoke 后，创建 `dev -> main`。
5. `main` 构建并滚动替换 ECS 生产容器；健康失败自动回到上一镜像，数据库回滚使用写前快照。

验证命令使用 `npm run check:deployed-smoke`，测试时分别传入前端 URL 与 API URL；生产两者都使用生产域名。
