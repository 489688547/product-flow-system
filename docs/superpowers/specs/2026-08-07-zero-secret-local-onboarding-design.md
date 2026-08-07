# Fork 后零 Secret 本地启动设计

- 状态：待实现
- 日期：2026-08-07
- 分支：`codex/aliyun-deployment`
- 关联事项：`DEV-000014`

## 问题

仓库根目录没有 `README.md`。新成员 fork 后无法从 GitHub 首页找到受支持的本地
启动路径；同时 `npm start` 启动的是本地 SQLite 沙箱，却仍强制读取共享 `.env`，
缺少文件时提示配置个人 Token 和平台连接。这让本来不需要生产凭据的本地启动被
错误阻断，也容易诱导成员索取或复制不该共享的 Secret。

## 决策

1. 根目录新增 `README.md`，第一屏给出零 Secret 快速启动：安装依赖、构建、初始化
   本地 SQLite、启动和访问地址。
2. `npm start` 在没有 `.env` 时使用空的本地环境继续启动；存在 `.env` 时仍只读取
   允许的本地值，并继续剔除生产数据 Token、Cloudflare Token 和本地线上模式变量。
3. `.env.example` 按用途分组并明确标注：默认本地沙箱无需复制此文件；钉钉、快麦、
   灵算、生产检查等配置只属于获授权的真实平台验证或服务器运行时。
4. README 将本地沙箱、固定测试站和生产站分开说明。本地无 Secret 模式可以运行
   React、Pages Functions 和双本地 SQLite，但不伪造员工身份，不调用钉钉、快麦、
   灵算或生产数据；需要真实登录和外部平台能力时使用固定测试站。
5. 不新增共享开发 Token、默认生产凭据、硬编码员工身份、浏览器 Secret 或远程
   数据库回退。

## 实现边界

- `scripts/shared-local-env.mjs` 提供可选读取接口：文件不存在时返回空值和
  `exists: false`，原有强制读取接口继续供确实需要 `.env` 的运维脚本使用。
- `scripts/start-local-sandbox.mjs` 改用可选读取接口，并输出“未发现 `.env`，正在以
  零 Secret 沙箱启动”的明确信息。
- `tests/local-online-start.test.mjs` 和 `tests/local-sandbox.test.mjs` 锁定无 `.env`
  行为、生产 Secret 剔除和 README 快速启动契约。
- `AGENTS.md` 与本 ADR/设计中的本地运行规则同步为零 Secret 沙箱事实源。

## 验收

1. 在没有根目录 `.env` 的干净 fork 中，`npm run seed:sandbox` 后 `npm start` 不再
   报“缺少共享 .env”或要求个人 Token。
2. `http://127.0.0.1:8127/` 可打开；本地 API 使用仓库 `.wrangler/state` 下的双
   SQLite，且不读取生产库。
3. README 第一条路径无需任何 Secret；Token 表格明确写出用途、是否必需和获取
   边界，不包含真实值或控制台私有链接。
4. 启动器继续剔除 `PRODUCTION_DATA_ACCESS_TOKEN`、`CLOUDFLARE_API_TOKEN` 和
   `LOCAL_ONLINE_*`；真实平台动作不能在零 Secret 沙箱中被误报为可用。
5. 本地启动相关测试、环境/集成门禁和仓库 Definition of Done 通过。

## 回滚

回退 README、可选环境读取接口和对应测试即可恢复原行为；不会修改任何数据库、
Token、平台连接、部署环境或线上数据。
