import{j as n,r as d}from"./react-vendor-CgER1fZB.js";import{B as ln,M as cn,a as dn,r as pn}from"./markdown-vendor-BtF6cZKv.js";import{P as un}from"./PageHeader-BF8LF3r1.js";import{k as q}from"./index-XTe6Zz77.js";import{T as O,ai as x,X as G,a9 as mn,a7 as _n,ag as An,ab as Q,D as z,aI as $,b as J,R as In,aM as K,au as gn,c as fn,f as vn,O as Y}from"./icons-vendor-B5XognrM.js";const X=[{id:"handbook",label:"使用手册"},{id:"product",label:"产品与设计"},{id:"platform",label:"平台能力"}],k=a=>String(a??"").replace(/\s+/g," ").trim(),L=a=>/^#{1,6}\s|^(```|~~~|>|[-*+]\s|\d+[.)]\s|\|)/.test(a),V=a=>k(a.replace(/!\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/\[([^\]]+)\]\([^)]*\)/g,"$1").replace(/[`*_~]/g,"")),hn=a=>{const e=String(a??"").match(/^#\s+(.+?)\s*#*\s*$/m);return e?V(e[1]):"未命名说明"},En=a=>{const e=String(a??"").split(/\r?\n/);for(let s=0;s<e.length;s+=1){const t=e[s].trim();if(!t||L(t))continue;const l=[t];for(;e[s+1]?.trim()&&!L(e[s+1].trim());)l.push(e[s+1].trim()),s+=1;return V(l.join(" "))}return"暂无摘要"};function U(a){const e=String(a.content??"");return{...a,content:e,title:k(a.title)||hn(e),summary:k(a.summary)||En(e)}}function Dn(a,{query:e="",category:s="all"}={}){const t=k(e).toLocaleLowerCase("zh-CN");return a.filter(l=>s&&s!=="all"&&l.category!==s?!1:t?[l.title,l.summary,l.content].join(`
`).toLocaleLowerCase("zh-CN").includes(t):!0)}function Tn(a,e,s){return a.length?a.find(t=>t.slug===e)??a.find(t=>t.slug===s)??a[0]:null}function Pn(a){const e=new ln,s=[],t=/^(#{2,3})\s+(.+?)\s*#*\s*$/gm;let l;for(;(l=t.exec(String(a??"")))!==null;){const o=V(l[2]);s.push({level:l[1].length,title:o,id:e.slug(o)})}return s}function Nn(a){const e=String(a??""),s=e.split(/\r?\n/);let t=0;for(;t<s.length&&!s[t].trim();)t+=1;if(!/^#\s+/.test(s[t]?.trim()??""))return e;for(t+=1;t<s.length&&!s[t].trim();)t+=1;if(s[t]?.trim()&&!L(s[t].trim())){for(;t<s.length&&s[t].trim();)t+=1;for(;t<s.length&&!s[t].trim();)t+=1}return s.slice(t).join(`
`).trim()}const Sn=a=>/^https?:\/\//i.test(a??"");function Rn({content:a}){return n.jsx("div",{className:"handbook-markdown",children:n.jsx(cn,{remarkPlugins:[pn],rehypePlugins:[dn],components:{h1:()=>null,a:({href:e,children:s,...t})=>Sn(e)?n.jsx("a",{...t,href:e,target:"_blank",rel:"noreferrer",children:s}):n.jsx("a",{...t,href:e,children:s}),table:({children:e,...s})=>n.jsx("div",{className:"handbook-table-wrap",children:n.jsx("table",{...s,children:e})})},children:a})})}const Cn=`# 公司经营功能使用说明

公司经营功能帮助总经办和责任部门把战略目标拆成可检查的项目、部门承诺和经营复盘。页面权限来自组织架构，编辑动作会记录责任人和业务状态。

## 公司首页

公司首页优先展示个人待办、需要决策的事项和经营偏差。总经办可查看公司范围，普通成员只处理明确分配给自己的责任。

## 战略中心

战略中心记录公司级战略、关键结果和部门承诺。战略不是日常任务列表；每项结果必须有可验收标准、责任部门和截止时间。

## 重点项目

重点项目用于管理里程碑、风险和需要管理层确认的决策。里程碑反映阶段结果，风险记录影响和应对，决策记录选择与责任，不要把三者混写。

## 部门激励

部门激励关联明确的项目结果和预算。超预算、跨部门或需要管理层确认的方案必须按页面流程审批，结算后保留原始记录。

## 经营检查

经营检查保存周度进展和月度汇报。月度记录冻结后不直接覆盖；后续变化通过补充或修正记录保留过程。

## 业务 Apps

业务 Apps 是公司不同业务系统的入口。产品全周期是当前首个已连接应用，后续系统通过稳定的平台契约接入，而不是复制公司组织和权限逻辑。

`,On=`# 常见问题

本页汇总登录、权限、保存和外部系统同步中最常见的情况。

## 为什么看不到某个导航？

导航按部门权限显示。先确认右上角的部门和职位是否正确；组织信息正确但工作确实需要该页面时，请向总经办申请调整范围。

## 为什么页面可以看但不能编辑？

查看和编辑是两种权限。页面会在禁用操作附近说明原因；不要通过修改浏览器地址或重复点击绕过限制。

## 为什么保存后又看到旧数据？

可能是另一个窗口保存了较早版本，或共享数据请求失败。停止继续编辑，刷新页面核对最新内容，再重新提交必要修改。

## 钉钉登录失败怎么办？

确认当前账号属于公司组织，并允许浏览器打开钉钉登录页。钉钉内打不开时退出工作台页面后重新进入；浏览器内失败时重新扫码。持续失败请把错误提示和发生时间一起提交。

## 钉钉待办、会议或文档为什么没有同步？

外部能力可能因权限、身份缺失或接口超时失败。平台内的业务记录通常会保留，并显示同步失败状态。不要连续重复创建；先查看失败原因再重试。

## 销售数据为什么没有更新？

销售数据来自快麦、ERP 导入或已配置的数据同步。先确认数据时间范围、订单时间口径和同步状态，再判断是暂无订单还是同步异常。

## 怎样提交有效的问题反馈？

写明页面、账号部门、产品或项目、操作步骤、发生时间、预期结果和实际结果。可以附截图，但不要上传密钥、Cookie、个人手机号或完整外部接口响应。

`,jn=`# 开始使用经营执行平台

经营执行平台把公司战略、重点项目、部门承诺、产品全周期任务和经营复盘放到同一个协作入口。你看到的页面和操作范围来自钉钉组织身份，不需要另建一套账号。

## 登录

- 在钉钉工作台打开时，系统会使用当前钉钉身份登录。
- 在普通浏览器打开时，按页面提示完成钉钉扫码登录。
- 登录后右上角会显示姓名、部门和职位；如果组织信息不正确，请先联系总经办确认钉钉通讯录。
- 退出账号只会结束当前系统会话，不会退出钉钉。

## 认识左侧导航

总经办成员会看到公司经营和产品全周期两组功能。其他部门会看到与本部门工作相关的产品协同页面。所有员工都可以进入“说明书”。

导航缺失通常表示当前部门没有被授权，而不是页面故障。需要新增权限时，请说明页面名称、使用目的和责任部门。

## 数据保存

页面保存成功后会更新公司共享数据。不要在多个窗口同时编辑同一条记录；如果页面提示共享数据加载或保存失败，请先刷新确认最新内容，再继续操作。

## 问题反馈

发现数据错误、操作异常或流程规则不合理时，使用左侧“问题反馈”或页面右下角的问题入口。请写明页面、操作步骤、预期结果和实际结果；涉及具体产品时同时写产品名称。

`,kn=`# 产品全周期使用说明

产品全周期从需求机会开始，经过规划、开发任务和阶段交付，最终形成产品档案。产品不能绕过需求池直接建立，以便保留来源、责任和决策过程。

## 产品总览

总览展示产品进度、近期任务和真正需要处理的风险。当前阶段正常未完成的任务属于待办；只有逾期、临近截止或历史阶段遗漏等情况才进入风险提醒。

## 需求池

需求池记录产品机会、提出人、来源、预计时间和讨论结论。需求信息达到立项条件后才能转为产品项目，暂缓或未通过的需求继续保留历史。

## 产品规划

产品规划安排开发开始时间和预计上线时间。产品部和总经办负责维护计划；重复规划以确认后的最新记录为准，并保留来源需求关系。

## 产品进度

产品进度按生命周期阶段展示任务、责任部门、负责人、截止时间和交付物。当前阶段未完成任务始终可见。会议、钉钉待办和交付物通过对应任务操作建立，避免在多个地方重复维护。

## 产品档案

产品档案汇总已进入开发流程的产品信息、资料包和销售表现。销售分析读取已接入的数据源，时间范围和平台口径以页面说明为准。

## 责任归属

产品经理从钉钉组织成员中选择。系统优先使用钉钉用户标识识别负责人，历史记录才使用姓名兼容。部门任务只有明确分配到个人后才进入个人待办。

`,bn='# API 目录\n\n当前接口首先服务本应用，统一登记为内部 API。出现多个真实系统调用方后，稳定契约迁移到 `/api/platform/v1/`。\n\n## 共享状态\n\n`GET /api/state` 返回 `{ synced, state, version, updatedAt, updatedBy }`。客户端只有在成功读取带 `updatedAt` 的共享状态后才允许保存；浏览器脏缓存和代码默认状态不得在启动时自动上传。若本机存在未同步缓存，客户端只能保留本机恢复副本，并以线上状态为当前事实源。\n\n`POST /api/state` 接收 `{ state, baseUpdatedAt }`，操作者由当前公司会话确定，客户端提交的 `updatedBy` 不可信。缺少基线返回 `409 SHARED_STATE_BASE_REQUIRED`，基线落后或在写入期间被并发推进返回 `409 SHARED_STATE_VERSION_CONFLICT`，线上尚未初始化返回 `409 SHARED_STATE_NOT_INITIALIZED`；三种情况均不得修改状态。版本比较与推进、旧分片删除和新分片插入在同一个 D1 原子批次完成。成功写入前保存完整写前快照并创建待完成审计，写入后完成审计，响应增加 `auditId` 和新的 `updatedAt`。客户端规范化业务状态没有变化时不得 POST。旧客户端因为不携带基线而只能读取，刷新到新版本后恢复写入。\n\n| 路径 | 用途 | 主要约束 |\n| --- | --- | --- |\n| `/api/state` | 读取和保存产品全周期共享状态 | 需要公司会话；写操作拒绝只读身份；先读后写；原子比较并推进 `baseUpdatedAt`；无变化不写；写前快照与审计；大状态按 D1 行限制分片 |\n| `/api/platform` | 读取和保存公司战略执行实体 | 仅总经办范围；实体分记录存储；写操作需要非只读身份 |\n| `/api/brand-content` | 读取品牌内容状态并应用单个领域动作 | 全员登录后可读；品牌、运营和总经办按动作权限写入；独立 D1 状态表；乐观版本冲突返回 409 |\n| `/api/supply-chain` | 读取和保存供应链独立状态，并承接已清洗的钉钉供应链文件快照 | 需要公司会话；按部门裁剪金额和成本字段；写入仅允许所属部门集合；文件快照只允许供应商、库存盘点、成品库存、原辅料库存和异常库存集合 |\n| `/api/supply-chain/approvals/sync` | 分批读取钉钉采购和付款审批并写入供应链状态 | 仅总经办、供应链、采购和财务；每次只读取一个流程的一页，客户端先完成采购再完成付款 |\n| `/api/platform/v1/goods-flow/dashboard` | 读取 CCC、断货率、库存周转、库存资金和例外投影 | 公司会话；金额按部门裁剪；响应包含来源时间、覆盖率和计算版本 |\n| `/api/platform/v1/goods-flow/inventory` | 按日期、SKU 和仓库读取账面、实盘与校准库存 | 公司会话；支持截止日期过滤；未盘点和过期来源必须显式标记 |\n| `/api/platform/v1/goods-flow/imports` | 幂等导入 ERP 库存、钉钉审批、销售和兼容盘点事实 | 数据中心、供应链、财务或总经办；服务端读取共享商品目录展开组合消耗；部分成功返回 207；浏览器不直连 ERP |\n| `/api/platform/v1/goods-flow/stocktakes` | 查询或创建月度盘点任务 | 仓库维护实存；供应链确认差异；金额调整由财务确认 |\n| `/api/platform/v1/goods-flow/stocktakes/:id/transitions` | 按乐观版本推进盘点确认或追加更正 | 仓库录数、供应链确认差异、财务确认金额；写入需要 `Idempotency-Key` |\n| `/api/platform/v1/goods-flow/receivable-terms` | 查询或版本化维护平台固定账期 | 全部货流角色可读；仅财务和总经办可写；区间不可重叠 |\n| `/api/platform/v1/goods-flow/ccc` | 查询月度 CCC 版本 | 公司会话；缺少库存、成本、账期或应付日期时返回覆盖不足 |\n| `/api/platform/v1/goods-flow/ccc/:month/recalculate` | 生成月度 CCC 新计算版本 | 财务、供应链或总经办；同一幂等键返回同一版本 |\n| `/api/platform/v1/goods-flow/ccc/:month/freeze` | 冻结覆盖完整的月度 CCC 版本 | 仅财务或总经办；覆盖不足或版本过期返回 409 |\n| `/api/sales` | 查询产品销售聚合 | 需要公司会话；时间和平台口径见产品数据定义 |\n| `/api/data-center` | 读取和保存数据中心安全元数据 | 指定部门可读；仅总经办和运营部可写；拒绝只读身份；D1 分实体表存储 |\n| `/api/data-center/sales` | 按日期读取数据中心销售事实 | 需要公司会话；最长 370 天；订单创建时间；上海时区；排除“其它” |\n| `/api/platform/v1/data-services/sales` | 发现销售数据覆盖范围并按日期读取经营汇总 | 需要公司会话；无日期时返回可用月份；完整日期时返回单行汇总；订单创建时间；上海时区；排除“其它” |\n| `/api/data-center/connectors` | 读取和维护连接器实例与内部保险箱非敏感元数据 | 数据中心授权部门可读；运营可维护非店铺连接器；仅总经办维护内部保险箱、归档并销毁已退役店铺凭证 |\n| `/api/ecommerce-operations` | 读取可见的店铺经营状态 | 需要公司会话和授权部门；D1 分实体存储 |\n| `/api/ecommerce-operations/actions` | 提交重点产品、方案、执行、协同和复盘动作 | 服务端校验角色、状态与版本；拒绝只读身份 |\n| `/api/ecommerce-operations/ai-review` | 对当前方案给出优化建议 | 服务端字段白名单；AI 不改变审批；无密钥时明确降级为规则检查 |\n| `/api/ecommerce-operations/evidence` | 按员工和月份读取已验收经营证据 | 员工只读本人；主管和人事按职责读取；不返回绩效分 |\n| `/api/performance-management` | 按角色读取绩效状态 | 员工只读本人；主管看管理范围；人事管理归档 |\n| `/api/performance-management/actions` | 自评、终评、复核、冻结和更正 | 角色动作白名单、版本冲突、一次复核、冻结后追加更正 |\n| `/api/platform/v1/integrations` | 读取和维护内部平台资料 | 全员可读；仅总经办非只读身份可写；字段白名单；D1 审计只记录字段名 |\n| `/api/platform/v1/platform-connections` | 读取脱敏连接状态，验证、保存或停用公司级平台连接 | 全员登录后可读；仅最高权限管理员可写；只读验证成功后切换；不返回密钥；版本冲突返回 409 |\n| `/api/platform/v1/data-connections` | 读取或销毁旧抖音 provider 连接 | 旧连接只读；POST/PUT 返回 410；DELETE 仅最高权限管理员、15 分钟内会话、精确确认和版本锁；销毁密文并结束任务 |\n| `/api/platform/v1/data-connections/:id/reveal` | 兼容读取尚未销毁的旧连接凭证 | 不再由 UI 调用；清理后返回不存在；不得用于新建店铺网页登录 |\n| `/api/platform/v1/browser-agent/tasks` | 公司 Mac 领取通用 provider 采集任务 | 设备 Bearer 令牌；明确 platform scope；返回一次性五分钟 grant，不返回凭证 |\n| `/api/platform/v1/browser-agent/tasks/:id/credential` | 领取单个任务所需登录凭证 | task/device/credentialVersion 绑定的一次性 grant；消费后失效；no-store |\n| `/api/platform/v1/browser-agent/tasks/:id/result` | 回写等待人工、识别、成功或失败结果 | 设备 Bearer；provider/resource writer 白名单；拒绝密码、验证码、Cookie、HTML 和截图 |\n| `/api/platform/v1/user-insights` | 查询多平台用户、商品、视频、直播事实和参考建议；发起人工重试 | 总经办、产品、运营按范围读取；建议固定仅供参考；重试需要已确认类目 |\n| `/api/platform/v1/user-insights/category-mappings` | 登记、确认和停用平台类目 | 产品或运营人工确认；未确认类目不能采集 |\n| `/api/platform/v1/user-insights/rules` | 维护 App 归属的版本化洞察和竞品规则 | 产品与运营只能维护本 App；跨 App 只读复制，不覆盖来源 |\n| `/api/platform/v1/user-insights/competitors` | 管理核心和候选竞品 | 系统发现只生成候选；人工带原因确认后才能成为核心 |\n| `/api/platform/v1/user-insights/collector` | 登记采集设备或读取已确认任务 | 登记仅总经办；设备令牌只显示一次、服务端只保存哈希 |\n| `/api/platform/v1/user-insights/ingest` | 写入浏览器采集批次和标准事实 | 设备 Bearer 令牌、范围、类目、结构版本和幂等校验；不接收会话或完整页面 |\n| `/api/platform/v1/credential-vault` | 保存和读取加密凭证的脱敏元数据 | 公司会话；动作级权限；普通读取永不返回明文；D1 使用版本化密文 |\n| `/api/platform/v1/credential-vault/:id/reveal` | 受控查看或复制单条凭证 | 近期认证、条目范围授权、明确用途、限流、禁止缓存和追加式审计 |\n| `/api/platform/v1/credential-vault/:id/task-grants`（计划） | 向指定本地采集器签发短时凭证授权 | 阶段 1 未实现；后续绑定任务、采集器和字段范围，默认一次消费 |\n| `/api/platform/v1/collaboration-items` | 查询和创建跨 App 部门协同事项 | 公司会话；普通员工按本人和部门参与范围；游标分页；业务幂等键 |\n| `/api/platform/v1/collaboration-items/:id` | 读取、修改和归档单个协同事项 | 参与范围；版本乐观锁；无物理 DELETE |\n| `/api/platform/v1/collaboration-items/:id/transitions` | 执行协同状态动作 | 状态机和角色双重校验；动作幂等；追加活动 |\n| `/api/platform/v1/collaboration-items/:id/activities` | 读取协同活动记录 | 与事项相同的读取范围；按时间倒序 |\n| `/api/platform/v1/collaboration-items/:id/dingtalk` | 同步协同责任到钉钉待办 | 已确认稳定主负责人；平台统一调用；失败不回滚协同状态 |\n| `/api/platform/v1/product-catalog` | 读取共享 ERP 商品、库存单位、组合关系与同步元数据 | 全员登录后可读；产品/品牌等非授权部门不返回采购成本 |\n| `/api/platform/v1/product-catalog/import` | 导入数据中心确认后的 ERP 商品文件 | 仅总经办、运营部非只读身份；幂等合并，不保存原始整行 |\n| `/api/platform/v1/product-catalog/sync/kuaimai` | 分页读取快麦商品及组合详情并合并共享目录 | 仅总经办、运营部非只读身份；请求体可传详情游标；客户端续跑至完成；不反向修改快麦 |\n| `/api/platform/v1/data-standards` | 查询和发布共享数据口径 | 公司会话；按责任部门服务端授权；受控公式；版本快照与乐观锁；无物理删除 |\n| `/api/platform/v1/data-standards/:id` | 读取详情或追加口径版本 | 详情含版本、依赖和最近结果；`metricCode` 不可变；元数据随版本快照 |\n| `/api/platform/v1/data-standards/:id/archive` | 归档共享数据口径 | 责任部门或总经办；版本检查；保留定义、版本、结果和审计 |\n| `/api/platform/v1/data-standards/preview` | 预览受控公式结果 | 与发布相同的责任部门权限；最多 31 天；与正式计算共用编译器和执行器；不持久化业务结果 |\n| `/api/platform/v1/data-standards/recalculate` | 建立共享口径计算或显式历史重算批次 | 最多 11 项（含依赖）和 370 天；服务端幂等；202 后台执行；失败不切 current |\n| `/api/platform/v1/data-standards/results` | 读取带版本和可信度的口径结果 | 默认只读当前批次；可按 run 轮询；无结果返回原因且不补 0 |\n| `/api/platform/v1/environment-readiness` | 读取当前或生产环境脱敏就绪状态 | 员工会话或 read 个人令牌；只返回配置名称与存在性 |\n| `/api/platform/v1/production-write-session` | 解锁、查询和锁定跨环境生产写入 | active executive + write 个人令牌；确认短语；15 分钟有效 |\n| `/api/platform/v1/production-data/state` | 本地测试实时读取、受控写入和回滚生产公司状态 | Bearer 个人令牌；写入需解锁、基线版本、快照与审计 |\n| `/api/platform/v1/production-data/store-connections` | 读取并不可恢复清理已退役店铺网页登录记录 | Bearer 个人令牌；仅 active executive；写入需 15 分钟解锁、精确确认、清理前计数快照与审计；不返回凭据值 |\n| `GET /api/platform/v1/ai/status` | 读取公司 AI 总助和当前用户数据域状态 | 钉钉会话；全员可读；只返回脱敏状态 |\n| `GET /api/platform/v1/ai/provider` | 读取 AI Provider 安全状态 | 钉钉会话；全员可读；外发策略仅总经办可见 |\n| `PUT /api/platform/v1/ai/provider` | 更新白名单内 Provider 元数据和启用状态 | 钉钉会话；仅非只读总经办；不接收 Secret、URL 或任意 Header |\n| `POST /api/platform/v1/ai/provider/test` | 使用合成内容测试 Provider 连接 | 钉钉会话；仅非只读总经办；不加载公司上下文 |\n| `POST /api/platform/v1/ai/chat` | 基于服务端可信公司数据流式生成只读分析建议 | 钉钉会话；按数据域权限与外发策略；单用户单并发；SSE |\n| `GET /api/platform/v1/ai/usage` | 按日期读取 App、功能、模型与 Skill 聚合用量 | 数据中心读取权限；最多 366 天；不返回个人、提示词、回答或 Skill 参数 |\n\n### 数据中心契约\n\n`GET /api/data-center` 返回标准化元数据状态；`POST /api/data-center` 接收 `{ "state": { ... } }`。元数据分别保存到 `data_sources`、`data_runners`、`data_sync_runs`、`data_source_files`、`data_dimension_mappings`、`data_metric_definitions`、`data_quality_issues`、`data_app_subscriptions` 和 `data_audit_logs`，设置与版本保存在 `data_center_meta`。连接实例只保存凭证引用，不接收或返回明文；敏感值由共享 credential-vault API 处理。\n\n### 加密凭证保险箱契约\n\n凭证保险箱是数据连接器、内部系统保险箱和本地采集器共用的平台能力。普通 GET 只返回条目 ID、分类、范围、schema 版本、是否已配置、更新时间和脱敏提示。创建或替换接口接收字段白名单内的敏感 payload，服务端使用 Cloudflare Secret `PLATFORM_CREDENTIAL_MASTER_KEY` 和 AES-256-GCM 加密后写入 D1；迁移期兼容旧名 `DATA_CREDENTIAL_MASTER_KEY`，请求体、密文和明文均不得进入日志或审计详情。\n\nOTP、短信验证码、二维码内容、滑块答案和当次人工验证结果不属于凭证 payload。明文查看/复制使用独立 reveal 动作；本地采集器未来使用绑定任务、机器和字段范围的短时 task grant，阶段 1 不实现该路径。完整请求、响应、权限、错误、密钥轮换和兼容契约见 `docs/platform/apis/credential-vault-v1.md`；当前代码完成不代表已经部署生产。\n\n`GET /api/data-center/sales?from=YYYY-MM-DD&to=YYYY-MM-DD` 读取现有 `product_sales_daily`，响应包含 `rows` 和以下口径元数据：\n\n```json\n{\n  "meta": {\n    "from": "2026-07-01",\n    "to": "2026-07-17",\n    "timeBasis": "create_time",\n    "timezone": "Asia/Shanghai",\n    "excludeOther": true,\n    "lastSuccessfulSyncAt": "2026-07-18T00:10:00.000Z",\n    "latestDataDate": "2026-07-17"\n  }\n}\n```\n\n`latestDataDate` 是整个 `product_sales_daily` 当前最大业务日期，不受本次查询范围影响；总览用它表达数据截取日期，切换历史月份时不得回退。\n\n`GET /api/data-center` 与 `GET /api/data-center/sales` 遇到本地 Wrangler 到远程 D1 的瞬时断连时返回 `503 DATA_STORAGE_TEMPORARILY_UNAVAILABLE`、安全中文提示和 `retryable: true`，不得返回 Miniflare 堆栈或原始 D1 错误；前端只自动重试一次，持续失败后保留缓存数据并显示同步警告。写请求不自动重试。\n\n兼容策略：数据中心不复制销售事实，继续复用 `product_sales_daily`。本地开发没有 D1 时，元数据写入 `.local-data/data-center-state.json`，销售读取返回 501 并由前端降级到现有浏览器销售仓库；销售行不会写入 `localStorage`。\n\n`GET /api/platform/v1/data-services/sales` 是业务 App 共用的只读销售数据服务。无 `from/to` 时返回最早日期、最新日期、总记录数和按月记录数；同时提供完整 `from/to` 时在 D1 内聚合记录数、净销量、净销售额、平台数和实际覆盖日期。只提供一个日期、非法或倒序日期返回 `DATA_SERVICE_DATE_RANGE_INVALID`。接口不返回订单明细、客户信息或数据库凭据。\n\n完整认证、授权、请求、响应、兼容、错误和回滚契约见 `docs/platform/apis/data-services-sales-v1.md`。\n\n本地线上账号：`npm start` 使用 8127 Vite 热更新，并把全部 `/api/*` 代理给 8132 `wrangler pages dev`；`wrangler.toml` 将 `PRODUCT_FLOW_DB` 绑定到远程生产 D1。只有请求主机为 `localhost`、`127.0.0.1` 或 `::1`、`LOCAL_ONLINE_ACCOUNT_MODE=1`、服务端个人令牌有效且对应 active executive 时，中间件才注入真实组织会话。GET/HEAD 要求 `read`，其他方法要求 `write`；通过后所有业务数据和钉钉、快麦动作继续执行各自正式路由权限。非本地主机即使误配开关和令牌也必须完成正式钉钉登录。数据中心页面可用 `?from=YYYY-MM-DD&to=YYYY-MM-DD#data-overview` 打开指定日期范围，非法或倒序日期回退到默认“当月至昨天”。\n\n用户洞察作为数据中心、产品全周期和电商店铺运营的共享能力，使用 `/api/platform/v1/user-insights*`。完整认证、权限、类目确认、规则版本、竞品确认、采集设备、幂等、错误和兼容契约见 `docs/platform/apis/user-insights-v1.md`；公司 Mac 浏览器采集边界见 `docs/platform/browser-market-collection.md`。\n\n通用数据采集使用 `/api/platform/v1/data-connections*` 与 `/api/platform/v1/browser-agent*`。完整连接、reveal、设备任务、provider registry、迁移和回滚契约见 `docs/platform/apis/data-connections-v1.md` 与 `docs/platform/apis/browser-agent-v1.md`。\n\n### 公司统一 AI 契约\n\nAI 路由统一使用 `/api/platform/v1/ai/*`，沿用公司钉钉会话。状态与 Provider 响应只包含功能开关、是否就绪、是否已配置服务端 Secret、固定模型元数据、连接测试状态及当前身份可使用或被外发策略阻止的数据域；任何响应不得包含 Secret、Secret 尾号、内部 Header 或 Provider 原始错误。\n\nProvider 更新只接受 `providerId`、`model`、`reasoningEffort` 和 `enabled`，实际域名、Responses 路径、`store:false` 与 Header 白名单由服务端固定。连接测试输入固定为“返回 ok”，不读取 D1 业务事实。写入安全元数据后由数据中心 D1 表持久化；公司级密钥优先从平台连接保险箱解析，旧 Cloudflare Secret 仅作为迁移回退。\n\n每个业务 AI 功能必须先进入服务端功能注册表，再使用固定 App 与功能 ID 调用统一执行器；浏览器不能声明审计归属。未知功能返回 `AI_FEATURE_NOT_REGISTERED` 且不得请求 Provider。非流式能力统一处理 Provider 配置、超时、Token、一次审计与规则降级；公司总助聊天继续使用同一注册归属和流式编排。业务路由不得持有模型地址、Secret、Authorization Header 或低层 Responses 适配器。\n\n聊天请求只接受最多 12 条 `{ role, content }` 文本消息和弱 `appHint.screen` 路由提示；客户端提交的身份、部门、数据权限和公司状态字段全部忽略。单条用户消息最多 4,000 字符、助手历史最多 8,000 字符、总计最多 24,000 字符，最后一条必须是用户消息。包含明确财务关键词和具体金额/比例的手工粘贴内容在 Provider 调用前返回 `AI_FINANCE_TRANSFER_BLOCKED`。\n\n成功响应使用 SSE：`meta` 声明 request ID 和允许/阻止域，`text_delta` 返回正文增量，`sources` 返回 App、数据域、更新时间和记录数，`usage` 返回 token，`error` 返回稳定安全错误，`done` 声明回答是否完整。每个用户同一时间只允许一个生成请求；取消、失败和完成都会释放租约。审计只保存数据域、记录数、更新时间、token、耗时和结果码，不保存消息、回答或上下文。\n\n聊天 SSE 在原有 `meta`、`text_delta`、`sources`、`usage`、`error`、`done` 之外，增加 `skill_started`、`skill_completed`、`skill_failed`。事件只包含 request/call/Skill/App 标识、记录数、耗时和安全结果码，不返回查询参数或业务结果；旧客户端可继续忽略未知事件。\n\n`GET /api/platform/v1/ai/usage?from=YYYY-MM-DD&to=YYYY-MM-DD` 使用上海时区包含首尾日期，最长 366 天。响应仅包含 `range`、公司级 `summary`、按 App/功能/Provider/模型聚合的 `features` 与按调用方/Skill/来源 App 聚合的 `skills`；已登记但没有记录的功能以 0 补齐。身份只保留在受限审计中用于追责，接口不返回 actor、部门、员工排行、消息、回答、上下文、Skill 参数或 Provider 原始错误。\n\n兼容策略：`AI_ASSISTANT_ENABLED` 默认关闭，关闭时状态接口返回 `enabled:false`，聊天接口返回 `AI_DISABLED`，不要求 D1 或 Provider Secret。Provider 未通过 Function Calling 合成测试时，服务端从当前身份已授权的注册表按问题路由最多三个只读 Skill；命中时 `meta.skillsEnabled=true`、`meta.skillMode=server`，未命中时使用服务端摘要并标记 `summary`。原生工具模式标记为 `provider`。回滚只需关闭开关；AI 元数据、外发策略和无内容审计表保留，不影响其他业务 App。电商运营方案点评已迁移至共享执行器，仍返回原 `ai/rule_fallback` 合同且不改变审批。\n\n旧 Node 预览只保留为非完整兼容工具，不属于支持的业务开发入口。标准 `npm start` 运行 Pages Functions，因此 AI 状态、Provider 和聊天按真实线上会话与现有功能开关执行；本地环境变量值仍不得进入响应。部署后的生产链路必须另行验收，不能用本地成功替代。\n\n### 商品主数据契约\n\n`GET /api/platform/v1/product-catalog` 返回 `{ items, runs, meta }`。`items[].skus[]` 是产品全周期、供应链、供应商管理和货流共同消费的库存单位；`items[].components[]` 为向后兼容新增的组合关系，包含库存单位编码和正整数组合比例。采购成本（包括组件成本）仅对总经办、财务、供应链和采购范围返回。`meta` 包含商品、库存单位、内部唯一码、组合商品、组件关系及最后成功同步时间、来源和方式。\n\n商品经营读取使用 `GET /api/platform/v1/product-catalog?from=YYYY-MM-DD&to=YYYY-MM-DD&platform=<平台>`。`from` 与 `to` 必须同时提交、包含边界日期且最多 370 天；`platform` 省略时排除空值、`其它`、`其他`、`未知` 和 `未知平台`。服务端在 D1 先按 `code × platform` 聚合 `product_sales_daily`，再用目录 SKU 条码/规格商家编码确定性关联商品，避免把明细或任意 SQL 暴露给浏览器。\n\n带销量范围时每个商品增加 `{ sales: { quantity, netSales, matchedCodeCount, platforms } }`；`meta.sales` 返回 `from`、`to`、`platform`、`availablePlatforms`、`totalQuantity`、`totalNetSales`、`coveredProducts`、`unmatchedRowCount`、`latestDataDate`、`timeBasis=create_time`、`timezone=Asia/Shanghai` 和销售事实最后入库时间。销量基础字段对现有商品目录读者可见，采购成本裁剪规则不变。旧客户端不带日期参数时不扫描销售表且响应保持兼容；商品 GET 只读已治理 D1 表，不在读取请求中执行建表或改表。\n\n`POST /api/platform/v1/product-catalog/import` 接收 `{ source, fileName, items, errors }`。客户端只提交已标准化商品与异常摘要，不提交原始文件内容；服务端按主商家编码和规格商家编码幂等合并。`POST /api/platform/v1/product-catalog/sync/kuaimai` 接收可选 `{ cursor }`：游标 0 完整读取 `item.list.query` 并先归并为唯一商品，后续游标复用已落库共享目录，不重复拉取和重写整表；组合候选按稳定 ERP 商品身份排序，每批最多读取 30 个 `item.single.get` 详情，详情请求最多 5 路并发，返回 `complete`、`nextCursor`、`progress` 和安全失败摘要。成功详情按父商品成组替换组件；失败详情保留旧关系。\n\n快麦 API 与商品档案导出覆盖范围不同，自动同步不把 API 未返回的文件补齐商品标记为删除。订单日同步按快麦官方 `timeType=created` 查询并用响应 `created` 归日。回滚销量视图不删除目录或 `product_sales_daily`；旧产品 `skuCodes` 和供应关系 `productId` 继续兼容。销量查询按日期、编码和平台聚合，最大范围 370 天，不新增销售复制表。主要错误码：`PRODUCT_CATALOG_STORAGE_UNAVAILABLE`、`PRODUCT_CATALOG_SALES_RANGE_INVALID`、`PRODUCT_CATALOG_IMPORT_INVALID`、`PRODUCT_CATALOG_WRITE_DENIED`、`KUAIMAI_CONFIG_MISSING`、`KUAIMAI_PRODUCT_SYNC_INCOMPLETE`、`KUAIMAI_PRODUCT_SYNC_CURSOR_STALE`、`KUAIMAI_PRODUCT_SYNC_FAILED`。\n\n`GET /api/data-center/connectors` 返回 `{ connectors, vaultItems }`。财务、产品、供应链和运营只能读取连接器；内部保险箱元数据仅向总经办返回。`PUT` 使用 `{ expectedVersion, instance }` 保存连接器，或由总经办使用 `{ expectedVersion, vaultItem }` 保存内部保险箱条目。敏感值不得出现在请求中，只能提交 `credentialEntryId` 引用；新配置固定为 `pending_validation`，客户端提交 `healthy` 不生效。归档使用 `{ action: "archive", id, expectedVersion }` 且仅总经办可执行。所有修改使用乐观版本并在 `data_audit_logs` 只记录动作和变更字段名。\n\n### 店铺运营与绩效契约\n\n店铺运营状态分别保存在 `ecommerce_operation_records` 和 `ecommerce_operation_meta`；绩效状态分别保存在 `performance_management_records` 和 `performance_management_meta`。两个动作接口都接收 `{ "expectedRevision": 1, "action": { "type": "..." } }`，旧版本写入返回 409。\n\nAI 点评只传输方案中的产品、平台、店铺、现状证据、目标、问题、对策和检测指标，不传账号凭据或绩效数据。路由使用共享 `invokeAiFeature` 和灵算连接配置；模型未配置、超时或服务异常时响应 `mode: "rule_fallback"`，页面明确显示“智能规则检查”。每次成功或降级只写一条无内容审计。\n\n绩效考核项可保存只读经营证据引用 `{ sourceAppId, entityType, entityId }`，但经营系统不写绩效分；任务完成也不会自动把考核标记为达标。绩效数据不写浏览器 `localStorage`。\n\n### 环境就绪契约\n\n### 快麦 ERP 本地归档与采集契约\n\n`POST /api/platform/v1/erp-collection/runners` 仅允许总经办真实公司会话登记固定范围采集器，令牌明文只返回一次并写入 macOS 钥匙串，D1 只保存 SHA-256 哈希。`POST /api/platform/v1/erp-collection/ingest` 接受授权公司会话或有效采集令牌，按文件哈希幂等写入归档清单、批次、脱敏最小索引和共享业务投影。`GET /api/platform/v1/erp-collection/archives` 返回归档状态、相对路径和批次，不返回本机绝对路径。\n\n完整原始文件只保存在 `~/Desktop/公司数据中心/快麦ERP/`，不进入 D1、日志、Git 或前端。订单归日使用 `Asia/Shanghai` 的订单创建时间；正常经营判断排除“其它/其他/未知”。认证、请求、响应、错误、兼容、容量和回滚见 `docs/platform/apis/erp-collection-v1.md`。\n\n`GET /api/platform/v1/environment-readiness` 返回 `environment`、`ready`、`checkedAt`、`capabilities[]` 和 `dataAccess`。每个能力仅包含中文说明、关联平台、`ready|warning|blocked` 状态和缺少的变量名、绑定名或表名。响应禁止包含配置值。\n\n### 平台连接契约\n\n完整请求、响应、权限、候选验证、版本冲突、停用和回退规则见 `docs/platform/apis/platform-connections-v1.md`。接口仅返回平台、来源、已配置字段名、状态和更新时间等脱敏信息；浏览器不能读取已保存密钥。钉钉和快麦适配器统一优先读取保险箱中的有效版本，未保存或停用时兼容旧环境变量。\n\n### 生产数据契约\n\n个人令牌通过 `Authorization: Bearer` 提交，原始值只存在于本地 `.env`。`POST /api/platform/v1/production-write-session` 输入 `reason` 和固定确认短语，成功后把解锁令牌只返回给本地 Node 服务。`POST /api/platform/v1/production-data/state` 还需要 `X-PFS-Production-Unlock`，输入公司 `state` 与最近读取的 `baseUpdatedAt`；冲突返回 409。输入 `action=rollback`、`auditId` 和确认短语时恢复该审计的写前快照，并生成新的审计。\n\n兼容策略：生产数据网关继续作为本地测试和事故修复的旁路能力。普通 `/api/state` 与网关共用版本、快照和审计底线，但普通业务会话不需要个人令牌或短时解锁；旧 `/api/state` 客户端缺少 `baseUpdatedAt` 时写入被拒绝。撤销个人令牌即可关闭跨环境网关，不影响正常在线业务写入。\n\n### 内部平台资料契约\n\n`GET /api/platform/v1/integrations` 返回：\n\n```json\n{\n  "synced": true,\n  "profiles": [\n    {\n      "platformId": "dingtalk",\n      "consoleUrl": "https://example.internal-console.invalid/",\n      "accountSubject": "公司主体",\n      "resourceNames": ["产品全周期应用"],\n      "environments": [{ "name": "生产", "url": "https://example.invalid/", "notes": "钉钉工作台" }],\n      "owner": "平台管理员",\n      "permissionGuide": "按公司权限流程申请",\n      "runbook": "公司知识库中的运行手册",\n      "verifiedAt": "2026-07-17",\n      "updatedAt": "2026-07-17T09:00:00.000Z",\n      "updatedBy": "平台管理员"\n    }\n  ]\n}\n```\n\n`PUT /api/platform/v1/integrations` 接收单个平台资料，字段与上例相同但不接收 `updatedAt` 和 `updatedBy`。平台 ID 必须存在于公开注册表；URL 必须使用 HTTPS；最近验证日期使用 `YYYY-MM-DD`。额外字段、敏感参数和疑似凭据会返回 400。\n\n兼容策略：该接口是新增的 `v1` 契约，不改变现有 API。前端在 GET 失败时降级为公开注册表；写入失败不修改本地公开状态。D1 未绑定返回 501，运维应补充 `PRODUCT_FLOW_DB` 后重新部署。\n\n可观测性：错误响应包含稳定 `error.code`、安全中文说明、`requestId` 和 `retryable`；审计记录平台 ID、动作、变更字段名、操作者和时间，不记录资料值。\n\n### 部门协同契约\n\n完整请求、响应、权限、错误、幂等、分页和契约测试见 `docs/platform/apis/collaboration-items-v1.md`。该接口使用独立 D1 表，不读取或覆盖 `/api/platform` 的战略整包状态。业务 App 只构造协同草稿；平台负责持久化、状态、审计和钉钉同步。\n\n### 共享数据口径契约\n\n完整认证、责任部门授权、查询与写入白名单、版本元数据快照、安全预览、错误、并发、兼容和审计约束见 `docs/platform/apis/data-standards-v1.md`。该接口复用 `PRODUCT_FLOW_DB`，不新增变量、Secret 或绑定；页面编辑态不是服务端授权边界。当前代码完成不代表已执行生产迁移或部署。\n\n### 品牌内容协同契约\n\n`GET /api/brand-content` 返回独立的品牌内容状态、整数版本、更新时间和更新人。D1 尚无品牌记录时返回 `200`、`synced: false`、`state: null` 和 `version: 0`，不会把本地演示内容写入生产数据库。\n\n`POST /api/brand-content` 接收：\n\n```json\n{\n  "version": 3,\n  "action": {\n    "type": "transition_content",\n    "id": "BC-260718-001",\n    "nextStatus": "editing",\n    "reason": "脚本已确认"\n  }\n}\n```\n\n允许动作包括创建内容、推进生产状态、登记 NAS 素材元数据、维护发布记录、确认补充决策和更新非敏感设置。操作者和服务端时间以当前钉钉会话为准，客户端不能覆盖。只读账号和非品牌协同范围写入返回 403；负责人动作、剪辑素材动作和运营发布动作分别校验角色。\n\n兼容策略：接口当前是品牌功能内部 API，不是数据中心共享契约。每次写入必须携带上次读取的 `version`；版本落后返回 `409 BRAND_CONTENT_VERSION_CONFLICT`，客户端重新读取后由用户重试，服务端不静默覆盖。回滚时可隐藏品牌 App 并停止写入，`brand_content_state` 记录继续保留。\n\n主要错误码：`AUTH_SESSION_REQUIRED`、`BRAND_CONTENT_STORAGE_UNAVAILABLE`、`BRAND_CONTENT_WRITE_DENIED`、`BRAND_CONTENT_ACTION_DENIED`、`BRAND_CONTENT_ACTION_INVALID`、`BRAND_CONTENT_VERSION_INVALID`、`BRAND_CONTENT_VERSION_CONFLICT`、`BRAND_CONTENT_STATE_CORRUPT`。错误响应包含 `requestId` 和 `retryable`，不包含凭据、平台原始响应或 NAS 路径外的本地敏感信息。\n\n### 供应链审批同步契约\n\n`POST /api/supply-chain/approvals/sync` 接收固定的 `startTime`、`endTime` 和批次参数：\n\n```json\n{\n  "startTime": 1784304000000,\n  "endTime": 1786895999000,\n  "batch": { "kind": "purchase", "cursor": 0, "size": 18 }\n}\n```\n\n`kind` 只允许 `purchase` 或 `payment`，`size` 最大为 20。响应通过 `continuation.nextCursor` 指示下一页；前端在同一时间范围内先耗尽采购申请页，再耗尽付款申请页，避免付款在采购尚未写入时被误判为非供应链记录。单个 Worker 调用只读取一个流程的一页，确保钉钉详情请求不超过 Cloudflare 子请求上限。每批成功后立即写入 D1，重复同步按审批实例 ID 幂等更新。\n\n### 供应链文件快照导入契约\n\n钉钉供应链文件由受授权的桌面读取适配器解析为 `dingtalk-supply-snapshot-v1` JSON。生产页面在现有公司会话和供应链部门写权限下将记录通过 `/api/supply-chain` 保存，不在浏览器中调用钉钉开放接口，也不新增跨环境数据库写入口。\n\n允许导入的集合只有 `suppliers`、`inventorySnapshots`、`materialInventorySnapshots`、`inventoryRisks`、`inventoryBatches` 和 `syncRuns`。每条记录必须带稳定 ID 和允许的钉钉来源标识；其他集合、手工来源和空快照被忽略或拒绝。供应商只保留名称、类别、供货范围和来源证据，银行卡号、手机号、身份证附件、收款资料及原始整行内容不得生成到快照。供应商表中的“对接供应商”分段标题会重置类别上下文，分段内再按供货范围映射包材或原料，不能继承上一分段的服务类别。重复导入按稳定来源行 ID 幂等覆盖，失败不删除既有成功数据。\n\n当前文件读取是钉钉用户授权会话下的受控快照，不标记为后台自动同步。回滚方式是在写入前保留生产状态快照，或按同一来源稳定 ID 导入上一版安全快照。\n\n### 货流平台 Phase 0 契约\n\n`/api/platform/v1/goods-flow/*` 是供应链管理、产品全周期、数据中心、经营驾驶舱和公司 AI 的稳定只读货流边界。写动作仍按业务职责限定在仓库、供应链、财务和总经办。React 页面只调用平台 API，不直接调用钉钉、快麦、ERP 或 D1。\n\n事件使用 `source + sourceReference + sourceVersion` 幂等。ERP 日库存、月度盘点和计算版本分别写入独立表；盘点确认新增盘盈或盘亏事件，不覆盖 ERP 快照。冻结 CCC 后补录来源只能生成新版本，旧版本继续可查。\n\n快麦当前仅登记订单、会话刷新和销售日聚合。货流平台可以读取该销售聚合用于销售成本，但在库存接口、权限、字段和生产结果独立验证完成前，不得把快麦登记为库存自动同步来源。ERP 与盘点文件继续标记为文件快照或人工校准。\n\n所有响应包含安全 request ID；数据响应包含更新时间、覆盖率、可信等级和版本。缺数据不补零。外部超时保留上次成功投影，部分导入返回成功数、失败数和异常队列引用。完整权限、错误码、迁移和回滚规则见 `docs/features/supply-chain-goods-flow-phase-0/` 与 `docs/platform/error-codes.md`。\n\n`POST /api/platform/v1/goods-flow/ccc/:month/recalculate` 的请求体只用于命令封装，不接收指标事实。服务端按月份读取 `goods_flow_events`、`goods_flow_inventory_daily` 和有效平台账期后生成计算输入；浏览器提交的库存、销售、采购、付款或金额字段一律忽略。盘点金额确认会追加 `inventory_adjustment_confirmed` 事件并重建受影响的校准库存投影；追加更正创建新盘点记录，原确认记录不改写。\n\n本地 Node 测试页复用相同路由、授权和响应契约，数据仅写入被忽略的 `.local-data/goods-flow-preview.json`，不连接生产 D1，也不触发真实钉钉、快麦或 ERP 动作。本地、Preview 和 Production 必须分别验收，不能用本地结果替代已部署验证。\n## 认证\n\n- `/api/auth/session`：读取当前公共会话模型。\n- `/api/auth/dingtalk/start`：启动浏览器钉钉登录。\n- `/api/auth/dingtalk/callback`：校验 state 并建立公司员工会话。\n- `/api/auth/dingtalk/embedded`：钉钉内嵌免登。\n- `/api/auth/logout`：撤销当前服务端会话并清理 Cookie。\n\n## 钉钉\n\n- `/api/dingtalk/org/status|sync|users`：组织同步状态、同步和成员读取。\n- `/api/dingtalk/todo/create|list|sync`：个人待办创建、读取和幂等同步。\n- `/api/dingtalk/calendar/create|events`：日历事件创建和查询。\n- `/api/dingtalk/doc/read`：读取已授权钉钉文档。\n- `/api/dingtalk/meeting/minutes`：读取可匹配的会议纪要。\n- `/api/dingtalk/config` 与 `/api/dingtalk/login`：登录配置和兼容登录入口。\n\n## 快麦\n\n- `/api/kuaimai/pull`：按日期分页拉取订单并聚合。\n- `/api/kuaimai/refresh`：刷新配置范围数据。\n- `/api/kuaimai/status`：读取同步配置和数据状态。\n\n## 版本与变更\n\n现有路径保持兼容。新多系统契约必须建立 API 文档、负责人、调用方、认证权限、错误码、可观测性和契约测试。破坏性变化通过新版本路径提供，并给调用方迁移时间。\n',yn="# 平台总体架构\n\n系统采用模块化单体前端、Cloudflare Pages Functions 和 D1 持久化。当前先保持边界清晰和契约稳定，出现第二个真实系统调用方后再抽取独立包或服务。\n\n## 前端边界\n\n- `src/domain/`：纯业务规则、规范化、排序、状态计算和数据投影。\n- `src/ui/`：不绑定业务部门的基础组件。\n- `src/features/`：公司经营和产品功能页面。\n- `src/state/`：共享状态、认证状态、平台状态和 API 客户端编排。\n- `src/App.jsx`：导航和页面装配，不承载领域计算。\n\n依赖方向为 `features -> ui/domain/state`。领域模块不能依赖 React、浏览器或网络；功能页面不能直接调用钉钉、快麦或 ERP。\n\n## 服务端边界\n\n- `functions/api/_middleware.js`：公共路由识别、OPTIONS 和公司会话认证。\n- `functions/api/auth/`：钉钉登录、Cookie 会话和退出。\n- `functions/api/dingtalk/`：组织、待办、日历、文档和会议纪要适配。\n- `functions/api/kuaimai/`：订单拉取、聚合、刷新和同步状态。\n- `functions/api/state.js`：产品全周期共享状态持久化。\n- `functions/api/platform.js`：公司经营平台实体持久化。\n- `functions/api/sales.js`：产品销售数据查询。\n- `functions/api/platform/v1/environment-readiness.js`：按环境能力清单执行脱敏就绪检查。\n- `functions/api/platform/v1/production-data/`：个人令牌、短时解锁、版本冲突、快照、审计和回滚边界。\n\n## 数据流\n\n浏览器先完成钉钉身份认证，再读取产品共享状态或公司平台状态。产品全周期整状态同步必须先取得服务器 `updatedAt` 基线；本地缓存只用于首屏和人工恢复，不能在启动时自动上传。客户端比较排除组织缓存刷新时间的规范化业务指纹，无业务变化时不保存。服务端验证会话与写权限，先保存写前快照与审计，再用单个 D1 原子批次比较并推进修订清单、替换全部状态分片；缺少、落后或被并发推进的基线返回 409。外部平台调用由对应适配层完成。客户端不得持有服务端密钥。\n\n完整本地开发通过 `npm start` 同时运行 Vite 与 Wrangler Pages Functions。浏览器只访问 Vite `127.0.0.1:8127`，页面保留热更新，所有 `/api` 请求代理到内部 Wrangler `127.0.0.1:8132`。Wrangler 从被忽略的 `.env` 读取个人令牌并远程绑定生产 D1；API 中间件仅在回环主机和显式开关下校验令牌哈希、能力与 active executive 组织身份，再注入真实线上会话。之后数据与钉钉、快麦等外部动作进入同一套正式路由、权限和适配器。令牌不得进入浏览器；硬编码本地身份和第二套本地业务 API 都不是支持的完整运行时。\n\n生产数据网关继续作为运维修复旁路：它的跨环境写入仍需要 15 分钟解锁、版本检查、写前快照和审计。本地线上账号模式是正式应用在本机执行，不绕过业务 API 自己的版本、幂等、审计或提供商权限。\n\n## 运行环境\n\n- 本地完整运行时使用 Vite 热更新与 `/api` 到 Pages Functions 的反向代理；仅运行 Vite 不具备业务 API 能力。\n- Cloudflare Pages/Functions 是生产静态资源和 API 边界。\n- D1 保存公司共享状态、平台实体、会话、组织缓存和销售聚合。\n- 整状态共享数据以 D1 为事实源；默认状态、旧标签页和旧分支只有在先读取当前基线后才能写，同一基线通过原子比较只能被接受一次，所有成功写入都可通过快照和审计回滚。\n- 钉钉 WebView 是独立的嵌入环境，需要单独验证登录、视口和权限。\n- `docs/platform/environment-capabilities.json` 定义各环境必需的变量名、绑定名和表结构；生成模块供 Pages Functions 使用，CI 检查漂移。\n\n### 前端发布恢复\n\n- Cloudflare Pages 发布必须包含顶层 `404.html`。系统使用 Hash 路由，不依赖任意路径回退到首页；缺失的 JS/CSS 必须返回 404，不能伪装成首页 HTML。\n- 应用入口在 React 渲染前接管 Vite 的 `vite:preloadError`。旧标签页加载已被新部署替换的动态分包时，自动刷新获取当前版本。\n- 自动刷新使用会话级冷却时间防止循环；受限 WebView 无法使用会话存储时，仍允许执行一次浏览器刷新。\n- `_headers` 保持入口 HTML 不缓存；`npm run build` 必须在 `dist` 内生成 `cloudflare-entry.html`、`_headers` 和 `_redirects`，确保 Cloudflare Git 自动部署与手动根目录部署同构。`scripts/prepare-pages-release.mjs` 只能从完整 `dist` 同步根目录发布包，避免两条发布路径遗漏不同文件。\n\n## 未来平台化\n\n新多系统接口放在 `/api/platform/v1/`。通用 UI、契约和客户端只有在第二个真实调用方出现后才抽为 workspace package，避免基于假设建设中台。\n",xn=`# 浏览器市场采集规则

## 安全边界

采集器运行在公司 Mac，通过 Chrome DevTools Protocol 读取已经打开且 URL 与数据中心登记地址完全一致的 HTTPS 市场页面。它不启动登录、不枚举历史记录、不扫描未登记标签页、不读取 Cookie 存储、不提交验证码，也不执行关注、消息、价格、预算、商品或广告操作。

后台地址必须指向人工确认的平台类目市场页。采集器只提取当前页面文字和表格的结构化值；完整 HTML、截图、请求头和会话不会上传 D1。

## 运行方式

1. 总经办通过设备登记接口创建公司 Mac 采集器，原始令牌只显示一次。
2. 令牌放在公司 Mac 的受控进程环境 \`USER_INSIGHTS_RUNNER_TOKEN\`，不得写入仓库、D1、日志或页面。
3. Chrome 使用独立公司采集配置并开启本机调试端口；只在 \`127.0.0.1\` 暴露。
4. 产品或运营登记后台市场页和提取字段，确认类目后任务才对采集器可见。
5. 工作日按数据中心 \`07:30\` 截止时间运行 \`npm run collect:user-insights\`；周末自动跳过。人工重试使用 \`--force\`，仍会经过服务端范围和类目校验。

本机非敏感配置：

- \`USER_INSIGHTS_BASE_URL\`：平台地址，默认本地预览。
- \`USER_INSIGHTS_CDP_ENDPOINT\`：本机 Chrome 调试地址，默认 \`http://127.0.0.1:9222\`。

\`USER_INSIGHTS_RUNNER_TOKEN\` 是本机 Secret，不进入 Cloudflare 环境能力清单，也不能提交。

## 适配器契约

每个已登记类目包含平台、店铺/产品、类目 ID 与路径、精确 HTTPS 页面地址、支持维度、结构版本和提取配置。提取配置按维度声明必需列及字段映射。缺少必需列时状态为 \`schema_changed\`，停止该维度写入；平台没有维度时标为 \`unsupported\`。

平台页面优先使用其可见导出结果；通用采集器当前读取已登记页面的可见表格。新增平台适配器必须提供固定夹具、单位映射、时间口径、登录/风控识别、结构变化测试和生产验收记录。

## 状态处理

- \`healthy\`：结构和必需字段完整，写入快照和实体。
- \`partial\`：允许字段缺失但仍有可验证事实，保存覆盖率并降低建议置信度。
- \`login_required\`：页面出现登录、验证码或安全验证，停止并等待人工登录。
- \`schema_changed\`：必需列或登记表格消失，停止并更新采集规则。
- \`failed\`：浏览器连接、页面读取或服务端批次失败；保留最后成功快照。
- \`stale\`：超过新鲜度要求，继续显示最后成功数据和截止时间。

任何失败都不能把缺失值写成 0，也不能覆盖最后成功快照或生成高置信度建议。

## 数据与幂等

内容先按稳定字段顺序计算 SHA-256；平台、店铺、类目、维度、日期、结构版本和哈希构成幂等键。重复批次不重复写入。服务端只接受设备令牌允许的平台/店铺和人工确认类目，每批最多 2,000 个实体。

## 生产验收与回滚

CI 只用固定夹具。真实平台验收必须在公司 Mac 已登录页面执行并登记平台、类目、页面结构版本、读取数量和结果；不得将原始页面或账号信息加入测试证据。

回滚时停止工作日任务、停用设备令牌并关闭功能开关。D1 标准事实、规则、同步和审计保留，原始本机归档按数据中心保留策略处理。
`,Ln="# 通用组件目录\n\n通用组件位于 `src/ui/`。组件必须使用设计 Token、业务无关属性和稳定交互，不在内部写死部门、产品或审批文案。\n\n| 组件 | 用途 | 关键约束 |\n| --- | --- | --- |\n| `Button` / `IconAction` | 主操作、普通操作、危险操作和图标操作 | disabled 必须说明原因；危险样式只用于不可逆动作 |\n| `Modal` | 需要集中注意力的复杂编辑 | 优先考虑页面内编辑；焦点必须可进入和返回 |\n| `ConfirmDialog` | 不可逆或高影响确认 | 明确对象、后果和确认动作，不使用浏览器模糊提示 |\n| `DataTable` / `TableActions` | 高密度结构化数据 | 表头不拆字，列宽稳定，窄屏水平滚动，操作不换行 |\n| `HeaderFilter` | 页面级轻量筛选 | 选项数量有限且不会遮挡页面主操作 |\n| `DatePickerField` | 标准日期输入 | 输出稳定日期格式，浮层不被表格裁切 |\n| `DateRangeControls` | 起止日期组合 | 复用 `DatePickerField`；只上报草稿值，是否查询由业务页面显式决定 |\n| `DateRangePickerField` | 确认式日期范围输入 | 草稿不向父级提交；完整合法范围确认后才输出，浮层不被容器裁切 |\n| `ExpectedLaunchMonthSelect` | 预计上市月份 | 只提供当前及未来月份，存储 `YYYY-MM` |\n| `ProductPicker` | 产品切换 | 保留显式选择，清楚展示当前产品和责任归属 |\n| `OrgSelect` | 钉钉部门或人员选择 | 不使用自由文本伪造组织成员，浮层通过安全层级展示 |\n| `RichTextEditor` | 需要结构化说明的长文本 | 保留基本语义和可读降级，不用于简单单行内容 |\n| `DeliverablePreviewModal` | 交付物预览 | 根据类型安全预览，下载能力由来源决定 |\n| `FloatingMenu` | 脱离裁切容器的菜单 | 统一浮层定位、关闭、键盘和层级行为 |\n\n## 平台组合组件\n\n`EnvironmentReadinessPanel` 位于 `src/features/handbook/`，消费稳定的环境就绪 API，统一展示 Cloudflare、D1、钉钉和其他平台的环境状态。它是说明书中的平台组合能力，不是基础控件；其他页面需要状态展示时应复用其状态契约和文案，不复制密钥检查逻辑到组件。\n\n## 组件状态\n\n交互组件按适用范围覆盖 default、hover、focus、active、disabled、loading、error、empty 和 selected。加载优先使用保持布局的骨架；空状态说明下一步；错误说明原因和恢复方式。\n\n## 进入通用层的条件\n\n基础控件可以直接进入 `src/ui`。其他组件至少有两个真实消费者，或者经过设计评审确认属于稳定平台模式。只服务一个业务页面的组合组件留在对应 feature。\n\n## 兼容与废弃\n\n修改共享组件属性前搜索全部调用方并补测试。废弃属性先提供迁移说明和兼容周期，不在无关功能 PR 中顺手重写所有调用方。\n",Un=`# 通用数据采集平台

## 用途

数据中心通过统一 provider registry、连接保险箱、文件导入、受控任务和结果 writer 获取外部系统数据。业务 App 只读取标准事实表或平台 API，不能直接登录抖音、ERP、广告平台或 NAS。

2026-07-21 起，抖音等店铺网页登录采集已退役：动态协议、验证码、滑块和设备验证使其不适合作为稳定无人值守能力。店铺经营改用平台原始文件；通用 provider 边界继续服务于已经验证的 ERP、广告和内部数据接入，不能因旧抖音实现而推断其他平台已接通。

## 分层

1. provider registry 声明固定域名、凭据结构、任务类型、资源类型和结构版本；未登记内容默认拒绝。
2. \`data_connections\` 保存通用账户标识、凭据结构 ID 和共享保险箱条目引用；AES-GCM 密文只保存在现有 \`credential_vault_entries\`，不创建第二套凭据存储，也不把邮箱、API Key 等字段固化为数据库列。
3. \`browser_agent_tasks\` 使用 \`platformId + taskType + resourceType + schemaVersion + cursor\` 描述采集，不保存明文凭据。
4. 公司 Mac 按设备 scope 领取任务，再使用一次性五分钟 grant 获取该任务的当前凭据。
5. provider adapter 只负责固定允许域名内的登录/API/文件操作和原始结果标准化。
6. provider/resource writer 白名单把结果写入对应标准表；身份写入店铺表，订单、商品、库存和广告数据分别写入自己的事实表，禁止万能 JSON 明细仓库。

## 连接与凭据

- \`account_label\` 是可展示的通用账户标识；抖音映射为登录邮箱，ERP 可映射为账套或账号名称。
- \`credential_schema_id\` 指向 provider registry 中的版本化结构；抖音首期为 \`email-password-v1\`。
- secret fields 作为一个加密 JSON 写入数据中心共享凭据保险箱，并通过 \`credential_entry_id\` 与采集连接关联。
- 普通列表不返回 secrets；受控 reveal 和 task credential 都使用 \`no-store\`，且必须服务端授权。
- 验证码、Cookie、Token、完整 HTML、截图和原始平台响应不得作为任务结果保存。

## 扩展一个 provider

新增 provider 必须同时完成：集成注册、环境能力、凭据 schema、允许域名、任务/资源 schema、adapter、result writer、认证与失败测试、迁移容量评估、回滚说明和生产独立验收。仅登记 adapter 不代表平台已接通；没有真实结构验证时状态保持 \`integrating\`。

ERP adapter 可以选择服务端 API、浏览器页面、文件导出或 NAS 文件读取，但对调度器统一表现为任务。游标、时间范围、幂等键和结构版本属于任务契约，业务口径属于目标事实表契约。

## 运行与恢复

- 旧店铺浏览器 agent 已停用，不再创建或领取店铺登录任务。后续若有具备稳定接口和明确授权的新 provider，必须重新完成集成评审和生产验证。
- 浏览器 provider 必须按页面条件等待可操作状态；平台专属的登录方式切换、字段选择器和人工验证文案留在 adapter 内。对有动态风控的平台，adapter 只预填凭证，不代替用户点击登录、接受协议或提交验证码；再次验证优先复用同一登录页，同一固定浏览器 Profile 在人工登录后复用会话。普通手机登录方式中的“发送验证码”等说明不得直接当成已出现人工挑战，邮箱验证码、滑块、扫码和设备确认则必须保持人工等待状态。
- 公司 Mac 离线：任务留在队列，不丢失连接。
- 五分钟 claim 到期：其他同 scope agent 可重新领取。
- 一次性 grant 已消费或凭据版本变化：拒绝并重新领取任务。
- 人工验证：状态改为 \`waiting_human_verification\`，不保存验证码。
- 页面结构变化：adapter 返回稳定错误，保留最后成功事实。
- 回滚：停止创建和领取新任务，页面切回只读；保留连接、密文、事实和审计。

## 当前范围

店铺网页登录 provider 已退役；六个店铺平台当前只登记文件样例等待状态。文件上传、字段识别和标准化解析尚未在没有真实样例时实现。ERP、广告、钉钉和 NAS 是否可用仍以各自注册表与生产证据为准。
`,wn=`# 环境一致性 Skill

让后续开发不再依赖“记得去钉钉、快麦或 Cloudflare 看配置”，而是按照同一套可检查、可阻断、可回滚的规则工作。

## 解决什么问题

- 本地能用，生产缺环境变量、数据库绑定或数据表。
- 不同分支各自写一套配置说明，主规则没有同步更新。
- 已有生产数据网关没有被复用，又出现新的直连或旁路。
- 把“能修改生产数据库”误认为“能操作钉钉、快麦或阿里云”。
- Preview 通过后直接宣称生产可用。

## 框架

| 层 | 作用 |
|---|---|
| 发现 | 通过集成注册表识别钉钉、快麦、Cloudflare、阿里云等关联平台。 |
| 契约 | 用环境能力清单统一记录变量名、绑定、数据表、适用环境和阻断等级。 |
| 保护 | 生产写入统一经过个人令牌、最高权限身份、15 分钟解锁、版本检查、快照、审计和回滚。 |
| 验收 | 本地、Preview、Production 分开检查，部署后执行生产就绪验证。 |

## 如何确保使用

1. \`AGENTS.md\` 将相关场景设为强制触发条件。
2. \`feature-workflow\` 在功能开始时把它作为必需子 Skill。
3. \`verification\` 在交付时要求生产环境验证。
4. 治理测试要求 Skill 文件始终存在且已接入工作流。
5. 每个 PR 必须用 \`Rule-Writeback\` 列出反写的长期规则文件；共享边界改动写 \`none\` 会被 CI 拒绝。
6. CI 检查生成文件是否与环境清单一致；集成门禁检查 PR 是否声明受影响平台。
7. 部署后验证必须带上每个受影响平台；该平台仍有 warning 时不能称为完成或部署成功。

用户可以免去人工审核，但不能跳过自动门禁、迁移、回滚和生产验证。数据库写权限与外部平台动作权限始终分开。
`,Mn=`# 环境与生产数据

统一查看测试、预览和生产环境的数据库、钉钉及外部平台能力，并为授权账号提供受审计的生产数据修正入口。

## 环境状态

页面只显示变量名、绑定名和表结构是否存在，不展示任何密钥值。阻断项必须在发布验收前修复；警告项不会阻止核心系统运行，但会影响对应平台能力。

## 生产数据规则

标准本地开发配置个人令牌后，以真实最高权限账号运行 Pages Functions，直接使用生产 D1 和正常业务写入链路。页面持续提示“本地代码 · 线上真实环境”，所有操作立即生效。个人令牌仅存在于被忽略的 \`.env\`，且只有回环主机能触发该身份校验。

“解锁 15 分钟生产写入”属于独立的生产数据运维修复网关；通过该网关写入时仍检查版本、保存写前快照并记录审计。

## 外部平台边界

生产数据库写入权不等于钉钉、快麦或其他平台的真实操作权。本地线上账号能够执行外部动作，是因为真实会话进入了对应正式路由并再次通过角色、目标范围和提供商权限，而不是因为 localhost 或数据库权限自动放行。
`,Gn='# 错误结构与错误码\n\n新共享 API 使用统一错误结构。现有接口按路由逐步迁移，迁移期间保持原调用方兼容。\n\n```json\n{\n  "error": {\n    "code": "VALIDATION_REQUIRED_FIELD",\n    "message": "请补充必填信息。",\n    "requestId": "req_20260717_example",\n    "retryable": false\n  }\n}\n```\n\n## 字段\n\n- `code`：稳定、可用于程序判断的错误码。\n- `message`：可以安全展示给公司员工的中文说明，不包含密钥或原始外部响应。\n- `requestId`：用于服务端日志定位，同一次请求保持一致。\n- `retryable`：表示原请求在不修改输入时是否适合重试。\n\n## 前缀\n\n| 前缀 | 范围 | 示例 |\n| --- | --- | --- |\n| `AUTH_` | 未登录、会话失效、登录回调 | `AUTH_SESSION_REQUIRED` |\n| `PERMISSION_` | 部门、角色或写权限不足 | `PERMISSION_WRITE_DENIED` |\n| `VALIDATION_` | 参数、状态或业务规则校验 | `VALIDATION_REQUIRED_FIELD` |\n| `STATE_` | 共享状态、版本或持久化 | `STATE_SAVE_FAILED` |\n| `DINGTALK_` | 钉钉授权和接口调用 | `DINGTALK_PERMISSION_MISSING` |\n| `KUAIMAI_` | 快麦配置、签名和拉取 | `KUAIMAI_SYNC_FAILED` |\n| `PLATFORM_` | 公司级平台连接、验证、版本和安全存储 | `PLATFORM_CONNECTION_VALIDATION_FAILED` |\n| `PRODUCT_CATALOG_` | 商品目录校验、权限和存储 | `PRODUCT_CATALOG_STORAGE_UNAVAILABLE` |\n| `INTEGRATION_` | 平台注册表、内部资料和存储 | `INTEGRATION_PROFILE_INVALID` |\n| `COLLABORATION_` | 跨 App 部门协同、状态、版本和存储 | `COLLABORATION_VERSION_CONFLICT` |\n| `DATA_` | 数据中心日期、元数据和存储 | `DATA_DATE_RANGE_INVALID` |\n| `USER_INSIGHTS_` | 用户洞察未预期处理错误 | `USER_INSIGHTS_UNEXPECTED` |\n| `GOODS_FLOW_` | 货流事实、库存、盘点、账期和 CCC | `GOODS_FLOW_VERSION_CONFLICT` |\n| `CREDENTIAL_` | 加密凭证、密钥、查看和采集器授权 | `CREDENTIAL_KEY_UNAVAILABLE` |\n\n## 快麦 ERP 本地归档\n\n- `ERP_COLLECTION_RUNNER_TOKEN_REQUIRED` / `ERP_COLLECTION_RUNNER_TOKEN_INVALID`：采集器钥匙串令牌缺失、无效、停用或范围不符。\n- `ERP_COLLECTION_RUNNER_REGISTER_DENIED`：非总经办用户尝试登记采集器。\n- `ERP_COLLECTION_ARCHIVE_INVALID` / `ERP_COLLECTION_ARCHIVE_HASH_MISMATCH` / `ERP_COLLECTION_ARCHIVE_PATH_INVALID`：归档清单、哈希或相对路径不合法。\n- `KUAIMAI_ARCHIVE_DISK_SPACE_LOW` / `KUAIMAI_ARCHIVE_COPY_HASH_MISMATCH` / `KUAIMAI_ARCHIVE_MANIFEST_INVALID`：本地磁盘、复制校验或 manifest 恢复失败；不得移动或删除来源文件。\n| `DATA_CONNECTION_` | 实例级数据连接错误 | `DATA_CONNECTION_UNEXPECTED` |\n| `BROWSER_AGENT_` | 公司 Mac 采集任务错误 | `BROWSER_AGENT_TASK_FAILED` |\n| `ENVIRONMENT_` | 环境能力、生成清单和生产就绪 | `ENVIRONMENT_READINESS_FAILED` |\n| `PRODUCTION_` | 跨环境生产数据令牌、解锁、冲突、快照和回滚 | `PRODUCTION_WRITE_LOCKED` |\n| `LOCAL_ONLINE_` | 本地线上账号配置、数据库与运行时 | `LOCAL_ONLINE_TOKEN_REQUIRED` |\n| `AI_` | 公司 AI 总助、数据权限、Provider 和流式响应 | `AI_PROVIDER_RATE_LIMITED` |\n| `INTERNAL_` | 未预期服务端错误 | `INTERNAL_UNEXPECTED` |\n\n内部平台资料 API 使用：\n\n- `AUTH_SESSION_REQUIRED`：没有有效公司会话。\n- `PERMISSION_WRITE_DENIED`：当前用户不能维护内部资料。\n- `INTEGRATION_PROFILE_INVALID`：字段、URL、日期、平台 ID 或敏感内容校验失败。\n- `INTEGRATION_STORAGE_UNAVAILABLE`：缺少 D1 绑定，公开资料仍可降级展示。\n- `VALIDATION_METHOD_NOT_ALLOWED`：请求方法不受支持。\n\n平台连接 API 使用：\n\n- `PLATFORM_CONNECTION_INVALID`：平台、字段或请求结构不符合该平台契约。\n- `PLATFORM_CONNECTION_NOT_FOUND`：要停用的保险箱连接不存在。\n- `PLATFORM_CONNECTION_VERSION_CONFLICT`：读取版本已经过期，候选连接未切换，HTTP 409。\n- `PLATFORM_CONNECTION_VALIDATION_FAILED`：候选配置未通过只读平台验证，原连接不受影响，HTTP 422。\n- `PLATFORM_CREDENTIAL_KEY_UNAVAILABLE`：当前部署缺少有效的加密主密钥。\n- `PLATFORM_CONNECTION_STORAGE_UNAVAILABLE`：当前部署缺少 D1 绑定或保险箱表不可用。\n\n部门协同 API 使用：\n\n- `PERMISSION_READ_DENIED`：当前身份不能读取请求范围。\n- `PERMISSION_WRITE_DENIED`：当前身份不能执行写操作或状态动作。\n- `COLLABORATION_ITEM_INVALID`：字段、身份、来源、时间或证据不符合契约。\n- `COLLABORATION_TRANSITION_INVALID`：当前状态或角色不能执行请求动作。\n- `COLLABORATION_ITEM_NOT_FOUND`：事项不存在或对当前用户不可见。\n- `COLLABORATION_VERSION_CONFLICT`：读取版本已经过期，写入未执行。\n- `COLLABORATION_IDEMPOTENCY_CONFLICT`：同一幂等键与现有业务来源不一致。\n- `COLLABORATION_STORAGE_UNAVAILABLE`：缺少 D1 绑定或协同表写入不可用。\n- `DINGTALK_TODO_SYNC_FAILED`：协同状态已保存，但钉钉待办同步失败。\n\n数据中心 API 使用：\n\n- `AUTH_SESSION_REQUIRED`：没有有效公司会话。\n- `PERMISSION_VIEW_DENIED`：当前部门无权查看数据中心。\n- `PERMISSION_WRITE_DENIED`：当前身份不能维护数据中心元数据。\n- `DATA_STATE_INVALID`：提交的元数据状态结构无效。\n- `DATA_DATE_RANGE_INVALID`：日期缺失、倒置或跨度超过 370 天。\n- `DATA_SERVICE_DATE_RANGE_INVALID`：销售数据服务只收到一个日期，或日期非法、倒置、超出服务上限。\n- `DATA_SERVICE_QUERY_FAILED`：销售数据服务读取或聚合 D1 失败，可重试。\n- `DATA_STORAGE_UNAVAILABLE`：当前部署缺少 `PRODUCT_FLOW_DB` 绑定。\n- `DATA_STORAGE_TEMPORARILY_UNAVAILABLE`：D1 远程读取链路暂时中断；不暴露 Miniflare 或 D1 底层错误，GET 客户端可自动重试一次。\n- `DATA_CONNECTOR_INVALID`：连接器 ID、字段、URL、保险箱类型或敏感字段边界不合法。\n- `DATA_CONNECTOR_NOT_FOUND`：连接实例不存在、已归档或对当前身份不可见。\n- `DATA_CONNECTOR_VERSION_CONFLICT`：连接实例或保险箱条目版本已经更新，HTTP 409。\n\n共享数据口径 API 使用：\n\n- `DATA_STANDARD_INVALID`：请求字段、日期、公式结构或不可变 `metricCode` 不合法。\n- `DATA_STANDARD_FIELD_UNKNOWN`：公式或来源引用未登记事实字段。\n- `DATA_STANDARD_CYCLE`：指标依赖形成循环。\n- `DATA_STANDARD_UNIT_MISMATCH`：声明单位与公式推导单位不一致。\n- `DATA_STANDARD_VERSION_CONFLICT`：提交版本落后或 `metricCode` 已存在，HTTP 409。\n- `DATA_STANDARD_EFFECTIVE_DATE_CONFLICT`：新版本生效日期未严格递增或同日重复，HTTP 409。\n- `DATA_STANDARD_DEPENDENCY_ARCHIVED`：新版本依赖已归档口径。\n- `DATA_STANDARD_QUERY_RANGE_INVALID`：指标数量、依赖深度、自然日期或计算范围超过契约限制。\n- `DATA_STANDARD_CALCULATION_FAILED`：后台口径计算失败；旧的当前结果继续有效。\n- `DATA_STANDARD_STORAGE_UNAVAILABLE`：当前部署缺少 `PRODUCT_FLOW_DB` 绑定。\n\n数据口径的稳定错误、责任部门授权、版本快照和重试语义见 `docs/platform/apis/data-standards-v1.md`。\n\n加密凭证 API 使用：\n\n- `CREDENTIAL_ENTRY_INVALID`：凭证类型、字段 schema、范围或敏感 payload 不合法。\n- `CREDENTIAL_ENTRY_NOT_FOUND`：条目不存在或对当前身份不可见。\n- `CREDENTIAL_VERSION_CONFLICT`：提交的凭证版本已经过期，HTTP 409，刷新后重新操作。\n- `CREDENTIAL_RATE_LIMITED`：同一条目短时间明文查看次数过多，HTTP 429。\n- `CREDENTIAL_ENCRYPT_FAILED`：服务端未能完成加密；响应不包含输入值或底层异常。\n- `CREDENTIAL_KEY_UNAVAILABLE`：加密主密钥或对应密钥版本未配置，不能保存或取用凭证。\n- `CREDENTIAL_DECRYPT_FAILED`：密文校验或解密失败；响应不包含密文、字段值或底层异常。\n- `CREDENTIAL_REAUTH_REQUIRED`：查看或复制明文需要近期重新认证。\n- `CREDENTIAL_REVEAL_DENIED`：当前身份没有该条目的明文查看权限。\n- `CREDENTIAL_TASK_GRANT_INVALID`：采集器、任务、字段范围或授权状态不合法。\n- `CREDENTIAL_TASK_GRANT_EXPIRED`：短时授权已过期、已消费或已吊销。\n- `CREDENTIAL_STORAGE_UNAVAILABLE`：D1 绑定或凭证表不可用。\n\n用户洞察共享 API 使用：\n\n- `AUTH_RUNNER_TOKEN_REQUIRED` / `AUTH_RUNNER_TOKEN_INVALID`：采集设备令牌缺失、无效或已停用。\n- `PERMISSION_RULE_WRITE_DENIED`：当前部门不能修改目标 App 的规则。\n- `PERMISSION_CATEGORY_UNCONFIRMED`：平台类目尚未人工确认，采集批次被拒绝。\n- `PERMISSION_RUNNER_SCOPE_DENIED`：批次平台或店铺超出设备授权范围。\n- `VALIDATION_RULE_INVALID` / `VALIDATION_INGEST_INVALID`：规则或采集批次字段不完整。\n- `VALIDATION_COMPETITOR_TRANSITION`：候选确认、驳回或停用缺少原因或状态无效。\n- `CATEGORY_CONFIRMATION_REQUIRED`：手动重试前尚未确认当前平台类目。\n- `VERSION_CONFLICT`：规则、类目或竞品版本已变化，HTTP 409。\n- `STORAGE_D1_UNAVAILABLE`：当前部署缺少用户洞察所需的 D1 绑定或表。\n\n货流平台 API 使用：\n\n- `GOODS_FLOW_STORAGE_UNAVAILABLE`：当前部署缺少 `PRODUCT_FLOW_DB` 或货流表。\n- `GOODS_FLOW_REQUEST_INVALID`：请求字段、日期、数值或业务幂等键不合法。\n- `GOODS_FLOW_IDEMPOTENCY_KEY_REQUIRED`：写入请求缺少 `Idempotency-Key`，HTTP 400。\n- `GOODS_FLOW_ACTION_DENIED`：当前部门不能执行盘点、账期、重算或冻结动作。\n- `GOODS_FLOW_WRITE_DENIED`：只读账号尝试执行货流写入，HTTP 403。\n- `GOODS_FLOW_VERSION_CONFLICT`：盘点、账期或 CCC 的读取版本已过期，HTTP 409。\n- `GOODS_FLOW_IDEMPOTENCY_CONFLICT`：同一来源引用或业务幂等键指向不同内容，HTTP 409。\n- `GOODS_FLOW_SKU_MAPPING_REQUIRED`：商品或库存单位编码不能确定性映射，记录进入异常队列。\n- `GOODS_FLOW_COMPONENT_MAPPING_REQUIRED`：组合商品的库存组成、比例或叶子库存单位不完整，本条销量不计入库存消耗。\n- `GOODS_FLOW_PURCHASE_LINK_REQUIRED`：付款没有可验证的采购关联，不计入货流金额。\n- `GOODS_FLOW_TERM_OVERLAP`：同一平台账期生效区间重叠，HTTP 409。\n- `GOODS_FLOW_METRIC_INCOMPLETE`：计算来源覆盖不足，指标不可冻结。\n- `GOODS_FLOW_SOURCE_PARTIAL`：导入部分成功，失败行进入异常队列，HTTP 207。\n- `GOODS_FLOW_MONTH_INVALID`：CCC 重算月份不是 `YYYY-MM`，HTTP 400。\n- `GOODS_FLOW_STOCKTAKE_INVALID`：盘点任务、仓库、日期或明细不完整，HTTP 400。\n- `GOODS_FLOW_STOCKTAKE_NOT_FOUND`：盘点任务不存在，HTTP 404。\n- `GOODS_FLOW_STOCKTAKE_TRANSITION_INVALID`：盘点操作不在允许状态机内，HTTP 400。\n- `GOODS_FLOW_STOCKTAKE_STATE_CONFLICT`：当前盘点状态不能执行请求动作，HTTP 409。\n\n公司统一 AI API 使用：\n\n- `AI_DISABLED`：公司 AI 总助功能开关关闭。\n- `AI_SESSION_REQUIRED`：没有有效公司会话。\n- `AI_STORAGE_UNAVAILABLE`：当前部署缺少 `PRODUCT_FLOW_DB` 绑定。\n- `AI_PROVIDER_NOT_REGISTERED`：Provider 不在服务端白名单。\n- `AI_PROVIDER_SECRET_MISSING`：新的服务端 Secret 尚未配置。\n- `AI_PROVIDER_MANAGE_DENIED`：当前身份不能修改 Provider 元数据。\n- `AI_PROVIDER_TEST_DENIED`：当前身份不能执行合成连接测试。\n- `AI_PROVIDER_AUTH_FAILED`：Provider 拒绝服务端凭据。\n- `AI_PROVIDER_RATE_LIMITED`：Provider 返回 429，适合稍后手动重试。\n- `AI_PROVIDER_TIMEOUT`：Provider 在 45 秒内未响应。\n- `AI_PROVIDER_UNAVAILABLE`：Provider 网络或 5xx 故障。\n- `AI_PROVIDER_STREAM_FAILED`：流式响应失败或中断；已生成内容可保留但不得当作完整回答。\n- `AI_PROVIDER_SKILLS_UNSUPPORTED`：Provider 未完成纯合成 Function Calling 测试；状态标记原生能力不可用，总助改用受控服务端只读 Skills，未命中 Skill 的问题才使用摘要模式。\n- `AI_PROVIDER_INVALID_TOOL_ARGUMENTS`：Provider 在合成能力测试中返回无效工具参数。\n- `AI_PROVIDER_NOT_READY`：Provider 未启用或服务端 Secret 未就绪。\n- `AI_MESSAGES_INVALID`：消息数量、角色、长度或顺序不符合契约。\n- `AI_FINANCE_TRANSFER_BLOCKED`：消息包含具体财务值，当前 Provider 未通过外发审核。\n- `AI_REQUEST_IN_FLIGHT`：当前用户已有一个回答正在生成，HTTP 409。\n- `AI_CONTEXT_EMPTY`：当前身份没有可用且可外发的公司数据上下文。\n- `AI_SKILL_UNKNOWN` / `AI_SKILL_DENIED`：Provider 请求了未登记或当前会话无权使用的只读 Skill。\n- `AI_SKILL_ARGUMENTS_INVALID`：Skill 参数不符合服务端固定 Schema。\n- `AI_SKILL_TIMEOUT`：单个只读 Skill 查询超过 8 秒。\n- `AI_SKILL_DUPLICATE`：同一回答内出现相同 Skill 和参数，服务端拒绝重复读取。\n- `AI_SKILL_CALL_LIMIT` / `AI_SKILL_LOOP_LIMIT`：单次回答超过六次调用或两轮工具循环，服务端停止生成。\n- `AI_STREAM_CANCELLED`：客户端主动停止回答，租约已释放且审计标记未完成。\n- `AI_LOCAL_PREVIEW_READ_ONLY`：本地 Node 预览只展示脱敏状态，不调用 Provider 或修改配置。\n- `AI_FEATURE_NOT_REGISTERED`：业务 App 或功能没有进入服务端注册表；在 Provider 调用前失败，不能由客户端临时补充归属。\n- `AI_USAGE_RANGE_INVALID`：AI 用量查询缺少日期、日期倒序或超过 366 天。\n- `AI_USAGE_ACCESS_DENIED`：当前身份没有数据中心读取权限，HTTP 403。\n- `AI_USAGE_QUERY_FAILED`：AI 用量聚合读取失败；可按 `retryable` 手动重试，响应不包含 SQL 或 Provider 原始错误。\n\n商品主数据 API 使用：\n\n- `PRODUCT_CATALOG_STORAGE_UNAVAILABLE`：缺少 `PRODUCT_FLOW_DB` 或商品目录表不可用。\n- `PRODUCT_CATALOG_IMPORT_INVALID` / `PRODUCT_CATALOG_IMPORT_EMPTY`：导入内容缺少有效商品身份或为空。\n- `PRODUCT_CATALOG_WRITE_DENIED`：当前身份不是总经办或运营部维护人，或账号为只读。\n- `KUAIMAI_CONFIG_MISSING`：部署缺少快麦商品读取配置。\n- `KUAIMAI_PRODUCT_SYNC_INCOMPLETE`：分页保护触发，本批没有写入。\n- `KUAIMAI_PRODUCT_SYNC_CURSOR_STALE`：续传游标存在但共享商品目录为空；客户端应从游标 0 重新刷新商品列表。\n- `KUAIMAI_PRODUCT_SYNC_FAILED`：快麦拒绝、超时或返回失败，可按 `retryable` 判断重试。\n生产数据与环境 API 使用：\n\n- `PRODUCTION_TOKEN_REQUIRED` / `PRODUCTION_TOKEN_INVALID`：个人令牌缺失、无效、过期或已撤销。\n- `PRODUCTION_ROLE_REQUIRED`：令牌对应的钉钉稳定身份不再是 active executive。\n- `PRODUCTION_CAPABILITY_REQUIRED`：个人令牌没有所需的 read 或 write 能力。\n- `PRODUCTION_WRITE_LOCKED`：写入未解锁、解锁已过期或已撤销，HTTP 423。\n- `PRODUCTION_DATA_VERSION_CONFLICT`：基线版本落后于线上数据，HTTP 409。\n- `PRODUCTION_SNAPSHOT_NOT_FOUND` / `PRODUCTION_ROLLBACK_NOT_AVAILABLE`：写前快照不存在或不可回滚。\n- `ENVIRONMENT_READINESS_FAILED`：环境能力检查失败。\n- `LOCAL_ONLINE_TOKEN_REQUIRED`：本地线上账号模式缺少服务端个人令牌。\n- `LOCAL_ONLINE_DATABASE_REQUIRED`：本地线上账号模式缺少生产 D1 绑定。\n- `LOCAL_ONLINE_AUTH_FAILED`：本地线上账号验证出现未预期错误。\n- `LOCAL_ONLINE_RUNTIME_REQUIRED`：使用了旧的不完整 Node 预览接口，应通过标准 `npm start` 运行 Pages Functions。\n\n## HTTP 状态\n\n- 400：请求或业务状态不合法。\n- 401：没有有效公司会话。\n- 403：已登录但没有操作权限。\n- 404：资源不存在或对当前用户不可见。\n- 409：版本、重复操作或状态冲突。\n- 422：请求结构正确，但候选平台连接未通过验证。\n- 423：资源已锁定，生产写入需要重新解锁。\n- 429：达到接口限流。\n- 500：未预期服务端错误。\n- 501：当前部署缺少必需的平台能力或数据库绑定。\n- 502/503/504：外部依赖失败、不可用或超时。\n\n## 日志与展示\n\n服务端日志记录 request ID、路由、耗时、结果码和安全的依赖摘要。客户端优先展示 `message`，并在需要支持人员协助时展示 request ID。禁止把堆栈、Cookie、Token、手机号或完整外部响应返回给浏览器。\n',Vn=`# 外部平台地图

统一查看钉钉、快麦、Cloudflare、阿里云及计划接入平台的状态、能力、关系与内部使用资料。

公开平台信息来自仓库中的集成注册表；登录后的内部资料来自受权限保护的 D1 数据。平台管理员可在平台地图中维护非敏感资料，密钥、令牌、Cookie、密码和私钥不得录入平台地图；需要托管的敏感值进入独立的加密凭证保险箱，并由不同权限和审计规则保护。
`,Fn=`# 外部系统集成

外部集成通过服务端适配层访问，前端功能只调用本系统 API。每项集成都要区分业务记录保存和外部同步结果，避免外部失败导致平台内工作丢失。

## 集成注册表与开发路由

\`docs/platform/integration-registry.json\` 是平台名称、生命周期、能力、问题、关键词、代码路径、环境变量名、外部域名、API 路由、官方文档和关系的唯一公开事实源。开发前使用 \`.agents/skills/integration-router/SKILL.md\` 路由任务；PR 必须用 \`Integration-Impact\` 和 \`Integration-Impact-Reason\` 声明路径或新增代码证据命中的平台，CI 通过 \`npm run check:integrations\` 验证。

生命周期规则：

- \`connected\`：仓库中已有可验证的真实接入。
- \`integrating\`：正在形成稳定接入，必须登记仓库证据。
- \`planned\`：只表示候选方向，不能按已可用能力开发。
- \`retired\`：默认禁止新增依赖，重新使用需要 ADR。

平台状态、能力、代码边界、域名或关系变化时，Codex 在同一变更中更新注册表，由人审核。公开注册表不得包含内部控制台、账号主体、负责人和运行手册；这些资料通过说明书中的平台地图维护。

## 钉钉

承担员工身份、组织通讯录、待办、日历、文档和会议纪要。身份优先使用 user ID 和 union ID；组织名称用于展示和历史兼容。钉钉授权、企业归属和接口权限必须在服务端验证。

浏览器 OAuth 的登记回调固定由生产域名承载。Cloudflare 预览域名和部署唯一域名不得直接生成钉钉回调地址；预览页面发起登录时统一跳转到生产域名完成认证，并在生产环境继续访问，避免为短生命周期域名扩张开放平台白名单。

钉钉组织同步负责刷新在职状态、姓名、部门和平台推断角色，但部分组织快照不能覆盖或停用系统内已经明确授予的 \`executive\` 最高权限。撤销最高权限必须先直接核验身份，或由平台管理员显式执行，不能以一次同步未返回该人员作为依据。

## 快麦

承担订单明细读取、日销售聚合和共享商品主数据读取。签名和密钥仅在服务端使用。订单按日期和页码执行，保留订单创建时间；商品按 \`item.list.query\` 全部分页执行并先按主商家编码归并为唯一商品，组合候选按稳定 ERP 商品身份排序，再按游标调用 \`item.single.get\` 读取 \`suitSingleList\`。游标 0 刷新列表，续传批次复用 D1 共享目录并以最多 5 路并发读取详情，不能重复重写整张商品表。当前授权的商品列表响应不单独返回库存单位编码，必须与详情和商品档案导出按主/规格商家编码合并，不能把 API 缺失解释为 ERP 删除。库存最小单位可以使用标准 69 码或 ERP 内部唯一码，不能按格式过滤。

## 平台连接保险箱

钉钉和快麦的公司级凭据由数据中心统一维护。浏览器只提交本次修改值并读取脱敏状态；服务端使用 Cloudflare Secret \`PLATFORM_CREDENTIAL_MASTER_KEY\` 加密后写入 D1，审计只记录平台、动作、字段名、操作者和结果，不记录凭据值或外部平台原始响应。

候选配置必须先完成只读连接验证，成功后才以版本锁切换为当前连接；验证或保存失败时继续使用原连接。所有外部适配器通过共享解析器读取有效版本，旧环境变量仅用于兼容回退，停用保险箱版本后恢复回退。阿里云等尚未完成真实适配的平台只显示接入中，不提供虚假字段。

## ERP 与销售导入

ERP 或 Excel 导入作为销售数据和商品主数据的补充来源。销售导入必须记录来源文件、时间范围和口径，避免用导入时间替代订单时间。商品档案导入接受 XLSX、UTF-8 CSV 与 GB18030 CSV，记录文件名、行数和批次结果，不保存原始整行。组合商品关系以 ERP 官方类型和详情为准，不根据商品名、主商家编码是否像条码或位数猜测；映射不明确的数据进入异常检查，不自动分配。

快麦订单自动读取使用官方 \`erp.trade.list.query\` 的 \`timeType=created\` 和 \`created\` 下单时间，聚合后写入 \`product_sales_daily\`；商品读取继续使用 \`item.list.query\` 写入 \`product_catalog_*\`。商品主数据查询只在服务端按 69 码关联两类已落库事实，不保存快麦原始响应，也不把销售事实复制进商品 payload。

## 通用数据采集 provider

浏览器、API 和文件采集统一使用 provider registry。共享层负责连接实例、AES-GCM 密文、设备哈希令牌、任务、一次性 grant、状态、游标、幂等、重试和审计；adapter 只负责允许域名、登录字段、任务/资源类型、页面或 API 操作和标准事实映射。未登记 provider、任务、资源或写入器必须失败关闭。

抖音店铺浏览器登录 adapter 已退役，不再保存店铺账号密码、访问固定登录域名或创建公司 Mac 登录任务。抖音、快手、淘系、拼多多、小红书和京东/京麦改为平台原始文件方向；取得真实样例前保持“等待文件样例”。ERP 和广告平台仍按各自已验证的 API、文件或受控连接契约接入，不得复制旧店铺登录链路，也不得把所有记录塞进一个无口径的通用 JSON 表。

## Cloudflare Pages 与 D1

Pages 承载 React 静态资源，Functions 承载 \`/api/*\`，D1 保存共享状态、公司平台实体、会话、组织缓存和销售聚合。绑定、迁移和部署属于生产基础设施验证，不能用本地预览结果替代。

\`docs/platform/environment-capabilities.json\` 是环境必需配置的公开事实源，只记录名称和检查方式。生产就绪 API 不返回变量值。发布后必须运行 \`npm run verify:production\`；缺少阻断配置时不能宣告上线完成。

完整本地开发通过 \`npm start\` 运行 Pages Functions、远程生产 D1 和正式提供商适配器。个人访问令牌只保存在 \`.env\`，D1 只保存哈希；中间件仅在回环主机还原令牌对应的真实 active executive 会话。该会话可以按线上同账号权限读写数据、创建钉钉待办与日历或触发快麦同步，但仍必须经过各路由的角色、目标范围、幂等和提供商权限，数据库访问本身不会绕过外部平台授权。

生产数据网关继续用于运维修复；其跨环境写入仍需要 15 分钟解锁、版本检查、写前快照和审计。部署后的生产验证、钉钉 WebView 验证和外部平台真实动作验证保持独立，不用本地成功互相替代。

## 公司 AI Provider 网关

公司级 AI 能力统一经过 \`/api/platform/v1/ai/*\` 服务端网关。业务 App 不直接调用模型供应商，也不把浏览器中的业务状态作为可信上下文；服务端根据钉钉会话、数据域权限和外发策略读取、脱敏并限额公司数据。灵算首期使用固定 \`https://lingsuan.top/responses\`、\`gpt-5.6-sol\` 和 \`store: false\`，设置页不得覆盖域名、路径、任意 Header 或保存凭据。

\`AI_ASSISTANT_ENABLED\` 默认关闭。公司级凭据优先由平台连接保险箱解析，迁移期允许 \`LINGSUAN_API_KEY\` 和可选的 \`LINGSUAN_ACTOR_AUTHORIZATION\` 作为 Pages 服务端 Secret 回退；D1 只保存加密凭据、非敏感 Provider 元数据和安全审计。连接测试仅使用固定合成输入；Function Calling 另用 \`lookup_status({})\` 做无公司数据能力测试。业务查询只能从服务端按当前会话权限下发的只读 Skill 中选择，每次调用重新校验固定 Schema、数据域和外发策略，并限制为两轮、六次。调用审计只保存 Skill、App、参数名、数量、耗时和结果码，不保存参数值、业务结果或对话内容。

模型使用审计只记录身份、数据域、记录数、数据时间、token、耗时和结果码，不保存问题、回答、上下文或 Provider 原始响应。财务数据即使用户内部有权查看，也在当前 Provider 下统一阻止外发；只有获得可审计的不留存承诺并完成新的安全决策后才能调整。

公司总助对话与电商运营方案点评都通过统一 AI 能力调用。每个功能必须在服务端注册稳定 \`appId/featureId\` 并复用 \`invokeAiFeature\` 或流式聊天编排；业务路由不得导入 Provider 配置、Responses 适配器或自行发起模型请求。治理 CI 会扫描直接模型地址、Secret 和低层适配器导入，唯一例外是平台连接测试器使用合成内容验证候选凭据。

## 内部平台资料

任意已登录员工可读取内部平台资料，仅总经办平台管理员可维护。D1 表 \`integration_private_profiles\` 保存字段白名单内的非敏感资料；\`integration_profile_audit\` 只记录变更字段名，不保存字段值。资料超过 180 天未验证时，说明书显示复核提醒。内部 API 失败时公开平台地图继续可用。

禁止在内部资料中保存密钥、访问令牌、刷新令牌、Cookie、密码、私钥、带凭据的 URL 或完整外部接口响应。

“内部平台资料”与“加密凭证保险箱”是不同能力：平台资料继续只保存所有员工可读的非敏感说明；需要供连接器、内部系统授权人或本地采集器使用的敏感值，必须进入 \`/api/platform/v1/credential-vault\`，由独立权限、加密和审计边界保护，不能塞入平台资料字段。

## 数据连接器与加密凭证

数据中心的数据接入目录固定分为电商平台、ERP、公司数据，同一平台只显示一个目录入口。钉钉归入公司数据，快麦归入 ERP；抖音电商、巨量引擎（含巨量千川）、快手生态、淘系、拼多多、小红书生态和京东/京麦归入电商平台。连接器目录表示系统支持配置相应字段，不表示真实 API 或采集已经接通；注册表生命周期仍以仓库证据为准。

目录组合不改变底层职责。公司级连接负责运行时 App 凭据、只读验证和版本切换；连接器同步实例负责主体、数据集、计划和采集状态。连接凭据与同步实例可以在同一平台详情中组合展示，但不可在客户端混存、复制或互相代替，仍分别使用各自的权限、API、持久化记录和审计链路。

连接器实例可引用 D1 中的加密凭证。密码、API Secret、Token、Cookie 和可复用会话使用 Cloudflare Secret 与 AES-256-GCM 加密；OTP、短信验证码、二维码内容、滑块答案和当次人工验证结果不持久化。普通 API 不返回明文，本地采集器通过任务绑定的短时授权取用，所有敏感动作追加审计且不记录值。

店铺连接器不再运行网页自动登录，统一等待平台原始文件样例。其他网页型能力只有在注册表明确登记、生产真实验证且无法使用稳定 API/文件时，才可运行在固定公司 Mac 的专用 Profile；不得沿用已退役的店铺账号、任务或会话。API 型连接器仍由服务端 provider adapter 调用，前端功能不能直接访问外部平台。

## 失败责任

外部接口超时、限流或无权限时，适配层返回安全错误摘要和是否可重试。平台内已经确认的业务修改应先可靠保存，再记录外部同步状态；可能产生重复副作用的写操作使用稳定来源 ID 或幂等键。
`,Kn=`# 中间件目录

中间件负责跨路由一致的认证、校验、错误、日志和外部调用策略。业务路由只处理自己的输入、权限和领域操作。

## 当前认证中间件

\`functions/api/_middleware.js\` 处理 OPTIONS、公共认证路径和公司会话读取。受保护接口没有有效会话时返回 401，并把有效会话放入 \`context.data.session\`。

本地线上账号认证顺序固定为：回环主机 → \`LOCAL_ONLINE_ACCOUNT_MODE=1\` → 服务端个人令牌存在 → 生产 D1 可用 → 令牌哈希有效 → 按 HTTP 方法具备 \`read\` 或 \`write\` → \`userId/unionId\` 匹配 active executive → 注入完整组织会话。成功会话标记 \`loginMode=local-online-account\`，随后进入与生产相同的业务路由。任一校验失败都返回稳定错误，不回退硬编码身份；非本地主机完全跳过这段逻辑。

业务权限判断以明确的 \`executive\` 角色优先于部门展示字符串。一个人在钉钉中属于多个部门时，组织缓存可能以“部门 A / 部门 B”保存；最高权限账号不能因为该展示字段不是单一“总经办”而被供应链、数据中心或店铺运营 API 拒绝。

公共路径包含登录启动、回调、嵌入登录、会话查询、退出、登录配置，以及使用独立 Bearer 令牌认证的生产数据网关和环境就绪接口。公共路径不等于匿名访问：生产数据路由必须在路由内部验证个人令牌哈希、钉钉稳定身份和能力。新增公共接口必须进行安全评审，不能因为页面调用方便而绕过认证。

## 会话能力

\`functions/api/auth/_shared/session.js\` 管理 Cookie 会话、令牌哈希、员工身份和有效期。原始会话令牌不能持久化或写入日志。

\`functions/api/platform/_shared/credentialVaultAuthorization.js\` 只判断凭证动作、业务范围和 reveal 的 15 分钟近期登录要求；不读取密文、不执行加解密、不写审计。\`credentialVaultHttp.js\` 只构造禁止缓存的安全响应和稳定错误结构，不记录请求体。

## 外部平台共享适配

- \`functions/api/dingtalk/_shared/dingtalk.js\`：钉钉 Token、组织、待办、日历、文档和会议数据的共同请求与响应处理。
- \`functions/api/kuaimai/_shared/kuaimai.js\`：快麦签名、订单与商品分页、组合详情和日聚合。商品列表最多 200 条/页，组合详情每批最多 30 条并返回游标；任一列表页失败时不返回完整标记，平台目录不得提交半批。订单库存单位编码只校验非空和长度，不按 69 码格式过滤内部唯一码。
- \`functions/api/platform/v1/product-catalog/_shared/http.js\`：商品目录会话、维护权限、成本字段裁剪和统一错误响应。执行顺序为公司会话 → 维护权限（写请求）→ D1 能力 → 输入/提供商读取 → 幂等写入；只记录安全错误码，不记录文件原行或快麦原始响应。
- \`functions/api/platform/_shared/environmentReadiness.js\`：环境识别、变量/绑定/表存在性检查和脱敏响应；无外部副作用，不重试。
- \`functions/api/platform/_shared/productionDataAccess.js\`：共享个人令牌哈希、能力与组织身份校验，并为运维修复网关提供短时解锁、快照和审计；写入前置于业务状态写入，失败时业务写入不得继续。

生产数据访问顺序固定为：D1 可用 → 个人令牌哈希有效 → 钉钉 \`userId/unionId\` 仍为 active executive → 能力存在 → 写入解锁有效 → 基线版本一致 → 快照与 pending 审计成功 → 业务写入 → 审计完成。令牌校验不自动重试；相同基线版本冲突返回 409，由用户刷新后重新操作。

## 新中间件要求

每个中间件只承担一种横切责任，并记录输入、输出、执行顺序、副作用、超时、重试、幂等和日志字段。中间件不得包含具体页面或产品阶段判断。

## 目标能力

后续逐步统一请求 ID、错误结构、服务端日志、输入校验和写操作幂等。迁移按路由分批完成，不要求现有接口一次性改写。

\`/api/platform/v1/browser-agent/*\`、用户洞察 collector 和 ingest 在会话中间件中允许进入路由，由路由使用设备 Bearer Token 完成最终认证。普通公司会话不能代替设备令牌；task credential 只接受一次性 grant。顺序固定为：解析 Bearer → SHA-256 比对 active 设备 → platform scope → 领取任务 → grant 哈希/到期/消费/credentialVersion 校验 → 解密单个连接 → no-store 响应。日志不得记录 Authorization、grant、邮箱、密码或页面内容。
`,Yn=`# 核心业务流程

本文件记录跨页面长期有效的产品和经营流程。功能 PRD 可以细化流程，但不能无说明地改变这里的核心关系。

## 产品全周期

1. **需求收集**：记录机会、来源、提出人、描述和预计上市时间。
2. **讨论与决策**：补充用户问题、商业价值、资源、供应链和库存风险，形成推进、暂缓或不做的结论。
3. **产品规划**：确认产品等级、开发开始和预计上线时间。
4. **需求转项目**：满足准入条件的需求生成产品记录并保留原需求关系。
5. **阶段执行**：按阶段完成会前准备、会议或决策、会后交付和下一阶段准入任务。
6. **上线与经营**：结合任务进度、销售表现和渠道反馈判断是否继续投入。
7. **档案与复盘**：保留产品资料、关键决策、交付物、销售数据和复盘结论。

## 任务与风险

- 当前阶段未完成任务属于待办，即使不在当前日期筛选范围也必须可见。
- 正常未到期的当前阶段任务不自动成为风险。
- 逾期、临近截止、历史阶段遗漏、关键交付缺失或决策未完成才进入风险提醒。
- 任务、钉钉待办、会议和交付物保持稳定来源关系，避免重复创建。

## 公司战略执行

公司战略通过关键结果衡量，关键结果通过部门承诺和重点项目执行。重点项目维护里程碑、风险和决策；经营检查保留周进展和冻结的月度记录。个人待办只来自明确分配给个人的责任。

## 电商重点产品经营

1. 运营主管按月指定重点产品、责任运营和目标边界。
2. 运营从数据中心读取截止昨天的经营事实，形成现状证据和差距。
3. 产品或运营在用户洞察中选择平台与店铺/产品，确认平台类目后读取用户、商品、视频和直播市场事实；系统按本 App 规则发现的竞品仍需人工确认，建议只作为方案参考。
4. 运营把达成目标所需解决的问题收敛到 1–3 个，再为每个问题设置对策和检测数据。
5. AI 对结构、证据和监测逻辑提出优化建议；运营修改后提交主管批准。
6. 运营按方案记录执行、检测数据、新问题、下一步调整和阶段复盘；主管验收后形成可引用的经营证据。
7. 跨部门依赖通过有责任部门、截止日和接受/退回说明的协同事项推进；复盘结论经人工确认后进入方法库。

## 绩效考核

主管按周期建立与业务任务证据关联的考核，员工提交自评打分和说明，系统在公式与数据完整时给出独立建议分，主管结合证据完成终评。明显分差必须说明；员工确认结果或每期申请一次复核，原主管处理复核后交人事冻结；冻结结果只能追加有原因的更正，不能覆盖历史。

## 跨 App 部门协同

业务 App 负责保存产品、供应链、数据和内容等业务事实。需要其他部门接收、处理风险、确认决策或修复数据时，业务记录生成标准协同草稿，由发起人确认主责部门、唯一主负责人、协同部门、截止时间、业务影响和下一步。

部门协同按“待接收、执行中、阻塞、待验收、关闭”推进。接收部门可以退回补充，主负责人可以请求协调，发起方负责验收。高影响阻塞、逾期责任和总经办决策进入老板行动台；普通日常任务留在业务 App 或部门工作台。协同平台不自动修改来源业务状态。

## 阶段准入

阶段推进必须验证本阶段必需任务、交付物和评审结论。系统可以展示建议，但重要决策仍由具备权限的责任人确认，不由状态自动变化替代管理判断。
`,Bn=`# 数据定义与口径

本文件记录跨功能共享的数据含义。页面文案可以简化名称，但计算、接口和报表必须保持同一口径。

## 需求

尚未正式进入产品开发流程的机会记录。包含来源、提出人、负责人、说明、讨论状态、创建时间和预计上市月份。需求转项目后保留原需求 ID。

## 产品

由需求池准入并转入开发流程的业务对象。包含产品等级、阶段、产品经理、预计上市月份、月度 GMV 目标、资料和销售映射。

产品不是 ERP 商品。产品可保存 \`catalogProductId\` 关联一个共享商品主数据记录；未关联的历史产品继续读取原有 \`skuCodes\`，关联后销售映射优先由目录中的库存单位编码派生。

## 商品主数据

由数据中心维护、产品全周期、供应链和货流共同读取的 ERP 商品目录。商品以来源和主商家编码形成稳定身份，保留来源系统商品 ID；库存单位以商品身份和规格商家编码形成稳定身份，保留来源系统 SKU ID。库存单位编码可以是标准 69 码，也可以是 ERP 内部唯一码（例如测试商品使用的 \`1111\`）；非标准格式不是异常，只有缺失或跨商品冲突才进入质量队列。商品使用 \`productKind\` 区分单品与组合商品，\`components[]\` 保存叶子库存单位编码、正整数组合比例、可用成本和来源身份。

快麦商品列表 API 与商品档案导出覆盖不同：\`item.list.query\` 用于自动补充全量主商品，组合候选再通过 \`item.single.get\` 的 \`suitSingleList\` 分批读取库存组成；文件用于补齐当前商品档案中的规格、库存单位编码和供应商等字段。两者按稳定身份合并；任一来源未返回记录不能单独证明商品已删除。组合详情部分失败时保留上次成功关系并显示覆盖不足，不根据名称或主商家编码格式猜测比例。

商品经营销量不写回商品档案。服务端用目录 SKU 的条码或规格商家编码与 \`product_sales_daily.code\` 确定性关联，在请求的日期和平台范围内按商品汇总 \`SUM(qty)\` 与 \`SUM(net_sales)\`；同一编码不能同时归属多个商品，歧义和未匹配事实只进入覆盖统计，不重复计算或猜测归属。销售范围同时返回最新事实日期和入库时间：前者表示数据覆盖到哪天，后者表示同步何时执行，两者不得互相替代。

## 产品经理

负责产品推进的钉钉组织成员。新记录保存可用的用户 ID、union ID 和姓名；历史数据允许姓名兼容，但新逻辑优先稳定身份标识。

## 阶段

产品生命周期中的有序执行位置。阶段变化必须满足对应准入条件，不能仅因为日期变化自动跳转。

## 任务

阶段内需要完成的行动，包含类别、责任部门、个人负责人、截止日期、状态和来源。部门责任与个人责任分开；只有明确个人身份的任务才进入个人钉钉待办。

## 部门协同事项

由业务 App 或经营管理发起、需要跨部门接收和验收的行动记录。包含事项类型、发起人和发起部门、唯一主责部门和主负责人、协同部门、截止时间、业务影响、下一步、来源 App、可选战略关联、版本和状态。

协同状态按待接收、执行中、阻塞、待验收、关闭、退回和取消受控流转。所有状态和责任变化追加活动记录；归档属于逻辑删除，不物理删除历史。业务 App 是来源事实的唯一所有者，协同事项只保留必要证据快照和来源路径。

协同事项的部门和人员新记录必须保存稳定组织 ID；名称用于展示和历史兼容。普通员工只能读取本人或本人部门参与范围，总经办可以读取全公司范围。

## 交付物

任务或阶段产生的可检查结果，例如方案、文档、图片、会议纪要或资料包。交付物必须保留与任务和产品的关系。

## 预计上市月份

统一存储为 \`YYYY-MM\`。展示可使用中文年月，但排序、筛选和接口传输保持标准格式。

## 销售时间口径

快麦销售汇总默认使用订单创建时间作为统计日期。历史导入必须保留原始创建时间，不使用导入时间替代。

快麦订单接口按 \`timeType=created\` 查询，响应字段 \`created\` 是下单时间；子订单有创建时间时优先使用子订单，否则使用所属订单创建时间。支付时间只作为订单属性，不得替代销售统计日期。

快麦《销售主题分析-按订单商品明细》进入共享销售事实前按来源字段归一化：\`qty = 销售数量 - 退货数量\`、\`net_sales = 销售金额 - 退款金额\`、\`cost = 销售成本 - 退货成本\`、\`gross_profit = net_sales - cost\`。标准 69 码逐行优先取规格商家编码，规格码为空或不是有效 69 码时回退主商家编码；两者都无效的行进入覆盖统计，不猜测映射。已有明确 \`净销量\`、\`净销售额\`、\`净毛利\` 的新版明细直接使用来源净值，不重复扣减。

## 平台口径

常规渠道占比、增长和运营判断默认忽略平台分类“其它”。需要检查数据完整性时可以把它作为异常桶单独说明，但不混入正常渠道结论。

## 供应链文件数据

供应商档案的文件来源字段只包含供应商名称、来源类别、系统类别、供货范围和来源证据。钉钉源文件中的银行卡号、手机号、身份证附件、收款资料和原始整行内容不属于供应链系统数据，不得导入或持久化。

库存盘点记录同时保留 ERP 数量和实盘数量，差异为 \`实盘数量 - ERP 数量\`。成品库存按产品、SKU、仓库和盘点日期保留；原辅料库存按所属产品、物料、仓库和快照日期保留，计量单位不同的物料不得直接汇总数量。异常库存保留预计可售天数、预计到货日期与数量、处理状态及备注，已解除记录不删除。

钉钉文件数据是带读取时间和来源行号的文件快照，不等同于后台自动同步。相同文件、工作表和来源行生成稳定 ID，重复导入幂等更新。库存盘点用于校准数量和资金口径；在快麦库存与消耗接口验证完成前，页面必须把快麦文件和钉钉文件标识为快照，不得展示为实时 ERP 数据。

## 货流事实与库存口径

供应链管理是唯一业务入口，货流平台是跨 App 的事实和计算边界。商品沿用共享商品主数据的 \`productId\`、\`skuId\` 和库存单位编码，不建立第二份可编辑商品档案。组合商品销量只追加一条销售事实，\`payload.components[]\` 按组合比例记录叶子库存单位消耗；销售额只计一次，销售成本优先使用来源订单成本，缺失时才按组件成本和比例计算。钉钉采购申请、关联付款、销售消耗、ERP 库存和盘点调整按 \`source + sourceReference + sourceVersion\` 追加事实；无法确定性匹配的记录进入异常队列，不猜测、不补零。

库存使用双账本：ERP 日快照是不可覆盖的账面库存，线下月度盘点是人工确认的实存锚点。盘点确认后的校准数量为 \`最近盘点实存 + 当前 ERP 账面数量 - 盘点日 ERP 账面数量\`。更正必须新增盘点版本和调整事实，原确认记录继续保留。

库存资金为 \`累计采购实付 - 累计销售成本 ± 已确认盘点损益\`；月度库存周转天数为 \`月均校准库存成本 ÷ 当月销售成本 × 当月天数\`。应收天数按销售发生日命中的平台固定账期、以净销售额加权；平台账期由财务维护生效区间和版本，同一平台任一日期只能命中一个版本。应付天数按采购金额加权，优先使用验收入库日至付款日，缺少入库日时使用采购审批日并标记估算，月末未付部分计算至月末。\`CCC = 库存周转天数 + 应收天数 - 应付天数\`。

月度指标只由服务端已落库事实重算，不接受浏览器提交的库存、销售、采购、付款或金额明细。结果保存公式版本、计算版本、来源更新时间、覆盖率、可信等级和冻结状态；覆盖不足时指标保持不可计算，不能以零替代。快麦当前只作为已验证的订单与销售来源，不能标记为库存自动同步来源。
`,Hn=`# 角色与权限

系统权限以钉钉组织身份为基础，同时区分页面可见、功能查看、功能编辑和服务器写入权限。

## 总经办

查看公司经营全局，维护权限，确认战略、跨部门事项和高影响决策。总经办访问公司经营平台，但仍应通过正常业务流程修改数据。

## 部门协同责任

- 发起人和发起部门定义业务影响、下一步、接收部门和验收标准，并负责最终验收。
- 接收部门确认责任边界，指定一个稳定身份的主负责人，负责推进、阻塞说明和提交验收。
- 协同部门可以查看参与事项并补充本部门进展，不能代替主负责人接收或关闭事项。
- 总经办可以查看全公司、升级协调和重新分配，但紧急接管必须记录原因。
- 普通员工只能读取本人、本人部门或本人协同部门参与的事项；无关部门不能通过查询参数扩大范围。

## 产品部

维护需求讨论、产品规划、产品经理、生命周期任务和产品档案。产品经理从组织成员中选择，不使用自由文本创建虚拟人员。

## 运营与品牌

提供市场、渠道、内容和经营反馈，承担明确分配的阶段任务、部门承诺和重点项目结果。只能修改被授权的功能和本职责范围数据。

## 供应链与客服

供应链负责打样、成本、交期、质量、备选供应和库存风险；客服负责用户问题、售后反馈和需求证据。两者通过需求和任务参与产品流程。

## 供应链货流

- 所有货流读取和写入均按服务端钉钉组织身份校验；客户端隐藏按钮或金额不构成授权。
- 总经办可读取全部货流数据和金额，并可处理跨部门例外；日常录入仍由责任部门完成。
- 仓库录入或导入线下实存；供应链确认账实差异；财务确认盘点金额、维护平台账期并冻结覆盖完整的月度 CCC。
- 财务、供应链和总经办可以重算 CCC；重算只读取服务端已落库事实，浏览器不能提交业务金额替代来源事实。
- 产品、运营、仓库和质量管理可以读取职责范围内的数量、风险与来源状态；未获金额权限时服务端移除单位成本、库存价值、库存资金和盘点金额差异字段。
- 数据中心或授权数据管理员负责来源导入、SKU/69 码映射与数据质量，不得代替仓库、供应链或财务执行确认。
- 已确认盘点、货流事件和冻结指标不提供物理删除；追加更正保留原版本及责任链。

## 财务

提供经过确认的销售、成本、预算和结算数据。财务可查看被授权的数据源和经营结果，不默认获得产品流程配置权限。

## 数据中心

- 总经办、运营部、财务部、产品部和供应链相关部门可查看数据中心。
- 用户洞察仅向总经办、产品部和运营部开放；三者按授权范围查看多平台市场事实。
- 产品部维护产品全周期 App 的类目确认、竞品和洞察规则；运营部维护电商店铺运营 App 的规则。可查看和复制另一个 App 的规则，但不能覆盖来源。
- 只有总经办可登记浏览器采集设备；设备令牌不能代替员工会话。
- 只有总经办和运营部的非只读身份可以维护数据源元数据与采集设置。
- 财务、产品和供应链默认只读，可查看统一指标、质量状态、同步记录和应用订阅。
- 数据源设置不接收账号密码、Cookie、验证码或 Token；需要登录时由授权人员在对应浏览器页面完成。
- 数据连接凭证不通过普通数据源设置保存，必须进入共享保险箱的加密字段和审计边界。
- 只有总经办和运营部的非只读身份可以维护被授权的数据源元数据与采集设置。
- 财务和供应链可发布、修改和归档各自责任部门的数据口径，不能转移责任部门；产品部对数据口径只读。具体口径权限由共享 API 按服务端组织身份再次校验。
- 除本部门数据口径外，财务、产品和供应链对数据源、质量规则、同步设置、应用订阅和其他数据中心配置默认只读；进入页面编辑态不代表获得这些设置的服务器写权限。
- 账号密码、API 密钥、Token、Cookie 和可复用浏览器会话可通过共享保险箱加密保存；普通数据源列表不返回明文。
- 凭证替换、查看/复制、采集器取用和权限管理分别授权并审计；运营数据管理员默认可以替换而不能查看已有明文。
- OTP、短信验证码、二维码内容、滑块答案和当次人工验证结果不持久化，需要时由授权人员在指定公司电脑完成。
- 内部系统保险箱按条目或范围授权 NAS、邮箱、财务和政务/SaaS 账号，不因可以查看经营数据而自动获得凭证权限。
- 销售经营口径固定使用订单创建时间、\`Asia/Shanghai\`、截止昨天，日常判断排除“其它”。
- 所有已登录员工可以查看平台连接的脱敏状态；只有最高权限管理员可以验证、保存或停用公司级钉钉和快麦连接，服务端必须再次校验权限。

## 公司 AI 与大模型治理

- 所有已登录员工共用公司只读总助，但每次数据访问都由服务端按钉钉身份、数据域、部门和岗位重新判定。
- 总经办拥有全部内部数据域的用户访问权限；其他员工只读取本人职责范围。浏览器传入的角色、部门、许可和业务上下文不作为授权依据。
- AI 用户查看权限与第三方 Provider 外发权限相互独立；任一权限拒绝时，该数据域不读取、不外发。
- 财务数据域的内部访问可授予总经办和财务部，但当前灵算 Provider 的外发策略对所有身份固定为阻止。
- 只有总经办非只读身份可维护、测试和启停 Provider；数据中心原有运营编辑权限不能修改 AI Provider 或财务外发策略。
- 总助首期只分析和建议，不创建待办、不修改业务数据、不发送钉钉消息，也不替代主管审批和财务确认。
- 数据中心授权读者可以查看按 App、功能、模型和 Skill 聚合的调用与 Token 统计；页面不提供员工排行或个人明细。执行身份只用于服务端授权与安全审计，不能作为用量展示维度。
- 每个业务 AI 功能使用服务端登记的稳定 App 与功能 ID；浏览器提交的归属不可信，未登记功能不得调用 Provider。

## 电商店铺运营

- 运营主管按月指定重点产品、责任运营和目标边界；运营围绕该重点产品制定店铺方案并持续执行、检查和复盘。
- 方案固定包含现状证据、量化目标、1–3 个关键问题、对应对策和检测指标；AI 只给优化建议，主管保留批准权。
- 产品、品牌、供应链和财务只处理分配给本部门的协同事项，不得改写运营方案。
- “运营团队”用于责任分配、负荷和主管辅导，不保存绩效评分。

## 绩效管理

- 所有员工可查看并自评自己的考核；普通员工不能查看他人的评分和评语。
- 主管建立考核并完成终评；人事行政部维护规则、处理复核并冻结归档，总经办具有管理权限。
- 系统建议分只有在公式和数据完整时才生成，不能代替主管终评；与自评或建议分相差 10 分以上必须说明原因。
- 每次考核仅允许一次复核，冻结后只能追加更正记录；经营任务验收结果是证据，不自动等于绩效达标。

## 查看与编辑

看到导航不等于可以编辑所有数据。客户端禁用状态用于解释权限，服务器仍必须再次校验身份、角色和组织范围。说明书对所有已登录公司人员开放，但不会对匿名公网开放。

部门协同导航可以对已登录员工开放，但不因此开放公司战略、重点项目、部门激励或经营检查。协同 API 与总经办战略整包 API 分开授权。

## 权限变更

权限变更应说明业务目的、适用部门、查看或编辑范围、负责人和复核日期。认证、权限和组织规则变化必须有测试和审查。
`,Wn=`# 权限与功能设置设计

## 目标

把静态角色说明替换为可持久化的组织权限系统，并修复钉钉 WebView 中共享状态加载失败。

## 权限模型

- 导航权限按部门配置，每个 Tab 支持全员或指定多个部门。
- 功能权限分别配置查看部门、查看岗位、编辑部门和编辑岗位。
- 总经办拥有全局管理权限，不受配置误操作影响。
- 设置页只展示当前用户有权查看的功能；权限矩阵仅总经办可见。
- 产品任务模板默认允许产品经理查看和编辑。

## 数据结构

\`settings.permissions.navigation\` 保存各 Tab 的部门范围；\`settings.permissions.features\` 保存功能的查看和编辑范围。旧数据加载时自动补齐默认值。

## 交互

权限设置采用紧凑矩阵，每行一个 Tab。功能设置采用列表，每项功能显示查看范围与编辑范围。所有部门和岗位都来自登录时缓存的钉钉组织架构。

## 错误处理

共享状态约 400KB，不使用 \`fetch keepalive\`。网络异常转换为中文状态提示，本地缓存继续保留。

## 验证

自动化测试覆盖默认权限、导航隐藏、功能查看/编辑、旧数据迁移和大状态请求；浏览器验证设置保存与不同角色页面呈现；钉钉验证不再出现 \`Load failed\`。
`,qn=`# 任务类别与责任部门交互设计

## 目标

产品进度和默认任务设置统一使用四种任务类别，并根据类别只展示有效操作。责任部门支持搜索和多选，表格默认保持紧凑展示。

## 类别与操作矩阵

| 类别 | 预约会议 | 同步待办 |
| --- | --- | --- |
| 会前准备 | 不显示 | 不显示 |
| 会议 | 显示 | 不显示 |
| 决策 | 不显示 | 显示 |
| 待办任务 | 不显示 | 显示 |

完成状态和删除属于所有任务的通用操作，不受类别影响。会议已预约后显示“已预约”，同步按钮继续遵守必须设置有效截止日期的规则。

## 责任部门

- 产品进度和默认任务设置共用组织架构部门数据。
- 表格单元格只显示已选部门，点击后打开浮层。
- 搜索框固定在浮层顶部，部门选项使用复选状态，可多选。
- 选中结果按组织架构顺序保存为 \`部门A / 部门B\`，兼容现有 D1 字符串字段、首页待办部门匹配和钉钉待办描述。
- 至少保留一个责任部门，不提供空责任部门状态。

## 数据兼容

旧类别映射为：\`会议/决策\` 转为 \`会议\`，\`会后交付\` 和 \`准入条件\` 转为 \`待办任务\`。已有任务和模板在共享状态标准化时完成映射，不清除完成、截止日期、钉钉待办或会议记录。

## 验证

- 单元测试覆盖类别列表、旧数据迁移、按钮矩阵和多部门匹配。
- 浏览器验收覆盖多选部门、搜索、会议按钮、决策同步按钮和会前准备无上下文操作。
`,Qn=`# 产品进度默认任务配置设计

## 目标

设置页按“产品等级 × 产品阶段”维护默认任务。每条模板包含类别、任务内容、责任部门和零到多个钉钉交付物模板。产品进度只生成当前等级对应的系统任务，并继续保留人工新增任务。

## 数据模型

\`settings.taskTemplates\` 保存公司级配置：

\`\`\`js
{
  id: "p1-stage2-sample-review",
  level: "P1 增长级",
  stage: 2,
  category: "会议/决策",
  title: "样品评审",
  ownerDept: "产品部",
  deliverable: "样品评审纪要",
  deliverableTemplates: [
    { id: "sample-review-minutes", name: "样品评审纪要模板", url: "https://alidocs.dingtalk.com/..." }
  ]
}
\`\`\`

产品任务通过 \`templateId\` 关联模板。模板更新时同步结构字段和交付物模板，但保留 \`due\`、\`done\`、\`dingTodo\`、\`dingMeeting\` 与产品已经产生的交付物。人工任务 \`systemDefault: false\` 不参与同步。

## 界面

- 设置页新增“产品任务模板”区，顶部选择等级和阶段，下面用紧凑表格编辑任务。
- 类别使用现有任务类别组件，责任部门使用钉钉组织架构下拉。
- 交付物模板使用独立弹窗维护多个钉钉文档名称和链接。
- 产品进度的交付物单元格顺序为：已有交付物缩略图、\`+\`、\`模板\`。
- \`模板\`弹窗以文件列表展示钉钉文档，点击“打开”进入对应文档；没有配置时按钮禁用并提示未配置。

## 兼容与错误处理

- 老数据缺少 \`settings.taskTemplates\` 时自动补入系统默认模板。
- 老系统默认任务通过等级、阶段和标题匹配新模板，迁移后写入稳定 \`templateId\`。
- 非钉钉文档链接不能保存为模板。
- 删除模板任务需要确认；删除后对应系统任务从各产品移除，人工任务和已上传交付物保留在资料包中。

## 验证

- 单元测试覆盖等级隔离、配置同步、执行状态保留、模板删除与老数据迁移。
- 组件测试覆盖设置页编辑入口、产品进度模板按钮和弹窗。
- 浏览器验证设置修改后对应等级产品立即变化，其他等级不受影响。
`,zn=`# 首页部门待办设计

## 目标

- 总经办的部门筛选放在“产品协同总览”标题行右侧。
- 第三个统计卡从“待评审会议”改为“待办事项”，数量与当前部门筛选后的待办列表一致。
- 点击待办统计卡，进入筛选后第一条待办对应的产品和阶段；没有待办时卡片不可点击。
- 待办事项和风险提醒在桌面端等宽，窄屏改为上下排列。

## 数据与交互

- 继续复用 \`departmentTasks\` 作为列表、计数和首条跳转的唯一数据源。
- \`departmentTasks\` 已按截止日期排序，因此首条跳转就是当前范围内最优先处理的待办。
- 风险提醒继续从 \`departmentTasks\` 派生，风险口径不变。
- 非总经办仍只看本部门数据，不显示部门筛选。

## 验收

- 切换部门时，顶部待办数量、下方待办列表和风险列表同步变化。
- 点击顶部待办卡准确进入首条待办的产品与阶段。
- 两个下方区块宽度一致，移动端无横向挤压。

`,$n=`# 需求池创建时间修复设计

## 目标

需求池记录保存真实、稳定的创建时间，列表按当前日期展示友好的相对日期，不再把字符串“今天”永久写入 D1。

## 数据设计

- 新增记录使用 \`createdAt\` 保存 ISO 8601 时间戳。
- 继续兼容旧字段 \`created\`，读取时迁移为 \`createdAt\`。
- 已知种子记录 \`d1\`、\`d2\` 固定迁移为 \`2026-07-03\`，\`d3\` 迁移为 \`2026-06-30\`。
- 带毫秒时间戳的旧需求 ID 优先从 ID 恢复创建时间；无法可靠恢复的记录显示“历史数据”，不伪造每天变化的日期。

## 展示规则

- 当天显示“今天”。
- 前一天显示“昨天”。
- 同年显示 \`MM-DD\`。
- 跨年显示 \`YYYY-MM-DD\`。

## 范围

只修复需求池创建时间。资料包、反馈问题等其他模块的日期字段不在本次修改范围内。
`,Jn=`# 钉钉网页登录与统一会话设计

## 目标

在不迁移现有 D1 业务数据、不拆分业务前端的前提下，为产品全周期系统增加普通浏览器钉钉扫码登录，并继续兼容钉钉内嵌免登。两个入口使用同一个 React 应用、同一套权限、同一个 D1 数据源和同一组钉钉集成接口。

登录仅允许当前企业组织架构中的在职员工。未登录用户和非本企业账号不能读取需求、产品、任务、销售数据或钉钉组织信息。

## 范围

本次包含：

- 普通浏览器登录页和钉钉官方扫码授权入口。
- 钉钉内嵌环境继续使用 JSAPI 免登。
- 两种授权码在服务端完成身份换取并生成统一 Session。
- 服务端校验用户属于当前企业组织架构。
- D1 Session 与组织成员缓存表。
- 业务 API 的登录和权限保护。
- 退出登录、过期登录和异常状态。
- 本地开发专用测试登录继续存在，但绝不进入生产界面。

本次不包含：

- Mac mini 部署。
- D1 向 PostgreSQL 或 NoSQL 迁移。
- 业务页面、流程规则或产品数据结构重构。
- 引入 Keycloak 等独立身份平台。

## 方案选择

采用“钉钉 OAuth / JSAPI + D1 服务端 Session”。不继续把 \`productFlowUser\` 作为可信身份来源，也不使用纯前端角色判断保护 API。

### 未采用方案

- 仅在前端保存扫码结果：实现快，但 localStorage 可被修改，无法保护 API。
- 单独维护浏览器版和钉钉版：会造成页面、权限和业务逻辑分叉。
- 立即迁移数据库：与本次认证目标无关，扩大故障范围。

## 总体架构

\`\`\`mermaid
flowchart LR
    A[普通浏览器] --> B[登录页]
    B --> C[钉钉官方扫码授权]
    D[钉钉内嵌页] --> E[JSAPI 免登授权码]
    C --> F[统一认证 API]
    E --> F
    F --> G[企业成员校验]
    G --> H[D1 Session]
    H --> I[HttpOnly Cookie]
    I --> J[同一个 React 应用]
    J --> K[受保护业务 API]
\`\`\`

React 只消费“当前会话”接口，不关心登录来自扫码还是钉钉内嵌。钉钉身份换取、企业成员校验、角色映射和 Session 创建全部在服务端完成。

## 登录流程

### 普通浏览器

1. React 启动后请求 \`GET /api/auth/session\`。
2. 未登录时只渲染登录页，不请求 \`/api/state\`、销售数据或组织架构。
3. 用户点击“钉钉扫码登录”。
4. 浏览器访问 \`GET /api/auth/dingtalk/start\`。
5. 服务端生成一次性 \`state\`，设置短期安全 Cookie，并跳转到钉钉官方授权页。扫码界面由钉钉提供，不在产品系统中自行生成二维码。
6. 钉钉授权后回到 \`GET /api/auth/dingtalk/callback\`。
7. 服务端校验 \`state\`，用授权码换取钉钉用户身份。
8. 服务端使用 \`unionId\` / \`userId\` 对照当前企业成员缓存；缓存缺失或超过 15 分钟时先刷新组织架构。
9. 非本企业成员、已离职或无有效组织身份的用户返回拒绝页，不创建 Session。
10. 验证成功后创建 7 天有效 Session，写入安全 Cookie，并重定向到 \`/\`。

### 钉钉内嵌

1. React 检测到钉钉运行环境且 \`GET /api/auth/session\` 未登录。
2. 使用现有 JSAPI \`requestAuthCode\` 获取免登授权码。
3. \`POST /api/auth/dingtalk/embedded\` 将授权码交给服务端。
4. 服务端通过企业应用身份换取用户并执行同一套企业成员校验。
5. 创建与浏览器登录完全相同的 Session Cookie。
6. React 重新读取 \`/api/auth/session\`，随后加载业务数据。

## 会话模型

D1 新增 \`product_flow_sessions\`：

| 字段 | 说明 |
| --- | --- |
| \`id_hash\` | 随机 Session Token 的 SHA-256，不保存明文 Token |
| \`corp_id\` | 企业 CorpId |
| \`user_id\` | 企业内 userId |
| \`union_id\` | 钉钉 unionId |
| \`role\` | 当前角色映射结果 |
| \`login_mode\` | \`browser\` 或 \`embedded\` |
| \`created_at\` | 创建时间 |
| \`last_seen_at\` | 最近使用时间 |
| \`expires_at\` | 过期时间 |
| \`revoked_at\` | 主动退出或管理员撤销时间 |

Cookie 名为 \`pfs_session\`，属性固定为：

- \`HttpOnly\`
- \`Secure\`
- \`SameSite=Lax\`
- \`Path=/\`
- \`Max-Age=604800\`

Session 每次使用检查过期和撤销状态。退出登录删除 D1 Session 并清除 Cookie。前端 localStorage 可以保留 UI 缓存，但不再保存或决定可信角色。

## 企业成员缓存

D1 新增 \`product_flow_org_members\`，保存登录校验所需的最小目录信息：\`corp_id\`、\`user_id\`、\`union_id\`、姓名、部门、职位、角色、在职状态和同步时间。

组织架构在以下时机刷新：

- 成功登录后发现缓存缺失或超过 15 分钟。
- 现有组织同步操作被调用时。
- 管理员在设置页主动刷新时。

会议、待办和人员选择器只读取缓存，不在每次操作时重新拉取完整组织架构。同步后未出现的旧成员标记为失效，不能再作为新待办或会议参与人。

## API 边界

公开接口仅包括：

- \`GET /api/auth/session\`
- \`GET /api/auth/dingtalk/start\`
- \`GET /api/auth/dingtalk/callback\`
- \`POST /api/auth/dingtalk/embedded\`
- \`POST /api/auth/logout\`
- \`GET /api/dingtalk/config\` 中不含密钥的公开配置

必须登录才能访问：

- \`/api/state\`
- \`/api/sales\`
- \`/api/dingtalk/org/*\`
- \`/api/dingtalk/todo/*\`
- \`/api/dingtalk/calendar/*\`
- \`/api/dingtalk/meeting/*\`
- \`/api/dingtalk/doc/*\`

读取业务数据要求有效企业员工 Session。写入操作还要按 Session 中的角色和现有权限矩阵校验，\`readonly\` 不能通过直接请求绕过前端限制。

统一服务端中间层提供：

- \`readSession(request, env)\`：读取并验证 Session。
- \`requireSession(request, env)\`：未登录返回 401。
- \`requireWriteAccess(request, env, feature)\`：没有功能编辑权限返回 403。
- \`createSession(identity, mode, env)\`：创建 Session 和 Cookie。
- \`revokeSession(request, env)\`：注销当前 Session。

## 前端结构

新增认证状态机：

- \`checking\`：只显示全屏加载，不加载业务数据。
- \`anonymous-browser\`：显示扫码登录页。
- \`anonymous-embedded\`：自动执行钉钉免登。
- \`authenticated\`：加载当前 React 应用。
- \`forbidden\`：显示非本企业员工提示和重新登录按钮。
- \`error\`：显示可重试的服务异常，不展示业务数据。

登录页保持当前产品工具的浅色、紧凑风格，内容只包括产品名称、钉钉登录按钮、企业员工限制说明和明确错误状态。页面不放功能介绍、营销文案或本地测试入口。

右上角账号区域增加菜单，仅提供账号信息和“退出登录”。钉钉内嵌与普通浏览器行为一致。

## 错误处理

- OAuth \`state\` 不匹配：终止登录，显示“登录请求已失效，请重新扫码”。
- 授权码过期或重复使用：终止登录，不重试旧授权码。
- 非本企业员工：返回 403，不写 Session。
- 组织架构刷新失败但存在 24 小时内缓存：使用缓存并记录告警。
- 组织架构刷新失败且无可用缓存：拒绝登录，避免错误放行。
- Session 过期：API 返回 401，前端清空 UI 身份并回到登录页。
- 权限不足：API 返回 403，前端显示具体操作无权限，不退出登录。

## 安全要求

- AppSecret 只存在 Cloudflare 服务端环境变量。
- OAuth 回调地址必须与钉钉开放平台配置完全一致。
- 授权 \`state\` 一次性使用，10 分钟过期。
- Session Token 至少 32 字节随机值，D1 只保存哈希。
- 登录和回调接口不返回用户 access token、AppSecret 或 Session 明文。
- 所有业务写接口拒绝跨站请求和无 Session 请求。
- 生产环境不渲染本地测试登录按钮。

## 测试与验收

自动测试覆盖：

- 普通浏览器未登录只显示登录页，且不请求业务 API。
- 钉钉内嵌未登录自动请求 JSAPI 授权码。
- 浏览器 OAuth \`state\` 校验成功和失败路径。
- 本企业成员登录成功并创建 Cookie。
- 非本企业、失效成员和无组织缓存时登录失败。
- Session 创建、读取、过期、退出和撤销。
- \`/api/state\`、销售和钉钉接口的 401 / 403 保护。
- \`readonly\` 无法直接调用写接口。
- 本地测试入口不会进入生产构建。

人工验收覆盖：

1. Chrome 无 Session 打开生产地址，看到登录页。
2. 使用公司钉钉扫码，进入系统并显示正确姓名、部门和职位。
3. 刷新页面仍保持登录。
4. 退出后业务数据不再可见。
5. 钉钉工作台打开同一地址，自动免登并进入同一份数据。
6. 非企业账号扫码被拒绝。
7. 登录后创建一条测试待办和日程，确认钉钉功能仍使用当前用户身份。

## 发布策略

认证改造先在本地使用模拟钉钉响应完成自动测试；随后发布到 Cloudflare Preview 验证真实扫码回调。Preview 验收通过后再合并到生产 \`main\`。发布前不修改现有 D1 公司业务状态，只新增认证和组织成员表。
`,Xn=`# 平台销售表排序设计

## 目标

平台销售表默认按销售额从高到低排列，并允许用户从各列表头切换排序字段和方向。

## 交互

- 初始排序为销售额降序。
- 平台、销量、销售额、毛利润率、营销费用率、发货前退款率、发货后退款率均可排序。
- 点击未激活数值列时从降序开始，平台列从名称升序开始。
- 点击当前列时在升序和降序间切换。
- 表头文字右侧显示 14px 图标；激活列显示明确方向，未激活列显示双向排序图标。
- 图标按钮提供 \`aria-label\`、\`title\` 和键盘焦点，不依赖颜色表达方向。

## 数据边界

排序只作用于 \`summary.byPlatform\` 的展示副本，不修改汇总结果，不影响指标卡、趋势图或后端数据。
`,Zn=`# 产品规划设计

日期：2026-07-15

## 目标

为产品经理提供公司级年度产品规划。用户可以从需求池把机会拖入年度时间轴，为同一机会安排一个或多个开发、上线周期，同时不改变需求状态或触发立项。

## 范围

本次包含：

- 左侧新增“产品规划”导航，位于“需求池”和“产品进度”之间。
- 年度甘特图，产品为行，1 至 12 月为列。
- 页面上方显示可拖拽的需求池产品，只展示缩略图和名称。
- 拖入月份后填写预计开发时间段和预计上线时间段。
- 规划记录的查看、新增、编辑和删除。
- 复用“添加需求机会”表单创建新需求。
- 规划数据通过现有共享状态接口写入 D1。
- 产品规划查看与编辑权限。

本次不包含：

- 拖入规划后自动立项或修改需求状态。
- 自动资源平衡、工时估算、依赖关系和关键路径。
- 甘特条直接拖动改变日期；日期修改通过编辑弹窗完成。

## 信息架构

### 导航

导航顺序为：总览、需求池、产品规划、产品进度、产品档案、问题反馈、设置。

“产品规划”默认对所有部门可见。产品部和总经办可以编辑；其他部门为只读。历史权限名称“产品团队”在状态归一化时迁移为“产品部”，权限判断只使用钉钉组织架构中的正式部门名称。

### 页面结构

1. 页面标题区
   - 标题“产品规划”。
   - 年度选择器，默认当前年度。
   - “添加需求机会”按钮，复用现有 \`DemandModal\`。
2. 需求区
   - 读取未转开发的需求池记录。
   - 每项只显示产品缩略图和名称。
   - 横向滚动，支持鼠标拖拽和键盘/触屏的“安排”操作。
3. 年度甘特图
   - 左侧固定产品名称列，右侧为 1 至 12 月时间轴。
   - 每个产品聚合显示其当年所有排期。
   - 开发周期使用蓝色条，上线周期使用绿色条。
   - 同一产品存在多条规划时，在同一产品行内分层排列，避免重叠。
   - 点击任一时间条打开编辑弹窗。

## 交互

### 新增规划

1. 用户拖动需求卡到某个月份。
2. 系统根据落点月份打开轻量弹窗，并预填该月日期范围。
3. 用户填写：
   - 预计开发开始日期和结束日期。
   - 预计上线开始日期和结束日期。
4. 保存后新增一条规划记录，需求仍保留在需求区。

同一需求可以重复拖入，创建多条独立规划。跨月和跨年日期均允许，记录归属年度以开发开始日期所在年度为准；切换年度时仍显示与该年度存在日期交集的时间条。

### 编辑与删除

- 点击时间条打开同一弹窗并修改日期。
- 删除操作在弹窗中提供，必须二次确认。
- 删除规划不删除需求，不影响产品档案和产品进度。

### 添加需求机会

“添加需求机会”打开现有 \`DemandModal\`。保存后创建正常需求池记录，新需求立即出现在页面上方需求区，可继续拖入规划。

### 只读体验

非产品部、非总经办用户可以查看年度规划，但不能拖拽、新增、编辑或删除。不可用控件保留稳定布局，并通过 hover 提示“仅产品部和总经办可维护产品规划”。

## 数据模型

共享状态新增 \`productPlans\` 数组：

\`\`\`js
{
  id: "plan-...",
  demandId: "demand-id",
  demandSnapshot: {
    name: "产品名称",
    image: "图片地址或 data URL"
  },
  developmentStart: "YYYY-MM-DD",
  developmentEnd: "YYYY-MM-DD",
  launchStart: "YYYY-MM-DD",
  launchEnd: "YYYY-MM-DD",
  createdBy: "姓名",
  createdAt: "ISO datetime",
  updatedAt: "ISO datetime"
}
\`\`\`

\`demandId\` 用于复用需求实时名称和图片，\`demandSnapshot\` 用作需求被删除后的历史回退。需求删除时不级联删除规划；规划行显示快照并标记“来源需求已删除”。

## 状态与持久化

- \`createDefaultState()\` 增加空的 \`productPlans\`。
- \`normalizeClientState()\` 对旧状态补空数组，规范日期和快照字段，并丢弃结构无效的记录。
- \`ProductFlowProvider\` 提供 \`addProductPlan\`、\`updateProductPlan\` 和 \`deleteProductPlan\`。
- 继续使用现有 \`/api/state\` 整体状态保存链路和 D1 \`product_flow_state\` 表，不新增浏览器专属数据源。
- Pages Function 的状态校验将 \`productPlans\` 纳入必要数组，部署前需要确保前端默认状态和后端校验同步上线。

## 组件边界

- \`ProductPlanningPage\`：页面编排、年度筛选、权限状态。
- \`PlanningDemandTray\`：需求区、拖拽源和触屏安排入口。
- \`AnnualPlanningTimeline\`：月份刻度、产品行、时间条定位和只读展示。
- \`ProductPlanModal\`：新增、编辑、日期校验和删除。
- \`planning.js\`：日期区间、年度交集、时间条位置、权限无关的数据转换。

组件不直接写 D1，统一调用 \`ProductFlowProvider\` 状态操作。

## 校验与错误处理

- 四个日期均必填。
- 每个时间段的开始日期不得晚于结束日期。
- 上线开始日期可以与开发周期重叠，但界面明确分别标注。
- 关联需求缺失时使用快照，不阻止查看和编辑。
- 共享状态保存失败时沿用全局错误提示，并保留本地未同步标记。
- 拖放失败、无权限和日期无效均给出具体原因，不使用无说明的灰色按钮。

## 可访问性与响应式

- 甘特图可横向滚动，产品名称列保持粘性。
- 时间条同时使用文字和颜色区分，不能只依赖颜色。
- 需求卡支持键盘操作；拖放不是唯一入口。
- 1440px 及常见笔记本宽度下优先保证月份刻度和产品名称可读。
- 窄屏保持时间轴滚动，不压缩文字到不可读尺寸。

## 测试

### 领域与共享状态

- 旧状态自动补充 \`productPlans: []\`。
- 创建、编辑和删除规划记录。
- 同一需求允许多条规划。
- 跨月、跨年记录的年度可见性计算。
- 删除需求后通过快照保留规划。
- 历史“产品团队”权限迁移为“产品部”。

### 页面与交互

- 导航顺序和权限正确。
- 需求区只显示缩略图和名称。
- 拖入月份后打开日期弹窗。
- 日期无效时保存按钮不可用并显示原因。
- 点击时间条可编辑，删除前有确认。
- 只读用户不能新增、拖动、编辑和删除，但可以查看。

### 发布验证

- React 全量测试通过。
- 生产构建成功。
- 本地浏览器验证 1440px 和笔记本宽度布局。
- 构建产物同步到实际发布仓库后，验证线上 \`/api/state\` 能保存并重新读取 \`productPlans\`。
`,ne=`# 产品进度排期摘要设计

## 目标

在产品进度页清晰展示当前产品从开发开始到预计上线的时间进度，并与首页、产品规划使用同一份排期数据和同一套状态判断。历史产品没有排期时保持中性，不影响现有阶段、任务和交付物。

## 页面位置与层级

排期摘要放在页面头部和五阶段看板之间，使用单行紧凑信息带，不新增大卡片，也不挤入产品选择器。

- 左侧显示环形时间进度及百分比。
- 中间显示“开发至上线”、开发开始日期和预计上线日期。
- 右侧显示排期状态和辅助操作。
- 排期摘要只表达时间，不替代阶段完成度；五阶段看板继续表达业务流程完成情况。

## 状态规则

- **进行中**：当前日期在开发开始至预计上线之间，按已用时间占整个周期的比例计算百分比。
- **未开始**：当前日期早于开发开始，显示 \`0%\` 和“尚未开始”。
- **临近上线**：距离预计上线不超过 7 天，使用提醒色但不标红。
- **已逾期**：超过预计上线日期且产品尚未进入上市阶段，显示红色 \`100%\` 和逾期天数。
- **已上市**：产品已进入上市或复盘阶段，显示绿色 \`100%\`，不再判定逾期。
- **未设置排期**：缺少开发开始或预计上线日期，显示中性圆环和“未设置排期”，不显示 \`0%\`；提供“前往产品规划”入口。
- **异常排期**：预计上线早于开发开始时按未设置处理，避免展示错误百分比。

## 数据与组件

排期记录仍来自共享状态 \`productPlans\`，通过需求记录的 \`productId\` 或排期快照中的 \`productId\` 关联产品。抽取可复用的产品排期摘要函数，首页和产品进度页共同使用，避免重复计算。

新增紧凑的 \`ProductScheduleSummary\` 展示组件。组件只接收已经计算好的排期摘要和导航回调，不自行查询或修改数据。

## 交互与响应式

- 点击“前往产品规划”进入产品规划页，不直接修改产品任务或阶段。
- 逾期状态同时使用颜色和文字，不能只依赖红色表达。
- 笔记本宽度保持单行；窄屏时日期和操作自然换行，环形进度尺寸不缩放。
- 所有状态文字保持 12-13px，不与页面标题或阶段标题竞争层级。

## 验证

- 覆盖未开始、进行中、临近上线、逾期、已上市、未设置和异常日期的领域测试。
- 确认首页与产品进度页对同一产品返回相同百分比和状态。
- 运行 React 全量测试及生产构建。
- 在 1440px 和 1024px 视口检查层级、对齐、换行和溢出。
`,ee=`# 公司战略执行平台设计

## 1. 产品定位

本项目把现有“产品全周期”扩展为公司级战略执行平台。“产品全周期”保留为平台内的第一个业务 App，而不是继续承担整个平台的全部职责。

平台采用“全员执行 + 老板驾驶舱”一体化模式：员工只维护自己负责的最小执行单元，各业务 App 自动上报事实数据，平台向上汇总为战略状态、风险和待决策事项。老板不需要额外索取一套汇报数据。

核心管理链路为：

> 公司年度战略 → 季度目标 → 关键指标 → 重点项目 → 里程碑与任务

年度战略确定方向，季度目标承接战略，每月进行健康度检查。平台以钉钉工作台为主要入口，同时支持电脑浏览器独立访问。

## 2. 产品原则

1. 异常优先：正常事项只做摘要，首页优先展示偏离、风险、阻塞和待决策事项。
2. 事实优先：目标状态主要来自指标和项目，不依赖负责人主观填写一个进度百分比。
3. 自动汇总：业务 App 和数据接口自动提供进度，负责人只确认状态并解释偏差。
4. 分层协作：老板、总经办、部门负责人、项目负责人和成员只维护各自职责范围。
5. 严重异常不可平均：关键指标或关键里程碑严重偏离时，其他正常数据不能把目标平均成绿色。
6. 历史不可覆盖：周度更新、月度检查、决策和人工修正均保留快照与审计记录。
7. App 解耦：战略中心通过统一接入协议读取业务状态，不依赖某个 App 的内部数据结构。

## 3. 第一版范围

第一版包含：

- 公司平台底座
- 公司首页
- 战略中心
- 重点项目中心
- 老板驾驶舱
- 产品全周期 App 接入
- 周度状态确认与月度经营检查
- 钉钉登录、组织、待办和通知集成

第一版不包含：

- 薪酬、绩效考核与目标直接挂钩
- 通用低代码流程设计器
- 财务预算和复杂资源排产
- 替代钉钉的即时沟通或完整通用任务系统
- AI 自动替负责人做最终判断
- 一次性接入所有外部业务系统

## 4. 信息架构

### 4.1 公司首页

公司首页是全员统一入口，根据角色显示不同内容：

- 普通员工：我的任务、即将到期事项、参与项目
- 项目负责人：待确认状态、风险、里程碑、待协调事项
- 部门负责人：本部门目标、项目组合、资源冲突和异常
- 老板与管理层：战略偏离、重大项目、待决策和未解决承诺

### 4.2 战略中心

战略中心管理年度战略、季度目标和关键指标。季度目标必须描述结果，并至少关联一个关键指标或一个重点项目。

### 4.3 重点项目中心

重点项目中心管理支撑战略执行的跨部门项目，包括负责人、参与部门、成功标准、里程碑、风险、周度更新和决策请求。

### 4.4 业务 App 中心

业务 App 中心承载具体业务系统。产品全周期是第一个接入的业务 App，未来可增加营销活动、供应链改善、渠道拓展等 App。

### 4.5 老板驾驶舱

老板驾驶舱回答五个问题：

1. 哪些战略正在偏离？
2. 哪些重点项目出现异常？
3. 问题卡在哪个部门和负责人？
4. 哪些事项需要老板拍板？
5. 上次承诺的问题是否已经解决？

### 4.6 平台设置

平台设置统一管理钉钉登录、组织架构、角色权限、消息通知、App 注册、数据源和审计记录。

## 5. 核心领域模型

### 5.1 年度战略

年度战略至少包含名称、战略意图、年度成功标准、负责人、适用周期和状态。战略由老板或总经办创建和归档。

### 5.2 季度目标

季度目标包含结果描述、负责人、参与部门、所属季度、成功标准、关联指标、关联项目、健康度和负责人信心。季度目标必须归属于一项年度战略。

### 5.3 关键指标

关键指标包含：

- 名称、负责人和单位
- 基准值、目标值和当前值
- 上升、下降或区间型目标
- 数据来源和更新频率
- 预警线和偏离线
- 最近更新时间和确认状态

指标支持业务 App、接口、表格同步和人工录入。超过更新周期的数据标记为“数据过期”，不能继续显示为正常。

### 5.4 重点项目

重点项目至少包含：

- 项目目标和成功标准
- 发起人、负责人、主责部门和协同部门
- 开始时间和计划结束时间
- 战略和季度目标关联
- 关键里程碑
- 当前最大风险
- 待管理层决策事项
- 关联业务 App 或外部数据源

普通任务延期不会直接把项目标红；关键里程碑延期或重大风险失控才会升级项目健康度。

### 5.5 风险

风险包含严重级别、影响范围、负责人、应对动作、承诺解决时间、当前状态和升级记录。风险可关联战略、目标、项目、里程碑或业务 App 实体。

### 5.6 决策请求

决策请求包含问题、影响、推荐方案、备选方案、最晚决策日期、发起人和决策人。管理层可选择同意、退回补充或召开会议，结果保留历史并通知相关人员。

### 5.7 状态更新与月度快照

项目负责人每周确认一次状态，只需回答：

1. 本周发生了什么关键变化？
2. 当前最大风险是什么？
3. 是否需要跨部门协调或管理层决策？

每月形成经营检查快照，保存上月状态、本月变化、负责人解释和管理层结论，历史快照不可被后续更新覆盖。

## 6. 健康度规则

战略和目标使用四级状态：

- 正常：指标和项目均在计划内
- 风险：预计可能偏离，但存在明确恢复方案
- 偏离：指标或关键里程碑已突破容忍线
- 已完成：成功标准已经满足

目标健康度由关键指标状态、重点项目状态、数据新鲜度和负责人信心共同形成。规则遵循异常优先：

1. 任一关键指标或关键里程碑为严重偏离，目标不得显示为正常。
2. 数据过期会降低可信度并产生信息风险。
3. 人工覆盖自动状态必须填写原因并记录审计。
4. 风险关闭必须记录处理结果，不能仅删除风险。

## 7. 老板驾驶舱

顶部展示战略目标、重点项目、待决策、本月重大风险和上月承诺未关闭数量。

主体按以下优先级排列：

1. 待决策事项
2. 重大异常与风险
3. 战略执行地图
4. 重点项目组合
5. 月度经营检查

待决策事项展示问题、推荐方案、最晚日期、影响目标和项目。异常事项必须展示责任人、处理动作和承诺解决时间。战略执行地图支持从战略逐层下钻到目标、指标、项目、里程碑和业务 App。

## 8. 角色与权限

平台角色包括老板或管理层、总经办、战略负责人、部门负责人、项目负责人、项目成员、App 管理员和普通员工。一个人可同时拥有多个角色，权限由角色、部门和项目成员关系共同决定。

公司战略、季度目标和重点项目摘要默认全员可见。项目可设置公司公开、仅参与部门可见或指定人员可见。预算、人事和并购等敏感字段支持字段级限制，无需隐藏整个项目。

越权访问返回明确提示。关键读取、修改、决策和人工覆盖均写入审计记录。

## 9. 通知规则

钉钉通知只围绕需要行动的事项：

- 状态需要确认
- 关键里程碑即将到期或已经延期
- 风险升级
- 被指定为协调负责人
- 收到管理层决策
- 决策即将超过最晚处理时间

普通动态合并为每日或每周摘要。重要事项可同步为钉钉待办，点击后进入对应目标、项目或业务 App。

## 10. App 接入协议

每个业务 App 通过稳定的 App ID、实体类型和实体 ID 与平台对象关联，并上报以下标准事件：

- 进度变化
- 里程碑完成或延期
- 风险新增、升级或关闭
- 指标更新
- 决策请求
- 负责人变化

上报数据同时包含来源、发生时间、同步时间和幂等键。重复事件不会生成重复风险或决策请求。单个 App 故障不会阻止驾驶舱读取其他数据。

## 11. 技术架构

### 11.1 前端应用壳

继续使用 React，建立统一应用壳处理导航、登录、组织身份、权限、通知和 App 注册。公司首页、战略中心、重点项目、产品全周期和平台设置作为独立模块接入。

### 11.2 平台服务

服务边界包括组织与权限、战略与目标、指标与数据源、重点项目与里程碑、风险与决策、状态更新与快照、App 接入、通知以及驾驶舱汇总。

### 11.3 数据层

继续使用 Cloudflare D1，但不再把整家公司状态长期保存为单一 JSON。新增结构化数据表：

- \`strategies\`
- \`objectives\`
- \`metrics\`
- \`projects\`
- \`milestones\`
- \`risks\`
- \`decision_requests\`
- \`status_updates\`
- \`monthly_snapshots\`
- \`app_links\`
- \`app_events\`
- \`audit_logs\`

现有产品全周期数据保留兼容读取，并按模块渐进迁移。所有写入使用服务端身份和权限校验，重要状态变更同时写审计记录。

### 11.4 驾驶舱读取

驾驶舱使用专门的汇总读取模型，不在页面中临时拼接所有原始记录。业务写入后更新相关汇总；汇总失败时保留上次有效结果并显示数据新鲜度。

## 12. 异常与恢复

- 指标同步失败：保留最后有效值，标记同步异常并通知负责人。
- App 不可用：驾驶舱继续工作，仅标记该来源异常。
- 项目长期未更新：产生信息风险并提醒负责人。
- 重复风险或决策：依据来源和幂等键合并。
- 负责人离职或调岗：事项进入待重新指派状态。
- 名称修改：稳定 ID 保持关联不变。
- 删除操作：优先归档，避免历史快照断链。
- 人工修正：保存原值、新值、修改人、时间和原因。

## 13. 实施分期

### 阶段一：平台底座

建立公司平台外壳、统一登录、组织权限、App 注册、结构化数据库和审计记录，并把产品全周期放入新导航。

### 阶段二：战略执行闭环

上线战略、季度目标、关键指标、重点项目、里程碑、风险、决策请求和分角色首页。此阶段允许部分数据人工维护。

### 阶段三：产品全周期自动接入

让产品全周期自动上报进度、延期、里程碑和风险，接入钉钉待办与行动通知，形成第一个完整业务闭环。

### 阶段四：经营检查与扩展

上线周度确认、月度快照、趋势分析和标准化 App 接入能力，为后续增加自动指标数据源和更多业务 App 做准备。

## 14. 验收标准

1. 总经办可以建立年度战略、季度目标和关键指标。
2. 重点项目可以关联战略、指标、部门、里程碑和业务 App。
3. 产品全周期能自动上报项目进度、关键里程碑、延期和风险。
4. 员工只维护自己负责的数据，上层状态自动汇总。
5. 老板在三分钟内能找到所有偏离战略、重大风险和待决策事项。
6. 严重异常不能被其他正常数据平均成正常状态。
7. 每周确认和每月经营检查均有不可覆盖的历史快照。
8. 钉钉与独立浏览器使用相同身份、数据和权限。
9. 单个 App 或数据源故障不会导致整个驾驶舱不可用。
10. 权限、汇总规则、风险升级、幂等接入和历史快照具有自动化测试。
`,ae=`# 总经办个人待办与钉钉双向同步设计

## 背景

公司战略执行平台已经具备公司驾驶舱、战略目标、重点项目、风险、决策、经营检查和产品全周期 App。当前总经办成员登录后主要看到公司级驾驶舱，尚未形成精确到个人的责任事项入口；平台只支持部分事项主动同步到钉钉，缺少钉钉完成状态回流。

本功能为总经办提供个人工作台，并在不引入私人待办和其他系统待办的前提下，实现平台关联待办与钉钉待办的双向状态同步。钉钉状态回流采用按当前登录人查询企业待办列表的方式，不依赖尚未确认的待办完成事件。

## 目标

- 每位总经办成员只看到明确分配给本人的平台责任事项。
- 公司首页提供“我的待办”和“公司驾驶舱”两个视图，总经办成员默认进入“我的待办”。
- 战略、项目、风险、复盘和产品全周期的责任事项采用统一待办模型。
- 平台关联待办的创建、修改、完成和重新打开同步到钉钉。
- 钉钉完成平台关联待办后，在登录刷新、手动刷新或定时刷新时安全地回流到平台。
- 决策结果和风险关闭等高影响业务状态继续由平台确认。

## 非目标

- 不读取或展示用户全部钉钉待办。
- 不把私人待办或其他系统创建的待办导入战略执行平台。
- 不通过姓名长期匹配钉钉身份。
- 不因钉钉接口或状态查询不可用而阻塞平台本身的待办功能。
- 不在本功能中设计全公司的通用任务管理系统。

## 方案选择

采用“统一个人待办模型”。各业务模块把责任事项映射成统一的 \`personalTodo\`，页面、钉钉推送和钉钉状态回流只依赖统一模型，不在页面临时拼接不同业务集合。

未采用的方案：

- 页面实时聚合：实现较快，但同步状态、钉钉 ID 和状态回写路由会分散到每种业务对象。
- 钉钉待办镜像：会让钉钉成为业务事实源，削弱战略、项目、风险与原始责任事项之间的关联。

## 统一数据模型

\`personalTodos\` 作为平台结构化集合持久化。核心字段如下：

\`\`\`js
{
  id: "todo-...",
  sourceType: "milestone | decision | risk | review | product_task",
  sourceId: "原始业务对象 ID",
  sourceAppId: "platform | product-flow",
  sourceKey: "strategy-platform:<sourceType>:<sourceId>",
  title: "待办标题",
  description: "背景和验收要求",
  strategyId: "可选",
  objectiveId: "可选",
  projectId: "可选",
  assigneeName: "显示名称",
  assigneeUserId: "钉钉企业内 userId",
  assigneeUnionId: "钉钉 unionId",
  dueDate: "YYYY-MM-DD",
  priority: 10,
  status: "pending | done | cancelled",
  businessStatus: "原始事项状态快照",
  completedAt: "ISO 时间",
  completedFrom: "platform | dingtalk",
  dingTodo: {
    id: "钉钉待办 ID",
    creatorUnionId: "创建人 unionId",
    syncedVersion: 1,
    syncedAt: "ISO 时间",
    lastEventAt: "ISO 时间",
    lastError: ""
  },
  createdAt: "ISO 时间",
  updatedAt: "ISO 时间"
}
\`\`\`

唯一性由 \`sourceKey + assigneeUnionId\` 保证。同一责任事项更换负责人时更新现有待办的执行人，不创建重复业务事项。钉钉同步以 \`unionId\` 为身份依据；姓名只用于显示和旧数据迁移。

## 待办来源

个人待办覆盖以下责任事项：

1. 本人负责的重点项目里程碑。
2. 本人负责的风险整改。
3. 本人需要处理的管理决策。
4. 本人需要提交的周度或月度经营复盘。
5. 产品全周期中明确分配给本人的任务。

仅有负责部门、没有具体负责人的产品任务进入部门公共队列，不进入任何人的个人待办，也不自动同步钉钉。指定个人后生成个人待办。

各业务模块保留原始事实。统一待办是责任事项的执行投影，不替代项目、风险、决策和产品任务本身。

## 页面设计

总经办成员的公司首页顶部增加双视图切换：

\`我的待办（未完成数） | 公司驾驶舱\`

总经办成员默认进入“我的待办”，公司驾驶舱保持现有全局管理视角。个人待办按以下顺序分组：

1. 已逾期
2. 今日截止
3. 未来 7 天
4. 稍后处理
5. 已完成

每条待办显示：

- 标题和来源类型
- 关联战略或重点项目
- 截止时间和优先级
- 钉钉同步状态
- 打开原始事项、标记完成、同步或重新同步操作

支持按来源类型和关联项目筛选。同步失败时展示简明原因和“重新同步”，不隐藏待办。

## 平台到钉钉

以下变化触发钉钉同步：

- 新建待办
- 标题、说明、截止时间、优先级变化
- 更换负责人
- 完成待办
- 平台主动重新打开待办

发送给钉钉的稳定来源标识为：

\`strategy-platform:<sourceType>:<sourceId>\`

首次同步创建钉钉待办，后续通过已保存的 \`dingTodo.id\` 更新。钉钉接口失败只更新 \`lastError\` 和审计日志，不回滚平台业务状态。

## 钉钉到平台

服务端使用当前登录会话中的 \`unionId\` 调用钉钉“查询企业下用户待办列表”接口。状态回流在以下时机触发：

1. 用户进入“我的待办”并完成首次加载。
2. 用户点击“刷新钉钉状态”。
3. 页面保持打开时按低频间隔刷新。

处理流程：

1. 服务端验证当前登录会话，只允许查询会话本人的待办。
2. 服务端分别查询未完成和已完成状态并处理分页。
3. 前端只用 \`personalTodo.dingTodo.id\` 与返回的待办 ID 做交集，不按标题匹配，不导入未知待办。
4. 通过 \`sourceKey\` 定位 \`personalTodo\` 并按业务类型执行安全回写。
5. 已处理的远端状态快照用 \`taskId + isDone + modifiedTime\` 做幂等判断。
6. 写入审计日志；重复或更旧的状态不会再次修改业务对象。

钉钉查询接口尚未配置或暂时失败时，平台仍能生成、展示并主动同步待办，只是暂时不接收钉钉完成状态。

## 业务状态回写规则

### 可直接完成

- 产品任务：钉钉完成后把原始产品任务标记为完成。
- 项目里程碑：钉钉完成后把里程碑标记为完成。
- 复盘提交：钉钉完成后把对应提交提醒标记为完成；实际复盘内容仍需满足表单必填校验。

### 需要平台确认

- 管理决策：钉钉完成只把个人提醒标记为“已处理”，不能自动生成“同意”或“退回”结论。平台继续显示待补充决策结果。
- 风险整改：钉钉完成只表示负责人已提交处理，不能自动关闭风险。风险需在平台确认残余风险和关闭结果。

平台明确完成决策或关闭风险后，对应钉钉待办同步完成。

## 冲突和重新打开

- 标题、负责人、截止时间、业务说明等字段以平台为事实源。
- 完成状态按最新有效状态快照时间处理。
- 决策结果和风险关闭始终以平台为事实源。
- 平台具备管理权限的用户可以显式重新打开事项；重新打开后同步更新钉钉待办。
- 已归档或已删除的来源收到延迟状态时，只记录状态快照，不恢复业务对象。

## 权限

- “我的待办”按当前登录用户的 \`unionId\` 过滤，只展示本人事项。
- 公司驾驶舱继续展示公司级汇总，不直接展示其他人的个人钉钉待办内容。
- 具备管理权限的用户可以重新分配负责人、调整截止时间和重新打开事项。
- 普通负责人只能更新本人待办的执行状态和允许填写的业务结果。
- 服务端重新验证当前会话和操作权限，前端过滤不作为权限边界。

## 同步状态和错误处理

页面同步状态包括：

- 未同步
- 已同步
- 待更新
- 同步失败
- 已完成

异常规则：

- 缺少负责人 \`unionId\`：平台待办正常保存，标记“无法同步”。
- 钉钉 API 失败：保存平台变更，记录错误，允许人工重试。
- 重复状态快照：返回成功但不重复修改业务状态或生成审计记录。
- 未知或非本平台来源：忽略并记录安全审计信息。
- 来源已归档或删除：保留状态快照，不恢复来源。

## 审计

以下操作写入审计日志：

- 生成个人待办
- 分配或更换负责人
- 修改截止时间
- 平台或钉钉完成待办
- 重新打开
- 决策待补结论或风险待确认关闭
- 同步失败和人工重试
- 忽略重复、过期或未知来源状态

审计记录包含操作者、来源、远端快照键、业务对象、变更前后状态和时间。

## 接口边界

前端继续使用现有 \`/api/dingtalk/todo/sync\` 主动创建或更新钉钉待办。新增服务端能力：

- 个人待办结构化持久化，纳入平台 API。
- 当前登录人的钉钉待办只读查询入口。
- 远端状态快照幂等记录。
- 业务类型到原始对象的安全状态回写。

钉钉企业待办查询权限和应用凭证属于部署配置，不写入前端代码或平台状态。

## 本地真实数据预览

为在上线前验证真实数据形态，本地开发环境提供只读 DWS 桥接：

\`本地测试页 → 127.0.0.1 开发接口 → dws todo task list → 当前账号线上待办\`

约束如下：

- 仅在 Vite 本地开发服务器和回环地址启用，生产构建不包含可调用的 DWS 服务端入口。
- 接口只允许查询未完成和已完成列表，不提供创建、更新、完成或删除能力。
- 返回结果只在“线上钉钉待办（只读测试）”区域展示，不写入 \`personalTodos\`，不改变“只同步平台关联待办”的产品规则。
- 页面明确标记真实线上数据和只读状态，避免把预览操作误认为平台同步。
- DWS 未登录、命令不可用或查询失败时，隐藏真实数据并显示本地诊断，不影响个人待办开发功能。
- 提交代码和生产构建前验证该入口在生产模式不可用。

本地预览只验证真实待办的字段、数量、截止时间和完成状态展示。双向写入仍在独立联调环境通过平台生成的测试待办完成，禁止使用既有个人待办验证写操作。

## 上线前真实联调

上线前使用独立联调环境和带 \`strategy-platform:\` 来源标识的测试待办完成以下验证：

- 平台创建待办后在钉钉可见。
- 平台修改截止时间、优先级和负责人后钉钉同步更新。
- 钉钉完成普通任务或里程碑后平台正确回流。
- 钉钉完成决策或风险提醒后不自动批准或关闭业务对象。
- 平台重新打开后钉钉恢复未完成。
- 重复、延迟和非本人查询不产生错误业务状态。

联调完成后清理测试待办，不触碰用户已有的非平台待办。

## 验收标准

1. 两名总经办成员登录后看到不同的个人待办。
2. 总经办成员默认进入“我的待办”，可切换到公司驾驶舱。
3. 待办包含里程碑、决策、风险、复盘和明确到个人的产品任务。
4. 只有部门、没有个人负责人的任务不进入个人待办。
5. 平台创建、改期、换负责人、完成和重新打开会更新钉钉待办。
6. 钉钉完成普通任务或项目里程碑后，平台原始事项自动完成。
7. 钉钉完成决策或风险待办后，不自动批准决策或关闭风险。
8. 重复和延迟状态快照不会重复修改状态。
9. 缺少钉钉身份或同步失败不会阻塞平台待办保存。
10. 未配置钉钉状态查询权限时，个人待办仍可独立使用。
11. 本地开发页可只读预览当前 DWS 账号的真实线上待办，且生产模式无法调用该入口。

## 测试策略

- 领域测试：待办生成、个人过滤、分组排序、唯一性、负责人变更和重新打开。
- 同步载荷测试：稳定来源标识、执行人 \`unionId\`、截止时间、完成状态和更新复用钉钉待办 ID。
- 状态拉取测试：会话身份校验、分页、状态幂等、未知待办忽略、延迟快照忽略和来源归档处理。
- 业务回写测试：普通任务与里程碑可直接完成，决策和风险必须平台确认。
- 权限测试：本人可见、他人不可见、管理操作服务端校验。
- UI 测试：双视图默认状态、未完成数量、分组、筛选、空状态、失败状态和重试入口。
- 回归测试：公司驾驶舱、重点项目、经营检查和产品全周期现有功能保持可用。
`,se=`# 公司战略、部门承诺、激励项目与月度汇报设计

## 1. 背景与目标

公司当前有三项年度核心战略：

1. 组织建设
2. 鸟类销量突破——12 月单月 GMV 达 100 万元
3. 仓鼠品牌升级——品牌排名提升

平台需要让管理层明确看到战略怎样被部门承接、什么结果才算达成，同时容纳部门自主发起的奖金激励项目，并保留每月初各部门对上月重点工作的正式汇报。

本次设计把现有平台补充为三个独立但互相关联的业务模块：战略与部门承诺、激励项目、月度汇报。老板驾驶舱统一汇总三者，个人工作台承接本人需要处理的事项。

## 2. 产品原则

1. 战略只由客观必达结果判定，不使用主观完成百分比，也不允许用加权平均掩盖关键失败。
2. 部门只录入年度或季度重点承诺，不把平台变成日常任务管理器。
3. 激励项目独立于战略体系，允许关联战略，也允许作为部门自主改善项目存在。
4. 月报由部门负责人手工填写，平台提供模板、流程、提醒、汇总和历史留档，不自动代写结论。
5. 正式承诺、月报原文、奖金决定和验收证据均保留审计记录，不允许无痕覆盖。

## 3. 信息架构

### 3.1 公司首页

公司首页保留两个一级视图：

- 我的待办：部门承诺审核、月度节点、激励项目事项、月报提交与退回等个人责任事项。
- 公司驾驶舱：战略达成、部门承接、激励项目、月报提交和异常情况的统一管理视图。

### 3.2 战略中心

战略中心采用四级结构：

1. 公司战略
2. 必达结果
3. 部门重点任务
4. 月度节点

每项公司战略设置 2 至 6 个必达结果。必达结果必须包含客观验收标准、责任人、截止日期和验收证据要求。所有必达结果完成并经核验后，公司战略才可确认达成。

部门重点任务按年度或季度设置，必须关联一项公司战略和一个必达结果。部门重点任务包含主责部门、负责人、周期、任务目标、验收标准和月度节点，不包含普通日常工作。

### 3.3 激励项目

激励项目是独立模块，包含：

- 项目名称、改善目标与背景
- 主责部门、负责人和参与成员
- 起止日期与当前状态
- 可选的战略、必达结果或部门重点任务关联
- 部门奖金额度、项目奖金上限
- 验收方式、效果证据
- 最终奖金、决定理由与决定人
- 财务发放状态

激励项目允许完全不关联战略，例如抖音投流优化等部门专项改善项目。

### 3.4 月度汇报

每个部门每月一份正式月报，由部门负责人手工填写。统一模板包含：

- 上月重点成果
- 未完成事项及原因
- 本月重点工作
- 主要风险
- 需要跨部门协调的事项
- 需要老板决策的事项
- 可选关联的战略、部门任务和激励项目

系统可以在填写页旁展示相关业务数据供参考，但不得自动写入月报正文或自动生成管理结论。

## 4. 业务流程

### 4.1 战略与部门承诺

1. 老板或总经办创建公司战略和必达结果并发布。
2. 部门负责人起草年度或季度重点任务，关联战略与必达结果，并拆解月度节点。
3. 部门重点任务提交总经办审核。
4. 总经办检查承接关系、验收标准和周期，可通过或退回修改。
5. 通过后交老板最终确认，确认后成为正式部门承诺。
6. 正式承诺的目标、验收标准和周期如需修改，必须填写变更原因并保留前后版本。
7. 月度节点由负责人更新状态和证据。
8. 必达结果满足验收标准后提交证据，由总经办核验。
9. 所有必达结果完成后，由老板确认公司战略正式达成。

部门重点任务状态为：草稿、总经办审核中、已退回、老板确认中、执行中、存在风险、已偏离、已完成、已取消。

月度节点状态为：未开始、正常推进、存在风险、已偏离、已完成。

### 4.2 激励项目

1. 部门负责人可在部门核定奖金额度内直接立项。
2. 超出部门额度或涉及多个主责部门时，进入总经办审核和老板确认。
3. 项目执行中记录阶段结果、风险和效果证据。
4. 结项时由部门负责人填写实际效果、最终奖金和决定理由。
5. 最终奖金不得超过立项时的项目奖金上限；超过上限必须升级审批。
6. 结项后财务记录待发放、已发放或暂缓发放。
7. 项目目标、效果证据、奖金决定和所有修改记录永久保留。

激励项目状态为：草稿、执行中、待结项、已结项、已取消。奖金状态为：未确定、待发放、已发放、暂缓。

### 4.3 月度汇报

1. 每月初系统为每个在用部门生成上月月报空白记录。
2. 部门负责人手工填写并提交。
3. 总经办可通过或退回；退回时必须填写原因。
4. 部门负责人修改后重新提交。
5. 月度会议结束后，总经办记录会议结论并批量冻结当月月报。
6. 冻结后不能修改原文，只能追加带作者和时间的更正说明。
7. 未提交、被退回和临近截止的月报进入个人待办，并可按现有安全规则同步钉钉。

月报状态为：草稿、已提交、已退回、已通过、已冻结。

## 5. 权限

- 老板：管理公司战略、确认必达结果与正式部门承诺、确认战略达成、查看全部数据。
- 总经办：维护战略、审核部门承诺、核验必达结果、审核和冻结月报、查看全部激励项目。
- 部门负责人：起草本部门承诺、维护月度节点、在额度内发起和结算激励项目、提交本部门月报。
- 项目负责人和成员：维护本人参与的激励项目进展与证据，但不能决定最终奖金。
- 财务：查看奖金结算信息并维护发放状态，不能修改项目验收结论。
- 普通员工：查看公开战略和本部门正式承诺，只编辑明确分配给自己的事项。

## 6. 驾驶舱与页面

### 6.1 战略驾驶舱

每项战略展示：必达结果完成数、未完成必达项、承接部门数、风险部门任务和下一关键节点。战略达成使用“全部必达项完成”的明确判定，不显示具有误导性的综合完成百分比。

### 6.2 部门承接视图

以公司战略为行、部门为列展示承接关系。空白单元格表示部门未承接该战略；单元格展示部门重点任务数量、风险数量和最近月度节点。

### 6.3 激励项目视图

展示进行中项目、待结项项目、部门额度使用情况、已决定奖金和待发放奖金。老板和总经办可以按部门、负责人、状态和是否关联战略筛选。

### 6.4 月报视图

展示各部门提交状态、退回原因、重点成果、风险、协调事项和待决策事项。会议视图按部门连续阅读，减少打开多份文档的操作成本。

## 7. 待办与钉钉

以下事项进入统一个人待办：

- 部门承诺待审核、被退回和待老板确认
- 月度节点临近截止、逾期或被标记为风险
- 激励项目阶段责任、待结项和待发放
- 月报待提交、被退回、待审核和待冻结

只有明确分配到个人且具备真实钉钉 unionId 的事项才允许同步。系统只回流已保存的钉钉待办 ID，不按标题匹配，也不导入其他系统或个人私有待办。

## 8. 异常处理与审计

- 战略缺少必达结果时不能发布。
- 部门重点任务缺少战略、必达结果、验收标准或负责人时不能提交。
- 激励项目超出部门额度时不得直接启动。
- 最终奖金超过项目上限时必须升级审批。
- 月报退回必须填写原因；冻结后拒绝原文修改。
- 钉钉同步失败不阻断平台内保存，保留错误并允许重试。
- 所有审核、退回、确认、冻结、结项、奖金决定和更正说明均写入审计记录。

## 9. 数据迁移

现有年度战略保留。当前季度目标按内容迁移为必达结果或部门重点任务：公司级结果迁移为必达结果，具有明确部门和交付责任的事项迁移为部门重点任务。现有重点项目继续保留，不自动转换为激励项目；只有明确包含奖金激励的专项项目才进入激励项目模块。

现有月度经营快照保留为历史管理层快照，新月报模块从下一开放月份开始生成，不反向伪造部门历史月报。

## 10. 测试与验收

1. 战略仅在全部必达结果完成并核验后可确认达成。
2. 部门承诺必须经过部门负责人、总经办和老板三段流程。
3. 部门负责人只能管理本部门承诺和本部门额度内的激励项目。
4. 超额度、跨部门和超奖金上限场景会升级审批。
5. 月报可退回重提，冻结后原文不可修改，只能追加更正说明。
6. 驾驶舱能从三项战略下钻到必达结果、部门任务和月度节点。
7. 激励项目和月报待办能进入个人工作台，并遵守现有钉钉身份与回流边界。
8. 所有状态变化都有操作者、时间和原因记录。
9. 桌面和移动端均无横向溢出，核心流程支持键盘操作和明确的错误提示。

`,te=`# 钉钉群聊执行人选择设计

## 背景

“同步到钉钉待办”弹窗目前只能从登录时缓存的组织架构中搜索人员。用户需要在电脑网页和钉钉内搜索自己有权访问的群，选择群后把群内全部成员带入待办执行人，并允许取消个别人。

钉钉待办的执行对象仍是用户，不是群聊。因此群聊只作为批量选择人员的入口，最终同步请求继续提交具体人员的 \`unionId\`，不向群内额外发送消息。

## 已确认范围

- 采用应用内统一群搜索方案，电脑网页与钉钉内使用同一套界面和行为。
- 选择一个群后默认带入该群全部可用成员。
- 群成员与已手动选择的人员按 \`unionId\` 去重。
- 用户可以在发送前取消任意成员。
- 本期不发送群消息，不把群设置为待办执行对象，也不建设常用群管理后台。
- 群成员数据只用于本次选择，不写入产品全周期业务状态。

## 能力验证门槛

当前项目会话只保存钉钉身份，没有保存用户级群聊访问凭证。正式开发的第一步必须使用企业应用的实际权限验证以下能力：

1. 网页 OAuth 登录用户可以搜索其可见群聊。
2. 钉钉内登录用户可以完成同等级别的用户授权。
3. 应用可以分页读取所选群的完整成员列表，并取得或转换为成员 \`unionId\`。
4. 明确待办执行人数上限、群搜索范围和所需权限。

只有以上能力全部通过才进入界面开发。若钉钉正式接口不允许自建应用搜索登录人的全部可见群，则停止方案 A 的实施并报告限制，由产品重新确认是否改用钉钉原生群选择器；不以静态假数据或不完整群列表代替正式能力。

## 用户体验

### 搜索与选择

在现有“执行人”区域增加“按人员 / 按群聊”切换：

- “按人员”保留现有姓名、部门、岗位搜索。
- “按群聊”按群名称搜索当前登录人有权访问的群。
- 搜索结果显示群名称；成员数量只有在接口可靠返回时才显示。
- 选择群后立即读取全部成员，完成前显示明确的加载状态，禁止重复选择同一个群。
- 加载成功后显示“已从「群名称」带入 N 人”；没有钉钉身份或不可作为执行人的成员显示跳过数量和原因。

弹窗底部的最终统计始终按去重后的人员数量计算，例如“已选 18 人，其中 15 人来自 1 个群”。提交按钮仍由最终有效执行人数、任务截止日期和同步状态共同控制。

### 成员来源与移除规则

前端为每个已选人员维护来源集合：手动选择标记和一个或多个群 ID。

- 同一人员同时来自多个群时只显示一次。
- 手动取消某个人后，本次弹窗内保持取消状态，不会因为重新渲染或重复加载群成员被自动加回。
- 删除一个群时，只移除仅由该群带入的人员。
- 同时由其他群带入或被手动选择的人员继续保留。
- 关闭弹窗不保存临时群选择；重新打开时仍以待办当前执行人作为初始状态。

### 异常反馈

- 未取得群聊授权：提示重新授权，保留已手动选择的人员。
- 授权过期：服务端先尝试刷新；刷新失败后要求重新授权。
- 群已解散、无权限或成员读取失败：不部分静默带入，显示失败原因并允许重试。
- 部分成员无法映射为 \`unionId\`：带入其余有效成员，同时明确显示跳过人数。
- 去重后的执行人数超过钉钉正式限制：禁止提交并提示减少人数，不自动截断。
- 搜索无结果：区分“没有匹配群”和“当前账号无群聊访问权限”。

## 技术设计

### 授权与安全

网页 OAuth 登录和钉钉内登录最终都建立用户级群聊授权。现有网页 OAuth 流程扩展为保存群聊权限对应的用户凭证；钉钉内免登仍用于建立身份会话，首次使用群搜索时通过 \`/api/auth/dingtalk/group/start\` 发起同一套用户授权，回调 \`/api/auth/dingtalk/group/callback\` 后返回原产品进度页面。正式权限名称由“能力验证门槛”的企业应用实测结果确定，验证失败则不继续开发方案 A。

访问令牌、刷新令牌和过期时间只保存在服务端，并与当前登录会话和钉钉用户绑定；前端永远不接收令牌。

用户令牌存放在独立的服务端令牌记录中，使用环境密钥加密，不加入共享业务状态，也不通过日志输出。会话撤销或用户退出时令牌失效。群搜索、成员查询接口必须校验当前会话，只能使用该会话绑定用户的凭证。

### 服务端接口

新增两个会话保护接口：

- \`GET /api/dingtalk/groups/search?q=<关键词>&cursor=<游标>\`：返回最小字段 \`{ groups: [{ id, name }], nextCursor }\`，不把原始钉钉响应透传给前端。
- \`GET /api/dingtalk/groups/<群ID>/members\`：服务端自行读取全部分页，返回 \`{ members: [{ unionId, name, department, title }], skippedCount }\`。

服务端负责令牌刷新、权限错误归一化、分页汇总、成员身份转换和执行人数限制校验。群 ID 必须来自当前用户可访问范围；不能仅信任前端传入的群 ID。

搜索请求采用短时用户级缓存降低重复调用；成员列表不写入长期共享缓存。缓存键必须包含当前钉钉用户，避免跨用户泄漏群信息。

### 前端状态

群聊选择逻辑从弹窗展示组件中拆成独立的数据请求与选择状态单元。核心状态包括：

- 搜索模式、关键词、搜索结果与加载状态。
- 已选择群的最小信息和成员加载状态。
- \`unionId -> { user, manual, groupIds, excluded }\` 的选择来源映射。
- 授权、权限、成员映射和人数限制错误。

最终仍调用现有 \`onSync({ executors })\` 入口，因此现有待办创建、更新和快照结构不增加群字段。群聊只影响弹窗内如何产生 \`executors\`。

## 数据流

1. 用户打开同步弹窗并切换到“按群聊”。
2. 前端对群名称输入做防抖，通过当前会话请求群搜索接口。
3. 用户选择一个群，前端请求完整成员列表。
4. 服务端校验会话和群访问范围，刷新凭证，分页读取成员并转换成 \`unionId\`。
5. 前端把成员合并到来源映射，去重后展示最终执行人。
6. 用户取消个别人或移除群，来源映射按规则重新计算。
7. 用户提交时只把最终有效人员交给现有待办同步流程。

## 验证方案

### 自动化测试

- 群搜索接口：会话校验、查询规范化、分页、用户隔离、权限错误和令牌刷新。
- 群成员接口：多页成员汇总、\`unionId\` 映射、重复成员、无效成员、群无权限和人数限制。
- 选择状态：人员与群混选、多个群重叠、手动取消、删除群、重复选择和关闭重开。
- 弹窗交互：模式切换、加载状态、空状态、错误提示、统计文案和提交载荷。
- 回归测试：原有只选人员的待办创建与更新行为保持不变。

### 实际环境验收

- 同一账号分别从电脑网页和钉钉内搜索同一个可见群，结果和带入人数一致。
- 普通成员、群主或管理员身份不同的账号只能看到各自有权访问的群。
- 选择包含重复组织成员的多个群，最终待办每人只创建一个执行关系。
- 模拟授权过期、群无权限和成员过多，界面均给出明确且可恢复的反馈。
- 在钉钉中确认收到待办的是最终保留的个人执行人，群内没有额外消息。

## 完成标准

- 电脑网页与钉钉内均可搜索当前登录人有权限访问的群。
- 选群后完整带入可用成员，正确去重并允许取消个别人。
- 最终同步载荷只包含个人执行人的 \`unionId\`。
- 不泄漏用户令牌或其他用户的群信息，不长期保存群成员目录。
- 所有新增自动化测试通过，并完成两种登录环境的真实钉钉验收。
`,ie=`# 钉钉待办恢复与产品进度交付物 CRUD 设计

## 背景

正式环境发送“立项PRD同步”待办时，钉钉返回 \`task existed sourceId\`。平台任务没有保存远端待办 ID，但钉钉已存在相同稳定 \`sourceId\` 的待办；当前同步逻辑只根据本地 \`dingTodo.id\` 判断创建或更新，因此持续重复创建并失败。

产品进度页的交付物使用共享 \`deliverables\` 集合，状态层已经具备新增、修改、删除能力，但任务表格只接入新增和查看。资料包页面已有完整 CRUD，两个页面的数据模型不一致并不是问题，缺口在于产品进度没有暴露编辑和删除操作。

## 已确认方向

- 钉钉待办以钉钉核心待办为准，不创建替代任务或重复待办。
- 平台使用稳定 \`sourceId\` 关联业务任务与钉钉待办。
- 已存在的远端待办必须找回并更新，不能更换 \`sourceId\` 绕过冲突，也不能自动删除重建。
- 产品进度交付物与资料包共用同一份 \`deliverables\` 数据。
- 产品进度补齐查看、编辑、删除；钉钉文档和富文本都可以编辑，删除必须二次确认。
- 本次不改变群聊选人规则，不向群内发送消息。

## 方案比较

### 方案 A：按稳定 sourceId 恢复远端待办（采用）

首次创建遇到“任务已存在”错误时，查询创建人的未完成和已完成待办，按 \`sourceId\` 精确匹配已有记录，取得远端待办 ID 后调用更新接口。同步结果把真实 ID 回写本地。

优点是保持幂等、不制造重复待办，并能修复历史上“远端成功、本地回写失败”的状态。代价是冲突路径多一次待办查询。

### 方案 B：每次生成新的 sourceId（不采用）

可以绕过冲突，但会产生重复待办并失去业务关联稳定性。

### 方案 C：冲突后删除远端待办再重建（不采用）

会破坏钉钉中的完成状态、动态和参与关系，属于高风险外部副作用。

## 待办恢复设计

\`syncDingTodoTask\` 继续执行“有 \`todoId\` 则更新，否则创建”。创建失败时仅对钉钉明确的 \`task existed sourceId\` 参数错误进入恢复流程；其他错误保持原样返回。

恢复流程：

1. 查询 \`creatorUnionId\` 的未完成待办。
2. 未匹配时再查询已完成待办。
3. 从钉钉返回记录读取 \`sourceId\` 和待办 ID；兼容 \`id\`、\`taskId\`、\`todoTaskId\` 三种 ID 字段。
4. 仅在 \`sourceId\` 完全相等且取得有效 ID 时调用更新接口。
5. 找不到时继续抛出原始冲突错误，不猜测 ID。
6. 返回 \`{ id, updated: true, recovered: true }\`，前端沿用现有成功回写路径保存 ID。

恢复查询使用现有应用访问令牌和已开通的 \`Todo.Todo.Read\`、\`Todo.Todo.Write\` 权限。正式应用权限页已确认这两个权限均为“已开通”。

## 交付物 CRUD 设计

产品进度的交付物缩略项点击后统一打开预览弹窗。弹窗新增“编辑”和“删除”操作：

- 编辑：打开现有 \`TaskDeliverableModal\` 的编辑模式，预填类型、名称、钉钉文档链接或富文本正文；保存时调用 \`updateDeliverable(id, patch)\`，保留 \`id\`、\`productId\`、\`taskId\`。
- 删除：打开应用内确认对话框，确认后调用 \`deleteDeliverable(id)\`，关闭预览；取消不改变数据。
- 新增：继续使用同一弹窗，保持现有校验。
- 查看：富文本在沙箱 iframe 中预览；钉钉文档使用已有新窗口/iframe 能力。

交付物删除只删除共享 \`deliverables\` 中对应记录，因此资料包和产品进度会同时更新，不维护第二份任务附件状态。

## 错误处理

- 仅识别明确的重复 \`sourceId\` 错误，避免把权限、网络和参数错误误判为可恢复冲突。
- 查询失败或找不到远端记录时返回原错误详情，保留现有“同步失败”和重试入口。
- 编辑交付物时继续校验名称、钉钉文档域名和富文本可见内容。
- 删除交付物要求二次确认，避免误删。

## 测试与验收

### 自动化测试

- 创建返回重复 \`sourceId\` 后能查询并恢复未完成待办。
- 未完成列表未命中时能从已完成列表恢复并更新完成状态。
- 非重复错误不触发查询。
- 重复错误但找不到同源待办时仍返回原错误。
- 产品进度页面把更新、删除回调接入交付物预览和编辑弹窗。
- 交付物编辑模式预填并保存钉钉文档或富文本。
- 删除交付物有确认步骤并调用共享删除方法。

### 正式环境

- 对现有“立项PRD同步”再次发送，钉钉不再返回重复 \`sourceId\`，平台显示“已同步”。
- 钉钉中只有一条对应核心待办，执行人、截止时间、优先级和正文保持更新后的值。
- 产品进度新增一个测试交付物，完成查看、编辑、删除闭环，资料包同步反映变化。

## 非目标

- 不改造钉钉群搜索和群成员授权。
- 不删除任何已有钉钉待办。
- 不导入非本平台 \`sourceId\` 的钉钉待办。
- 不新增独立附件表或新的持久化 API。
`,oe=`# 外部平台集成路由与平台地图设计

## 背景

项目已经接触钉钉、快麦、阿里云、Cloudflare 与多个电商和投放平台，但这些信息分散在代码、文档和历史任务中。后续开发遇到相似问题时，开发者无法稳定判断应该先查看哪个平台、哪些公开文档、哪些内部控制台以及哪些关联能力。

本设计把外部平台知识从被动文档升级为可执行的项目治理能力，并在应用说明书中提供所有员工可见的平台地图。

## 目标

- 用一份可机读公开注册表描述平台、状态、能力、关键词、代码边界和依赖关系。
- 让 Codex、分支开发、PR 模板和 CI 使用同一个事实源。
- 在说明书中展示可搜索、可筛选、可追溯的平台地图。
- 将内部控制台、账号主体、负责人和运行手册存入登录后才能读取的 D1 覆盖层。
- 不在仓库或内部资料层保存密钥、令牌、Cookie、密码和私钥。

## 非目标

- 本期不直接调用计划中平台的 API。
- 本期不替代各平台官方文档、控制台或密钥管理系统。
- 本期不自动部署、不更改远端分支保护规则，也不发送真实钉钉动作。

## 单一事实源

\`docs/platform/integration-registry.json\` 是公开集成事实的唯一来源。每个平台包含：

- 稳定 ID、中文名称、状态与状态证据。
- 业务能力、常见问题、提示词关键词。
- 相关代码路径、环境变量名和外部域名。
- 官方公开文档链接。
- 与其他平台或系统边界的关系。

状态只能是 \`connected\`、\`integrating\`、\`planned\`、\`retired\`。初始状态为：

- 已连接：钉钉、快麦、Cloudflare Pages、Cloudflare D1。
- 集成中：阿里云、ERP/文件导入。
- 计划中：淘宝、拼多多、小红书、巨量引擎/千川。
- 已停用：暂无。

计划中平台不能被描述为已经可用；集成中平台必须给出仓库内证据；已停用平台默认禁止新增依赖，除非 ADR 明确批准。

## 路由行为

路由器从三类证据识别平台：

1. 任务文本命中平台关键词或能力词时给出建议。
2. 变更代码路径命中注册表路径时判定为必须声明的影响。
3. 新增外部域名、环境变量或平台 API 路由时提示补充注册表或候选平台。

匹配后展开一层相关平台。例如快麦销售数据会关联 Cloudflare D1 和 \`/api/sales\`；产品任务与待办会关联钉钉开放平台。多个候选无法唯一判断时，路由器展示候选和命中证据，不静默选择。

项目技能 \`.agents/skills/integration-router/SKILL.md\` 规定开发前必须读取注册表并输出平台候选、状态、依据、必读文档和限制。

## 分支与 CI 约束

- 新分支从最新 \`main\` 创建；旧分支合并前更新 \`main\`。
- \`AGENTS.md\` 要求涉及外部平台的工作先运行路由预检。
- PR 正文使用机器可读字段：

  \`\`\`text
  Integration-Impact: dingtalk, cloudflare-pages
  Integration-Impact-Reason: 调整钉钉登录回调并更新 Pages Functions 路由
  \`\`\`

- 没有影响时写 \`Integration-Impact: none\`，并提供原因。
- CI 总是验证注册表；PR 中代码路径命中平台时，缺少声明、漏报平台、未知平台或空原因会阻断 \`quality\`。
- 纯关键词命中只提醒，不阻断；路径命中才强制声明。

## 公开与内部数据边界

公开注册表可进入公开仓库，包含规则、能力、状态、代码边界和官方文档。内部 D1 覆盖层按平台 ID 保存：

- 控制台 URL。
- 账号主体、应用/实例/店铺名称。
- 环境名称与安全说明。
- 负责人、权限申请路径、内部运行手册。
- 最近验证时间。

内部层采用字段白名单，额外字段一律拒绝。无论公开或内部层都不允许密钥、令牌、密码、Cookie、私钥或原始敏感响应。审计记录只保存操作者、平台 ID、时间和变更字段名，不保存字段旧值或新值。

## API 与权限

新增 \`/api/platform/v1/integrations\`：

- \`GET\`：任意已登录员工可读取内部覆盖层。
- \`PUT\`：仅总经办平台管理员可编辑单个平台资料。
- 未登录返回 401，越权写入返回 403，D1 未绑定返回 501。
- API 响应不包含任何凭据；请求采用字段白名单、长度和 URL 校验。
- 表不存在时路由按幂等 DDL 建表，写入使用 UPSERT，并写入字段级审计。

前端内部 API 失败时仍展示公开注册表，并明确标注“内部资料暂不可用”。

## 说明书交互

左侧“平台能力”增加“外部平台地图”。页面沿用现有说明书框架，主体包含：

- 关键词搜索，覆盖平台名、能力和常见问题。
- 状态筛选与状态计数。
- 高密度平台列表，显示状态、能力摘要与命中关系。
- 选中平台的关系链、公开文档和内部资料。
- 有权限用户使用页面内编辑区维护内部资料；普通员工只读。
- 内部资料缺失时说明需要补充什么，而不是显示空白卡片。
- 资料超过约定周期未验证时显示陈旧提醒。

响应式布局在窄屏改为单列，保证钉钉 WebView 内搜索、筛选、列表和详情均可键盘操作，并保留清楚的焦点状态。

## 数据流

\`\`\`mermaid
flowchart LR
  R["公开集成注册表"] --> S["integration-router 技能"]
  R --> C["PR / CI 影响检查"]
  R --> U["说明书平台地图"]
  D["D1 内部覆盖层"] --> A["认证与权限 API"]
  A --> U
  U --> F["公开资料降级展示"]
\`\`\`

## 验证

- 注册表：JSON 可解析、ID 唯一、状态合法、关系存在、字段符合公开白名单、无敏感模式。
- 路由器：关键词、路径、关系扩展、多候选和未知平台均有测试。
- CI：正确声明通过；缺失、漏报、未知 ID、\`none\` 无原因失败。
- API：认证、读取权限、写入权限、字段校验、D1 不可用、UPSERT 和审计均有测试。
- UI：搜索、状态筛选、公开/内部合并、降级、陈旧提示和编辑权限有可执行测试或浏览器验证。
- 完成前运行 lint、治理检查、全部测试、构建与真实页面视觉审计。

## 回滚

前端页面、API 路由、CI 脚本和注册表可在同一提交范围内回退。新增 D1 表为旁路数据，不改变现有业务表；回滚应用时可以保留表，不影响旧版本。若 CI 误报，可先回退工作流中的集成检查步骤，同时保留注册表和测试用于修复。
`,re=`# 产品规划卡片跳转产品进度设计

## 目标

产品规划页顶部的已立项产品卡片支持整卡点击，直接打开该产品的“产品进度”。

## 交互规则

- 有 \`productId\` 的产品卡片整卡可点击，并显示可点击的指针与键盘焦点样式。
- 点击卡片时，通过应用现有的 \`openProgress(productId)\` 导航能力跳转，确保目标产品被显式选中。
- 按 Enter 或 Space 也可以触发跳转。
- 卡片右侧日历按钮保留原有“安排规划”操作；点击按钮时阻止事件冒泡，不触发进度跳转。
- 尚未立项、没有 \`productId\` 的需求机会不可跳转，继续只提供规划安排能力。

## 组件边界

- \`App.jsx\` 向 \`ProductPlanningPage\` 注入 \`onOpenProgress\`。
- \`ProductPlanningPage\` 将跳转回调传递给 \`PlanningDemandTray\`。
- \`PlanningDemandTray\` 根据 \`productId\` 决定卡片是否具备点击和键盘交互。

## 验证

- 源码契约测试覆盖回调传递、产品 ID 跳转、键盘操作和日历按钮阻止冒泡。
- 浏览器验证整卡点击跳转到 \`#progress\` 且目标产品保持选中。
- 浏览器验证点击日历按钮仍打开规划弹窗，不发生页面跳转。
`,le=`# 公司级平台能力与说明书中心设计

## 1. 背景

\`product-flow-system\` 已经从单一产品流程工具扩展为公司经营与产品协同平台，并开始承载钉钉组织、权限、产品生命周期、销售数据和外部平台连接。后续还会有其他公司内部系统复用其中的组件、认证、组织、权限和数据能力。

当前风险不是功能不足，而是产品规则、设计规范、通用组件、中间件和 API 契约分散在代码、测试和沟通记录中。不同分支或不同 AI 会话容易重复设计、改变口径或绕开既有边界。

## 2. 目标

1. 在应用左侧增加“说明书”，成为所有已登录公司人员可见的共同知识入口。
2. 在仓库中建立产品、设计、功能 PRD、组件、中间件、API 和架构决策的唯一事实来源。
3. 将当前共享能力整理为可复用、可测试、可演进的平台边界，但不立即拆成独立微服务。
4. 通过仓库规则、自动检查和 PR 门禁，确保所有开发分支遵守同一套规则。
5. 建立适合 AI coding 的规格驱动流程，使需求、设计、实现和验收可以相互追溯。

## 3. 非目标

- 本阶段不建设在线文档编辑器。
- 本阶段不把现有 API 全量改写或一次性迁移到微服务。
- 本阶段不抽取没有第二个真实调用方的通用包。
- 不在应用中保存一份与仓库 Markdown 重复的文档内容。
- 不允许文档中心绕过现有登录保护对公网匿名开放。

## 4. 方案选择

采用“仓库内文档为唯一来源、应用内构建时读取、共享能力先模块化后抽取”的方案。

相比只做静态说明页，该方案能让文档与代码一起评审、测试和版本化。相比立即建立独立中台，该方案保留清晰的平台边界，同时避免在真实复用需求出现前承担服务拆分、部署和兼容成本。

## 5. 信息架构

### 5.1 应用导航

公司版和产品版左侧导航都增加“说明书”。公司版放在“平台”分组，产品版放在“问题反馈”之前。所有已登录人员可见，不新增部门级隐藏规则。

说明书页面采用三栏结构：

- 左侧：文档分类和文章列表。
- 中间：正文、面包屑、更新时间和适用对象。
- 右侧：当前文章章节目录；窄屏时折叠到正文顶部。

默认进入“员工使用手册”。支持标题和摘要搜索、分类筛选、空结果提示以及可复制的文档深链接。

### 5.2 内容分类

1. **员工使用手册**：系统介绍、登录权限、公司经营功能、产品全周期功能、常见问题。
2. **产品与设计**：产品总说明、业务流程、角色权限、PRD、设计书、设计系统、更新记录。
3. **平台能力**：总体架构、通用组件、中间件、API 目录、外部平台适配、错误码和架构决策。

### 5.3 仓库目录

\`\`\`text
PRODUCT.md
DESIGN.md
AGENTS.md
docs/
  handbook/
  product/
  features/<feature>/
    prd.md
    design.md
    plan.md
    tasks.md
  platform/
    architecture.md
    components.md
    middleware.md
    api-catalog.md
    integrations.md
    error-codes.md
  decisions/
  templates/
\`\`\`

Markdown 是内容源。应用通过显式目录清单加载允许展示的文件，不扫描或展示任意仓库文件。文档元数据包含标题、摘要、分类、排序、适用对象、更新时间和稳定 slug。

## 6. 平台能力分层

### 6.1 通用 UI 组件

\`src/ui\` 继续作为本应用的设计系统实现层。组件进入通用目录前必须满足：

- 至少有两个真实使用场景，或者属于基础控件。
- API 使用业务无关的语义，不包含具体部门或产品文案。
- 覆盖 default、hover、focus、active、disabled、loading、error 和 empty 等适用状态。
- 满足键盘操作、焦点管理、WCAG AA 和钉钉 WebView 约束。
- 有组件测试、使用示例、兼容说明和明确的废弃路径。

第二个公司系统出现后，再将稳定组件抽为独立 workspace package；在此之前保持源码边界清晰，不提前发布包。

### 6.2 中间件

认证、权限、请求校验、异常映射、日志、幂等和外部平台调用等横切能力必须通过明确的中间件边界提供。每个中间件文档记录输入、输出、执行顺序、副作用、超时、重试、幂等、日志字段和测试方式。

中间件必须保持单一职责。业务路由不得复制认证、错误格式或外部请求重试逻辑；共享中间件也不得包含具体页面流程判断。

### 6.3 中台 API

现有 API 先登记为内部接口并补齐契约和测试，不进行大爆炸式迁移。新建、确实面向多个系统的共享接口使用版本化路径 \`/api/platform/v1/...\`。

API 目录至少记录：

- 路径、方法、用途、负责人和调用方。
- 请求、响应、认证、权限和数据口径。
- 分页、幂等、错误码、超时、限流和重试约束。
- 当前版本、兼容策略、废弃时间和迁移说明。
- 外部依赖、可观测字段和对应契约测试。

## 7. 功能开发文档

中等以上功能使用独立目录维护 \`prd.md\`、\`design.md\`、\`plan.md\` 和 \`tasks.md\`。

- PRD 只说明问题、目标、非目标、用户、流程、业务规则、数据口径和验收标准。
- 设计书说明信息层级、交互流程、组件复用、页面状态、响应式、文案和无障碍。
- 计划说明实现边界、文件、契约、迁移、风险、回滚和验证步骤。
- 任务清单必须可独立完成、测试、暂停和恢复。

功能上线后，长期有效的产品规则回写 \`PRODUCT.md\` 或 \`docs/product/\`，长期有效的设计规则回写 \`DESIGN.md\`，重大技术决定写入 ADR。

## 8. 跨分支强制治理

不同分支是否遵守规则不能依赖开发者记忆或本机 Skill，采用以下三层约束。

### 8.1 仓库规则层

- 根目录 \`AGENTS.md\` 纳入版本控制，定义目录职责、依赖方向、禁止事项、测试命令和完成标准。
- 必要时在 \`src/ui\`、\`functions/api\` 等高风险目录增加更具体的嵌套 \`AGENTS.md\`。
- PRD、设计书、API 和 ADR 模板统一放入仓库。
- 项目 Skill 只引用仓库规则，不复制可能漂移的业务事实。

新分支从主分支创建时自动继承这些规则。规则更新后，未合并分支必须同步最新主分支才能通过合并门禁。

### 8.2 自动检查层

GitHub Actions 对每个 PR 强制执行：

1. lint 和格式检查。
2. React、领域和 API 测试。
3. 生产构建。
4. 架构边界检查，例如禁止 feature 直接调用外部平台、禁止 API 路由复制认证实现。
5. 文档检查，例如新增复杂功能必须存在对应 PRD/设计/计划，新增共享 API 必须登记目录。
6. Markdown 链接、元数据和说明书构建检查。

本地 Git hook 只用于提前反馈，不作为最终保障；CI 是不可绕过的最终判定。

### 8.3 合并治理层

- 主分支开启保护，禁止直接推送。
- PR 必须通过全部 required checks。
- PR 必须在合并前同步最新主分支。
- \`AGENTS.md\`、平台契约、权限、认证和数据库结构变化要求 CODEOWNERS 审查。
- PR 模板要求关联 PRD/设计/ADR，并说明测试、兼容影响、回滚方式和文档更新。
- 单个 PR 保持一个目的；非机械性大改需要拆分为可独立验证阶段。

这样，即使使用不同分支、不同开发者或不同 AI 工具，只要最终需要合并进主分支，就必须经过同一套仓库规则和自动门禁。

## 9. 项目 Skill

建立三个轻量项目 Skill：

1. **feature-workflow**：研究现状、生成 PRD/设计/计划/任务、测试驱动、小步实现。
2. **verification**：执行测试、构建、UI 冒烟和本地/Cloudflare/钉钉环境边界检查。
3. **platform-capability-review**：判断是否应该抽象，检查组件、中间件、API 契约、兼容性和目录登记。

Skill 是标准流程助手，不是治理真相。任何 Skill 与仓库 \`AGENTS.md\`、CI 或契约冲突时，以仓库和 CI 为准。

## 10. 错误处理与可观测性

- 文档加载失败时显示明确中文错误和可重试入口，不让整个应用崩溃。
- 文档清单中不存在的 slug 返回说明书内的“文档不存在”，不渲染任意路径。
- API 使用统一错误结构和可追踪请求 ID。
- 外部平台适配记录来源、耗时、结果和可安全展示的错误摘要，不记录密钥或敏感响应。
- 关键中间件和共享 API 必须有失败路径、超时和重试测试。

## 11. 验收标准

1. 所有已登录用户在两套左侧导航中都能进入“说明书”。
2. 员工可以搜索并阅读使用手册；PRD、设计和平台资料也全部可见。
3. 应用展示内容来自仓库 Markdown，构建时能发现缺失文件、失效 slug 和无效元数据。
4. 当前组件、中间件、API 和外部集成都有可追溯目录。
5. 一个示例功能完整走通 PRD、设计、计划、任务和验收流程。
6. PR 在测试、构建、架构或文档检查失败时无法满足合并条件。
7. 新共享 API 和通用组件具备契约、测试、负责人和兼容说明。
8. 说明书页面通过键盘、窄屏、真实笔记本宽度和钉钉 WebView 验收。

## 12. 分阶段实施

### 阶段一：知识与治理底座

完善 \`AGENTS.md\`，建立文档目录、模板、说明书页面、导航、搜索、测试和基础 CI。

### 阶段二：平台能力盘点

登记现有组件、中间件、API 和外部集成，补齐契约、错误码、负责人、测试和架构检查。

### 阶段三：真实复用

当第二个公司系统出现真实调用需求时，根据已稳定的契约抽取 workspace package 或独立服务，并通过 ADR 记录边界、迁移和兼容策略。
`,ce=`# 产品分级规则与 GMV 边界设计

## 背景

产品定级已经从单一等级输出调整为三个独立结论：产品等级、风险等级和推进方式。风险用于提高管理强度，不再直接降低产品等级；资源投入只由 C1 开发周期与资源评分决定，C2 风险核查不再计入资源投入分。

本次调整的主要工作是把年 GMV 贡献参考范围明确为可执行的数值区间，并修正 600 万边界。当前实现使用单一 \`max\` 和严格小于比较，导致年 GMV 正好为 600 万时错误进入“＞600万”。

## 已确认业务规则

### 三项独立输出

定级结果继续分别展示：

1. 产品等级：\`P0 战略级\`、\`P1 增长级\`、\`P2 验证级\`、\`P3 常规级\`或\`O级储备\`。
2. 风险等级：低风险、中风险或高风险。
3. 推进方式：根据产品等级、资源投入和风险强度得出，例如\`分阶段推进\`或\`缩小验证\`。

高风险不降低产品等级。高风险产品提高管理强度、增加风险预案和阶段闸门，必要时缩小验证或上提评审。

### 资源与风险分离

- C1 开发周期与资源单独决定资源投入分和高、中、低投入档位。
- C2 风险核查单独决定风险分和风险等级。
- C2 不参与资源投入分计算。
- 产品价值分仍由 A 战略价值、B1 年 GMV 贡献和 B2 商业综合价值组成。

### 年 GMV 贡献区间

年 GMV 由平均月 GMV 乘以 12 得出，按以下区间映射：

| 年 GMV | 分值 | 展示文案 |
|---|---:|---|
| \`0 < GMV < 30万\` | 1 | \`＜30万\` |
| \`30万 ≤ GMV < 100万\` | 2 | \`30-100万\` |
| \`100万 ≤ GMV < 300万\` | 3 | \`100-300万\` |
| \`300万 ≤ GMV ≤ 600万\` | 4 | \`300-600万\` |
| \`GMV > 600万\` | 5 | \`＞600万\` |

平均月 GMV 缺失、非数字或不大于零时仍返回无建议分值，不进入任何档位。

## 设计方案

### 显式区间模型

GMV 档位不再只依赖一个严格小于的 \`max\`。每个档位显式表达上下界及边界包含关系，由一个区间匹配函数选择档位。这样业务文案与计算条件能够直接对应，尤其能准确表达第四档包含 600 万、第五档严格大于 600 万。

区间匹配只负责返回分值和标签，不改变平均月 GMV 标准化、年化计算或其他定级逻辑。

### 现有分级逻辑保持不变

以下已经正确的行为不在本次修改范围内：

- 高风险不降低产品等级。
- C1 资源投入和 C2 风险核查分开计算。
- 产品等级、风险等级、推进方式三项独立展示。
- 高风险 P0/P1 使用分阶段推进，高风险 P2/P3 使用缩小验证。
- O级储备及一票规则。

### 数据兼容

无需迁移历史产品数据。系统保存的是平均月 GMV 和定级答案，建议分值在读取或编辑时实时计算。修改区间后，历史记录会按新边界自然得到正确结果。

## 界面影响

定级弹窗继续使用现有五档文案，不增加新控件。只有正好落在边界上的建议分值会改变，其中 600 万从第五档修正为第四档。三项结果卡片与风险管理说明保持现状。

## 测试与验收

新增或扩充分级 GMV 测试，至少覆盖：

- 30 万以下、正好 30 万和略高于 30 万。
- 正好 100 万及相邻值。
- 正好 300 万及相邻值。
- 略低于 600 万、正好 600 万和略高于 600 万。
- 缺失、非数字、零和负数输入。

同时保留现有风险分离和三项输出测试，确保 GMV 边界修改不会重新把 C2 风险计入资源投入，也不会改变产品等级降级规则。

验收标准：

1. 正好 600 万返回分值 4 和\`300-600万\`。
2. 只有大于 600 万才返回分值 5 和\`＞600万\`。
3. 其他四个档位的上下边界符合已确认区间。
4. 全部分级、共享状态和界面回归测试通过。

## 不在本次范围

- 不调整产品等级价值分阈值。
- 不调整风险项权重或风险等级阈值。
- 不调整不同等级的推进方式映射。
- 不修改历史定级记录结构。
- 不改变产品定级弹窗的视觉布局。
`,de=`# 产品负责人识别与“我负责”标识设计

## 目标

让登录后的产品负责人快速识别自己负责的产品，同时不限制其查看其他产品，也不改变现有产品流程和权限。

## 负责人数据来源

产品负责人继续从立项阶段现有的组织架构人员选择器中选择，不新增自由输入入口。

- 保存负责人时记录组织成员姓名，并在可取得时同时记录用户 ID 和 union ID。
- 判断“我负责”时优先比较组织用户 ID，其次比较 union ID，最后用姓名兼容历史产品数据。
- 当前登录人继续由登录会话与组织架构缓存解析，负责人变更后所有页面立即使用同一份产品数据更新标识。
- 不根据登录人的职位文案硬编码判断；只要当前登录人的组织身份与产品负责人对应，就视为“我负责”，兼容“产品经理”和“产品负责人”等职位名称。

## 产品进度进入规则

- 从侧边栏直接进入产品进度时，如果当前登录人负责至少一个产品，默认打开其负责产品中的第一项。
- 从总览、产品档案或其他明确指定产品的入口进入时，保留用户主动选择的产品，不自动切换。
- 产品下拉列表中，当前登录人负责的产品稳定排在前面；同一组内保持原有产品顺序。
- 用户仍可切换并查看其他负责人名下的产品。

## 页面标识

统一使用紧凑的“我负责”标签，放在产品名称之后，不使用整卡背景高亮，避免与产品状态、等级和排期状态混淆。

- 产品下拉：当前选中区和下拉选项中的自有产品显示标签。
- 产品档案：产品卡片标题旁显示标签；列表顺序和筛选行为保持不变。
- 产品规划：待规划产品和年度规划时间轴中的自有产品显示标签；规划顺序保持不变。
- 标签使用现有主色的浅色背景、清晰文字和完整圆角，并提供可读文本，不能只靠颜色表达。

## 实现边界

新增独立的产品负责人匹配与稳定排序函数，供各页面复用；新增一个轻量的共享标签组件，避免多个页面各自实现不同样式。产品规划只补充负责人关联数据和展示，不修改现有排期计算、拖拽或编辑规则。

本次不新增“只看我负责”筛选、不改变产品权限、不重排产品档案或产品规划，也不自动修改历史产品负责人。

## 验证

- 领域测试覆盖用户 ID、union ID、历史姓名回退、非本人产品和稳定排序。
- 交互测试覆盖侧边栏直达时默认选择本人产品，以及指定产品入口不被自动覆盖。
- 页面测试确认产品下拉、产品档案、待规划区和年度规划时间轴均使用统一“我负责”标识。
- 运行 React 全量测试和生产构建。
- 在 1440px、1024px 和窄屏宽度检查标签与产品名称、状态、等级之间的对齐、换行和溢出。
`,pe=`# 战略数据与安全 CRUD 设计

## 目标

把《提野星2026年重点工作》转成经营执行平台的结构化数据，并为战略执行相关页面补齐可用、可审计的新增、查看、编辑和删除能力。

## 文档数据模型

文档中的年度重点工作按三层进入平台：

1. 公司战略：组织建设、鸟类销量突破、仓鼠品牌升级。
2. 必达结果：描述战略怎样才算达成，包含验收标准、责任部门和截止日期。
3. 部门承诺：品牌部与运营部围绕公司战略拆解的年度或季度重点工作，并使用里程碑跟踪。

三大战略及主要验收口径：

- 组织建设：岗位职责和跨部门边界清晰；专项会议形成纪要并持续追踪；审批流在 2026 年 8 月完成优化；周会和月度例会稳定运行；AI 表格和知识库形成初步稳定的数据资产机制。
- 鸟类销量突破：2026 年 12 月鸟类单月实付 GMV 达到 100 万元；鸟类重点运营和渠道打法形成可复用机制。
- 仓鼠品牌升级：2026 年 9 月前各平台内容视觉统一并传达品牌核心概念；平台排名提升或至少不下降；品牌理念进入日常会议和经营决策依据。

品牌部重点工作拆成部门承诺：部门协作流程、品牌核心概念、鸟类和仓鼠 IP、信息流素材迭代、线下店品牌与私域。运营部重点工作拆成部门承诺：数据记录机制、鸟类重点运营、渠道打品方法论和平台排名目标。

## 数据迁移

平台数据版本从 \`strategy-platform-v2\` 升级为 \`strategy-platform-v3\`。

- 使用稳定 ID 合并文档数据。
- 对 v2 中系统预置的三大战略和对应预置结果更新文档口径，同时保留执行状态、创建时间和审计记录。
- 新增文档中缺失的必达结果、部门承诺和里程碑。
- 保留用户创建的其他记录，不按名称去重，也不覆盖 v3 之后的用户编辑。
- 迁移完成后由现有平台同步机制写回 D1，后续加载不重复迁移。

## CRUD 规则

界面中的“删除”默认是软删除：记录写入 \`archived: true\`、更新时间、操作者和原因，并写入审计日志。列表和下拉框默认不展示已归档记录。

| 对象 | 新增 | 查看 | 编辑 | 删除或归档规则 |
| --- | --- | --- | --- | --- |
| 公司战略 | 总经办 | 总经办 | 总经办 | 总经办可归档；同时归档其必达结果；存在执行中的部门承诺或重点项目时阻止并提示 |
| 必达结果 | 总经办 | 总经办 | 总经办 | 总经办可归档 |
| 部门承诺 | 部门负责人、总经办 | 总经办 | 草稿/退回状态由负责人编辑 | 草稿或退回状态可归档；执行中使用取消流程 |
| 承诺里程碑 | 随部门承诺维护 | 总经办 | 随部门承诺维护 | 编辑承诺时移除的里程碑归档，保留历史 |
| 重点项目 | 部门负责人、总经办 | 总经办 | 项目负责人、总经办 | 可归档；同时归档项目里程碑、风险和决策事项 |
| 项目里程碑 | 项目详情 | 总经办 | 项目详情 | 可归档 |
| 风险 | 项目详情 | 总经办 | 项目详情 | 可归档 |
| 决策事项 | 项目详情 | 总经办 | 项目详情 | 可归档；已同步钉钉的记录保留同步信息 |
| 激励项目 | 部门负责人、总经办 | 总经办 | 草稿或执行中可编辑 | 草稿可归档；执行中先取消；已结项不可删除 |
| 月度汇报 | 总经办按月生成 | 相关负责人、总经办 | 草稿或退回状态可编辑 | 草稿可归档；已提交、审核、冻结记录不可删除 |
| 周度状态 | 负责人 | 总经办 | 提交人可编辑未进入月度快照的记录 | 提交人或总经办可归档；已进入快照的数据不回写历史快照 |
| 月度快照 | 月度会议生成 | 总经办 | 不可编辑 | 不可删除，只能追加后续快照 |

## 交互设计

- 战略中心增加“新建战略”；每张战略卡提供编辑和删除；每条必达结果提供编辑和删除。
- 部门承诺、重点项目、激励项目列表在操作区提供编辑和删除/取消。
- 项目详情中的里程碑、风险和决策事项提供一致的编辑和删除入口。
- 月报草稿提供删除；冻结记录保留现有追加更正流程。
- 周度确认记录提供编辑和删除，使用同一个状态填写弹窗。
- 所有危险操作使用现有 \`ConfirmDialog\` 二次确认，提示关联数据影响；失败时在当前页面显示明确原因。
- 删除后关闭编辑或详情弹窗，列表立即刷新；同步失败沿用现有本地保存和错误提示。

## 状态与审计

领域 reducer 新增受控归档动作，不允许界面直接修改数组：

- \`archive_strategy\`
- \`archive_required_result\`
- \`archive_department_commitment\`
- \`archive_project\`
- \`archive_project_child\`
- \`archive_incentive_project\`
- \`archive_monthly_report\`
- \`archive_status_update\`

每个动作验证对象状态和依赖关系，成功后写入 \`auditLogs\`。不满足规则时抛出中文业务错误，由界面展示。

## 测试与验收

- 领域测试覆盖 v2→v3 迁移、幂等迁移、用户数据保留、各类归档成功和禁止场景、级联归档与审计日志。
- UI 结构测试覆盖所有核心对象的新增、编辑、删除入口及确认弹窗。
- API 与平台持久化测试确认归档字段和 v3 数据能保存、重新加载。
- 浏览器验收覆盖：新增并编辑战略、删除必达结果、归档无依赖战略、编辑/删除部门承诺、归档重点项目、取消激励项目、删除草稿月报，以及刷新后数据仍存在。
- 完成后运行全部 React 测试、API 测试和生产构建。

## 范围边界

- 不改动“产品全周期”App 的现有 CRUD。
- 不物理删除 D1 中的战略执行记录。
- 不修改冻结月报和历史快照的不可变规则。
- 不在本轮增加回收站或归档恢复界面；归档记录仍保留在数据和审计日志中。
`,ue=`# 战略必达结果下钻与部门任务进度设计

## 目标

让老板在公司战略视图中从“战略”继续下钻到“必达结果 → 部门任务 → 月度里程碑”，直接看到每项结果由哪些部门承接、当前完成多少、下一步是什么以及是否存在风险。

## 方案比较

1. **必达结果行内展开（采用）**：点击结果行后在其下方展开关联部门任务。上下文连续，适合连续检查多个战略；不新增页面和弹窗。
2. 独立结果详情页：可承载更多信息，但会打断老板逐项扫描，现阶段信息量不足以支撑独立页面。
3. 右侧抽屉：保留列表上下文，但窄屏和密集任务下可读性差，也会增加新的交互层级。

## 数据关系

- 部门任务继续使用现有 \`departmentCommitments\` 业务实体，不新建重复模型。
- 每条部门任务新增必填字段 \`requiredResultId\`，同时保留 \`strategyId\`。
- \`requiredResultId\` 必须指向同一 \`strategyId\` 下、未归档的必达结果。
- 已有文档种子任务按业务含义映射到具体必达结果；未知的历史自建任务不猜测关联，保留原数据并在部门任务列表标记“待关联必达结果”，编辑时要求补齐。
- 平台状态升级为 \`strategy-platform-v4\`。v2 先沿用现有 v3 文档迁移，再补充 v4 关联；v3 仅添加关联字段，不覆盖用户后续修改。

## 进度口径

- 部门任务进度自动计算：\`已完成且未归档的里程碑数 ÷ 全部未归档里程碑数\`。
- 百分比四舍五入取整；0/0 显示 \`未设置里程碑\` 和 0%，不允许手填。
- 任务状态与进度分开呈现：状态描述审批/风险流程，进度描述交付完成度。
- 展开区展示每个里程碑的名称、负责人、截止日期和完成状态。
- 总经办、部门任务负责人或里程碑负责人可以勾选完成或重新打开里程碑。更新继续走现有 \`saveCommitmentMilestone\` 审计写入。

## 交互设计

### 必达结果行

- 整行成为可点击的展开按钮，保留现有编辑和归档图标。
- 编辑、归档按钮必须阻止行点击，避免误展开。
- 行尾显示关联部门任务数量与展开箭头；使用 \`aria-expanded\` 和可访问名称。
- 同一时间仅展开一个必达结果，减少长页面噪音；再次点击收起。

### 展开区

- 直接位于该必达结果下方，不使用嵌套卡片或弹窗。
- 每个部门任务展示：任务名称、责任部门、负责人、状态、百分比进度、已完成/总里程碑数、下一未完成里程碑、最终截止日期。
- 进度条使用原生 \`role="progressbar"\` 语义，颜色仅反映正常、风险和偏离状态。
- 展开任务后继续展示紧凑的里程碑清单与完成勾选。
- 无关联任务时显示教学型空状态，并提供“添加部门任务”入口；入口预填当前战略和必达结果。

### 部门任务列表与编辑器

- “新建/编辑部门任务”增加“关联必达结果”选择框，根据已选战略过滤。
- 切换战略时清空不属于该战略的 \`requiredResultId\`。
- 列表增加进度列，替代目前信息不足的纯状态判断；同时显示具体必达结果名称。
- 新建和编辑必须校验必达结果；历史未关联任务仍可读取，但保存前必须补齐。

## 错误与边界

- 被归档的战略、必达结果、部门任务和里程碑不参与关联或进度。
- 删除必达结果时，如仍有未归档部门任务关联，则阻止归档并提示先迁移或归档部门任务，避免产生孤儿数据。
- 里程碑更新失败时沿用页面现有 \`inline-alert\`，不提前改变可见进度。
- 所有现有审批、退回、风险、完成、归档和审计规则保持不变。

## 验收标准

1. 每个必达结果可点击展开和收起，并显示正确的关联部门任务。
2. 已有八条文档部门任务均能映射到合理的必达结果。
3. 部门任务进度严格由未归档里程碑计算，完成/重新打开里程碑后立即更新。
4. 新建或编辑部门任务时只能选择当前战略下的必达结果。
5. 公司战略视图的编辑、归档、添加必达结果等现有功能不受行点击影响。
6. 部门任务总表显示关联必达结果与完成进度。
7. 归档仍有部门任务的必达结果会被阻止并给出明确提示。
8. 定向测试、全量测试、生产构建和浏览器交互验收全部通过。

`,me=`# 战略达成规则提示区精简设计

## 目标

删除战略卡片中重复展示的浅蓝色“达成规则”提示区，降低纵向占用和视觉噪音，让用户直接查看战略进度与必达结果。

## 变更范围

- 删除盾牌图标、“达成规则：全部必达结果核验通过”标题及成功标准说明。
- 删除仅服务于该提示区的 \`attainment-rule\` 样式。
- 保留战略标题、战略意图、已核验数量、达成状态、必达结果和增删改查操作。
- 保留 \`strategyAttainment\` 计算与 \`successStandard\` 数据，不改变业务规则或历史数据。

## 验收标准

- 战略卡片标题下方直接进入必达结果列表，不再出现浅蓝色提示区。
- 战略达成数量与状态仍正确显示。
- 战略新增、编辑、归档及必达结果操作不受影响。
- 前端测试与生产构建通过，并在本地测试页完成视觉验收。
`,_e=`# 供应链管理主导航设计（纠正版）

日期：2026-07-17

## 背景与纠正

供应链管理的八个工作台必须像“产品全周期”下的产品总览、需求池、产品规划等入口一样，直接出现在系统最左侧主导航。页面内容区不再放置第二列导航。

## 信息架构

在公司平台主导航中新增与“产品全周期”同级的分组“供应链管理”，分组下依次显示：

- 供应链总览
- 供应商管理
- 采购与付款
- 产品供应链
- 库存盘点
- 质量管理
- 同步记录
- 设置

原“业务 Apps”分组下的单个“供应链管理”入口移除。旧链接 \`#supply-chain\` 兼容跳转到 \`#supply-overview\`。

## 交互与路由

- 八个入口使用独立 hash 路由，刷新后保留当前工作台。
- 当前入口沿用主导航的蓝色选中背景和 \`aria-current="page"\`。
- 供应链页面由路由传入 section，只渲染对应工作台，不在组件内维护导航状态。
- 页面保留现有标题、返回业务 Apps 操作、权限计算、数据加载和业务组件。

## 权限

八个路由统一复用原 \`supply-chain\` 导航权限和 \`supplyChain\` 功能权限，不新增八套权限配置。无权限用户看不到任何供应链入口，也不能通过 hash 打开供应链页面。

## 响应式

供应链入口完全复用现有全局侧栏的桌面和移动端行为。移动端由全局侧栏负责横向滚动，不再维护供应链专属导航断点。

## 不在本次范围

- 不修改供应商、采购付款、产品映射、库存资金、库存盘点或质量管理的数据规则。
- 不修改钉钉、ERP、快麦或导入接口。
- 不部署线上版本。

## 验收

- 最左侧出现“供应链管理”分组和八个入口，顺序正确。
- 页面内部二级导航及其样式文件被删除。
- 八个入口切换、刷新、选中状态和权限均正确。
- 旧 \`#supply-chain\` 链接进入供应链总览。
- React 全量测试、API 全量测试和 Vite 构建通过。
- 1440px、1024px、390px 浏览器检查无文档级水平溢出和控制台错误。
`,Ae=`# 供应链管理 App 设计

## 目标

在现有经营执行平台中增加一个独立的“供应链管理”业务 App，让供应链、财务、质量管理、产品与总经办围绕同一套产品数据完成供应商管理、采购付款同步、库存资金核算、库存盘点校准和质量问题闭环。

一期以可审计的数据闭环为目标，不替代钉钉审批、快麦 ERP 或店铺后台。钉钉继续负责采购与付款审批，快麦/ERP 继续提供销售成本和库存账面数据，供应链 App 负责归集、关联、计算、异常处理和跨部门查看。

## 已确认的业务口径

1. 供应链管理作为现有“业务 Apps”中的独立 App 嵌入经营执行平台，复用现有登录、组织权限、产品档案、69 码、销售成本和共享数据能力。
2. 钉钉“采购申请”和“付款申请”是两个流程。付款申请使用钉钉已有的关联审批能力指向采购申请，系统以钉钉返回的关联关系为唯一事实，不按名称、供应商或金额猜测关联。
3. 一张采购申请可以关联多张付款申请，包括预付款、进度款和尾款。
4. 只有审批通过的付款申请计入采购实付；撤销、驳回或金额变更后重新计算。
5. 库存资金原始余额为：\`采购实付金额 - 按销量消耗的销售成本\`。
6. 库存资金同时支持产品和供应商维度。产品维度使用现有 SKU/69 码销售成本；供应商维度使用产品供应商关系中的物料单位成本分摊销售消耗，分摊不完整时明确显示覆盖率和待分摊金额，不生成猜测结果。
7. 库存盘点通过文件导入，按盘点日、仓库和 69 码与 ERP 库存快照核对。确认差异后生成校准调整，不覆盖付款审批、销售成本、盘点原表或 ERP 原始快照。
8. 仪表盘同时展示原始库存资金、校准调整和校准后余额；所有调整必须保留操作人、时间、原因和调整前后数值。
9. 产品差评一期通过文件导入，后期再接各店铺平台评价接口。快麦售后数据可以作为质量辅助信号，但不代替真实评价文本。
10. 质量问题必须能够关联产品、供应商、物料和导入批次，并记录责任判定、公关处理、整改措施和关闭结果。

## 方案选择

### 采用：嵌入式独立业务 App

在当前 React 应用中增加供应链 App 路由和 App 内导航，共享现有认证、产品上下文和基础 UI。供应链业务数据使用独立 D1 表和独立 API，避免继续扩大通用 \`product_flow_state\` 状态文档。

该方案既保留供应链部门的日常工作台，又能直接复用产品、销售和组织数据。相比完全独立部署，它不重复建设登录、权限和产品同步；相比只在产品档案增加字段，它能承载采购、付款、库存和质量的跨产品流程。

### 不采用：独立部署

独立项目会造成身份、产品、权限、路由和部署链重复，不符合本期目标。

### 不采用：只扩展产品档案

产品档案适合查看单个产品，但无法承载供应商部门日常管理、跨产品付款异常、盘点批次和质量问题队列。

## 信息架构

供应链 App 从“业务 Apps”中心进入。进入后显示独立 App 导航，并保留“返回经营执行平台”入口。

1. **供应链总览**：采购实付、已售成本、库存资金、校准调整、待付款、库存差异、质量风险和同步状态。
2. **供应商管理**：供应商档案、类别、联系人、账期、合作状态、合作产品、累计实付、库存资金和质量表现。
3. **采购与付款**：采购审批、关联付款、付款进度、待映射记录、同步错误和原审批跳转。
4. **产品供应链**：按产品维护包材、里料、原料、加工等供应商关系、物料、有效期和单位成本。
5. **库存盘点**：导入盘点表、读取 ERP 快照、查看差异、确认校准和查询历史批次。
6. **质量管理**：导入差评、聚类质量原因、责任判定、公关处理、整改任务和关闭记录。
7. **同步记录**：钉钉、销售成本、ERP 库存和文件导入的最近同步结果与错误。
8. **设置**：钉钉流程映射、导入字段映射、质量等级和供应商类别。

## 数据模型

### 供应商

\`Supplier\`

- \`id\`
- \`name\`
- \`code\`
- \`categories[]\`
- \`contactName\`
- \`contactPhone\`
- \`paymentTerms\`
- \`status\`: \`active | paused | archived\`
- \`notes\`
- \`createdAt\`
- \`updatedAt\`

### 产品供应商关系

\`ProductSupplierLink\`

- \`id\`
- \`productId\`: 关联现有 \`state.products.id\`
- \`supplierId\`
- \`materialCategory\`: 包材、里料、原料、加工或配置项
- \`materialName\`
- \`skuCodes[]\`
- \`unitCost\`
- \`consumptionPerSale\`
- \`effectiveFrom\`
- \`effectiveTo\`
- \`status\`

\`unitCost × consumptionPerSale × 净销量\` 用于供应商维度的已消耗成本。缺少有效成本或用量时，该部分进入待分摊，不纳入供应商余额。

### 钉钉采购审批

\`PurchaseApproval\`

- \`processInstanceId\`: 钉钉实例唯一标识
- \`processCode\`
- \`businessId\`
- \`title\`
- \`status\`
- \`originatorUserId\`
- \`approvedAt\`
- \`supplierId\`
- \`productIds[]\`
- \`approvedAmount\`
- \`rawPayload\`
- \`lastSyncedAt\`

\`PurchaseLine\`

- \`id\`
- \`purchaseProcessInstanceId\`
- \`productId\`
- \`supplierId\`
- \`materialCategory\`
- \`materialName\`
- \`skuCode\`
- \`quantity\`
- \`unitCost\`
- \`amount\`

### 钉钉付款审批

\`PaymentApproval\`

- \`processInstanceId\`
- \`processCode\`
- \`businessId\`
- \`purchaseProcessInstanceId\`: 来自钉钉关联审批组件
- \`status\`
- \`amount\`
- \`paymentType\`: 预付款、进度款、尾款或其他
- \`approvedAt\`
- \`rawPayload\`
- \`lastSyncedAt\`

同一 \`purchaseProcessInstanceId\` 可以存在多条付款记录。采购实付为全部有效、已通过付款记录的金额之和。

### 库存快照与校准

\`InventorySnapshot\`

- \`id\`
- \`source\`: \`stocktake_import | erp\`
- \`batchId\`
- \`snapshotDate\`
- \`warehouseCode\`
- \`skuCode\`
- \`productId\`
- \`quantity\`
- \`unitCost\`
- \`amount\`
- \`rawRow\`

\`InventoryAdjustment\`

- \`id\`
- \`stocktakeBatchId\`
- \`productId\`
- \`supplierId\`
- \`skuCode\`
- \`beforeAmount\`
- \`adjustmentAmount\`
- \`afterAmount\`
- \`reason\`
- \`approvedBy\`
- \`approvedAt\`

库存资金展示三项：

- 原始余额：\`采购实付 - 已售成本\`
- 校准调整：已确认盘点差异形成的调整金额
- 校准后余额：\`原始余额 + 校准调整\`

实物库存差异为：\`实盘数量 - ERP 账面数量\`。数量差异和资金差异分别展示。

### 质量问题

\`QualityIssue\`

- \`id\`
- \`importBatchId\`
- \`sourcePlatform\`
- \`sourceReviewId\`
- \`reviewedAt\`
- \`orderNo\`
- \`skuCode\`
- \`productId\`
- \`supplierId\`
- \`productSupplierLinkId\`
- \`rating\`
- \`content\`
- \`images[]\`
- \`issueCategory\`
- \`severity\`: \`low | medium | high | critical\`
- \`responsibilityStatus\`
- \`responsibilityResult\`
- \`publicResponse\`
- \`correctiveAction\`
- \`owner\`
- \`status\`: \`new | investigating | handling | monitoring | closed\`
- \`closedAt\`

导入去重优先使用平台评价 ID；没有评价 ID 时使用平台、订单号、SKU、评价时间和内容摘要组成稳定指纹。

## 存储与接口边界

供应链数据使用独立 D1 表：

- \`supply_suppliers\`
- \`supply_product_supplier_links\`
- \`supply_purchase_approvals\`
- \`supply_purchase_lines\`
- \`supply_payment_approvals\`
- \`supply_sync_runs\`
- \`supply_inventory_batches\`
- \`supply_inventory_snapshots\`
- \`supply_inventory_adjustments\`
- \`supply_quality_import_batches\`
- \`supply_quality_issues\`

现有 \`/api/state\` 继续管理产品全周期状态；现有 \`/api/sales\` 继续提供 D1 销售聚合。供应链 API 只通过产品 ID 和 SKU/69 码引用现有产品与销售数据，不复制产品主数据。

接口按业务能力拆分：

- \`/api/supply-chain/summary\`
- \`/api/supply-chain/suppliers\`
- \`/api/supply-chain/product-suppliers\`
- \`/api/supply-chain/approvals/sync\`
- \`/api/supply-chain/approvals\`
- \`/api/supply-chain/inventory/import\`
- \`/api/supply-chain/inventory/reconcile\`
- \`/api/supply-chain/inventory/adjustments\`
- \`/api/supply-chain/quality/import\`
- \`/api/supply-chain/quality/issues\`
- \`/api/supply-chain/sync-runs\`

## 钉钉审批同步

现有“产品全流程”钉钉应用已具备工作流实例读、工作流模板读和审批流数据管理权限。同步服务复用现有服务端应用凭证与访问令牌能力。

设置中保存两类审批流程的 \`processCode\` 和语义字段映射。同步适配器提供两个稳定接口：

- \`listApprovalInstances({ processCode, startTime, endTime, cursor })\`
- \`getApprovalInstance(processInstanceId)\`

同步流程：

1. 按流程和时间游标增量读取采购、付款审批实例。
2. 以 \`processInstanceId\` 幂等写入，原始响应保存到 \`rawPayload\` 供审计和兼容字段变化。
3. 从付款审批的钉钉关联审批组件提取采购 \`processInstanceId\`。
4. 采购或付款中的产品、供应商、物料无法映射时进入待映射队列；人工确认后保存映射，后续复用。
5. 只有已通过的付款计入实付；状态变化时按全部有效付款重新聚合，不做增量相加。
6. 同步支持定时执行和页面手动刷新。接口只读取审批，不在供应链 App 内同意、拒绝或修改钉钉审批。

## 销售成本与供应商分摊

产品维度已售成本沿用现有 \`/api/sales\` 数据，按产品的 SKU/69 码聚合。

供应商维度已消耗成本按有效的 \`ProductSupplierLink\` 计算：

\`供应商物料已消耗成本 = 净销量 × consumptionPerSale × unitCost\`

同一产品的供应商已消耗成本合计与 ERP 产品销售成本进行对账。页面展示分摊覆盖率和差异：

- 覆盖率 100% 且差异在允许阈值内时显示正常。
- 缺成本、缺用量或有效期冲突时显示待分摊，不计算不完整的供应商库存资金。
- 分摊合计与 ERP 销售成本不一致时保留两者并显示差异，不覆盖 ERP 原值。

## 文件导入

库存盘点和差评导入共用“选择文件 → 字段映射 → 预览校验 → 确认导入 → 结果摘要”的流程。

每次导入保存批次、原始文件元数据、成功行、错误行、操作人和时间。确认前不写业务表；导入失败不产生半批数据。重复文件或重复记录提示用户，不静默覆盖。

一期支持 \`.xlsx\`、\`.xls\`、\`.csv\`。库存盘点必需字段为盘点日、仓库、SKU/69 码和实盘数量；差评必需字段为平台、评价时间、SKU/69 码和评价内容。

## 权限

- **总经办**：查看全部供应商、采购、付款、库存和质量数据。
- **供应链**：维护供应商、产品供应关系、采购映射、库存盘点和校准。
- **财务**：查看采购申请，核对付款同步、实付金额和付款异常。
- **质量管理**：导入差评、责任判定、公关处理、整改和关闭；可看供应商质量表现，不看付款明细。
- **产品/运营**：查看自己负责产品的供应商类别、库存风险和质量摘要，不看供应商账期及完整付款金额。

后端接口必须执行同一权限规则，不能只依赖前端隐藏。

## 错误与审计

- 同步失败保留上次成功数据，显示最后成功时间、失败时间和明确错误。
- 无法映射的审批进入待映射，不自动丢弃或猜测。
- 钉钉状态变化通过重新聚合纠正金额。
- 文件导入使用事务或等价的全批原子写入。
- 盘点校准、供应商修改、映射修改和质量关闭均写审计信息。
- 来源数据和校准数据分层保存，任何页面都能追溯到钉钉审批、导入批次、ERP 快照或销售数据日期范围。

## 测试与验收

### 领域测试

- 一采购多付款的实付汇总。
- 付款撤销、驳回、重复同步和金额变化后的重新计算。
- 产品库存资金、供应商物料消耗、分摊覆盖率和校准后余额。
- 库存盘点与 ERP 快照的数量、金额和日期对齐。
- 差评导入去重、关联、状态流转和关闭。
- 部门权限与产品负责人范围。

### API 测试

- 钉钉审批列表、详情、关联组件和分页使用固定响应模拟，不调用真实审批。
- D1 表创建、幂等写入、事务导入、聚合查询和审计记录。
- 同步失败、字段缺失、权限不足和重复请求。

### UI 验收

- 从业务 Apps 中打开供应链管理并返回经营执行平台。
- 总览异常优先级、供应商列表、采购付款关系、产品供应商维护、盘点导入和质量闭环。
- 加载、空状态、错误、过期数据、禁用和无权限状态。
- 桌面端、窄屏和钉钉内嵌 WebView 的层级、间距、对齐、滚动、焦点和控件行为。

## 一期不包含

- 在供应链 App 中发起、同意、拒绝或修改钉钉审批。
- 直接调用店铺平台评价接口。
- 替代 ERP 的采购、仓库、会计或结算系统。
- 完整 BOM、生产计划、需求预测和 MRP。
- 自动处罚供应商或自动决定责任归属。
- 未经确认的线上部署或真实数据回填。
`,Ie=`# 供应链真实数据闭环设计

## 目标

把供应链 App 从手工台账原型改造成一套有明确数据来源、可追溯且不泄露敏感财务信息的管理工具。系统要回答四个问题：采购申请了什么、财务实际支付了多少、ERP 与盘点库存是否一致、质量问题是否追到产品批次和供应商并完成整改。

## 已核对的数据来源

- 钉钉“采购申请单” \`PROC-E55BD07B-14E8-4111-ACFC-23835F3211E2\`：部门提出采购或费用申请，金额字段为“金额（元）”。
- 钉钉“付款审批” \`PROC-8E691E78-3D2D-45D5-9B77-C9EC5F8DFF6A\`：财务执行付款，通过 \`FormRelateField\` 的“采购申请单”关联原申请。关联实例 ID、原申请金额和业务分类位于 \`extValue\` 的 \`list[].instanceId\` 与 \`rowValue[]\` 中。
- 快麦 ERP：销售订单提供 SKU 销量与成本消耗；库存快照当前先支持文件导入，后续由同一数据模型承接自动接口。
- 库存盘点：保留 ERP 数、实盘数、数量差异和盘点金额，作为校准层，不覆盖原始数据。
- 采购/BOM 表：按产品、商家编码、物料类别、物料名、单位成本、供应商建立产品供应关系，并区分主供和备选。
- 质量表与周报：质量事件至少包含产品、SKU、批次、仓库、供应商、来源、问题、处置、整改、验证和公关结果。

## 核心口径

### 采购与付款

采购申请和付款审批是两个独立实体，通过钉钉关联审批控件建立关系。只有状态为通过的付款审批进入“采购实付”。当付款审批自身没有金额字段时，从关联采购申请的 \`extValue.rowValue\` 中读取金额；金额来源必须在记录中标记。

同一采购申请可以关联多张付款审批。系统汇总通过的付款金额，并在多笔付款合计超过采购申请金额时给出“付款超申请”异常。未关联采购申请、关联实例不存在、金额缺失均进入待处理队列。

### 库存资金与库存双账

- 库存资金：已通过付款实付 − 按销量消耗的销售成本。
- 盘点后库存资金：库存资金 + 已确认盘点资金调整。
- ERP 库存价值：最新 ERP 库存数量 × 当前主供 BOM 单位成本。
- 实盘库存价值：优先使用导入的盘点金额；未提供时使用实盘数量 × 当前主供 BOM 单位成本。
- 库存差异：实盘数量 − ERP 库存数量。

库存资金反映现金投入余额，ERP/实盘库存价值反映货物账面价值，两者并列展示，不互相冒充。

### 产品与供应商

产品供应关系按物料行维护，类别包含原料、包材、里料、耗材、加工和成品。相同产品和物料允许一个主供与多个备选；成本和销量消耗只使用主供，备选用于风险与切换管理，避免重复计算。

供应商表现同时展示实付、库存资金、未关闭质量问题和合作等级。银行账号、身份证、详细收货地址和完整手机号不进入前端供应链状态；非财务界面不展示收款信息。

### 质量闭环

质量事件既可以来自差评，也可以来自到货抽检、月度抽检和仓库验收。关闭事件时必须记录处置/公关结果、纠正措施与验证结果。批次、供应商和仓库允许为空以兼容历史数据，但会显示“待补充”，不能静默当作完整记录。

## 界面结构

保持产品全周期同款左侧全局导航，供应链二级页面继续作为主导航条目：供应链总览、供应商管理、采购与付款、产品供应链、库存盘点、质量管理、同步记录、设置。

总览优先显示五组信息：实付与消耗、库存资金、ERP/实盘价值、数据异常、按产品资金表。同步记录升级为数据源中心，分别显示钉钉审批、快麦销售成本、ERP 库存快照、盘点导入和质量导入的最近更新时间与数据量。

## 安全与兼容

- 不持久化钉钉原始审批载荷；只保留允许字段和来源元数据。
- 旧状态自动补齐新字段，不破坏现有 D1 记录。
- 本地开发服务提供供应链 JSON 持久化与真实钉钉同步，便于开发测试页直接验收；生产仍使用现有 D1 API。
- 快麦库存接口未验证可用前，不伪造自动同步成功状态；页面明确标注“文件快照”。

## 验收条件

- 真实 \`FormRelateField.extValue\` 能解析采购实例 ID 和金额。
- 审批记录不含原始收款账号载荷。
- 付款通过才计入实付，重复/超额关联能被识别。
- 产品总览同时看到现金库存资金、ERP 数、实盘数与差异。
- 主供/备选不重复计算 BOM 成本。
- 质量导入能保留批次、供应商、处置、整改与验证字段。
- 本地 8134 开发测试页可打开，构建、自动测试和关键页面检查通过。
`,ge=`# 数据中心 App 设计（历史版本）

本文是 2026-07-18 形成的早期方案索引，已被后续确认的产品决策替代，不再作为开发或验收依据。

当前有效文档：

- \`docs/features/data-center-app/prd.md\`：产品范围、业务规则与验收标准；
- \`docs/features/data-center-app/design.md\`：连接器目录、专属弹窗、内部保险箱、采集器与安全交互；
- \`docs/decisions/2026-07-19-encrypted-credential-vault.md\`：加密凭证保险箱架构决策。

主要变化：不恢复“数据分析”入口；允许密码、API 密钥、Token、Cookie 和可复用会话通过共享保险箱加密保存在 D1；验证码和当次人工验证信息仍不持久化。
`,fe=`# 左侧 App 折叠导航设计

## 背景与目标

公司经营平台接入产品全周期、供应链、数据中心、电商店铺运营、人事管理和品牌内容后，左侧导航把所有子页面同时平铺，导致常用公司经营入口和 App 总览难以快速扫描。

本次只调整导航呈现，不改变路由、页面、权限、数据或服务器授权。目标是默认只展示每个业务 App 的总览入口，需要时再展开详细页面，并保证当前页面始终可见。

## 范围

### 纳入折叠的 App 分组

- 产品全周期
- 供应链管理
- 数据中心
- 电商店铺运营
- 人事管理
- 品牌内容协同

### 保持完整展示的分组

- 公司经营：老板和总经办的高频经营入口不折叠。
- 协同执行：普通员工入口数量少，不增加层级。
- 平台：说明书、问题反馈和设置继续直接展示。

## 交互规则

1. 桌面端采用单开手风琴。同一时间最多展开一个业务 App。
2. 折叠状态下显示 App 分组标题、展开箭头和该 App 的第一个可见入口，通常为“总览”。
3. 点击分组标题切换展开状态；点击总览入口正常导航，不与折叠操作混用。
4. 用户进入某个 App 的非总览子页面时，对应分组自动展开，并关闭其他 App 分组。
5. 用户返回公司经营、协同执行或平台页面时，所有业务 App 恢复折叠，仅保留各自总览入口。
6. 展开状态只存在于当前页面会话，不写入本地存储；刷新后根据当前路由重新计算。
7. 移动端继续使用现有横向导航，不增加二级折叠，避免小屏幕出现嵌套操作。

## 不同账号与权限

导航必须先执行现有 \`canViewNavigation\` 权限过滤，再进行分组和折叠：

- 总经办：看到公司经营和所有有权限的业务 App；业务 App 默认折叠。
- 部门负责人和部门员工：只看到本部门获准访问的 App 与页面，不渲染无权限分组。
- 普通员工：保留产品工作台和已授权的通用 App；不因折叠导航获得新的公司经营入口。
- 只读账号：导航呈现与查看权限一致，编辑能力仍由现有页面和服务器规则控制。
- 部分页面权限：分组只包含允许访问的页面；折叠状态显示该组第一个可见入口，不显示被禁止的总览或空分组。
- 直接打开无权限路由：继续沿用现有安全回退，不因为自动展开而绕过权限。

折叠仅改变可见密度，不是权限边界。服务器授权和现有页面权限判断保持不变。

## 组件与状态

- 从 \`visibleNavigation\` 派生分组结构，保留现有导航定义为唯一路由事实源。
- 在 \`App\` 内维护当前展开的分组；路由变化时用活动页面决定自动展开或折叠，之后允许用户手动打开另一个 App。
- 新增轻量的侧栏分组标题按钮，使用 \`aria-expanded\`、明确的可访问名称和 18px 图标。
- 子项复用现有导航按钮，不引入新的路由层或新的共享平台组件。

## 视觉与响应式

- 分组标题沿用侧栏中性颜色、38px 控件高度和现有圆角，不使用卡片、阴影或装饰色。
- 展开箭头在 150–200ms 内旋转，遵循 \`prefers-reduced-motion\`。
- 当前页面继续使用现有蓝色选中态；分组标题只在展开时提高文字对比度，不与当前页面争夺主色。
- 桌面真实宽度下侧栏应无需长距离滚动即可看到所有 App 总览。
- 900px 以下保留当前横向导航结构，隐藏分组标题与折叠箭头，展示所有已授权入口。

## 边界状态

- 无权限分组：完全不渲染。
- 只有一个可见入口：只显示入口，不显示无意义的展开按钮。
- 活动子页面：自动展开，活动按钮可见并带 \`aria-current="page"\`。
- 权限在会话中更新：重新根据过滤后的导航生成分组；若展开分组消失，回到折叠状态。
- 路由不存在或无权访问：沿用现有默认页面回退。

## 验收标准

1. 首次进入公司首页时，六个业务 App 均只显示各自第一个可见入口。
2. 展开一个 App 后显示其全部已授权子页面，其他 App 保持折叠。
3. 直接进入子页面时对应 App 自动展开，当前页面可见并高亮。
4. 总经办、运营部、品牌部和普通员工测试身份均不出现越权入口或空分组。
5. 键盘可操作分组标题，焦点清楚，\`aria-expanded\` 与实际状态一致。
6. 桌面、窄屏和钉钉 WebView 布局无重叠、截断或不可达入口。
7. 现有路由、权限和业务页面测试保持通过。

## 实施边界

- 预计只修改 \`src/App.jsx\`、\`src/styles.css\`、相关 React 测试和 \`DESIGN.md\` 的导航规则。
- 不增加环境变量、D1 迁移、API 或外部平台调用。
- 回滚方式是恢复原有平铺渲染；不涉及数据回滚。
`,ve=`# 数据连接器配置简化设计

## 目标

减少数据接入弹窗中需要人工维护但不能帮助实际接入的字段。用户只提供能够识别店铺或账号、完成登录或 API 授权、确定同步数据范围的信息；系统负责生成技术元数据和审计记录。

## 已确认的产品规则

1. 不再要求用户填写通用“连接名称”。
2. 每个连接使用真实店铺名称或账号名称区分，字段名称随平台变化，例如“店铺名称”“广告账户名称”“ERP 账号名称”。
3. 不再填写公司主体和负责人。
4. 创建人、创建时间、最后修改人和最后修改时间由服务端根据当前登录身份自动记录。
5. 不再选择接入方式。系统根据本次填写的配置自动判断主接入方式：
   - 存在 API Key、Secret、Token 等 API 配置时，主方式为 \`api\`；
   - 否则存在登录账号或密码时，主方式为 \`browser\`；
   - 两类都存在时，以 \`api\` 为主、网页登录作为备用能力；
   - 两类都不存在时，主方式为 \`export\`。
6. 自动判断只代表配置意图，不代表平台已经真实接通。新连接继续保持 \`pending_validation\`，直到产生真实验证和同步证据。

## 界面设计

配置弹窗保留：

- 平台化的店铺或账号名称；
- 账户类型，例如淘宝/天猫、广告账户/巨量千川；
- 后台地址；
- 平台支持的网页登录和 API 字段；
- 同步数据范围；
- 安全说明与人工验证提示。

配置弹窗删除：

- 连接名称；
- 公司主体；
- 负责人；
- 接入方式选择器。

网页登录字段和 API 字段可同时出现，但按用途分组。页面根据当前已填写内容显示只读提示“系统识别：API 接口”“系统识别：网页登录”或“系统识别：文件导入”。编辑已有连接且没有替换凭证时，沿用已保存的主接入方式。

## 组件与数据流

- \`src/domain/dataCenterConnectors.js\` 增加平台化名称标签和接入方式推断规则，保持纯业务逻辑。
- \`ConnectorConfigDialog.jsx\` 只收集真实店铺/账号标识、平台字段和同步范围，不收集责任人或公司主体。
- \`dataCenterConnectionsApi.js\` 在保存连接实例前，根据本次敏感字段和现有实例推断主接入方式。
- \`functions/api/data-center/connectors.js\` 继续使用当前会话身份写入 \`createdBy\` 和 \`updatedBy\`，客户端不能指定审计身份。
- 平台真实适配器和同步器不在本次范围内；平台状态不会因表单保存而改为健康。

## 兼容与迁移

不新增 D1 表或列。现有 \`name\` 列改为保存店铺/账号显示名称；\`company_subject\`、\`owner\` 和 \`capture_method\` 保留以兼容历史记录。新记录的公司主体和负责人写空值，主接入方式由系统推断后写入现有 \`capture_method\`。

旧记录继续正常读取。编辑旧记录时，原有名称作为店铺/账号名称显示；已保存的公司主体和负责人不再出现在编辑界面，也不会被用户修改。

## 异常与安全

- 店铺或账号名称为空时禁止保存，并显示平台化错误信息。
- 接入方式推断不得读取服务器返回的凭证明文；已有凭证未替换时使用实例中保存的主方式。
- 登录账号、密码、Secret、Token 继续只进入加密凭证接口，不进入连接实例、日志或浏览器持久化。
- OTP、验证码、二维码、滑块和设备确认结果仍禁止保存。
- API 与网页配置同时存在时，只保存一个主方式用于当前调度，备用能力保留在加密凭证中，后续采集器按平台策略使用。

## 验证

- 领域测试覆盖平台化名称标签、API/网页/文件推断和已有实例兼容。
- UI 测试确认四个通用字段已删除，店铺/账号名称与自动识别提示存在。
- API 测试确认审计身份来自会话，客户端不能伪造创建人或修改人。
- 浏览器检查新增、编辑、已有凭证、错误、390px 和桌面布局。
- 完成项目 Definition of Done：lint、治理、集成、环境能力、全量测试和构建。

## 回滚

回滚前端和领域规则即可恢复旧表单。数据库结构未变化，历史连接记录和审计记录无需回滚或迁移。
`,he=`# 业务 App 导航排序与商品主数据加载修复设计

日期：2026-07-20
状态：已确认

## 背景

当前左侧业务 App 的排列与实际工作顺序不一致，数据中心夹在业务流程中间；同时，商品主数据接口在尚未完成首次同步、返回空目录时，前端会将有效的空数据响应误判为“商品主数据加载失败”。

本次改动把业务入口按使用顺序固定排列，并区分“目录尚未同步”和“请求真实失败”两种状态。

## 目标

### 1. 固定业务 App 顺序

公司级和产品级两套侧栏均按以下顺序展示：

1. 产品全周期
2. 电商店铺运营
3. 品牌内容协同
4. 供应链管理
5. 人事管理
6. 数据中心

数据中心作为支撑平台固定放在业务 App 列表最下方。各 App 内部导航项及现有权限规则不变；没有权限的 App 仍不展示，其余 App 保持上述相对顺序。

### 2. 正确处理商品主数据空目录

商品主数据读取接口返回 HTTP 200、\`synced: false\` 和空 \`items\` 时，表示目录尚未首次同步，是合法的空状态，不是请求失败。页面应展示现有空状态和同步/导入引导，不显示“商品主数据加载失败”。

只有网络异常、非成功 HTTP 响应或无效响应才进入错误状态。错误状态保留明确错误提示，并提供“重新加载”操作；重新加载沿用现有读取接口，不触发导入或快麦同步。

如果刷新失败但页面已有上一份可用目录，保留原数据并显示错误提示，避免瞬间清空用户正在查看的内容。

## 技术边界

- 只调整导航组合顺序、商品主数据读取客户端的响应判定和页面错误恢复交互。
- 不修改 \`/api/platform/v1/product-catalog\` 的服务端响应结构。
- 不修改 D1 表、迁移、绑定、环境变量或外部平台配置。
- 不改变导入商品、快麦同步、权限校验及审计行为。
- 不新增共享平台 API；现有 \`ProductCatalogProvider.refresh\` 作为重试能力复用。

## 状态与交互

| 场景 | 页面表现 | 可用操作 |
|---|---|---|
| 首次加载中 | 现有加载骨架 | 等待 |
| 成功且有商品 | 展示商品主数据 | 现有导入与同步操作 |
| 成功但尚未同步 | 展示正常空状态 | 导入、同步 |
| 首次加载真实失败 | 展示错误提示 | 重新加载 |
| 已有数据后刷新失败 | 保留已有商品并提示错误 | 重新加载 |

“重新加载”按钮必须支持键盘操作、清晰焦点态和请求中的禁用状态，避免重复请求。

## 验收标准

1. 公司级和产品级侧栏中，用户有权限看到的业务 App 始终遵循确认顺序，数据中心位于最后。
2. HTTP 200 且 \`synced: false\`、\`items: []\` 的商品目录响应不会抛出加载错误。
3. 商品目录尚未同步时展示空状态，不展示错误提示。
4. 网络或服务端真实失败时展示错误提示和“重新加载”按钮。
5. 点击“重新加载”调用现有 \`refresh\`，加载期间按钮禁用；成功后错误消失并展示最新结果。
6. 现有商品导入、快麦同步、权限和其他侧栏导航行为不回归。

## 测试方案

- 导航领域测试覆盖完整顺序，以及缺少部分 App 权限时的相对顺序。
- 商品目录 API 客户端测试覆盖合法空目录、成功目录和真实失败响应。
- 商品目录界面测试覆盖空状态、错误重试及重试禁用状态。
- 完成仓库规定的 lint、治理、集成、环境能力、测试和构建检查。
- 在本地真实页面检查笔记本宽度、键盘焦点、错误/空/禁用状态及钉钉 WebView 布局。

## 回滚

本次不涉及数据迁移。若出现回归，可单独回退导航组合顺序及读取客户端/重试交互，不影响已存商品主数据和服务端接口。
`,Ee=`# 产品说明书

## 文档类型

产品说明书

## 使用人群

公司内部管理层、产品、运营、品牌、供应链、客服和财务同事，主要在钉钉工作台内协作。

## 产品目标

让需求、产品阶段、跨部门任务、交付物和复盘在一个可执行系统中流转，并由组织架构权限控制可见与可编辑范围。

## 数据接入

数据中心统一展示公司使用的数据来源及其连接状态，固定分为“电商平台、ERP、公司数据”。电商平台用于店铺、广告账户等经营数据；ERP 用于快麦等商品、订单、库存同步；公司数据包含钉钉、阿里云、NAS、邮箱、财务系统等组织与内部资料来源。同一平台在目录中只出现一次，用户从一个入口查看连接状态和管理动作。

所有已登录员工可以看到安全状态和处理入口，只有对应权限用户可以修改数据源，只有最高权限管理员可以维护钉钉、快麦等公司级平台连接。保存前必须先验证候选配置，页面和接口不展示已保存的密钥；尚未完成真实接入的平台只显示规划状态，不伪装成可配置能力。公司级连接凭据与业务同步实例可以在同一详情中展示，但继续使用各自的服务端权限、接口和安全存储，不在浏览器中复制或混存。

店铺经营数据采用平台后台原始文件导入。抖音、快手、淘系、拼多多、小红书和京东/京麦在取得真实 XLSX/CSV 样例前只显示“等待文件样例”，不收集店铺登录账号和密码，也不把等待状态标记为已接通。收到样例后按平台建立可验证的文件识别、预览、去重和标准事实写入；ERP、广告、钉钉、NAS 等继续使用各自已经验证的 API、文件或受控连接边界。店铺销售口径使用订单创建时间、\`Asia/Shanghai\`，并排除“其它/其他”。

数据中心“用户洞察”按平台、店铺和产品/SKU 展示用户、商品、视频与直播市场事实。平台类目和竞品必须由产品或运营人工确认；产品全周期与电商店铺运营分别维护本 App 的版本化规则。浏览器采集只访问 provider registry 登记的固定域名；密码使用共享 AES-GCM 保险箱加密保存，验证码、Cookie、会话、完整页面和截图不落库。设备只用一次性短时 task grant 领取单个任务凭证；所有建议带证据和质量并明确“仅供参考”，不能自动改变经营数据或平台设置。

## 共享商品主数据

数据中心是 ERP 商品、库存单位编码、主/规格商家编码和组合关系的统一导入与同步入口。标准 69 码和 ERP 内部唯一码都可以是最小库存单位；系统只把缺失或跨商品冲突编码列为数据问题，不按编码格式否定库存身份。产品全周期保留业务产品身份，通过目录 ID 关联 ERP 商品；供应链、供应商管理、销量、库存和货流使用同一目录，不再各自维护一套商品编码。快麦 API 与商品档案文件是互补来源，导入和同步均为只读 ERP，不反向修改快麦。

商品主数据同时提供经营读取：按平台和订单创建日期把已落库快麦销量聚合到商品，主表显示销量而非 ERP 状态。商品档案与销售事实分别保存和标记更新时间，通过 SKU 69 码确定性关联；无法匹配的销售不猜测归属，\`其它\` 默认不进入正常平台统计。

## 大模型服务

全系统需要模型能力的 App 共用一个服务端 AI 接口。每个功能先登记所属 App 和稳定功能 ID，再由统一边界处理模型配置、权限、外发策略、Token 统计、Skill 调用、超时、规则降级和审计；业务页面不直接连接模型供应商。电商店铺运营的方案点评与公司 AI 总助均已接入这套能力，原审批权和规则降级保持不变。

数据中心「AI 大模型」默认查看最近 30 天，可快速切换 7、30、90 天或确认自定义日期。页面只按 App、功能、模型和 Skill 展示调用次数、Token、成功率、规则降级和最近使用，不提供员工排行、个人下钻、提示词或回答内容。模型与安全设置位于页面底部并默认收起；公司级灵算连接凭据从「数据接入 > 公司数据」统一维护，不在统计页录入或回显。

## 产品气质

专业、克制、高效。

## 明确不做

- 不做厚重传统后台、营销页或装饰性仪表盘。
- 不使用嵌套卡片、花哨渐变和不一致的控件。

## 设计原则

1. 任务优先，权限自然表达。
2. 信息密度高但保持稳定行高和间距。
3. 组件和交互状态统一。
4. 钉钉内嵌环境优先保证可靠性。

## 无障碍与包容性

以 WCAG AA 为目标，交互不依赖颜色单独表达，保留焦点和禁用状态。
`,De=`# 产品设计书

## 风格方向

浅色、克制的产品工作台，参考 Linear、Apple 系统应用和成熟钉钉工作台应用。

设计执行以 \`frontend-design-principles\`、\`impeccable\` 和 \`web-design-guidelines\` 为主，不使用偏营销展示的 \`high-end-visual-design\`。

## 字体与字号

使用系统字体。页面标题 24px，区块标题 15-16px，正文和表格 13px，辅助文字 12px。

## 页面布局

固定左侧导航和响应式主工作区。间距使用 4px 基础网格，常用间距为 8px 和 12px。表格保持表头单行、稳定列宽和水平滚动；设置页使用无嵌套卡片的矩阵结构。

桌面左侧导航按业务 App 分组折叠：默认保留每个 App 的第一个已授权入口，同一时间只展开一个 App，进入子页面时自动展开对应分组。六个业务 App 的固定顺序为产品全周期、电商店铺运营、品牌内容协同、供应链管理、人事管理、数据中心；数据中心作为支撑平台位于业务 App 列表最后，平台分组仍在其后。导航必须先按组织权限过滤；没有权限的 App 不展示，其余 App 保持上述相对顺序。移动端保持已授权入口的扁平横向导航。

## 组件规范

- 主操作使用蓝色，普通操作使用中性按钮，危险操作只用于不可逆动作。
- 权限范围使用组织架构下拉多选，不使用自由文本录入。
- 所有下拉通过浮层渲染，避免被表格和面板裁切。
- 加载、错误、禁用、选中状态必须清楚且一致。

## 数据接入目录与平台专属配置

数据接入目录固定使用“电商平台、ERP、公司数据”横向分类，同一平台只显示一个入口。桌面使用三列卡片，平板两列，640px 以下单列；卡片统一展示平台标识、名称、用途、状态、脱敏摘要和就近操作，不使用营销评分、厚阴影或嵌套卡片。分类可用左右方向键切换并保持清晰焦点，加载、错误、只读、禁用和规划中状态不能互相冒充。

钉钉归入公司数据，快麦归入 ERP；点击后打开各自的专属字段和中文帮助。快麦的公司级连接与同步实例可以组合在同一详情中，但不得共享敏感草稿或客户端存储。未接入平台保留可理解的说明和不可操作状态。界面只表达“已接通、需处理、尚未连接、准备接入、只读”等业务状态，不出现环境变量、数据库、加密算法等实现术语。

数据接入首页展示内置 provider 入口和已识别实例，不展示公司主体、链接名称、负责人、接入方式或后台地址。抖音首期弹窗只有登录邮箱和密码；成功识别后外层只显示真实店铺头像、店铺名称和短状态。普通列表和读取接口不提供秘密；仅实例级登录连接可在有管理权限、登录会话创建不超过 15 分钟、明确点击、限流、\`no-store\` 和追加审计同时成立时短时显示密码，并在 60 秒、页面失焦、Esc 或关闭时清空。

## 数据中心同步与质量

数据质量是同步结果的一部分，不单独占用左侧入口。“同步记录”按质量摘要、执行记录、待处理数据问题的顺序单列展示；页面标题只出现一次，不增加页内 Tab，也不把运行记录和质量问题合并成一张字段含义不一致的表。历史质量链接兼容进入同步记录。

## 数据总览日期与环比

数据总览使用确认式日期范围选择器：开始日期、结束日期和近 7/15/30 天快捷项都只修改浮层草稿，用户点击确认后才更新页面并发起一次完整查询；取消、点击外部或按 Esc 不改变已应用范围，并把焦点返回触发按钮。日期按 \`Asia/Shanghai\` 自然日计算，包含首尾，最晚为昨天，单次范围最多 370 天。

五项经营指标在主值下展示紧邻上一期、包含天数相同的环比。上期计算必须显式沿用本期实际解析出的同一组口径版本，避免因历史生效日期不同造成公式漂移或无版本可用。金额和数量显示相对百分比，退款率和毛利率显示百分点；方向必须同时使用箭头、中文和数值表达，不能只依赖红绿。上期为零、结果缺失、覆盖不完整或计算失败时展示具体不可比原因，保留本期值，不把上期异常升级为整个总览失败。正常结果不重复显示版本和截止时间，覆盖不足时才保留覆盖率警告。

总览的“经营趋势”和“平台分布”只表达已确认本期范围的 GMV 销售事实；趋势柱悬停或键盘聚焦时展示日期、GMV、销售数量、毛利率及各平台 GMV。总览不再单设“数据健康”面板，页面右上角显示最新事实日期和异常数量，点击进入同步记录。

## 大模型治理

数据中心原「数据服务」入口保留路由兼容并改名为「AI 大模型」，使用 Bot 图标。页面按“确认式日期工具栏、连续汇总带、App 与功能用量表、Skill 用量表、折叠设置”排列；不使用图表、装饰性指标卡或员工排行。汇总带固定展示模型调用、总 Token、成功率、Skill 调用和规则降级，输入与输出 Token 作为总 Token 的辅助文字。

快速日期 7、30、90 天形成完整区间并立即查询；自定义日期先写草稿，只有开始和截止日期完整、顺序有效且不超过 366 天时，点击「查询」才替换当前结果。刷新只读取已确认区间。加载时保持工具栏可用，失败时保留上一次成功结果并显示安全错误和 Request ID；已登记但无调用的功能仍显示为「暂无调用」。Provider、连接测试和外发策略使用原生 \`details/summary\` 默认收起，凭据入口跳转至数据接入的公司数据分类。

## 商品主数据

商品主数据是档案与经营事实的统一读取入口，不另建商品销量 App。页面按“经营状态带、查询工具栏、商品表”三层组织；状态带连续分隔，不拆成装饰性指标卡。查询支持平台、最近 7/30 天、本月、上月和自定义日期；平台与日期在服务端聚合，商品搜索、分类和业务关联在当前目录内即时筛选。

商品表显示商品、SKU/69 码、分类品牌、销量、权限内 ERP 成本和业务关联，不显示 ERP 状态列。销量作为第一数字列右对齐，主值为数量，净销售额与平台构成为辅助信息；零销量明确标识所选范围暂无销售。商品档案与销售事实显示独立更新时间，未匹配销售行显示覆盖提醒。

## 钉钉内嵌网页

避免大请求使用 \`keepalive\`；错误提示使用明确中文。布局使用动态视口高度并适配安全区。

## 供应链管理与货流

供应链管理保持一个业务 App 入口，不另建“货流”App，也不显示“返回业务 Apps”按钮。App 内左侧导航依次为货流驾驶舱、需求计划、采购与供应商、生产与在途、库存管理、履约物流、逆向与质量、现金循环、同步与覆盖、规则设置；当前项必须具有文本和视觉选中状态。

货流驾驶舱顶部只显示 CCC、断货率、库存周转天数三个主指标。尚未覆盖的指标使用“不可计算”和具体缺口，不展示伪造的零。只有一个内容区的页面直接展示标题、操作和表格，不再用“页面标题卡包裹内容卡”的层级。供应商、库存和盘点表格的中文表头与“原料”“成品”等标签保持横排；列宽不足时使用水平滚动，不逐字折行。

1440px 和 1180px 宽度保留左侧导航与可读主表；窄 WebView 将导航收起并保留当前页上下文。数量和金额右对齐，焦点可见，按钮禁用时提供原因。加载、空数据、过期、部分成功、错误、无权限和版本冲突必须有独立状态；失败时保留上次成功数据并在受影响区域标记来源时间。

## 真实环境提示

本地代码以真实线上账号、生产数据或外部平台运行时，所有业务页面必须在内容流顶部持续显示“本地代码 · 线上真实环境”、真实账号姓名和“所有操作立即生效”。提示不能只靠颜色、不能固定遮挡导航，窄屏允许换行；正式生产会话不显示本地提示。会话失败时不得降级成硬编码假账号。
`,w="handbook/getting-started",Te=Object.assign({"../../../docs/handbook/company-platform.md":Cn,"../../../docs/handbook/faq.md":On,"../../../docs/handbook/getting-started.md":jn,"../../../docs/handbook/product-lifecycle.md":kn,"../../../docs/platform/api-catalog.md":bn,"../../../docs/platform/architecture.md":yn,"../../../docs/platform/browser-market-collection.md":xn,"../../../docs/platform/components.md":Ln,"../../../docs/platform/data-acquisition.md":Un,"../../../docs/platform/environment-parity-skill.md":wn,"../../../docs/platform/environment-readiness.md":Mn,"../../../docs/platform/error-codes.md":Gn,"../../../docs/platform/external-platform-map.md":Vn,"../../../docs/platform/integrations.md":Fn,"../../../docs/platform/middleware.md":Kn,"../../../docs/product/core-workflows.md":Yn,"../../../docs/product/data-definitions.md":Bn,"../../../docs/product/roles-and-permissions.md":Hn,"../../../docs/superpowers/specs/2026-07-11-permission-settings-design.md":Wn,"../../../docs/superpowers/specs/2026-07-11-task-category-actions-design.md":qn,"../../../docs/superpowers/specs/2026-07-11-workflow-task-templates-design.md":Qn,"../../../docs/superpowers/specs/2026-07-13-dashboard-department-todos-design.md":zn,"../../../docs/superpowers/specs/2026-07-13-demand-created-at-design.md":$n,"../../../docs/superpowers/specs/2026-07-13-dingtalk-web-login-design.md":Jn,"../../../docs/superpowers/specs/2026-07-13-platform-sales-sorting-design.md":Xn,"../../../docs/superpowers/specs/2026-07-15-product-planning-design.md":Zn,"../../../docs/superpowers/specs/2026-07-15-product-progress-schedule-design.md":ne,"../../../docs/superpowers/specs/2026-07-16-company-strategy-execution-platform-design.md":ee,"../../../docs/superpowers/specs/2026-07-16-executive-personal-todo-dingtalk-sync-design.md":ae,"../../../docs/superpowers/specs/2026-07-16-strategy-department-incentive-monthly-report-design.md":se,"../../../docs/superpowers/specs/2026-07-17-dingtalk-group-executor-selection-design.md":te,"../../../docs/superpowers/specs/2026-07-17-dingtalk-todo-recovery-deliverable-crud-design.md":ie,"../../../docs/superpowers/specs/2026-07-17-integration-routing-platform-map-design.md":oe,"../../../docs/superpowers/specs/2026-07-17-planning-card-progress-navigation-design.md":re,"../../../docs/superpowers/specs/2026-07-17-platform-handbook-design.md":le,"../../../docs/superpowers/specs/2026-07-17-product-grading-boundaries-design.md":ce,"../../../docs/superpowers/specs/2026-07-17-product-ownership-visibility-design.md":de,"../../../docs/superpowers/specs/2026-07-17-strategy-crud-design.md":pe,"../../../docs/superpowers/specs/2026-07-17-strategy-result-commitment-drilldown-design.md":ue,"../../../docs/superpowers/specs/2026-07-17-strategy-rule-strip-removal-design.md":me,"../../../docs/superpowers/specs/2026-07-17-supply-chain-left-navigation-design.md":_e,"../../../docs/superpowers/specs/2026-07-17-supply-chain-management-app-design.md":Ae,"../../../docs/superpowers/specs/2026-07-17-supply-chain-real-data-design.md":Ie,"../../../docs/superpowers/specs/2026-07-18-data-center-app-design.md":ge,"../../../docs/superpowers/specs/2026-07-19-collapsible-app-navigation-design.md":fe,"../../../docs/superpowers/specs/2026-07-20-connector-configuration-simplification-design.md":ve,"../../../docs/superpowers/specs/2026-07-20-navigation-product-catalog-load-fix-design.md":he}),B={handbook:0,product:1,platform:2},H={guide:0,product:0,design:1,specification:2,platform:0},M="2026-07-17",Z=a=>a.split("/").pop().replace(/\.md$/,""),Pe=a=>a.match(/^(\d{4}-\d{2}-\d{2})-/)?.[1]??M,Ne=a=>{const e=Z(a);return a.includes("/docs/handbook/")?{slug:`handbook/${e}`,category:"handbook",kind:"guide"}:a.includes("/docs/product/")?{slug:`product/${e}`,category:"product",kind:"product"}:a.includes("/docs/platform/")?{slug:`platform/${e}`,category:"platform",kind:"platform"}:{slug:`product/specs/${e}`,category:"product",kind:"specification"}},Se=Object.entries(Te).map(([a,e])=>{const s=Ne(a);return U({...s,updatedAt:Pe(Z(a)),content:e})}),Re=[U({slug:"product/product",category:"product",kind:"product",updatedAt:M,content:Ee}),U({slug:"product/design",category:"product",kind:"design",updatedAt:M,content:De})],y=[...Se,...Re].sort((a,e)=>(a.slug===w?-1:e.slug===w?1:0)||B[a.category]-B[e.category]||H[a.kind]-H[e.kind]||a.title.localeCompare(e.title,"zh-CN")),Ce=JSON.parse('[{"id":"dingtalk","name":"钉钉开放平台","status":"connected","summary":"承载登录、组织通讯录、待办、群聊、日历、文档、供应链文件快照和钉钉内嵌工作台能力。","capabilities":["身份登录","组织通讯录","待办任务","群聊与成员","日历","文档读取","采购与付款审批同步","供应链文件快照","内嵌工作台","平台连接配置"],"businessQuestions":["登录或免登失败","找不到人员或部门","待办未创建或未同步","本地如何执行真实待办与日历动作","群成员选择异常","供应链文件快照未导入","钉钉 WebView 行为异常"],"keywords":["钉钉","DingTalk","免登","待办","通讯录","群聊","开放平台"],"codePaths":["functions/api/dingtalk/**","functions/api/auth/dingtalk/**","functions/api/supply-chain/approvals/sync.js","functions/api/platform/v1/collaboration-items/**/dingtalk.js","functions/api/platform/v1/platform-connections.js","functions/api/platform/_shared/platformCredentials.js","src/state/dingtalk*.js","src/features/**/DingTalk*.jsx","src/features/data-center/PlatformConnectionsWorkspace.jsx","scripts/import-dingtalk-supply-inventory.mjs","scripts/lib/dingtalkSupplyInventory.mjs","server.mjs"],"envVars":["DINGTALK_APP_KEY","DINGTALK_APP_SECRET","DINGTALK_CORP_ID","DINGTALK_TOKEN_ENCRYPTION_KEY"],"domains":["open.dingtalk.com","api.dingtalk.com","oapi.dingtalk.com"],"apiRoutes":["/api/dingtalk/","/api/auth/dingtalk/","/api/supply-chain/approvals/sync","/api/platform/v1/collaboration-items/:id/dingtalk","/api/platform/v1/platform-connections"],"publicDocs":[{"label":"钉钉开放平台能力中心","url":"https://open.dingtalk.com/"}],"evidence":["functions/api/dingtalk/","functions/api/auth/dingtalk/","functions/api/supply-chain/approvals/sync.js","functions/api/platform/v1/collaboration-items/[id]/dingtalk.js","functions/api/platform/v1/platform-connections.js","functions/api/platform/_shared/platformCredentials.js","src/features/data-center/PlatformConnectionsWorkspace.jsx","scripts/import-dingtalk-supply-inventory.mjs","scripts/lib/dingtalkSupplyInventory.mjs"],"relations":[{"platformId":"cloudflare-d1","type":"stores-session-and-org-data","description":"登录会话、用户令牌与组织同步结果使用 D1 持久化。"},{"platformId":"cloudflare-pages","type":"hosts-callbacks","description":"Pages Functions 承载登录回调和开放平台 API 适配器。"}]},{"id":"kuaimai","name":"快麦开放平台","status":"integrating","summary":"开放平台按订单创建时间拉取订单，并由数据中心分页读取 ERP 商品列表和组合详情；历史补数仍以快麦后台官方导出文件为准，D1 保存归档清单、共享商品目录和业务投影。","capabilities":["官方文件历史补数","订单创建时间口径","本地原始文件归档","最小索引幂等落库","导入批次与异常审计","固定范围采集令牌","有限订单 API","有限商品 API","商品目录同步","组合商品详情","库存单位与组合比例","会话刷新","销售日聚合","连接状态检查","平台连接配置"],"businessQuestions":["快麦历史数据补录","三个月内订单与归档订单如何完整导出","快麦连接失败","订单同步缺失","ERP 商品或库存单位编码未同步","组合商品比例未同步","库存和出入库数据如何补录","销售数据未落库","本地如何触发真实同步","刷新令牌失败","月度数据校准","API 与官方导出覆盖不同"],"keywords":["快麦","Kuaimai","订单同步","销售数据","ERP","开放平台"],"codePaths":["functions/api/kuaimai/**","functions/api/platform/v1/erp-collection/**","functions/api/platform/v1/product-catalog.js","functions/api/platform/v1/product-catalog/**","functions/api/platform/v1/goods-flow/**","functions/api/sales.js","functions/api/platform/v1/platform-connections.js","functions/api/platform/_shared/platformCredentials.js","src/domain/kuaimaiErpCollection.js","src/domain/productCatalog.js","src/domain/productCatalogGraph.js","src/domain/productCatalogSales.js","src/state/ProductCatalogProvider.jsx","src/state/productCatalogApi.js","src/features/data-center/ProductCatalogWorkspace.jsx","src/features/data-center/PlatformConnectionsWorkspace.jsx","src/features/settings/KuaimaiSyncSettings.jsx","src/state/salesStore.js","scripts/kuaimai-erp-collector/**",".agents/skills/kuaimai-erp-data-collection/**","migrations/0006_product_catalog_components.sql","migrations/0007_kuaimai_erp_collection.sql","migrations/0008_kuaimai_erp_local_archives.sql","docs/features/kuaimai-erp-history/**","docs/features/kuaimai-erp-local-archive/**","server.mjs"],"envVars":["KUAIMAI_APP_KEY","KUAIMAI_APP_SECRET","KUAIMAI_ACCESS_TOKEN","KUAIMAI_REFRESH_TOKEN"],"domains":["open.kuaimai.com","api.kuaimai.com","scm.superboss.cc"],"apiRoutes":["/api/kuaimai/","/api/sales","/api/platform/v1/erp-collection/ingest","/api/platform/v1/erp-collection/archives","/api/platform/v1/erp-collection/runners","/api/platform/v1/platform-connections","/api/platform/v1/product-catalog","/api/platform/v1/product-catalog/import","/api/platform/v1/product-catalog/sync/kuaimai"],"publicDocs":[{"label":"快麦开放平台 API 文档","url":"https://open.kuaimai.com/docs/"}],"evidence":["functions/api/kuaimai/","functions/api/platform/v1/erp-collection/ingest.js","functions/api/platform/v1/platform-connections.js","functions/api/platform/_shared/platformCredentials.js","functions/api/platform/v1/product-catalog/sync/kuaimai.js","functions/api/platform/v1/product-catalog/_shared/sales.js","functions/api/platform/v1/goods-flow/imports.js","src/domain/kuaimaiErpCollection.js","src/domain/productCatalog.js","src/domain/productCatalogGraph.js","src/domain/productCatalogSales.js","src/features/data-center/ProductCatalogWorkspace.jsx","src/features/data-center/PlatformConnectionsWorkspace.jsx","src/features/settings/KuaimaiSyncSettings.jsx","scripts/kuaimai-erp-collector/core.mjs",".agents/skills/kuaimai-erp-data-collection/SKILL.md","docs/platform/apis/erp-collection-v1.md","docs/features/kuaimai-erp-history/prd.md","migrations/0006_product_catalog_components.sql","migrations/0007_kuaimai_erp_collection.sql"],"relations":[{"platformId":"cloudflare-d1","type":"stores-sales-and-product-catalog","description":"快麦订单日聚合、共享商品目录和组合关系分别写入 D1。"},{"platformId":"erp-file-import","type":"primary-history-channel","description":"官方文件是当前快麦全历史补数的主通道，并校准销售事实及补齐 API 未返回的商品字段。"}]},{"id":"douyin-ecommerce","name":"抖音电商罗盘","status":"retired","summary":"店铺网页登录采集已退役；抖音店铺经营改为平台原始文件方向，当前等待真实文件样例。","capabilities":["原始文件方向","等待文件样例","旧凭证不可恢复销毁","历史审计保留"],"businessQuestions":["抖音原始文件样例","订单创建时间口径","文件字段识别","历史连接清理"],"keywords":["抖音电商","抖店","Douyin","原始文件","文件导入"],"codePaths":["src/domain/dataCenterConnectors.js","src/features/data-center/connections/**","functions/api/platform/v1/data-connections/**","functions/api/platform/_shared/credentialVaultStorage.js","migrations/0006_data_connections.sql"],"envVars":[],"domains":[],"apiRoutes":["/api/platform/v1/data-connections"],"publicDocs":[],"evidence":["docs/features/store-file-import-transition/prd.md","docs/features/store-file-import-transition/design.md","migrations/0006_data_connections.sql"],"relations":[{"platformId":"cloudflare-d1","type":"stores-cleanup-audit","description":"D1 保留无秘密审计和历史经营事实；旧店铺凭证密文与 IV 被清空。"},{"platformId":"cloudflare-pages","type":"hosts-retirement-api","description":"Pages Functions 承载旧连接只读与受控销毁接口。"},{"platformId":"erp-file-import","type":"planned-file-pattern","description":"店铺原始文件后续复用已验证的预览、确认和标准事实写入原则，但必须先取得真实样例。"},{"platformId":"kuaimai","type":"possible-overlap","description":"文件导入需区分快麦聚合订单与抖音店铺原始经营数据。"},{"platformId":"oceanengine-qianchuan","type":"commerce-to-advertising","description":"店铺经营数据与巨量投放数据分别采集并通过标准维度关联。"}]},{"id":"cloudflare-pages","name":"Cloudflare Pages","status":"connected","summary":"托管 React 应用与 Pages Functions，并提供生产和预览运行边界。","capabilities":["静态站点托管","Pages Functions","生产部署","预览环境","本地线上账号运行","回滚","环境就绪检查","生产数据网关","凭证加密服务","加密平台连接","用户洞察共享 API","共享数据口径"],"businessQuestions":["构建或部署失败","生产页面与本地不一致","Functions 路由异常","预览环境配置缺失","测试环境与生产配置漂移","本地如何使用真实线上账号、数据与外部动作"],"keywords":["Cloudflare","Pages","Pages Functions","部署","生产环境"],"codePaths":["functions/**","functions/api/platform/v1/platform-connections.js","functions/api/platform/_shared/platformCredentials.js","functions/api/platform/v1/data-standards/**","functions/api/platform/v1/_shared/dataStandards*.js","src/state/deploymentRecovery.js","scripts/prepare-pages-build.mjs","scripts/prepare-pages-release.mjs","scripts/check-deployed-readiness.mjs","cloudflare-entry.html","404.html","public/404.html","_redirects","wrangler.toml",".github/workflows/**"],"envVars":["PLATFORM_CREDENTIAL_MASTER_KEY","LOCAL_ONLINE_ACCOUNT_MODE","PRODUCTION_DATA_ACCESS_TOKEN","AI_ASSISTANT_ENABLED","LINGSUAN_API_KEY","LINGSUAN_ACTOR_AUTHORIZATION","VITE_DATA_CENTER_LEGACY_OVERVIEW_ROLLBACK"],"domains":["pages.dev","api.cloudflare.com","dash.cloudflare.com"],"apiRoutes":["/api/platform/v1/environment-readiness","/api/platform/v1/platform-connections","/api/platform/v1/credential-vault","/api/platform/v1/data-standards","/api/platform/v1/data-services/sales","/api/platform/v1/production-write-session","/api/platform/v1/production-data/","/api/platform/v1/user-insights","/api/platform/v1/user-insights/","/api/platform/v1/ai/"],"publicDocs":[{"label":"Cloudflare Pages 文档","url":"https://developers.cloudflare.com/pages/"},{"label":"Pages Functions 文档","url":"https://developers.cloudflare.com/pages/functions/"}],"evidence":["functions/","functions/api/platform/v1/platform-connections.js","functions/api/platform/_shared/platformCredentials.js","functions/api/platform/v1/_shared/dataStandardsStorage.js","functions/api/platform/v1/data-services/sales.js","src/state/deploymentRecovery.js","docs/platform/architecture.md","docs/platform/apis/data-services-sales-v1.md","scripts/prepare-pages-build.mjs","scripts/prepare-pages-release.mjs","wrangler.toml"],"relations":[{"platformId":"cloudflare-d1","type":"binds","description":"Pages Functions 通过 PRODUCT_FLOW_DB 绑定访问 D1。"}]},{"id":"cloudflare-d1","name":"Cloudflare D1","status":"connected","summary":"保存共享业务状态、平台数据、登录会话、组织数据、销售聚合、共享商品目录、用户洞察、货流事实、数据中心、加密凭证、店铺运营、人事绩效、跨 App 协同和 AI 安全元数据。","capabilities":["共享状态持久化","共享状态原子比较并写入","共享状态写前快照与审计","登录会话","组织数据","销售聚合","共享商品目录","用户洞察标准事实","用户洞察部门规则","采集设备令牌哈希","货流事件与指标","平台配置","数据中心元数据","版本化数据口径与计算结果","加密凭证密文与审计","店铺运营记录","人事核心记录","绩效记录","跨 App 协同","AI Provider 元数据","AI 外发策略","AI 无内容审计","生产写入审计","写前快照","加密平台连接"],"businessQuestions":["数据只在本地可见","跨设备状态不同步","旧页面或旧分支覆盖产品进度","数据库绑定缺失","表结构或容量问题","用户洞察采集结果未落库","货流事实或指标未落库","人事数据表是否就绪","跨部门事项如何留痕","测试账号如何受控写生产数据","生产写入如何回滚"],"keywords":["D1","数据库","落库","PRODUCT_FLOW_DB","持久化"],"codePaths":["functions/api/state.js","functions/api/platform.js","functions/api/supply-chain.js","functions/api/supply-chain/**","functions/api/platform/v1/goods-flow/**","functions/api/platform/v1/data-services/**","functions/api/sales.js","functions/api/data-center.js","functions/api/data-center/**","functions/api/platform/v1/product-catalog.js","functions/api/platform/v1/product-catalog/**","functions/api/ecommerce-operations.js","functions/api/ecommerce-operations/**","functions/api/performance-management.js","functions/api/performance-management/**","functions/api/hr-management/**","functions/api/auth/**","functions/api/dingtalk/org/**","functions/api/platform/_shared/productionDataAccess.js","functions/api/platform/_shared/platformCredentials.js","functions/api/platform/_shared/credential*.js","functions/api/platform/v1/platform-connections.js","functions/api/platform/v1/credential-vault.js","functions/api/platform/v1/credential-vault/**","functions/api/platform/v1/data-standards/**","functions/api/platform/v1/_shared/dataStandards*.js","functions/api/platform/v1/production-data/**","functions/api/platform/v1/collaboration-items/**","functions/api/platform/v1/user-insights.js","functions/api/platform/v1/user-insights/**","functions/api/platform/v1/ai/**","functions/api/platform/v1/_shared/collaborationStorage.js","migrations/**","migrations/0002_hr_management_core.sql","migrations/0003_product_catalog.sql","migrations/0003_platform_credentials.sql","migrations/0003_data_center_credentials.sql","migrations/0004_data_standards.sql","migrations/0005_user_insights.sql","migrations/0005_goods_flow_core.sql","migrations/0006_product_catalog_components.sql"],"envVars":["PRODUCT_FLOW_DB"],"domains":["api.cloudflare.com","dash.cloudflare.com"],"apiRoutes":["/api/state","/api/platform","/api/supply-chain","/api/platform/v1/goods-flow/","/api/sales","/api/data-center","/api/platform/v1/data-services/sales","/api/platform/v1/product-catalog","/api/platform/v1/product-catalog/import","/api/platform/v1/product-catalog/sync/kuaimai","/api/ecommerce-operations","/api/performance-management","/api/hr-management","/api/platform/v1/environment-readiness","/api/platform/v1/platform-connections","/api/platform/v1/credential-vault","/api/platform/v1/data-standards","/api/platform/v1/production-write-session","/api/platform/v1/production-data/","/api/platform/v1/collaboration-items","/api/platform/v1/user-insights","/api/platform/v1/user-insights/","/api/platform/v1/ai/"],"publicDocs":[{"label":"Cloudflare D1 入门","url":"https://developers.cloudflare.com/d1/get-started/"},{"label":"Pages D1 绑定","url":"https://developers.cloudflare.com/pages/functions/bindings/"}],"evidence":["functions/api/state.js","functions/api/platform.js","functions/api/supply-chain.js","functions/api/supply-chain/","functions/api/platform/v1/goods-flow/","functions/api/platform/v1/data-services/sales.js","functions/api/sales.js","functions/api/data-center.js","functions/api/data-center/","functions/api/platform/v1/product-catalog.js","functions/api/platform/v1/product-catalog/","functions/api/ecommerce-operations.js","functions/api/ecommerce-operations/","functions/api/performance-management.js","functions/api/performance-management/","functions/api/hr-management/","functions/api/platform/_shared/productionDataAccess.js","functions/api/platform/_shared/platformCredentials.js","functions/api/platform/_shared/credentialVaultStorage.js","functions/api/platform/_shared/credentialCrypto.js","functions/api/platform/v1/platform-connections.js","functions/api/platform/v1/credential-vault/","functions/api/platform/v1/_shared/collaborationStorage.js","functions/api/platform/v1/_shared/dataStandardsStorage.js","functions/api/platform/v1/user-insights.js","functions/api/platform/v1/user-insights/","functions/api/platform/v1/ai/","docs/platform/apis/data-services-sales-v1.md","migrations/0001_production_data_access.sql","migrations/0002_business_data_apps.sql","migrations/0002_collaboration_execution.sql","migrations/0002_hr_management_core.sql","migrations/0003_product_catalog.sql","migrations/0003_platform_credentials.sql","migrations/0003_data_center_credentials.sql","migrations/0003_company_ai_assistant.sql","migrations/0004_data_standards.sql","migrations/0004_company_ai_skills.sql","migrations/0005_user_insights.sql","migrations/0005_goods_flow_core.sql","migrations/0006_shared_state_revision.sql","migrations/0006_product_catalog_components.sql"],"relations":[{"platformId":"cloudflare-pages","type":"bound-to","description":"D1 通过 Pages Functions 的环境绑定提供服务。"},{"platformId":"dingtalk","type":"stores-data-for","description":"保存钉钉会话、组织和用户令牌相关数据。"},{"platformId":"kuaimai","type":"stores-data-for","description":"保存快麦同步后的销售聚合与共享商品目录。"}]},{"id":"aliyun","name":"阿里云","status":"integrating","summary":"用于相邻服务、存储或基础设施能力，当前仍需逐项确认账号、资源和生产边界。","capabilities":["云资源","对象存储","OpenAPI","基础设施"],"businessQuestions":["阿里云资源属于哪个账号","服务部署在哪里","OpenAPI 权限如何申请","资源与 Cloudflare 的边界"],"keywords":["阿里云","Aliyun","Alibaba Cloud","OSS","OpenAPI","云服务器","开放平台"],"codePaths":["docs/platform/integrations.md","docs/decisions/**"],"envVars":[],"domains":["aliyun.com","aliyuncs.com","help.aliyun.com"],"apiRoutes":[],"publicDocs":[{"label":"阿里云帮助中心","url":"https://help.aliyun.com/"},{"label":"阿里云 OpenAPI","url":"https://help.aliyun.com/zh/openapi/api-overview/"}],"evidence":["docs/platform/integrations.md"],"relations":[{"platformId":"cloudflare-pages","type":"deployment-boundary","description":"新增云资源前需明确它与现有 Pages 生产环境的职责边界。"}]},{"id":"erp-file-import","name":"ERP / 文件导入","status":"integrating","summary":"承接销售明细、ERP 商品档案、库存单位编码、库存快照和月度盘点文件；快麦原始文件在公司 Mac 哈希归档，线上只接收脱敏最小索引和共享业务投影，作为 API 同步的校准、补齐和兼容通道。","capabilities":["快麦官方文件历史补数","本地原始归档","销售明细导入","商品档案导入","库存单位编码","组合关系补齐","ERP 库存快照导入","月度盘点导入","GB18030 CSV","字段映射","内容哈希幂等","固定范围采集令牌","导入异常审计","整月重导","数据校准"],"businessQuestions":["Excel 或 CSV 导入失败","库存单位编码或供应商字段缺失","内部唯一码被误判","组合比例不一致","库存或盘点字段口径不一致","历史数据补录","API 与文件结果不同"],"keywords":["ERP","Excel","文件导入","销售明细","数据校准"],"codePaths":["src/features/settings/SalesDataSettings.jsx","src/features/data-center/ProductCatalogWorkspace.jsx","src/features/supply-chain/InventoryWorkspace.jsx","src/domain/kuaimaiErpCollection.js","src/domain/salesData.js","src/domain/productCatalog.js","src/domain/productCatalogGraph.js","src/domain/xlsxLite.js","src/domain/supplyChain.js","src/state/salesStore.js","functions/api/sales.js","functions/api/platform/v1/erp-collection/**","functions/api/platform/v1/product-catalog/import.js","functions/api/platform/v1/goods-flow/imports.js","scripts/kuaimai-erp-collector/**",".agents/skills/kuaimai-erp-data-collection/**","migrations/0006_product_catalog_components.sql","migrations/0007_kuaimai_erp_collection.sql","docs/features/kuaimai-erp-history/**"],"envVars":[],"domains":[],"apiRoutes":["/api/sales","/api/platform/v1/erp-collection/ingest","/api/platform/v1/erp-collection/archives","/api/platform/v1/erp-collection/runners","/api/platform/v1/product-catalog/import","/api/platform/v1/goods-flow/imports"],"publicDocs":[],"evidence":["src/features/settings/SalesDataSettings.jsx","src/features/data-center/ProductCatalogWorkspace.jsx","src/features/supply-chain/InventoryWorkspace.jsx","src/domain/kuaimaiErpCollection.js","src/domain/salesData.js","src/domain/productCatalog.js","src/domain/productCatalogGraph.js","src/domain/xlsxLite.js","src/domain/supplyChain.js","functions/api/platform/v1/erp-collection/ingest.js","scripts/kuaimai-erp-collector/core.mjs",".agents/skills/kuaimai-erp-data-collection/SKILL.md","docs/platform/apis/erp-collection-v1.md","docs/features/kuaimai-erp-history/prd.md","migrations/0006_product_catalog_components.sql","migrations/0007_kuaimai_erp_collection.sql"],"relations":[{"platformId":"kuaimai","type":"primary-history-channel-for","description":"官方导出文件承接快麦开放平台无法完整覆盖的历史数据。"},{"platformId":"cloudflare-d1","type":"stores-imports","description":"导入归档清单、批次、最小索引、异常、聚合销售结果和标准化商品目录通过内部 API 写入 D1；完整原文件不进入 D1。"}]},{"id":"taobao-open-platform","name":"淘宝开放平台","status":"planned","summary":"计划评估淘宝商品、订单或店铺数据能力，尚未接入。","capabilities":["商品数据","订单数据","店铺数据"],"businessQuestions":["淘宝数据能否自动同步","应用权限和授权主体","与快麦数据是否重复"],"keywords":["淘宝","天猫","Taobao","TOP","开放平台","店铺"],"codePaths":[],"envVars":[],"domains":["open.taobao.com"],"apiRoutes":[],"publicDocs":[{"label":"淘宝开放平台","url":"https://open.taobao.com/"}],"evidence":[],"relations":[{"platformId":"kuaimai","type":"possible-overlap","description":"接入前需确认订单口径是否已经由快麦覆盖。"}]},{"id":"pinduoduo-open-platform","name":"拼多多开放平台","status":"planned","summary":"计划评估拼多多商品、订单或店铺数据能力，尚未接入。","capabilities":["商品数据","订单数据","店铺数据"],"businessQuestions":["拼多多数据能否自动同步","应用权限和授权主体","与快麦数据是否重复"],"keywords":["拼多多","Pinduoduo","PDD","开放平台","店铺"],"codePaths":[],"envVars":[],"domains":["open.pinduoduo.com"],"apiRoutes":[],"publicDocs":[{"label":"拼多多开放平台","url":"https://open.pinduoduo.com/"}],"evidence":[],"relations":[{"platformId":"kuaimai","type":"possible-overlap","description":"接入前需确认订单口径是否已经由快麦覆盖。"}]},{"id":"xiaohongshu-open-platform","name":"小红书开放平台","status":"planned","summary":"计划评估小红书内容、电商或分享能力，尚未接入。","capabilities":["内容分享","电商数据","应用授权"],"businessQuestions":["能否发布或同步内容","电商数据权限","商家自研应用如何授权"],"keywords":["小红书","Xiaohongshu","RED","种草","开放平台","内容"],"codePaths":[],"envVars":[],"domains":["xiaohongshu.com","xiaohongshu.apifox.cn"],"apiRoutes":[],"publicDocs":[{"label":"小红书开放平台应用开发","url":"https://xiaohongshu.apifox.cn/doc-2810909"},{"label":"小红书分享开放平台","url":"https://agora.xiaohongshu.com/"}],"evidence":[],"relations":[{"platformId":"oceanengine-qianchuan","type":"content-to-advertising","description":"内容与投放协同时需区分自然内容平台和付费投放平台的数据口径。"}]},{"id":"ugreen-nas","name":"绿联 NAS / UGOS Pro","status":"planned","summary":"计划通过公司 Mac 的 SMB/WebDAV 挂载和只读索引器关联品牌内容素材；官方未提供 MCP Server，MCP 仅作为可选文件搜索入口。","capabilities":["SMB 文件访问","WebDAV 文件访问","Docker 应用","NAS 用户认证","素材目录索引"],"businessQuestions":["品牌素材目录如何只读索引","NAS 离线和文件移动如何恢复","AI 文件搜索是否需要可选 MCP"],"keywords":["绿联 NAS","UGREEN NAS","UGOS Pro","NAS","SMB","WebDAV","素材目录","文件索引"],"codePaths":[],"envVars":[],"domains":["developer.ugnas.com","ugnas.com"],"apiRoutes":[],"publicDocs":[{"label":"绿联云开发者平台","url":"https://developer.ugnas.com/"},{"label":"UGOS Pro Docker 应用开发","url":"https://developer.ugnas.com/en/doc/backend/quick-start/develop-docker-app.html"},{"label":"绿联 NAS WebDAV 指南","url":"https://ai.ugreen.com/blogs/how-to/access-ugreen-nas-files-via-webdav"}],"evidence":[],"relations":[{"platformId":"oceanengine-qianchuan","type":"asset-to-performance","description":"NAS 内容资产通过内容主键和素材 ID 与投放表现关联，不能直接以文件名猜测归因。"}]},{"id":"oceanengine-qianchuan","name":"巨量引擎 / 巨量千川","status":"planned","summary":"计划评估广告计划、素材和投放报表能力，尚未接入。","capabilities":["广告计划","素材管理","投放报表","商品库"],"businessQuestions":["千川投放数据能否自动同步","素材表现如何归因","账户权限如何申请"],"keywords":["巨量引擎","巨量千川","千川","Ocean Engine","广告投放","素材","开放平台"],"codePaths":[],"envVars":[],"domains":["open.oceanengine.com","qianchuan.jinritemai.com"],"apiRoutes":[],"publicDocs":[{"label":"巨量引擎商业开放平台","url":"https://open.oceanengine.com/labels"}],"evidence":[],"relations":[{"platformId":"xiaohongshu-open-platform","type":"cross-channel-content","description":"跨渠道素材分析需要区分平台内容与投放数据口径。"}]},{"id":"browser-market-collector","name":"浏览器市场采集器","status":"connected","summary":"公司 Mac 通过 Chrome 调试协议只读采集已登记、已确认的平台市场类目页面，并写入用户洞察标准事实。","capabilities":["工作日采集","已登记页面白名单","用户市场","商品市场","视频市场","直播市场","页面结构版本","登录失效停止","幂等批次"],"businessQuestions":["平台市场数据没有更新","页面要求重新登录","页面字段发生变化","类目尚未确认","采集器未连接","周末为什么未自动采集"],"keywords":["用户洞察","浏览器采集","市场","类目","竞品","Chrome","CDP"],"codePaths":["scripts/user-insights-collector/**","functions/api/platform/v1/user-insights.js","functions/api/platform/v1/user-insights/**","src/domain/userInsights.js","src/state/userInsightsApi.js","src/state/UserInsightsProvider.jsx","src/features/data-center/UserInsightsWorkspace.jsx","src/features/data-center/user-insights.css","docs/features/user-insights/**","docs/platform/apis/user-insights-v1.md","docs/platform/browser-market-collection.md","migrations/0005_user_insights.sql"],"envVars":[],"domains":[],"apiRoutes":["/api/platform/v1/user-insights","/api/platform/v1/user-insights/collector","/api/platform/v1/user-insights/ingest"],"publicDocs":[],"evidence":["scripts/user-insights-collector/","functions/api/platform/v1/user-insights.js","functions/api/platform/v1/user-insights/","src/domain/userInsights.js","src/state/userInsightsApi.js","src/state/UserInsightsProvider.jsx","src/features/data-center/UserInsightsWorkspace.jsx","docs/features/user-insights/","migrations/0005_user_insights.sql"],"relations":[{"platformId":"cloudflare-pages","type":"writes-through","description":"采集器只能通过受限 Pages Functions ingest 契约写入，不能直连 D1。"},{"platformId":"cloudflare-d1","type":"stores-standard-facts","description":"D1 只保存标准事实、规则、质量和审计，不保存完整页面、Cookie 或凭证。"}]},{"id":"lingsuan-ai-gateway","name":"灵算 AI 网关","status":"connected","summary":"为公司统一 AI 提供服务端 Responses 兼容调用；凭据优先来自平台连接保险箱，业务 App 不直连 Provider。","capabilities":["Responses 流式生成","非流式业务调用","固定模型配置","原生 Function Calling 能力探测","服务端受控 Skill 路由","公司只读 Skills","App 与功能归属审计","Token 与 Skill 聚合","规则降级","合成连接测试","无留存请求参数","安全错误映射"],"businessQuestions":["AI 大模型不可用","模型服务连接失败","哪些 App 和功能使用 AI","Token 消耗多少","Skill 调用失败","响应超时或限流","公司数据能否外发","密钥是否安全"],"keywords":["灵算","LingSuan","AI 大模型","AI 总助","AI 点评","Token","Responses API","Function Calling","Skills","LINGSUAN_API_KEY"],"codePaths":["functions/api/platform/v1/ai/**","functions/api/ecommerce-operations/ai-review.js","functions/api/platform/_shared/platformConnectionTesters.js","src/domain/aiAssistant.js","src/domain/aiModelGovernance.js","src/domain/platformConnections.js","src/state/aiAssistant*.js","src/state/aiModelGovernanceApi.js","src/features/ai-assistant/**","src/features/data-center/AiModelWorkspace.jsx","src/features/data-center/AiProviderSettings.jsx","migrations/0003_company_ai_assistant.sql","migrations/0004_company_ai_skills.sql","migrations/0009_ai_model_governance.sql"],"envVars":["AI_ASSISTANT_ENABLED","LINGSUAN_API_KEY","LINGSUAN_ACTOR_AUTHORIZATION"],"domains":["lingsuan.top"],"apiRoutes":["/api/platform/v1/ai/status","/api/platform/v1/ai/provider","/api/platform/v1/ai/provider/test","/api/platform/v1/ai/chat","/api/platform/v1/ai/usage","/api/ecommerce-operations/ai-review"],"publicDocs":[{"label":"灵算 AI API Gateway","url":"https://lingsuan.top/"}],"evidence":["src/domain/aiAssistant.js","src/domain/aiModelGovernance.js","src/features/data-center/AiModelWorkspace.jsx","functions/api/platform/v1/ai/_shared/invoke-feature.js","functions/api/platform/v1/ai/_shared/routed-skill-fallback.js","functions/api/platform/v1/ai/usage.js","functions/api/ecommerce-operations/ai-review.js","react-tests/ai-model-governance.test.mjs","tests/ai-feature-invocation.test.mjs","tests/ai-usage-api.test.mjs","tests/ai-skill-loop.test.mjs","migrations/0003_company_ai_assistant.sql","migrations/0004_company_ai_skills.sql","migrations/0009_ai_model_governance.sql"],"relations":[{"platformId":"cloudflare-pages","type":"called-by","description":"Pages Functions 在服务端调用 Provider，浏览器不接触密钥或公司上下文。"},{"platformId":"cloudflare-d1","type":"governed-by","description":"D1 保存 Provider 安全元数据、外发策略、并发租约和无内容审计。"}]},{"id":"kuaishou-ecosystem","name":"快手生态","status":"planned","summary":"计划接入快手小店和广告账户的经营与投放数据，尚未接入。","capabilities":["店铺订单","商品数据","经营报表","广告数据","网页导出"],"businessQuestions":["快手小店与广告账户如何区分","登录验证如何处理","经营和投放口径如何关联"],"keywords":["快手","快手小店","磁力引擎","Kuaishou","店铺后台"],"codePaths":[],"envVars":[],"domains":[],"apiRoutes":[],"publicDocs":[],"evidence":[],"relations":[{"platformId":"kuaimai","type":"possible-overlap","description":"接入前需确认快手订单是否已由快麦覆盖。"}]},{"id":"jd-jingmai","name":"京东 / 京麦","status":"planned","summary":"计划接入京东店铺和京麦后台的订单、商品与经营数据，尚未接入。","capabilities":["店铺订单","商品数据","经营报表","网页导出"],"businessQuestions":["京麦账号如何授权","扫码或设备验证如何处理","与快麦订单是否重复"],"keywords":["京东","京麦","JD","Jingmai","店铺后台"],"codePaths":[],"envVars":[],"domains":[],"apiRoutes":[],"publicDocs":[],"evidence":[],"relations":[{"platformId":"kuaimai","type":"possible-overlap","description":"接入前需确认京东订单是否已由快麦覆盖。"}]}]'),Oe={platforms:Ce},je=["connected","integrating","planned","retired"],ke=a=>String(a??"").replace(/\s+/g," ").trim().toLocaleLowerCase("zh-CN");function be(a,e=[]){const s=new Map((Array.isArray(e)?e:[]).filter(t=>t?.platformId).map(t=>[t.platformId,t]));return(a?.platforms||[]).map(t=>({...t,internal:s.get(t.id)||null}))}function ye(a,{query:e="",status:s="all"}={}){const t=ke(e);return(a||[]).filter(l=>s!=="all"&&l.status!==s?!1:t?[l.id,l.name,l.summary,...l.capabilities||[],...l.businessQuestions||[],...l.keywords||[]].join(`
`).toLocaleLowerCase("zh-CN").includes(t):!0)}function xe(a){const e=Object.fromEntries(["all",...je].map(s=>[s,0]));for(const s of a||[])e.all+=1,Object.hasOwn(e,s.status)&&(e[s.status]+=1);return e}function Le(a,e){const s=new Map((a||[]).map(t=>[t.id,t]));return(e?.relations||[]).flatMap(t=>{const l=s.get(t.platformId);return l?[{...t,platform:l}]:[]})}function Ue(a,{now:e=new Date,staleDays:s=180}={}){const t=Date.parse(`${a?.verifiedAt||""}T00:00:00Z`);return Number.isNaN(t)?!0:(e.getTime()-t)/864e5>s}const we="https://product-flow-system.pages.dev/api/platform/v1/integrations";function nn(a=""){return["localhost","127.0.0.1","::1"].includes(a)?we:"/api/platform/v1/integrations"}async function en(a){const e=await a.json().catch(()=>({}));if(!a.ok)throw new Error(e.message||`内部平台资料请求失败（HTTP ${a.status}）。`);return e}async function Me({hostname:a="",fetchImpl:e=fetch}={}){try{const s=await e(nn(a),{credentials:"include"}),t=await en(s);return Array.isArray(t.profiles)?t.profiles:[]}catch(s){throw s?.message&&!/failed to fetch|networkerror/i.test(s.message)?s:new Error("无法连接内部平台资料服务。")}}async function Ge(a,{hostname:e="",fetchImpl:s=fetch}={}){try{const t=await s(nn(e),{method:"PUT",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify(a)});return(await en(t)).profile}catch(t){throw t?.message&&!/failed to fetch|networkerror/i.test(t.message)?t:new Error("无法连接内部平台资料服务。")}}const j=[{id:"all",label:"全部"},{id:"connected",label:"已连接"},{id:"integrating",label:"集成中"},{id:"planned",label:"计划中"},{id:"retired",label:"已停用"}],Ve={consoleUrl:"",accountSubject:"",resourceNamesText:"",environmentsText:"",owner:"",permissionGuide:"",runbook:"",verifiedAt:""};function Fe(a){return a?{consoleUrl:a.consoleUrl||"",accountSubject:a.accountSubject||"",resourceNamesText:(a.resourceNames||[]).join(`
`),environmentsText:(a.environments||[]).map(e=>[e.name,e.url,e.notes].join(" | ")).join(`
`),owner:a.owner||"",permissionGuide:a.permissionGuide||"",runbook:a.runbook||"",verifiedAt:a.verifiedAt||""}:Ve}function Ke(a,e){return{platformId:a,consoleUrl:e.consoleUrl,accountSubject:e.accountSubject,resourceNames:e.resourceNamesText.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),environments:e.environmentsText.split(/\r?\n/).flatMap(s=>{const[t="",l="",...o]=s.split("|").map(u=>u.trim());return t?[{name:t,url:l,notes:o.join(" | ")}]:[]}),owner:e.owner,permissionGuide:e.permissionGuide,runbook:e.runbook,verifiedAt:e.verifiedAt}}function Ye({platform:a,saving:e,error:s,onCancel:t,onSave:l}){const[o,u]=d.useState(()=>Fe(a.internal)),p=(r,A)=>u(I=>({...I,[r]:A}));return n.jsxs("form",{className:"integration-profile-editor",onSubmit:r=>{r.preventDefault(),l(Ke(a.id,o))},children:[n.jsxs("div",{className:"integration-editor-heading",children:[n.jsxs("div",{children:[n.jsx("strong",{children:"维护内部资料"}),n.jsx("p",{children:"只填写入口、主体、资源和责任信息；凭据必须保存在密钥管理系统。"})]}),n.jsx("button",{className:"icon-action",type:"button","aria-label":"关闭编辑",onClick:t,disabled:e,children:n.jsx(G,{size:16,"aria-hidden":"true"})})]}),n.jsxs("div",{className:"integration-form-grid",children:[n.jsxs("label",{children:[n.jsx("span",{children:"内部控制台 URL"}),n.jsx("input",{type:"url",value:o.consoleUrl,onChange:r=>p("consoleUrl",r.target.value),placeholder:"https://"})]}),n.jsxs("label",{children:[n.jsx("span",{children:"账号主体"}),n.jsx("input",{value:o.accountSubject,onChange:r=>p("accountSubject",r.target.value),placeholder:"公司或业务主体"})]}),n.jsxs("label",{children:[n.jsx("span",{children:"负责人"}),n.jsx("input",{value:o.owner,onChange:r=>p("owner",r.target.value),placeholder:"姓名或岗位"})]}),n.jsxs("label",{children:[n.jsx("span",{children:"最近验证日期"}),n.jsx("input",{type:"date",value:o.verifiedAt,onChange:r=>p("verifiedAt",r.target.value)})]}),n.jsxs("label",{className:"span-2",children:[n.jsx("span",{children:"应用 / 实例 / 店铺名称"}),n.jsx("textarea",{rows:"3",value:o.resourceNamesText,onChange:r=>p("resourceNamesText",r.target.value),placeholder:"每行一个名称"})]}),n.jsxs("label",{className:"span-2",children:[n.jsx("span",{children:"环境"}),n.jsx("textarea",{rows:"3",value:o.environmentsText,onChange:r=>p("environmentsText",r.target.value),placeholder:"生产 | https://example.com/ | 钉钉工作台"}),n.jsx("small",{children:"每行格式：环境名 | HTTPS URL | 说明"})]}),n.jsxs("label",{className:"span-2",children:[n.jsx("span",{children:"权限申请路径"}),n.jsx("textarea",{rows:"2",value:o.permissionGuide,onChange:r=>p("permissionGuide",r.target.value)})]}),n.jsxs("label",{className:"span-2",children:[n.jsx("span",{children:"内部运行手册"}),n.jsx("textarea",{rows:"2",value:o.runbook,onChange:r=>p("runbook",r.target.value),placeholder:"知识库位置或简短操作说明"})]})]}),s?n.jsx("p",{className:"integration-form-error",role:"alert",children:s}):null,n.jsxs("div",{className:"integration-editor-actions",children:[n.jsx("button",{className:"btn",type:"button",onClick:t,disabled:e,children:"取消"}),n.jsx("button",{className:"btn primary",type:"submit",disabled:e,children:e?"正在保存…":"保存内部资料"})]})]})}function Be({platform:a,loading:e}){if(e)return n.jsxs("div",{className:"integration-profile-loading","aria-busy":"true",children:[n.jsx("span",{}),n.jsx("span",{}),n.jsx("span",{}),n.jsx("small",{children:"正在读取内部资料…"})]});const s=a.internal;return s?n.jsxs("div",{className:"integration-profile-content",children:[Ue(s)?n.jsxs("p",{className:"integration-stale",children:[n.jsx(O,{size:15,"aria-hidden":"true"}),"资料超过 180 天未验证，请联系负责人复核。"]}):null,n.jsxs("dl",{children:[n.jsxs("div",{children:[n.jsx("dt",{children:"账号主体"}),n.jsx("dd",{children:s.accountSubject||"未填写"})]}),n.jsxs("div",{children:[n.jsx("dt",{children:"负责人"}),n.jsx("dd",{children:s.owner||"未填写"})]}),n.jsxs("div",{children:[n.jsx("dt",{children:"最近验证"}),n.jsx("dd",{children:s.verifiedAt||"未验证"})]}),n.jsxs("div",{children:[n.jsx("dt",{children:"维护人"}),n.jsx("dd",{children:s.updatedBy||"未知"})]})]}),s.consoleUrl?n.jsxs("a",{className:"integration-console-link",href:s.consoleUrl,target:"_blank",rel:"noreferrer",children:["打开内部控制台 ",n.jsx(Q,{size:14,"aria-hidden":"true"})]}):null,s.resourceNames?.length?n.jsxs("div",{className:"integration-internal-block",children:[n.jsx("strong",{children:"应用 / 实例 / 店铺"}),n.jsx("ul",{children:s.resourceNames.map(t=>n.jsx("li",{children:t},t))})]}):null,s.environments?.length?n.jsxs("div",{className:"integration-internal-block",children:[n.jsx("strong",{children:"环境"}),n.jsx("ul",{children:s.environments.map(t=>n.jsxs("li",{children:[n.jsx("b",{children:t.name}),t.url?n.jsx("a",{href:t.url,target:"_blank",rel:"noreferrer",children:t.url}):null,t.notes?n.jsx("span",{children:t.notes}):null]},`${t.name}-${t.url}`))})]}):null,s.permissionGuide?n.jsxs("div",{className:"integration-internal-block",children:[n.jsx("strong",{children:"权限申请路径"}),n.jsx("p",{children:s.permissionGuide})]}):null,s.runbook?n.jsxs("div",{className:"integration-internal-block",children:[n.jsx("strong",{children:"内部运行手册"}),n.jsx("p",{children:s.runbook})]}):null]}):n.jsxs("div",{className:"integration-profile-empty",children:[n.jsx(z,{size:17,"aria-hidden":"true"}),n.jsxs("div",{children:[n.jsx("strong",{children:"内部资料尚未维护"}),n.jsx("p",{children:"平台管理员可补充控制台、账号主体、负责人和运行手册。"})]})]})}function He({sessionUser:a}){const[e,s]=d.useState([]),[t,l]=d.useState("loading"),[o,u]=d.useState(""),[p,r]=d.useState(""),[A,I]=d.useState("all"),[f,S]=d.useState("dingtalk"),[D,T]=d.useState(!1),[P,c]=d.useState(!1),[m,h]=d.useState(""),[R,C]=d.useState("");d.useEffect(()=>{let i=!0;return Me({hostname:window.location.hostname}).then(v=>{i&&(s(v),l("ready"))}).catch(v=>{i&&(u(v?.message||"内部资料暂不可用。"),l("error"))}),()=>{i=!1}},[]);const E=d.useMemo(()=>be(Oe,e),[e]),g=d.useMemo(()=>xe(E),[E]),N=d.useMemo(()=>ye(E,{query:p,status:A}),[E,p,A]),_=N.find(i=>i.id===f)||N[0]||null,F=d.useMemo(()=>Le(E,_),[E,_]),an=q(a)&&a?.role!=="readonly",sn=i=>{S(i),T(!1),h(""),C("")},tn=async i=>{c(!0),h(""),C("");try{const v=await Ge(i,{hostname:window.location.hostname});s(on=>[...on.filter(rn=>rn.platformId!==v.platformId),v]),T(!1),C("内部资料已保存。公开注册表未被修改。")}catch(v){h(v?.message||"内部平台资料保存失败。")}finally{c(!1)}};return n.jsxs("section",{className:"integration-map","aria-label":"外部平台地图",children:[t==="error"?n.jsxs("div",{className:"integration-degraded",role:"status",children:[n.jsx(O,{size:17,"aria-hidden":"true"}),n.jsxs("div",{children:[n.jsx("strong",{children:"内部资料暂不可用"}),n.jsxs("p",{children:[o," 公开平台资料仍可正常查看。"]})]})]}):null,n.jsxs("div",{className:"integration-map-toolbar",children:[n.jsxs("label",{className:"integration-map-search",children:[n.jsx(x,{size:16,"aria-hidden":"true"}),n.jsx("span",{className:"sr-only",children:"搜索平台、能力或问题"}),n.jsx("input",{type:"search",value:p,onChange:i=>r(i.target.value),placeholder:"搜索平台、能力或问题"}),p?n.jsx("button",{type:"button","aria-label":"清除平台搜索",onClick:()=>r(""),children:n.jsx(G,{size:15,"aria-hidden":"true"})}):null]}),n.jsx("div",{className:"integration-status-filters","aria-label":"平台状态筛选",children:j.map(i=>n.jsxs("button",{type:"button","aria-pressed":A===i.id,className:A===i.id?"active":"",onClick:()=>I(i.id),children:[i.label,n.jsx("span",{children:g[i.id]})]},i.id))})]}),N.length?n.jsxs("div",{className:"integration-map-workspace",children:[n.jsx("nav",{className:"integration-platform-list","aria-label":"外部平台",children:N.map(i=>n.jsxs("button",{type:"button",className:_?.id===i.id?"active":"","aria-current":_?.id===i.id?"true":void 0,onClick:()=>sn(i.id),children:[n.jsx("span",{className:`integration-status-dot ${i.status}`,"aria-hidden":"true"}),n.jsxs("span",{children:[n.jsx("strong",{children:i.name}),n.jsx("small",{children:i.capabilities.slice(0,2).join(" · ")})]}),n.jsx("em",{className:`integration-status-label ${i.status}`,children:j.find(v=>v.id===i.status)?.label})]},i.id))}),n.jsxs("div",{className:"integration-platform-detail",children:[n.jsxs("header",{className:"integration-detail-header",children:[n.jsxs("div",{children:[n.jsxs("div",{className:"integration-detail-title",children:[n.jsx("h2",{children:_.name}),n.jsx("span",{className:`integration-status-label ${_.status}`,children:j.find(i=>i.id===_.status)?.label})]}),n.jsx("p",{children:_.summary})]}),an&&!D?n.jsxs("button",{className:"btn compact",type:"button",onClick:()=>{T(!0),h("")},children:[n.jsx(mn,{size:14,"aria-hidden":"true"}),"维护内部资料"]}):null]}),R?n.jsxs("p",{className:"integration-save-success",role:"status",children:[n.jsx(_n,{size:15,"aria-hidden":"true"}),R]}):null,n.jsxs("section",{className:"integration-detail-section",children:[n.jsx("h3",{children:"能力与常见问题"}),n.jsx("div",{className:"integration-capabilities",children:_.capabilities.map(i=>n.jsx("span",{children:i},i))}),n.jsx("ul",{className:"integration-question-list",children:_.businessQuestions.map(i=>n.jsx("li",{children:i},i))})]}),n.jsxs("section",{className:"integration-detail-section",children:[n.jsx("h3",{children:"关联关系"}),F.length?n.jsx("ul",{className:"integration-relation-list",children:F.map(i=>n.jsxs("li",{children:[n.jsx(An,{size:15,"aria-hidden":"true"}),n.jsxs("div",{children:[n.jsx("strong",{children:i.platform.name}),n.jsx("p",{children:i.description})]}),n.jsx("span",{children:j.find(v=>v.id===i.platform.status)?.label})]},`${i.platform.id}-${i.type}`))}):n.jsx("p",{children:"当前没有登记的一层关联平台。"})]}),n.jsxs("section",{className:"integration-detail-section",children:[n.jsx("h3",{children:"官方公开文档"}),_.publicDocs.length?n.jsx("div",{className:"integration-public-links",children:_.publicDocs.map(i=>n.jsxs("a",{href:i.url,target:"_blank",rel:"noreferrer",children:[i.label,n.jsx(Q,{size:14,"aria-hidden":"true"})]},i.url))}):n.jsx("p",{children:"该能力是内部文件导入边界，没有独立的外部官方文档。"})]}),n.jsxs("section",{className:"integration-detail-section integration-private-section",children:[n.jsxs("div",{className:"integration-section-heading",children:[n.jsx("h3",{children:"公司内部资料"}),n.jsx("span",{children:"登录后可见"})]}),D?n.jsx(Ye,{platform:_,saving:P,error:m,onCancel:()=>{T(!1),h("")},onSave:tn},_.id):n.jsx(Be,{platform:_,loading:t==="loading"})]})]})]}):n.jsxs("div",{className:"integration-map-empty",children:[n.jsx(x,{size:22,"aria-hidden":"true"}),n.jsx("strong",{children:"没有匹配的平台"}),n.jsx("p",{children:"换一个关键词，或清除状态筛选查看全部平台。"}),n.jsx("button",{className:"btn",type:"button",onClick:()=>{r(""),I("all")},children:"查看全部平台"})]})]})}async function b(a,e){const s=await fetch(a,e),t=await s.json().catch(()=>({}));if(!s.ok){const l=new Error(t.message||`环境状态请求失败（HTTP ${s.status}）。`);throw l.code=t.error?.code||"ENVIRONMENT_REQUEST_FAILED",l}return t}function We(){return b("/api/platform/v1/environment-readiness")}function qe({reason:a,confirmation:e}){return b("/api/platform/v1/production-write-session",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({reason:a,confirmation:e})})}function Qe(){return b("/api/platform/v1/production-write-session",{method:"DELETE"})}function ze({auditId:a,confirmation:e}){return b("/api/platform/v1/production-data/rollback",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({auditId:a,confirmation:e})})}const $e={development:"本地测试",preview:"预览环境",production:"生产环境"},Je={ready:"已就绪",warning:"有警告",blocked:"阻断"},Xe={PRODUCT_FLOW_DB:"公司数据库连接",PLATFORM_CREDENTIAL_MASTER_KEY:"平台连接安全保护",DINGTALK_APP_KEY:"钉钉应用凭证",DINGTALK_APP_SECRET:"钉钉应用密钥",KUAIMAI_APP_KEY:"快麦应用凭证",KUAIMAI_APP_SECRET:"快麦应用密钥",KUAIMAI_ACCESS_TOKEN:"快麦访问授权"};function Ze(a){return Xe[a]||(String(a).includes("_")?"系统运行配置":a)}function na(a=[]){const e=[...new Set(a.filter(s=>["dingtalk","kuaimai"].includes(s)))];return e.length===1&&e[0]==="dingtalk"?"#/data-sources/company":e.length===1&&e[0]==="kuaimai"?"#/data-sources/erp":"#/data-sources"}function ea({status:a}){return a==="ready"?n.jsx(J,{size:17,"aria-hidden":"true"}):a==="warning"?n.jsx(O,{size:17,"aria-hidden":"true"}):n.jsx($,{size:17,"aria-hidden":"true"})}function aa(){return n.jsxs("div",{className:"environment-loading","aria-busy":"true","aria-label":"正在检查环境状态",children:[n.jsx("span",{}),n.jsx("span",{}),n.jsx("span",{}),n.jsx("p",{children:"正在核对环境变量、数据库绑定和平台能力…"})]})}function sa({capabilities:a=[]}){return n.jsxs("section",{className:"environment-section","aria-labelledby":"environment-capability-title",children:[n.jsx("div",{className:"environment-section-heading",children:n.jsxs("div",{children:[n.jsx("h2",{id:"environment-capability-title",children:"能力检查"}),n.jsx("p",{children:"只展示配置是否存在，不读取或显示密钥内容。"})]})}),n.jsx("div",{className:"environment-capability-grid",children:a.map(e=>n.jsxs("article",{className:`environment-capability ${e.status}`,children:[n.jsxs("div",{className:"environment-capability-heading",children:[n.jsx("span",{className:"environment-status-icon",children:n.jsx(ea,{status:e.status})}),n.jsxs("div",{children:[n.jsx("h3",{children:e.name}),n.jsx("p",{children:e.description})]}),n.jsx("strong",{children:Je[e.status]||e.status})]}),e.missing?.length?n.jsxs("div",{className:"environment-missing",children:[n.jsx("span",{children:"需要处理"}),n.jsx("ul",{children:e.missing.map(s=>n.jsx("li",{title:s,children:Ze(s)},s))}),e.platforms?.some(s=>["dingtalk","kuaimai"].includes(s))?n.jsx("a",{className:"btn compact",href:na(e.platforms),children:"前往数据接入"}):null]}):n.jsxs("p",{className:"environment-complete",children:[n.jsx(fn,{size:15,"aria-hidden":"true"}),"必要配置与表结构完整"]})]},e.id))})]})}function ta({audits:a=[],canRollback:e,busy:s,onRollback:t}){const[l,o]=d.useState(""),[u,p]=d.useState("");return a.length?n.jsx("div",{className:"environment-audit-list",children:a.map(r=>{const A=l===r.id,I=e&&r.status==="succeeded"&&r.snapshot_id;return n.jsxs("article",{className:"environment-audit-row",children:[n.jsxs("div",{children:[n.jsx("strong",{children:r.action==="rollback"?"回滚生产数据":"修改生产数据"}),n.jsx("p",{children:r.reason||"未记录原因"}),n.jsxs("small",{children:[r.name||"未知账号"," · ",new Date(r.created_at).toLocaleString("zh-CN")]})]}),n.jsx("span",{className:`environment-audit-status ${r.status}`,children:r.status==="succeeded"?"成功":r.status}),I?n.jsxs("button",{type:"button",className:"btn compact",onClick:()=>{o(A?"":r.id),p("")},disabled:s,children:[n.jsx(vn,{size:14}),"回滚"]}):null,A?n.jsxs("div",{className:"environment-rollback-confirm",children:[n.jsxs("label",{children:[n.jsx("span",{children:"输入“修改线上真实数据”确认回滚"}),n.jsx("input",{value:u,onChange:f=>p(f.target.value)})]}),n.jsx("button",{type:"button",className:"btn danger compact",disabled:s||u!=="修改线上真实数据",onClick:()=>t(r.id,u),children:"确认回滚"})]}):null]},r.id)})}):n.jsx("p",{className:"environment-audit-empty",children:"还没有跨环境生产写入记录。"})}function ia({sessionUser:a}){const[e,s]=d.useState(null),[t,l]=d.useState("loading"),[o,u]=d.useState(""),[p,r]=d.useState(!1),[A,I]=d.useState(""),[f,S]=d.useState(""),[D,T]=d.useState(""),P=d.useCallback(async()=>{l("loading"),u("");try{s(await We()),l("ready")}catch(g){u(g?.message||"环境状态暂时无法读取。"),l("error")}},[]);d.useEffect(()=>{P()},[P]);const c=e?.dataAccess||{},m=e?.environment==="development",h=q(a)&&a?.role!=="readonly",R=m&&h&&c.configured,C=d.useMemo(()=>c.expiresAt?Math.max(0,Math.ceil((Date.parse(c.expiresAt)-Date.now())/6e4)):0,[c.expiresAt]),E=async(g,N)=>{r(!0),u(""),I("");try{await g(),I(N),await P()}catch(_){u(_?.message||"操作失败，请重试。")}finally{r(!1)}};return t==="loading"&&!e?n.jsx(aa,{}):t==="error"&&!e?n.jsxs("div",{className:"environment-load-error",role:"alert",children:[n.jsx($,{size:20}),n.jsxs("div",{children:[n.jsx("strong",{children:"环境状态暂不可用"}),n.jsx("p",{children:o}),n.jsx("button",{type:"button",className:"btn",onClick:P,children:"重新检查"})]})]}):n.jsxs("section",{className:"environment-readiness","aria-label":"环境与生产数据",children:[n.jsxs("header",{className:`environment-overview ${e.ready?"ready":"blocked"}`,children:[n.jsx("div",{className:"environment-overview-icon",children:e.ready?n.jsx(J,{size:22}):n.jsx(O,{size:22})}),n.jsxs("div",{children:[n.jsx("span",{children:$e[e.environment]||e.environment}),n.jsx("h2",{children:e.ready?"生产环境配置完整":"生产环境缺少必要配置"}),n.jsx("p",{children:e.ready?"数据库、钉钉和生产数据控制能力已通过必要检查。":"存在阻断项，不能完成发布验收；请按下方缺少项补齐。"})]}),n.jsxs("button",{type:"button",className:"btn compact",onClick:P,disabled:p||t==="loading",children:[n.jsx(In,{size:14}),"重新检查"]})]}),c.unlocked?n.jsxs("div",{className:"production-write-active",role:"alert",children:[n.jsx(K,{size:19}),n.jsxs("div",{children:[n.jsx("strong",{children:"正在修改线上真实数据"}),n.jsxs("p",{children:["剩余约 ",C," 分钟 · 原因：",c.reason]})]}),n.jsx("button",{type:"button",className:"btn danger compact",disabled:p,onClick:()=>E(Qe,"生产写入已锁定。"),children:"立即锁定"})]}):null,o?n.jsx("p",{className:"environment-inline-error",role:"alert",children:o}):null,A?n.jsx("p",{className:"environment-inline-success",role:"status",children:A}):null,n.jsx(sa,{capabilities:e.capabilities}),m?n.jsxs("section",{className:"environment-section production-access-section","aria-labelledby":"production-access-title",children:[n.jsxs("div",{className:"environment-section-heading",children:[n.jsxs("div",{children:[n.jsx("h2",{id:"production-access-title",children:"生产数据访问"}),n.jsx("p",{children:"本地默认实时读取生产数据，写入必须由指定最高权限账号短时解锁。"})]}),n.jsxs("span",{className:`environment-access-badge ${c.configured?"configured":"missing"}`,children:[n.jsx(z,{size:14}),c.configured?"已连接生产数据":"未配置个人令牌"]})]}),c.configured?null:n.jsxs("div",{className:"environment-access-help",children:[n.jsx(gn,{size:18}),n.jsxs("div",{children:[n.jsx("strong",{children:"当前保持本地数据模式"}),n.jsxs("p",{children:["在被忽略的 ",n.jsx("code",{children:".env"})," 中配置 ",n.jsx("code",{children:"PRODUCTION_DATA_ACCESS_TOKEN"})," 后重启本地服务。"]})]})]}),c.configured&&!h?n.jsx("p",{className:"environment-no-permission",children:"当前账号可以查看真实数据，但没有生产写入解锁权限。"}):null,R&&!c.unlocked?n.jsxs("form",{className:"production-unlock-form",onSubmit:g=>{g.preventDefault(),E(()=>qe({reason:f,confirmation:D}),"生产写入已解锁 15 分钟。")},children:[n.jsxs("div",{className:"production-unlock-warning",children:[n.jsx(O,{size:18}),n.jsx("p",{children:"接下来的测试修改会直接写入线上数据库，并记录审计。钉钉等外部真实操作仍保持禁止。"})]}),n.jsxs("label",{children:[n.jsx("span",{children:"修改原因"}),n.jsx("input",{value:f,onChange:g=>S(g.target.value),minLength:"4",maxLength:"200",placeholder:"例如：修正测试中发现的产品状态"})]}),n.jsxs("label",{children:[n.jsx("span",{children:"输入“修改线上真实数据”确认"}),n.jsx("input",{value:D,onChange:g=>T(g.target.value)})]}),n.jsxs("button",{type:"submit",className:"btn danger",disabled:p||f.trim().length<4||D!=="修改线上真实数据",children:[n.jsx(K,{size:15}),"解锁 15 分钟生产写入"]})]}):null,n.jsxs("div",{className:"environment-audit-heading",children:[n.jsx("h3",{children:"最近生产数据审计"}),n.jsx("span",{children:"最多显示 30 条"})]}),n.jsx(ta,{audits:e.audit||[],canRollback:R&&c.unlocked,busy:p,onRollback:(g,N)=>E(()=>ze({auditId:g,confirmation:N}),"生产数据已回滚，并生成新的审计记录。")})]}):null]})}const oa=Object.fromEntries(X.map(a=>[a.id,a.label])),W={guide:"使用说明",product:"产品说明",design:"设计书",specification:"设计规格",platform:"平台能力"},ra=a=>Object.entries(oa).map(([e,s])=>({category:e,label:s,documents:a.filter(t=>t.category===e)})).filter(e=>e.documents.length);function ma({selectedSlug:a,onSelectDocument:e,sessionUser:s}){const[t,l]=d.useState(""),o=Tn(y,a,w),[u,p]=d.useState(()=>o?.category??"handbook"),r=d.useMemo(()=>Dn(y,{query:t,category:u}),[u,t]),A=d.useMemo(()=>ra(r),[r]),I=o?.slug==="platform/external-platform-map",f=o?.slug==="platform/environment-readiness",S=I||f,D=d.useMemo(()=>Pn(o?.content),[o]);d.useEffect(()=>{a&&o?.category&&p(o.category)},[o?.category,a]);const T=c=>{if(p(c),o?.category!==c){const m=y.find(h=>h.category===c);m&&e?.(m.slug)}},P=(c,m)=>{c.preventDefault(),document.getElementById(m)?.scrollIntoView({behavior:"smooth",block:"start"})};return n.jsxs("section",{className:"page handbook-page",children:[n.jsx(un,{title:"说明书",description:"公司的工作方法、产品定义、设计决策与共享平台能力，以仓库文档为准。"}),n.jsxs("div",{className:"handbook-tools",role:"search",children:[n.jsxs("label",{className:"handbook-search",children:[n.jsx(x,{size:16,"aria-hidden":"true"}),n.jsx("span",{className:"sr-only",children:"搜索说明书"}),n.jsx("input",{type:"search",value:t,onChange:c=>l(c.target.value),placeholder:"搜索说明书"}),t?n.jsx("button",{type:"button","aria-label":"清除搜索",onClick:()=>l(""),children:n.jsx(G,{size:15,"aria-hidden":"true"})}):null]}),n.jsx("div",{className:"handbook-filters","aria-label":"说明书分类",children:X.map(c=>n.jsx("button",{type:"button",className:u===c.id?"active":"","aria-pressed":u===c.id,onClick:()=>T(c.id),children:c.label},c.id))})]}),r.length&&o?n.jsxs("div",{className:`handbook-workspace${I?" platform-map-open":""}${f?" environment-readiness-open":""}`,children:[n.jsx("nav",{className:"handbook-catalog","aria-label":"说明书目录",children:A.map(c=>n.jsxs("section",{className:"handbook-catalog-group","data-category":c.category,children:[n.jsx("h2",{children:c.label}),n.jsx("div",{className:"handbook-document-list",children:c.documents.map(m=>n.jsxs("button",{type:"button",className:o.slug===m.slug?"active":"","aria-current":o.slug===m.slug?"page":void 0,onClick:()=>e?.(m.slug),children:[n.jsx("strong",{children:m.title}),n.jsx("small",{children:W[m.kind]??m.kind})]},m.slug))})]},c.category))}),n.jsxs("article",{className:`handbook-article${I?" handbook-article-platform-map":""}${f?" handbook-article-environment-readiness":""}`,children:[n.jsxs("header",{className:"handbook-document-header",children:[n.jsxs("div",{className:"handbook-document-kind",children:[n.jsx(Y,{size:15,"aria-hidden":"true"}),W[o.kind]??o.kind]}),n.jsx("h1",{children:o.title}),n.jsx("p",{children:o.summary}),n.jsxs("time",{dateTime:o.updatedAt,children:["更新于 ",o.updatedAt]})]}),I?n.jsx(He,{sessionUser:s}):f?n.jsx(ia,{sessionUser:s}):n.jsx(Rn,{content:Nn(o.content)})]}),S?null:n.jsxs("aside",{className:"handbook-toc","aria-label":"本页目录",children:[n.jsx("strong",{children:"本页目录"}),D.length?n.jsx("ol",{children:D.map(c=>n.jsx("li",{className:`level-${c.level}`,children:n.jsx("a",{href:`#${c.id}`,onClick:m=>P(m,c.id),children:c.title})},`${c.id}-${c.level}`))}):n.jsx("small",{children:"本页没有分节标题"})]})]}):n.jsxs("div",{className:"handbook-empty",children:[n.jsx(Y,{size:24,"aria-hidden":"true"}),n.jsx("strong",{children:"没有找到匹配的说明"}),n.jsx("span",{children:"换一个关键词，或返回使用手册查看现有文档。"}),n.jsx("button",{type:"button",className:"btn",onClick:()=>{l(""),T("handbook")},children:"返回使用手册"})]})]})}export{ma as default};
