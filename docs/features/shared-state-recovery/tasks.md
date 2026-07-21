# 产品全周期共享状态安全恢复任务

## 执行规则

- 每项任务只交付一个可独立验证的结果。
- 先写失败测试并确认失败原因，再写实现。
- 完成后记录实际验证命令和结果。
- 每次提交只包含当前任务文件。

## 任务

- [x] 保存事故证据并提取最后有效状态
  - 依赖：无。
  - 输出：事故后整库 SQL、当前与历史 Time Travel 书签、最后有效状态 JSON、SHA-256。
  - 验证：当前库已返回事故后书签；组织成员和商品目录计数与导出前一致。

- [x] 服务端阻断无基线和旧基线写入
  - 依赖：事故证据。
  - 文件：`react-tests/shared-state.test.mjs`、`functions/api/state.js`。
  - 失败测试：缺少 `baseUpdatedAt` 和冲突版本当前仍返回成功。
  - 输出：409 稳定错误、写前快照、普通会话审计、成功写入的新版本。
  - 验证：`node --test react-tests/shared-state.test.mjs`。

- [x] 客户端改为先读后写
  - 依赖：服务端版本契约。
  - 文件：`react-tests/shared-state-sync.test.mjs`、`react-tests/react-app.test.mjs`、`src/state/sharedStateSync.js`、`src/state/ProductFlowProvider.jsx`。
  - 失败测试：未加载服务器状态时当前代码仍能自动 POST 本地脏缓存。
  - 输出：服务器基线状态机、本机恢复副本、带版本保存和冲突提示。
  - 验证：`node --test react-tests/shared-state-sync.test.mjs react-tests/react-app.test.mjs`。

- [x] 反写平台规则并通过全量门禁
  - 依赖：客户端与服务端测试通过。
  - 文件：`AGENTS.md`、`docs/platform/api-catalog.md`、`docs/platform/architecture.md`、`docs/platform/integration-registry.json`、生成模块。
  - 输出：共享状态安全规则进入仓库事实源和 CI。
  - 验证：AGENTS.md Definition of Done 全部命令。

- [x] 部署保护并恢复生产状态
  - 依赖：全量门禁通过。
  - 输入：最后有效状态 JSON、当前生产 `updatedAt`、个人令牌和 15 分钟解锁。
  - 输出：生产恢复审计、3 个产品、26 个任务、4 个交付物、2 个产品计划、20 条评审记录。
  - 验证：恢复审计 `audit_e24437c8-85fe-4d28-8849-a7ad29088da2`；生产 API 与 D1 只读计数一致；旧请求缺少基线返回 409。

- [x] 消除无变化保存并封闭并发写入窗口
  - 依赖：生产状态已恢复。
  - 文件：客户端状态指纹、同步会话、D1 写入事务、修订清单迁移和契约测试。
  - 失败测试：仅组织缓存时间变化仍会保存；两个写入可使用同一基线成功。
  - 输出：无业务变化不 POST；清单比较、推进与分片替换在同一原子批次完成。
  - 验证：共享状态、React 同步和生产数据网关聚焦测试全部通过。

- [x] 合并部署并验证并发强化
  - 依赖：全量门禁通过。
  - 输出：生产部署包含状态指纹去重、D1 原子比较写入与修订清单迁移。
  - 验证：PR #36 合并为 `a2c47ad`；生产部署 `6d1d7ec9-d25f-4755-a24e-b002c99ad1fe`；D1 迁移书签 `0000016c-00000008-000050af-c14b09e5071bc2df7109204b4e47c7f6`；生产就绪检查于 2026-07-21 23:08（Asia/Shanghai）通过；线上保持 3 个产品、26 个任务、4 个交付物、2 个产品计划和 20 条评审记录。
