# Product Flow System

## 核心开发者：Fork 后直接启动

准备：macOS、Git、Node.js 22。先在 GitHub 点 **Fork**，再把下面用户名替换成自己的：

```bash
git clone https://github.com/<你的 GitHub 用户名>/EC-management-system.git
cd EC-management-system
git remote add upstream https://github.com/489688547/EC-management-system.git
npm ci
```

把负责人单独发给你的 `developer.env` 从“下载”目录移到固定位置，然后启动：

```bash
mkdir -p ~/.config/product-flow-system
mv ~/Downloads/developer.env ~/.config/product-flow-system/developer.env
chmod 600 ~/.config/product-flow-system/developer.env
npm start
```

打开 `http://127.0.0.1:8127/`。保存前端代码后页面会自动更新。

核心开发模式运行“本地 React 前端 + ECS 正式 API + 正式业务数据”。个人 Token 只在
本机 Node 代理中使用，不会进入浏览器。不要打开、打印、改名、发送到群聊，或把
`developer.env` 放进仓库和 `.env`；文件丢失时立即通知负责人撤销权限。

## 开发前先选对模式

- 只改前端，或验证已经部署的后端：运行 `npm start`，使用 ECS 正式 API。
- 修改尚未部署的后端、数据库结构或做试验性写入：运行下面的本地 SQLite 沙箱。

```bash
npm run build
npm run seed:sandbox
npm run start:sandbox
```

`npm run start:sandbox` 始终忽略个人文件，运行“本地前端 + 本地 API + 本地 SQLite”。
测试性、试验性写入必须使用沙箱；核心开发模式中的修改会直接作用于正式数据。

## 没有个人文件时

`npm start` 会自动使用本地 SQLite 沙箱，不需要复制 `.env` 或申请 Token。首次使用：

```bash
npm run build
npm run seed:sandbox
npm start
```

个人文件只授予登记的数据权限，不包含钉钉、快麦或其他平台的明文凭据。

## 提交代码

```bash
git fetch upstream dev
git switch -c codex/<功能名> upstream/dev
```

推送到自己的 Fork 后，向原仓库提交 PR，目标分支选 `dev`。固定测试环境验收通过后，再由 `dev → main` 发布。
提交前运行项目 `AGENTS.md` 中的完整验证命令。
