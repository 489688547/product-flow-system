# 共享状态资源超限修复设计

## 读取

`GET /api/state` 读取按 `part_key, part_index` 排序的原始分片，并以 `ReadableStream` 输出 JSON。状态字段的 JSON 值直接来自已校验写入的数据库分片；服务端只序列化外层元数据，不解析或重新序列化整个业务对象。

无分片的旧数据继续走旧表兼容路径。内部调用 `readCompanyState` 的写入、钉钉同步和 AI 上下文仍返回对象，以保持现有合同。

## 快照

写前快照优先读取 `product_flow_state_parts`。快照内容由 `{`、字段名、原始字段分片和 `}` 组成，按顺序写入现有 `production_data_snapshot_parts`；回滚继续拼接并解析完整 JSON，不改变表结构和审计合同。

## 图片

共享 `prepareProductImage` 边界负责：

1. 读取本地图片；
2. 按最长边 640 像素等比缩放；
3. 在白色背景上编码 WebP；
4. 从高到低尝试质量，选择首个满足容量目标的结果；
5. 失败时返回明确错误，不把超大原图写入状态。

需求池和产品档案共同复用该边界。上传期间按钮保持可用但保存被禁用，并展示简短错误文本。

## 生产修复

运维脚本通过本地线上模式调用生产数据网关：

- 读取当前基线；
- 计算图片哈希并只替换相同的超大 Data URL；
- 为已核实的旧待办补齐动作版本，不修改远端完成状态；
- 解锁并带当前 `baseUpdatedAt` 写入；
- 输出数据量变化、审计 ID 和快照 ID，不输出图片、令牌或原始响应。

## 可访问性与兼容

- 图片错误使用 `role="alert"`。
- 保存按钮在压缩处理中禁用并说明原因。
- 不依赖 `createImageBitmap`，兼容当前 DingTalk WebView 的 `FileReader`、`Image` 和 Canvas。
- Canvas 不支持 WebP 时识别返回 MIME 并拒绝超大回退结果。
