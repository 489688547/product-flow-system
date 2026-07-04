# 钉钉接入配置

当前系统已支持钉钉 H5 微应用免登链路：

1. 前端在钉钉容器中调用 `requestAuthCode` 获取一次性免登码。
2. 服务端用 `DINGTALK_APP_KEY` / `DINGTALK_APP_SECRET` 获取应用 `access_token`。
3. 服务端用免登码换取当前钉钉用户，并尽量读取用户详情、角色、岗位信息。
4. 前端按钉钉岗位信息自动映射到系统角色权限，并在本地缓存 7 天。

## 本地启动

复制配置文件：

```bash
cp .env.example .env
```

填入钉钉开发者后台的企业内部应用凭证：

```bash
DINGTALK_APP_KEY=...
DINGTALK_APP_SECRET=...
DINGTALK_PORT=8127
```

启动：

```bash
npm start
```

本地访问：

```text
http://127.0.0.1:8127/
```

## 钉钉后台需要配置

- 应用类型：企业内部应用 / H5 微应用。
- 首页地址示例：`https://你的正式域名/?corpId=$CORPID$`
- 推荐用 Cloudflare Pages 发布，设置见 `CLOUDFLARE_PAGES.md`。
- 本地调试可用内网穿透或局域网地址替代 `127.0.0.1`，并同样带上 `corpId=$CORPID$`。
- 权限：免登、通讯录读取用户基本信息、查询用户详情。

没有 AppKey/AppSecret 时，系统只能检测钉钉环境，不能真正换取用户身份。
