# 采集器双模式执行任务

## 执行规则

- 每项任务只交付一个可独立验证的结果。
- 先写失败测试并确认失败原因，再写实现。
- 完成后记录实际验证命令和结果。
- 每次提交只包含当前任务文件。
- 阿里云部署路径和全局数据中心 UI 由现有研发待办占用时不得修改；先完成无冲突的领域与 Runner 工作。

## 任务

- [x] 领域模板与签名执行包
  - 依赖：无。
  - 文件：`src/domain/collectorTemplates.js`、`tests/collector-template-domain.test.mjs`。
  - 输入：PRD 中的模板、步骤、版本、权限和信任等级规则。
  - 输出：模板规范化、不可变改版、执行包验证和信任等级函数。
  - 失败测试：`node --test tests/collector-template-domain.test.mjs`，预期因领域模块不存在失败。
  - 实现步骤：锁定 schema；实现规范化和稳定哈希输入；实现版本与执行包验证；实现信任等级。
  - 验证：聚焦测试全部通过，未知步骤、错误角色、过期和哈希不一致均 fail closed。
  - 实际证据：`node --test tests/collector-template-domain.test.mjs` 7/7；
    `npx eslint src/domain/collectorTemplates.js tests/collector-template-domain.test.mjs` 通过。
  - 提交：领域文件、测试和任务证据，提交信息 `feat(collector): add versioned template contract`。

- [x] 本机实验步骤与资源限制
  - 依赖：领域模板与签名执行包。
  - 文件：`scripts/web-data-collector/experimental/`、`tests/web-data-collector-experimental.test.mjs`。
  - 输入：已验证执行包、浏览器控制器和每次运行独立工作区。
  - 输出：JavaScript、Python、命令、条件、循环、变量和下载步骤执行结果。
  - 失败测试：`node --test tests/web-data-collector-experimental.test.mjs`，预期因执行器不存在失败。
  - 实现步骤：先做顺序调度；再加浏览器和本机步骤；最后加条件循环、超时、输出和进程树限制。
  - 验证：所有步骤可恢复；超时终止完整进程树；日志不含 Cookie、Token 或数据库 Secret。
  - 实际证据：`node --test tests/web-data-collector-experimental.test.mjs` 6/6；
    真实 Python 与 Node 子进程、浏览器下载句柄、条件循环、超时、输出上限和敏感结果均通过；
    聚焦 ESLint 通过。
  - 提交：实验执行器与聚焦测试，提交信息 `feat(collector): add local experimental executor`。

- [x] 实验 SQLite 与版本化检查点
  - 依赖：本机实验步骤与资源限制。
  - 文件：`scripts/web-data-collector/experimental/store.mjs`、`scripts/web-data-collector/checkpoints.mjs`、
    `tests/web-data-collector-checkpoints.test.mjs`。
  - 输入：运行事件、步骤结果、安全变量、文件哈希和质量结果。
  - 输出：`untrusted/validated` 本机结果与可恢复检查点。
  - 失败测试：聚焦检查点测试预期因模板版本、内容哈希和实验运行存储缺失失败。
  - 实现步骤：扩展原子检查点；实现本机 SQLite schema；实现保存、恢复、清理和信任等级限制。
  - 验证：重启可恢复；错版本拒绝；实验结果无法标记 `trusted`。
  - 实际证据：领域、执行器、SQLite、检查点聚焦测试合计 22/22；
    SQLite 重启读取、`untrusted → validated`、`trusted` 拒绝、模板错版本拒绝、断点跳过已完成网页步骤
    和聚焦 ESLint 均通过。
  - 提交：本机存储和检查点，提交信息 `feat(collector): persist experimental run checkpoints`。

- [x] 模板与运行服务端 API
  - 依赖：领域模板与签名执行包；环境清单继续等待 `DEV-000014` 释放共享路径。
  - 文件：`functions/api/platform/v1/web-collection/templates.js`、
    `functions/api/platform/v1/web-collection/runs.js`、
    `functions/api/platform/v1/web-collection/_shared/storage.js`、
    `migrations/0018_collector_templates.sql`、`tests/web-collection-api.test.mjs`。
  - 输入：公司会话、Runner Token、幂等键、乐观版本和模板领域规则。
  - 输出：模板 CRUD/发布、运行创建/读取/动作和签名执行包。
  - 失败测试：聚焦 API 测试预期因新路由、权限、存储和错误码缺失失败。
  - 实现步骤：先加迁移和 mock；再加存储接口；最后加路由、授权、幂等、审计和签名。
  - 验证：无会话、错误角色、错误设备、重复写、版本冲突、过期和篡改均返回稳定错误。
  - 实际证据：模板/运行 API、迁移、签名执行包和 Runner 客户端测试 20/20；
    `npm run test:web-collector` 161/161；质量结果只接受 5 个登记字段，任意输出字段在入库前拒绝；
    展示数据目录对 4 张控制面表均为 `skip`。
  - 提交：API、迁移和测试，提交信息 `feat(collector): add template and run APIs`。

- [x] 正式兼容与双模式编排
  - 依赖：本机存储、服务端 API。
  - 文件：`scripts/web-data-collector/orchestrator.mjs`、`scripts/web-data-collector/api.mjs`、
    `tests/web-data-collector-runtime.test.mjs`。
  - 输入：现有 Provider 任务或新签名模板运行。
  - 输出：保持旧任务行为的 `formal` 路由和默认关闭的 `experimental` 路由。
  - 失败测试：运行时测试预期因模式路由、开关和实验信任限制缺失失败。
  - 实现步骤：兼容解析旧任务；接实验领取与执行；接事件和检查点；锁定正式事实 writer 边界。
  - 验证：现有快麦/抖店测试不变；关闭实验开关后不领取实验任务；实验结果不能调用正式 writer。
  - 实际证据：实验 CDP 浏览器 2/2，模板/执行器/检查点/运行时聚焦回归 53/53；
    Runner 和服务端实验开关默认关闭，显式启用后才领取执行包；失败只回传稳定错误码与固定安全摘要；
    正式快麦/抖店运行时回归保持通过。
  - 提交：编排和回归测试，提交信息 `feat(collector): route formal and experimental runs`。

- [ ] 可移植契约与交付验证
  - 依赖：双模式编排。
  - 文件：`docs/platform/apis/web-collection-v1.md`、`docs/platform/data-acquisition.md`、
    `docs/decisions/2026-07-30-dual-mode-collector-runtime.md` 和验证失败要求的文件。
  - 输入：Cloudflare 当前实现与 `DEV-000014` 提供的阿里云存储/运行时边界。
  - 输出：业务中立存储接口、相同契约测试、长期规则和回滚说明。
  - 失败测试：存储适配契约测试预期因实现包含 Cloudflare/D1 专属字段或错误码漂移失败。
  - 实现步骤：抽取存储契约测试；运行 Cloudflare 实现；向阿里云事项交付相同测试；更新长期文档。
  - 验证：聚焦、完整 Definition of Done、Pages Functions build 和本机非敏感实验验收全部通过。
  - 提交：契约、文档与验证证据，提交信息 `docs(collector): define portable execution boundary`。
