# 公司单一采集运行时执行任务

## 执行规则

- 每项任务只交付一个可独立验证的结果。
- 先写失败测试并确认失败原因，再写实现。
- 完成后记录实际验证命令和结果。
- 每次提交只包含当前任务文件，不包含 `.DS_Store` 或其他工作树改动。

## 任务

- [x] 修复 LaunchAgent 日志目录
  - 依赖：无。
  - 文件：两个 collector automation 与对应测试。
  - 输入：用户 home、label、现有 collector 参数。
  - 输出：Library Logs 下的安全日志路径及安装前目录创建。
  - 失败测试：聚焦 automation/local archive 测试应因仍包含 Desktop 日志路径失败。
  - 实现步骤：先统一日志路径函数，再让两个安装器创建目录并生成 plist。
  - 验证：聚焦测试全绿，plist 无秘密且稳定主检出路径不变。
  - 提交：`fix(collector): move launch agent logs out of desktop`。

- [x] 将本地快麦扫描并入网页采集进程
  - 依赖：日志目录修复。
  - 文件：`local-inbox.mjs`、web collector index 与 runtime 测试。
  - 输入：归档 root、ERP uploader、900 秒周期和共享串行器。
  - 输出：首次立即扫描、周期节流、安全失败结果及非并发归档。
  - 失败测试：runtime 测试因本地周期接口不存在失败。
  - 实现步骤：实现纯周期对象，向 `serve()` 注入，再让浏览器下载和扫描共用串行器。
  - 验证：聚焦测试和 `npm run test:web-collector` 全绿。
  - 实际验证：本地归档/运行时聚焦测试 61/61，`npm run test:web-collector` 216/216，`npm run lint` 通过。
  - 提交：`refactor(collector): unify local ERP scanning runtime`。

- [ ] 写回规则并完成真实切换
  - 依赖：统一运行时完成。
  - 文件：平台采集文档、既有 feature 文档和本 feature 文档。
  - 输入：新运行边界与真实验收结果。
  - 输出：单服务、ECS 唯一后端、禁用旧服务及回滚说明。
  - 失败测试：治理/集成检查不得接受陈旧 D1 与双服务正式描述。
  - 实现步骤：更新 durable 文档，跑完整门禁，GitOps 发布，重装并禁用旧服务。
  - 验证：唯一 LaunchAgent、PID、17653、代码指纹、ECS 心跳和空扫描全部通过。
  - 提交：`docs(collector): make unified runtime the production rule`。
