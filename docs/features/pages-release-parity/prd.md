# Pages 发布一致性 PRD

## 文档状态

- 状态：开发中
- 负责人：平台维护者
- 最近更新：2026-07-20

## 背景与问题

Cloudflare Pages 存在两条生产发布路径：人工从仓库根目录发布，以及 GitHub 合并后自动发布 `dist`。根目录发布包包含 `cloudflare-entry.html`、`_headers` 和 `_redirects`，但 `npm run build` 生成的 `dist` 不包含这些文件。自动部署接管生产别名后，已缓存的旧入口仍引用上一部署的 hashed JS，而新部署既没有旧资源，也没有 `/cloudflare-entry`，最终造成生产白屏。

## 目标

1. `npm run build` 直接生成可部署的完整 `dist`。
2. 手动根目录发布与自动 `dist` 发布包含相同入口、缓存规则和根路径重写。
3. 入口 HTML 永不长缓存，hashed 静态资源可以独立缓存。
4. 构建测试在缺少任一发布契约文件时失败。

## 非目标

- 不更换 Cloudflare Pages、生产域名或 D1。
- 不修改业务页面、权限、数据或 Provider 配置。
- 不删除现有已完成部署。

## 用户与权限

- 所有公司员工继续通过现有生产域名和钉钉会话使用系统。
- 只有已获生产部署授权的维护者可发布；本次不新增权限。

## 当前流程

1. `npm run build` 只生成 Vite 默认 `dist/index.html` 和 assets。
2. `npm run release:pages` 额外把入口和资源同步到仓库根目录。
3. Cloudflare Git 自动构建只发布 `dist`，因此与手动发布包不同。

## 目标流程

1. `npm run build` 完成 Vite 构建后补齐 `dist/cloudflare-entry.html`、`dist/_headers` 和 `dist/_redirects`。
2. 自动部署直接发布完整 `dist`。
3. `npm run release:pages` 继续从同一 `dist` 同步根目录发布包。
4. 每次部署后同时验证入口和入口引用的主 JS/CSS。

## 业务规则

- `/`、`/cloudflare-entry` 和 HTML 响应必须使用 `no-store, max-age=0, must-revalidate`。
- 构建产物中的 `cloudflare-entry.html` 必须与 `index.html` 完全一致。
- `_redirects` 必须把根路径重写到 `/cloudflare-entry.html`。
- 缺少入口、缓存规则或重写规则时构建失败，不允许发布不完整目录。

## 数据定义

本次不新增或迁移业务数据。发布契约文件属于静态构建产物，不进入 D1。

## 异常与边界

- Vite 构建失败：不生成或发布产物。
- 发布契约源文件缺失：后处理脚本失败并阻断构建。
- Cloudflare 自动部署覆盖生产：完整 `dist` 仍提供相同入口和缓存规则。
- 旧浏览器标签页：继续由现有动态分包恢复逻辑处理。

## 验收标准

1. 新鲜执行 `npm run build` 后，`dist/cloudflare-entry.html`、`dist/_headers`、`dist/_redirects` 均存在。
2. `dist/cloudflare-entry.html` 与 `dist/index.html` 内容一致。
3. 从 `dist` 创建的 Pages 部署中，`/cloudflare-entry` 与其引用的主 JS/CSS 均返回 200。
4. 生产稳定域名入口返回无缓存响应，钉钉登录页或业务页面可正常渲染。

## 上线与回滚

- 上线不涉及迁移和功能开关。
- 若后处理阻断正常构建，可回滚构建脚本提交并继续使用已知良好发布包恢复生产。
- 生产白屏时优先重新部署最近已知良好完整发布包，不删除 D1 或会话数据。
