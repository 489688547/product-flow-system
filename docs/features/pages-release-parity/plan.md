# Pages 发布一致性实施计划

## 目标

让 `npm run build` 生成可由 Cloudflare Git 自动部署的完整 `dist`，消除手动与自动发布包差异。

## 架构方案

在 Vite 构建后运行单一后处理脚本，将 `dist/index.html` 复制为兼容入口，并把仓库级 `_headers`、`_redirects` 复制到 `dist`。根目录手动发布继续由现有 release 脚本从同一构建结果生成，避免两套入口内容。

## 文件职责

- `scripts/prepare-pages-build.mjs`：补齐 `dist` 入口、缓存和重写契约。
- `package.json`：在 Vite 构建后执行该脚本。
- `react-tests/deployment-recovery.test.mjs`：约束自动部署产物完整性。
- `scripts/prepare-pages-release.mjs`：继续同步根目录发布包，并以 `dist` 为事实源。
- `docs/platform/architecture.md`：记录自动与手动发布必须同构。

## 接口与契约

脚本不接受业务输入；从当前工作目录读取 `dist/index.html`、`_headers`、`_redirects`，写入 `dist/cloudflare-entry.html`、`dist/_headers`、`dist/_redirects`。任一源文件缺失时以非零状态失败。

## 数据迁移

无数据迁移、容量变化或 D1 写入。

## 风险与回滚

- 风险：Cloudflare 构建命令未使用 `npm run build`。通过部署列表与实际产物验证。
- 风险：入口缓存规则未生效。通过响应头验证 `no-store`。
- 回滚：重新部署已知良好完整发布包，并回滚构建后处理提交。

## 验证命令

```bash
node --test react-tests/deployment-recovery.test.mjs
npm run build
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
```

生产验证：入口、入口引用的主 JS/CSS、匿名 API 认证响应和 Chrome 登录态渲染。

## 任务顺序

1. 写失败的发布契约测试。
2. 实现最小构建后处理并跑绿。
3. 更新平台架构规则并执行全量门禁。
4. 发布完整产物并验证自动部署兼容入口。
