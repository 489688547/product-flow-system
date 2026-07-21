# 数据中心 App 设计（历史版本）

本文是 2026-07-18 形成的早期方案索引，已被后续确认的产品决策替代，不再作为开发或验收依据。

当前有效文档：

- `docs/features/data-center-app/prd.md`：产品范围、业务规则与验收标准；
- `docs/features/data-center-app/design.md`：连接器目录、专属弹窗、内部保险箱、采集器与安全交互；
- `docs/decisions/2026-07-19-encrypted-credential-vault.md`：加密凭证保险箱架构决策。

主要变化：不恢复“数据分析”入口；允许密码、API 密钥、Token、Cookie 和可复用会话通过共享保险箱加密保存在 D1；验证码和当次人工验证信息仍不持久化。
