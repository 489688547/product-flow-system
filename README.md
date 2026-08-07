# Product Flow System

## 核心开发者：拿到一个文件后启动

1. Fork 并克隆仓库，然后安装依赖：

   ```bash
   npm ci
   ```

2. 把负责人单独发给你的 `developer.env` 固定放到：

   ```text
   ~/.config/product-flow-system/developer.env
   ```

   在 macOS 上确认权限：

   ```bash
   chmod 600 ~/.config/product-flow-system/developer.env
   ```

3. 启动：

   ```bash
   npm start
   ```

   打开 `http://127.0.0.1:8127/`。本地 React 前端会使用你的个人身份访问 ECS
   正式 API 和正式业务数据；个人 Token 只存在于本机 Node 代理，不会进入浏览器。

## 没有个人文件时

`npm start` 会自动使用本地 SQLite 沙箱，不需要复制 `.env` 或申请 Token。首次使用：

```bash
npm run seed:sandbox
npm start
```

无论是否已有个人文件，`npm run start:sandbox` 都会强制使用本地 SQLite。测试性、
试验性写入必须在沙箱完成；核心开发模式的修改会直接作用于正式数据。

## 前端与后端开发边界

- 核心开发模式：本地前端代码 + 已部署 ECS 后端，适合验证真实数据和正式 API。
- 沙箱模式：本地前端 + 本地 Functions + 本地 SQLite，适合开发尚未部署的后端代码。
- 个人文件只授予登记的数据权限，不包含钉钉、快麦或其他平台的明文凭据。
- 文件丢失时立即通知负责人撤销个人 Token；不要发送到群聊、提交到 Git 或复制进 `.env`。

## 提交代码

功能分支从最新 `dev` 创建，PR 只合入 `dev`；固定测试环境验收通过后，再由
`dev → main` 发布。提交前运行项目 `AGENTS.md` 中的完整验证命令。
