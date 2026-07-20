# 本地线上账号一致性实施计划

## 目标

让标准本地启动入口以当前真实最高权限账号运行完整 Pages Functions，使数据和外部动作与线上一致，同时确保令牌只在本机服务端且非本地主机不能使用。

## 架构方案

Wrangler Pages Dev 作为唯一完整本地后端，远程绑定生产 D1，并通过 `--proxy` 使用 Vite 热更新前端。API 中间件仅在回环主机和显式开关下读取服务端 `PRODUCTION_DATA_ACCESS_TOKEN`，复用生产令牌校验模块得到真实组织身份后注入标准会话。之后所有请求进入现有线上路由，因此 D1 写入、钉钉与快麦动作自然复用正式权限、适配器、幂等和审计规则。

## 文件职责

- `functions/api/platform/_shared/productionDataAccess.js`：增加原始令牌校验入口并返回完整组织身份。
- `functions/api/_middleware.js`：用真实令牌会话替换硬编码只读预览身份。
- `scripts/start-local-online.mjs`：管理 Vite 与 Wrangler 两个子进程，提供单一启动和退出行为。
- `package.json`、`启动服务.command`：把标准本地入口切换到完整线上账号运行时。
- `src/state/AuthProvider.jsx`：移除会话失败时的硬编码假账号回退。
- `src/ui/LocalOnlineEnvironmentBanner.jsx`：业务中立的本地线上环境提示。
- `src/App.jsx`、全局样式：在所有 App 主内容顶部显示提示并覆盖窄屏。
- `docs/platform/environment-capabilities.json`、`docs/platform/integration-registry.json`：登记新开关、本地完整运行时和平台关系。
- `.agents/skills/environment-parity/SKILL.md`、`AGENTS.md`、平台文档与 ADR：反写长期规则。
- `tests/dingtalk-web-auth.test.mjs`：身份、能力和域名边界契约。
- `tests/local-production-data-client.test.mjs`、新增启动器测试：废除外部动作本地阻断并锁定标准启动方式。
- React 测试：锁定假账号删除和全局风险提示。

## 接口与契约

- `authorizeProductionToken(rawToken, db, { capability = "read", now = new Date() })` → `{ tokenHash, capabilities, corpId, userId, unionId, name, department, title, role }`。
- `authorizeProductionAccess(request, db, options)` 保持现有 Bearer API，内部调用 `authorizeProductionToken`，兼容生产数据网关。
- 本地会话结构沿用正式会话字段，额外设置 `loginMode: "local-online-account"`。
- HTTP `GET`、`HEAD` 映射 `read`；其他方法映射 `write`。
- `npm start` 启动 Vite `127.0.0.1:8132` 和 Wrangler Pages Dev `127.0.0.1:8127`；浏览器只使用 8127。

## 数据迁移

不新增或修改业务表。现有令牌表与组织成员表继续使用；令牌查询增加组织展示字段。环境清单增加 development 能力项并重新生成模块。旧变量 `LOCAL_LIVE_D1_PREVIEW` 被 `LOCAL_ONLINE_ACCOUNT_MODE` 替代，不做运行时兼容，避免旧只读语义继续存在。

## 风险与回滚

- 令牌泄漏：只读服务端 env，测试扫描响应与构建产物；发现泄漏立即撤销令牌。
- 误用生产域名：严格校验回环 hostname；生产域名契约测试必须返回 401。
- 外部动作重复：不在验收中创建无业务意义动作；真实业务操作继续依赖原幂等与查询状态。
- D1 误写：页面持续展示线上真实环境；业务 API 原版本冲突和审计保留。
- 启动失败：父进程打印缺失配置并同时关闭子进程；可回滚到上一版启动器。
- 应用回滚：撤销个人令牌、恢复旧中间件和启动入口；无数据迁移需要回退。

## 验证命令

- `node --test tests/dingtalk-web-auth.test.mjs tests/production-data-access.test.mjs`
- `node --test tests/local-production-data-client.test.mjs tests/local-online-start.test.mjs`
- `node --test react-tests/local-online-account-ui.test.mjs react-tests/local-dev-login.test.mjs`
- `npm run generate:platform-manifests`
- `npm run check:environment-capabilities`
- `npm run lint`
- `npm run check:governance`
- `npm run check:integrations`
- `npm test`
- `npm run build`
- 本地 8127 验证真实会话、生产 D1 读写路径和提供商就绪状态；不自动创建真实待办或日历。
- 部署后 `npm run verify:production -- --require-platform cloudflare-pages --require-platform cloudflare-d1 --require-platform dingtalk --require-platform kuaimai`。

## 任务顺序

1. 用失败测试定义真实令牌会话、读写能力和非本地域名边界。
2. 扩展生产令牌校验并替换中间件只读假身份。
3. 用失败测试定义唯一完整本地启动器，接入 Vite 与 Wrangler。
4. 删除浏览器假账号回退，增加全局线上真实环境提示并完成响应式验收。
5. 更新环境清单、集成注册表、Skill、AGENTS、平台文档与 ADR并生成模块。
6. 跑完整门禁、本地真实只读验收、合并 main、部署并确认生产正式登录不变。
