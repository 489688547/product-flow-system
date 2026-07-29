# 共享状态资源超限修复实施计划

## 文件与职责

- `functions/api/state.js`：增加共享状态原始分片读取和流式 GET 响应。
- `functions/api/platform/_shared/productionDataAccess.js`：从原始状态分片生成写前快照。
- `src/state/productImage.js`：统一产品图片缩放和压缩。
- `src/features/demands/DemandModal.jsx`、`src/features/archive/ProductModal.jsx`：接入压缩状态、错误和禁用态。
- `scripts/repair-shared-state-resource-limit.mjs`：受控执行当前生产数据修复。
- `tests/shared-state.test.mjs`、`tests/production-data-access.test.mjs`、`react-tests/product-image.test.mjs`：回归测试。
- `docs/platform/api-catalog.md`：写回共享状态读取、快照和图片容量规则。

## 实施顺序

1. 写失败测试，证明 GET 路径会解析分片、快照会重新序列化、图片没有容量边界。
2. 实现流式 GET 和原始分片快照。
3. 实现共享图片压缩并接入两个上传入口。
4. 运行完整门禁和 Pages Functions 构建。
5. 合入 `dev`，验证固定测试站。
6. 发布 `main` 后通过生产网关执行数据修复并完成冷、热、并发验证。

## 风险与回滚

- 流式 JSON 顺序错误：测试多字段、多分片和 Unicode；失败时回滚到对象响应。
- 快照片段不完整：写入后立即通过现有读取函数校验；失败不进入业务写入。
- 图片压缩质量不足：限制只用于产品缩略封面，保留 640 像素和高到低质量选择。
- 生产状态并发更新：网关基线不一致返回 409，重新读取后人工复核，不自动覆盖。

## 验证

- `node --test tests/shared-state.test.mjs tests/production-data-access.test.mjs react-tests/product-image.test.mjs`
- `npx wrangler pages functions build`
- `npm run lint`
- `npm run check:governance`
- `npm run check:integrations`
- `npm run check:environment-capabilities`
- `npm test`
- `npm run build`
- 固定 dev 和 main 站点执行 readiness、OAuth、`/api/state` 冷热及并发验证。
