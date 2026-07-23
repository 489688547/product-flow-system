# 测试数据以本地沙箱为唯一试验环境，不新增独立测试数据库

- 状态：已采纳
- 日期：2026-07-22

## 背景

产品负责人提出"把生产数据和测试数据分开"。当前本地线上模式、Preview、Production 共享同一个生产 D1（见 `docs/features/branch-environment-consolidation/prd.md`，已评审，非目标含"不新增第二个测试数据库"），测试性写入会直接落到生产数据。备选方案是给 Preview 新建独立测试 D1，但需要持续维护两套库的 schema 同步、独立的保险箱主密钥与仿真数据，治理与同步成本长期存在。

## 决策

1. 维持单一远程生产 D1 的既定架构，不新增第二个测试数据库；`branch-environment-consolidation` 的非目标保持不变。
2. 本地沙箱（`npm run start:sandbox`，本地 SQLite）升级为唯一的测试数据环境：一切测试性、试验性数据写入必须在沙箱进行；本地线上模式只用于真实业务操作与真实能力验证。
3. 补齐入口：`npm run start:sandbox` 与 `npm run seed:sandbox` 写入 `package.json`（此前文档已引用但脚本缺失）。
4. `scripts/seed-local-sandbox.mjs` 新增可选 `--with-state`：从生产库只读复制 `product_flow_state` 与 `product_flow_state_parts` 两张白名单表，让沙箱打开即见线上业务数据；凭据、令牌、审计类表一律不复制。沙箱中的修改只写本机，不回传生产。
5. Preview 与 Production 继续共享生产 D1 与同一保险箱密钥，既有就绪检查与环境一致性门禁不变。

## 备选方案

- Preview 独立测试 D1 + schema 同步脚本：能隔离 Preview 联调写入，但引入长期双库同步、独立密钥与仿真数据维护成本；当前单一开发者场景下收益不足，拒绝。若未来 Preview 出现多人验收或高频联调写入，可重新评估。
- 不做任何隔离、直接在生产库测试：数据污染风险不可接受，拒绝。

## 影响

- 测试与生产数据在数据层面天然零同步：沙箱是独立本地 SQLite，schema 由同一批 `migrations/*.sql` 应用，不存在双库漂移。
- 测试性写入的规则以 `AGENTS.md` 与 `CLOUDFLARE_PAGES.md` 为持久事实源；`tests/local-sandbox.test.mjs` 锁定入口脚本与播种白名单。
- 沙箱仍不能验证真实钉钉、快麦等外部平台动作；该类验证继续走本地线上模式。

## 回滚

删除 `package.json` 的 `start:sandbox` / `seed:sandbox` 脚本、seed 脚本的 `--with-state` 分支与 `tests/local-sandbox.test.mjs` 即可；沙箱底层能力（`--local-d1`、`wrangler.local.toml`）按 `2026-07-21-local-d1-sandbox.md` 独立保留。
