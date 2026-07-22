# 快麦 ERP 本地原始归档与完整导入实施计划

## 目标

把散落在公司 Mac 的快麦官方导出文件统一归档到 `~/Desktop/公司数据中心/快麦ERP/`，以哈希保证原文件不重不丢；通过固定范围采集令牌把脱敏最小索引和既有商品、库存、货流、销售投影写入生产 D1；安装每 15 分钟执行一次的 LaunchAgent，并完成现有历史文件回填、线上部署与 Git main 对齐。

## 架构方案

- `scripts/kuaimai-erp-collector/` 负责文件稳定性、磁盘空间、SHA-256、APFS clone/copy、资源识别、敏感字段剔除、最小索引和分块上传。
- 原始字节只留在桌面权限目录；本地 `manifest.jsonl` 记录相对路径和处理状态，来源文件不移动、不覆盖、不删除。
- `/api/platform/v1/erp-collection` 扩展为归档清单、固定范围采集令牌、批次和完成投影的统一服务端边界；采集令牌明文只返回一次，D1 只保存哈希。
- `src/domain` 保存标准索引与投影纯函数；快麦原始表头映射只存在本地适配器，业务 App 不解释 provider 字段。
- D1 保存文件清单、批次、质量问题、最小来源索引和现有业务事实，不保存完整原始行。
- 数据中心复用现有执行记录界面读取归档状态，不展示本机绝对路径或凭据。

## 稳定接口

- `POST /api/platform/v1/erp-collection/runners`：真实公司会话创建固定范围 `kuaimai_erp_ingest` 的采集令牌，明文只返回一次。
- `POST /api/platform/v1/erp-collection/ingest`：接受公司会话或有效采集令牌；请求包含 `archive`、`batch`、最多 500 条 `records` 和 `issues`，要求 `Idempotency-Key`。
- `GET /api/platform/v1/erp-collection/archives`：按资源、状态和日期读取归档清单与最近批次；响应不包含绝对路径。
- CLI：`preflight`、`upload`、`scan`、`archive-existing`、`install`。`scan` 无新文件时只写本地等待状态，不产生线上零值。

## 数据迁移

新增 `erp_file_archives` 和 `erp_collector_tokens`，为 `erp_collection_batches` 增加可空 `archive_id`。旧批次继续可读；既有 `erp_source_records.payload` 列保持兼容，但新写入只包含白名单最小索引。迁移同步更新环境能力清单、生成模块、API 目录、错误目录和集成注册表。

## TDD 顺序

1. 先写归档目录、去重、原子复制、稳定性、磁盘空间和 manifest 恢复的失败测试，再实现本地归档模块。
2. 先写迁移、令牌哈希、archive 幂等、最小 payload 和授权失败测试，再实现存储与 API。
3. 先写商品、库存、采购、售后和销售投影失败测试，再实现标准投影和完成批次语义。
4. 先写 scan、钥匙串、单实例和 LaunchAgent 无秘密契约测试，再实现 CLI 安装与自动运行。
5. 先写数据中心归档状态与空错禁用契约测试，再实现查询和页面状态。
6. 执行历史归档、真实文件预检/上传、生产迁移、部署、页面验收和 main 对齐。

## 风险与控制

- 原文件被误改：只 clone/copy，写临时目标、校验哈希后原子改名；绝不移动来源。
- 文件仍在下载：连续两次 stat 不一致则保持等待。
- D1 容量：完整行只在本地；服务端强制字段白名单和请求大小上限。
- 凭据泄漏：令牌仅存 macOS 钥匙串，D1 只存哈希，plist、日志、报告和 Git 禁止秘密。
- 部分写入：归档、批次和投影分状态；只有完整批次成功才切换快照。
- 平台表头变化：未知或缺失关键表头时归档保留、上传停止并生成脱敏报告。
- 磁盘或网络失败：不移动来源；下一轮按哈希和幂等键恢复。

## 回滚

1. 卸载或停用 LaunchAgent，撤销采集令牌；保留本地归档和来源文件。
2. 回退 Pages 部署；新表和 archive ID 保留，不影响旧版本读取。
3. 按 archive ID 删除本次新增批次和投影时先留快照与审计，不删除本地原始文件。
4. 若迁移 NAS/R2，只更新 archive 存储位置，不改变哈希和 archive ID。

## 验证命令

```bash
node --test tests/kuaimai-erp-local-archive*.test.mjs
node --test tests/kuaimai-erp-collection*.test.mjs
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

真实验收另外核对桌面目录权限与哈希、钥匙串、LaunchAgent、生产 D1 数量、生产 API、Pages 页面、Git main 和来源文件仍存在且字节一致。

