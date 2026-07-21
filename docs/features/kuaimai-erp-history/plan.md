# 快麦 ERP 历史数据采集实施计划

## 目标

交付可重复执行的快麦文件预检、幂等入库、订单历史补数和项目内采集 Skill。

## 架构方案

已登录 Chrome 只负责官方文件导出。本机脚本负责流式解析、表头映射、脱敏检查和分块；Pages Functions 负责真实组织授权、D1 幂等写入、批次审计和对既有领域表的投影。提供商原始字段只进入 `erp_source_records.payload`，不泄漏进领域模型。

## 文件职责

- `src/domain/kuaimaiErpCollection.js`：纯函数形式的资源、表头、日期、来源键和记录标准化。
- `scripts/kuaimai-erp-collector/`：文件读取、预检、分块上传和 CLI。
- `functions/api/platform/v1/erp-collection/`：授权、存储和 ingest 路由。
- `migrations/0007_kuaimai_erp_collection.sql`：批次、原始记录和质量异常表。
- `.agents/skills/kuaimai-erp-data-collection/`：重复执行手册。
- `tests/kuaimai-erp-collection*.test.mjs`：领域、存储、API、迁移、CLI 和 Skill 契约。

## 接口与契约

`POST /api/platform/v1/erp-collection/ingest` 接收 `batch`、`records` 和 `issues`，要求 `Idempotency-Key`。单次最多 500 条，响应批次 ID、写入、更新、重复和异常数量。资源类型采用注册表枚举，首个可写投影为 `orders` 和 `order_items`。

## 数据迁移

只新增 `erp_collection_batches`、`erp_source_records`、`erp_collection_issues` 及索引。真实 15 日订单商品明细样本为 157,217 行、序列化记录约 339.84 MiB，已证明全历史原始 JSON 不适合直接放入 D1；订单原始文件进入 NAS/R2 前不得继续全量原始明细写入，D1 改存标准事实和聚合。

## 风险与回滚

- 页面字段变化：表头签名不匹配则预检失败。
- 时间范围缺口：批次不能完成，保留未覆盖范围。
- 重复导入：文件哈希和 `resource_type + source_key` 双层幂等。
- 回滚：按 `source_batch_id` 删除原始记录和异常，再删除批次；投影写入在验证前不启用破坏性替换。

## 验证命令

`node --test tests/kuaimai-erp-collection-domain.test.mjs tests/kuaimai-erp-collection-migration.test.mjs tests/kuaimai-erp-collection-api.test.mjs tests/kuaimai-erp-collection-cli.test.mjs tests/kuaimai-erp-collection-skill.test.mjs`

完成前运行仓库 Definition of Done 全部命令，并分别验证本地、生产 D1 和快麦导出。

## 任务顺序

1. 新增失败契约测试和迁移。
2. 实现领域标准化、存储和 ingest API。
3. 实现文件预检与上传 CLI。
4. 创建并验证采集 Skill。
5. 导出小样、固化真实表头映射，再执行历史订单分段补数。
6. 按相同框架依次增加商品、库存、采购、售后和基础资料映射。
