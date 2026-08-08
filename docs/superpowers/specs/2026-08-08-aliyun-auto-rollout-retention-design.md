# 阿里云 ACR 自动发布与本地备份单份保留设计

## 背景

生产代码通过 `dev → main` 合并后，阿里云 ACR 已能自动构建 `main` 镜像，但 ECS
不会自动拉取和重建生产容器。发布冒烟因此会看到 GitHub 与 ACR 已更新、生产域名仍返回
旧提交。与此同时，ECS 每次 SQLite 备份都会保留一份本地目录；历史快照已经明显占用
40 GiB 系统盘。

本设计延续现有生产边界：React、Node/Hono API 和在线 SQLite 均在杭州 ECS；OSS 只保存
私有备份；Cloudflare 只承载测试静态前端。它不引入新的公网管理入口、GitHub 高权限
Secret、数据库表或业务 API。

## 已确认目标

1. ECS 每两个自然分钟检查一次 ACR 的 `main` 镜像。
2. 相同镜像不备份、不重启容器，也不制造重复日志噪声。
3. 新镜像发布前，两个在线 SQLite 必须生成一致性快照并成功上传私有 OSS。
4. OSS 上传成功后，ECS 本地备份目录只保留刚生成的最新一份；历史快照继续保留在 OSS。
5. 新容器未进入 `healthy` 时自动恢复上一镜像，并保证测试容器恢复运行。
6. 部署合同发生变化时自动发布失败关闭，等待人工更新宿主机合同。

## 非目标

- 不改动 `dev → main` 的 GitOps 分支流向。
- 不让 GitHub Actions 持有阿里云 AccessKey、ECS 密码或云助手权限。
- 不增加 ACR Webhook 公网回调入口。
- 不自动执行数据库迁移、环境变量变更、Compose 变更或宿主机系统升级。
- 不把 Docker 镜像上传 OSS；镜像仍由 ACR 保存。

## 方案选择

采用 ECS 本机 `systemd timer`。计时器每两个自然分钟运行一个受限 oneshot 服务，服务调用
仓库内的发布脚本。相比 GitHub Actions 调阿里云 API，它不需要新增长期高权限 Secret；
相比 ACR Webhook，它不需要新增公网控制端点。`systemd` 自身保证同一 service 不并发运行，
因此不再增加第二套锁服务。

## 组件

### 自动发布脚本

`scripts/aliyun/rollout-acr-main.mjs` 只负责一个生产容器的受控镜像替换：

- 固定读取 ACR 内网 `main` 镜像、`product-flow-app`、宿主机 Compose 路径和回滚标签；
- 通过受限命令执行器调用 Docker、systemd 和健康查询，业务判断保持为可测试的 Node 逻辑；
- 不读取或输出 `runtime.env`、Docker 登录内容、Cookie、Token 或 Provider 响应；
- 用稳定结果码区分无变化、合同不一致、备份失败、拉取失败、启动失败和回滚失败。

### 部署合同快照

`Dockerfile.aliyun` 把 `deploy/aliyun/docker-compose.yml` 作为只读合同副本放入运行时镜像。
自动发布只通过 `docker create` 与 `docker cp` 读取候选镜像中的合同文件，不执行候选镜像
代码。候选合同 SHA-256 必须与宿主机当前 Compose 相等；不相等时在备份和容器替换前停止。

该闸门意味着普通应用代码能自动发布，而端口、卷、内存、环境文件或网络变化必须经过一次
人工宿主机更新和重新验收。

### systemd 服务与计时器

- `product-flow-rollout.service`：root oneshot，固定工作目录、PATH、300 秒超时和最小可写目录。
- `product-flow-rollout.timer`：每个偶数分钟触发，`Persistent=true`，最大检测延迟小于两分钟。
- 服务日志进入 journald；日志只记录镜像 ID、阶段、健康状态和安全结果码。

### 备份单份保留

`backup-local-d1.mjs` 在现有 SQLite Online Backup 与 OSS 上传成功后执行本地保留策略。
保留策略仅扫描备份根目录的直接时间戳子目录，只保留本次成功目录并删除其他目录。

删除的必要条件同时满足：

1. `OSS_BACKUP_URI` 已配置；
2. 两个 SQLite 均已写入备份清单；
3. 所有备份文件和清单已成功上传 OSS；
4. 本次备份目录仍位于受控备份根目录内。

任一条件失败时不删除任何已有本地备份。首次部署该策略后，手工触发一次成功备份即可把
现有历史本地快照收敛为最新一份。

## 发布数据流

1. `systemd timer` 启动发布 service。
2. 脚本读取当前生产容器镜像 ID，并执行 `docker pull` 更新 ACR `main` 标签。
3. 候选镜像 ID 与当前镜像相同：返回 `no_change`。
4. 候选镜像不同：静态提取并校验候选 Compose 合同。
5. 同步启动 `product-flow-backup.service`；OSS 上传或本地单份保留失败均阻止发布。
6. 当前镜像移动到唯一固定回滚标签，临时停止测试容器释放 2 GiB ECS 的内存余量。
7. 候选镜像标记为 `product-flow-system:aliyun`，只强制重建 `product-flow-app`。
8. 最多等待 60 秒进入 `healthy`；成功后恢复测试容器并清理未使用的旧层。
9. 失败时把固定回滚标签重新标记为生产镜像，重建并验证旧容器，再恢复测试容器。

## 失败与恢复

- ACR 拉取失败：保持当前容器和全部备份不变，下个周期重试。
- 候选合同不一致：保持当前容器，不做备份；日志明确要求人工更新宿主机合同。
- SQLite 或 OSS 备份失败：保持当前容器，保留全部本地备份，不继续发布。
- 新容器不健康：恢复旧镜像；最新发布前备份继续同时保留在本地与 OSS。
- 回滚容器也不健康：service 失败并保留现场，不循环重启；现有健康恢复限频器继续负责告警边界。
- 进程中断：退出处理器尽力恢复测试容器；下一周期根据实际生产容器镜像重新判断，不相信临时状态文件。

## 安全与容量

- ACR 继续使用 ECS 已有 Docker 登录态，OSS 继续使用实例 RAM 角色和内网 Endpoint。
- 仓库与 systemd unit 不新增秘密值。
- 本地数据库快照固定一份，约 250 MiB；当前镜像与一个回滚镜像固定两份。
- Docker 清理只删除未使用层，不删除运行容器、数据卷或 ACR 当前/回滚标签。
- 自动发布不读取生产数据库内容，只调用现有一致性备份边界。

## 测试与验收

先写失败测试，再实现以下行为：

- 相同镜像返回 `no_change` 且不调用备份或 Compose；
- 合同不一致在备份前失败；
- OSS 上传失败时旧本地备份不删除；
- 成功上传后本地只剩本次备份；
- 新容器健康时完成发布并恢复测试容器；
- 新容器不健康时恢复旧镜像；
- systemd timer 固定为两分钟且服务使用受限超时；
- Dockerfile 包含候选部署合同副本。

仓库验收执行完整 Definition of Done。ECS 验收分三条独立证据：手工启动备份后本地仅一份且
OSS 对象存在；手工启动 rollout 对当前镜像得到 `no_change`；发布一个新 `main` 镜像后，
两分钟内自动完成备份、容器更新、健康检查、公网提交号、匿名会话与阿里云/钉钉 readiness。

## 安装与回滚

首次安装由人工把脚本和两个 unit 放到 ECS，执行 `daemon-reload`，先手工运行 service，
确认 `no_change` 后再启用 timer。首次备份保留清理也只在新备份成功上传 OSS 后发生。

关闭自动发布只需禁用 timer，不停止当前生产容器。代码回滚使用固定旧镜像标签；数据回滚使用
最新本地快照或 OSS 历史快照。Cloudflare D1 不重新进入回滚路径。
