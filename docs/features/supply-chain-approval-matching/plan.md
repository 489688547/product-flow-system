# 供应链审批匹配实施计划

## 目标

让本地测试页只展示采购付款，并通过确定性规则提高供应商映射率而不误配产品。

## 架构方案

在钉钉 provider 适配器中规范化采购事由候选值，在供应链同步层根据当前供应商档案完成确定性关联和付款过滤。外部 payload 不进入领域层，前端继续读取稳定供应链状态。

## 文件职责

- `functions/api/dingtalk/_shared/dingtalk.js`：从标准采购事由提取候选值。
- `functions/api/supply-chain/approvals/sync.js`：过滤非采购付款，并按供应商档案和确认映射解析候选值。
- `tests/dingtalk-approval-sync.test.mjs`：覆盖候选提取、确定性匹配、非采购付款过滤和幂等同步。
- `docs/features/supply-chain-approval-matching/*`：记录规则、交互、迁移与验证。

## 接口与契约

`normalizeDingSupplyApproval` 继续返回 `{ record, lines }`；采购记录的 `unmappedValues` 可包含从事由提取的 supplier/product 候选值。`syncSupplyApprovals` 输出结构不变，跳过计数包含非采购付款。

## 数据迁移

不新增字段和版本。重同步会移除历史无采购关联付款，并以现有供应商档案重新计算采购映射；旧状态仍可被正常读取。

## 风险与回滚

风险是事由包含多个供应商名称。规则要求唯一命中，否则保持待映射。回滚提交并恢复同步前本地状态文件即可。

## 验证命令

- `node --test tests/dingtalk-approval-sync.test.mjs`
- `npm run lint`
- `npm run check:governance`
- `npm run check:integrations`
- `npm test`
- `npm run build`
- 本地真实钉钉同步及 `http://127.0.0.1:8134/` 页面检查

## 任务顺序

1. 失败测试锁定数据规则。
2. 实现候选提取和同步过滤。
3. 重同步本地真实审批。
4. 完整验证并提交。
