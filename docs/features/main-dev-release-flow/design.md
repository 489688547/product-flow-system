# 主干与测试发布流设计

```text
codex/* -> PR(dev) -> Cloudflare 静态测试前端
                     ECS 测试 API + 测试 SQLite
                     固定测试站验收
dev -> PR(main) -> ECS 生产前端 + API + 生产 SQLite
```

测试前端通过编译期 `VITE_PFS_API_ORIGIN` 调用固定测试 API。API 使用精确 CORS 白名单和凭据 Cookie；浏览器不能选择数据库或运行环境。
