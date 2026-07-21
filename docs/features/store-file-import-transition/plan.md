# 店铺数据文件导入过渡实施计划

## 目标

将店铺平台从浏览器登录改为诚实的文件导入等待状态，并不可恢复地销毁现有店铺凭证、结束旧任务。

## 架构方案

领域定义将店铺连接器限制为 `export` 且不包含 secret 字段；功能页复用统一目录卡片并移除抖店自动连接组合。共享凭据保险箱新增受审计的 `destroyCredentialEntry`，旧抖店专属连接和通用连接分别通过现有服务端权限边界完成清理。标准事实表不变。

能力评审结论：`扩展现有能力`。文件导入方向复用现有连接器目录和 XLSX/CSV 流式解析能力；凭证不可恢复销毁扩展共享保险箱，不能在某个页面直接写 D1。

## 文件职责

- `src/domain/dataCenterConnectors.js`：店铺平台只声明文件导入，无登录字段。
- `src/features/data-center/connections/*`：目录等待状态，移除抖店专属工作区入口。
- `functions/api/platform/_shared/credentialVaultStorage.js`：销毁密文并保留审计。
- `functions/api/platform/v1/data-connections/*`：受控销毁专属抖店连接、任务和 grant。
- `functions/api/data-center/*`：归档通用店铺连接并销毁其凭据。
- `docs/platform/*`、`PRODUCT.md`：更新长期接入规则和平台生命周期。

## 接口与契约

- `destroyCredentialEntry(db, id, { expectedVersion }, context)`：校验当前版本；清空密文/IV；归档；追加 `destroy` 审计；成功后不能 reveal。
- `DELETE /api/platform/v1/data-connections`：仅最高权限管理员和新鲜会话；请求 `{ id, expectedVersion, confirmation: "销毁店铺凭证" }`。
- `PUT /api/data-center/connectors` 的 `destroy` 动作：仅总经办；归档通用店铺实例并销毁关联凭证。
- `POST /api/platform/v1/production-data/store-connections`：生产个人令牌与 15 分钟解锁保护的批量退役动作，清理专属连接、通用实例、孤立或已归档的店铺密文及活动任务，并保留无秘密快照和审计。

## 数据迁移

不增加表。生产清理只影响店铺连接元数据和凭证密文；历史标准事实和审计保留。容量只会减少活动连接和任务，不增加长期数据。

## 风险与回滚

- 风险：销毁不可逆。通过管理员权限、新鲜会话、精确确认和版本锁降低误操作。
- 风险：部分清理失败。顺序优先销毁秘密，再清理任务/实例；操作幂等，可再次执行。
- 回滚：可恢复旧 UI 代码，但凭证必须重新录入，不能从审计恢复。

## 验证命令

```bash
node --test tests/credential-vault-storage.test.mjs tests/data-connections-api.test.mjs tests/data-center-connectors-api.test.mjs
node --test react-tests/data-connections-ui.test.mjs react-tests/data-center-connections-ui.test.mjs react-tests/data-access-hub.test.mjs
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

部署后分别验证生产 API 权限、密文销毁结果、任务清理和页面状态；本地成功不替代生产证据。

## 任务顺序

1. 更新长期规则和失败测试。
2. 实现共享凭证销毁与 API 清理。
3. 改造店铺目录为文件等待状态。
4. 全量验证、部署、执行生产清理并停用本机 agent。
5. 推送 PR、合并主分支并再次验证生产。
