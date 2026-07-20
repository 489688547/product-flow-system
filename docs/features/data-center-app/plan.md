# 数据中心连接器与加密保险箱实施计划

## 数据口径扩展

2026-07-20 已确认的数据口径 CRUD、版本化、安全公式、计算结果和数据总览切换，按独立实施计划执行：[`data-standards-plan.md`](./data-standards-plan.md)。该扩展继续使用 `PRODUCT_FLOW_DB`，会新增 D1 表和 `/api/platform/v1/data-standards` 共享契约，因此实施前后必须执行环境能力、集成路由、迁移、回滚和完整 Definition of Done 检查。

## 交付策略

按三个可以独立验收和回滚的阶段交付：

1. 连接器目录与加密保险箱：内置平台、专属配置弹窗、内部系统保险箱、D1 密文、权限、查看/替换和审计。
2. 本地采集器与任务调度：机器身份、短时 task grant、`07:30` 日任务、人工验证恢复和按月历史回填。
3. 生产迁移与平台适配：在单独授权窗口导入钉钉账密表，逐个平台验证真实导出/API/页面适配器并启用生产同步。

本轮实施阶段 1。阶段 2 依赖阶段 1 的 credential-vault API；阶段 3 依赖真实账号、生产迁移和外部平台操作授权，不能由本地 UI 完成情况替代。

## 阶段 1 架构

- `src/domain/dataCenterConnectors.js` 保存纯连接器定义、字段 schema、状态优先级和输入校验。
- `functions/api/platform/_shared/credentialCrypto.js` 只负责 AES-256-GCM 和密钥版本。
- `functions/api/platform/_shared/credentialVaultStorage.js` 只负责 D1 条目、权限和追加式审计。
- `/api/platform/v1/credential-vault*` 提供脱敏列表、创建/替换、归档和受控 reveal。
- `functions/api/data-center/connectors.js` 保存非敏感连接实例及凭证引用；保存配置不改变真实连接状态。
- `src/state/dataCenterConnectionsApi.js` 是连接器和保险箱的唯一前端 API 客户端。
- `src/features/data-center/connections/` 组合连接器目录、配置弹窗和内部保险箱；不直接调用外部平台。

## 数据迁移

新增 `migrations/0003_data_center_credentials.sql`：

- `data_connector_instances`
- `credential_vault_entries`
- `credential_vault_permissions`
- `credential_vault_audit`
- `internal_vault_items`

阶段 2 再新增 `data_runner_identities` 和 `data_runner_task_grants`，避免在没有采集器协议时提前创建无消费者的表。旧 `data_sources` 保留只读兼容，不在阶段 1 删除或自动迁移。

## 环境与发布

- 复用 Cloudflare Secret `PLATFORM_CREDENTIAL_MASTER_KEY`，值为 32 字节随机密钥的 base64url 表示；旧名 `DATA_CREDENTIAL_MASTER_KEY` 只保留服务端兼容读取。
- `docs/platform/environment-capabilities.json` 登记凭证表、D1 绑定和 Secret 名称，并重新生成平台清单。
- 本地测试使用每次测试生成的临时密钥，不把真实密钥写入 `.env.example`、日志或快照。
- 生产迁移前先运行环境就绪检查和数据库备份；未配置密钥时凭证写入、替换、reveal 返回 `CREDENTIAL_KEY_UNAVAILABLE`，非敏感目录仍可读取。

## 权限

- 总经办非只读身份：创建、替换、归档、reveal、权限管理。
- 运营部非只读身份：维护经营连接器并替换相应凭证，阶段 1 不开放 reveal。
- 财务、产品、供应链：只读连接状态，无凭证元数据列表权限。
- 内部保险箱：阶段 1 仅总经办管理和 reveal；条目级授权表先建立，细粒度授权 UI 在采集器阶段前交付。
- reveal 要求总经办、非只读、会话创建不超过 15 分钟、确认短语和用途；响应禁止缓存。

## 兼容与回滚

- 现有 `/api/data-center`、`/api/data-center/sales`、`product_sales_daily` 和七个左侧入口保持不变。
- 新页面读取失败时保留连接器目录并显示环境错误，不回退到 localStorage 保存敏感值。
- 回滚可隐藏新连接区并停用新 API；新表与密文保留，不覆盖主密钥、不物理删除审计。
- 旧前端继续读取 `data_sources`，新前端只写 `data_connector_instances`；阶段 2 再决定旧来源迁移。

## 验证

每个任务先写失败测试再实现。阶段 1 完成后运行：

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

并在 1440、900、640、390px 与钉钉 WebView 检查键盘、焦点、弹窗、空/错/禁用/无权限状态。未经单独授权不执行 Cloudflare 部署、D1 生产迁移或真实凭证导入。
