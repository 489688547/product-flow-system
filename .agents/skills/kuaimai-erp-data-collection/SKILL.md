---
name: kuaimai-erp-data-collection
description: Use when exporting, validating, backfilling, incrementally importing, auditing, or troubleshooting Kuaimai ERP orders, products, inventory, purchasing, aftersales, shops, warehouses, or finance data through official browser exports and the governed D1 collection API.
---

# 快麦 ERP 数据收集

## 目标

用已登录 Chrome 生成快麦官方 XLSX/CSV 导出文件，再通过项目采集器预检、分块并幂等写入 D1。快麦 API 当前只能作为有限补充，不得把待验证描述为已接通。

## 固定口径

- 销售与订单覆盖按订单创建时间、Asia/Shanghai 统计，不得改用付款、发货或完成时间。
- 首次历史订单必须同时覆盖“三个月内订单”和“归档订单”，两处时间段拼成无缺口区间。
- 原始记录可保留平台返回的“其它/未知”；正常运营判断继续排除“其它/其他”。
- 收件人、买家身份、电话、地址、快递单号和自由文本备注即使已脱敏也必须在本机剔除，不进入请求或 D1。
- 不得保存、打印或提交密码、Cookie、验证码、令牌和浏览器会话。

## 开始前

1. 阅读根目录 `AGENTS.md`、`environment-parity` 与 `integration-router`。
2. 确认分支包含当前 `origin/main`，并保留用户已有改动。
3. 从 `docs/platform/integration-registry.json` 路由 `kuaimai`、`erp-file-import`、`cloudflare-pages`、`cloudflare-d1`。
4. 检查迁移 `migrations/0007_kuaimai_erp_collection.sql` 已在目标 D1 执行，且 `PRODUCT_FLOW_DB` 就绪。
5. 浏览器只做官方导出；遇到扫码、短信或必须本人确认时才请求用户接管，不尝试绕过风控。

## 标准流程

### 1. 导出小样

先导出一个短日期范围的小样。订单选择订单创建时间；完整历史再按月或更小范围分段导出。页面入口与资源类型见 [导出地图](references/export-map.md)。

### 2. 预检

```bash
npm run collect:kuaimai -- preflight "/absolute/path/to/export.xlsx" --resource orders
```

核对资源类型、文件哈希、表头、有效行数、最早/最晚业务时间、店铺预览、已剔除个人信息字段和异常。缺列、无稳定来源键、日期无法解析或表头变化时停止；先用真实脱敏样例补失败测试和字段别名，不得猜列。

### 3. 写入

启动受支持的本地真实线上运行时，让服务端个人令牌解析为真实组织身份：

```bash
npm start
npm run collect:kuaimai -- upload "/absolute/path/to/export.xlsx" --resource orders --base-url http://127.0.0.1:8132
```

采集器每 500 条分块，使用文件哈希和 `resource_type + source_key` 双层幂等。重复运行同一文件应只返回 unchanged，不应新增事实。

快麦把大体量销售主题报表拆成多个 XLSX 时，不得逐份按月覆盖导入；先在本机合并成只含经营汇总的 CSV：

```bash
python3 scripts/kuaimai-erp-collector/aggregate_split_exports.py \
  --output "/absolute/path/to/compact.csv" \
  "/absolute/path/to/part-1.xlsx" "/absolute/path/to/part-2.xlsx"
```

原始文件不得上传 D1。若汇总仍超过单次请求等待时间，用 `--split-compact` 按月拆分后逐月导入；界面必须显示“已保存并共享给全公司”，显示“本机浏览器”不算成功。每月仍需用远程 D1 行数与金额复核。

### 4. 核对 D1

至少核对：

- `erp_collection_batches`：每个文件只有一个批次，状态不是误标的 completed。
- `erp_source_records`：按资源和日期的数量、最早/最晚时间、店铺/仓库覆盖符合导出结果。
- `erp_collection_issues`：错误为零或已说明；warning 不得静默丢弃。
- 文件总行、有效记录、重复来源键、异常和 D1 记录数量可解释地闭合。

### 5. 完整历史与每日增量

- 历史订单先从最早“归档订单”开始逐段补到“三个月内订单”，最后补到 ERP 最新创建时间。
- 同一时间段按店铺或导出上限继续切分，不重叠时必须首尾相接；允许重叠时依靠幂等并记录原因。
- 每日增量拉取上海时区昨天 00:00:00 至 23:59:59，并保留最近 3 天重拉窗口吸收订单修改。
- 商品、SKU、当前库存是快照；订单、订单明细、库存流水、采购、售后和财务是历史事实。

## 失败恢复

- 登录失效或验证码：停止当前导出，恢复登录后从未完成范围继续。
- 导出超时：缩短日期范围，不能把部分文件标记完成。
- 上传失败：使用同一文件和资源类型重试；不要手改哈希或来源键。
- D1 容量接近限制：停止原始全量写入，先估算平均 JSON 字节数和剩余容量；原文件转存公司 NAS，D1 保留标准事实、索引、批次和异常。
- 字段变化：保存脱敏表头证据，增加失败测试后再更新映射。

## 完成标准

专项测试、仓库 Definition of Done、生产迁移、部署、线上真实身份写入和 D1 数量核对全部通过后，才可描述为完成。Preview、localhost、端口监听或单个成功批次都不能替代生产验证。
