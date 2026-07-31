# 采集器双模式执行设计书

## 用户任务

总经办和数据管理员需要在不修改正式 Provider 适配器、不污染经营事实的前提下，快速验证新页面、
选择器、导出文件和解析方法；验证成功后，把实验模板发布成可重复运行的正式采集版本。运营人员只
运行已发布模板，不接触脚本编辑和正式发布。

## 架构决策

平台能力决策为 `扩展现有能力`。继续复用现有 `web-collection` 的 Provider、store、job、lease、
run、checkpoint、notification 和标准事实 writer，不引入 EasySpider 的 Electron 控制面或第二套
任务队列。

```text
数据中心模板与任务 API
          ↓
公司 Mac Runner
    ┌─────┴────────┐
正式执行器       实验执行器
登记动作         JS/Python/命令
    └─────┬────────┘
      Chrome Profile
          ↓
本机文件、SQLite、检查点
          ↓
受控标准事实 API
          ↓
当前 Cloudflare / 未来阿里云
```

Chrome 和登录态继续留在公司 Mac。控制面当前运行在 Cloudflare Pages/D1；阿里云迁移后通过相同
HTTP 契约提供任务、日志和事实写入。Runner 只保存服务端基地址、设备身份和本地 Profile，不读取
数据库类型或 binding。

## 模板协议

模板是不可变版本化 JSON。规范化后计算 `contentHash`，服务端签发绑定 `runId`、`runnerId`、
`templateId`、`version`、`contentHash` 和过期时间的执行包。

```json
{
  "templateId": "kuaimai-inventory-research",
  "version": 3,
  "mode": "experimental",
  "providerId": "kuaimai",
  "profileId": "kuaimai-main",
  "timeoutSeconds": 600,
  "limits": {
    "maxOutputBytes": 1048576,
    "maxChildProcesses": 4,
    "maxLoopIterations": 1000
  },
  "steps": [
    {
      "id": "open",
      "type": "browser.open",
      "url": "https://erp.superboss.cc/index.html#/stock/warehouse_status/"
    },
    {
      "id": "select",
      "type": "browser.javascript",
      "code": "return { ready: true };"
    },
    {
      "id": "export",
      "type": "browser.click",
      "selectors": ["[data-action='export']", "text=按库存导出"]
    },
    {
      "id": "parse",
      "type": "local.python",
      "script": "parse_inventory.py",
      "args": ["${download.path}"]
    },
    {
      "id": "inspect",
      "type": "local.command",
      "command": ["file", "${download.path}"]
    }
  ]
}
```

### 首批步骤

| 类别 | 步骤 |
| --- | --- |
| 浏览器 | `browser.open`、`browser.wait`、`browser.click`、`browser.javascript`、`browser.download` |
| 本机 | `local.python`、`local.command`、`file.parse` |
| 流程 | `flow.condition`、`flow.loop`、`flow.setVariable` |
| 验证 | `assert.page`、`assert.store`、`assert.businessDate`、`assert.schema` |

`formal` 模板只允许 Provider 注册表登记的 URL、动作、选择器和解析器。`experimental` 模板可以保存
自由脚本和命令，但只能由服务端授权的实验角色创建和运行，且不能直接获得数据库密钥。

## 执行器边界

### 浏览器执行器

- 复用当前 Chrome Profile 和 CDP/扩展能力。
- 页面 JavaScript 只在当前已打开页面上下文运行。
- 多候选选择器按顺序尝试，并记录命中的候选和页面结构指纹。
- 页面结果只返回模板声明的值；Cookie、Token、完整正文和客户字段进入结果前必须拒绝。

### 本机执行器

- 使用固定 Runner 操作系统用户和每个 `runId` 独立工作目录。
- Python 与命令使用参数数组启动；模板显式声明 `shell: true` 时才通过 shell 执行。
- 限制总超时、步骤超时、输出大小、子进程数量、文件数量和循环次数。
- 超时或取消时终止完整进程树。
- 环境变量只包含登记的运行元数据，不继承数据库密钥和服务端 Secret。

### 检查点

每个步骤开始和结束时写原子检查点：

```text
queued → opening → executing → waiting_download
       → downloaded → parsing → validating → completed
```

检查点包含模板版本、内容哈希、步骤 ID、变量安全子集、文件哈希和恢复令牌。模板版本或内容哈希不同
时不得恢复旧检查点。

## 数据与可信度

| 信任等级 | 产生条件 | 存储与消费者 |
| --- | --- | --- |
| `untrusted` | 实验执行完成 | 本机 SQLite 和实验详情 |
| `validated` | 字段、日期、店铺、行数、覆盖率和样本校验通过 | 数据中心预览 |
| `trusted` | 已发布正式模板完整执行和服务端 ingest 成功 | 正式事实及业务 App |

实验运行不调用正式事实 writer。管理员发起受控导入时，服务端重新验证模板版本、质量规则、目标
环境和幂等键；通过后产生新的正式批次，不修改实验运行的原始信任等级。

## API 与存储边界

现有 `/api/platform/v1/web-collection` 增加模板与运行子资源，保持 Runner 现有任务接口兼容：

```text
GET    /api/platform/v1/web-collection/templates
POST   /api/platform/v1/web-collection/templates
POST   /api/platform/v1/web-collection/templates/:id/versions
POST   /api/platform/v1/web-collection/templates/:id/publish
POST   /api/platform/v1/web-collection/runs
GET    /api/platform/v1/web-collection/runs/:id
POST   /api/platform/v1/web-collection/runs/:id/actions
```

服务端存储实现使用业务中立接口：

```text
listTemplates
getTemplateVersion
saveTemplateVersion
createRun
claimRun
renewRunLease
appendStepEvent
saveRunCheckpoint
completeRun
```

Cloudflare D1 和未来阿里云 SQLite/PostgreSQL 分别实现该接口。Runner、领域模型、HTTP shape 和契约
测试不包含数据库方言。原始大文件当前留在公司 Mac；未来 OSS 归档由阿里云迁移事项接入，不改变
模板或 Runner 协议。

## 权限与审计

- 总经办和数据管理员：创建、编辑、执行实验模板，发布正式版本。
- 运营人员：查看授权模板和运行记录，执行已发布正式模板。
- Runner：只领取绑定本设备和 Profile 的短期执行包。
- 所有创建、改版、运行、取消、发布和受控导入记录操作者、模板版本、内容哈希、用途和安全结果。
- 日志不记录脚本运行时 Secret、Cookie、Token、客户数据、完整页面正文或数据库凭据。

## 失败与恢复

| 错误码 | 处理 |
| --- | --- |
| `COLLECTOR_TEMPLATE_ACTION_DENIED` | 拒绝创建、运行或发布 |
| `COLLECTOR_TEMPLATE_HASH_MISMATCH` | 拒绝执行并重新领取 |
| `COLLECTOR_SCRIPT_TIMEOUT` | 终止步骤或进程树，可按模板重试 |
| `COLLECTOR_SCRIPT_FAILED` | 保存安全日志与检查点 |
| `COLLECTOR_OUTPUT_LIMIT_EXCEEDED` | 停止收集输出并终止步骤 |
| `COLLECTOR_CHECKPOINT_INVALID` | 从头执行当前版本，不读取旧变量 |
| `COLLECTOR_RESULT_UNTRUSTED` | 拒绝写正式事实 |

登录、验证码、扫码、滑块和设备验证使用 `waiting_human`，不计入自动重试次数。网络、下载和解析
瞬时失败按模板声明的退避策略重试。正式模板页面或字段变化时停止入库并保留上一可信批次。

## 页面与交互范围

首期不新增可视化拖拽编辑器，也不修改正在重构的数据中心全局 UI。使用版本化 JSON/API 和本机
命令入口验证执行协议；现有数据同步页面继续展示任务阶段、信任等级和安全错误。后续在全局 UI
重构完成后，单独扩展数据中心“采集模板”工作区，消费同一 API，不改变执行协议。

## 兼容、迁移与回滚

- 实验模式由服务端和 Runner 双开关控制，默认关闭。
- 现有任务没有 `templateId` 时继续按当前 Provider 适配器执行，兼容行为不变。
- Cloudflare 继续是当前已连接控制面；阿里云保持 `integrating`，直到独立迁移验收完成。
- 阿里云切换只更新 Runner 服务端地址和设备注册；Chrome Profile、Provider 代码和本机检查点不迁移。
- 关闭实验开关即可回滚，正式任务、历史事实、实验 SQLite 和审计记录不删除。

## 验证

1. 领域测试覆盖模板 schema、版本、哈希、权限、信任等级和正式兼容。
2. Runner 测试覆盖 JavaScript、Python、命令、变量、条件、循环、超时、输出上限和进程树终止。
3. API 测试覆盖身份、权限、幂等、乐观版本、签名、过期、错误码和存储适配器兼容。
4. 恢复测试覆盖 Runner/Chrome 重启、检查点版本不一致和重复结果提交。
5. 真实本机验收仅使用内部非敏感示例页面；生产 Provider 和正式数据另走独立验收。
