# 抖店罗盘经营数据采集实施计划

## 目标与能力结论

在现有网页采集平台上新增 `douyin-ecommerce` adapter，完成店铺、商品、直播、短视频昨天经营事实的官方报表采集、标准化入库、只读查询和同步可观测性。

能力评审结论为“扩展现有共享能力”：共享任务、设备、租约、游标、下载、归档、通知、业务数据库选择和同步 UI；provider 页面规则、文件映射和错误码留在 Douyin adapter。旧凭据登录保持退役。

## 架构与接口

- 控制面：`/api/platform/v1/web-collection` 保存 store-scoped job/run/cursor、目标环境和版本。
- 店铺目录：插件只在固定抖店管理页识别稳定店铺 ID 和显示名，本机 bridge 调用 runner 鉴权的 `register_store`，保存到 `web_collection_stores` 后才生成任务。
- 浏览器：MV3 adapter 只接受固定 provider/resource/store/date 任务，在允许来源执行官方导出或 `store_daily` 安全读数。
- 本机：provider processor 识别下载、归档原文件、解析和预检，并调用标准事实 ingest。
- 写入：`POST /api/platform/v1/commerce-facts/ingest` 校验 runner、job grant、目标环境版本、store/date/resource/schema 和批次。
- 读取：`GET /api/platform/v1/commerce-facts` 使用 `businessDatabase(context)`，支持日期范围、provider、store、resource 和资源稳定 ID。
- 完整性：事实携带 `batch_id`，读取只连接 `completed` 批次；新批次中途失败不会替换上一个可信批次。

## 数据迁移

使用 `migrations/0013_douyin_commerce_facts.sql`，避免与主工作区未合并的 0012 冲突。

- 重建 `web_collection_cursors` 唯一键为 `provider_id + store_id + resource_type`，兼容旧 Kuaimai 空 storeId。
- `web_collection_jobs` 增加 `store_id`；空 storeId 保持原 Kuaimai job key，Douyin job key包含 storeId。
- 新增控制面 `web_collection_stores`，以及 `commerce_fact_batches` 和四张 `commerce_*_daily_facts` 业务表。
- 批次元数据登记 `copy` 展示策略；四张事实表登记 `transform_sales`，只复制变换后的原子经营数值并在读取层重算比例。
- 预计日容量主要由商品/直播/视频明细决定；事实按完成批次保留，后续用受控保留策略清理 superseded 批次。

## 文件职责

- `src/domain/webCollection.js`：store-scoped key、资源状态和 Douyin 稳定错误。
- `functions/api/platform/v1/web-collection/_shared/storage.js`：Douyin 资源、任务/游标 storeId 与计划。
- `src/domain/commerceFacts.js`：标准事实校验、质量、派生率和查询形状。
- `functions/api/platform/v1/commerce-facts/*`：鉴权 ingest/query 与 businessDb 写读。
- `scripts/web-data-collector/providers/douyin/*`：文件识别、解析、字段映射、归档和上传。
- `scripts/web-data-collector/orchestrator.mjs`：provider processor 协议，支持 `downloaded` 和安全 `captured`。
- `chrome-extension/company-data-collector/providers/douyin.js`：固定来源、页面、日期、导出和安全读数。
- `chrome-extension/company-data-collector/content-script.js`：提取通用分派，Kuaimai 行为保持兼容。
- `chrome-extension/company-data-collector/service-worker.js`：下载与安全读数两类完成结果。
- `src/state/webCollectionApi.js`、数据接入/数据同步功能：通用触发、资源状态和恢复动作。
- `docs/platform/*`、`docs/decisions/*`：integration 生命周期、环境能力、API 和退役边界。

## 兼容与安全

- Kuaimai 的 provider/resource/job key、下载流程和现有测试保持兼容。
- 未登记 provider、resource、task 字段、host、页面、selector version 全部 fail closed。
- 店铺发现 payload 只允许 `providerId/storeId/storeName`，不允许链接、页面正文、凭据或自定义来源。
- 插件不新增 Cookies、History、WebRequest、Debugger、Native Messaging 或密码权限。
- 任务和 payload 不能选择 binding/database ID；服务端从 job 的目标环境和版本解析业务数据库。
- `captured` 只允许 `store_daily` 的固定字段 schema，不接受任意 JSON、页面文本或 HTML。

## 回滚

停用 integration registry 中的 Douyin adapter 和 05:00 计划，插件 registry 删除 Douyin provider，保留迁移表与已完成批次以避免数据丢失。控制面 schema 对 Kuaimai向后兼容；旧账号密码登录和被销毁凭据不恢复。

## 验证

定向验证包括领域、migration、web-collection API、commerce-facts API、解析器、bridge、runtime、extension、数据接入和数据同步测试。真实验收在公司 Chrome 已登录店铺中执行昨天四资源探测；验证插件不上传秘密或页面正文，D1 可查询到完成批次，失败/等待人工均有同步记录。

完整门禁：

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

发布通过 PR 合并 main 和 Cloudflare Git 部署完成；本地、插件、Git 部署、生产 API 四条验证证据分别记录。

## 多店铺目录优化增量计划

1. 先补失败测试：数据接入不再渲染摘要/刷新块和抖音资源标签；抖音卡片提供多店铺列表与“添加”。
2. 扩展网页采集控制面：已授权管理员可复用现有 `web_collection_stores` 幂等登记店铺，服务端选择已登记的公司 runner；未知 Provider、非法 ID、无 runner 和无权限稳定失败。
3. 扩展 Chrome 领取契约：当前 Profile 保存最近识别的抖音店铺 ID，Bridge、orchestrator 和 runner API 只领取匹配店铺的 Douyin 任务，其他 Provider 保持兼容。
4. 新增紧凑店铺弹窗，只提交 `storeName/storeId`；成功后刷新目录。同 ID 更新名称，多店铺全部可见。
5. 定向验证 API、Bridge、orchestrator、extension、React 静态契约和响应式样式，再执行完整 Definition of Done。
