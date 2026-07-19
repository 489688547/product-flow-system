# 钉钉库存数据导入实施计划

## 目标

提供可重复运行的钉钉供应链文件夹导入工具，并在生产环境展示供应商、成品盘点、原辅料和异常库存真实数据。

## 架构方案

钉钉读取只发生在命令行集成适配器；纯解析函数将 CSV 转成供应链领域记录；脚本通过现有 `/api/supply-chain` 边界合并状态。前端不直接调用钉钉。生产操作使用已登录的供应链权限会话，不新增浏览器凭据存储或数据库直写旁路。未来自动同步可复用解析契约并迁入服务端任务。

## 文件职责

- `scripts/lib/dingtalkSupplyInventory.mjs`：供应商与库存来源 CSV 的纯解析和敏感字段白名单。
- `scripts/import-dingtalk-supply-inventory.mjs`：调用 dws、幂等合并并写本地 API。
- `src/domain/supplyChain.js`：注册新集合、识别 ERP/实盘来源、兼容未映射 SKU。
- `src/features/supply-chain/InventoryWorkspace.jsx`：展示三类库存数据。
- `src/features/supply-chain/SupplyChainAppPage.jsx`：数据源数量与新鲜度。
- `functions/api/supply-chain.js`：新集合权限与脱敏边界。
- `react-tests/*`、`tests/*`：解析、UI、API 回归测试。

## 接口与契约

- 解析器输入：dws `sheet csv-get` 返回的 CSV 字符串和来源元数据。
- 解析器输出：`{ records, skipped }`，供应商记录只包含业务白名单字段。
- 导入脚本输出：写入计数和跳过计数；失败时非零退出。
- 记录稳定 ID：`dingtalk:<sourceNodeId>:<sheetId>:<sourceRow>:<kind>` 的安全形式。

## 数据迁移

状态规范化为缺失的新集合补空数组，旧状态无需迁移。脚本按稳定 ID upsert，同一来源的旧记录被刷新，不影响手工导入记录。

## 风险与回滚

- 条形码精度丢失：保留源值并标记，不自动关联。
- 合并单元格导致上下文空白：解析时仅在同一产品分组内向下继承。
- 表结构变化：测试固定关键表头，缺失时脚本失败而不是猜测。
- 回滚：恢复写入前生产状态，或移除带指定 `dataSource` 的记录。

## 验证命令

- `node --test react-tests/supply-chain-inventory-import.test.mjs`
- `npm run test:react`
- `npm run test:api`
- `npm run lint`
- `npm run check:governance`
- `npm run check:integrations`
- `npm test`
- `npm run build`
- `node scripts/import-dingtalk-supply-inventory.mjs --api http://127.0.0.1:8127/api/supply-chain`
- 浏览器检查 `http://127.0.0.1:8134/#supply-inventory`

## 任务顺序

1. 写解析和状态契约失败测试。
2. 实现纯解析与集合兼容。
3. 实现供应商敏感字段白名单与幂等导入脚本。
4. 增加库存页和数据源中心展示。
5. 全量验证后先写入开发测试状态，再通过生产会话写入并浏览器验收。
