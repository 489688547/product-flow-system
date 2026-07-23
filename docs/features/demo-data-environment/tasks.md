# 展示数据库环境任务清单

- 状态：待实施
- 日期：2026-07-23
- 详细步骤：`docs/features/demo-data-environment/plan.md`

## 0. 开始前

- [x] 新实施分支包含最新 `origin/main`
- [x] 记录当前工作区已有未提交修改，避免覆盖或误提交
- [x] 运行 `npm run check:branch-base`
- [x] PR 预先声明五项 Integration Impact
- [x] PR 预先声明 Rule Writeback

## 1. 数据库、迁移与环境合同

- [x] 先增加双 D1 和迁移失败测试
- [x] 创建 `0011_demo_data_environment.sql`
- [x] 创建环境授权、展示状态、刷新任务和环境审计表
- [x] 为异步采集控制表增加目标环境和版本
- [x] 使用 Wrangler 创建真实 `DEMO_FLOW_DB`
- [x] 在根、Preview、Production 配置双 D1
- [x] 确认正式与展示数据库 ID 不同
- [x] 扩展环境能力清单为 binding 级检查
- [x] 重新生成环境能力模块
- [x] 通过迁移、环境能力、Pages parity 和 readiness 测试
- [x] 提交 `feat: register display database environment`

## 2. 数据环境控制面与 API

- [x] 先增加默认正式、展示 ready、维护拒绝、版本冲突测试
- [x] 实现随机 HttpOnly 环境授权和哈希存储
- [x] 实现环境状态、授权和无秘密审计存储
- [x] 实现 `controlDatabase`、`resolveDataEnvironment`、`businessDatabase`
- [x] 认证后注入 `controlDb`、`businessDb` 和环境版本
- [x] 业务写请求校验环境版本
- [x] 业务响应输出安全环境 Header
- [x] 实现数据环境 GET/PUT API
- [x] 验证非最高权限、未知环境、未就绪展示环境均被拒绝
- [x] 更新 API 目录和错误码
- [x] 通过 Pages Functions 兼容测试
- [x] 提交 `feat: add governed data environment routing`

## 3. 全系统业务库存储改造

- [x] 先增加业务路由禁止直连 `PRODUCT_FLOW_DB` 的治理测试
- [x] 建立合法控制面 allowlist
- [x] 品牌内容存储改用 `businessDb`
- [x] 数据中心和销售存储改用 `businessDb`
- [x] 电商运营存储改用 `businessDb`
- [x] 人事和绩效存储改用 `businessDb`
- [x] 协同、数据标准和平台业务存储改用 `businessDb`
- [x] 商品、货品流和用户洞察存储改用 `businessDb`
- [x] Whole-state 保持 baseline、事务、fingerprint、快照和审计规则
- [x] 供应链存储改用 `businessDb`
- [x] 每类 API 增加正式/展示不串库测试
- [x] 将数据环境路由检查纳入 `check:governance`
- [x] 提交 `refactor: route business storage by data environment`

## 4. 前端状态、缓存和设置

- [x] 先增加环境 API、Provider、设置交互和缓存隔离测试
- [x] 实现 `dataEnvironmentApi`
- [x] 实现 `DataEnvironmentProvider`
- [x] 为业务写请求统一添加环境版本
- [x] 切换时中止旧请求并拒绝晚到响应
- [x] 所有业务 localStorage/sessionStorage key 加环境后缀
- [x] 销售 IndexedDB 按环境使用不同数据库名
- [x] 旧缓存只迁移到正式环境一次
- [x] 实现设置页数据环境卡片
- [ ] 展示刷新状态支持恢复、失败和重试
- [x] 普通业务页面不增加展示标签
- [ ] 完成键盘、焦点、空、错误、禁用、响应式和 WebView 验收
- [x] 提交 `feat: add display database settings`

## 5. 数据目录、脱敏和销售两倍规则

- [x] 先增加目录、脱敏和销售转换纯规则测试
- [x] 实现显式展示数据目录，未知表默认 skip
- [x] 控制表、凭证、令牌和 AI 控制审计全部登记 skip
- [x] 实现确定性个人信息脱敏
- [x] 无脱敏密钥时含敏感表 fail closed
- [x] 实现唯一共享销售转换器
- [x] additive 字段精确乘二
- [x] 比例和均值从转换基础事实重算
- [x] 非销售事实和维度不乘二
- [x] 明细 ID 确定性生成，聚合来源不虚构明细
- [x] 实现销售不变量校验
- [x] 更新数据标准和架构文档
- [x] 提交 `feat: define display data transformation rules`

## 6. 单展示库刷新任务

- [ ] 先增加刷新状态机、失败阻断和幂等测试
- [ ] 实现 preflight、clear、copy、transform、recalculate、validate、activate
- [ ] 每个 step 有时间预算、租约、游标和原子推进
- [ ] 同一时间只允许一个刷新任务
- [ ] 刷新开始立即将展示环境置为维护
- [ ] 浏览器关闭后任务可恢复
- [ ] 重复 step 不重复写、不产生四倍
- [ ] 校验失败后展示环境保持不可用
- [ ] 成功后环境版本递增并恢复 ready
- [ ] 实现刷新创建、查询和 step API
- [ ] 设置页轮询并继续任务
- [ ] 提交 `feat: refresh the display database safely`

## 7. 真实采集目标路由

- [ ] 先增加任务目标、展示转换和幂等隔离测试
- [ ] Web collection 创建任务时保存服务端目标环境和版本
- [ ] ERP collection 创建任务时保存服务端目标环境和版本
- [ ] Runner 控制记录继续使用正式控制库
- [ ] Runner 根据服务端任务解析目标业务库
- [ ] 调用方不能指定绑定名或 D1 ID
- [ ] 展示环境版本变化时暂停旧任务
- [ ] 采集幂等键包含环境和环境版本
- [ ] 展示销售写入复用共享两倍转换器
- [ ] 退款丰富事实继续受 repair safeguard 保护
- [ ] 快麦文案与注册表保持官方文件/浏览器采集现状
- [ ] 提交 `feat: route data acquisition to selected environment`

## 8. 展示环境外部写模拟

- [ ] 先增加展示不调用 Provider、正式调用 Provider 测试
- [ ] 实现共享 external action mode
- [ ] 实现展示外部动作 adapter
- [ ] 模拟 ID 稳定且与成功响应合同兼容
- [ ] 模拟结果只写展示业务库
- [ ] 无秘密审计写正式控制库
- [ ] 钉钉待办创建/同步接入共享模拟器
- [ ] 钉钉日历创建接入共享模拟器
- [ ] 钉钉审批/协同写动作接入共享模拟器
- [ ] 真实读取动作保持 Provider 路径
- [ ] 更新集成注册表并重新生成
- [ ] 提交 `feat: simulate external writes in display mode`

## 9. AI 控制面与业务面拆分

- [ ] 先增加 Provider 配置在控制库、上下文在展示库测试
- [ ] AI 配置加载拆分 `controlDb` 与 `businessDb`
- [ ] Provider 配置、凭证、租约、用量和审计使用控制库
- [ ] Context builders 使用业务库
- [ ] Business App Skills 使用业务库
- [ ] AI 用量/审计增加独立 `data_environment` 字段
- [ ] 不改变 model/rule_fallback 的 executionMode 语义
- [ ] 审计不记录 Prompt、回答、上下文、Skill 参数或 Provider 原始响应
- [ ] 用量页只允许公司聚合，不增加员工排名
- [ ] 提交 `feat: route AI business context by data environment`

## 10. 规则写回与发布

- [ ] 更新 `AGENTS.md`
- [ ] 更新产品规则和 `DESIGN.md`
- [ ] 更新平台架构、中间件、API 和错误码
- [ ] 更新集成注册表和环境能力清单
- [ ] 新增展示数据环境 ADR
- [ ] 清除治理检查全部临时 allowlist
- [ ] 逐条审计所有 `PRODUCT_FLOW_DB` 和 `DEMO_FLOW_DB` 引用
- [ ] 运行 `npm run lint`
- [ ] 运行 `npm run check:governance`
- [ ] 运行 `npm run check:integrations`
- [ ] 运行 `npm run check:environment-capabilities`
- [ ] 运行 `npm test`
- [ ] 运行 `npm run build`
- [ ] 运行 branch-base、Cloudflare Pages 兼容和专项测试
- [ ] 本地沙箱验证不触远程 D1/Provider
- [ ] 本地线上验证前证明 HEAD 包含 `origin/main`
- [ ] 本地线上验证正式/展示切换和真实采集
- [ ] 对两个 D1 应用正确迁移
- [ ] 运行双 binding readiness
- [ ] 使用 `npm run release:pages` 发布
- [ ] 验证 Git deployment 与当前 Wrangler CLI
- [ ] 完成 Preview、Production 和钉钉 WebView 验收
- [ ] 首次刷新展示数据库并记录校验摘要
- [ ] 验证销售两倍、比例不变、外部写未触 Provider、AI 双库
- [ ] 合并前再次包含最新 main 并重跑全部门禁
- [ ] 只暂存和提交本功能文件
- [ ] 提交 `docs: govern display data environment`

## 完成证据

- [ ] 记录正式 D1 和展示 D1 的安全 binding 别名、迁移版本和 readiness，不记录秘密
- [ ] 记录销售来源/展示总计与比例不变量
- [ ] 记录展示环境模拟动作的 Provider 零调用测试
- [ ] 记录 AI 控制库/业务库测试
- [ ] 记录六项仓库门禁输出
- [ ] 记录四条运行验证通道结果
- [ ] 记录部署提交、Pages 部署和最高权限账号验收结果
