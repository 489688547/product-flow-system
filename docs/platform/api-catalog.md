# API 目录

公司 API 按业务 App 归档，机器目录以 `docs/platform/api-registry.json` 为准，完整技术契约以 `docs/platform/apis/*.md` 为准。说明书的“API 目录”页读取这两类来源，不另外维护一套接口事实。

## 使用规则

- 每个接口必须登记稳定 ID、所属 App、方法、路径、状态、认证、权限、请求示例、成功响应、错误码和契约来源。
- `connected` 只表示当前仓库已有真实路由与契约；`integrating`、`unavailable` 和 `deprecated` 不得显示成已接通。
- GET 示例可在说明书中使用当前公司会话和当前数据环境实测，但仅允许登记的同源路径和查询字段。
- POST、PUT、PATCH、DELETE 只展示可复制示例，说明书绝不执行写请求。
- 实测响应递归遮罩敏感字段，数组最多 20 项，预览最多 100 KiB，默认 15 秒超时，不保存响应。

## 公司平台

公司平台包含协同事项、研发待办、平台连接、凭据保险箱和浏览器采集设备协议。所有写入都由服务端执行权限、幂等、乐观版本和安全审计；普通列表接口不得返回凭据。

兼容边界：产品全周期整包状态仍通过 `/api/state` 先读后写；公司级平台连接统一通过 `/api/platform/v1/platform-connections` 读取和维护；已确认的研发事项通过 `/api/platform/v1/development-backlog` 管理。各路径的详细约束由 durable 契约和测试继续保证。

主要契约：

- `collaboration-items-v1.md`
- `development-backlog-v1.md`
- `platform-connections-v1.md`
- `credential-vault-v1.md`
- `browser-agent-v1.md`

## 产品全周期

产品全周期通过共享商品目录读取商品、SKU/库存单位、编码、组合关系、日期段销售和最新可信库存。日期段只影响订单创建时间口径的销量与销售额，不改变库存快照。

主要契约：`product-catalog-v1.md`。

## 供应链

供应链只消费共享货流事实和版本化工作流，不在 feature 内复制库存、采购、付款、供应商或质量事实。库存读取按完整快照日期返回，并显式带覆盖率、新鲜度和可信状态。

主要契约：

- `goods-flow-v1.md`
- `supply-chain-workflows-v1.md`

## 数据中心

数据中心负责销售事实、数据口径、ERP 文件采集、网页采集任务和平台连接元数据。原始文件和浏览器会话不进入业务 API；业务 App 只读标准事实。

主要契约：

- `data-services-sales-v1.md`
- `data-standards-v1.md`
- `erp-collection-v1.md`
- `web-collection-v1.md`
- `data-connections-v1.md`

## 电商运营

电商运营读取标准化店铺、商品、直播和短视频事实，不直接调用抖店页面、Chrome 扩展或 Provider 适配器。

主要契约：`commerce-facts-v1.md`。

## 品牌内容

品牌内容读取已确认类目范围内的用户洞察、规则、竞品和安全聚合。系统发现只生成候选，人工确认后才能进入正式范围。

主要契约：`user-insights-v1.md`。

## 人事绩效

当前没有满足平台 v1 契约要求的人事绩效共享 API，因此目录保留 App 分组但不伪造已接通接口。现有 feature 内部接口需要完成认证、授权、错误、兼容和契约测试文档后，才能登记到机器目录。

## 新接口登记

新增或调整接口时必须同时完成：

1. 更新对应 `docs/platform/apis/<contract>-vN.md`。
2. 更新 `docs/platform/api-registry.json` 的真实状态和示例。
3. 添加认证、权限、失败、超时和兼容契约测试。
4. 运行 `node --test tests/api-registry.test.mjs`。
5. 在拉取请求声明 `Rule-Writeback`；涉及外部平台时同时声明 `Integration-Impact`。
