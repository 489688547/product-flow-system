# Product Flow System

## 核心开发者：Fork 后直接启动

准备：macOS、Git、Node.js 22。先在 GitHub 点 **Fork**，再把下面用户名替换成自己的：

```bash
git clone https://github.com/<你的 GitHub 用户名>/EC-management-system.git
cd EC-management-system
git remote add upstream https://github.com/489688547/EC-management-system.git
git fetch upstream dev
git switch -c feat/<功能名> upstream/dev
npm ci
```

把负责人单独发来的个人访问文件原样放进下面的固定文件夹，不需要改名：

```bash
mkdir -p ~/.config/EC-management-system
open ~/.config/EC-management-system/
```

第二条命令会打开文件夹。把收到的文件拖进去，回到项目目录运行 `npm start`。
程序只读取该文件夹内唯一的一份个人文件，并自动收紧文件权限。

打开 `http://127.0.0.1:8127/`。保存前端代码后页面会自动更新。

核心开发模式运行“本地 React 前端 + ECS 正式 API + 正式业务数据”。个人 Token 只在
本机 Node 代理中使用，不会进入浏览器。不要打开、打印、修改内容、发送到群聊，或把
个人访问文件放进仓库和 `.env`；文件丢失时立即通知负责人撤销权限。

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

首次提交前安装并登录 GitHub CLI。每个人使用自己的 GitHub 账号，不共享 Token：

```bash
brew install gh
gh auth login --hostname github.com --git-protocol https --web
```

上面已经从最新 `dev` 创建了功能分支。修改完成后提交并推送到自己的 Fork：

```bash
git status --short
git add <本次修改的文件>
git commit -m "feat: 简述本次修改"
git fetch upstream dev
git rebase upstream/dev
git push -u origin HEAD
gh pr create --repo 489688547/EC-management-system --base dev --web
```

最后一条命令会打开 GitHub 的 PR 页面：目标分支保持 `dev`，按页面模板填写后提交。
提交前运行项目 `AGENTS.md` 中的完整验证命令；固定测试环境验收通过后，再由
`dev → main` 发布。

如果 Codex 的 GitHub App 返回 `403 Resource not accessible by integration`，说明 App
没有该私有仓库的 PR 写权限，不是代码或个人账号出错。不要反复重试 App；确认
`gh auth status` 显示自己的账号后，使用上面的 `gh pr create` 提交。
