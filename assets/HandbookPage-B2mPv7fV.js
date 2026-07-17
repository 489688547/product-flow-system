import{j as t,r as l}from"./react-vendor-Cdl46aim.js";import{B as A,M as R,r as D,a as C}from"./markdown-vendor-CTibGXZM.js";import{P as E}from"./PageHeader-DZv__LwJ.js";import{Q as _,X as M,g as b}from"./icons-vendor-iByO0MaW.js";const j=[{id:"all",label:"全部"},{id:"handbook",label:"员工使用手册"},{id:"product",label:"产品与设计"},{id:"platform",label:"平台能力"}],p=e=>String(e??"").replace(/\s+/g," ").trim(),m=e=>/^#{1,6}\s|^(```|~~~|>|[-*+]\s|\d+[.)]\s|\|)/.test(e),y=e=>p(e.replace(/!\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/\[([^\]]+)\]\([^)]*\)/g,"$1").replace(/[`*_~]/g,"")),U=e=>{const n=String(e??"").match(/^#\s+(.+?)\s*#*\s*$/m);return n?y(n[1]):"未命名说明"},O=e=>{const n=String(e??"").split(/\r?\n/);for(let s=0;s<n.length;s+=1){const a=n[s].trim();if(!a||m(a))continue;const r=[a];for(;n[s+1]?.trim()&&!m(n[s+1].trim());)r.push(n[s+1].trim()),s+=1;return y(r.join(" "))}return"暂无摘要"};function g(e){const n=String(e.content??"");return{...e,content:n,title:p(e.title)||U(n),summary:p(e.summary)||O(n)}}function q(e,{query:n="",category:s="all"}={}){const a=p(n).toLocaleLowerCase("zh-CN");return e.filter(r=>s&&s!=="all"&&r.category!==s?!1:a?[r.title,r.summary,r.content].join(`
`).toLocaleLowerCase("zh-CN").includes(a):!0)}function F(e,n,s){return e.length?e.find(a=>a.slug===n)??e.find(a=>a.slug===s)??e[0]:null}function L(e){const n=new A,s=[],a=/^(#{2,3})\s+(.+?)\s*#*\s*$/gm;let r;for(;(r=a.exec(String(e??"")))!==null;){const c=y(r[2]);s.push({level:r[1].length,title:c,id:n.slug(c)})}return s}function N(e){const n=String(e??""),s=n.split(/\r?\n/);let a=0;for(;a<s.length&&!s[a].trim();)a+=1;if(!/^#\s+/.test(s[a]?.trim()??""))return n;for(a+=1;a<s.length&&!s[a].trim();)a+=1;if(s[a]?.trim()&&!m(s[a].trim())){for(;a<s.length&&s[a].trim();)a+=1;for(;a<s.length&&!s[a].trim();)a+=1}return s.slice(a).join(`
`).trim()}const G=e=>/^https?:\/\//i.test(e??"");function z({content:e}){return t.jsx("div",{className:"handbook-markdown",children:t.jsx(R,{remarkPlugins:[C],rehypePlugins:[D],components:{h1:()=>null,a:({href:n,children:s,...a})=>G(n)?t.jsx("a",{...a,href:n,target:"_blank",rel:"noreferrer",children:s}):t.jsx("a",{...a,href:n,children:s}),table:({children:n,...s})=>t.jsx("div",{className:"handbook-table-wrap",children:t.jsx("table",{...s,children:n})})},children:e})})}const B=`# 公司经营功能使用说明

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

`,K=`# 常见问题

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

`,V=`# 开始使用经营执行平台

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

`,H=`# 产品全周期使用说明

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

`,W=`# API 目录

当前接口首先服务本应用，统一登记为内部 API。出现多个真实系统调用方后，稳定契约迁移到 \`/api/platform/v1/\`。

## 共享状态

| 路径 | 用途 | 主要约束 |
| --- | --- | --- |
| \`/api/state\` | 读取和保存产品全周期共享状态 | 需要公司会话；写操作拒绝只读身份；大状态按 D1 行限制分片 |
| \`/api/platform\` | 读取和保存公司战略执行实体 | 仅总经办范围；实体分记录存储；写操作需要非只读身份 |
| \`/api/sales\` | 查询产品销售聚合 | 需要公司会话；时间和平台口径见产品数据定义 |

## 认证

- \`/api/auth/session\`：读取当前公共会话模型。
- \`/api/auth/dingtalk/start\`：启动浏览器钉钉登录。
- \`/api/auth/dingtalk/callback\`：校验 state 并建立公司员工会话。
- \`/api/auth/dingtalk/embedded\`：钉钉内嵌免登。
- \`/api/auth/logout\`：撤销当前服务端会话并清理 Cookie。

## 钉钉

- \`/api/dingtalk/org/status|sync|users\`：组织同步状态、同步和成员读取。
- \`/api/dingtalk/todo/create|list|sync\`：个人待办创建、读取和幂等同步。
- \`/api/dingtalk/calendar/create|events\`：日历事件创建和查询。
- \`/api/dingtalk/doc/read\`：读取已授权钉钉文档。
- \`/api/dingtalk/meeting/minutes\`：读取可匹配的会议纪要。
- \`/api/dingtalk/config\` 与 \`/api/dingtalk/login\`：登录配置和兼容登录入口。

## 快麦

- \`/api/kuaimai/pull\`：按日期分页拉取订单并聚合。
- \`/api/kuaimai/refresh\`：刷新配置范围数据。
- \`/api/kuaimai/status\`：读取同步配置和数据状态。

## 版本与变更

现有路径保持兼容。新多系统契约必须建立 API 文档、负责人、调用方、认证权限、错误码、可观测性和契约测试。破坏性变化通过新版本路径提供，并给调用方迁移时间。

`,Y=`# 平台总体架构

系统采用模块化单体前端、Cloudflare Pages Functions 和 D1 持久化。当前先保持边界清晰和契约稳定，出现第二个真实系统调用方后再抽取独立包或服务。

## 前端边界

- \`src/domain/\`：纯业务规则、规范化、排序、状态计算和数据投影。
- \`src/ui/\`：不绑定业务部门的基础组件。
- \`src/features/\`：公司经营和产品功能页面。
- \`src/state/\`：共享状态、认证状态、平台状态和 API 客户端编排。
- \`src/App.jsx\`：导航和页面装配，不承载领域计算。

依赖方向为 \`features -> ui/domain/state\`。领域模块不能依赖 React、浏览器或网络；功能页面不能直接调用钉钉、快麦或 ERP。

## 服务端边界

- \`functions/api/_middleware.js\`：公共路由识别、OPTIONS 和公司会话认证。
- \`functions/api/auth/\`：钉钉登录、Cookie 会话和退出。
- \`functions/api/dingtalk/\`：组织、待办、日历、文档和会议纪要适配。
- \`functions/api/kuaimai/\`：订单拉取、聚合、刷新和同步状态。
- \`functions/api/state.js\`：产品全周期共享状态持久化。
- \`functions/api/platform.js\`：公司经营平台实体持久化。
- \`functions/api/sales.js\`：产品销售数据查询。

## 数据流

浏览器先完成钉钉身份认证，再读取产品共享状态或公司平台状态。服务端验证会话和写权限后访问 D1，外部平台调用由对应适配层完成。客户端不得持有服务端密钥。

## 运行环境

- 本地 React 预览用于前端和测试验收。
- Cloudflare Pages/Functions 是生产静态资源和 API 边界。
- D1 保存公司共享状态、平台实体、会话、组织缓存和销售聚合。
- 钉钉 WebView 是独立的嵌入环境，需要单独验证登录、视口和权限。

## 未来平台化

新多系统接口放在 \`/api/platform/v1/\`。通用 UI、契约和客户端只有在第二个真实调用方出现后才抽为 workspace package，避免基于假设建设中台。

`,Q="# 通用组件目录\n\n通用组件位于 `src/ui/`。组件必须使用设计 Token、业务无关属性和稳定交互，不在内部写死部门、产品或审批文案。\n\n| 组件 | 用途 | 关键约束 |\n| --- | --- | --- |\n| `Button` / `IconAction` | 主操作、普通操作、危险操作和图标操作 | disabled 必须说明原因；危险样式只用于不可逆动作 |\n| `Modal` | 需要集中注意力的复杂编辑 | 优先考虑页面内编辑；焦点必须可进入和返回 |\n| `ConfirmDialog` | 不可逆或高影响确认 | 明确对象、后果和确认动作，不使用浏览器模糊提示 |\n| `DataTable` / `TableActions` | 高密度结构化数据 | 表头不拆字，列宽稳定，窄屏水平滚动，操作不换行 |\n| `HeaderFilter` | 页面级轻量筛选 | 选项数量有限且不会遮挡页面主操作 |\n| `DatePickerField` | 标准日期输入 | 输出稳定日期格式，浮层不被表格裁切 |\n| `ExpectedLaunchMonthSelect` | 预计上市月份 | 只提供当前及未来月份，存储 `YYYY-MM` |\n| `ProductPicker` | 产品切换 | 保留显式选择，清楚展示当前产品和责任归属 |\n| `OrgSelect` | 钉钉部门或人员选择 | 不使用自由文本伪造组织成员，浮层通过安全层级展示 |\n| `RichTextEditor` | 需要结构化说明的长文本 | 保留基本语义和可读降级，不用于简单单行内容 |\n| `DeliverablePreviewModal` | 交付物预览 | 根据类型安全预览，下载能力由来源决定 |\n| `FloatingMenu` | 脱离裁切容器的菜单 | 统一浮层定位、关闭、键盘和层级行为 |\n\n## 组件状态\n\n交互组件按适用范围覆盖 default、hover、focus、active、disabled、loading、error、empty 和 selected。加载优先使用保持布局的骨架；空状态说明下一步；错误说明原因和恢复方式。\n\n## 进入通用层的条件\n\n基础控件可以直接进入 `src/ui`。其他组件至少有两个真实消费者，或者经过设计评审确认属于稳定平台模式。只服务一个业务页面的组合组件留在对应 feature。\n\n## 兼容与废弃\n\n修改共享组件属性前搜索全部调用方并补测试。废弃属性先提供迁移说明和兼容周期，不在无关功能 PR 中顺手重写所有调用方。\n\n",J=`# 错误结构与错误码

新共享 API 使用统一错误结构。现有接口按路由逐步迁移，迁移期间保持原调用方兼容。

\`\`\`json
{
  "error": {
    "code": "VALIDATION_REQUIRED_FIELD",
    "message": "请补充必填信息。",
    "requestId": "req_20260717_example",
    "retryable": false
  }
}
\`\`\`

## 字段

- \`code\`：稳定、可用于程序判断的错误码。
- \`message\`：可以安全展示给公司员工的中文说明，不包含密钥或原始外部响应。
- \`requestId\`：用于服务端日志定位，同一次请求保持一致。
- \`retryable\`：表示原请求在不修改输入时是否适合重试。

## 前缀

| 前缀 | 范围 | 示例 |
| --- | --- | --- |
| \`AUTH_\` | 未登录、会话失效、登录回调 | \`AUTH_SESSION_REQUIRED\` |
| \`PERMISSION_\` | 部门、角色或写权限不足 | \`PERMISSION_WRITE_DENIED\` |
| \`VALIDATION_\` | 参数、状态或业务规则校验 | \`VALIDATION_REQUIRED_FIELD\` |
| \`STATE_\` | 共享状态、版本或持久化 | \`STATE_SAVE_FAILED\` |
| \`DINGTALK_\` | 钉钉授权和接口调用 | \`DINGTALK_PERMISSION_MISSING\` |
| \`KUAIMAI_\` | 快麦配置、签名和拉取 | \`KUAIMAI_SYNC_FAILED\` |
| \`INTERNAL_\` | 未预期服务端错误 | \`INTERNAL_UNEXPECTED\` |

## HTTP 状态

- 400：请求或业务状态不合法。
- 401：没有有效公司会话。
- 403：已登录但没有操作权限。
- 404：资源不存在或对当前用户不可见。
- 409：版本、重复操作或状态冲突。
- 429：达到接口限流。
- 500：未预期服务端错误。
- 502/503/504：外部依赖失败、不可用或超时。

## 日志与展示

服务端日志记录 request ID、路由、耗时、结果码和安全的依赖摘要。客户端优先展示 \`message\`，并在需要支持人员协助时展示 request ID。禁止把堆栈、Cookie、Token、手机号或完整外部响应返回给浏览器。

`,X=`# 外部系统集成

外部集成通过服务端适配层访问，前端功能只调用本系统 API。每项集成都要区分业务记录保存和外部同步结果，避免外部失败导致平台内工作丢失。

## 钉钉

承担员工身份、组织通讯录、待办、日历、文档和会议纪要。身份优先使用 user ID 和 union ID；组织名称用于展示和历史兼容。钉钉授权、企业归属和接口权限必须在服务端验证。

## 快麦

承担订单明细读取和日销售聚合。签名和密钥仅在服务端使用。拉取按日期和页码执行，保留订单创建时间，并记录同步范围、续页和失败状态。

## ERP 与销售导入

ERP 或 Excel 导入作为销售数据补充来源。导入必须记录来源文件、时间范围和口径，避免用导入时间替代订单时间。产品映射不明确的数据进入异常检查，不自动分配。

## Cloudflare Pages 与 D1

Pages 承载 React 静态资源，Functions 承载 \`/api/*\`，D1 保存共享状态、公司平台实体、会话、组织缓存和销售聚合。绑定、迁移和部署属于生产基础设施验证，不能用本地预览结果替代。

## 失败责任

外部接口超时、限流或无权限时，适配层返回安全错误摘要和是否可重试。平台内已经确认的业务修改应先可靠保存，再记录外部同步状态；可能产生重复副作用的写操作使用稳定来源 ID 或幂等键。

`,$=`# 中间件目录

中间件负责跨路由一致的认证、校验、错误、日志和外部调用策略。业务路由只处理自己的输入、权限和领域操作。

## 当前认证中间件

\`functions/api/_middleware.js\` 处理 OPTIONS、公共认证路径和公司会话读取。受保护接口没有有效会话时返回 401，并把有效会话放入 \`context.data.session\`。

公共路径只包含登录启动、回调、嵌入登录、会话查询、退出和登录配置。新增公共接口必须进行安全评审，不能因为页面调用方便而绕过认证。

## 会话能力

\`functions/api/auth/_shared/session.js\` 管理 Cookie 会话、令牌哈希、员工身份和有效期。原始会话令牌不能持久化或写入日志。

## 外部平台共享适配

- \`functions/api/dingtalk/_shared/dingtalk.js\`：钉钉 Token、组织、待办、日历、文档和会议数据的共同请求与响应处理。
- \`functions/api/kuaimai/_shared/kuaimai.js\`：快麦签名、分页、订单标准化和日聚合。

## 新中间件要求

每个中间件只承担一种横切责任，并记录输入、输出、执行顺序、副作用、超时、重试、幂等和日志字段。中间件不得包含具体页面或产品阶段判断。

## 目标能力

后续逐步统一请求 ID、错误结构、服务端日志、输入校验和写操作幂等。迁移按路由分批完成，不要求现有接口一次性改写。

`,Z=`# 核心业务流程

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

## 阶段准入

阶段推进必须验证本阶段必需任务、交付物和评审结论。系统可以展示建议，但重要决策仍由具备权限的责任人确认，不由状态自动变化替代管理判断。

`,ee=`# 数据定义与口径

本文件记录跨功能共享的数据含义。页面文案可以简化名称，但计算、接口和报表必须保持同一口径。

## 需求

尚未正式进入产品开发流程的机会记录。包含来源、提出人、负责人、说明、讨论状态、创建时间和预计上市月份。需求转项目后保留原需求 ID。

## 产品

由需求池准入并转入开发流程的业务对象。包含产品等级、阶段、产品经理、预计上市月份、月度 GMV 目标、资料和销售映射。

## 产品经理

负责产品推进的钉钉组织成员。新记录保存可用的用户 ID、union ID 和姓名；历史数据允许姓名兼容，但新逻辑优先稳定身份标识。

## 阶段

产品生命周期中的有序执行位置。阶段变化必须满足对应准入条件，不能仅因为日期变化自动跳转。

## 任务

阶段内需要完成的行动，包含类别、责任部门、个人负责人、截止日期、状态和来源。部门责任与个人责任分开；只有明确个人身份的任务才进入个人钉钉待办。

## 交付物

任务或阶段产生的可检查结果，例如方案、文档、图片、会议纪要或资料包。交付物必须保留与任务和产品的关系。

## 预计上市月份

统一存储为 \`YYYY-MM\`。展示可使用中文年月，但排序、筛选和接口传输保持标准格式。

## 销售时间口径

快麦销售汇总默认使用订单创建时间作为统计日期。历史导入必须保留原始创建时间，不使用导入时间替代。

## 平台口径

常规渠道占比、增长和运营判断默认忽略平台分类“其它”。需要检查数据完整性时可以把它作为异常桶单独说明，但不混入正常渠道结论。

`,ne=`# 角色与权限

系统权限以钉钉组织身份为基础，同时区分页面可见、功能查看、功能编辑和服务器写入权限。

## 总经办

查看公司经营全局，维护权限，确认战略、跨部门事项和高影响决策。总经办访问公司经营平台，但仍应通过正常业务流程修改数据。

## 产品部

维护需求讨论、产品规划、产品经理、生命周期任务和产品档案。产品经理从组织成员中选择，不使用自由文本创建虚拟人员。

## 运营与品牌

提供市场、渠道、内容和经营反馈，承担明确分配的阶段任务、部门承诺和重点项目结果。只能修改被授权的功能和本职责范围数据。

## 供应链与客服

供应链负责打样、成本、交期、质量、备选供应和库存风险；客服负责用户问题、售后反馈和需求证据。两者通过需求和任务参与产品流程。

## 财务

提供经过确认的销售、成本、预算和结算数据。财务可查看被授权的数据源和经营结果，不默认获得产品流程配置权限。

## 查看与编辑

看到导航不等于可以编辑所有数据。客户端禁用状态用于解释权限，服务器仍必须再次校验身份、角色和组织范围。说明书对所有已登录公司人员开放，但不会对匿名公网开放。

## 权限变更

权限变更应说明业务目的、适用部门、查看或编辑范围、负责人和复核日期。认证、权限和组织规则变化必须有测试和审查。

`,te=`# Permission Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Build department-based navigation permissions and department/title-based feature permissions while fixing DingTalk shared-state loading.

**Architecture:** Keep permission evaluation in a pure domain module, normalize it in the shared state model, and let App and SettingsPage consume the same rules. Reuse the existing organization selector and floating menu.

**Tech Stack:** React 19, Vite, existing CSS design tokens, Cloudflare Pages/D1.

## Global Constraints

- Total management office always retains administration access.
- Permission choices come from the DingTalk organization cache.
- Product managers can view and edit product task templates by default.
- Shared state requests must support payloads larger than 64KB in DingTalk WebView.

---

### Task 1: Permission domain and migration

**Files:** Create \`src/domain/permissions.js\`; modify \`src/domain/productFlow.js\`, \`src/state/stateModel.js\`; test \`tests/shared-state.test.mjs\`.

- [ ] Add failing tests for navigation and feature permissions.
- [ ] Implement default permission configuration and pure access predicates.
- [ ] Normalize legacy shared settings and run targeted tests.

### Task 2: Permission settings interface

**Files:** Create \`src/features/settings/PermissionSettings.jsx\`; modify \`src/features/settings/SettingsPage.jsx\`, \`src/ui/OrgSelect.jsx\`, \`src/features/settings/TaskTemplateSettings.jsx\`, \`src/styles.css\`; test \`tests/react-app.test.mjs\`.

- [ ] Add failing component-contract tests.
- [ ] Build navigation and feature permission matrices with organization selectors.
- [ ] Add read-only task-template rendering and run targeted tests.

### Task 3: Enforce navigation and feature permissions

**Files:** Modify \`src/App.jsx\`, \`src/features/settings/SettingsPage.jsx\`; test \`tests/react-app.test.mjs\`.

- [ ] Add failing tests for filtered navigation and protected hashes.
- [ ] Filter navigation and redirect unauthorized routes.
- [ ] Verify settings sections against the same domain rules.

### Task 4: DingTalk load failure

**Files:** Modify \`src/state/ProductFlowProvider.jsx\`; test \`tests/react-app.test.mjs\`.

- [ ] Add a failing test that rejects \`keepalive\` on state payloads.
- [ ] Remove \`keepalive\` and translate WebView fetch errors to Chinese.
- [ ] Run full tests and verify in local browser and DingTalk.

### Task 5: Release

**Files:** Build \`dist\`, sync to \`/Users/roger/Documents/product-flow-system\`, commit and push.

- [ ] Run \`npm test\` and \`npm run build\`.
- [ ] Browser-audit permissions at laptop width.
- [ ] Publish and confirm production asset hashes.
`,se=`# Task Category Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Unify four task categories, category-specific actions, and searchable multi-select responsibility departments.

**Architecture:** Keep task ownership serialized as the existing slash-delimited string while adding domain helpers for category migration and action capabilities. Extend the shared organization selector with an opt-in department multi-select mode so progress and settings reuse one component.

**Tech Stack:** React 19, Vite 7, Tailwind CSS 4, Node test runner, Cloudflare Pages/D1.

## Global Constraints

- Categories are exactly \`会前准备\`, \`会议\`, \`决策\`, and \`待办任务\`.
- Meeting tasks show only meeting scheduling; decision and todo tasks show only DingTalk todo sync; preparation tasks show neither.
- Department search stays inside a floating menu and selected departments remain readable in a compact table cell.
- Persist department selections in the existing slash-delimited string format.

---

### Task 1: Domain rules and migration

**Files:**
- Modify: \`/Users/roger/Documents/product-flow-system-react/src/domain/productFlow.js\`
- Modify: \`/Users/roger/Documents/product-flow-system-react/src/state/stateModel.js\`
- Test: \`/Users/roger/Documents/product-flow-system-react/tests/dingtalk-meeting.test.mjs\`
- Test: \`/Users/roger/Documents/product-flow-system-react/tests/shared-state.test.mjs\`

**Interfaces:**
- Produces: \`TASK_CATEGORIES\`, \`normalizeTaskCategory(category)\`, and \`taskCategoryActions(category)\`.

- [ ] Write failing tests for the four categories, legacy mappings, and action matrix.
- [ ] Run targeted tests and confirm the old categories and action logic fail.
- [ ] Implement category normalization and apply it to tasks and templates.
- [ ] Run targeted tests and confirm migration preserves existing task execution fields.

### Task 2: Searchable department multi-select

**Files:**
- Modify: \`/Users/roger/Documents/product-flow-system-react/src/ui/OrgSelect.jsx\`
- Modify: \`/Users/roger/Documents/product-flow-system-react/src/styles.css\`
- Modify: \`/Users/roger/Documents/product-flow-system-react/src/features/progress/ProductProgressPage.jsx\`
- Modify: \`/Users/roger/Documents/product-flow-system-react/src/features/settings/TaskTemplateSettings.jsx\`
- Test: \`/Users/roger/Documents/product-flow-system-react/tests/react-app.test.mjs\`

**Interfaces:**
- Consumes: slash-delimited department strings.
- Produces: \`OrgSelect\` with \`multiple\` and \`searchInMenu\` options, returning a normalized slash-delimited string.

- [ ] Write failing source-contract tests for multi-select usage and embedded search.
- [ ] Run the focused React test and confirm failure.
- [ ] Add checkbox-style department selection without closing the floating menu.
- [ ] Use multi-select mode in progress tasks and task template settings.
- [ ] Run the focused React test and confirm pass.

### Task 3: Category-specific task actions

**Files:**
- Modify: \`/Users/roger/Documents/product-flow-system-react/src/features/progress/ProductProgressPage.jsx\`
- Modify: \`/Users/roger/Documents/product-flow-system-react/src/styles.css\`
- Test: \`/Users/roger/Documents/product-flow-system-react/tests/react-app.test.mjs\`

**Interfaces:**
- Consumes: \`taskCategoryActions(category)\`.
- Produces: conditional meeting and todo controls while preserving completion and delete controls.

- [ ] Write failing UI contract tests for each category action.
- [ ] Run the focused React test and confirm failure.
- [ ] Render meeting and todo controls from the domain capability matrix.
- [ ] Run the full test suite and production build.
- [ ] Verify the four category rows and multi-department selector in the local browser.
- [ ] Copy the built artifacts to the deployment repository, commit, push, and verify the production asset hash.
`,ae=`# Product Workflow Task Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Configure level-specific stage task templates in Settings and expose DingTalk deliverable templates from each product task.

**Architecture:** Store company-wide template definitions in \`settings.taskTemplates\`. Generate stable per-product execution tasks keyed by \`templateId\`, synchronizing structural fields while preserving product execution state and manual tasks. Reuse the existing floating selectors, modal, organization selector, and D1 company-state persistence.

**Tech Stack:** React 19, Vite 7, Tailwind CSS 4, Node test runner, Cloudflare Pages Functions and D1.

## Global Constraints

- Default tasks are isolated by exact product level and stage.
- Template edits preserve task due dates, completion, DingTalk metadata, and uploaded deliverables.
- Manual product tasks are preserved.
- Deliverable templates only accept \`alidocs.dingtalk.com\` links.
- All shared configuration persists through the existing \`/api/state\` company record.

---

### Task 1: Template domain model and migration

**Files:**
- Modify: \`src/domain/productFlow.js\`
- Modify: \`src/state/stateModel.js\`
- Test: \`tests/shared-state.test.mjs\`

**Interfaces:**
- Produces: \`DEFAULT_TASK_TEMPLATES\`, \`taskTemplatesForProductStage(state, product, stage)\`, \`updateWorkflowTaskTemplates(state, templates)\`, and a template-driven \`syncDefaultTasksForProduct(state, product)\`.

- [ ] Write failing tests for level isolation, stable template IDs, preservation of runtime fields/manual tasks, template deletion, and missing-settings migration.
- [ ] Run \`node --test tests/shared-state.test.mjs\` and verify the new tests fail for missing template APIs.
- [ ] Implement normalized default templates and template-driven synchronization.
- [ ] Run \`node --test tests/shared-state.test.mjs\` and verify all domain tests pass.

### Task 2: Settings task-template editor

**Files:**
- Modify: \`src/features/settings/SettingsPage.jsx\`
- Create: \`src/features/settings/TaskTemplateSettings.jsx\`
- Create: \`src/features/settings/DeliverableTemplateEditorModal.jsx\`
- Modify: \`src/state/ProductFlowProvider.jsx\`
- Modify: \`src/styles.css\`
- Test: \`tests/react-app.test.mjs\`

**Interfaces:**
- Consumes: \`state.settings.taskTemplates\`, \`PRODUCT_LEVELS\`, \`STAGES\`, \`TASK_CATEGORIES\`, \`updateWorkflowTaskTemplates\`.
- Produces: \`updateTaskTemplates(templates)\` provider action and a settings editor that saves the complete normalized template array.

- [ ] Write failing component-contract tests for level/stage selectors, editable task rows, organization selectors, template modal, add/delete confirmation, and save action.
- [ ] Run the targeted React tests and verify failure because the settings components do not exist.
- [ ] Implement the editor and provider action using existing UI primitives.
- [ ] Add compact responsive styles and run the targeted React tests until green.

### Task 3: Product task deliverable-template viewer

**Files:**
- Modify: \`src/features/progress/ProductProgressPage.jsx\`
- Modify: \`src/features/progress/TaskDeliverables.jsx\`
- Create: \`src/features/progress/TaskTemplateModal.jsx\`
- Modify: \`src/styles.css\`
- Test: \`tests/react-app.test.mjs\`

**Interfaces:**
- Consumes: each generated task's \`deliverableTemplates\` array.
- Produces: a \`模板\` button after the add button and a read-only DingTalk document list modal.

- [ ] Write failing tests for button order, disabled empty state, modal document cards, and safe external opening.
- [ ] Run the targeted test and verify it fails because the viewer is absent.
- [ ] Implement the button and modal with existing \`Modal\` and \`Button\` primitives.
- [ ] Run targeted tests and verify they pass.

### Task 4: Full verification and deployment

**Files:**
- Sync build output into: \`/Users/roger/Documents/product-flow-system\`

**Interfaces:**
- Consumes: verified React build.
- Produces: deployed Cloudflare Pages version using the existing repository pipeline.

- [ ] Run \`npm test\` and require zero failures.
- [ ] Run \`npm run build\` and require a successful Vite production build.
- [ ] Test the local Settings and Product Progress flows in the browser at \`http://127.0.0.1:8130\`.
- [ ] Replay the production \`/api/state\` payload through \`normalizeClientState\` and verify template migration without lost execution metadata.
- [ ] Sync \`dist\` to the deployment repository, commit intentionally, and push.
- [ ] Verify the live Cloudflare URL loads the new settings editor and task template modal without console errors.
`,oe=`# 首页部门待办实施计划

1. 增加首页静态回归测试，覆盖页头筛选、待办数量、首条跳转和等宽布局。
2. 调整 \`DashboardPage\`，统一使用 \`departmentTasks\` 驱动统计卡、列表和跳转。
3. 调整首页网格样式并补充空状态禁用样式。
4. 运行专项测试、全量测试和生产构建，再进行本地浏览器验收。

`,re=`# Demand Created At Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Store real demand creation timestamps and render stable relative dates in the demand pool.

**Architecture:** Add focused demand-date helpers in the domain layer, normalize legacy records at the shared-state boundary, and make the demand provider create records through one constructor. The D1 state envelope remains unchanged.

**Tech Stack:** React, JavaScript, Node test runner, Cloudflare Pages Functions/D1 JSON state.

## Global Constraints

- Do not change the D1 table schema.
- Preserve compatibility with legacy \`created\` values.
- Do not modify dates in packages or feedback issues.

---

### Task 1: Demand creation date domain behavior

**Files:**
- Create: \`src/domain/demandDate.js\`
- Modify: \`src/state/stateModel.js\`
- Modify: \`src/state/ProductFlowProvider.jsx\`
- Modify: \`src/features/demands/DemandPoolPage.jsx\`
- Test: \`tests/shared-state.test.mjs\`

**Interfaces:**
- Produces: \`createDemandRecord(demand, now)\`, \`normalizeDemandCreatedAt(demand)\`, \`formatDemandCreatedAt(createdAt, now)\`.
- Consumes: legacy demand \`id\`, \`created\`, and optional \`createdAt\`.

- [ ] **Step 1: Write failing tests for ISO creation, legacy migration, and relative display.**
- [ ] **Step 2: Run \`node --test tests/shared-state.test.mjs\` and confirm failures are caused by missing date behavior.**
- [ ] **Step 3: Implement the domain helpers and connect normalization, creation, and table rendering.**
- [ ] **Step 4: Run \`npm test\` and confirm the full suite passes.**
- [ ] **Step 5: Run \`npm run build\` and inspect the production bundle result.**
`,ie=`# DingTalk Web Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Add DingTalk browser QR login while keeping DingTalk embedded auto-login, with both modes producing one secure D1-backed server session that protects all company APIs.

**Architecture:** The Cloudflare Pages release repository owns authentication routes, session storage, DingTalk identity exchange, API middleware, and D1 tables. The React source repository owns the authentication state machine, browser login page, embedded login bootstrap, account menu, and logout experience. The existing company state remains in D1 and is not migrated.

**Tech Stack:** React 19, Vite 7, Cloudflare Pages Functions, Cloudflare D1, DingTalk OAuth 2.0, DingTalk JSAPI, Node test runner.

## Global Constraints

- Only active employees found in the configured DingTalk enterprise may create a Session.
- Browser and embedded login must enter the same React application and use the same \`pfs_session\` cookie.
- \`AppSecret\`, user access tokens, and raw Session tokens never reach browser JavaScript.
- Production must not expose the local test login.
- Existing \`product_flow_state\` and sales tables must not be rewritten or migrated.
- Unauthenticated clients must not read \`/api/state\`, \`/api/sales\`, or DingTalk integration data.
- The current React source workspace is \`/Users/roger/Documents/product-flow-system-react\`.
- The Cloudflare release repository is \`/Users/roger/Documents/product-flow-system\`.
- Every behavior change follows RED, GREEN, REFACTOR with a focused test before implementation.

---

## File Structure

### Cloudflare release repository

- Create \`functions/api/auth/_shared/session.js\`: D1 table creation, cookies, Session creation, lookup, revocation, and response helpers.
- Create \`functions/api/auth/session.js\`: public current-session endpoint.
- Create \`functions/api/auth/logout.js\`: revoke current Session and clear Cookie.
- Create \`functions/api/auth/dingtalk/start.js\`: generate OAuth state and redirect to DingTalk.
- Create \`functions/api/auth/dingtalk/callback.js\`: validate state, exchange code, verify employee, create Session, redirect to app.
- Create \`functions/api/auth/dingtalk/embedded.js\`: exchange JSAPI auth code, verify employee, create Session.
- Create \`functions/api/_middleware.js\`: allow public auth/config routes and protect every other \`/api/*\` route.
- Modify \`functions/api/dingtalk/_shared/dingtalk.js\`: browser OAuth identity exchange, enterprise membership lookup, and normalized identity.
- Modify \`functions/api/dingtalk/config.js\`: expose only client ID, CorpId, and callback route.
- Modify \`functions/api/dingtalk/login.js\`: preserve compatibility by delegating to embedded Session creation.
- Modify \`functions/api/state.js\`: reject \`readonly\` writes and use authenticated user as \`updatedBy\`.
- Modify \`functions/api/sales.js\`: reject unauthenticated requests through middleware and reject \`readonly\` mutations.
- Modify \`functions/api/dingtalk/org/sync.js\`: persist normalized members into the auth member cache.
- Create \`tests/helpers/auth-d1-mock.mjs\`: reusable D1 mock for Session and member tests.
- Create \`tests/dingtalk-web-auth.test.mjs\`: OAuth, embedded login, Session, enterprise membership, middleware, logout, and expiry tests.

### React source workspace

- Create \`src/state/AuthProvider.jsx\`: Session bootstrap and authentication state machine.
- Create \`src/domain/authSession.js\`: same-origin auth API client and normalized auth errors.
- Create \`src/features/auth/LoginPage.jsx\`: browser login, forbidden, expired, and retry states.
- Create \`src/features/auth/AuthGate.jsx\`: blocks business application until authenticated.
- Modify \`src/domain/dingTalkLogin.js\`: return embedded auth code without storing a trusted local Session.
- Modify \`src/state/ProductFlowProvider.jsx\`: consume authenticated identity and delay state/org loading until login succeeds.
- Modify \`src/domain/sessionUser.js\`: stop trusting localStorage as identity; retain only organization matching helpers.
- Modify \`src/App.jsx\`: account menu and logout command.
- Modify \`src/main.jsx\`: mount \`AuthProvider\` and \`AuthGate\` before \`ProductFlowProvider\`.
- Modify \`src/styles.css\`: compact login page, account menu, loading, and error states.
- Modify \`tests/react-app.test.mjs\`: authentication gate, login page, embedded auto-login, logout, and production safety checks.

---

### Task 1: D1 Session Core

**Files:**
- Create: \`functions/api/auth/_shared/session.js\`
- Create: \`tests/helpers/auth-d1-mock.mjs\`
- Create: \`tests/dingtalk-web-auth.test.mjs\`

**Interfaces:**
- Produces: \`ensureAuthTables(db)\`, \`createSession(identity, loginMode, env)\`, \`readSession(request, env)\`, \`requireSession(request, env)\`, \`revokeSession(request, env)\`, \`sessionCookie(token)\`, \`clearSessionCookie()\`.
- Test helper exports: \`createAuthD1Mock()\`, \`createStateD1Mock()\`, \`createSalesD1Mock()\`, \`validState\`, and \`validSalesRow\` from \`tests/helpers/auth-d1-mock.mjs\`.
- Session shape: \`{ idHash, corpId, userId, unionId, name, role, department, title, loginMode, expiresAt }\`.

- [ ] **Step 1: Write failing Session lifecycle tests**

Add tests that create a Session, read it from a Cookie, reject an expired Session, revoke it, and confirm D1 never stores the raw token:

\`\`\`js
test("server session stores only a token hash and resolves an active employee", async () => {
  const db = createAuthD1Mock();
  const created = await createSession({
    corpId: "ding-company",
    userId: "user-1",
    unionId: "union-1",
    name: "周荣庆",
    role: "executive",
    department: "总经办",
    title: "总经理"
  }, "browser", { PRODUCT_FLOW_DB: db });

  assert.match(created.cookie, /^pfs_session=/);
  assert.equal(db.dumpSessions()[0].id_hash.includes(created.token), false);
  const session = await readSession(new Request("https://flow.example.com/api/state", {
    headers: { cookie: created.cookie }
  }), { PRODUCT_FLOW_DB: db });
  assert.equal(session.unionId, "union-1");
});
\`\`\`

- [ ] **Step 2: Run the focused test and verify RED**

Run: \`node --test tests/dingtalk-web-auth.test.mjs\`

Expected: FAIL because \`functions/api/auth/_shared/session.js\` and \`createAuthD1Mock\` do not exist.

- [ ] **Step 3: Implement the Session module and D1 mock**

Create these D1 tables in \`ensureAuthTables\`:

\`\`\`sql
CREATE TABLE IF NOT EXISTS product_flow_sessions (
  id_hash TEXT PRIMARY KEY,
  corp_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  union_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  department TEXT,
  title TEXT,
  login_mode TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
)
\`\`\`

Use \`crypto.getRandomValues(new Uint8Array(32))\` for tokens and \`crypto.subtle.digest("SHA-256", ...)\` for stored hashes. Parse only the \`pfs_session\` Cookie. Return 401 from \`requireSession\` when the Cookie is missing, expired, unknown, or revoked.

- [ ] **Step 4: Run Session tests and verify GREEN**

Run: \`node --test tests/dingtalk-web-auth.test.mjs\`

Expected: PASS for creation, lookup, expiry, revocation, and raw-token non-persistence.

- [ ] **Step 5: Commit Session infrastructure**

\`\`\`bash
git add functions/api/auth/_shared/session.js tests/helpers/auth-d1-mock.mjs tests/dingtalk-web-auth.test.mjs
git commit -m "feat(auth): add D1 server sessions"
\`\`\`

---

### Task 2: Browser OAuth and Embedded Login Routes

**Files:**
- Modify: \`functions/api/dingtalk/_shared/dingtalk.js\`
- Create: \`functions/api/auth/dingtalk/start.js\`
- Create: \`functions/api/auth/dingtalk/callback.js\`
- Create: \`functions/api/auth/dingtalk/embedded.js\`
- Create: \`functions/api/auth/session.js\`
- Create: \`functions/api/auth/logout.js\`
- Modify: \`functions/api/dingtalk/login.js\`
- Modify: \`functions/api/dingtalk/config.js\`
- Test: \`tests/dingtalk-web-auth.test.mjs\`

**Interfaces:**
- Consumes: Session functions from Task 1.
- Produces: \`getDingBrowserIdentity(code, env, fetchImpl)\`, \`getDingEmbeddedIdentity(authCode, corpId, env, fetchImpl)\`, \`GET /api/auth/dingtalk/start\`, \`GET /api/auth/dingtalk/callback\`, \`POST /api/auth/dingtalk/embedded\`, \`GET /api/auth/session\`, \`POST /api/auth/logout\`.
- Test-local helper functions in \`tests/dingtalk-web-auth.test.mjs\`: \`configuredEnv(db)\` supplies DingTalk bindings and a fetch mock; \`createAuthenticatedResponse(identity, loginMode)\` creates a Session response through the real Session helper; \`publicSession(response)\` resolves that Cookie through the Session endpoint; \`browserCallbackWithIdentity(identity)\` runs the callback route with a mocked DingTalk identity.

- [ ] **Step 1: Verify the current DingTalk OAuth contract before coding**

Run:

\`\`\`bash
dws devdoc article search --query "钉钉 OAuth2 网页扫码登录 authorization code userAccessToken contact users me" --format json
\`\`\`

Confirm the authorization endpoint, callback parameter name, \`openid\` scope, user access-token exchange, and current-user endpoint. If DingTalk documentation is temporarily unavailable, retain the standard adapter contract below and do not perform a real production login until Preview verification succeeds.

- [ ] **Step 2: Write failing route tests**

Cover these behaviors with mocked DingTalk responses:

\`\`\`js
test("browser OAuth callback rejects a mismatched state", async () => {
  const response = await browserCallback({
    request: new Request("https://flow.example.com/api/auth/dingtalk/callback?code=x&state=wrong", {
      headers: { cookie: "pfs_oauth_state=expected" }
    }),
    env: configuredEnv(createAuthD1Mock())
  });
  assert.equal(response.status, 400);
});

test("browser OAuth callback creates the same session model as embedded login", async () => {
  const identity = { corpId: "ding-company", userId: "user-1", unionId: "union-1", name: "周荣庆", role: "executive" };
  const browser = await createAuthenticatedResponse(identity, "browser");
  const embedded = await createAuthenticatedResponse(identity, "embedded");
  assert.match(browser.headers.get("set-cookie"), /pfs_session=/);
  assert.match(embedded.headers.get("set-cookie"), /pfs_session=/);
  assert.deepEqual(publicSession(browser), publicSession(embedded));
});

test("browser OAuth rejects a DingTalk account outside the enterprise", async () => {
  const response = await browserCallbackWithIdentity({ unionId: "external-union", enterpriseUserId: "" });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("set-cookie")?.includes("pfs_session=") || false, false);
});
\`\`\`

- [ ] **Step 3: Run route tests and verify RED**

Run: \`node --test tests/dingtalk-web-auth.test.mjs\`

Expected: FAIL because browser OAuth routes and identity adapters do not exist.

- [ ] **Step 4: Implement DingTalk identity adapters**

Use the existing \`getDingUserAccessToken\` for browser authorization codes. Add:

\`\`\`js
export async function getDingCurrentUser(userAccessToken, fetchImpl = fetch) {
  return requestDingOpenApi(userAccessToken, "GET", "/v1.0/contact/users/me", null, fetchImpl);
}

export async function getDingUserByUnionId(appAccessToken, unionId, fetchImpl = fetch) {
  return postDingTopApi(appAccessToken, "/topapi/user/getbyunionid", { unionid: unionId }, fetchImpl);
}
\`\`\`

Browser login succeeds only when \`getDingUserByUnionId\` returns a real enterprise \`userid\`. Normalize both browser and embedded identities to the Session identity interface from Task 1.

- [ ] **Step 5: Implement start, callback, embedded, session, and logout routes**

\`start.js\` generates a 32-byte state, sets \`pfs_oauth_state\` for 10 minutes, and redirects to:

\`\`\`text
https://login.dingtalk.com/oauth2/auth
  ?redirect_uri=<origin>/api/auth/dingtalk/callback
  &response_type=code
  &client_id=<DINGTALK_APP_KEY>
  &scope=openid
  &state=<state>
  &prompt=consent
\`\`\`

\`callback.js\` validates the state Cookie, exchanges the code, verifies the employee, creates the Session, clears the OAuth Cookie, and redirects to \`/?login=success\`.

\`embedded.js\` accepts \`{ authCode, corpId }\`, uses the existing enterprise免登 flow, then creates the same Session Cookie. \`session.js\` returns only public user, role, department, title, loginMode, and expiry. \`logout.js\` revokes and clears the Session.

- [ ] **Step 6: Run auth tests and verify GREEN**

Run: \`node --test tests/dingtalk-web-auth.test.mjs tests/dingtalk-api.test.mjs\`

Expected: all tests PASS, including existing role mapping and config tests.

- [ ] **Step 7: Commit DingTalk login routes**

\`\`\`bash
git add functions/api/auth functions/api/dingtalk/_shared/dingtalk.js functions/api/dingtalk/login.js functions/api/dingtalk/config.js tests/dingtalk-web-auth.test.mjs tests/dingtalk-api.test.mjs
git commit -m "feat(auth): add DingTalk browser login"
\`\`\`

---

### Task 3: Protect Business APIs and Persist Employee Directory

**Files:**
- Create: \`functions/api/_middleware.js\`
- Modify: \`functions/api/state.js\`
- Modify: \`functions/api/sales.js\`
- Modify: \`functions/api/dingtalk/org/sync.js\`
- Modify: \`functions/api/auth/_shared/session.js\`
- Test: \`tests/dingtalk-web-auth.test.mjs\`
- Test: \`tests/shared-state.test.mjs\`

**Interfaces:**
- Consumes: \`readSession\`, \`requireSession\`, \`ensureAuthTables\`.
- Produces: \`upsertOrgMembers(db, org, corpId)\`, authenticated \`context.data.session\`, and 401 / 403 API behavior.

- [ ] **Step 1: Write failing middleware and permission tests**

Add tests asserting:

\`\`\`js
test("API middleware blocks anonymous company data", async () => {
  const response = await apiMiddleware({
    request: new Request("https://flow.example.com/api/state"),
    env: { PRODUCT_FLOW_DB: createAuthD1Mock() },
    data: {},
    next: () => new Response("unexpected")
  });
  assert.equal(response.status, 401);
});

test("API middleware keeps auth start callback session logout and config public", async () => {
  const paths = [
    "/api/auth/session",
    "/api/auth/logout",
    "/api/auth/dingtalk/start",
    "/api/auth/dingtalk/callback",
    "/api/auth/dingtalk/embedded",
    "/api/dingtalk/config"
  ];
  for (const path of paths) {
    const response = await apiMiddleware({
      request: new Request(\`https://flow.example.com\${path}\`),
      env: {},
      data: {},
      next: () => new Response("next", { status: 204 })
    });
    assert.equal(response.status, 204, path);
  }
});

test("readonly session cannot overwrite company state or import sales", async () => {
  const context = { data: { session: { role: "readonly", name: "只读员工" } } };
  const stateResponse = await stateRequest({
    ...context,
    request: new Request("https://flow.example.com/api/state", { method: "POST", body: JSON.stringify({ state: validState }) }),
    env: { PRODUCT_FLOW_DB: createStateD1Mock() }
  });
  const salesResponse = await salesRequest({
    ...context,
    request: new Request("https://flow.example.com/api/sales", { method: "POST", body: JSON.stringify({ rows: [validSalesRow] }) }),
    env: { PRODUCT_FLOW_DB: createSalesD1Mock() }
  });
  assert.equal(stateResponse.status, 403);
  assert.equal(salesResponse.status, 403);
});
\`\`\`

- [ ] **Step 2: Run focused tests and verify RED**

Run: \`node --test tests/dingtalk-web-auth.test.mjs tests/shared-state.test.mjs\`

Expected: FAIL because the middleware and server authorization are missing.

- [ ] **Step 3: Implement Pages middleware**

Allow \`OPTIONS\`, \`/api/auth/session\`, \`/api/auth/logout\`, \`/api/auth/dingtalk/start\`, \`/api/auth/dingtalk/callback\`, \`/api/auth/dingtalk/embedded\`, and \`/api/dingtalk/config\`. Every other \`/api/*\` route must call \`requireSession\`, assign the result to \`context.data.session\`, and then call \`context.next()\`.

- [ ] **Step 4: Enforce write access inside state and sales routes**

For \`POST /api/state\`, ignore client-provided \`updatedBy\` and use \`context.data.session.name\`. Return 403 when role is \`readonly\`. Apply the same rule to \`POST\` and \`DELETE /api/sales\`; authenticated GET remains readable.

- [ ] **Step 5: Store normalized organization members**

Add \`product_flow_org_members\` to \`ensureAuthTables\` and have org sync upsert current users. Mark previously cached users inactive when they are absent from a successful full sync. Sort and preserve department/title fields used by the existing selectors.

- [ ] **Step 6: Run backend regression tests and verify GREEN**

Run:

\`\`\`bash
node --test tests/dingtalk-web-auth.test.mjs tests/dingtalk-api.test.mjs tests/dingtalk-org-routes.test.mjs tests/dingtalk-org.test.mjs tests/dingtalk-sync.test.mjs tests/shared-state.test.mjs
\`\`\`

Expected: all selected backend tests PASS. Update legacy test requests to provide authenticated middleware context rather than bypassing authorization.

- [ ] **Step 7: Commit API protection**

\`\`\`bash
git add functions/api/_middleware.js functions/api/state.js functions/api/sales.js functions/api/dingtalk/org/sync.js functions/api/auth/_shared/session.js tests
git commit -m "feat(auth): protect company APIs"
\`\`\`

---

### Task 4: React Authentication Gate and Browser Login Page

**Files:**
- Create: \`/Users/roger/Documents/product-flow-system-react/src/domain/authSession.js\`
- Create: \`/Users/roger/Documents/product-flow-system-react/src/state/AuthProvider.jsx\`
- Create: \`/Users/roger/Documents/product-flow-system-react/src/features/auth/AuthGate.jsx\`
- Create: \`/Users/roger/Documents/product-flow-system-react/src/features/auth/LoginPage.jsx\`
- Modify: \`/Users/roger/Documents/product-flow-system-react/src/domain/dingTalkLogin.js\`
- Modify: \`/Users/roger/Documents/product-flow-system-react/src/state/ProductFlowProvider.jsx\`
- Modify: \`/Users/roger/Documents/product-flow-system-react/src/domain/sessionUser.js\`
- Modify: \`/Users/roger/Documents/product-flow-system-react/src/main.jsx\`
- Modify: \`/Users/roger/Documents/product-flow-system-react/src/styles.css\`
- Test: \`/Users/roger/Documents/product-flow-system-react/tests/react-app.test.mjs\`

**Interfaces:**
- Produces: \`useAuth()\` returning \`{ status, account, error, retry, logout }\`.
- \`status\` is one of \`checking\`, \`anonymous-browser\`, \`anonymous-embedded\`, \`authenticated\`, \`forbidden\`, \`error\`.
- \`authSessionApi.getSession()\`, \`.loginEmbedded(authCode, corpId)\`, \`.logout()\`.

- [ ] **Step 1: Write failing frontend structure tests**

Add source-level tests asserting that:

\`\`\`js
test("business app is gated by a server session", () => {
  const main = read("src/main.jsx");
  const gate = read("src/features/auth/AuthGate.jsx");
  const provider = read("src/state/AuthProvider.jsx");
  assert.match(main, /AuthProvider/);
  assert.match(main, /AuthGate/);
  assert.match(provider, /\\/api\\/auth\\/session/);
  assert.match(gate, /anonymous-browser/);
  assert.match(gate, /LoginPage/);
});

test("browser login uses the server OAuth start route", () => {
  const page = read("src/features/auth/LoginPage.jsx");
  assert.match(page, /\\/api\\/auth\\/dingtalk\\/start/);
  assert.match(page, /钉钉扫码登录/);
});
\`\`\`

- [ ] **Step 2: Run the focused frontend test and verify RED**

Run: \`npm test -- --test-name-pattern="session|browser login|embedded"\`

Expected: FAIL because the provider, gate, and page do not exist.

- [ ] **Step 3: Implement the auth API client and provider**

\`getSession\` sends same-origin credentials. A 401 returns anonymous instead of throwing. In DingTalk, anonymous state triggers \`requestDingAuthCode\` and \`POST /api/auth/dingtalk/embedded\`, then reloads \`/api/auth/session\`. In a normal browser, anonymous state becomes \`anonymous-browser\` without invoking JSAPI.

Do not write role or user identity into localStorage. Keep only non-security UI caches.

- [ ] **Step 4: Implement AuthGate and LoginPage**

\`AuthGate\` renders:

- full-page loading for \`checking\` and \`anonymous-embedded\`;
- \`LoginPage\` for \`anonymous-browser\`, \`forbidden\`, and \`error\`;
- children only for \`authenticated\`.

The login page contains the product mark, “产品全周期协同系统”, “仅限公司员工使用”, and a primary “钉钉扫码登录” link to \`/api/auth/dingtalk/start\`. It has no feature marketing, no data preview, and no production test-login button.

When \`window.location.hostname\` is \`localhost\`, \`127.0.0.1\`, or \`::1\`, the provider may expose a separate local-test action. That action creates an in-memory \`source: "local-test"\` identity, uses local fixture/cache data only, and disables real DingTalk writes. It never calls the protected production API as an unauthenticated user.

- [ ] **Step 5: Gate company-state loading**

Move trustworthy identity from localStorage into \`useAuth().account\`. \`ProductFlowProvider\` must not call \`/api/state\` or \`/api/dingtalk/org/sync\` until auth status is \`authenticated\`. Preserve the existing state normalization and save behavior after authentication.

- [ ] **Step 6: Add compact auth styling**

Use existing design tokens. The login surface is centered at \`min(440px, calc(100vw - 32px))\`, uses one 8px-radius panel, 44px controls, visible focus state, and responsive padding. Do not introduce gradients, illustrations, nested cards, or large display typography.

- [ ] **Step 7: Run frontend tests and verify GREEN**

Run: \`npm test\`

Expected: all React tests PASS.

Run: \`npm run build\`

Expected: Vite production build exits 0.

---

### Task 5: Account Menu, Logout, and Local Development Safety

**Files:**
- Modify: \`/Users/roger/Documents/product-flow-system-react/src/App.jsx\`
- Modify: \`/Users/roger/Documents/product-flow-system-react/src/styles.css\`
- Modify: \`/Users/roger/Documents/product-flow-system-react/src/state/AuthProvider.jsx\`
- Modify: \`/Users/roger/Documents/product-flow-system-react/tests/react-app.test.mjs\`

**Interfaces:**
- Consumes: \`useAuth().logout\`.
- Produces: keyboard-accessible account menu with one “退出登录” command.

- [ ] **Step 1: Write failing logout and production-safety tests**

Assert that the account chip is a button, opens a menu, and calls \`logout\`. Assert that “本地测试登录” is rendered only when \`isLocalPreview()\` is true, uses an in-memory \`local-test\` account, and never bypasses \`/api/auth/session\` on a production hostname.

- [ ] **Step 2: Run focused tests and verify RED**

Run: \`npm test -- --test-name-pattern="logout|production|account"\`

Expected: FAIL because the account menu and logout integration are missing.

- [ ] **Step 3: Implement account menu and logout**

Use the existing account chip dimensions. Display name, department/title, and a single “退出登录” row. On success, clear UI identity, preserve non-sensitive local UI preferences, and return to \`anonymous-browser\` or restart embedded login based on runtime. A local-test logout returns to the localhost-only login screen without sending a production logout request.

- [ ] **Step 4: Verify GREEN and run the design audit**

Run: \`npm test && npm run build\`.

Then inspect 1440×900 and 1280×720 screenshots for login, dashboard, and the account menu. Check hierarchy, spacing, alignment, keyboard focus, overflow, and text truncation.

---

### Task 6: Build Sync, Preview Authentication, and Production Release

**Files:**
- Replace from build: \`/Users/roger/Documents/product-flow-system/index.html\`
- Replace from build: \`/Users/roger/Documents/product-flow-system/assets/*\`
- Modify: \`/Users/roger/Documents/product-flow-system/DINGTALK_SETUP.md\`

**Interfaces:**
- Consumes: passing backend tests and React \`dist\`.
- Produces: Cloudflare Preview and production deployments using the same callback and D1 binding.

- [ ] **Step 1: Run fresh verification before building**

React workspace:

\`\`\`bash
cd /Users/roger/Documents/product-flow-system-react
npm test
npm run build
\`\`\`

Release repository:

\`\`\`bash
cd /Users/roger/Documents/product-flow-system
node --test tests/dingtalk-web-auth.test.mjs tests/dingtalk-api.test.mjs tests/dingtalk-org-routes.test.mjs tests/dingtalk-org.test.mjs tests/dingtalk-sync.test.mjs tests/shared-state.test.mjs
\`\`\`

Expected: every current-suite test exits 0.

- [ ] **Step 2: Sync the React build into the release repository**

\`\`\`bash
rsync -a --delete /Users/roger/Documents/product-flow-system-react/dist/assets/ /Users/roger/Documents/product-flow-system/assets/
cp /Users/roger/Documents/product-flow-system-react/dist/index.html /Users/roger/Documents/product-flow-system/index.html
\`\`\`

Review \`git status\`, stage only auth/backend/build files, and commit:

\`\`\`bash
git commit -m "feat: add DingTalk web login"
\`\`\`

- [ ] **Step 3: Configure DingTalk callback and Cloudflare Preview**

Register the exact callback URL shown by \`/api/dingtalk/config\` for the Preview host. Keep \`DINGTALK_APP_KEY\`, \`DINGTALK_APP_SECRET\`, \`DINGTALK_CORP_ID\`, and \`PRODUCT_FLOW_DB\` as Cloudflare environment bindings. Never place them in the bundle.

- [ ] **Step 4: Verify real browser QR login on Preview**

Use a company DingTalk account to verify login, refresh persistence, correct department/title, logout, and re-login. Verify a non-enterprise DingTalk account returns 403. Inspect Network to confirm unauthenticated \`/api/state\` returns 401 and no business payload.

- [ ] **Step 5: Verify embedded DingTalk login on Preview**

Open the Preview URL from DingTalk workbench. Verify JSAPI silent login creates the same \`pfs_session\`, business data loads, and todo/calendar operations still use the logged-in user.

- [ ] **Step 6: Publish production and verify the deployed hash**

Push the release commit to \`main\`. Poll \`https://product-flow-system.pages.dev/\` until it references the new asset hash. Verify \`/api/auth/session\`, browser QR login, embedded login, \`/api/state\` authorization, logout, and one read-only product progress flow.

- [ ] **Step 7: Record known legacy test status**

The release repository still contains old single-file HTML UI tests that do not represent the React bundle. Do not claim the full legacy \`npm test\` suite passes unless those tests are migrated separately. Report current React tests and selected backend tests explicitly.
`,de=`# Platform Sales Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Sort the platform sales table by sales amount by default and expose compact sortable column headers.

**Architecture:** Keep comparator behavior in \`salesData.js\` and local interaction state in \`ProductSalesModal.jsx\`. Feed a sorted copy into the existing \`DataTable\`; add narrowly scoped styles for the header controls.

**Tech Stack:** React 19, Lucide React, JavaScript, Node test runner.

## Global Constraints

- Default to \`netSales\` descending.
- Do not mutate \`summary.byPlatform\`.
- Sorting must not change metric cards, trend data, or persisted sales rows.
- Direction must be communicated by icon shape and accessible text, not color alone.

---

### Task 1: Platform sort domain behavior and UI

**Files:**
- Modify: \`src/domain/salesData.js\`
- Modify: \`src/features/archive/ProductSalesModal.jsx\`
- Modify: \`src/styles.css\`
- Test: \`tests/sales-data.test.mjs\`

**Interfaces:**
- Produces: \`sortPlatformSalesRows(rows, sort)\` returning a new sorted array.
- Consumes: \`{ key, direction }\`, where direction is \`asc\` or \`desc\`.

- [ ] **Step 1: Write a failing domain test proving sales-desc default, direction toggles, and input immutability.**
- [ ] **Step 2: Run \`node --test tests/sales-data.test.mjs\` and verify the missing export fails.**
- [ ] **Step 3: Implement the comparator, local sort state, sortable headers, and compact focus/active styles.**
- [ ] **Step 4: Run \`npm test\` and \`npm run build\`.**
- [ ] **Step 5: Inspect the table at laptop width and confirm header alignment and stable row height.**
`,ce='# Product Planning Implementation Plan\n\n> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.\n\n**Goal:** Consolidate the React source and Cloudflare release repository, then ship a shared annual product planning timeline backed by the existing D1 company state.\n\n**Architecture:** `/Users/roger/Documents/product-flow-system` becomes the only source and release repository. Product planning is an independent `productPlans` state slice with pure date/timeline helpers, provider CRUD actions, and a React feature page; it never mutates demand or product workflow state.\n\n**Tech Stack:** React 19, Vite 7, Tailwind CSS 4, vanilla CSS design tokens, Node test runner, Cloudflare Pages Functions, D1.\n\n## Global Constraints\n\n- Everyone can view product planning; only `产品部` and `总经办` can edit.\n- Historical department label `产品团队` normalizes to `产品部`.\n- Dragging a demand into planning never changes demand status or initiates a product.\n- A demand may have multiple independent planning records, including overlapping and cross-year ranges.\n- The release repository remains compatible with the existing `/api/state` D1 row contract.\n- Disabled actions expose an explicit hover reason.\n\n---\n\n### Task 1: Consolidate Source and Release Repositories\n\n**Files:**\n- Move into release repo: `src/**`, `vite.config.js`, React `index.html`, `package-lock.json`\n- Create: `react-tests/*.test.mjs`\n- Modify: `package.json`\n- Modify: `.gitignore`\n\n**Interfaces:**\n- Consumes: passing React baseline (`98` tests).\n- Produces: one repository that can run `npm run dev`, `npm test`, and `npm run build`.\n\n- [ ] **Step 1: Record the current baseline**\n\nRun: `cd /Users/roger/Documents/product-flow-system-react && npm test`\n\nExpected: `98` tests pass.\n\n- [ ] **Step 2: Copy source and React tests into the release repository**\n\nCopy `src`, `vite.config.js`, `index.html`, and lockfile. Put React tests in `react-tests/` so they do not overwrite release API tests.\n\n- [ ] **Step 3: Merge package scripts and dependencies**\n\nUse these scripts:\n\n```json\n{\n  "dev": "vite --host 127.0.0.1 --port 8132",\n  "build": "vite build",\n  "preview": "vite preview --host 127.0.0.1 --port 8133",\n  "test:react": "node --test react-tests/*.test.mjs",\n  "test:api": "node --test tests/dingtalk-api.test.mjs tests/dingtalk-org.test.mjs tests/dingtalk-org-routes.test.mjs tests/dingtalk-sync.test.mjs tests/dingtalk-todo-update.test.mjs tests/dingtalk-web-auth.test.mjs",\n  "test": "npm run test:react && npm run test:api"\n}\n```\n\n- [ ] **Step 4: Install and verify the merged repository**\n\nRun: `npm install && npm run test:react && npm run build`\n\nExpected: React tests pass and Vite creates `dist/`.\n\n- [ ] **Step 5: Commit repository consolidation**\n\n```bash\ngit add src react-tests vite.config.js index.html package.json package-lock.json .gitignore\ngit commit -m "build: consolidate React source and release repo"\n```\n\n### Task 2: Add Product Planning Domain and Shared State\n\n**Files:**\n- Create: `src/domain/productPlanning.js`\n- Modify: `src/domain/productFlow.js`\n- Modify: `src/domain/permissions.js`\n- Modify: `src/state/stateModel.js`\n- Modify: `src/state/ProductFlowProvider.jsx`\n- Modify: `functions/api/state.js`\n- Test: `react-tests/product-planning.test.mjs`\n- Test: `react-tests/shared-state.test.mjs`\n- Test: `tests/shared-state.test.mjs`\n\n**Interfaces:**\n- Produces: `normalizeProductPlans(value)`, `planIntersectsYear(plan, year)`, `timelineSegment(start, end, year)`, provider actions `addProductPlan`, `updateProductPlan`, `deleteProductPlan`.\n\n- [ ] **Step 1: Write failing domain tests**\n\n```js\ntest("planning records normalize and intersect displayed years", () => {\n  const [plan] = normalizeProductPlans([{ id: "plan-1", demandId: "d1", developmentStart: "2026-12-15", developmentEnd: "2027-01-20", launchStart: "2027-02-01", launchEnd: "2027-02-10" }]);\n  assert.equal(planIntersectsYear(plan, 2026), true);\n  assert.equal(planIntersectsYear(plan, 2027), true);\n});\n```\n\n- [ ] **Step 2: Run tests and verify RED**\n\nRun: `node --test react-tests/product-planning.test.mjs`\n\nExpected: FAIL because `productPlanning.js` does not exist.\n\n- [ ] **Step 3: Implement pure planning helpers**\n\nNormalize IDs, demand snapshots, ISO dates and audit metadata. Reject incomplete or reversed date ranges through `validateProductPlan(input)` returning `{ valid, reason }`.\n\n- [ ] **Step 4: Add failing shared-state and permission tests**\n\nAssert that old state receives `productPlans: []`, `产品团队` migrates to `产品部`, planning navigation is visible to all, and editing is limited to `产品部` and `总经办`.\n\n- [ ] **Step 5: Integrate state and provider CRUD**\n\nAdd `productPlans` to `createDefaultState`, `normalizeClientState`, provider value, and backend required arrays. Provider actions must preserve all other state slices.\n\n- [ ] **Step 6: Run focused tests and commit**\n\nRun: `node --test react-tests/product-planning.test.mjs react-tests/shared-state.test.mjs tests/shared-state.test.mjs`\n\nExpected: all focused tests pass.\n\n```bash\ngit add src/domain/productPlanning.js src/domain/productFlow.js src/domain/permissions.js src/state/stateModel.js src/state/ProductFlowProvider.jsx functions/api/state.js react-tests/product-planning.test.mjs react-tests/shared-state.test.mjs tests/shared-state.test.mjs\ngit commit -m "feat(planning): add shared annual plan state"\n```\n\n### Task 3: Build Product Planning Timeline\n\n**Files:**\n- Create: `src/features/planning/ProductPlanningPage.jsx`\n- Create: `src/features/planning/PlanningDemandTray.jsx`\n- Create: `src/features/planning/AnnualPlanningTimeline.jsx`\n- Create: `src/features/planning/ProductPlanModal.jsx`\n- Modify: `src/App.jsx`\n- Modify: `src/styles.css`\n- Test: `react-tests/react-app.test.mjs`\n\n**Interfaces:**\n- Consumes: product planning helpers and provider CRUD from Task 2, existing `DemandModal`, `Modal`, `Button`, `DatePickerField`.\n- Produces: `#planning` route with demand tray and annual timeline.\n\n- [ ] **Step 1: Write failing page wiring tests**\n\nAssert navigation order `demands -> planning -> progress`, `CalendarRange` icon use, shared `DemandModal`, draggable demand items, a twelve-month timeline, two labelled bars, and read-only disabled reasons.\n\n- [ ] **Step 2: Run tests and verify RED**\n\nRun: `node --test react-tests/react-app.test.mjs`\n\nExpected: FAIL because the planning route and components are absent.\n\n- [ ] **Step 3: Implement the page shell and demand tray**\n\nShow year selector, “添加需求机会”, and compact thumbnail/name demand chips. Implement HTML drag data as `application/x-product-demand-id`; provide a keyboard/touch “安排” action.\n\n- [ ] **Step 4: Implement timeline and plan modal**\n\nUse a sticky product column and twelve equal month tracks. Render blue `开发` and green `上线` bars using `timelineSegment`. Drop opens `ProductPlanModal` with the target month prefilled; save validates four dates.\n\n- [ ] **Step 5: Add editing, deletion and missing-demand state**\n\nClick a bar to edit. Delete uses `window.confirm`. Missing demand records use `demandSnapshot` and show “来源需求已删除”.\n\n- [ ] **Step 6: Add responsive and interaction styles**\n\nUse fixed timeline geometry, horizontal overflow, sticky first column, visible focus rings, reduced-motion fallbacks, and tooltips for disabled edit actions.\n\n- [ ] **Step 7: Run tests and commit**\n\nRun: `npm run test:react`\n\nExpected: all React tests pass.\n\n```bash\ngit add src/features/planning src/App.jsx src/styles.css react-tests/react-app.test.mjs\ngit commit -m "feat(planning): add annual product timeline"\n```\n\n### Task 4: Verify and Publish from the Unified Repository\n\n**Files:**\n- Modify generated: `index.html`, `assets/**`\n- Modify: `docs/superpowers/plans/2026-07-15-product-planning.md`\n\n**Interfaces:**\n- Consumes: complete merged source and tests.\n- Produces: verified root static assets for the existing Cloudflare Pages deployment.\n\n- [ ] **Step 1: Run full verification**\n\nRun: `npm test && npm run build`\n\nExpected: React and focused API tests pass; build exits `0`.\n\n- [ ] **Step 2: Run local visual acceptance**\n\nStart `npm run dev`. Verify `#planning` at 1440×900 and 1280×800: demand tray, drag/drop modal, cross-month bars, edit/delete, read-only behavior, and no text overlap.\n\n- [ ] **Step 3: Sync built assets to repository root**\n\nReplace root `index.html` and root `assets/` with `dist/index.html` and `dist/assets/` so the current Pages configuration continues to serve the React build.\n\n- [ ] **Step 4: Run release API tests and inspect the diff**\n\nRun: `npm run test:api && git diff --check && git status --short`\n\nExpected: tests pass, no whitespace errors, only intended files changed.\n\n- [ ] **Step 5: Commit release artifacts**\n\n```bash\ngit add index.html assets docs/superpowers/plans/2026-07-15-product-planning.md\ngit commit -m "build: publish product planning assets"\n```\n\nDeployment is a separate external action: push only after local acceptance and explicit publication instruction.\n',le=`# Product Progress Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Add a compact, shared development-to-launch schedule summary to the product progress page without changing workflow stage or task state.

**Architecture:** Extend the existing dashboard schedule domain helper so it returns one reusable summary for any product. Render that summary through a focused progress-page component placed between \`PageHeader\` and the stage grid. Missing or invalid legacy schedules remain neutral and route users to product planning.

**Tech Stack:** React 19, Vite, CSS design tokens, Node test runner.

## Global Constraints

- \`productPlans\` remains the only source of development and launch dates.
- Dashboard and product progress must use the same percentage and status rules.
- Missing or invalid dates display \`未设置排期\`, never \`0%\`.
- Products in launch or review stages display green \`100%\` and are never overdue.
- No new runtime dependency.

---

### Task 1: Shared Product Schedule Summary

**Files:**
- Modify: \`src/domain/dashboardSummary.js\`
- Modify: \`react-tests/dashboard-summary.test.mjs\`

**Interfaces:**
- Produces: \`buildProductScheduleSummary(product, plans, demands, today)\` returning \`{ product, plan, schedule }\`.
- \`schedule\` includes \`state\`, \`percent\`, \`label\`, \`launchDate\`, \`developmentStart\`, \`daysRemaining\`.

- [x] **Step 1: Write failing tests**

Add cases for future development start, seven-day launch warning, missing dates and a shared single-product summary.

- [x] **Step 2: Verify failure**

Run \`node --test react-tests/dashboard-summary.test.mjs\`; expect the new exported helper or states to fail.

- [x] **Step 3: Implement the reusable helper**

Export \`buildProductScheduleSummary\` and make \`buildDashboardProductSummaries\` map through it. Preserve P0-P3 sorting.

- [x] **Step 4: Verify pass**

Run \`node --test react-tests/dashboard-summary.test.mjs\`; expect all dashboard schedule tests to pass.

### Task 2: Product Progress Schedule Component

**Files:**
- Create: \`src/features/progress/ProductScheduleSummary.jsx\`
- Modify: \`src/features/progress/ProductProgressPage.jsx\`
- Modify: \`src/styles.css\`
- Modify: \`react-tests/react-app.test.mjs\`

**Interfaces:**
- Consumes: a \`schedule\` object from \`buildProductScheduleSummary\` and \`onOpenPlanning()\`.
- Produces: an accessible compact strip with progress ring, date range, status and optional planning action.

- [x] **Step 1: Write failing source acceptance assertions**

Assert that product progress imports the shared schedule helper and renders \`ProductScheduleSummary\` before \`.stage-grid\`.

- [x] **Step 2: Verify failure**

Run \`node --test react-tests/react-app.test.mjs\`; expect missing component assertions to fail.

- [x] **Step 3: Implement component and styling**

Render the ring, development and launch dates, status label, and \`前往产品规划\` only for unplanned schedules. Use existing tokens for active, warning, danger and success states.

- [x] **Step 4: Verify pass**

Run \`node --test react-tests/react-app.test.mjs\`; expect all React acceptance tests to pass.

### Task 3: Full Verification and Design Audit

**Files:**
- Verify only.

**Interfaces:**
- Consumes: completed domain and UI changes.
- Produces: test, build and browser evidence.

- [x] **Step 1: Run full test and build**

Run \`npm run test:react && npm run build\`; expect all tests and Vite build to pass.

- [x] **Step 2: Inspect the local page at 1440x900**

Confirm the summary is between the page header and stage cards, aligns to the content width, and does not compete with the title.

- [x] **Step 3: Inspect the local page at 1024x768**

Confirm dates and action remain readable without overlap or horizontal page overflow.
`,pe=`# Executive Personal Todo and DingTalk Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** 为总经办提供默认打开的个人待办工作台，把平台责任事项统一投影为个人待办，并通过钉钉官方企业待办查询接口安全地实现状态双向同步，同时在本地只读预览真实线上待办。

**Architecture:** \`personalTodos\` 是战略平台的持久化执行投影，原始项目、风险、决策和产品任务仍是业务事实源。前端只按当前用户 \`unionId\` 展示和拉取状态，服务端只查询会话本人；远端返回数据只与已保存的 \`dingTodo.id\` 求交集，绝不按标题匹配或导入其他待办。本地 DWS 桥接仅存在于 Node 开发服务并强制回环地址和 GET 请求。

**Tech Stack:** React 19、Node.js ESM、Node test runner、Cloudflare Pages Functions、D1、钉钉 OpenAPI、DWS CLI、Vite 7。

## Global Constraints

- 功能只保留在 \`codex/company-strategy-platform\`，不合并进 \`main\`，不部署线上。
- 以 \`unionId\` 作为钉钉身份依据；姓名只用于显示和旧数据迁移。
- 只同步和回流带有已保存 \`dingTodo.id\` 的平台关联待办，不导入私人待办或其他系统待办。
- 决策在钉钉完成后不能自动批准；风险在钉钉完成后不能自动关闭。
- 钉钉查询或同步失败不能阻塞平台待办保存和公司驾驶舱。
- 本地 DWS 接口只允许回环地址上的 GET 查询，不提供任何写命令，不持久化返回数据。
- 生产状态拉取必须使用当前服务端会话的 \`unionId\`，忽略客户端传入的其他用户身份。
- 所有生产代码遵循测试先行：先看到目标测试因缺少行为而失败，再写最小实现。

---

### Task 1: Unified Personal Todo Projection

**Files:**
- Create: \`src/domain/personalTodos.js\`
- Create: \`react-tests/personal-todos.test.mjs\`
- Modify: \`src/domain/strategyExecution.js\`

**Interfaces:**
- Consumes: \`platformState\`, \`productState\`, \`orgCache.users\`, and a deterministic \`now\`.
- Produces: \`reconcilePersonalTodos(input) -> PersonalTodo[]\`, \`personalTodosForUser(todos, user) -> PersonalTodo[]\`, \`groupPersonalTodos(todos, now) -> grouped object\`, \`applyRemoteTodoSnapshots(todos, snapshots, user, now) -> { todos, effects, audits }\`.

- [ ] **Step 1: Write failing projection tests**

\`\`\`js
test("projects all explicit responsibility sources into stable personal todos", () => {
  const todos = reconcilePersonalTodos({
    platformState: normalizePlatformState({
      projects: [{ id: "p1", name: "新品上市", strategyId: "s1", objectiveId: "o1" }],
      milestones: [{ id: "m1", projectId: "p1", title: "完成首发", owner: "周总", dueDate: "2026-07-18", status: "pending" }],
      risks: [{ id: "r1", projectId: "p1", title: "库存风险", owner: "周总", promisedAt: "2026-07-19", status: "open" }],
      decisionRequests: [{ id: "d1", projectId: "p1", title: "追加预算", decisionOwner: "周总", dueDate: "2026-07-17", status: "pending" }]
    }),
    productState: { tasks: [{ id: "t1", productId: "product-1", title: "补齐详情页", due: "2026-07-20", done: false, dingTodo: { executorUnionIds: ["union-zhou"], executorNames: ["周总"] } }] },
    orgCache: { users: [{ userid: "u-zhou", unionid: "union-zhou", name: "周总", department: "总经办" }] },
    existingTodos: [],
    now: "2026-07-16T08:00:00.000Z"
  });
  assert.deepEqual(new Set(todos.map(todo => todo.sourceType)), new Set(["milestone", "risk", "decision", "product_task", "review"]));
  assert.equal(todos.find(todo => todo.sourceType === "milestone").sourceKey, "strategy-platform:milestone:m1");
  assert.equal(todos.every(todo => todo.assigneeUnionId === "union-zhou"), true);
});

test("department-only product tasks never become personal todos", () => {
  const todos = reconcilePersonalTodos({
    platformState: normalizePlatformState({}),
    productState: { tasks: [{ id: "t1", title: "部门公共任务", ownerDept: "产品部", done: false }] },
    orgCache: { users: [{ unionid: "union-ye", name: "叶经理", department: "产品部" }] },
    existingTodos: [],
    now: "2026-07-16T08:00:00.000Z"
  });
  assert.equal(todos.some(todo => todo.sourceId === "t1"), false);
});
\`\`\`

- [ ] **Step 2: Run the projection tests and verify RED**

Run: \`node --test react-tests/personal-todos.test.mjs\`

Expected: FAIL with \`ERR_MODULE_NOT_FOUND\` for \`src/domain/personalTodos.js\`.

- [ ] **Step 3: Implement the minimal projection and collection normalization**

\`\`\`js
export function reconcilePersonalTodos({ platformState, productState = {}, orgCache = {}, existingTodos = [], now = new Date() }) {
  const users = Array.isArray(orgCache.users) ? orgCache.users : [];
  const candidates = [
    ...platformState.milestones.filter(item => !item.archived).map(item => sourceCandidate("milestone", item, item.owner, item.dueDate)),
    ...platformState.risks.filter(item => !item.archived && item.status !== "closed").map(item => sourceCandidate("risk", item, item.owner, item.promisedAt)),
    ...platformState.decisionRequests.filter(item => !item.archived && item.status === "pending").map(item => sourceCandidate("decision", item, item.decisionOwner, item.dueDate)),
    ...productTaskCandidates(productState.tasks || [], users),
    ...weeklyReviewCandidates(platformState.statusUpdates, users, now)
  ];
  return reconcileCandidates(candidates, existingTodos, users, now);
}

export function personalTodosForUser(todos, user) {
  const unionId = String(user?.unionid || user?.unionId || "");
  return unionId ? todos.filter(todo => todo.assigneeUnionId === unionId && todo.status !== "cancelled") : [];
}

export function groupPersonalTodos(todos, now = new Date()) {
  const today = localDate(now);
  const sevenDaysLater = addDays(today, 7);
  return todos.reduce((groups, todo) => {
    const key = todo.status === "done" ? "completed"
      : todo.dueDate && todo.dueDate < today ? "overdue"
        : todo.dueDate === today ? "today"
          : todo.dueDate && todo.dueDate <= sevenDaysLater ? "nextSevenDays"
            : "later";
    groups[key].push(todo);
    return groups;
  }, { overdue: [], today: [], nextSevenDays: [], later: [], completed: [] });
}
\`\`\`

Add \`"personalTodos"\` to \`PLATFORM_COLLECTIONS\` and add \`personalTodos: []\` to \`createDefaultPlatformState()\`.

- [ ] **Step 4: Add grouping, reassignment, preservation, and remote snapshot tests**

\`\`\`js
test("remote status only touches the signed-in user's linked DingTalk ids", () => {
  const input = [
    { id: "todo-1", sourceType: "milestone", sourceId: "m1", assigneeUnionId: "union-zhou", status: "pending", dingTodo: { id: "ding-1", lastEventAt: "" } },
    { id: "todo-2", sourceType: "risk", sourceId: "r1", assigneeUnionId: "union-other", status: "pending", dingTodo: { id: "ding-2" } }
  ];
  const result = applyRemoteTodoSnapshots(input, [
    { taskId: "ding-1", isDone: true, modifiedTime: "2026-07-16T09:00:00.000Z" },
    { taskId: "unlinked", isDone: true, modifiedTime: "2026-07-16T09:00:00.000Z" }
  ], { unionid: "union-zhou" }, "2026-07-16T09:01:00.000Z");
  assert.equal(result.todos[0].status, "done");
  assert.deepEqual(result.effects, [{ type: "complete_milestone", sourceId: "m1" }]);
  assert.equal(result.todos[1].status, "pending");
});

test("decision and risk completion require platform confirmation", () => {
  const todos = [
    { id: "d", sourceType: "decision", sourceId: "decision-1", assigneeUnionId: "u", status: "pending", dingTodo: { id: "ding-d" } },
    { id: "r", sourceType: "risk", sourceId: "risk-1", assigneeUnionId: "u", status: "pending", dingTodo: { id: "ding-r" } }
  ];
  const result = applyRemoteTodoSnapshots(todos, [
    { taskId: "ding-d", isDone: true, modifiedTime: "2026-07-16T09:00:00.000Z" },
    { taskId: "ding-r", isDone: true, modifiedTime: "2026-07-16T09:00:00.000Z" }
  ], { unionid: "u" }, "2026-07-16T09:01:00.000Z");
  assert.equal(result.todos.every(todo => todo.status === "done"), true);
  assert.deepEqual(result.effects, []);
  assert.match(result.audits.map(item => item.action).join(" "), /decision_pending_confirmation/);
  assert.match(result.audits.map(item => item.action).join(" "), /risk_pending_confirmation/);
});
\`\`\`

- [ ] **Step 5: Run the domain tests and verify GREEN**

Run: \`node --test react-tests/personal-todos.test.mjs react-tests/strategy-execution.test.mjs\`

Expected: all tests PASS, including normalization of \`personalTodos\`.

- [ ] **Step 6: Commit the domain model**

\`\`\`bash
git add src/domain/personalTodos.js src/domain/strategyExecution.js react-tests/personal-todos.test.mjs react-tests/strategy-execution.test.mjs
git commit -m "feat(todo): add unified personal todo projection"
\`\`\`

### Task 2: DingTalk List API and Personal Todo Payload

**Files:**
- Modify: \`functions/api/dingtalk/_shared/dingtalk.js\`
- Create: \`functions/api/dingtalk/todo/list.js\`
- Modify: \`src/domain/platformNotifications.js\`
- Create: \`tests/dingtalk-todo-list.test.mjs\`
- Modify: \`react-tests/platform-notifications.test.mjs\`
- Modify: \`package.json\`

**Interfaces:**
- Consumes: authenticated \`data.session.unionId\`; \`PersonalTodo\` and current creator identity.
- Produces: \`listDingTodoTasks(accessToken, unionId, { isDone, fetchImpl })\`, GET \`/api/dingtalk/todo/list\`, and \`buildPersonalTodoPayload(todo, creator, detailUrl)\`.

- [ ] **Step 1: Write failing API and payload tests**

\`\`\`js
test("DingTalk todo list uses the authenticated session identity and paginates", async () => {
  const calls = [];
  const todos = await listDingTodoTasks("token", "union-zhou", { isDone: true, fetchImpl: async url => {
    calls.push(url);
    return okJson(calls.length === 1
      ? { todoCards: [{ taskId: "d1", isDone: true }], nextToken: "next-1" }
      : { todoCards: [{ taskId: "d2", isDone: true }], nextToken: "" });
  }});
  assert.deepEqual(todos.map(item => item.taskId), ["d1", "d2"]);
  assert.match(calls[0], /users\\/union-zhou\\/tasks/);
  assert.match(calls[0], /isDone=true/);
  assert.match(calls[1], /nextToken=next-1/);
});

test("personal todo payload keeps a stable platform source id", () => {
  const payload = buildPersonalTodoPayload({
    id: "todo-1", sourceType: "milestone", sourceId: "m1", title: "完成首发", dueDate: "2026-07-18",
    assigneeUnionId: "union-owner", status: "pending", dingTodo: {}
  }, { unionid: "union-creator" }, "https://flow.example.com/#company");
  assert.equal(payload.sourceId, "strategy-platform:milestone:m1");
  assert.deepEqual(payload.executorUnionIds, ["union-owner"]);
  assert.equal(payload.done, false);
});
\`\`\`

- [ ] **Step 2: Run focused tests and verify RED**

Run: \`node --test tests/dingtalk-todo-list.test.mjs react-tests/platform-notifications.test.mjs\`

Expected: FAIL because the list function, endpoint, and payload builder do not exist.

- [ ] **Step 3: Implement list pagination and the authenticated endpoint**

\`\`\`js
export async function listDingTodoTasks(accessToken, unionId, { isDone = false, fetchImpl = fetch } = {}) {
  if (!unionId) throw Object.assign(new Error("当前登录账号缺少 unionId，无法查询钉钉待办。"), { status: 400 });
  const cards = [];
  let nextToken = "";
  do {
    const query = new URLSearchParams({ isDone: String(Boolean(isDone)) });
    if (nextToken) query.set("nextToken", nextToken);
    const page = await requestDingOpenApi(accessToken, "GET", \`/v1.0/todo/users/\${encodeURIComponent(unionId)}/tasks?\${query}\`, null, fetchImpl);
    cards.push(...(page.todoCards || []));
    nextToken = String(page.nextToken || "");
  } while (nextToken);
  return cards;
}
\`\`\`

The Pages Function reads \`data.session.unionId\`, ignores user identity in the request, fetches both \`isDone=false\` and \`isDone=true\`, and returns \`{ synced: true, todos }\`:

\`\`\`js
export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "GET") return jsonResponse({ message: "Method not allowed" }, 405);
  const unionId = String(data.session?.unionId || "");
  if (!unionId) return jsonResponse({ synced: false, message: "当前登录账号缺少 unionId。" }, 400);
  const accessToken = await getDingAccessToken(env);
  const [pending, completed] = await Promise.all([
    listDingTodoTasks(accessToken, unionId, { isDone: false }),
    listDingTodoTasks(accessToken, unionId, { isDone: true })
  ]);
  return jsonResponse({ synced: true, todos: [...pending, ...completed] });
}
\`\`\`

- [ ] **Step 4: Implement the generic outbound payload**

\`\`\`js
export function buildPersonalTodoPayload(todo, creator, detailUrl) {
  const creatorUnionId = identityUnionId(creator);
  if (!creatorUnionId || !todo?.assigneeUnionId) throw new Error("当前待办缺少可用的钉钉身份。");
  return {
    todoId: todo.dingTodo?.id || "",
    sourceId: todo.sourceKey || \`strategy-platform:\${todo.sourceType}:\${todo.sourceId}\`,
    subject: todo.title,
    description: todo.description || "公司战略执行平台责任事项",
    creatorUnionId,
    executorUnionIds: [todo.assigneeUnionId],
    detailUrl,
    dueTime: new Date(\`\${todo.dueDate}T18:00:00+08:00\`).getTime(),
    priority: todo.priority || 20,
    done: todo.status === "done"
  };
}
\`\`\`

- [ ] **Step 5: Register and run API tests**

Add \`tests/dingtalk-todo-list.test.mjs\` to \`test:api\` and run:

\`node --test tests/dingtalk-todo-list.test.mjs tests/dingtalk-todo-update.test.mjs react-tests/platform-notifications.test.mjs\`

Expected: all tests PASS.

- [ ] **Step 6: Commit the API boundary**

\`\`\`bash
git add functions/api/dingtalk/_shared/dingtalk.js functions/api/dingtalk/todo/list.js src/domain/platformNotifications.js tests/dingtalk-todo-list.test.mjs react-tests/platform-notifications.test.mjs package.json
git commit -m "feat(todo): add authenticated DingTalk status pull"
\`\`\`

### Task 3: Platform Reducer, Persistence, and Safe Writeback

**Files:**
- Modify: \`src/domain/strategyExecution.js\`
- Modify: \`functions/api/platform.js\`
- Modify: \`tests/platform-api.test.mjs\`
- Modify: \`src/state/PlatformProvider.jsx\`
- Modify: \`src/state/ProductFlowProvider.jsx\`
- Modify: \`react-tests/platform-provider.test.mjs\`

**Interfaces:**
- Consumes: reconciliation results from Task 1 and payload/API from Task 2.
- Produces: reducer actions \`replace_personal_todos\`, \`update_personal_todo_notification\`, \`apply_personal_todo_status\`; provider methods \`syncPersonalTodo\`, \`refreshPersonalTodoStatuses\`, \`setPersonalTodoDone\`.

- [ ] **Step 1: Write failing reducer, persistence, and provider contract tests**

\`\`\`js
test("personal todo updates are audited and persisted", () => {
  const state = normalizePlatformState({ personalTodos: [{ id: "todo-1", status: "pending", dingTodo: {} }] });
  const next = reducePlatformState(state, {
    type: "apply_personal_todo_status", id: "todo-1", status: "done", completedFrom: "dingtalk",
    remoteSnapshotKey: "ding-1:true:2026-07-16T09:00:00.000Z", actor: "周总", timestamp: "2026-07-16T09:01:00.000Z"
  });
  assert.equal(next.personalTodos[0].status, "done");
  assert.equal(next.auditLogs[0].action, "complete_from_dingtalk");
});
\`\`\`

Update the D1 fixture to include \`personalTodos: [{ id: "todo-1", title: "完成首发" }]\` and assert it survives POST/GET.

Assert provider source contains \`syncPersonalTodo\`, \`refreshPersonalTodoStatuses\`, \`/api/dingtalk/todo/list\`, and explicit milestone/product-task writeback calls.

- [ ] **Step 2: Run focused tests and verify RED**

Run: \`node --test react-tests/personal-todos.test.mjs react-tests/platform-provider.test.mjs tests/platform-api.test.mjs\`

Expected: FAIL because the collection is not persisted and provider methods do not exist.

- [ ] **Step 3: Implement reducer and D1 collection support**

Add \`"personalTodos"\` to the Pages Function collection list. Implement reducer branches that preserve immutable source fields, merge \`dingTodo\`, write one audit per effective status transition, and return the same state for duplicate snapshot keys.

\`\`\`js
if (action.type === "replace_personal_todos") {
  return { ...state, personalTodos: action.todos.map(item => ({ ...item })), updatedAt: timestamp };
}
if (action.type === "update_personal_todo_notification") {
  return { ...state, personalTodos: state.personalTodos.map(item => item.id === action.id
    ? { ...item, dingTodo: { ...item.dingTodo, ...action.dingTodo }, updatedAt: timestamp }
    : item), updatedAt: timestamp };
}
\`\`\`

- [ ] **Step 4: Implement provider reconciliation and safe source writeback**

Use \`useProductFlow()\` inside \`PlatformProvider\` to access \`productState\`, \`currentUser\`, \`orgCache\`, and \`updateTask\`. Reconcile projections only when their semantic JSON signature changes. \`refreshPersonalTodoStatuses()\` fetches the authenticated list, calls \`applyRemoteTodoSnapshots\`, dispatches effective todo updates, then:

\`\`\`js
for (const effect of result.effects) {
  if (effect.type === "complete_milestone") {
    const milestone = state.milestones.find(item => item.id === effect.sourceId);
    if (milestone) dispatch({ type: "upsert_milestone", record: { ...milestone, status: "completed" }, reason: "钉钉待办完成" });
  }
  if (effect.type === "complete_product_task") updateTask(effect.sourceId, { done: true });
}
\`\`\`

Decision and risk effects are never emitted. Product assignment details are retained in \`dingTodo.executorUnionIds/executorNames\` even when outbound sync fails so an explicit assignee still has a platform todo.

- [ ] **Step 5: Implement outbound status and manual completion**

\`syncPersonalTodo(id)\` posts \`buildPersonalTodoPayload(...)\` to the existing sync endpoint and stores success/error. \`setPersonalTodoDone(id, done)\` updates the unified todo, performs allowed source writeback for milestones/product tasks, and then attempts outbound sync without rolling back the local state on failure.

\`\`\`js
const syncPersonalTodo = useCallback(async id => {
  const todo = state.personalTodos.find(item => item.id === id);
  if (!todo) throw new Error("个人待办不存在。");
  const payload = buildPersonalTodoPayload(todo, currentUser, \`\${window.location.origin}/#company\`);
  try {
    const response = await fetch("/api/dingtalk/todo/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.synced) throw new Error(result.message || "钉钉待办同步失败。");
    dispatch({ type: "update_personal_todo_notification", id, dingTodo: { id: result.todo?.id || result.todo?.taskId || payload.todoId, syncedAt: new Date().toISOString(), lastError: "" } });
    return result.todo;
  } catch (error) {
    dispatch({ type: "update_personal_todo_notification", id, dingTodo: { lastError: error.message, failedAt: new Date().toISOString() } });
    throw error;
  }
}, [currentUser, dispatch, state.personalTodos]);
\`\`\`

- [ ] **Step 6: Run focused and regression tests**

Run: \`node --test react-tests/personal-todos.test.mjs react-tests/platform-provider.test.mjs react-tests/strategy-execution.test.mjs tests/platform-api.test.mjs tests/dingtalk-todo-update.test.mjs\`

Expected: all tests PASS.

- [ ] **Step 7: Commit state orchestration**

\`\`\`bash
git add src/domain/strategyExecution.js functions/api/platform.js tests/platform-api.test.mjs src/state/PlatformProvider.jsx src/state/ProductFlowProvider.jsx react-tests/platform-provider.test.mjs
git commit -m "feat(todo): reconcile and write back personal status"
\`\`\`

### Task 4: Loopback-only DWS Real Data Preview

**Files:**
- Create: \`server/dwsTodoPreview.mjs\`
- Modify: \`server.mjs\`
- Create: \`tests/dws-todo-preview.test.mjs\`
- Modify: \`package.json\`

**Interfaces:**
- Consumes: \`dws todo task list --page <n> --size 50 --status <bool> --format json\` through \`execFile\`.
- Produces: \`readDwsTodoPreview({ status, execFileImpl })\` and local-only GET \`/api/dev/dws/todos?status=false\`.

- [ ] **Step 1: Write failing parser and route-safety tests**

\`\`\`js
test("DWS preview normalizes real todo cards without write commands", async () => {
  const calls = [];
  const result = await readDwsTodoPreview({ status: false, execFileImpl: async (file, args) => {
    calls.push({ file, args });
    return { stdout: JSON.stringify({ result: { todoCards: [{ taskId: "real-1", subject: "真实待办", dueTime: 1784304000000, isDone: false }] } }) };
  }});
  assert.equal(result.todos[0].taskId, "real-1");
  assert.deepEqual(calls[0].args.slice(0, 3), ["todo", "task", "list"]);
  assert.equal(calls[0].args.includes("done"), false);
  assert.equal(calls[0].args.includes("update"), false);
});

test("loopback detection rejects non-local remote addresses", () => {
  assert.equal(isLoopbackAddress("127.0.0.1"), true);
  assert.equal(isLoopbackAddress("::1"), true);
  assert.equal(isLoopbackAddress("192.168.1.8"), false);
});
\`\`\`

- [ ] **Step 2: Run the DWS test and verify RED**

Run: \`node --test tests/dws-todo-preview.test.mjs\`

Expected: FAIL with \`ERR_MODULE_NOT_FOUND\` for \`server/dwsTodoPreview.mjs\`.

- [ ] **Step 3: Implement command isolation and normalization**

\`\`\`js
export async function readDwsTodoPreview({ status = false, execFileImpl = execFileAsync } = {}) {
  const { stdout } = await execFileImpl("dws", ["todo", "task", "list", "--page", "1", "--size", "50", "--status", String(Boolean(status)), "--format", "json"], { timeout: 30000, maxBuffer: 2_000_000 });
  const payload = JSON.parse(stdout || "{}");
  const cards = payload.result?.todoCards || payload.todoCards || payload.data?.todoCards || [];
  return { todos: cards.map(normalizeDwsTodoCard), readonly: true, source: "dws-current-account" };
}
\`\`\`

The server route rejects non-GET methods with 405 and non-loopback \`req.socket.remoteAddress\` with 403. It never writes the preview into either JSON state file.

\`\`\`js
if (url.pathname === "/api/dev/dws/todos") {
  if (req.method !== "GET") return json(res, 405, { readonly: true, message: "Method not allowed" });
  if (!isLoopbackAddress(req.socket.remoteAddress)) return json(res, 403, { readonly: true, message: "仅允许本机访问。" });
  try {
    return json(res, 200, await readDwsTodoPreview({ status: url.searchParams.get("status") === "true" }));
  } catch (error) {
    return json(res, 502, { readonly: true, message: error.message || "DWS 待办查询失败。" });
  }
}
\`\`\`

- [ ] **Step 4: Register and run tests**

Add the new test to \`test:api\` and run:

\`node --test tests/dws-todo-preview.test.mjs\`

Expected: all tests PASS.

- [ ] **Step 5: Commit the local read-only bridge**

\`\`\`bash
git add server/dwsTodoPreview.mjs server.mjs tests/dws-todo-preview.test.mjs package.json
git commit -m "feat(dev): add read-only DWS todo preview"
\`\`\`

### Task 5: Executive Personal Todo Workbench

**Files:**
- Create: \`src/features/company/PersonalTodoWorkbench.jsx\`
- Create: \`src/features/company/DwsTodoPreview.jsx\`
- Modify: \`src/features/company/CompanyHomePage.jsx\`
- Modify: \`src/styles.css\`
- Modify: \`react-tests/platform-ui.test.mjs\`

**Interfaces:**
- Consumes: \`state.personalTodos\`, \`currentUser\`, \`syncPersonalTodo\`, \`refreshPersonalTodoStatuses\`, \`setPersonalTodoDone\`, and local DWS preview endpoint.
- Produces: executive default segmented view \`我的待办｜公司驾驶舱\`, grouped/filterable todo rows, sync controls, and a clearly separated read-only real-data panel.

- [ ] **Step 1: Write failing UI contract tests**

\`\`\`js
test("executive home defaults to the personal todo workbench", () => {
  const home = read("src/features/company/CompanyHomePage.jsx");
  const workbench = read("src/features/company/PersonalTodoWorkbench.jsx");
  assert.match(home, /useState\\("todos"\\)/);
  assert.match(home, /我的待办/);
  assert.match(home, /公司驾驶舱/);
  assert.match(workbench, /已逾期/);
  assert.match(workbench, /今日截止/);
  assert.match(workbench, /未来 7 天/);
  assert.match(workbench, /刷新钉钉状态/);
});

test("local real-data panel is explicitly read-only and development-only", () => {
  const preview = read("src/features/company/DwsTodoPreview.jsx");
  assert.match(preview, /import\\.meta\\.env\\.DEV/);
  assert.match(preview, /线上钉钉待办（只读测试）/);
  assert.match(preview, /\\/api\\/dev\\/dws\\/todos/);
  assert.doesNotMatch(preview, /method:\\s*["']POST/);
});
\`\`\`

- [ ] **Step 2: Run UI tests and verify RED**

Run: \`node --test react-tests/platform-ui.test.mjs\`

Expected: FAIL because the two new components do not exist.

- [ ] **Step 3: Implement the segmented executive home**

Use \`const [executiveView, setExecutiveView] = useState("todos")\`. Keep the existing cockpit JSX in a \`CompanyCockpit\` function and render it unchanged when \`executiveView === "cockpit"\`. The segment labels include the current user’s pending count.

\`\`\`jsx
const [executiveView, setExecutiveView] = useState("todos");
const myTodos = useMemo(() => personalTodosForUser(state.personalTodos, currentUser), [currentUser, state.personalTodos]);
return <section className="page company-home">
  <div className="company-view-switch" role="tablist" aria-label="公司首页视图">
    <button role="tab" aria-selected={executiveView === "todos"} onClick={() => setExecutiveView("todos")}>我的待办（{myTodos.filter(todo => todo.status === "pending").length}）</button>
    <button role="tab" aria-selected={executiveView === "cockpit"} onClick={() => setExecutiveView("cockpit")}>公司驾驶舱</button>
  </div>
  {executiveView === "todos" ? <PersonalTodoWorkbench todos={myTodos} onNavigate={onNavigate} /> : <CompanyCockpit summary={summary} state={state} onNavigate={onNavigate} />}
</section>;
\`\`\`

- [ ] **Step 4: Implement grouped rows and guarded actions**

Each row renders source label, project, due date, priority, sync state, open-source action, completion/reopen action, and sync/retry action. The workbench filters by source and project; decision and risk rows that came back done from DingTalk display “待平台确认结论/关闭”.

\`\`\`jsx
const groups = groupPersonalTodos(filteredTodos, new Date());
return <>
  <button type="button" onClick={refreshPersonalTodoStatuses}>刷新钉钉状态</button>
  {GROUPS.map(group => <section key={group.key} className="personal-todo-group">
    <h2>{group.label}<span>{groups[group.key].length}</span></h2>
    {groups[group.key].map(todo => <TodoRow key={todo.id} todo={todo} onOpen={() => onNavigate(SOURCE_ROUTES[todo.sourceType])} onToggle={() => setPersonalTodoDone(todo.id, todo.status !== "done")} onSync={() => syncPersonalTodo(todo.id)} />)}
  </section>)}
</>;
\`\`\`

- [ ] **Step 5: Implement the local DWS preview panel**

When \`import.meta.env.DEV\` is false the component returns \`null\`. In development it performs GET only after the user expands the panel or clicks refresh, shows count/subject/due/status, and includes this copy:

\`真实线上数据，仅用于核对展示字段；不会导入平台，也不会修改钉钉。\`

\`\`\`jsx
export function DwsTodoPreview() {
  const [payload, setPayload] = useState(null);
  if (!import.meta.env.DEV) return null;
  async function load() {
    const response = await fetch("/api/dev/dws/todos?status=false");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "真实待办读取失败。");
    setPayload(data);
  }
  return <section className="dws-preview-panel"><h2>线上钉钉待办（只读测试）</h2><p>真实线上数据，仅用于核对展示字段；不会导入平台，也不会修改钉钉。</p><button type="button" onClick={load}>读取当前账号</button>{payload ? <DwsPreviewRows todos={payload.todos} /> : null}</section>;
}
\`\`\`

- [ ] **Step 6: Add responsive styles and run UI tests**

Append namespaced \`.personal-todo-*\` and \`.dws-preview-*\` rules; do not rewrite unrelated existing styles. Run:

\`node --test react-tests/platform-ui.test.mjs react-tests/react-app.test.mjs\`

Expected: all tests PASS.

- [ ] **Step 7: Commit the workbench**

\`\`\`bash
git add src/features/company/PersonalTodoWorkbench.jsx src/features/company/DwsTodoPreview.jsx src/features/company/CompanyHomePage.jsx src/styles.css react-tests/platform-ui.test.mjs
git commit -m "feat(todo): add executive personal workbench"
\`\`\`

### Task 6: Real-data and Full Regression Verification

**Files:**
- Modify: \`docs/superpowers/specs/2026-07-16-executive-personal-todo-dingtalk-sync-design.md\` only if observed real payload fields require a documented mapping correction.

**Interfaces:**
- Consumes: completed local app, loopback DWS endpoint, browser, full automated suite.
- Produces: verification evidence without changing any existing online todo.

- [ ] **Step 1: Run the complete automated suite**

Run: \`npm test\`

Expected: all React and API tests PASS with zero failures.

- [ ] **Step 2: Build the production bundle**

Run: \`npm run build\`

Expected: Vite build succeeds; no production Pages Function exists for \`/api/dev/dws/todos\`.

- [ ] **Step 3: Query the local read-only endpoint with real online data**

Run: \`curl --fail --silent 'http://127.0.0.1:8127/api/dev/dws/todos?status=false'\`

Expected: \`{ "readonly": true, "source": "dws-current-account", "todos": [...] }\`; do not print subjects in the final handoff, only counts and field coverage.

- [ ] **Step 4: Verify the page in the in-app browser**

Open \`http://127.0.0.1:8134/\`, confirm the executive home defaults to “我的待办”, switches back to the unchanged cockpit, groups/filter/actions render, and the DWS panel is visibly read-only.

- [ ] **Step 5: Verify there are no writes to online DingTalk data**

Inspect the local bridge command log/test and confirm it only invoked \`dws todo task list\`. No \`create\`, \`update\`, \`done\`, or \`delete\` DWS commands are permitted in this phase.

- [ ] **Step 6: Record the prelaunch live-sync gate**

Before deployment, use newly created \`strategy-platform:\` test todos to validate create/update/complete/reopen and safe decision/risk behavior through the official API. Existing personal todos remain out of scope and untouched.
`,ue=`# Product GMV Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Capture one average monthly GMV target during formal product grading and show live ERP-backed GMV achievement in product progress and product archives.

**Architecture:** Persist only \`monthlyGmvTarget\` on the product. Derive the annual GMV grading suggestion and all achievement metrics from that target, the product schedule, SKU bindings, and shared sales rows. Reuse one domain calculator and one presentation component so every page shows the same figures.

**Tech Stack:** React 19, Vite, Cloudflare Pages/D1, Node test runner, existing CSS design tokens.

---

### Task 1: Add GMV domain calculations

**Files:**
- Create: \`src/domain/productGmv.js\`
- Create: \`react-tests/product-gmv.test.mjs\`

1. Write failing tests for annual GMV score suggestions, current-month achievement, cumulative achievement, percentages above 100%, and missing SKU/schedule states.
2. Run \`node --test react-tests/product-gmv.test.mjs\` and confirm the missing implementation fails.
3. Implement the smallest pure calculation module that passes the tests.
4. Re-run the focused test.

### Task 2: Persist monthly GMV with formal grading

**Files:**
- Modify: \`src/domain/productFlow.js\`
- Modify: \`src/state/stateModel.js\`
- Modify: \`src/state/ProductFlowProvider.jsx\`
- Modify: \`react-tests/shared-state.test.mjs\`

1. Add failing tests that grading stores a normalized positive monthly GMV target and state normalization preserves it.
2. Pass the target through \`gradeProduct\` into \`applyProductGrading\`.
3. Preserve the target on normal grading and remove it with the product when O-level grading returns to the demand pool.
4. Run the shared-state tests.

### Task 3: Add the grading target input and reference score

**Files:**
- Modify: \`src/features/progress/ProductGradingModal.jsx\`
- Modify: \`src/features/progress/ProductProgressPage.jsx\`
- Modify: \`src/styles.css\`
- Modify: \`react-tests/react-app.test.mjs\`

1. Add failing source-level UI assertions for the monthly GMV input, annualized reference, suggested B1 score, and save payload.
2. Add a compact currency input above the grading dimensions.
3. Require a positive target for product-manager saves and show the annualized B1 suggestion without overriding the selected score.
4. Run focused React tests.

### Task 4: Show shared GMV achievement on progress and archive pages

**Files:**
- Create: \`src/features/sales/useProductSalesRows.js\`
- Create: \`src/features/sales/ProductGmvSummary.jsx\`
- Modify: \`src/features/progress/ProductProgressPage.jsx\`
- Modify: \`src/features/archive/ProductArchivePage.jsx\`
- Modify: \`src/styles.css\`
- Modify: \`react-tests/react-app.test.mjs\`

1. Add failing assertions that both pages use the shared component.
2. Fetch all needed SKU rows once per page and derive each product summary with the shared domain calculator.
3. Show current-month and cumulative achievement in progress, and a compact current-month achievement line in each archive row.
4. Provide explicit states for missing monthly target, missing SKU binding, missing launch schedule, empty sales data, and loading/error.
5. Verify responsive layout and stable row/card heights.

### Task 5: Verify the complete change

**Files:**
- Verify all modified files.

1. Run \`npm run test:react\`.
2. Run \`npm run build\`.
3. Start the local Vite server if needed and inspect product progress and product archive at laptop and mobile widths.
4. Review \`git diff --check\` and \`git status --short\`.
`,me=`# Strategy Commitments, Incentives, and Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Add enforceable company strategy outcomes, approved department commitments, department-funded incentive projects, and manually authored monthly department reports to the strategy execution platform.

**Architecture:** Keep the existing platform state boundary and add focused governance collections plus pure domain transition functions. Expose the three business modules as separate React workspaces, then aggregate their facts in the existing company cockpit and unified personal todo projection.

**Tech Stack:** React 19, Vite 7, Node test runner, existing reducer-based shared platform state, existing DingTalk todo sync boundary.

## Global Constraints

- A company strategy is attained only after every required result is completed and verified.
- Department work contains annual or quarterly commitments plus monthly milestones, not daily task management.
- Department heads may start incentive projects within their department reward budget; over-budget and cross-department projects require escalation.
- Final incentive awards are decided by the department head and require a recorded reason.
- Monthly reports are manually written, may be returned, and become immutable after the monthly meeting; corrections are append-only.
- Existing projects and monthly snapshots remain compatible and are not silently converted.
- Existing DingTalk safety rules remain: explicit assignee unionId, known saved DingTalk task ID, no title matching, and no import of private tasks.

---

### Task 1: Governance domain and normalized state

**Files:**
- Create: \`src/domain/executionGovernance.js\`
- Modify: \`src/domain/strategyExecution.js\`
- Test: \`react-tests/execution-governance.test.mjs\`
- Test: \`react-tests/strategy-execution.test.mjs\`

**Interfaces:**
- Produces: \`strategyAttainment(state, strategyId)\`, \`transitionDepartmentCommitment(commitment, action)\`, \`incentiveBudgetCheck(state, project)\`, \`settleIncentiveProject(project, award)\`, \`transitionMonthlyReport(report, action)\`, and \`ensureMonthlyReports(state, month, departments)\`.
- Adds platform collections: \`requiredResults\`, \`departmentCommitments\`, \`commitmentMilestones\`, \`incentiveProjects\`, \`departmentRewardBudgets\`, \`monthlyReports\`, and \`reportCorrections\`.

- [ ] **Step 1: Write failing domain tests**

\`\`\`js
test("strategy attainment requires every result to be verified", () => {
  const state = normalizePlatformState({
    strategies: [{ id: "s1" }],
    requiredResults: [
      { id: "r1", strategyId: "s1", status: "verified" },
      { id: "r2", strategyId: "s1", status: "completed" }
    ]
  });
  assert.equal(strategyAttainment(state, "s1").attained, false);
  state.requiredResults[1].status = "verified";
  assert.equal(strategyAttainment(state, "s1").attained, true);
});

test("frozen reports reject overwrite and accept append-only corrections", () => {
  const report = { id: "mr1", status: "frozen", corrections: [] };
  assert.throws(() => transitionMonthlyReport(report, { type: "edit" }), /冻结/);
  const next = transitionMonthlyReport(report, { type: "append_correction", text: "更正数据口径", actor: "周荣庆" });
  assert.equal(next.corrections.length, 1);
});
\`\`\`

- [ ] **Step 2: Run tests and verify they fail**

Run: \`node --test react-tests/execution-governance.test.mjs react-tests/strategy-execution.test.mjs\`

Expected: FAIL because the governance module and collections do not exist.

- [ ] **Step 3: Implement pure rules and state collections**

\`\`\`js
export function strategyAttainment(state, strategyId) {
  const results = state.requiredResults.filter(item => item.strategyId === strategyId && !item.archived);
  return {
    attained: results.length >= 2 && results.every(item => item.status === "verified"),
    completed: results.filter(item => item.status === "verified").length,
    total: results.length,
    results
  };
}

export function settleIncentiveProject(project, { amount, reason, decidedBy, decidedAt }) {
  const award = Number(amount);
  if (!reason?.trim()) throw new Error("请填写奖金决定理由。");
  if (award < 0 || award > Number(project.rewardCap || 0)) throw new Error("最终奖金不能超过项目奖金上限。");
  return { ...project, status: "closed", finalReward: award, rewardReason: reason.trim(), rewardDecidedBy: decidedBy, rewardDecidedAt: decidedAt, payoutStatus: award ? "pending" : "not_applicable" };
}
\`\`\`

- [ ] **Step 4: Seed the three real company strategies without deleting legacy linked records**

Use stable IDs \`strategy-organization-2026\`, \`strategy-bird-gmv-2026\`, and \`strategy-hamster-brand-2026\`; link the existing hamster demo project to the hamster strategy.

- [ ] **Step 5: Run focused tests**

Run: \`node --test react-tests/execution-governance.test.mjs react-tests/strategy-execution.test.mjs\`

Expected: PASS.

- [ ] **Step 6: Commit**

\`\`\`bash
git add src/domain/executionGovernance.js src/domain/strategyExecution.js react-tests/execution-governance.test.mjs react-tests/strategy-execution.test.mjs
git commit -m "feat(strategy): add execution governance domain"
\`\`\`

### Task 2: Audited platform actions and todo projection

**Files:**
- Modify: \`src/domain/strategyExecution.js\`
- Modify: \`src/domain/personalTodos.js\`
- Modify: \`src/state/PlatformProvider.jsx\`
- Modify: \`functions/api/platform.js\`
- Test: \`react-tests/execution-governance.test.mjs\`
- Test: \`react-tests/personal-todos.test.mjs\`
- Test: \`tests/platform-api.test.mjs\`

**Interfaces:**
- Consumes Task 1 governance transition functions.
- Produces provider commands \`saveRequiredResult\`, \`saveDepartmentCommitment\`, \`transitionCommitment\`, \`saveCommitmentMilestone\`, \`saveIncentiveProject\`, \`settleIncentive\`, \`saveMonthlyReport\`, \`transitionReport\`, and \`appendReportCorrection\`.

- [ ] **Step 1: Write failing reducer and todo tests**

\`\`\`js
test("department commitment approval is audited", () => {
  const next = reducePlatformState(normalizePlatformState({ departmentCommitments: [{ id: "c1", status: "office_review" }] }), {
    type: "transition_department_commitment",
    id: "c1",
    transition: "office_approve",
    actor: "总经办"
  });
  assert.equal(next.departmentCommitments[0].status, "executive_review");
  assert.equal(next.auditLogs[0].entityType, "department_commitment");
});
\`\`\`

- [ ] **Step 2: Run tests and verify they fail**

Run: \`node --test react-tests/execution-governance.test.mjs react-tests/personal-todos.test.mjs tests/platform-api.test.mjs\`

Expected: FAIL because audited transitions and projections are missing.

- [ ] **Step 3: Add audited actions and persistence collections**

Add every new collection to API \`COLLECTION_KEYS\`, and route reducer actions through the pure transition functions. Every transition records actor, action, entity type, entity ID, reason, and timestamp.

- [ ] **Step 4: Extend personal todo candidates**

Create explicit todos for commitment review/return, assigned monthly milestones, incentive responsibilities/settlement/payout, and report submit/review/freeze. Keep \`sourceType\` values stable: \`commitment\`, \`commitment_milestone\`, \`incentive_project\`, \`monthly_report\`, and \`reward_payout\`.

- [ ] **Step 5: Add provider commands**

\`\`\`js
const transitionReport = useCallback((id, transition, reason = "") => {
  dispatch({ type: "transition_monthly_report", id, transition, reason });
}, [dispatch]);
\`\`\`

- [ ] **Step 6: Run focused tests and commit**

Run: \`node --test react-tests/execution-governance.test.mjs react-tests/personal-todos.test.mjs tests/platform-api.test.mjs\`

Expected: PASS.

\`\`\`bash
git add src/domain/strategyExecution.js src/domain/personalTodos.js src/state/PlatformProvider.jsx functions/api/platform.js react-tests/execution-governance.test.mjs react-tests/personal-todos.test.mjs tests/platform-api.test.mjs
git commit -m "feat(strategy): persist governed execution workflows"
\`\`\`

### Task 3: Strategy and department commitment workspace

**Files:**
- Modify: \`src/features/strategy/StrategyCenterPage.jsx\`
- Create: \`src/features/strategy/RequiredResultModal.jsx\`
- Create: \`src/features/strategy/DepartmentCommitmentModal.jsx\`
- Modify: \`src/styles.css\`
- Test: \`react-tests/platform-ui.test.mjs\`

**Interfaces:**
- Consumes platform state and provider commands from Task 2.
- Produces the four-level strategy drill-down and approval actions.

- [ ] **Step 1: Add failing UI structure tests**

\`\`\`js
test("strategy center shows required results and department commitments", () => {
  const page = read("src/features/strategy/StrategyCenterPage.jsx");
  assert.match(page, /必达结果/);
  assert.match(page, /部门承诺/);
  assert.match(page, /月度节点/);
  assert.doesNotMatch(page, /综合完成率/);
});
\`\`\`

- [ ] **Step 2: Run the test and verify failure**

Run: \`node --test react-tests/platform-ui.test.mjs\`

Expected: FAIL on the new labels.

- [ ] **Step 3: Build the strategy hierarchy**

Show three strategy cards. Each card displays verified required results as \`n / total\`, never a weighted percentage. Expand a strategy into required results, then linked department commitments and monthly milestones.

- [ ] **Step 4: Add forms and approval controls**

Required-result form enforces objective evidence fields. Department-commitment form enforces strategy, required result, department, owner, period, acceptance standard, and at least one monthly milestone. Render actions according to current status and role.

- [ ] **Step 5: Add responsive CSS and run tests**

Run: \`node --test react-tests/platform-ui.test.mjs react-tests/execution-governance.test.mjs && npm run build\`

Expected: PASS and Vite exits 0.

- [ ] **Step 6: Commit**

\`\`\`bash
git add src/features/strategy/StrategyCenterPage.jsx src/features/strategy/RequiredResultModal.jsx src/features/strategy/DepartmentCommitmentModal.jsx src/styles.css react-tests/platform-ui.test.mjs
git commit -m "feat(strategy): add department commitment workspace"
\`\`\`

### Task 4: Incentive project workspace

**Files:**
- Create: \`src/features/incentives/IncentiveProjectsPage.jsx\`
- Create: \`src/features/incentives/IncentiveProjectModal.jsx\`
- Create: \`src/features/incentives/IncentiveSettlementModal.jsx\`
- Modify: \`src/App.jsx\`
- Modify: \`src/domain/permissions.js\`
- Modify: \`src/styles.css\`
- Test: \`react-tests/platform-ui.test.mjs\`

**Interfaces:**
- Consumes incentive project and reward budget state plus provider commands from Task 2.
- Produces route \`incentives\` and filters by department, status, owner, and strategy linkage.

- [ ] **Step 1: Add a failing navigation and page test**

\`\`\`js
test("incentive workspace separates rewarded improvements from key projects", () => {
  assert.match(read("src/App.jsx"), /激励项目/);
  const page = read("src/features/incentives/IncentiveProjectsPage.jsx");
  assert.match(page, /部门奖金额度/);
  assert.match(page, /待结项/);
  assert.match(page, /待发放/);
});
\`\`\`

- [ ] **Step 2: Run the test and verify failure**

Run: \`node --test react-tests/platform-ui.test.mjs\`

Expected: FAIL because route and page are absent.

- [ ] **Step 3: Implement list, creation, and settlement**

The create modal validates budget and escalates over-budget or cross-department projects. The settlement modal requires actual effect, final reward, and decision reason. Finance actions only change payout status.

- [ ] **Step 4: Add navigation permission and responsive styles**

Add \`incentives\` to the company operation navigation group and default permission matrix without changing product lifecycle routes.

- [ ] **Step 5: Run tests, build, and commit**

Run: \`node --test react-tests/platform-ui.test.mjs react-tests/execution-governance.test.mjs && npm run build\`

Expected: PASS and Vite exits 0.

\`\`\`bash
git add src/features/incentives src/App.jsx src/domain/permissions.js src/styles.css react-tests/platform-ui.test.mjs
git commit -m "feat(incentives): add rewarded improvement projects"
\`\`\`

### Task 5: Manual monthly department reports

**Files:**
- Create: \`src/features/reviews/MonthlyReportModal.jsx\`
- Create: \`src/features/reviews/MonthlyReportCorrectionModal.jsx\`
- Modify: \`src/features/reviews/OperatingReviewPage.jsx\`
- Modify: \`src/styles.css\`
- Test: \`react-tests/platform-ui.test.mjs\`
- Test: \`react-tests/execution-governance.test.mjs\`

**Interfaces:**
- Consumes monthly report state and provider commands from Task 2.
- Produces manual authoring, submit/return/approve, meeting freeze, and append-only correction flows.

- [ ] **Step 1: Add failing report workflow tests**

\`\`\`js
test("monthly reports are manually authored and frozen after the meeting", () => {
  const page = read("src/features/reviews/OperatingReviewPage.jsx");
  const modal = read("src/features/reviews/MonthlyReportModal.jsx");
  assert.match(page, /部门月度汇报/);
  assert.match(page, /退回修改/);
  assert.match(page, /冻结月报/);
  assert.match(modal, /上月重点成果/);
  assert.match(modal, /本月重点工作/);
  assert.doesNotMatch(modal, /自动生成正文/);
});
\`\`\`

- [ ] **Step 2: Run and verify failure**

Run: \`node --test react-tests/platform-ui.test.mjs react-tests/execution-governance.test.mjs\`

Expected: FAIL because monthly report components are absent.

- [ ] **Step 3: Implement report authoring and workflow**

Render one report per active department and month. The report modal uses explicit text fields and optional relation selectors. Return requires a reason. Freeze requires an approved report and a meeting conclusion. Frozen reports render corrections separately from the immutable original.

- [ ] **Step 4: Run tests, build, and commit**

Run: \`node --test react-tests/platform-ui.test.mjs react-tests/execution-governance.test.mjs && npm run build\`

Expected: PASS and Vite exits 0.

\`\`\`bash
git add src/features/reviews/OperatingReviewPage.jsx src/features/reviews/MonthlyReportModal.jsx src/features/reviews/MonthlyReportCorrectionModal.jsx src/styles.css react-tests/platform-ui.test.mjs react-tests/execution-governance.test.mjs
git commit -m "feat(reports): add governed monthly department reports"
\`\`\`

### Task 6: Cockpit, todo routes, migration, and final verification

**Files:**
- Modify: \`src/features/company/CompanyHomePage.jsx\`
- Modify: \`src/features/company/PersonalTodoWorkbench.jsx\`
- Modify: \`src/domain/personalTodos.js\`
- Modify: \`src/domain/strategyExecution.js\`
- Modify: \`src/styles.css\`
- Test: \`react-tests/platform-ui.test.mjs\`
- Test: \`react-tests/personal-todos.test.mjs\`
- Test: \`react-tests/strategy-execution.test.mjs\`

**Interfaces:**
- Consumes all prior task state and routes.
- Produces executive summaries for attainment, department coverage, incentive budgets, report submission, and direct deep links from personal todos.

- [ ] **Step 1: Add failing cockpit tests**

\`\`\`js
test("cockpit summarizes strategic attainment incentives and reports", () => {
  const home = read("src/features/company/CompanyHomePage.jsx");
  assert.match(home, /必达结果/);
  assert.match(home, /部门承接/);
  assert.match(home, /激励项目/);
  assert.match(home, /月报提交/);
});
\`\`\`

- [ ] **Step 2: Run and verify failure**

Run: \`node --test react-tests/platform-ui.test.mjs react-tests/personal-todos.test.mjs react-tests/strategy-execution.test.mjs\`

Expected: FAIL on the new cockpit and todo routing assertions.

- [ ] **Step 3: Implement summaries, deep links, and safe migration**

Add a department coverage matrix, required-result counts, incentive reward totals, and report submission strip. Route new todo source types to \`strategy\`, \`incentives\`, or \`reviews\`. Preserve legacy objectives, projects, and monthly snapshots; do not fabricate historical reports.

- [ ] **Step 4: Run feature tests**

Run: \`node --test react-tests/execution-governance.test.mjs react-tests/personal-todos.test.mjs react-tests/strategy-execution.test.mjs react-tests/platform-provider.test.mjs react-tests/platform-ui.test.mjs tests/platform-api.test.mjs tests/dingtalk-todo-list.test.mjs tests/dingtalk-todo-update.test.mjs\`

Expected: PASS.

- [ ] **Step 5: Run full verification**

Run: \`npm test && npm run build\`

Expected: all tests pass and Vite exits 0. A chunk-size warning is acceptable; errors are not.

- [ ] **Step 6: Perform browser QA**

Verify desktop and 390 px mobile layouts, no horizontal overflow, strategy drill-down, commitment approval, incentive settlement, report return/freeze/correction, cockpit summaries, and personal todo deep links. Do not execute real DingTalk writes during visual QA.

- [ ] **Step 7: Commit**

\`\`\`bash
git add src/features/company/CompanyHomePage.jsx src/features/company/PersonalTodoWorkbench.jsx src/domain/personalTodos.js src/domain/strategyExecution.js src/styles.css react-tests/platform-ui.test.mjs react-tests/personal-todos.test.mjs react-tests/strategy-execution.test.mjs
git commit -m "feat(company): integrate governed execution cockpit"
\`\`\`

`,ge=`# Strategy Platform Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Add the company platform shell, normalized strategy domain, shared persistence, audit trail, and Product Lifecycle as a registered App.

**Architecture:** Keep the existing React and Cloudflare stack. Add a separate platform context and \`/api/platform\` persistence boundary so strategy data does not expand the legacy product-state JSON. Use pure domain normalization and reducers so browser and API behavior are testable without rendering React.

**Tech Stack:** React 19, Vite 7, Cloudflare Pages Functions, D1, Node test runner.

## Global Constraints

- Preserve all existing product-flow routes and user changes.
- DingTalk workbench and standalone browser share the same identity and permissions.
- Product Lifecycle remains functional as the first registered business App.
- Every important mutation records actor, time, entity, action, and reason.
- Local preview may fall back to localStorage; production API failures must be visible.

---

### Task 1: Platform domain foundation

**Files:**
- Create: \`src/domain/strategyExecution.js\`
- Create: \`react-tests/strategy-execution.test.mjs\`

**Interfaces:**
- Produces: \`createDefaultPlatformState()\`, \`normalizePlatformState(input)\`, \`reducePlatformState(state, action)\`, \`aggregateHealth(states)\`, \`buildExecutiveSummary(state, context)\`.

- [ ] **Step 1: Write failing normalization and health tests**

\`\`\`js
test("severe child health cannot be averaged away", () => {
  assert.equal(aggregateHealth(["normal", "off_track", "completed"]), "off_track");
});

test("platform state always contains every collection", () => {
  const state = normalizePlatformState({ strategies: [] });
  assert.ok(Array.isArray(state.projects));
  assert.ok(Array.isArray(state.auditLogs));
});
\`\`\`

- [ ] **Step 2: Run the tests and verify failure**

Run: \`node --test react-tests/strategy-execution.test.mjs\`
Expected: FAIL because \`src/domain/strategyExecution.js\` does not exist.

- [ ] **Step 3: Implement normalized state, health aggregation, sample data, and audited reducer actions**

\`\`\`js
export const PLATFORM_COLLECTIONS = ["strategies", "objectives", "metrics", "projects", "milestones", "risks", "decisionRequests", "statusUpdates", "monthlySnapshots", "appLinks", "appEvents", "appRegistry", "auditLogs"];

export function aggregateHealth(values = []) {
  if (values.includes("off_track")) return "off_track";
  if (values.includes("at_risk")) return "at_risk";
  if (values.length && values.every(value => value === "completed")) return "completed";
  return "normal";
}
\`\`\`

- [ ] **Step 4: Run the focused tests**

Run: \`node --test react-tests/strategy-execution.test.mjs\`
Expected: PASS.

- [ ] **Step 5: Commit the domain foundation**

\`\`\`bash
git add src/domain/strategyExecution.js react-tests/strategy-execution.test.mjs
git commit -m "feat(strategy): add platform domain"
\`\`\`

### Task 2: Platform provider and persistence client

**Files:**
- Create: \`src/state/platformApi.js\`
- Create: \`src/state/PlatformProvider.jsx\`
- Modify: \`src/main.jsx\`
- Test: \`react-tests/react-app.test.mjs\`

**Interfaces:**
- Consumes: domain functions from Task 1.
- Produces: \`usePlatform()\`, \`dispatchPlatform(action)\`, and automatic local/API persistence.

- [ ] **Step 1: Add a failing source-structure test**

\`\`\`js
assert.match(read("src/main.jsx"), /PlatformProvider/);
assert.match(read("src/state/PlatformProvider.jsx"), /\\/api\\/platform/);
\`\`\`

- [ ] **Step 2: Run the test and verify failure**

Run: \`node --test react-tests/react-app.test.mjs\`
Expected: FAIL because the provider is absent.

- [ ] **Step 3: Implement the provider**

\`\`\`jsx
const value = useMemo(() => ({
  state,
  loading,
  error,
  dispatch: action => setState(current => reducePlatformState(current, { ...action, actor: currentUser?.name || "" }))
}), [state, loading, error, currentUser?.name]);
\`\`\`

- [ ] **Step 4: Wrap App with PlatformProvider and run tests**

Run: \`node --test react-tests/react-app.test.mjs\`
Expected: PASS.

- [ ] **Step 5: Commit provider wiring**

\`\`\`bash
git add src/state/platformApi.js src/state/PlatformProvider.jsx src/main.jsx react-tests/react-app.test.mjs
git commit -m "feat(platform): add shared state provider"
\`\`\`

### Task 3: Structured D1 platform endpoint

**Files:**
- Create: \`functions/api/platform.js\`
- Create: \`tests/platform-api.test.mjs\`
- Modify: \`package.json\`

**Interfaces:**
- Consumes: authenticated session from \`functions/api/_middleware.js\`.
- Produces: \`GET /api/platform\` and \`POST /api/platform\` with \`{ synced, state, updatedAt }\`.

- [ ] **Step 1: Write failing API tests**

\`\`\`js
test("platform API requires D1", async () => {
  const response = await onRequest({ request: new Request("https://example.com/api/platform"), env: {} });
  assert.equal(response.status, 501);
});
\`\`\`

- [ ] **Step 2: Run and verify failure**

Run: \`node --test tests/platform-api.test.mjs\`
Expected: FAIL because the endpoint is absent.

- [ ] **Step 3: Implement table creation and collection upserts**

\`\`\`sql
CREATE TABLE IF NOT EXISTS platform_records (
  entity_type TEXT NOT NULL,
  id TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  PRIMARY KEY (entity_type, id)
)
\`\`\`

Use one record per strategy, objective, metric, project, milestone, risk, decision, update, snapshot, App link, App event, App registration, or audit entry. Reject read-only writes and validate all collections.

- [ ] **Step 4: Add the API suite to \`test:api\` and run it**

Run: \`npm run test:api\`
Expected: PASS.

- [ ] **Step 5: Commit persistence endpoint**

\`\`\`bash
git add functions/api/platform.js tests/platform-api.test.mjs package.json
git commit -m "feat(api): persist platform records"
\`\`\`

### Task 4: Company shell and App registration

**Files:**
- Modify: \`src/App.jsx\`
- Modify: \`src/domain/permissions.js\`
- Create: \`src/features/platform/AppCenterPage.jsx\`
- Modify: \`src/styles.css\`
- Test: \`react-tests/react-app.test.mjs\`

**Interfaces:**
- Consumes: \`state.appRegistry\` from PlatformProvider.
- Produces: company navigation and a visible Product Lifecycle App entry.

- [ ] **Step 1: Write failing navigation tests**

\`\`\`js
assert.match(read("src/App.jsx"), /公司首页/);
assert.match(read("src/App.jsx"), /战略中心/);
assert.match(read("src/App.jsx"), /重点项目/);
assert.match(read("src/features/platform/AppCenterPage.jsx"), /产品全周期/);
\`\`\`

- [ ] **Step 2: Run and verify failure**

Run: \`node --test react-tests/react-app.test.mjs\`
Expected: FAIL on missing company navigation.

- [ ] **Step 3: Add navigation, permissions, and App center**

Preserve the existing product pages under the Product Lifecycle App. Add keys \`home\`, \`strategy\`, \`projects\`, and \`apps\` to permission normalization.

- [ ] **Step 4: Run React tests and build**

Run: \`npm run test:react && npm run build\`
Expected: PASS and a successful Vite build.

- [ ] **Step 5: Commit the platform shell**

\`\`\`bash
git add src/App.jsx src/domain/permissions.js src/features/platform/AppCenterPage.jsx src/styles.css react-tests/react-app.test.mjs
git commit -m "feat(platform): add company app shell"
\`\`\`
`,he=`# Strategy Platform Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Deliver the strategy, metric, key-project, risk, decision, and executive-dashboard workflow.

**Architecture:** UI pages dispatch audited actions to PlatformProvider. Pure selectors compute health and executive summaries with exception precedence; pages never invent a second reporting state.

**Tech Stack:** React 19, existing UI primitives, Lucide, Node test runner.

## Global Constraints

- A quarterly objective belongs to one annual strategy.
- Every objective has at least one metric or project.
- A key project links to a strategy or objective.
- Severe metric, milestone, or risk states cannot average to normal.
- Company summaries are visible by default; edits remain role and ownership scoped.

---

### Task 1: Strategy and metric management

**Files:**
- Create: \`src/features/strategy/StrategyCenterPage.jsx\`
- Create: \`src/features/strategy/StrategyEditorModal.jsx\`
- Create: \`react-tests/strategy-ui.test.mjs\`
- Modify: \`src/App.jsx\`

**Interfaces:**
- Consumes: \`dispatch({ type: "upsert_strategy" | "upsert_objective" | "upsert_metric", record })\`.
- Produces: annual strategy tree with quarterly objectives and metrics.

- [ ] **Step 1: Write failing UI contract tests**

\`\`\`js
assert.match(read("src/features/strategy/StrategyCenterPage.jsx"), /年度战略/);
assert.match(read("src/features/strategy/StrategyEditorModal.jsx"), /季度目标/);
assert.match(read("src/features/strategy/StrategyEditorModal.jsx"), /关键指标/);
\`\`\`

- [ ] **Step 2: Verify failure**

Run: \`node --test react-tests/strategy-ui.test.mjs\`
Expected: FAIL because the pages do not exist.

- [ ] **Step 3: Implement create/edit/archive flows**

Use controlled form sections for strategy, objective, and metric. Validate owner, cycle, success standard, baseline, target, direction, thresholds, source, and frequency before dispatch.

- [ ] **Step 4: Run focused tests**

Run: \`node --test react-tests/strategy-ui.test.mjs react-tests/strategy-execution.test.mjs\`
Expected: PASS.

- [ ] **Step 5: Commit strategy management**

\`\`\`bash
git add src/features/strategy react-tests/strategy-ui.test.mjs src/App.jsx
git commit -m "feat(strategy): add goal management"
\`\`\`

### Task 2: Key projects, milestones, risks, and decisions

**Files:**
- Create: \`src/features/projects/KeyProjectsPage.jsx\`
- Create: \`src/features/projects/ProjectEditorModal.jsx\`
- Create: \`src/features/projects/ProjectDetailModal.jsx\`
- Create: \`react-tests/key-projects-ui.test.mjs\`
- Modify: \`src/App.jsx\`

**Interfaces:**
- Consumes: audited \`upsert_project\`, \`upsert_milestone\`, \`upsert_risk\`, \`upsert_decision\`, and \`resolve_decision\` actions.
- Produces: filterable project portfolio and detail workflow.

- [ ] **Step 1: Write failing source and reducer tests**

\`\`\`js
assert.match(read("src/features/projects/KeyProjectsPage.jsx"), /重点项目/);
assert.match(read("src/features/projects/ProjectDetailModal.jsx"), /待决策/);
\`\`\`

- [ ] **Step 2: Verify failure**

Run: \`node --test react-tests/key-projects-ui.test.mjs\`
Expected: FAIL.

- [ ] **Step 3: Implement project list, editor, and detail actions**

Project creation requires name, goal, owner, department, dates, success standard, and a strategy/objective link. Detail supports milestone completion, risk actions, decision creation, and management resolution.

- [ ] **Step 4: Run focused tests**

Run: \`node --test react-tests/key-projects-ui.test.mjs react-tests/strategy-execution.test.mjs\`
Expected: PASS.

- [ ] **Step 5: Commit project execution**

\`\`\`bash
git add src/features/projects react-tests/key-projects-ui.test.mjs src/App.jsx
git commit -m "feat(projects): add execution workflow"
\`\`\`

### Task 3: Role-aware company home and executive cockpit

**Files:**
- Create: \`src/features/company/CompanyHomePage.jsx\`
- Create: \`src/features/company/HealthBadge.jsx\`
- Modify: \`src/domain/strategyExecution.js\`
- Modify: \`src/App.jsx\`
- Modify: \`src/styles.css\`
- Test: \`react-tests/strategy-execution.test.mjs\`

**Interfaces:**
- Consumes: \`buildExecutiveSummary(state, { currentUser, productState, today })\`.
- Produces: decision queue, severe risks, strategy map, project portfolio, personal work list.

- [ ] **Step 1: Add failing exception-precedence summary tests**

\`\`\`js
const summary = buildExecutiveSummary(state, { today: "2026-07-16" });
assert.equal(summary.offTrackObjectives.length, 1);
assert.equal(summary.pendingDecisions[0].status, "pending");
\`\`\`

- [ ] **Step 2: Verify failure**

Run: \`node --test react-tests/strategy-execution.test.mjs\`
Expected: FAIL on incomplete summary output.

- [ ] **Step 3: Implement selectors and role-aware page**

Executives see exception-first sections. Other users see owned objectives, projects, milestones, and product tasks. Every row links to the relevant strategy, project, or Product Lifecycle screen.

- [ ] **Step 4: Run tests and build**

Run: \`npm run test:react && npm run build\`
Expected: PASS.

- [ ] **Step 5: Commit the cockpit**

\`\`\`bash
git add src/features/company src/domain/strategyExecution.js src/App.jsx src/styles.css react-tests/strategy-execution.test.mjs
git commit -m "feat(dashboard): add executive cockpit"
\`\`\`
`,fe=`# Strategy Platform Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Connect Product Lifecycle facts and DingTalk actions to strategy projects without coupling the cockpit to product internals.

**Architecture:** A pure adapter translates product state into idempotent platform events. A bridge submits those events to PlatformProvider, which updates linked project health and data freshness. Action notifications reuse the existing DingTalk todo endpoint.

**Tech Stack:** React hooks, existing product domain, DingTalk API Functions, Node test runner.

## Global Constraints

- Product Lifecycle remains independently usable.
- Events include App ID, entity type, entity ID, occurred time, sync time, and idempotency key.
- Duplicate events produce no duplicate risks or decisions.
- Product or DingTalk failures cannot block the company cockpit.

---

### Task 1: Product Lifecycle event adapter

**Files:**
- Create: \`src/domain/productPlatformAdapter.js\`
- Create: \`react-tests/product-platform-adapter.test.mjs\`

**Interfaces:**
- Produces: \`buildProductPlatformEvents(productState, today)\` and \`productAppLink(product)\`.

- [ ] **Step 1: Write failing adapter tests**

\`\`\`js
const events = buildProductPlatformEvents(state, "2026-07-16");
assert.ok(events.some(event => event.kind === "progress_changed"));
assert.ok(events.every(event => event.idempotencyKey));
\`\`\`

- [ ] **Step 2: Verify failure**

Run: \`node --test react-tests/product-platform-adapter.test.mjs\`
Expected: FAIL because the adapter is absent.

- [ ] **Step 3: Implement progress, milestone, delay, risk, and owner events**

Use \`calculateProductTaskProgress\`, task due dates, product stages, and plans. Event IDs must be stable for identical source state.

- [ ] **Step 4: Run focused tests**

Run: \`node --test react-tests/product-platform-adapter.test.mjs\`
Expected: PASS.

- [ ] **Step 5: Commit the adapter**

\`\`\`bash
git add src/domain/productPlatformAdapter.js react-tests/product-platform-adapter.test.mjs
git commit -m "feat(platform): adapt product events"
\`\`\`

### Task 2: Idempotent App bridge and project linkage

**Files:**
- Create: \`src/features/platform/ProductFlowPlatformBridge.jsx\`
- Modify: \`src/domain/strategyExecution.js\`
- Modify: \`src/main.jsx\`
- Modify: \`src/features/platform/AppCenterPage.jsx\`
- Test: \`react-tests/strategy-execution.test.mjs\`

**Interfaces:**
- Consumes: \`buildProductPlatformEvents\` and \`dispatch({ type: "ingest_app_events", events })\`.
- Produces: linked project source health, last sync time, and App deep links.

- [ ] **Step 1: Write a failing idempotency test**

\`\`\`js
const once = reducePlatformState(state, { type: "ingest_app_events", events: [event] });
const twice = reducePlatformState(once, { type: "ingest_app_events", events: [event] });
assert.equal(twice.appEvents.length, once.appEvents.length);
\`\`\`

- [ ] **Step 2: Verify failure**

Run: \`node --test react-tests/strategy-execution.test.mjs\`
Expected: FAIL until event ingestion exists.

- [ ] **Step 3: Implement bridge and linked project status**

The bridge runs after both providers are mounted. It dispatches only when the event signature changes and never blocks product rendering on failure.

- [ ] **Step 4: Run tests and build**

Run: \`npm run test:react && npm run build\`
Expected: PASS.

- [ ] **Step 5: Commit App linkage**

\`\`\`bash
git add src/features/platform/ProductFlowPlatformBridge.jsx src/domain/strategyExecution.js src/main.jsx src/features/platform/AppCenterPage.jsx react-tests/strategy-execution.test.mjs
git commit -m "feat(platform): link product lifecycle"
\`\`\`

### Task 3: DingTalk action notifications

**Files:**
- Create: \`src/domain/platformNotifications.js\`
- Modify: \`src/state/PlatformProvider.jsx\`
- Modify: \`src/features/projects/ProjectDetailModal.jsx\`
- Create: \`react-tests/platform-notifications.test.mjs\`

**Interfaces:**
- Produces: \`buildDecisionTodoPayload(decision, project, users)\` and \`syncDecisionTodo(id)\`.

- [ ] **Step 1: Write failing payload tests**

\`\`\`js
const payload = buildDecisionTodoPayload(decision, project, users);
assert.match(payload.subject, /待决策/);
assert.ok(payload.detailUrl.includes("#projects"));
\`\`\`

- [ ] **Step 2: Verify failure**

Run: \`node --test react-tests/platform-notifications.test.mjs\`
Expected: FAIL.

- [ ] **Step 3: Implement explicit “同步钉钉待办” action**

Reuse \`POST /api/dingtalk/todo/sync\`. Save \`dingTodo\`, \`syncedAt\`, and \`lastError\` on the decision without failing the local decision save.

- [ ] **Step 4: Run tests**

Run: \`node --test react-tests/platform-notifications.test.mjs && npm run test:api\`
Expected: PASS.

- [ ] **Step 5: Commit notifications**

\`\`\`bash
git add src/domain/platformNotifications.js src/state/PlatformProvider.jsx src/features/projects/ProjectDetailModal.jsx react-tests/platform-notifications.test.mjs
git commit -m "feat(dingtalk): sync decision actions"
\`\`\`
`,ye=`# Strategy Platform Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Add weekly confirmations, immutable monthly reviews, trends, data-freshness signals, and final end-to-end verification.

**Architecture:** Status updates and snapshots are append-only records. Trend selectors derive month-to-month changes from snapshots. App registry and freshness metadata make partial failures explicit without blocking unrelated modules.

**Tech Stack:** React 19, Recharts 3, Cloudflare D1, Node test runner.

## Global Constraints

- Weekly updates answer change, largest risk, and coordination/decision need.
- Monthly snapshots are immutable and retain management conclusions.
- Stale data never displays as healthy without a freshness warning.
- One App failure does not hide other strategy or project information.

---

### Task 1: Weekly updates and monthly snapshots

**Files:**
- Create: \`src/features/reviews/OperatingReviewPage.jsx\`
- Create: \`src/features/reviews/StatusUpdateModal.jsx\`
- Modify: \`src/domain/strategyExecution.js\`
- Modify: \`src/App.jsx\`
- Create: \`react-tests/operating-review.test.mjs\`

**Interfaces:**
- Consumes: \`append_status_update\` and \`create_monthly_snapshot\` actions.
- Produces: current weekly confirmation queue and immutable month snapshots.

- [ ] **Step 1: Write failing append-only tests**

\`\`\`js
const next = reducePlatformState(state, { type: "create_monthly_snapshot", record: snapshot });
assert.equal(next.monthlySnapshots[0].id, snapshot.id);
assert.throws(() => reducePlatformState(next, { type: "update_monthly_snapshot", record: snapshot }));
\`\`\`

- [ ] **Step 2: Verify failure**

Run: \`node --test react-tests/operating-review.test.mjs\`
Expected: FAIL.

- [ ] **Step 3: Implement update form, confirmation queue, and snapshot creation**

Snapshot records copy computed strategy, objective, metric, project, risk, and decision states plus owner explanation and management conclusion.

- [ ] **Step 4: Run focused tests**

Run: \`node --test react-tests/operating-review.test.mjs react-tests/strategy-execution.test.mjs\`
Expected: PASS.

- [ ] **Step 5: Commit operating reviews**

\`\`\`bash
git add src/features/reviews src/domain/strategyExecution.js src/App.jsx react-tests/operating-review.test.mjs
git commit -m "feat(review): add operating cadence"
\`\`\`

### Task 2: Trends, freshness, and App health

**Files:**
- Create: \`src/features/company/StrategyTrendChart.jsx\`
- Modify: \`src/features/company/CompanyHomePage.jsx\`
- Modify: \`src/features/platform/AppCenterPage.jsx\`
- Modify: \`src/domain/strategyExecution.js\`
- Modify: \`src/styles.css\`
- Test: \`react-tests/strategy-execution.test.mjs\`

**Interfaces:**
- Produces: \`buildMonthlyTrend(snapshots)\` and \`buildAppHealth(appRegistry, appEvents, today)\`.

- [ ] **Step 1: Write failing trend and stale-source tests**

\`\`\`js
assert.deepEqual(buildMonthlyTrend(snapshots).map(point => point.month), ["2026-06", "2026-07"]);
assert.equal(buildAppHealth(apps, events, "2026-07-16")[0].freshness, "stale");
\`\`\`

- [ ] **Step 2: Verify failure**

Run: \`node --test react-tests/strategy-execution.test.mjs\`
Expected: FAIL.

- [ ] **Step 3: Implement trend chart and source-health states**

Show month-over-month normal, risk, off-track, and completed counts. Display last sync, stale, failed, or healthy state for each App.

- [ ] **Step 4: Run tests and build**

Run: \`npm run test:react && npm run build\`
Expected: PASS.

- [ ] **Step 5: Commit trend and health UI**

\`\`\`bash
git add src/features/company/StrategyTrendChart.jsx src/features/company/CompanyHomePage.jsx src/features/platform/AppCenterPage.jsx src/domain/strategyExecution.js src/styles.css react-tests/strategy-execution.test.mjs
git commit -m "feat(dashboard): add strategy trends"
\`\`\`

### Task 3: Full verification and release assets

**Files:**
- Modify only if verification exposes a defect.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: passing tests, production build, and generated Pages release assets.

- [ ] **Step 1: Run the complete automated suite**

Run: \`npm test\`
Expected: all React and API tests pass.

- [ ] **Step 2: Build the production bundle**

Run: \`npm run build\`
Expected: Vite exits successfully without missing imports.

- [ ] **Step 3: Generate Cloudflare Pages assets**

Run: \`npm run release:pages\`
Expected: build succeeds and \`cloudflare-entry.html\` references the latest hashed assets.

- [ ] **Step 4: Inspect the final diff**

Run: \`git diff --check && git status --short\`
Expected: no whitespace errors; unrelated pre-existing user changes remain preserved.

- [ ] **Step 5: Commit release assets only when they changed because of this feature**

\`\`\`bash
git add cloudflare-entry.html assets
git commit -m "build: publish strategy platform"
\`\`\`
`,ke=`# DingTalk Group Executor Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Let signed-in users search their visible DingTalk groups on desktop web and inside DingTalk, select a group to add all valid members as todo executors, de-duplicate people, and remove individual members before syncing.

**Architecture:** Keep DingTalk groups as a temporary executor-selection source; the existing todo payload remains user-only. Add a mandatory official-API capability gate, server-side encrypted user-token storage, session-protected group search/member adapters, a pure selection-state domain module, and a focused React picker embedded in \`TodoSyncModal\`.

**Tech Stack:** React 19, Vite 7, Cloudflare Pages Functions, Cloudflare D1, Web Crypto AES-GCM, Node.js built-in test runner, DingTalk OAuth/OpenAPI.

## Global Constraints

- Desktop web and DingTalk embedded WebView must use the same in-app search and selection behavior.
- A selected group adds every valid member by default; the user may remove individual people before submission.
- Groups never become todo executors and no group message is sent.
- The final sync payload contains only de-duplicated personal \`unionId\` values.
- Group membership is temporary modal state and must not enter product-flow shared business state.
- User access and refresh tokens stay server-side, are encrypted at rest, and are never logged or returned to the browser.
- Group search/member data is isolated by signed-in DingTalk user.
- Do not silently truncate group members or executors. Block submission and show the verified DingTalk limit.
- If official enterprise-app verification cannot prove full visible-group search and complete member reads, stop after Task 1 and report the blocker; do not ship partial or fake results.
- Deployment or DingTalk application-permission changes require separate user approval; use an existing authorized test deployment when available.

---

## File Map

- Create \`docs/integrations/dingtalk-group-capability-evidence.md\`: records official API paths, auth type, permissions, pagination, executor limit, and PASS/FAIL evidence.
- Create \`functions/api/dingtalk/_shared/group-contract.js\`: contains only the exact official API constants proven by the capability gate.
- Create \`functions/api/auth/_shared/ding-user-token.js\`: encrypts, stores, reads, refreshes, and revokes user-scoped DingTalk tokens.
- Modify \`functions/api/auth/_shared/session.js\`: creates the token table and exposes a server-only session hash resolver.
- Modify \`functions/api/dingtalk/_shared/dingtalk.js\`: returns browser identity plus OAuth token metadata without changing existing public identity helpers.
- Modify \`functions/api/auth/dingtalk/callback.js\`: persists the browser login user token against the new session.
- Create \`functions/api/auth/dingtalk/group/start.js\` and \`functions/api/auth/dingtalk/group/callback.js\`: one-time embedded group authorization and safe return flow.
- Modify \`functions/api/_middleware.js\`: makes only the OAuth callback public; group search/member routes remain session protected.
- Create \`functions/api/dingtalk/_shared/groups.js\`: normalizes verified DingTalk group search/member APIs and errors.
- Create \`functions/api/dingtalk/groups/search.js\`: session-scoped group search route.
- Create \`functions/api/dingtalk/groups/[groupId]/members.js\`: validates visibility and returns complete normalized members.
- Create \`tests/dingtalk-group-auth.test.mjs\`: token storage, encryption, refresh, revoke, and OAuth continuation coverage.
- Create \`tests/dingtalk-groups.test.mjs\`: DingTalk adapter and route coverage.
- Modify \`tests/helpers/auth-d1-mock.mjs\`: supports the new encrypted-token table and group-route session lookups.
- Create \`src/domain/dingTalkGroupSelection.js\`: pure person/group source tracking and de-duplication.
- Create \`src/domain/dingTalkGroups.js\`: browser API client and normalized frontend errors.
- Create \`react-tests/dingtalk-group-selection.test.mjs\`: source tracking and removal behavior.
- Create \`src/features/progress/GroupExecutorPicker.jsx\`: personnel/group tabs, search results, selected groups, member loading, and errors.
- Modify \`src/features/progress/TodoSyncModal.jsx\`: owns final selection state and submits only selected people.
- Create \`react-tests/dingtalk-group-picker.test.mjs\`: UI contract coverage.
- Modify \`src/styles.css\`: focused responsive styles for the new picker.
- Modify \`package.json\`: includes new API test files in \`test:api\`.

---

### Task 1: Prove DingTalk Group API Capability

**Files:**
- Create: \`docs/integrations/dingtalk-group-capability-evidence.md\`
- Create on PASS only: \`functions/api/dingtalk/_shared/group-contract.js\`

**Interfaces:**
- Consumes: Enterprise DingTalk app credentials and a test account that belongs to at least two groups.
- Produces: A PASS evidence document plus \`dingGroupContract\`, containing exact \`searchPath\`, \`membersPath\`, auth header, required application permission, pagination fields, executor limit, and observed visibility semantics. Tasks 2–7 must not begin unless status is PASS.

- [ ] **Step 1: Query official DingTalk developer documentation through DWS**

Run:

\`\`\`bash
dws devdoc article search --query "搜索当前用户可见群聊 openConversationId 用户授权" --size 10 --format json
dws devdoc article search --query "获取群成员 openConversationId 分页 unionId" --size 10 --format json
dws devdoc article search --query "创建待办 executorIds 人数上限" --size 10 --format json
\`\`\`

Expected: each command returns at least one official article. Record article title, URL, API method/path, auth type, required permission, request fields, response fields, and limits. If DWS returns a recovery event, follow the DWS recovery workflow once. If grounded recovery says not to retry or the official articles do not establish all required capabilities, mark the evidence document FAIL and stop the plan.

- [ ] **Step 2: Run read-only account-level probes**

Run:

\`\`\`bash
dws chat search --query "产品" --format json
dws chat group list-my-groups --format json
\`\`\`

Copy one returned \`openConversationId\` into the shell variable, then run:

\`\`\`bash
read -r GROUP_ID
dws chat group members list --id "$GROUP_ID" --format json
\`\`\`

Expected: search returns a group visible to the signed-in test user, and member listing returns the complete expected group roster. Do not send messages or create todos during this task.

- [ ] **Step 3: Create the evidence document**

Write \`docs/integrations/dingtalk-group-capability-evidence.md\` with \`Status: PASS\`, the current ISO timestamp, and four sections: Group search, Group members, Todo executor limit, and Account probe. Each API section must contain the official article title and URL, exact HTTP method/path, authentication header and token type, exact application permission, request/response pagination fields, and observed visibility semantics. The todo section must contain the official positive integer limit. The account probe must mask names while recording expected and returned integer member counts.

If any required item is unsupported, write \`Status: FAIL\`, state the missing capability and official evidence, commit only this file, and stop.

On PASS, create \`functions/api/dingtalk/_shared/group-contract.js\` exporting frozen \`dingGroupContract\`. It must contain \`search.{method,path,queryField,cursorField,listField,nextCursorField,idField,nameField}\`, \`members.{method,path,cursorField,listField,nextCursorField,hasMoreField,userIdField,unionIdField,nameField}\`, \`authHeader\`, \`requiredPermission\`, and positive integer \`todoExecutorLimit\`. Every value must be copied from the evidence document; unavailable optional member identity fields use an empty string, but at least one of \`userIdField\` or \`unionIdField\` must be non-empty. The module must contain no fallback endpoint or guessed permission.

- [ ] **Step 4: Validate and commit the gate**

Run:

\`\`\`bash
rg -n "Status: PASS|Method and path|Application permission|Maximum executors|Returned members" docs/integrations/dingtalk-group-capability-evidence.md
rg -n "<|>|TBD|TODO|待定" docs/integrations/dingtalk-group-capability-evidence.md
node -e "import('./functions/api/dingtalk/_shared/group-contract.js').then(({dingGroupContract:c})=>{if(!c.search?.path||!c.members?.path||!c.authHeader||!c.requiredPermission||!Number.isInteger(c.todoExecutorLimit)||c.todoExecutorLimit<1)process.exit(1)})"
\`\`\`

Expected: the first command prints every required field; the second prints nothing; the Node contract validation exits 0.

Commit:

\`\`\`bash
git add docs/integrations/dingtalk-group-capability-evidence.md functions/api/dingtalk/_shared/group-contract.js
git commit -m "docs: verify DingTalk group API capability"
\`\`\`

---

### Task 2: Store User-Scoped DingTalk Tokens Securely

**Files:**
- Create: \`functions/api/auth/_shared/ding-user-token.js\`
- Modify: \`functions/api/auth/_shared/session.js\`
- Modify: \`functions/api/dingtalk/_shared/dingtalk.js\`
- Modify: \`functions/api/auth/dingtalk/callback.js\`
- Modify: \`functions/api/auth/logout.js\`
- Modify: \`tests/helpers/auth-d1-mock.mjs\`
- Create: \`tests/dingtalk-group-auth.test.mjs\`

**Interfaces:**
- Consumes: \`getDingUserAccessToken(env, { code | refreshToken }, fetchImpl)\` and \`createSession(...)\`.
- Produces: \`saveDingUserToken(db, sessionIdHash, token, env)\`, \`getValidDingUserToken(request, env, fetchImpl)\`, \`deleteDingUserToken(request, env)\`, and \`getSessionIdHash(request, env)\`.

- [ ] **Step 1: Write failing encryption and lifecycle tests**

Add tests that use a fixed 32-byte base64 key and assert ciphertext never contains the raw tokens:

\`\`\`js
const TOKEN_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

test("DingTalk user tokens are encrypted and bound to the server session", async () => {
  const db = createAuthD1Mock();
  const created = await createSession(identity, "browser", { PRODUCT_FLOW_DB: db });
  await saveDingUserToken(db, created.sessionIdHash, {
    accessToken: "raw-access",
    refreshToken: "raw-refresh",
    expireIn: 7200
  }, { DINGTALK_TOKEN_ENCRYPTION_KEY: TOKEN_KEY });

  const row = db.dumpDingTokens()[0];
  assert.equal(JSON.stringify(row).includes("raw-access"), false);
  assert.equal(JSON.stringify(row).includes("raw-refresh"), false);
});

test("expired DingTalk user tokens refresh once and persist the replacement", async () => {
  const db = createAuthD1Mock();
  const created = await createSession(identity, "browser", { PRODUCT_FLOW_DB: db });
  const env = {
    PRODUCT_FLOW_DB: db,
    DINGTALK_APP_KEY: "app-key",
    DINGTALK_APP_SECRET: "app-secret",
    DINGTALK_TOKEN_ENCRYPTION_KEY: TOKEN_KEY
  };
  await saveDingUserToken(db, created.sessionIdHash, {
    accessToken: "expired-access",
    refreshToken: "refresh-1",
    expireIn: 1
  }, env);
  db.setDingTokenExpires(created.sessionIdHash, "2000-01-01T00:00:00.000Z");
  const fetchImpl = async (url, options) => {
    assert.match(String(url), /\\/v1\\.0\\/oauth2\\/userAccessToken/);
    assert.equal(JSON.parse(options.body).refreshToken, "refresh-1");
    return Response.json({ accessToken: "fresh-access", refreshToken: "refresh-2", expireIn: 7200 });
  };

  const accessToken = await getValidDingUserToken(requestWithCookie(created.cookie), env, fetchImpl);

  assert.equal(accessToken, "fresh-access");
  assert.equal(db.dumpDingTokens().length, 1);
  assert.equal(Date.parse(db.dumpDingTokens()[0].expires_at) > Date.now(), true);
});

test("logout deletes the DingTalk user token bound to the session", async () => {
  const db = createAuthD1Mock();
  const env = { PRODUCT_FLOW_DB: db, DINGTALK_TOKEN_ENCRYPTION_KEY: TOKEN_KEY };
  const created = await createSession(identity, "browser", env);
  await saveDingUserToken(db, created.sessionIdHash, {
    accessToken: "access-1",
    refreshToken: "refresh-1",
    expireIn: 7200
  }, env);

  const response = await logout({
    request: new Request("https://flow.example.com/api/auth/logout", {
      method: "POST",
      headers: { cookie: created.cookie }
    }),
    env
  });

  assert.equal(response.status, 200);
  assert.deepEqual(db.dumpDingTokens(), []);
});
\`\`\`

- [ ] **Step 2: Run the focused test and verify failure**

Run:

\`\`\`bash
node --test tests/dingtalk-group-auth.test.mjs
\`\`\`

Expected: FAIL because \`ding-user-token.js\`, \`sessionIdHash\`, and mock token-table support do not exist.

- [ ] **Step 3: Add server-only session identity and the token table**

Extend \`createSession\` to return \`sessionIdHash: idHash\`. Add this table in \`ensureAuthTables\`:

\`\`\`sql
CREATE TABLE IF NOT EXISTS product_flow_ding_user_tokens (
  session_id_hash TEXT PRIMARY KEY,
  access_ciphertext TEXT NOT NULL,
  refresh_ciphertext TEXT,
  iv TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
\`\`\`

Export a resolver that hashes the \`pfs_session\` cookie but never exposes it through \`/api/auth/session\`:

\`\`\`js
export async function getSessionIdHash(request, env = {}) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token || !authDatabase(env)) return "";
  return hashToken(token);
}
\`\`\`

- [ ] **Step 4: Implement AES-GCM token storage and refresh**

In \`ding-user-token.js\`, implement base64 conversion, import \`DINGTALK_TOKEN_ENCRYPTION_KEY\` as AES-GCM, encrypt one JSON payload \`{ accessToken, refreshToken }\` with a random 12-byte IV, and store the expiry. \`getValidDingUserToken\` must:

\`\`\`js
export async function getValidDingUserToken(request, env = {}, fetchImpl = fetch) {
  const sessionIdHash = await getSessionIdHash(request, env);
  if (!sessionIdHash) throw httpError(401, "请先使用钉钉登录。");
  const row = await readTokenRow(env.PRODUCT_FLOW_DB, sessionIdHash);
  if (!row) throw httpError(428, "需要授权访问当前账号可见的钉钉群。", "GROUP_AUTH_REQUIRED");
  const token = await decryptToken(row, env);
  if (Date.parse(row.expires_at) > Date.now() + 60_000) return token.accessToken;
  if (!token.refreshToken) throw httpError(428, "群聊授权已过期，请重新授权。", "GROUP_AUTH_REQUIRED");
  const refreshed = await getDingUserAccessToken(env, { refreshToken: token.refreshToken }, fetchImpl);
  await saveDingUserToken(env.PRODUCT_FLOW_DB, sessionIdHash, refreshed, env);
  return refreshed.accessToken;
}
\`\`\`

Use one generic 500 error for missing/invalid encryption configuration; never include the secret or decrypted payload in errors.

- [ ] **Step 5: Return token metadata from browser OAuth and persist it**

Add \`getDingBrowserLogin\` without breaking callers of \`getDingBrowserIdentity\`:

\`\`\`js
export async function getDingBrowserLogin(code, env = {}, fetchImpl = fetch) {
  const userToken = await getDingUserAccessToken(env, { code }, fetchImpl);
  const identity = await resolveBrowserIdentity(userToken.accessToken, env, fetchImpl);
  return { identity, userToken };
}

export async function getDingBrowserIdentity(code, env = {}, fetchImpl = fetch) {
  return (await getDingBrowserLogin(code, env, fetchImpl)).identity;
}
\`\`\`

Update the browser callback to create the session from \`identity\`, then call \`saveDingUserToken(db, created.sessionIdHash, userToken, env)\` before redirecting. Update logout to call \`deleteDingUserToken\` before revoking the session.

- [ ] **Step 6: Extend the D1 mock and make tests pass**

Teach \`tests/helpers/auth-d1-mock.mjs\` to handle INSERT, SELECT, DELETE, and UPDATE statements for \`product_flow_ding_user_tokens\`, plus \`dumpDingTokens()\` and a test-only expiry setter.

Run:

\`\`\`bash
node --test tests/dingtalk-group-auth.test.mjs tests/dingtalk-web-auth.test.mjs
\`\`\`

Expected: PASS, with no raw user token in stored rows or public session JSON.

- [ ] **Step 7: Commit secure token storage**

\`\`\`bash
git add functions/api/auth/_shared/ding-user-token.js functions/api/auth/_shared/session.js functions/api/dingtalk/_shared/dingtalk.js functions/api/auth/dingtalk/callback.js functions/api/auth/logout.js tests/helpers/auth-d1-mock.mjs tests/dingtalk-group-auth.test.mjs
git commit -m "feat(auth): retain encrypted DingTalk user tokens"
\`\`\`

---

### Task 3: Add Embedded Group Authorization Continuation

**Files:**
- Create: \`functions/api/auth/dingtalk/group/start.js\`
- Create: \`functions/api/auth/dingtalk/group/callback.js\`
- Modify: \`functions/api/_middleware.js\`
- Modify: \`tests/dingtalk-group-auth.test.mjs\`

**Interfaces:**
- Consumes: existing authenticated session, \`getDingUserAccessToken\`, \`saveDingUserToken\`, and the official OAuth scope verified in Task 1.
- Produces: \`GET /api/auth/dingtalk/group/start?returnTo=%2F%3FproductId%3Dp1%23progress\` and public OAuth callback \`/api/auth/dingtalk/group/callback\`.

- [ ] **Step 1: Write failing authorization-continuation tests**

Cover these exact cases:

\`\`\`js
test("embedded group authorization stores protected state and a safe return path", async () => {
  const db = createAuthD1Mock();
  const created = await createSession(identity, "embedded", { PRODUCT_FLOW_DB: db });
  const response = await startGroupAuthorization({
    request: new Request("https://flow.example.com/api/auth/dingtalk/group/start?returnTo=%2F%3FproductId%3Dp1%23progress", {
      headers: { cookie: created.cookie }
    }),
    env: { PRODUCT_FLOW_DB: db, DINGTALK_APP_KEY: "app-key", DINGTALK_APP_SECRET: "app-secret" }
  });

  assert.equal(response.status, 302);
  assert.equal(new URL(response.headers.get("location")).origin, "https://login.dingtalk.com");
  assert.match(response.headers.get("set-cookie"), /pfs_group_oauth_state=/);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/);
});

test("group authorization rejects external return URLs", async () => {
  const db = createAuthD1Mock();
  const created = await createSession(identity, "embedded", { PRODUCT_FLOW_DB: db });
  const response = await startGroupAuthorization({
    request: new Request("https://flow.example.com/api/auth/dingtalk/group/start?returnTo=https%3A%2F%2Fevil.example", {
      headers: { cookie: created.cookie }
    }),
    env: { PRODUCT_FLOW_DB: db, DINGTALK_APP_KEY: "app-key", DINGTALK_APP_SECRET: "app-secret" }
  });

  assert.match(response.headers.get("set-cookie"), /%2F%23progress/);
  assert.doesNotMatch(response.headers.get("set-cookie"), /evil\\.example/);
});

test("group callback requires matching state and an active product-flow session", async () => {
  const wrongState = await finishGroupAuthorization({
    request: new Request("https://flow.example.com/api/auth/dingtalk/group/callback?code=code-1&state=wrong", {
      headers: { cookie: "pfs_group_oauth_state=expected" }
    }),
    env: { PRODUCT_FLOW_DB: createAuthD1Mock() }
  });
  assert.equal(wrongState.status, 400);

  const noSession = await finishGroupAuthorization({
    request: new Request("https://flow.example.com/api/auth/dingtalk/group/callback?code=code-1&state=expected", {
      headers: { cookie: "pfs_group_oauth_state=expected" }
    }),
    env: { PRODUCT_FLOW_DB: createAuthD1Mock() }
  });
  assert.equal(noSession.status, 401);
});

test("group callback stores the user token and redirects to the saved product task", async () => {
  const db = createAuthD1Mock();
  const env = {
    PRODUCT_FLOW_DB: db,
    DINGTALK_APP_KEY: "app-key",
    DINGTALK_APP_SECRET: "app-secret",
    DINGTALK_TOKEN_ENCRYPTION_KEY: TOKEN_KEY
  };
  const created = await createSession(identity, "embedded", env);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ accessToken: "access-1", refreshToken: "refresh-1", expireIn: 7200 });
  try {
    const response = await finishGroupAuthorization({
      request: new Request("https://flow.example.com/api/auth/dingtalk/group/callback?code=code-1&state=expected", {
        headers: { cookie: \`\${created.cookie}; pfs_group_oauth_state=expected; pfs_group_return=%2F%3FproductId%3Dp1%23progress\` }
      }),
      env
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/?productId=p1#progress");
    assert.equal(db.dumpDingTokens().length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
\`\`\`

- [ ] **Step 2: Verify the new tests fail**

Run:

\`\`\`bash
node --test tests/dingtalk-group-auth.test.mjs
\`\`\`

Expected: FAIL because the two routes do not exist.

- [ ] **Step 3: Implement start and callback routes**

The start route must accept only a relative path beginning with \`/\`; otherwise use \`/#progress\`. Store state and return path in \`HttpOnly; Secure; SameSite=Lax; Max-Age=600\` cookies. The callback must compare state in constant application logic, require the existing session cookie, exchange the code, persist the encrypted user token, clear temporary cookies, and redirect to the saved path.

Use the OAuth scope and application permission proven in Task 1. Do not request unrelated permissions.

- [ ] **Step 4: Keep only the callback public**

Add \`/api/auth/dingtalk/group/callback\` to \`PUBLIC_PATHS\`. Do not add \`/api/auth/dingtalk/group/start\`; middleware must attach an authenticated session before authorization begins.

- [ ] **Step 5: Run auth regressions and commit**

Run:

\`\`\`bash
node --test tests/dingtalk-group-auth.test.mjs tests/dingtalk-web-auth.test.mjs
\`\`\`

Expected: PASS.

Commit:

\`\`\`bash
git add functions/api/auth/dingtalk/group/start.js functions/api/auth/dingtalk/group/callback.js functions/api/_middleware.js tests/dingtalk-group-auth.test.mjs
git commit -m "feat(auth): authorize DingTalk group access"
\`\`\`

---

### Task 4: Build Session-Protected Group Search and Member APIs

**Files:**
- Create: \`functions/api/dingtalk/_shared/groups.js\`
- Consume: \`functions/api/dingtalk/_shared/group-contract.js\`
- Create: \`functions/api/dingtalk/groups/search.js\`
- Create: \`functions/api/dingtalk/groups/[groupId]/members.js\`
- Create: \`tests/dingtalk-groups.test.mjs\`
- Modify: \`package.json\`

**Interfaces:**
- Consumes: exact official method/path/auth/pagination contract from Task 1 and \`getValidDingUserToken(request, env, fetchImpl)\` from Task 2.
- Produces: \`searchDingGroups(userToken, query, cursor, fetchImpl) -> { groups, nextCursor }\`, \`listDingGroupMembers(userToken, groupId, { resolveMember, fetchImpl }) -> { members, skippedCount, skippedReasons }\`, and the two JSON routes defined in the design. Search responses use a 30-second session-user cache; member responses are never cached.

- [ ] **Step 1: Write failing adapter and route tests**

Use mocked DingTalk responses shaped exactly like the Task 1 evidence. Cover:

\`\`\`js
test("group search normalizes visible groups and pagination", async () => {
  const raw = {
    [dingGroupContract.search.listField]: [{
      [dingGroupContract.search.idField]: "g1",
      [dingGroupContract.search.nameField]: "产品群"
    }],
    [dingGroupContract.search.nextCursorField]: "c2"
  };
  const calls = [];
  const result = await searchDingGroups("user-token", " 产品 ", "", async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json(raw);
  });

  assert.deepEqual(result, { groups: [{ id: "g1", name: "产品群" }], nextCursor: "c2" });
  assert.equal(calls[0].options.headers[dingGroupContract.authHeader], "user-token");
});

test("group members follows every page and maps active employees to unionId", async () => {
  const member = (userId, name) => ({
    [dingGroupContract.members.userIdField]: userId,
    [dingGroupContract.members.nameField]: name
  });
  const pages = [
    {
      [dingGroupContract.members.listField]: [member("staff-1", "甲"), member("staff-2", "乙")],
      [dingGroupContract.members.hasMoreField]: true,
      [dingGroupContract.members.nextCursorField]: "c2"
    },
    {
      [dingGroupContract.members.listField]: [member("staff-2", "乙"), member("staff-3", "丙")],
      [dingGroupContract.members.hasMoreField]: false,
      [dingGroupContract.members.nextCursorField]: ""
    }
  ];
  const resolveMember = async source => source.userId === "staff-3" ? null : {
    unionId: source.userId === "staff-1" ? "u1" : "u2",
    name: source.name
  };
  const result = await listDingGroupMembers("user-token", "g1", {
    resolveMember,
    fetchImpl: async () => Response.json(pages.shift())
  });

  assert.deepEqual(result.members.map(item => item.unionId), ["u1", "u2"]);
  assert.equal(result.skippedCount, 1);
  assert.deepEqual(result.skippedReasons, { missingIdentity: 1, inactive: 0, unavailable: 0 });
});

test("group member route rejects a group outside the current user's search visibility", async () => {
  const db = createAuthD1Mock();
  const env = {
    PRODUCT_FLOW_DB: db,
    DINGTALK_APP_KEY: "app-key",
    DINGTALK_APP_SECRET: "app-secret",
    DINGTALK_TOKEN_ENCRYPTION_KEY: TOKEN_KEY
  };
  const created = await createSession(identity, "browser", env);
  await saveDingUserToken(db, created.sessionIdHash, {
    accessToken: "access-1",
    refreshToken: "refresh-1",
    expireIn: 7200
  }, env);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ code: "Forbidden", message: "group is not visible" }, { status: 403 });
  try {
    const response = await listGroupMembersRoute({
      request: new Request("https://flow.example.com/api/dingtalk/groups/g1/members", {
        headers: { cookie: created.cookie }
      }),
      env,
      data: { session: created.session },
      params: { groupId: "g1" }
    });
    const body = await response.json();
    assert.equal(response.status, 403);
    assert.equal(body.code, "GROUP_NOT_VISIBLE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("group search cache is isolated by session and expires after 30 seconds", async () => {
  const db = createAuthD1Mock();
  const env = {
    PRODUCT_FLOW_DB: db,
    DINGTALK_APP_KEY: "app-key",
    DINGTALK_APP_SECRET: "app-secret",
    DINGTALK_TOKEN_ENCRYPTION_KEY: TOKEN_KEY
  };
  const sessionA = await createSession(identity, "browser", env);
  const sessionB = await createSession({ ...identity, userId: "user-2", unionId: "union-2" }, "browser", env);
  await saveDingUserToken(db, sessionA.sessionIdHash, { accessToken: "a", refreshToken: "ra", expireIn: 7200 }, env);
  await saveDingUserToken(db, sessionB.sessionIdHash, { accessToken: "b", refreshToken: "rb", expireIn: 7200 }, env);
  const stored = new Map();
  const putResponses = [];
  const originalCaches = globalThis.caches;
  const originalFetch = globalThis.fetch;
  globalThis.caches = { default: {
    async match(request) { return stored.get(String(request.url || request))?.clone(); },
    async put(request, response) {
      putResponses.push(response.clone());
      stored.set(String(request.url || request), response.clone());
    }
  } };
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    return Response.json({
      [dingGroupContract.search.listField]: [{
        [dingGroupContract.search.idField]: "g1",
        [dingGroupContract.search.nameField]: "产品群"
      }]
    });
  };
  const invoke = created => searchGroupsRoute({
    request: new Request("https://flow.example.com/api/dingtalk/groups/search?q=%E4%BA%A7%E5%93%81", {
      headers: { cookie: created.cookie }
    }),
    env,
    data: { session: created.session }
  });
  try {
    await invoke(sessionA);
    await invoke(sessionA);
    await invoke(sessionB);
    assert.equal(upstreamCalls, 2);
    assert.equal(putResponses.every(response => response.headers.get("cache-control") === "private, max-age=30"), true);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});

test("group routes return GROUP_AUTH_REQUIRED without a stored user token", async () => {
  const db = createAuthD1Mock();
  const created = await createSession(identity, "browser", { PRODUCT_FLOW_DB: db });
  const response = await searchGroupsRoute({
    request: new Request("https://flow.example.com/api/dingtalk/groups/search?q=%E4%BA%A7%E5%93%81", {
      headers: { cookie: created.cookie }
    }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: created.session }
  });
  const body = await response.json();

  assert.equal(response.status, 428);
  assert.equal(body.code, "GROUP_AUTH_REQUIRED");
});
\`\`\`

- [ ] **Step 2: Verify the tests fail**

Run:

\`\`\`bash
node --test tests/dingtalk-groups.test.mjs
\`\`\`

Expected: FAIL because the adapter and routes do not exist.

- [ ] **Step 3: Implement the DingTalk adapter from verified evidence**

Define a single request helper driven by \`dingGroupContract\`; it uses only the Task 1 method/path and auth header, normalizes DingTalk errors to local codes, and never logs request headers. Search must trim the query and reject empty values. Member listing must iterate until the verified \`hasMore\`/cursor termination condition, de-duplicate by \`unionId\`, and map users to:

\`\`\`js
{
  unionId: String(source.unionId || source.unionid || ""),
  name: String(source.name || source.nick || "钉钉成员"),
  department: String(source.department || ""),
  title: String(source.title || "")
}
\`\`\`

If the member API returns only staff user IDs, use the existing enterprise org-member cache to convert \`(corpId, userId)\` to \`unionId\`. Return \`skippedReasons\` with integer keys \`missingIdentity\`, \`inactive\`, and \`unavailable\`; \`skippedCount\` is their sum.

- [ ] **Step 4: Implement the two routes**

The search route accepts \`q\` and \`cursor\`, obtains the user token and \`sessionIdHash\` from the current request, and uses \`caches.default\` with a key containing \`sessionIdHash\`, normalized query, and cursor. Cache only successful responses for 30 seconds; never cache authorization or upstream errors. It returns:

\`\`\`js
return jsonResponse({ groups, nextCursor });
\`\`\`

The member route decodes the path segment and calls the verified member operation with the current user's token. DingTalk therefore remains the source of truth for group visibility; translate its inaccessible/not-found response to local 403 \`GROUP_NOT_VISIBLE\`. On success, read all pages and return:

\`\`\`js
return jsonResponse({ members, skippedCount, skippedReasons, executorLimit: dingGroupContract.todoExecutorLimit });
\`\`\`

Reject empty group IDs with 400, inaccessible groups with 403, missing group authorization with 428, and upstream DingTalk errors with 502 plus a safe local error code.

- [ ] **Step 5: Add the API test to the default suite and verify**

Append \`tests/dingtalk-group-auth.test.mjs tests/dingtalk-groups.test.mjs\` to \`test:api\`.

Run:

\`\`\`bash
npm run test:api
\`\`\`

Expected: all API tests PASS.

- [ ] **Step 6: Commit group APIs**

\`\`\`bash
git add functions/api/dingtalk/_shared/groups.js functions/api/dingtalk/groups/search.js 'functions/api/dingtalk/groups/[groupId]/members.js' tests/dingtalk-groups.test.mjs package.json
git commit -m "feat(dingtalk): expose user-visible group members"
\`\`\`

---

### Task 5: Implement Pure Group/Person Selection State

**Files:**
- Create: \`src/domain/dingTalkGroupSelection.js\`
- Create: \`react-tests/dingtalk-group-selection.test.mjs\`

**Interfaces:**
- Consumes: org users shaped as \`{ unionid, userid, name, department, title }\` and group members shaped as \`{ unionId, name, department, title }\`.
- Produces: \`initialExecutorSelection\`, \`toggleManualExecutor\`, \`addGroupExecutors\`, \`removeGroupExecutors\`, \`excludeExecutor\`, and \`selectedExecutorUsers\`.

- [ ] **Step 1: Write failing source-tracking tests**

\`\`\`js
test("group members merge with manual executors by unionId", () => {
  const initial = initialExecutorSelection([{ unionid: "u1", name: "甲" }], ["u1"]);
  const next = addGroupExecutors(initial, { id: "g1", name: "产品群" }, [
    { unionId: "u1", name: "甲" },
    { unionId: "u2", name: "乙" }
  ]);
  assert.deepEqual(selectedExecutorUsers(next).map(user => user.unionid), ["u1", "u2"]);
  assert.equal(next.people.u1.manual, true);
  assert.deepEqual(next.people.u1.groupIds, ["g1"]);
});

test("removing a group preserves manually selected and overlapping members", () => {
  let state = initialExecutorSelection([{ unionid: "u1", name: "甲" }], ["u1"]);
  state = addGroupExecutors(state, { id: "g1", name: "一群" }, [
    { unionId: "u1", name: "甲" }, { unionId: "u2", name: "乙" }
  ]);
  state = addGroupExecutors(state, { id: "g2", name: "二群" }, [
    { unionId: "u2", name: "乙" }, { unionId: "u3", name: "丙" }
  ]);
  state = removeGroupExecutors(state, "g1");

  assert.deepEqual(selectedExecutorUsers(state).map(user => user.unionid), ["u1", "u2", "u3"]);
  assert.deepEqual(state.people.u2.groupIds, ["g2"]);
});

test("an excluded member stays excluded when the same group is loaded again", () => {
  const group = { id: "g1", name: "产品群" };
  const members = [{ unionId: "u2", name: "乙" }];
  let state = addGroupExecutors(initialExecutorSelection([], []), group, members);
  state = excludeExecutor(state, "u2");
  state = addGroupExecutors(state, group, members);

  assert.deepEqual(selectedExecutorUsers(state), []);
  assert.deepEqual(state.excludedUnionIds, ["u2"]);
});

test("closing and reopening rebuilds selection only from persisted todo executors", () => {
  let state = addGroupExecutors(initialExecutorSelection([], []), { id: "g1", name: "产品群" }, [
    { unionId: "u2", name: "乙" }
  ]);
  state = excludeExecutor(state, "u2");
  const reopened = initialExecutorSelection([{ unionid: "u1", name: "甲" }], ["u1"]);

  assert.deepEqual(Object.keys(reopened.groups), []);
  assert.deepEqual(reopened.excludedUnionIds, []);
  assert.deepEqual(selectedExecutorUsers(reopened).map(user => user.unionid), ["u1"]);
});
\`\`\`

- [ ] **Step 2: Verify failure**

Run:

\`\`\`bash
node --test react-tests/dingtalk-group-selection.test.mjs
\`\`\`

Expected: FAIL because the domain module does not exist.

- [ ] **Step 3: Implement immutable selection functions**

Use this state shape:

\`\`\`js
{
  people: {
    [unionId]: {
      user: { unionid, userid, name, department, title },
      manual: Boolean,
      groupIds: String[]
    }
  },
  groups: {
    [groupId]: { id, name, memberCount, skippedCount, skippedReasons }
  },
  excludedUnionIds: String[]
}
\`\`\`

All functions return new objects and sorted unique \`groupIds\`. \`excludeExecutor\` removes the person from final selection and adds the ID to \`excludedUnionIds\`. \`addGroupExecutors\` must not re-add excluded IDs. \`removeGroupExecutors\` deletes a person only when \`manual\` is false and no other group source remains. \`selectedExecutorUsers\` returns each user with the existing lowercase \`unionid\` property expected by \`buildTaskTodoPayload\`.

- [ ] **Step 4: Run tests and commit**

Run:

\`\`\`bash
node --test react-tests/dingtalk-group-selection.test.mjs react-tests/task-todo.test.mjs
\`\`\`

Expected: PASS.

Commit:

\`\`\`bash
git add src/domain/dingTalkGroupSelection.js react-tests/dingtalk-group-selection.test.mjs
git commit -m "feat(progress): model group-sourced todo executors"
\`\`\`

---

### Task 6: Add the Browser Group API Client

**Files:**
- Create: \`src/domain/dingTalkGroups.js\`
- Create: \`react-tests/dingtalk-groups-client.test.mjs\`

**Interfaces:**
- Consumes: session-protected routes from Task 4.
- Produces: \`searchDingTalkGroups(query, cursor, fetchImpl)\`, \`loadDingTalkGroupMembers(groupId, fetchImpl)\`, and \`groupAuthorizationUrl(returnTo)\`.

- [ ] **Step 1: Write failing API client tests**

\`\`\`js
test("group search encodes query and normalizes the successful response", async () => {
  let requested = null;
  const result = await searchDingTalkGroups("产品", "", async (url, options) => {
    requested = { url: String(url), options };
    return Response.json({ groups: [{ id: "g1", name: "产品群" }], nextCursor: "c2" });
  });

  assert.match(requested.url, /\\/api\\/dingtalk\\/groups\\/search\\?q=%E4%BA%A7%E5%93%81/);
  assert.equal(requested.options.credentials, "same-origin");
  assert.deepEqual(result, { groups: [{ id: "g1", name: "产品群" }], nextCursor: "c2" });
});

test("GROUP_AUTH_REQUIRED exposes a reauthorization action", async () => {
  await assert.rejects(
    () => searchDingTalkGroups("产品", "", async () => Response.json({
      code: "GROUP_AUTH_REQUIRED",
      message: "需要授权访问当前账号可见的钉钉群。"
    }, { status: 428 })),
    error => error.code === "GROUP_AUTH_REQUIRED" && /\\/api\\/auth\\/dingtalk\\/group\\/start/.test(error.authorizeUrl)
  );
});

test("group member loading encodes the group id", async () => {
  let requestedUrl = "";
  const result = await loadDingTalkGroupMembers("group/1", async url => {
    requestedUrl = String(url);
    return Response.json({ members: [{ unionId: "u1", name: "甲" }], skippedCount: 0, executorLimit: 50 });
  });

  assert.match(requestedUrl, /\\/api\\/dingtalk\\/groups\\/group%2F1\\/members$/);
  assert.equal(result.members[0].unionId, "u1");
});
\`\`\`

- [ ] **Step 2: Verify failure**

Run:

\`\`\`bash
node --test react-tests/dingtalk-groups-client.test.mjs
\`\`\`

Expected: FAIL because \`src/domain/dingTalkGroups.js\` does not exist.

- [ ] **Step 3: Implement the client**

Use one JSON request helper. On non-2xx responses throw an \`Error\` extended with \`code\`, \`status\`, and \`authorizeUrl\` only for \`GROUP_AUTH_REQUIRED\`. Build the authorization URL from a relative return path:

\`\`\`js
export function groupAuthorizationUrl(returnTo = "/#progress") {
  return \`/api/auth/dingtalk/group/start?returnTo=\${encodeURIComponent(returnTo)}\`;
}
\`\`\`

Never accept or attach an access token in frontend functions.

- [ ] **Step 4: Run tests and commit**

Run:

\`\`\`bash
node --test react-tests/dingtalk-groups-client.test.mjs
\`\`\`

Expected: PASS.

Commit:

\`\`\`bash
git add src/domain/dingTalkGroups.js react-tests/dingtalk-groups-client.test.mjs
git commit -m "feat(progress): add DingTalk group browser client"
\`\`\`

---

### Task 7: Integrate the Group Executor Picker UI

**Files:**
- Create: \`src/features/progress/GroupExecutorPicker.jsx\`
- Modify: \`src/features/progress/TodoSyncModal.jsx\`
- Modify: \`src/styles.css\`
- Create: \`react-tests/dingtalk-group-picker.test.mjs\`

**Interfaces:**
- Consumes: Task 5 selection functions and Task 6 API client.
- Produces: a controlled \`GroupExecutorPicker({ users, selection, onChange, disabled })\`; \`TodoSyncModal\` still calls \`onSync({ executors })\` with no group fields.

- [ ] **Step 1: Write failing UI contract tests**

Read the component source and assert these stable behaviors:

\`\`\`js
test("todo sync offers person and group search modes", () => {
  assert.match(source, /按人员/);
  assert.match(source, /按群聊/);
  assert.match(source, /搜索群名称/);
});

test("selected groups load members and report skipped people", () => {
  assert.match(source, /loadDingTalkGroupMembers/);
  assert.match(source, /skippedCount/);
  assert.match(source, /带入/);
});

test("todo submission still sends only selected executor users", () => {
  assert.match(modalSource, /onSync\\(\\{ executors: selectedUsers \\}\\)/);
  assert.doesNotMatch(modalSource, /onSync\\(\\{[^}]*groups/);
});
\`\`\`

- [ ] **Step 2: Verify failure**

Run:

\`\`\`bash
node --test react-tests/dingtalk-group-picker.test.mjs
\`\`\`

Expected: FAIL because \`GroupExecutorPicker.jsx\` does not exist.

- [ ] **Step 3: Build the controlled picker**

Implement an accessible segmented control with \`button\` elements and \`aria-pressed\`. Person mode filters cached organization users. Group mode:

- waits for a non-empty trimmed query;
- debounces search by 300 ms and cancels stale responses with \`AbortController\` or a request sequence guard;
- shows loading, empty, permission, and retry states separately;
- disables a group row while its members load;
- calls \`addGroupExecutors\` only after the complete member response succeeds;
- renders selected group chips with remove buttons;
- renders the final selected-person list in both modes so individual removal remains available;
- renders a “重新授权” link only for \`GROUP_AUTH_REQUIRED\`.

All interactive targets must have visible focus styles and a minimum 36 px height. Do not add animation libraries.

- [ ] **Step 4: Refactor \`TodoSyncModal\` to the pure selection model**

Replace \`selectedUnionIds\` with \`selection\`. On open, call:

\`\`\`js
setSelection(initialExecutorSelection(users, task?.dingTodo?.executorUnionIds || []));
\`\`\`

Derive:

\`\`\`js
const selectedUsers = selectedExecutorUsers(selection);
\`\`\`

Keep the existing due-date validation, loading layer, error alert, and exact submission contract:

\`\`\`js
await onSync({ executors: selectedUsers });
\`\`\`

Closing the modal discards \`selection\`; no group metadata is written to the task.

- [ ] **Step 5: Add responsive styles**

Add classes scoped under \`.todo-executor-picker\` for the mode switch, search box, group rows, selected group chips, summary, and errors. At widths below 640 px, keep the mode buttons in one row, make chips wrap, and keep the member list within the modal viewport. Reuse existing CSS variables for color, radius, spacing, borders, focus rings, and control height.

- [ ] **Step 6: Run focused UI and build checks**

Run:

\`\`\`bash
node --test react-tests/dingtalk-group-selection.test.mjs react-tests/dingtalk-groups-client.test.mjs react-tests/dingtalk-group-picker.test.mjs react-tests/task-todo.test.mjs
npm run build
\`\`\`

Expected: all focused tests PASS and Vite build exits 0.

- [ ] **Step 7: Commit the picker UI**

\`\`\`bash
git add src/features/progress/GroupExecutorPicker.jsx src/features/progress/TodoSyncModal.jsx src/styles.css react-tests/dingtalk-group-picker.test.mjs
git commit -m "feat(progress): select todo executors from DingTalk groups"
\`\`\`

---

### Task 8: Full Verification and Real DingTalk Acceptance

**Files:**
- Modify only if a test exposes a defect in files already listed above.

**Interfaces:**
- Consumes: completed Tasks 1–7 and enterprise DingTalk test accounts.
- Produces: verified desktop-web and embedded behavior with no regression to person-only todo sync.

- [ ] **Step 1: Run all automated checks**

Run:

\`\`\`bash
npm test
npm run build
git diff --check HEAD~6..HEAD
\`\`\`

Expected: all tests PASS, build exits 0, and diff check prints nothing.

- [ ] **Step 2: Verify desktop web behavior**

Start the local preview:

\`\`\`bash
npm run dev
\`\`\`

In an authenticated desktop browser:

1. Open 产品进度 and a task with a valid due date.
2. Open 同步到钉钉待办 and switch to 按群聊.
3. Search a known visible group and select it.
4. Confirm the displayed member count equals the group roster minus explicitly reported skipped users.
5. Remove one person and submit.
6. Confirm only the remaining people are todo executors and the group receives no message.

Expected: all six checks pass without exposing a token in browser storage or network response bodies.

Run a visual audit at 1440×900 and 390×844. Verify hierarchy, spacing, alignment, selected/hover/focus states, chip wrapping, list scrolling, error placement, and that the footer buttons remain reachable. Capture screenshots for both widths and fix any clipped text, horizontal overflow, or control smaller than 36 px before continuing.

- [ ] **Step 3: Verify DingTalk embedded behavior**

Open the same existing authorized test deployment inside DingTalk and repeat Step 2. If the account has no stored group token, verify the one-time authorization returns to the same product progress context, then repeat the group search. If no authorized test deployment exists, stop and request deployment approval rather than publishing automatically.

Expected: search visibility and member counts match the same account on desktop web.

- [ ] **Step 4: Verify failure states**

With controlled test accounts or mocked upstream responses, verify:

- no group permission shows a reauthorization action;
- expired access token refreshes once;
- inaccessible/deleted group shows a retryable error and adds no partial members;
- overlapping groups de-duplicate people;
- removing one group preserves manual and other-group sources;
- executor overflow blocks submit and never truncates.

- [ ] **Step 5: Review the final diff and commit any verification-only fixes**

Run:

\`\`\`bash
git status --short
git diff --check
git log --oneline -8
\`\`\`

Expected: only intended files are changed. If verification required code fixes, rerun the affected focused test plus \`npm test\` and commit those fixes with a narrow message. If no fixes were required, do not create an empty commit.
`,be=`# In-App Handbook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Add an authenticated, searchable “说明书” workspace to both application sidebars and render the repository handbook, product, design, PRD/plan, and platform Markdown as the only content source.

**Architecture:** Keep Markdown in allowlisted repository directories, transform it into a build-time catalog inside a lazy-loaded handbook feature, and render it with safe Markdown defaults. Use pure domain helpers for filtering, slug resolution, deep links, and table-of-contents extraction. Keep handbook-specific layout in a feature CSS file so the existing global stylesheet does not continue growing.

**Tech Stack:** React 19 lazy/Suspense, Vite 7 raw Markdown imports and glob imports, react-markdown, remark-gfm, rehype-slug, github-slugger, JavaScript ES modules, Node test runner, existing OKLCH tokens.

## Global Constraints

- The handbook is visible to every authenticated company user in both navigation shells and remains unavailable before authentication.
- Markdown in \`PRODUCT.md\`, \`DESIGN.md\`, \`docs/handbook\`, \`docs/product\`, \`docs/platform\`, \`docs/superpowers/specs\`, and \`docs/superpowers/plans\` is the only displayed content source.
- Do not scan arbitrary repository files or enable raw HTML rendering.
- The handbook feature is lazy-loaded and must not add the Markdown renderer to the initial application chunk.
- Default document is \`handbook/getting-started\`; invalid slugs fall back safely and never read arbitrary paths.
- Support title, summary, and body search; category filters; empty results; stable deep links; and H2/H3 table of contents.
- Preserve the restrained product UI: no nested cards, decorative motion, gradient text, or oversized radii.
- Use the existing color, spacing, focus, radius, and typography tokens. Body text remains readable at WCAG AA contrast.
- Existing App navigation, explicit product navigation, authentication, and permission behavior must not regress.

---

### Task 1: Handbook domain and build-time catalog

**Files:**
- Create: \`src/domain/handbook.js\`
- Create: \`src/features/handbook/handbookCatalog.js\`
- Create: \`react-tests/handbook.test.mjs\`
- Modify: \`package.json\`
- Modify: \`package-lock.json\`

**Interfaces:**
- Produces: \`HANDBOOK_CATEGORIES\`, \`createHandbookDocument(entry)\`, \`filterHandbookDocuments(documents, options)\`, \`resolveHandbookDocument(documents, slug)\`, and \`extractMarkdownHeadings(markdown)\`.
- Produces: \`handbookDocuments\` containing \`{ slug, category, kind, title, summary, updatedAt, content }\` and \`DEFAULT_HANDBOOK_SLUG\`.

- [x] **Step 1: Write failing pure domain tests**

Create tests for:

\`\`\`js
import test from "node:test";
import assert from "node:assert/strict";
import {
  createHandbookDocument,
  extractMarkdownHeadings,
  filterHandbookDocuments,
  resolveHandbookDocument
} from "../src/domain/handbook.js";

const docs = [
  createHandbookDocument({
    slug: "handbook/getting-started",
    category: "handbook",
    kind: "guide",
    updatedAt: "2026-07-17",
    content: "# 开始使用\\n\\n员工登录与导航说明。\\n\\n## 登录\\n\\n使用钉钉登录。"
  }),
  createHandbookDocument({
    slug: "platform/api-catalog",
    category: "platform",
    kind: "platform",
    updatedAt: "2026-07-17",
    content: "# API 目录\\n\\n共享状态接口。"
  })
];

test("handbook documents derive titles and summaries from markdown", () => {
  assert.equal(docs[0].title, "开始使用");
  assert.equal(docs[0].summary, "员工登录与导航说明。");
});

test("handbook search covers title summary and body with category filtering", () => {
  assert.deepEqual(filterHandbookDocuments(docs, { query: "钉钉" }).map(item => item.slug), ["handbook/getting-started"]);
  assert.deepEqual(filterHandbookDocuments(docs, { category: "platform" }).map(item => item.slug), ["platform/api-catalog"]);
});

test("invalid handbook slugs fall back to the requested default", () => {
  assert.equal(resolveHandbookDocument(docs, "missing", "handbook/getting-started").slug, "handbook/getting-started");
});

test("markdown table of contents uses stable unique H2 and H3 ids", () => {
  assert.deepEqual(extractMarkdownHeadings("## 登录\\n### 权限\\n## 登录"), [
    { level: 2, title: "登录", id: "登录" },
    { level: 3, title: "权限", id: "权限" },
    { level: 2, title: "登录", id: "登录-1" }
  ]);
});
\`\`\`

- [x] **Step 2: Run the focused test and verify missing-module failure**

Run: \`node --test react-tests/handbook.test.mjs\`

Expected: FAIL with \`ERR_MODULE_NOT_FOUND\` for \`src/domain/handbook.js\`.

- [x] **Step 3: Install safe Markdown dependencies**

Run: \`npm install react-markdown@^10.0.0 remark-gfm@^4.0.0 rehype-slug@^6.0.0 github-slugger@^2.0.0\`

- [x] **Step 4: Implement the pure handbook domain**

Use \`GithubSlugger\` for heading IDs. Strip the first H1 from the summary search, choose the first non-heading non-list paragraph as summary, normalize whitespace, and compare search text with \`toLocaleLowerCase("zh-CN")\`. \`resolveHandbookDocument\` returns the matching slug, then the default slug, then the first document, or \`null\`.

- [x] **Step 5: Build the allowlisted Markdown catalog**

\`handbookCatalog.js\` explicitly imports \`PRODUCT.md\` and \`DESIGN.md\` with \`?raw\`, then uses \`import.meta.glob\` with eager raw imports only for:

\`\`\`js
[
  "../../../docs/handbook/*.md",
  "../../../docs/product/*.md",
  "../../../docs/platform/*.md",
  "../../../docs/superpowers/specs/*.md",
  "../../../docs/superpowers/plans/*.md"
]
\`\`\`

Map the paths to stable categories and slugs. Derive \`updatedAt\` from a leading \`YYYY-MM-DD\` filename when present, otherwise use \`2026-07-17\`. Sort by category order, kind order, then title. Export \`DEFAULT_HANDBOOK_SLUG = "handbook/getting-started"\`.

- [x] **Step 6: Run focused tests and production build**

Run: \`node --test react-tests/handbook.test.mjs && npm run build\`

Expected: domain tests pass and Vite resolves every allowlisted raw Markdown import.

- [x] **Step 7: Commit the domain and catalog**

\`\`\`bash
git add src/domain/handbook.js src/features/handbook/handbookCatalog.js react-tests/handbook.test.mjs package.json package-lock.json
git commit -m "feat(handbook): build documentation catalog"
\`\`\`

### Task 2: Safe Markdown document renderer and handbook workspace

**Files:**
- Create: \`src/features/handbook/MarkdownDocument.jsx\`
- Create: \`src/features/handbook/HandbookPage.jsx\`
- Create: \`src/features/handbook/handbook.css\`
- Modify: \`react-tests/handbook.test.mjs\`

**Interfaces:**
- Consumes: \`handbookDocuments\`, \`DEFAULT_HANDBOOK_SLUG\`, filtering/resolution/heading helpers.
- Produces: default export \`HandbookPage({ selectedSlug, onSelectDocument })\`.

- [x] **Step 1: Add failing source-contract tests**

Assert that the page contains search label \`搜索说明书\`, category labels \`员工使用手册\`, \`产品与设计\`, \`平台能力\`, empty copy \`没有找到匹配的说明\`, and renders \`MarkdownDocument\`. Assert the renderer imports \`react-markdown\`, \`remark-gfm\`, and \`rehype-slug\`, does not import \`rehype-raw\`, gives external links \`target="_blank"\`, and renders table wrappers.

- [x] **Step 2: Run the focused test and verify missing component files**

Run: \`node --test react-tests/handbook.test.mjs\`

Expected: FAIL because \`HandbookPage.jsx\` and \`MarkdownDocument.jsx\` do not exist.

- [x] **Step 3: Implement \`MarkdownDocument\`**

Render Markdown with GFM and heading IDs. Override links so internal \`#heading\` links stay in the page and HTTP links receive \`target="_blank" rel="noreferrer"\`. Wrap tables in \`.handbook-table-wrap\`, keep code blocks horizontally scrollable, and do not enable raw HTML.

- [x] **Step 4: Implement the three-column handbook page**

State contains \`query\` and \`category\`, while selected document remains controlled by the route. The page must:

- Render a page header and concise description.
- Render an accessible search input with clear button.
- Render category filter buttons with \`aria-pressed\`.
- Group filtered documents by category in the left column.
- Resolve invalid selected slugs to the default and notify \`onSelectDocument\` only from user selection.
- Render title, summary, kind label, updated date, Markdown body, and H2/H3 table of contents.
- Render an instructional empty state when no result matches.

- [x] **Step 5: Add restrained responsive CSS**

Use \`grid-template-columns: minmax(210px, 250px) minmax(0, 1fr) minmax(150px, 190px)\`, existing tokens, full dividers rather than nested cards, 65-75ch article text, stable tables, visible focus, and sticky directory/TOC only when height permits. At 1180px hide the right TOC; at 820px use one column and make the document list horizontally scrollable. Respect \`prefers-reduced-motion\`.

- [x] **Step 6: Run focused test and lint**

Run: \`node --test react-tests/handbook.test.mjs && npm run lint\`

Expected: focused tests pass and ESLint exits 0.

- [x] **Step 7: Commit the handbook workspace**

\`\`\`bash
git add src/features/handbook react-tests/handbook.test.mjs
git commit -m "feat(handbook): add searchable document workspace"
\`\`\`

### Task 3: Deep-link route helpers and sidebar integration

**Files:**
- Create: \`src/domain/appNavigation.js\`
- Modify: \`src/App.jsx\`
- Modify: \`src/domain/permissions.js\`
- Modify: \`react-tests/handbook.test.mjs\`

**Interfaces:**
- Produces: \`parseAppHash(hash) -> { screen, detail }\` and \`formatAppHash(screen, detail) -> string\`.
- Consumes: lazy default export from \`HandbookPage.jsx\`.

- [x] **Step 1: Add failing route and navigation tests**

Test round trips for \`#handbook/platform/api-catalog\`, percent-encoded Chinese segments, and empty hashes. Source assertions require \`BookOpenText\`, a \`handbook\` item in both \`COMPANY_NAV\` and \`PRODUCT_NAV\`, \`lazy(() => import("./features/handbook/HandbookPage.jsx"))\`, a Suspense fallback, and \`if (key === "handbook") return Boolean(user);\` in permissions.

- [x] **Step 2: Run the focused test and verify missing route helper**

Run: \`node --test react-tests/handbook.test.mjs\`

Expected: FAIL with \`ERR_MODULE_NOT_FOUND\` for \`src/domain/appNavigation.js\`.

- [x] **Step 3: Implement pure hash parsing and formatting**

Split the hash into encoded path segments, decode each safely, and never throw on malformed encoding. \`formatAppHash\` encodes each detail segment separately so slash-delimited handbook slugs remain readable and stable.

- [x] **Step 4: Integrate lazy handbook navigation into App**

- Add \`handbook\` to company “平台” group and product navigation before issue feedback.
- Keep screen validation against existing navigation and hidden screens.
- Track route detail on \`hashchange\` and pass it as \`selectedSlug\`.
- \`onSelectDocument(slug)\` updates \`#handbook/<slug>\` without remounting unrelated providers.
- Render a lightweight page skeleton inside Suspense.
- Preserve existing \`navigate\`, product progress focus, and default screen behavior.

- [x] **Step 5: Make handbook navigation unconditionally visible after login**

Return \`Boolean(user)\` for \`key === "handbook"\` before configurable navigation rules. Do not add handbook to the permission-settings matrix because employees must not accidentally lose access to company instructions.

- [x] **Step 6: Run handbook, app, and access tests**

Run: \`node --test react-tests/handbook.test.mjs react-tests/react-app.test.mjs react-tests/company-access-gate.test.mjs\`

Expected: all selected tests pass, 0 fail.

- [x] **Step 7: Commit navigation integration**

\`\`\`bash
git add src/domain/appNavigation.js src/App.jsx src/domain/permissions.js react-tests/handbook.test.mjs
git commit -m "feat(handbook): add sidebar entry and deep links"
\`\`\`

### Task 4: Production verification and visual audit

**Files:**
- Modify only handbook or route files if verification exposes a defect.

**Interfaces:**
- Consumes: Complete handbook feature.
- Produces: Test, build, responsive, accessibility, and lazy-chunk evidence.

- [x] **Step 1: Run every repository gate**

Run: \`npm run lint && npm run check:governance && npm test && npm run build\`

Expected: all commands exit 0.

- [x] **Step 2: Verify code splitting from build output**

Inspect \`dist/assets\` and confirm a separate handbook JavaScript chunk contains Markdown renderer code while the primary entry remains separate.

- [x] **Step 3: Start local preview and inspect real UI**

Run: \`npm run dev\`

Open \`http://127.0.0.1:8132/#handbook/handbook/getting-started\` and verify:

- Company sidebar displays “说明书” in the platform group.
- Search, category filters, document switching, deep links, external links, tables, code, and TOC work.
- Keyboard focus is visible and directory buttons are reachable in order.
- Empty search explains how to recover.
- Invalid slug safely shows the getting-started document.

- [x] **Step 4: Audit laptop and narrow widths**

Check approximately 1440px, 1180px, 820px, and 390px widths. Confirm no clipped sidebar, heading, table, search control, or document navigation; right TOC hides at 1180px and the document directory becomes compact at 820px.

- [x] **Step 5: Inspect final diff and commits**

Run: \`git status --short && git diff --check && git log -10 --oneline\`

Expected: worktree clean, no whitespace errors, task commits are focused, and unrelated main-worktree files were not touched.
`,ve=`# Product Planning Card Progress Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Make each initiated product card in the planning tray open that product's progress page while preserving the card's planning action.

**Architecture:** Reuse the existing \`App.openProgress(productId)\` navigation boundary. Pass it through \`ProductPlanningPage\` to \`PlanningDemandTray\`, where cards with a \`productId\` receive pointer and keyboard activation while the nested planning button stops propagation.

**Tech Stack:** React 19, Vite, Node test runner, existing CSS design tokens.

## Global Constraints

- Only cards with a non-empty \`productId\` navigate to product progress.
- Card activation must work with pointer, Enter, and Space.
- The nested calendar button must continue opening the planning modal without navigating.
- Do not change demand records, product records, or planning persistence.

---

### Task 1: Wire planning cards to explicit product progress navigation

**Files:**
- Modify: \`react-tests/react-app.test.mjs\`
- Modify: \`src/App.jsx\`
- Modify: \`src/features/planning/ProductPlanningPage.jsx\`
- Modify: \`src/features/planning/PlanningDemandTray.jsx\`
- Modify: \`src/styles.css\`

**Interfaces:**
- Consumes: \`App.openProgress(productId, stage?)\` from the existing application shell.
- Produces: \`ProductPlanningPage({ onOpenProgress })\` and \`PlanningDemandTray({ demands, currentUser, canEdit, onArrange, onOpenProgress })\`.

- [ ] **Step 1: Write the failing source-contract test**

Add this focused test to \`react-tests/react-app.test.mjs\`:

\`\`\`js
test("initiated planning cards open product progress without hijacking the arrange action", () => {
  const app = read("src/App.jsx");
  const page = read("src/features/planning/ProductPlanningPage.jsx");
  const tray = read("src/features/planning/PlanningDemandTray.jsx");
  const styles = read("src/styles.css");

  assert.match(app, /<ProductPlanningPage onOpenProgress=\\{openProgress\\}/);
  assert.match(page, /onOpenProgress=\\{onOpenProgress\\}/);
  assert.match(tray, /onOpenProgress\\?\\.\\(demand\\.productId\\)/);
  assert.match(tray, /event\\.key === "Enter" \\|\\| event\\.key === " "/);
  assert.match(tray, /event\\.stopPropagation\\(\\)/);
  assert.match(styles, /\\.planning-demand-chip\\.is-progress-link/);
});
\`\`\`

- [ ] **Step 2: Run the test and verify RED**

Run:

\`\`\`bash
node --test --test-name-pattern="initiated planning cards" react-tests/react-app.test.mjs
\`\`\`

Expected: FAIL because \`ProductPlanningPage\` does not yet receive \`onOpenProgress\`.

- [ ] **Step 3: Pass the existing navigation callback through the component tree**

In \`src/App.jsx\`, render:

\`\`\`jsx
planning: <ProductPlanningPage onOpenProgress={openProgress} />,
\`\`\`

In \`src/features/planning/ProductPlanningPage.jsx\`, replace the component signature:

\`\`\`jsx
export function ProductPlanningPage({ onOpenProgress }) {
}
\`\`\`

Replace the current one-line tray render with:

\`\`\`jsx
<PlanningDemandTray
  demands={candidates}
  currentUser={currentUser}
  canEdit={canEdit}
  onArrange={openNewPlan}
  onOpenProgress={onOpenProgress}
/>
\`\`\`

- [ ] **Step 4: Add accessible card activation and preserve the arrange button**

In \`src/features/planning/PlanningDemandTray.jsx\`, derive \`canOpenProgress\` for each demand and add only the interaction needed by initiated products:

\`\`\`jsx
const canOpenProgress = Boolean(demand.productId);

<article
  className={\`planning-demand-chip \${canEdit ? "is-draggable" : ""} \${canOpenProgress ? "is-progress-link" : ""}\`}
  role={canOpenProgress ? "link" : undefined}
  tabIndex={canOpenProgress ? 0 : undefined}
  onClick={() => {
    if (canOpenProgress) onOpenProgress?.(demand.productId);
  }}
  onKeyDown={event => {
    if (!canOpenProgress || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onOpenProgress?.(demand.productId);
  }}
>
  {/* existing product content */}
  <Button
    className="compact planning-arrange-button"
    onClick={event => {
      event.stopPropagation();
      onArrange(demand);
    }}
  >
    <CalendarPlus size={15} aria-hidden="true" />安排
  </Button>
</article>
\`\`\`

Keep the existing drag handler, disabled state, and disabled reason unchanged.

- [ ] **Step 5: Add focus and pointer affordances using existing tokens**

Add to \`src/styles.css\` beside the existing planning tray styles:

\`\`\`css
.planning-demand-chip.is-progress-link {
  cursor: pointer;
}

.planning-demand-chip.is-progress-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
\`\`\`

- [ ] **Step 6: Run focused and full automated verification**

Run:

\`\`\`bash
node --test --test-name-pattern="initiated planning cards" react-tests/react-app.test.mjs
npm test
npm run build
\`\`\`

Expected: the focused test passes, all React and API tests pass, and the Vite production build exits 0.

- [ ] **Step 7: Verify behavior in the browser**

Start the local preview, then confirm:

1. Clicking an initiated product card changes the hash to \`#progress\` and keeps that product selected.
2. Focusing the card and pressing Enter or Space performs the same jump.
3. Clicking the calendar button opens the planning modal and leaves the page on \`#planning\`.
4. A candidate without \`productId\` has no link role, no tab stop, and no progress navigation.

- [ ] **Step 8: Commit the implementation**

\`\`\`bash
git add react-tests/react-app.test.mjs src/App.jsx src/features/planning/ProductPlanningPage.jsx src/features/planning/PlanningDemandTray.jsx src/styles.css
git commit -m "feat(planning): open product progress from cards"
\`\`\`
`,we=`# Product Ownership Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Use the organization-backed product owner assignment to prioritize the signed-in user's products in product progress and show a consistent “我负责” label in the product picker, product archive, and product planning.

**Architecture:** Add pure ownership identity and stable-sorting helpers that prefer DingTalk organization IDs and fall back to names for legacy records. Keep the product-progress default selection local to the mounted page so a personal default does not rewrite shared state, while explicit product navigation remains authoritative. Render one shared badge component across all requested surfaces.

**Tech Stack:** React 19, JavaScript ES modules, Node test runner, Vite 7, existing DingTalk organization cache and CSS design tokens.

## Global Constraints

- Product owners continue to be selected from the existing organization user selector; do not add free-text owner input.
- Match by user ID first, union ID second, and normalized name only as a legacy fallback.
- Do not hard-code the signed-in user's job title; ownership is determined by the product assignment.
- Direct product-progress navigation prefers the first owned product, but explicit product links keep their selected product.
- Product archive and product planning keep their current order, filtering, planning, drag, and edit behavior.
- Do not add a “只看我负责” filter or change authorization rules.
- Reuse one accessible text badge with the copy \`我负责\`.

---

### Task 1: Organization-backed product ownership domain

**Files:**
- Create: \`src/domain/productOwnership.js\`
- Create: \`react-tests/product-ownership.test.mjs\`

**Interfaces:**
- Consumes: \`orgUsers(orgCache)\` from \`src/domain/productFlow.js\`.
- Produces: \`productManagerAssignment(name, orgCache)\`, \`isProductOwnedBy(product, currentUser)\`, \`prioritizeOwnedProducts(products, currentUser)\`, and \`preferredProgressProductId(products, currentUser, explicitProductId)\`.

- [ ] **Step 1: Write failing identity, legacy, and stable-order tests**

\`\`\`js
import test from "node:test";
import assert from "node:assert/strict";
import {
  isProductOwnedBy,
  preferredProgressProductId,
  prioritizeOwnedProducts,
  productManagerAssignment
} from "../src/domain/productOwnership.js";

const currentUser = { userid: "u-zhao", unionid: "union-zhao", name: "赵雨涵" };

test("product owner assignment resolves organization identifiers", () => {
  const assignment = productManagerAssignment("赵雨涵", {
    users: [{ userid: "u-zhao", unionid: "union-zhao", name: "赵雨涵" }]
  });
  assert.deepEqual(assignment, {
    productManager: "赵雨涵",
    productManagerUserId: "u-zhao",
    productManagerUnionId: "union-zhao"
  });
});

test("ownership prefers organization identifiers and supports legacy names", () => {
  assert.equal(isProductOwnedBy({ productManagerUserId: "u-zhao", productManager: "旧姓名" }, currentUser), true);
  assert.equal(isProductOwnedBy({ productManagerUnionId: "union-zhao", productManager: "旧姓名" }, currentUser), true);
  assert.equal(isProductOwnedBy({ productManager: " 赵雨涵 " }, currentUser), true);
  assert.equal(isProductOwnedBy({ productManager: "叶津成" }, currentUser), false);
});

test("owned products are moved first without changing order inside either group", () => {
  const products = [
    { id: "p1", productManager: "叶津成" },
    { id: "p2", productManager: "赵雨涵" },
    { id: "p3", productManager: "赵雨涵" },
    { id: "p4", productManager: "陈菲" }
  ];
  assert.deepEqual(prioritizeOwnedProducts(products, currentUser).map(product => product.id), ["p2", "p3", "p1", "p4"]);
  assert.deepEqual(products.map(product => product.id), ["p1", "p2", "p3", "p4"]);
});

test("explicit progress product wins over the personal default", () => {
  const products = [
    { id: "other", productManager: "叶津成" },
    { id: "mine", productManagerUserId: "u-zhao", productManager: "赵雨涵" }
  ];
  assert.equal(preferredProgressProductId(products, currentUser, "other"), "other");
  assert.equal(preferredProgressProductId(products, currentUser, ""), "mine");
});
\`\`\`

- [ ] **Step 2: Run the new test and verify the missing module failure**

Run: \`node --test react-tests/product-ownership.test.mjs\`

Expected: FAIL with \`ERR_MODULE_NOT_FOUND\` for \`src/domain/productOwnership.js\`.

- [ ] **Step 3: Implement normalized identity matching and stable ordering**

\`\`\`js
import { orgUsers } from "./productFlow.js";

function clean(value) {
  return String(value || "").trim();
}

function userId(user) {
  return clean(user?.userid || user?.userId || user?.id);
}

function unionId(user) {
  return clean(user?.unionid || user?.unionId);
}

export function productManagerAssignment(name, orgCache = {}) {
  const productManager = clean(name);
  const member = orgUsers(orgCache).find(user => clean(user.name) === productManager);
  return {
    productManager,
    productManagerUserId: userId(member),
    productManagerUnionId: unionId(member)
  };
}

export function isProductOwnedBy(product, currentUser) {
  if (!product || !currentUser) return false;
  const managerUserId = clean(product.productManagerUserId);
  const managerUnionId = clean(product.productManagerUnionId);
  if (managerUserId && userId(currentUser)) return managerUserId === userId(currentUser);
  if (managerUnionId && unionId(currentUser)) return managerUnionId === unionId(currentUser);
  return Boolean(clean(product.productManager) && clean(product.productManager) === clean(currentUser.name));
}

export function prioritizeOwnedProducts(products = [], currentUser) {
  return [...products]
    .map((product, index) => ({ product, index, owned: isProductOwnedBy(product, currentUser) }))
    .sort((left, right) => Number(right.owned) - Number(left.owned) || left.index - right.index)
    .map(item => item.product);
}

export function preferredProgressProductId(products = [], currentUser, explicitProductId = "") {
  const explicit = clean(explicitProductId);
  if (explicit && products.some(product => product.id === explicit)) return explicit;
  const owned = prioritizeOwnedProducts(products, currentUser).find(product => isProductOwnedBy(product, currentUser));
  return owned?.id || products[0]?.id || "";
}
\`\`\`

- [ ] **Step 4: Run the domain test and verify it passes**

Run: \`node --test react-tests/product-ownership.test.mjs\`

Expected: 4 tests pass, 0 fail.

- [ ] **Step 5: Commit the domain behavior**

\`\`\`bash
git add src/domain/productOwnership.js react-tests/product-ownership.test.mjs
git commit -m "feat(products): identify owned products"
\`\`\`

### Task 2: Persist organization identity and build the shared badge/picker behavior

**Files:**
- Create: \`src/ui/ProductOwnershipBadge.jsx\`
- Modify: \`src/ui/ProductPicker.jsx\`
- Modify: \`src/features/progress/ProductProgressPage.jsx\`
- Modify: \`src/features/archive/ProductModal.jsx\`
- Modify: \`src/features/packages/PackagePage.jsx\`
- Modify: \`src/styles.css\`
- Modify: \`react-tests/react-app.test.mjs\`

**Interfaces:**
- Consumes: Task 1 ownership helpers.
- Produces: \`ProductOwnershipBadge({ owned })\` and \`ProductPicker({ products, value, onChange, currentUser, ...props })\`.

- [ ] **Step 1: Add failing source-contract assertions for assignment and shared UI**

Add this test to \`react-tests/react-app.test.mjs\`:

\`\`\`js
test("organization ownership is saved and shown through one shared product badge", () => {
  const progress = read("src/features/progress/ProductProgressPage.jsx");
  const modal = read("src/features/archive/ProductModal.jsx");
  const picker = read("src/ui/ProductPicker.jsx");
  const badge = read("src/ui/ProductOwnershipBadge.jsx");
  const packages = read("src/features/packages/PackagePage.jsx");
  const styles = read("src/styles.css");
  assert.match(progress, /productManagerAssignment\\(productManager, orgCache\\)/);
  assert.match(modal, /productManagerAssignment\\(productManager, orgCache\\)/);
  assert.match(picker, /prioritizeOwnedProducts\\(products, currentUser\\)/);
  assert.match(picker, /<ProductOwnershipBadge owned=/);
  assert.match(packages, /currentUser/);
  assert.match(packages, /<ProductPicker[\\s\\S]*currentUser=\\{currentUser\\}/);
  assert.match(badge, />我负责</);
  assert.match(styles, /\\.product-ownership-badge\\s*\\{/);
});
\`\`\`

- [ ] **Step 2: Run the source-contract test and verify it fails because the badge is absent**

Run: \`node --test react-tests/react-app.test.mjs\`

Expected: FAIL in \`organization ownership is saved and shown through one shared product badge\`.

- [ ] **Step 3: Add the shared badge and organization-backed assignment patches**

Create \`src/ui/ProductOwnershipBadge.jsx\`:

\`\`\`jsx
export function ProductOwnershipBadge({ owned }) {
  return owned ? <span className="product-ownership-badge">我负责</span> : null;
}
\`\`\`

In both owner selectors, replace the string-only patch with:

\`\`\`jsx
onChange={productManager => set(productManagerAssignment(productManager, orgCache))}
\`\`\`

for \`ProductModal\`, and:

\`\`\`jsx
onChange={productManager => updateProduct(
  selectedProduct.id,
  productManagerAssignment(productManager, orgCache)
)}
\`\`\`

for \`ProductProgressPage\`.

- [ ] **Step 4: Make the picker stable-sort owned products and show the shared badge**

Update the picker to compute:

\`\`\`jsx
const orderedProducts = useMemo(
  () => prioritizeOwnedProducts(products, currentUser),
  [products, currentUser]
);
const owned = item => isProductOwnedBy(item, currentUser);
\`\`\`

Use \`orderedProducts.map(...)\`, and render the product name as:

\`\`\`jsx
<span className="product-name-line">
  <strong>{item.name}</strong>
  <ProductOwnershipBadge owned={owned(item)} />
</span>
\`\`\`

Render the same \`product-name-line\` in the selected-product button. Pass \`currentUser\` from both \`ProductProgressPage\` and \`PackagePage\`.

- [ ] **Step 5: Add compact, responsive badge styling**

Add to \`src/styles.css\`:

\`\`\`css
.product-name-line { min-width: 0; display: flex; align-items: center; gap: 6px; }
.product-name-line > strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.product-ownership-badge { flex: 0 0 auto; min-height: 20px; display: inline-flex; align-items: center; padding: 0 7px; border-radius: 999px; background: var(--primary-soft); color: var(--primary); font-size: 11px; font-weight: 650; line-height: 1; white-space: nowrap; }
\`\`\`

- [ ] **Step 6: Run the domain and source-contract tests**

Run: \`node --test react-tests/product-ownership.test.mjs react-tests/react-app.test.mjs\`

Expected: all selected tests pass, 0 fail.

- [ ] **Step 7: Commit organization assignment and shared picker UI**

\`\`\`bash
git add src/ui/ProductOwnershipBadge.jsx src/ui/ProductPicker.jsx src/features/progress/ProductProgressPage.jsx src/features/archive/ProductModal.jsx src/features/packages/PackagePage.jsx src/styles.css react-tests/react-app.test.mjs
git commit -m "feat(products): mark owned products"
\`\`\`

### Task 3: Personal default selection without overriding explicit navigation

**Files:**
- Modify: \`src/App.jsx\`
- Modify: \`src/features/progress/ProductProgressPage.jsx\`
- Modify: \`src/features/archive/ProductArchivePage.jsx\`
- Modify: \`react-tests/react-app.test.mjs\`

**Interfaces:**
- Consumes: \`preferredProgressProductId\` from Task 1.
- Produces: \`ProductArchivePage({ onNavigate, onOpenProgress })\`; explicit progress navigation carries \`{ productId, stage, tick }\` through \`focusStage\`.

- [ ] **Step 1: Add failing navigation-contract assertions**

Add to \`react-tests/react-app.test.mjs\`:

\`\`\`js
test("product progress defaults locally but preserves explicit product navigation", () => {
  const app = read("src/App.jsx");
  const progress = read("src/features/progress/ProductProgressPage.jsx");
  const archive = read("src/features/archive/ProductArchivePage.jsx");
  assert.match(app, /setProgressFocus\\(null\\)/);
  assert.match(app, /onOpenProgress=\\{openProgress\\}/);
  assert.match(archive, /onOpenProgress\\?\\.\\(product\\.id\\)/);
  assert.match(progress, /preferredProgressProductId\\(state\\.products, currentUser, focusStage\\?\\.productId\\)/);
  assert.match(progress, /const selectionInitialized = useRef\\(false\\)/);
  assert.match(progress, /const lastFocusTick = useRef\\(0\\)/);
  assert.match(progress, /if \\(loading\\) return/);
  assert.match(progress, /setSelectedProductId\\(productId\\)/);
});
\`\`\`

- [ ] **Step 2: Run the source-contract test and verify the new case fails**

Run: \`node --test react-tests/react-app.test.mjs\`

Expected: FAIL in \`product progress defaults locally but preserves explicit product navigation\`.

- [ ] **Step 3: Separate direct navigation from explicit progress navigation**

In \`App.jsx\`, extract the screen/hash mutation into \`showScreen(nextScreen)\`. Implement direct and explicit entry as:

\`\`\`jsx
function navigate(nextScreen) {
  if (nextScreen === "progress") setProgressFocus(null);
  showScreen(nextScreen);
}

function openProgress(productId, stage) {
  if (productId) setCurrentProduct(productId);
  setProgressFocus({ productId, stage, tick: Date.now() });
  showScreen("progress");
}
\`\`\`

Pass \`onOpenProgress={openProgress}\` to \`ProductArchivePage\`. In the archive card action call \`onOpenProgress?.(product.id)\` instead of setting shared current product and calling generic navigation.

- [ ] **Step 4: Keep progress selection local for the mounted page**

In \`ProductProgressPage\`, wait for shared state loading to finish, then initialize and maintain a local ID. Track the explicit-navigation tick so that the initial explicit product wins without preventing the user from switching afterward:

\`\`\`jsx
const selectionInitialized = useRef(false);
const lastFocusTick = useRef(0);
const [selectedProductId, setSelectedProductId] = useState("");
const selectedProduct = state.products.find(item => item.id === selectedProductId) || state.products[0];

useEffect(() => {
  if (loading) return;
  const hasExplicitFocus = Boolean(
    focusStage?.productId && lastFocusTick.current !== focusStage.tick
  );
  const selectionMissing = !state.products.some(product => product.id === selectedProductId);
  if (!selectionInitialized.current || hasExplicitFocus || selectionMissing) {
    const explicitProductId = hasExplicitFocus ? focusStage.productId : "";
    const preferredId = preferredProgressProductId(state.products, currentUser, explicitProductId);
    setSelectedProductId(preferredId);
    selectionInitialized.current = true;
    if (hasExplicitFocus) lastFocusTick.current = focusStage.tick;
  }
}, [currentUser, focusStage?.productId, focusStage?.tick, loading, selectedProductId, state.products]);
\`\`\`

Update the picker callback to preserve the user's later choice:

\`\`\`jsx
onChange={productId => {
  setSelectedProductId(productId);
  setCurrentProduct(productId);
}}
\`\`\`

When returning a product to the demand pool, the existing state update removes it; the effect above selects a remaining valid product.

- [ ] **Step 5: Run ownership and source-contract tests**

Run: \`node --test react-tests/product-ownership.test.mjs react-tests/react-app.test.mjs\`

Expected: all selected tests pass, 0 fail.

- [ ] **Step 6: Commit progress entry behavior**

\`\`\`bash
git add src/App.jsx src/features/progress/ProductProgressPage.jsx src/features/archive/ProductArchivePage.jsx react-tests/react-app.test.mjs
git commit -m "feat(progress): prefer owned products"
\`\`\`

### Task 4: Product archive and planning ownership labels

**Files:**
- Modify: \`src/features/archive/ProductArchivePage.jsx\`
- Modify: \`src/domain/productPlanning.js\`
- Modify: \`src/features/planning/ProductPlanningPage.jsx\`
- Modify: \`src/features/planning/PlanningDemandTray.jsx\`
- Modify: \`src/features/planning/AnnualPlanningTimeline.jsx\`
- Modify: \`react-tests/product-planning.test.mjs\`
- Modify: \`react-tests/react-app.test.mjs\`

**Interfaces:**
- Consumes: \`isProductOwnedBy\` and \`ProductOwnershipBadge\` from Tasks 1 and 2.
- Produces: planning candidates and snapshots with \`productManager\`, \`productManagerUserId\`, and \`productManagerUnionId\`.

- [ ] **Step 1: Add failing planning identity and page-label tests**

Extend the first candidate test in \`react-tests/product-planning.test.mjs\` with owner fields on \`p-active\`, then assert:

\`\`\`js
assert.equal(candidates[1].productManager, "赵雨涵");
assert.equal(candidates[1].productManagerUserId, "u-zhao");
assert.equal(candidates[1].productManagerUnionId, "union-zhao");
\`\`\`

Add to \`react-tests/react-app.test.mjs\`:

\`\`\`js
test("archive and both planning product surfaces show the shared ownership badge", () => {
  const archive = read("src/features/archive/ProductArchivePage.jsx");
  const page = read("src/features/planning/ProductPlanningPage.jsx");
  const tray = read("src/features/planning/PlanningDemandTray.jsx");
  const timeline = read("src/features/planning/AnnualPlanningTimeline.jsx");
  assert.match(archive, /<ProductOwnershipBadge owned=\\{isProductOwnedBy\\(product, currentUser\\)\\}/);
  assert.match(page, /currentUser=\\{currentUser\\}/g);
  assert.match(tray, /<ProductOwnershipBadge owned=\\{isProductOwnedBy\\(demand, currentUser\\)\\}/);
  assert.match(timeline, /<ProductOwnershipBadge owned=\\{isProductOwnedBy\\(snapshot, currentUser\\)\\}/);
});
\`\`\`

- [ ] **Step 2: Run planning and source-contract tests and verify both new cases fail**

Run: \`node --test react-tests/product-planning.test.mjs react-tests/react-app.test.mjs\`

Expected: FAIL on missing planning ownership fields and missing badge usage.

- [ ] **Step 3: Carry current owner identity through planning candidates and snapshots**

In \`productPlanning.js\`, add:

\`\`\`js
function productManagerIdentity(product = {}) {
  return {
    productManager: cleanText(product.productManager),
    productManagerUserId: cleanText(product.productManagerUserId),
    productManagerUnionId: cleanText(product.productManagerUnionId)
  };
}
\`\`\`

Spread \`productManagerIdentity(product)\` into active-product candidates. Preserve the same three fields inside \`normalizeProductPlans().demandSnapshot\`.

In \`ProductPlanningPage\`, spread the matched product's manager fields into \`enrichPlanningDemand\`, and include them when creating \`demandSnapshot\` in \`savePlan\`.

- [ ] **Step 4: Render the shared badge in archive and planning**

Destructure \`currentUser\` in \`ProductArchivePage\`, render the badge after the product heading, and leave the existing status badge untouched.

Pass \`currentUser\` from \`ProductPlanningPage\` to both planning children. Render:

\`\`\`jsx
<ProductOwnershipBadge owned={isProductOwnedBy(demand, currentUser)} />
\`\`\`

beside names in \`PlanningDemandTray\`, and:

\`\`\`jsx
<ProductOwnershipBadge owned={isProductOwnedBy(snapshot, currentUser)} />
\`\`\`

beside names in \`AnnualPlanningTimeline\`. Wrap each name and ownership badge in \`product-name-line\` so long names truncate before the badge.

- [ ] **Step 5: Run planning, ownership, and source-contract tests**

Run: \`node --test react-tests/product-ownership.test.mjs react-tests/product-planning.test.mjs react-tests/react-app.test.mjs\`

Expected: all selected tests pass, 0 fail.

- [ ] **Step 6: Commit archive and planning labels**

\`\`\`bash
git add src/features/archive/ProductArchivePage.jsx src/domain/productPlanning.js src/features/planning/ProductPlanningPage.jsx src/features/planning/PlanningDemandTray.jsx src/features/planning/AnnualPlanningTimeline.jsx react-tests/product-planning.test.mjs react-tests/react-app.test.mjs
git commit -m "feat(products): label owned product surfaces"
\`\`\`

### Task 5: Full verification and design audit

**Files:**
- Modify only if verification reveals a defect in files already listed above.

**Interfaces:**
- Consumes: completed Tasks 1-4.
- Produces: verified React behavior, production build, and responsive UI acceptance.

- [ ] **Step 1: Run the full React test suite**

Run: \`npm run test:react\`

Expected: exit 0 with 0 failed tests.

- [ ] **Step 2: Run the API regression suite**

Run: \`npm run test:api\`

Expected: exit 0 with 0 failed tests.

- [ ] **Step 3: Build the production bundle**

Run: \`npm run build\`

Expected: exit 0 and Vite reports a completed production build.

- [ ] **Step 4: Audit the requested pages at desktop and narrow widths**

Run the local app at \`127.0.0.1:8132\` and verify at 1440px, 1024px, and a narrow viewport:

\`\`\`text
产品进度：直接进入显示本人第一款产品；明确点开的其他产品不被覆盖。
产品下拉：本人产品稳定置顶，当前区和选项均显示“我负责”。
产品档案：标签不挤压状态标签、操作按钮或产品说明。
产品规划：待规划卡片和年度时间轴均显示标签，长名称正常截断，拖拽和编辑保持可用。
\`\`\`

Expected: no overlap, clipping, horizontal overflow, inconsistent badge styling, or color-only ownership communication.

- [ ] **Step 5: Check the final diff for scope and whitespace defects**

Run: \`git diff --check && git status --short && git diff --stat HEAD~4..HEAD\`

Expected: \`git diff --check\` has no output; only the planned product ownership files and pre-existing untracked workspace items appear.
`,xe=`# Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Remove the known dependency and JavaScript chunk warnings, enforce both in CI, and make \`main\` changes merge only through a passing pull request.

**Architecture:** Keep runtime behavior unchanged while moving heavy modules behind existing route boundaries. Pin Quill to the newest npm release not covered by the current advisory, define one reusable chunk policy for Vite and its regression tests, and make GitHub Actions plus the remote \`main\` ruleset the enforcement boundary.

**Tech Stack:** React 19, Vite 7, Node.js test runner, npm audit, GitHub Actions, GitHub branch protection.

## Global Constraints

- No production JavaScript chunk may exceed 500,000 bytes after minification.
- \`npm audit --audit-level=low\` must report zero vulnerabilities.
- \`main\` must require a pull request, Code Owner review, a current branch, and the \`quality\` status check.
- Existing application routes, permissions, API contracts, and stored data remain unchanged.

---

### Task 1: Dependency security gate

**Files:**
- Modify: \`package.json\`
- Modify: \`package-lock.json\`
- Modify: \`.github/workflows/quality.yml\`
- Modify: \`react-tests/governance-foundation.test.mjs\`

**Interfaces:**
- Consumes: npm advisory metadata for \`quill@2.0.3\`.
- Produces: \`npm run audit:dependencies\`, a zero-vulnerability lockfile, and a required CI audit step.

- [ ] **Step 1: Add a failing governance assertion**

Assert that \`package.json\` exposes \`audit:dependencies\` as \`npm audit --audit-level=low\` and that \`.github/workflows/quality.yml\` invokes it before the test/build gates.

- [ ] **Step 2: Run the focused test and verify RED**

Run: \`node --test react-tests/governance-foundation.test.mjs\`

Expected: FAIL because the script and CI step are absent.

- [ ] **Step 3: Pin the safe dependency and add the audit gate**

Run: \`npm install --save-exact quill@2.0.2\`

Add \`"audit:dependencies": "npm audit --audit-level=low"\` to \`package.json\`, and add \`npm run audit:dependencies\` after \`npm ci\` in the quality workflow.

- [ ] **Step 4: Verify GREEN and the external advisory result**

Run: \`node --test react-tests/governance-foundation.test.mjs\`

Expected: PASS.

Run: \`npm run audit:dependencies\`

Expected: \`found 0 vulnerabilities\`.

- [ ] **Step 5: Commit**

\`\`\`bash
git add package.json package-lock.json .github/workflows/quality.yml react-tests/governance-foundation.test.mjs
git commit -m "fix: enforce dependency security gate"
\`\`\`

### Task 2: Enforced production chunk policy

**Files:**
- Create: \`scripts/build-chunks.mjs\`
- Create: \`scripts/check-build-chunks.mjs\`
- Create: \`react-tests/build-chunks.test.mjs\`
- Modify: \`react-tests/react-app.test.mjs\`
- Modify: \`vite.config.js\`
- Modify: \`package.json\`
- Modify: \`src/App.jsx\`

**Interfaces:**
- Consumes: Rollup module ids and Vite's \`dist/assets\` output.
- Produces: \`manualChunks(id)\`, \`findOversizedChunks(files, limitBytes)\`, route-level lazy imports, and a build command that fails when a JS chunk exceeds 500,000 bytes.

- [ ] **Step 1: Add failing chunk-policy tests**

Test that React runtime modules map to \`react-vendor\`, Markdown parser modules map to \`markdown-vendor\`, ordinary source modules are left to Rollup, and files above 500,000 bytes are reported.

- [ ] **Step 2: Run the focused test and verify RED**

Run: \`node --test react-tests/build-chunks.test.mjs\`

Expected: FAIL because \`scripts/build-chunks.mjs\` does not exist.

- [ ] **Step 3: Implement the minimal shared policy**

Export \`manualChunks(id)\` and \`findOversizedChunks(files, limitBytes)\` from \`scripts/build-chunks.mjs\`. Add a CLI wrapper that reads \`dist/assets\`, reports offending \`.js\` files, and exits non-zero when any exceeds the limit.

- [ ] **Step 4: Wire Vite and route boundaries**

Use \`manualChunks\` in \`vite.config.js\`. Convert page-level imports in \`src/App.jsx\` to \`lazy()\` imports and render the active page inside one shared \`Suspense\` fallback. Keep providers, navigation state, and the issue shortcut eager because they are part of the shell.

- [ ] **Step 5: Verify GREEN and production output**

Run: \`node --test react-tests/build-chunks.test.mjs\`

Expected: PASS.

Run: \`npm run build\`

Expected: build succeeds, Vite emits no 500KB warning, and \`check-build-chunks.mjs\` reports all chunks within policy.

- [ ] **Step 6: Commit**

\`\`\`bash
git add scripts/build-chunks.mjs scripts/check-build-chunks.mjs react-tests/build-chunks.test.mjs react-tests/react-app.test.mjs vite.config.js package.json src/App.jsx
git commit -m "perf: enforce production chunk budget"
\`\`\`

### Task 3: Full quality verification and pull request

**Files:**
- Modify: deployment assets generated by \`npm run release:pages\`

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: a reviewed branch, passing GitHub checks, merged \`main\`, and current Cloudflare assets.

- [ ] **Step 1: Run local quality gates**

Run: \`npm run lint && npm run check:governance && npm run audit:dependencies && npm test && npm run build\`

Expected: all commands exit zero with no dependency or chunk warning.

- [ ] **Step 2: Generate and commit release assets**

Run: \`npm run release:pages\`, stage only generated deployment assets, and commit them as \`build: publish release hardening\`.

- [ ] **Step 3: Push and open a pull request**

Push \`codex/release-hardening\`, open a ready PR to \`main\`, and confirm the \`quality\` workflow passes.

- [ ] **Step 4: Merge and verify deployment**

Merge the PR, wait for \`main\` and Cloudflare Pages to publish, then verify the production HTML and representative lazy chunks return HTTP 200.

### Task 4: Remote main protection

**Files:**
- Verify: \`.github/BRANCH_PROTECTION.md\`

**Interfaces:**
- Consumes: a successful \`quality\` check on the merged branch.
- Produces: a GitHub ruleset or branch-protection rule for \`main\` that cannot be bypassed by normal direct pushes.

- [ ] **Step 1: Configure the remote rule**

Require pull requests, one approval, stale-approval dismissal, Code Owner review, up-to-date branches, and the \`quality\` check. Block force pushes and deletions.

- [ ] **Step 2: Read back and verify the rule**

Confirm the saved rule targets \`main\` and every required switch/check is active. Do not rely only on the local documentation file.

- [ ] **Step 3: Clean temporary local state**

After the merge, remove only \`.worktrees/release-hardening\`, delete the merged local branch, and leave all other user branches/worktrees untouched.
`,Se=`# Repository Governance Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Make repository rules, documentation requirements, quality checks, and pull-request governance enforceable and shared by every development branch.

**Architecture:** Keep durable rules in version-controlled repository files and verify them with one deterministic Node governance checker. Run governance, lint, tests, and production build in GitHub Actions; document the one repository-settings step that cannot be enforced from source alone. This plan establishes the content and governance foundation consumed by the later in-app handbook plan.

**Tech Stack:** JavaScript ES modules, Node 22 test runner, ESLint 9 flat config, npm, GitHub Actions, Markdown, existing Vite 7 and React 19 project.

## Global Constraints

- All repository changes preserve the existing local/Cloudflare/DingTalk runtime boundaries.
- \`AGENTS.md\` is the repository contract; project Skills may reference it but must not duplicate changing business facts.
- Existing uncommitted changes in \`react-tests/react-app.test.mjs\` and \`.worktrees/\` are out of scope and must not be staged or overwritten.
- Existing \`AGENTS.md\` content is preserved and expanded in place.
- No branch-protection setting is changed remotely without explicit confirmation and authenticated GitHub access.
- New governance checks must run offline and produce concise Chinese failure messages.
- CI uses \`npm ci\`, \`npm run lint\`, \`npm run check:governance\`, \`npm test\`, and \`npm run build\`.
- Source files remain JavaScript/JSX; do not introduce a TypeScript migration.

---

### Task 1: Repository contract and documentation templates

**Files:**
- Modify: \`AGENTS.md\`
- Create: \`docs/templates/prd.md\`
- Create: \`docs/templates/design.md\`
- Create: \`docs/templates/plan.md\`
- Create: \`docs/templates/tasks.md\`
- Create: \`docs/templates/adr.md\`
- Create: \`docs/templates/api-contract.md\`
- Create: \`react-tests/governance-foundation.test.mjs\`

**Interfaces:**
- Consumes: Approved design at \`docs/superpowers/specs/2026-07-17-platform-handbook-design.md\`.
- Produces: Stable repository instructions and six reusable document templates required by later governance checks.

- [x] **Step 1: Write failing repository-contract tests**

Create \`react-tests/governance-foundation.test.mjs\` with assertions that:

\`\`\`js
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const read = path => readFileSync(resolve(root, path), "utf8");

test("repository contract defines architecture, workflow, and verification rules", () => {
  const agents = read("AGENTS.md");
  assert.match(agents, /## Architecture boundaries/);
  assert.match(agents, /## Feature workflow/);
  assert.match(agents, /## Definition of done/);
  assert.match(agents, /npm run check:governance/);
  assert.match(agents, /npm test/);
  assert.match(agents, /npm run build/);
});

test("repository provides complete feature and platform templates", () => {
  for (const file of ["prd.md", "design.md", "plan.md", "tasks.md", "adr.md", "api-contract.md"]) {
    assert.equal(existsSync(resolve(root, "docs/templates", file)), true, \`\${file} should exist\`);
  }
  assert.match(read("docs/templates/prd.md"), /## 验收标准/);
  assert.match(read("docs/templates/design.md"), /## 页面状态/);
  assert.match(read("docs/templates/api-contract.md"), /## 兼容与废弃/);
});
\`\`\`

- [x] **Step 2: Run the test and verify missing-template failures**

Run: \`node --test react-tests/governance-foundation.test.mjs\`

Expected: FAIL because \`docs/templates/prd.md\` does not exist and \`AGENTS.md\` lacks the required sections.

- [x] **Step 3: Expand \`AGENTS.md\` into the repository contract**

Preserve the imported heading and add exact sections covering:

\`\`\`markdown
## Architecture boundaries

- \`src/domain\`: pure business rules; no React, browser globals, or network requests.
- \`src/ui\`: business-neutral reusable UI components.
- \`src/features\`: page and feature composition; reuse domain, state, and UI boundaries.
- \`src/state\`: application orchestration and API clients; no visual component definitions.
- \`functions/api\`: authenticated server routes and provider adapters; reuse shared middleware.
- \`docs\`: product, design, platform, feature, and decision sources of truth.

Dependency direction: \`features -> ui/domain/state\`, \`state -> API clients\`, \`functions/api routes -> shared middleware/provider adapters\`. Features must not call DingTalk, Kuaimai, ERP, or other external systems directly.

## Feature workflow

Medium or larger work requires \`docs/features/<feature>/prd.md\`, \`design.md\`, \`plan.md\`, and \`tasks.md\`. Write or update failing tests before implementation, make one coherent change at a time, and update durable product/design/platform documentation when rules change.

## Definition of done

Run \`npm run lint\`, \`npm run check:governance\`, \`npm test\`, and \`npm run build\`. UI work also requires keyboard, laptop-width, responsive, and DingTalk WebView review. Local preview, Cloudflare deployment, and DingTalk acceptance are separate verification boundaries.
\`\`\`

Also document: no direct pushes as the intended GitHub policy, no secrets in docs, API contract/version requirements, data migration/rollback requirements, and the rule that existing user changes are never overwritten.

- [x] **Step 4: Create the six concrete templates**

Each template must contain actionable Chinese headings and no unfinished-marker words:

- \`prd.md\`: status, background, goal, non-goals, users/permissions, current flow, target flow, business rules, data definitions, edge cases, acceptance criteria, rollout/rollback.
- \`design.md\`: user task, information hierarchy, layout, interaction flow, component reuse, new components, loading/empty/error/no-permission/disabled/success states, responsive, DingTalk WebView, copy, accessibility, visual acceptance.
- \`plan.md\`: architecture, files, interfaces, migrations, risk, rollback, verification, task order.
- \`tasks.md\`: dependency-ordered checkboxes with exact verification and commit boundary fields.
- \`adr.md\`: status, context, decision, alternatives, consequences, compatibility, superseded decisions.
- \`api-contract.md\`: owner, consumers, method/path/version, auth/permissions, request, response, error codes, idempotency, pagination, timeout/retry/rate limit, observability, compatibility/deprecation, contract tests.

- [x] **Step 5: Run the repository-contract test**

Run: \`node --test react-tests/governance-foundation.test.mjs\`

Expected: 2 tests pass, 0 fail.

- [x] **Step 6: Commit repository rules and templates**

\`\`\`bash
git add AGENTS.md docs/templates react-tests/governance-foundation.test.mjs
git commit -m "docs: establish repository governance contract"
\`\`\`

### Task 2: Product, handbook, and platform source documents

**Files:**
- Create: \`docs/handbook/getting-started.md\`
- Create: \`docs/handbook/company-platform.md\`
- Create: \`docs/handbook/product-lifecycle.md\`
- Create: \`docs/handbook/faq.md\`
- Create: \`docs/product/core-workflows.md\`
- Create: \`docs/product/roles-and-permissions.md\`
- Create: \`docs/product/data-definitions.md\`
- Create: \`docs/platform/architecture.md\`
- Create: \`docs/platform/components.md\`
- Create: \`docs/platform/middleware.md\`
- Create: \`docs/platform/api-catalog.md\`
- Create: \`docs/platform/integrations.md\`
- Create: \`docs/platform/error-codes.md\`
- Modify: \`react-tests/governance-foundation.test.mjs\`

**Interfaces:**
- Consumes: Existing \`PRODUCT.md\`, \`DESIGN.md\`, \`src/App.jsx\`, \`src/domain/permissions.js\`, \`src/ui\`, \`functions/api\`, and the approved design.
- Produces: Versioned Markdown sources that the later handbook UI imports explicitly.

- [x] **Step 1: Add failing source-document assertions**

Extend the governance test with:

\`\`\`js
test("handbook, product, and platform source documents are present", () => {
  const required = [
    "docs/handbook/getting-started.md",
    "docs/handbook/company-platform.md",
    "docs/handbook/product-lifecycle.md",
    "docs/handbook/faq.md",
    "docs/product/core-workflows.md",
    "docs/product/roles-and-permissions.md",
    "docs/product/data-definitions.md",
    "docs/platform/architecture.md",
    "docs/platform/components.md",
    "docs/platform/middleware.md",
    "docs/platform/api-catalog.md",
    "docs/platform/integrations.md",
    "docs/platform/error-codes.md"
  ];
  for (const file of required) assert.equal(existsSync(resolve(root, file)), true, \`\${file} should exist\`);
  assert.match(read("docs/platform/architecture.md"), /src\\/domain/);
  assert.match(read("docs/platform/api-catalog.md"), /\\/api\\/state/);
  assert.match(read("docs/handbook/getting-started.md"), /登录/);
});
\`\`\`

- [x] **Step 2: Run the focused test and verify missing-document failures**

Run: \`node --test react-tests/governance-foundation.test.mjs\`

Expected: FAIL in \`handbook, product, and platform source documents are present\`.

- [x] **Step 3: Write the four employee handbook documents**

Use clear employee-facing language:

- \`getting-started.md\`: what the platform is, login behavior, left navigation, account/organization identity, where to report a problem.
- \`company-platform.md\`: company home, strategy, key projects, department incentives, operating reviews, business Apps; explain that visible scope follows organization permissions.
- \`product-lifecycle.md\`: dashboard, demand pool, planning, progress, archive; explain demand-to-product entry and current-stage task behavior.
- \`faq.md\`: missing navigation, stale data, no edit permission, DingTalk login, failed save, external integration delay, and issue reporting.

Each file begins with one H1 and a short summary paragraph; avoid internal implementation jargon.

- [x] **Step 4: Write the three durable product documents**

- \`core-workflows.md\`: demand collection -> review/discussion -> planning -> development stages -> launch -> archive/review, including stage gates and deliverables.
- \`roles-and-permissions.md\`: 总经办, 产品部, operations/brand/supply chain/customer service/finance responsibilities, navigation visibility, view/edit distinction.
- \`data-definitions.md\`: demand, product, product manager, stage, task, deliverable, expected launch month, sales reporting time dimension, and the default exclusion of \`其它\` from normal channel analysis.

- [x] **Step 5: Write the six platform documents from current code**

- \`architecture.md\`: current React/domain/state/Cloudflare Functions/D1/external-provider flow and dependency direction.
- \`components.md\`: inventory \`Button\`, \`IconAction\`, \`Modal\`, \`ConfirmDialog\`, \`DataTable\`, \`HeaderFilter\`, \`DatePickerField\`, \`ProductPicker\`, \`OrgSelect\`, and \`RichTextEditor\`; record states and reuse rules.
- \`middleware.md\`: inventory \`functions/api/_middleware.js\`, auth/session shared code, DingTalk shared adapter, Kuaimai shared adapter, and expected cross-cutting responsibilities.
- \`api-catalog.md\`: record current \`/api/state\`, \`/api/platform\`, \`/api/sales\`, \`/api/kuaimai/*\`, \`/api/auth/*\`, and \`/api/dingtalk/*\` families as internal interfaces; reserve \`/api/platform/v1/*\` for future multi-system contracts.
- \`integrations.md\`: DingTalk, Kuaimai, ERP/sales imports, Cloudflare Pages/D1 boundaries and failure ownership.
- \`error-codes.md\`: define the common envelope \`{ error: { code, message, requestId, retryable } }\`, code prefixes \`AUTH_\`, \`PERMISSION_\`, \`VALIDATION_\`, \`STATE_\`, \`DINGTALK_\`, \`KUAIMAI_\`, \`INTERNAL_\`, and the rule that existing endpoints migrate incrementally.

- [x] **Step 6: Run the focused governance test**

Run: \`node --test react-tests/governance-foundation.test.mjs\`

Expected: 3 tests pass, 0 fail.

- [x] **Step 7: Commit the documentation source foundation**

\`\`\`bash
git add docs/handbook docs/product docs/platform react-tests/governance-foundation.test.mjs
git commit -m "docs: add handbook and platform sources"
\`\`\`

### Task 3: Deterministic governance checker

**Files:**
- Create: \`scripts/check-project-governance.mjs\`
- Modify: \`package.json\`
- Modify: \`react-tests/governance-foundation.test.mjs\`

**Interfaces:**
- Consumes: Required repository contract and document paths from Tasks 1-2.
- Produces: \`checkProjectGovernance(rootDir)\` returning \`{ errors: string[] }\`; CLI exits 1 when errors exist and 0 otherwise; npm command \`check:governance\`.

- [x] **Step 1: Add failing checker tests**

Extend the test file:

\`\`\`js
test("governance checker accepts the repository and rejects incomplete feature docs", async () => {
  const { checkProjectGovernance } = await import("../scripts/check-project-governance.mjs");
  assert.deepEqual(checkProjectGovernance(root).errors, []);

  const fixture = resolve(root, ".tmp-governance-fixture");
  const required = [
    "AGENTS.md", "PRODUCT.md", "DESIGN.md",
    "docs/templates/prd.md", "docs/templates/design.md", "docs/templates/plan.md",
    "docs/templates/tasks.md", "docs/templates/adr.md", "docs/templates/api-contract.md",
    "docs/platform/architecture.md", "docs/platform/components.md", "docs/platform/middleware.md",
    "docs/platform/api-catalog.md", "docs/platform/integrations.md", "docs/platform/error-codes.md"
  ];
  try {
    for (const file of required) {
      mkdirSync(dirname(resolve(fixture, file)), { recursive: true });
      writeFileSync(resolve(fixture, file), "# Fixture\\n");
    }
    mkdirSync(resolve(fixture, "docs/features/sample"), { recursive: true });
    writeFileSync(resolve(fixture, "docs/features/sample/prd.md"), "# Sample\\n");
    const result = checkProjectGovernance(fixture);
    assert.ok(result.errors.some(error => error.includes("docs/features/sample/design.md")));
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
\`\`\`

Add \`mkdirSync\`, \`writeFileSync\`, and \`rmSync\` to the existing \`node:fs\` import, and add \`dirname\` to the existing \`node:path\` import.

- [x] **Step 2: Run the test and verify the missing-module failure**

Run: \`node --test react-tests/governance-foundation.test.mjs\`

Expected: FAIL with \`ERR_MODULE_NOT_FOUND\` for \`scripts/check-project-governance.mjs\`.

- [x] **Step 3: Implement the offline governance checker**

Implement:

\`\`\`js
export const REQUIRED_REPOSITORY_FILES = [
  "AGENTS.md",
  "PRODUCT.md",
  "DESIGN.md",
  "docs/templates/prd.md",
  "docs/templates/design.md",
  "docs/templates/plan.md",
  "docs/templates/tasks.md",
  "docs/templates/adr.md",
  "docs/templates/api-contract.md",
  "docs/platform/architecture.md",
  "docs/platform/components.md",
  "docs/platform/middleware.md",
  "docs/platform/api-catalog.md",
  "docs/platform/integrations.md",
  "docs/platform/error-codes.md"
];

export function checkProjectGovernance(rootDir) {
  const errors = [];
  // Verify required files.
  // For every direct child under docs/features, require prd.md, design.md,
  // plan.md, and tasks.md.
  // Reject document source files containing unfinished-marker words.
  return { errors };
}
\`\`\`

The CLI path prints \`治理检查通过。\` on success. On failure it prints \`治理检查失败：\` followed by one \`- <message>\` line per error and sets \`process.exitCode = 1\`.

- [x] **Step 4: Add the npm command**

Add to \`package.json\` scripts:

\`\`\`json
"check:governance": "node scripts/check-project-governance.mjs"
\`\`\`

- [x] **Step 5: Run the focused test and CLI**

Run: \`node --test react-tests/governance-foundation.test.mjs && npm run check:governance\`

Expected: all focused tests pass, then output contains \`治理检查通过。\`.

- [x] **Step 6: Commit the governance checker**

\`\`\`bash
git add scripts/check-project-governance.mjs package.json react-tests/governance-foundation.test.mjs
git commit -m "chore: enforce repository governance"
\`\`\`

### Task 4: Baseline lint gate

**Files:**
- Create: \`eslint.config.js\`
- Modify: \`package.json\`
- Modify: \`package-lock.json\`
- Modify: \`react-tests/governance-foundation.test.mjs\`

**Interfaces:**
- Consumes: JavaScript/JSX source tree.
- Produces: \`npm run lint\` covering \`src\`, \`functions\`, \`server\`, \`scripts\`, \`tests\`, and \`react-tests\` while ignoring generated assets, build output, and \`.worktrees\`.

- [x] **Step 1: Add failing lint-contract assertions**

\`\`\`js
test("package exposes the repository lint gate", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts.lint, "eslint src functions server scripts tests react-tests");
  assert.ok(pkg.devDependencies.eslint);
  assert.match(read("eslint.config.js"), /\\.worktrees/);
  assert.match(read("eslint.config.js"), /no-unreachable/);
});
\`\`\`

- [x] **Step 2: Run the focused test and verify it fails**

Run: \`node --test react-tests/governance-foundation.test.mjs\`

Expected: FAIL because \`pkg.scripts.lint\` is absent.

- [x] **Step 3: Install ESLint and add a conservative flat config**

Run: \`npm install --save-dev eslint@^9.0.0\`

Create \`eslint.config.js\`:

\`\`\`js
export default [
  {
    ignores: ["assets/**", "dist/**", ".worktrees/**", "node_modules/**"]
  },
  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    rules: {
      "no-constant-binary-expression": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-self-assign": "error",
      "no-unreachable": "error",
      "no-unsafe-finally": "error",
      "valid-typeof": "error"
    }
  }
];
\`\`\`

Add \`"lint": "eslint src functions server scripts tests react-tests"\` to package scripts. This first gate intentionally targets syntax and high-confidence correctness defects; stricter style and unused-variable rules require a separate baseline cleanup.

- [x] **Step 4: Run lint and the contract test**

Run: \`npm run lint && node --test react-tests/governance-foundation.test.mjs\`

Expected: ESLint exits 0 and all governance tests pass.

- [x] **Step 5: Commit the lint gate**

\`\`\`bash
git add eslint.config.js package.json package-lock.json react-tests/governance-foundation.test.mjs
git commit -m "chore: add baseline lint gate"
\`\`\`

### Task 5: Pull-request and CI governance

**Files:**
- Create: \`.github/workflows/quality.yml\`
- Create: \`.github/pull_request_template.md\`
- Create: \`.github/CODEOWNERS\`
- Create: \`.github/BRANCH_PROTECTION.md\`
- Modify: \`react-tests/governance-foundation.test.mjs\`

**Interfaces:**
- Consumes: npm scripts from Tasks 3-4.
- Produces: GitHub Actions job \`quality\`, PR checklist, ownership review rules, and exact branch-protection configuration instructions.

- [x] **Step 1: Add failing CI-governance assertions**

\`\`\`js
test("pull requests run required repository quality gates", () => {
  const workflow = read(".github/workflows/quality.yml");
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run lint/);
  assert.match(workflow, /npm run check:governance/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run build/);
  assert.match(read(".github/pull_request_template.md"), /PRD/);
  assert.match(read(".github/CODEOWNERS"), /AGENTS\\.md/);
  assert.match(read(".github/BRANCH_PROTECTION.md"), /Require branches to be up to date/);
});
\`\`\`

- [x] **Step 2: Run the focused test and verify missing-file failures**

Run: \`node --test react-tests/governance-foundation.test.mjs\`

Expected: FAIL because \`.github/workflows/quality.yml\` does not exist.

- [x] **Step 3: Create the GitHub Actions workflow**

Use Node 22 and npm cache:

\`\`\`yaml
name: quality

on:
  pull_request:
  push:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run check:governance
      - run: npm test
      - run: npm run build
\`\`\`

- [x] **Step 4: Create PR, ownership, and branch-protection rules**

- PR template requires: purpose, linked PRD/design/ADR or explicit small-change exemption, screenshots for UI changes, test/build results, API/data compatibility, rollback, documentation update.
- \`CODEOWNERS\` assigns \`AGENTS.md\`, \`.github/\`, \`docs/platform/\`, \`docs/templates/\`, \`functions/api/_middleware.js\`, \`functions/api/auth/\`, and schema/migration files to \`@489688547\`, matching the configured origin owner.
- \`BRANCH_PROTECTION.md\` specifies: protect \`main\`, require PR, require \`quality\`, require branches up to date, dismiss stale approvals, block force pushes and deletions. Note that a repository administrator must enable these settings after authenticating GitHub.

- [x] **Step 5: Run focused governance tests and all local gates**

Run: \`node --test react-tests/governance-foundation.test.mjs && npm run lint && npm run check:governance\`

Expected: all commands exit 0.

- [x] **Step 6: Commit CI and PR governance**

\`\`\`bash
git add .github react-tests/governance-foundation.test.mjs
git commit -m "ci: require repository quality gates"
\`\`\`

### Task 6: Full phase-one verification

**Files:**
- Modify only if verification exposes a defect in files created by Tasks 1-5.

**Interfaces:**
- Consumes: All phase-one governance deliverables.
- Produces: Evidence that the current application still passes its complete local acceptance suite.

- [x] **Step 1: Run the complete test suite**

Run: \`npm test\`

Expected: all React and API tests pass, 0 fail.

- [x] **Step 2: Run production build**

Run: \`npm run build\`

Expected: Vite build exits 0 and emits production assets.

- [x] **Step 3: Re-run the enforced gates exactly as CI will**

Run: \`npm run lint && npm run check:governance && npm test && npm run build\`

Expected: all commands exit 0.

- [x] **Step 4: Inspect the scoped diff and dirty worktree**

Run: \`git status --short && git diff --check && git log -6 --oneline\`

Expected: no whitespace errors; unrelated existing modifications remain unstaged and are not included in the task commits.

- [x] **Step 5: Record the external GitHub setting still required**

If \`gh auth status\` is not authenticated, do not change repository settings. Report that source-level governance is complete but GitHub branch protection must be enabled after authentication and explicit confirmation.
`,je=`# 权限与功能设置设计

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
`,Pe=`# 任务类别与责任部门交互设计

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
`,Te=`# 产品进度默认任务配置设计

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
`,Ie=`# 首页部门待办设计

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

`,Ae=`# 需求池创建时间修复设计

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
`,Re=`# 钉钉网页登录与统一会话设计

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
`,De=`# 平台销售表排序设计

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
`,Ce=`# 产品规划设计

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
`,Ee=`# 产品进度排期摘要设计

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
`,_e=`# 公司战略执行平台设计

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
`,Me=`# 总经办个人待办与钉钉双向同步设计

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
`,Ue=`# 公司战略、部门承诺、激励项目与月度汇报设计

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

`,Oe=`# 钉钉群聊执行人选择设计

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
`,qe=`# 产品规划卡片跳转产品进度设计

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
`,Fe=`# 公司级平台能力与说明书中心设计

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
`,Le=`# 产品负责人识别与“我负责”标识设计

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
`,Ne=`# Product

## Register

product

## Users

公司内部管理层、产品、运营、品牌、供应链、客服和财务同事，主要在钉钉工作台内协作。

## Product Purpose

让需求、产品阶段、跨部门任务、交付物和复盘在一个可执行系统中流转，并由组织架构权限控制可见与可编辑范围。

## Brand Personality

专业、克制、高效。

## Anti-references

- 不做厚重传统后台、营销页或装饰性仪表盘。
- 不使用嵌套卡片、花哨渐变和不一致的控件。

## Design Principles

1. 任务优先，权限自然表达。
2. 信息密度高但保持稳定行高和间距。
3. 组件和交互状态统一。
4. 钉钉内嵌环境优先保证可靠性。

## Accessibility & Inclusion

以 WCAG AA 为目标，交互不依赖颜色单独表达，保留焦点和禁用状态。
`,Ge=`# Design

## Style Direction

浅色、克制的产品工作台，参考 Linear、Apple 系统应用和成熟钉钉工作台应用。

设计执行以 \`frontend-design-principles\`、\`impeccable\` 和 \`web-design-guidelines\` 为主，不使用偏营销展示的 \`high-end-visual-design\`。

## Typography

使用系统字体。页面标题 24px，区块标题 15-16px，正文和表格 13px，辅助文字 12px。

## Layout

固定左侧导航和响应式主工作区。间距使用 4px 基础网格，常用间距为 8px 和 12px。表格保持表头单行、稳定列宽和水平滚动；设置页使用无嵌套卡片的矩阵结构。

## Components

- 主操作使用蓝色，普通操作使用中性按钮，危险操作只用于不可逆动作。
- 权限范围使用组织架构下拉多选，不使用自由文本录入。
- 所有下拉通过浮层渲染，避免被表格和面板裁切。
- 加载、错误、禁用、选中状态必须清楚且一致。

## Embedded DingTalk Webview

避免大请求使用 \`keepalive\`；错误提示使用明确中文。布局使用动态视口高度并适配安全区。
`,h="handbook/getting-started",ze=Object.assign({"../../../docs/handbook/company-platform.md":B,"../../../docs/handbook/faq.md":K,"../../../docs/handbook/getting-started.md":V,"../../../docs/handbook/product-lifecycle.md":H,"../../../docs/platform/api-catalog.md":W,"../../../docs/platform/architecture.md":Y,"../../../docs/platform/components.md":Q,"../../../docs/platform/error-codes.md":J,"../../../docs/platform/integrations.md":X,"../../../docs/platform/middleware.md":$,"../../../docs/product/core-workflows.md":Z,"../../../docs/product/data-definitions.md":ee,"../../../docs/product/roles-and-permissions.md":ne,"../../../docs/superpowers/plans/2026-07-11-permission-settings.md":te,"../../../docs/superpowers/plans/2026-07-11-task-category-actions.md":se,"../../../docs/superpowers/plans/2026-07-11-workflow-task-templates.md":ae,"../../../docs/superpowers/plans/2026-07-13-dashboard-department-todos.md":oe,"../../../docs/superpowers/plans/2026-07-13-demand-created-at.md":re,"../../../docs/superpowers/plans/2026-07-13-dingtalk-web-login.md":ie,"../../../docs/superpowers/plans/2026-07-13-platform-sales-sorting.md":de,"../../../docs/superpowers/plans/2026-07-15-product-planning.md":ce,"../../../docs/superpowers/plans/2026-07-15-product-progress-schedule-plan.md":le,"../../../docs/superpowers/plans/2026-07-16-executive-personal-todo-dingtalk-sync.md":pe,"../../../docs/superpowers/plans/2026-07-16-product-gmv-progress.md":ue,"../../../docs/superpowers/plans/2026-07-16-strategy-commitments-incentives-reports.md":me,"../../../docs/superpowers/plans/2026-07-16-strategy-platform-phase-1.md":ge,"../../../docs/superpowers/plans/2026-07-16-strategy-platform-phase-2.md":he,"../../../docs/superpowers/plans/2026-07-16-strategy-platform-phase-3.md":fe,"../../../docs/superpowers/plans/2026-07-16-strategy-platform-phase-4.md":ye,"../../../docs/superpowers/plans/2026-07-17-dingtalk-group-executor-selection.md":ke,"../../../docs/superpowers/plans/2026-07-17-in-app-handbook.md":be,"../../../docs/superpowers/plans/2026-07-17-planning-card-progress-navigation.md":ve,"../../../docs/superpowers/plans/2026-07-17-product-ownership-visibility.md":we,"../../../docs/superpowers/plans/2026-07-17-release-hardening.md":xe,"../../../docs/superpowers/plans/2026-07-17-repository-governance-foundation.md":Se,"../../../docs/superpowers/specs/2026-07-11-permission-settings-design.md":je,"../../../docs/superpowers/specs/2026-07-11-task-category-actions-design.md":Pe,"../../../docs/superpowers/specs/2026-07-11-workflow-task-templates-design.md":Te,"../../../docs/superpowers/specs/2026-07-13-dashboard-department-todos-design.md":Ie,"../../../docs/superpowers/specs/2026-07-13-demand-created-at-design.md":Ae,"../../../docs/superpowers/specs/2026-07-13-dingtalk-web-login-design.md":Re,"../../../docs/superpowers/specs/2026-07-13-platform-sales-sorting-design.md":De,"../../../docs/superpowers/specs/2026-07-15-product-planning-design.md":Ce,"../../../docs/superpowers/specs/2026-07-15-product-progress-schedule-design.md":Ee,"../../../docs/superpowers/specs/2026-07-16-company-strategy-execution-platform-design.md":_e,"../../../docs/superpowers/specs/2026-07-16-executive-personal-todo-dingtalk-sync-design.md":Me,"../../../docs/superpowers/specs/2026-07-16-strategy-department-incentive-monthly-report-design.md":Ue,"../../../docs/superpowers/specs/2026-07-17-dingtalk-group-executor-selection-design.md":Oe,"../../../docs/superpowers/specs/2026-07-17-planning-card-progress-navigation-design.md":qe,"../../../docs/superpowers/specs/2026-07-17-platform-handbook-design.md":Fe,"../../../docs/superpowers/specs/2026-07-17-product-ownership-visibility-design.md":Le}),v={handbook:0,product:1,platform:2},w={guide:0,product:0,design:1,specification:2,plan:3,platform:0},f="2026-07-17",P=e=>e.split("/").pop().replace(/\.md$/,""),Be=e=>e.match(/^(\d{4}-\d{2}-\d{2})-/)?.[1]??f,Ke=e=>{const n=P(e);return e.includes("/docs/handbook/")?{slug:`handbook/${n}`,category:"handbook",kind:"guide"}:e.includes("/docs/product/")?{slug:`product/${n}`,category:"product",kind:"product"}:e.includes("/docs/platform/")?{slug:`platform/${n}`,category:"platform",kind:"platform"}:e.includes("/docs/superpowers/specs/")?{slug:`product/specs/${n}`,category:"product",kind:"specification"}:{slug:`product/plans/${n}`,category:"product",kind:"plan"}},Ve=Object.entries(ze).map(([e,n])=>{const s=Ke(e);return g({...s,updatedAt:Be(P(e)),content:n})}),He=[g({slug:"product/product",category:"product",kind:"product",updatedAt:f,content:Ne}),g({slug:"product/design",category:"product",kind:"design",updatedAt:f,content:Ge})],x=[...Ve,...He].sort((e,n)=>(e.slug===h?-1:n.slug===h?1:0)||v[e.category]-v[n.category]||w[e.kind]-w[n.kind]||e.title.localeCompare(n.title,"zh-CN")),We=Object.fromEntries(j.filter(e=>e.id!=="all").map(e=>[e.id,e.label])),S={guide:"使用说明",product:"产品说明",design:"设计书",specification:"设计规格",plan:"实施计划",platform:"平台能力"},Ye=e=>Object.entries(We).map(([n,s])=>({category:n,label:s,documents:e.filter(a=>a.category===n)})).filter(n=>n.documents.length);function Ze({selectedSlug:e,onSelectDocument:n}){const[s,a]=l.useState(""),[r,c]=l.useState("all"),i=F(x,e,h),u=l.useMemo(()=>q(x,{query:s,category:r}),[r,s]),T=l.useMemo(()=>Ye(u),[u]),k=l.useMemo(()=>L(i?.content),[i]),I=(o,d)=>{o.preventDefault(),document.getElementById(d)?.scrollIntoView({behavior:"smooth",block:"start"})};return t.jsxs("section",{className:"page handbook-page",children:[t.jsx(E,{title:"说明书",description:"公司的工作方法、产品定义、设计决策与共享平台能力，以仓库文档为准。"}),t.jsxs("div",{className:"handbook-tools",role:"search",children:[t.jsxs("label",{className:"handbook-search",children:[t.jsx(_,{size:16,"aria-hidden":"true"}),t.jsx("span",{className:"sr-only",children:"搜索说明书"}),t.jsx("input",{type:"search",value:s,onChange:o=>a(o.target.value),placeholder:"搜索说明书"}),s?t.jsx("button",{type:"button","aria-label":"清除搜索",onClick:()=>a(""),children:t.jsx(M,{size:15,"aria-hidden":"true"})}):null]}),t.jsx("div",{className:"handbook-filters","aria-label":"说明书分类",children:j.map(o=>t.jsx("button",{type:"button",className:r===o.id?"active":"","aria-pressed":r===o.id,onClick:()=>c(o.id),children:o.label},o.id))})]}),u.length&&i?t.jsxs("div",{className:"handbook-workspace",children:[t.jsx("nav",{className:"handbook-catalog","aria-label":"说明书目录",children:T.map(o=>t.jsxs("section",{className:"handbook-catalog-group",children:[t.jsx("h2",{children:o.label}),t.jsx("div",{className:"handbook-document-list",children:o.documents.map(d=>t.jsxs("button",{type:"button",className:i.slug===d.slug?"active":"","aria-current":i.slug===d.slug?"page":void 0,onClick:()=>n?.(d.slug),children:[t.jsx("strong",{children:d.title}),t.jsx("small",{children:S[d.kind]??d.kind})]},d.slug))})]},o.category))}),t.jsxs("article",{className:"handbook-article",children:[t.jsxs("header",{className:"handbook-document-header",children:[t.jsxs("div",{className:"handbook-document-kind",children:[t.jsx(b,{size:15,"aria-hidden":"true"}),S[i.kind]??i.kind]}),t.jsx("h1",{children:i.title}),t.jsx("p",{children:i.summary}),t.jsxs("time",{dateTime:i.updatedAt,children:["更新于 ",i.updatedAt]})]}),t.jsx(z,{content:N(i.content)})]}),t.jsxs("aside",{className:"handbook-toc","aria-label":"本页目录",children:[t.jsx("strong",{children:"本页目录"}),k.length?t.jsx("ol",{children:k.map(o=>t.jsx("li",{className:`level-${o.level}`,children:t.jsx("a",{href:`#${o.id}`,onClick:d=>I(d,o.id),children:o.title})},`${o.id}-${o.level}`))}):t.jsx("small",{children:"本页没有分节标题"})]})]}):t.jsxs("div",{className:"handbook-empty",children:[t.jsx(b,{size:24,"aria-hidden":"true"}),t.jsx("strong",{children:"没有找到匹配的说明"}),t.jsx("span",{children:"换一个关键词，或选择“全部”查看现有文档。"}),t.jsx("button",{type:"button",className:"btn",onClick:()=>{a(""),c("all")},children:"查看全部说明"})]})]})}export{Ze as default};
