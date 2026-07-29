# 共享状态资源超限修复任务

- [x] 原始分片流式读取
  - 失败测试：大分片读取期间禁止解析业务值。
  - 验证：`node --test tests/shared-state.test.mjs`
- [x] 原始分片写前快照
  - 失败测试：传入不可序列化对象时仍从数据库分片生成可回滚快照。
  - 验证：`node --test tests/production-data-access.test.mjs`
- [x] 产品图片容量边界
  - 失败测试：大图等比缩小并选择容量内的最高质量结果。
  - 验证：`node --test react-tests/product-image.test.mjs`
- [x] 平台规则写回与完整门禁
  - 验证：治理、集成、环境、测试、Functions 构建和前端构建全部通过。
- [ ] dev 验收、main 发布和生产修复
  - [x] dev 固定站点提交 `608f662df7d47e43ad9f731c0f9d8b9fb02ee646`，smoke、OAuth、Pages、D1 和 DingTalk readiness 通过。
  - [x] 生产网关修复审计 `audit_a9dc8081-a429-4950-8245-39fb0f664af3` 可见，状态缩小 82.4%，产品进度显示“已同步”。
  - [ ] main 固定站点提交一致，`/api/state` 冷热与 20 并发不再出现 1102。
