# 公司数据采集器（Chrome MV3）

## 当前范围

- 复用公司日常 Chrome 中已经建立的快麦登录态。
- 每分钟向 `127.0.0.1:17653` 的本机执行器领取一次安全任务。
- 当前已登记快麦 `orders`、`order_items`、`sales_items`、`products`、`product_kits` 与 `product_combinations`。订单页资源按“下单时间”，销售主题明细按“创建时间”，统一采集昨天的上海时区完整自然日；商品三类资源是当前快照。
- 点击快麦官方“导出订单”“导出订单明细”或《销售主题分析-按订单商品明细》的导出按钮，通过 Downloads API 只把下载 ID 和文件名交给本机执行器。
- 商品刷新从固定商品档案页依次导出普通商品、套件和组合装，确认 XLS 格式、官方字段和生成提示后，从下载中心领取本次任务文件；三个资源全部入库才算一次完整刷新。
- 本机解析后会再次核对文件最早/最晚业务日期；与任务日期不一致时记录 `WEB_COLLECTION_BUSINESS_DATE_MISMATCH`，不入库、不推进游标。

尚未在真实页面完成三类商品导出与 D1 入库验收前，不得把快麦商品标为已接通；库存、采购等未验收资源同理。

## 本地安装

1. 先由数据中心管理员登记本机 runner：`npm run collect:web -- register --base-url <线上地址>`。
2. 打开 Chrome `chrome://extensions`，开启“开发者模式”。
3. 点击“加载已解压的扩展程序”，只选择主检出仓库的
   `/Users/roger/Documents/product-flow-system/chrome-extension/company-data-collector`。
   不得从 `.worktrees/*` 临时工作树加载；临时分支被清理后 Chrome 会报 `ERR_FILE_NOT_FOUND`。
4. 点击扩展图标，输入登记命令本次返回的 `wcp_...` 配对码。
5. 运行 `npm run collect:web -- install --base-url <线上地址>` 安装并启动 LaunchAgent。
6. 运行 `npm run collect:web -- preflight --base-url <线上地址>` 检查扩展目录、Keychain、下载目录和归档目录。

仓库内插件代码更新后，必须在 `chrome://extensions` 对“公司数据采集器”点击“重新加载”；Pages 部署不会自动更新本机未打包插件。

若旧扩展已经因临时目录删除而显示 `ERR_FILE_NOT_FOUND`，在 `chrome://extensions`
移除损坏条目，再从上述主检出仓库目录重新“加载已解压的扩展程序”；不要通过重建临时目录掩盖错误。

首期不需要发布 Chrome 应用商店。若后续要在多台公司电脑统一安装，再评估私有商店发布或企业策略强制安装。

## 安全边界

- 插件不申请 Cookie、History、WebRequest、Debugger 或 Native Messaging 权限。
- 不读取、上传或记录密码、Cookie、Token、验证码、完整页面、截图或网络响应。
- D1 和本机任务都不能下发任意 URL、选择器或 JavaScript；页面动作固定打包在扩展代码中。
- 本机桥接只监听 loopback，固定扩展 ID，并要求随机配对码；远端 runner token 只存在 macOS Keychain。
