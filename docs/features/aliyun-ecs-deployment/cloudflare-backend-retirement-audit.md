# Cloudflare 业务后端退役审计

日期：2026-08-06

## 当前边界

| 环境 | 前端 | API | 在线数据库 |
|---|---|---|---|
| 本地 | Vite | 本地 Functions | 本地 SQLite 沙箱 |
| 测试 | Cloudflare Pages 静态文件 | 阿里云 ECS `api-test` 容器 | ECS 测试 SQLite |
| 生产 | 阿里云 ECS | 阿里云 ECS 生产容器 | ECS 生产 SQLite |

## 已删除

- Cloudflare D1 远程导出和远程开发入口。
- Pages Functions/D1 环境一致性脚本及配置器。
- 根目录 Pages 发布包、旧兼容入口和静态 OAuth 服务端替身。
- 本地生产账号传输密钥、远程 Worker 身份注入和相关 UI。
- Cloudflare 业务后端与数据库回滚路径。

## 保留

- `functions/` 作为 ECS workerd/Wrangler 兼容运行时的唯一 API 源码。
- binding 名 `PRODUCT_FLOW_DB` 与 `DEMO_FLOW_DB` 作为存储接口兼容名；在 ECS 均映射为本地 SQLite，不含远程 ID。
- Cloudflare Pages 仅用于 `dev` 的静态测试前端，上传工作流强制排除 Functions、数据库配置与 Secret。
- 历史一次性迁移 SQL、manifest 与 SHA-256 证据只保存在受限 ECS/OSS 运维目录；仓库不保存业务数据导出。

## 迁移证据

2026-08-06 从 ECS 只读复核 `/opt/product-flow/import/manifest.json` 与导入完成标记：

- `PRODUCT_FLOW_DB`：195,351,093 bytes，SHA-256 `83a8750594097345d8590d4f1681a26d32b6ff9b807c54884073e3d0bc707852`。
- `DEMO_FLOW_DB`：79,569,962 bytes，SHA-256 `f8ba143f00abe9ac7a1fd8741dc856e48f494851389ac432422feb15b959f632`。
- ECS 在线 SQLite `PRAGMA quick_check` 均为 `ok`；正式库 121 张表，展示库 111 张表。
- 导入清单与 `.pfs-import-complete.json` 内容一致，创建时间为 `2026-07-29T09:19:50.231Z`。

## 回滚

应用回滚使用上一个已验收 ECS 镜像；数据回滚使用发布前 SQLite/OSS 快照。不得重新启用 Cloudflare Functions、Workers 或 D1。
